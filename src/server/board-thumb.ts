import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { bodyFor, packageFromFootprint, type BodySpec } from "@/lib/board/bodies";
import { bodyFromFootprint, kindForLine, squareUp } from "@/lib/board/find-parts";
import { buildSheets, layerPlace, type Sheet } from "@/lib/board/layer-place";
import { expandRefDes } from "@/lib/refdes";
import { boardFrameFor } from "@/server/workflow";

/** A placed part as the small board picture needs it: where it sits and what its body looks like from above. */
export type ThumbPart = { refDes: string; x: number; y: number; rotation: number; side: "TOP" | "BOTTOM"; body: BodySpec; dnp: boolean; /** What is printed on the body. */ mark: string | null };
export type BoardThumb = { width: number; height: number; thickness: number; artwork: boolean; maskColor: string; parts: ThumbPart[] };

const loadPackages = cache(() => db.package.findMany());

/**
 * The board of one BoM revision for a small picture (Phase 26): the placed parts with their bodies, board-centred,
 * and whether the Gerber drawing of the top side is on file. It reads the placements, the frame of the drawing and
 * the package sizes — never the drawing itself or the BoM analysis — so a list of BoMs can ask for one per card.
 * Null when nothing was placed: without a pick-and-place file or Gerber components there is no real board to draw.
 */
export const boardThumbFor = cache(async (revisionId: string): Promise<BoardThumb | null> => {
  const [board, frame, placements, lines, packages] = await Promise.all([
    db.boardModel.findUnique({ where: { revisionId }, select: { widthMm: true, heightMm: true, thicknessMm: true, maskColor: true } }),
    boardFrameFor(revisionId).catch(() => null),
    db.placement.findMany({ where: { revisionId }, select: { refDes: true, x: true, y: true, rotation: true, side: true, footprint: true, bomLineId: true } }),
    db.bomLine.findMany({ where: { revisionId }, select: { id: true, refDes: true, dnp: true, part: { select: { mpn: true, category: { select: { slug: true } }, package: true } } } }),
    loadPackages(),
  ]);
  if (!board || !placements.length) return null;
  const box = frame?.box ?? { x: 0, y: 0, w: board.widthMm, h: board.heightMm };
  const names = packages.map((p) => p.name);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const byRef = new Map<string, (typeof lines)[number]>();
  for (const l of lines) for (const r of expandRefDes(l.refDes)) byRef.set(r, l);

  const parts = placements.map((pl): ThumbPart => {
    const line = (pl.bomLineId && byId.get(pl.bomLineId)) || byRef.get(pl.refDes) || null;
    const p = line?.part ?? null;
    const pkg = p?.package ?? packages.find((k) => k.name === packageFromFootprint(pl.footprint, names)) ?? null;
    // No part yet (a footprint read off the Gerbers): size the body from the footprint's own name.
    const kind = pl.footprint ? kindForLine(pl.refDes, pl.footprint, null, null) : null;
    const body = !pkg && !p && pl.footprint ? bodyFromFootprint(pl.footprint, kind && kind !== "passive" ? kind : undefined) : bodyFor(pkg, { category: p?.category.slug ?? null, mpn: p?.mpn });
    return { refDes: pl.refDes, x: pl.x - box.x - box.w / 2, y: pl.y - box.y - box.h / 2, rotation: squareUp(pl.rotation), side: pl.side === "BOTTOM" ? "BOTTOM" : "TOP", body, dnp: line?.dnp ?? false, mark: p?.mpn ?? null };
  });
  return { width: box.w, height: box.h, thickness: board.thicknessMm, artwork: !!frame?.hasTop, maskColor: board.maskColor, parts };
});

/** One sheet of the board pulled apart, with where each of its drawings sits (mm from the board's top-left). */
export type StackSheet = Sheet & { images: { href: string; x: number; y: number; w: number; h: number }[] };
export type BoardStack = {
  width: number;
  height: number;
  thickness: number;
  layerCount: number;
  /** True when the layers come from uploaded Gerbers; false when only the layer count is known. */
  gerbers: boolean;
  maskColor: string;
  /** The finished faces on file (the whole top or bottom side as one drawing). */
  faces: { top: boolean; bottom: boolean };
  sheets: StackSheet[];
  parts: ThumbPart[];
};

/**
 * The board of one BoM revision pulled apart, layer by layer (Phase 27): the sheets top to bottom, each with the
 * address and place of its layer drawings, and the placed parts. Only the first few hundred characters of each
 * drawing are read here (its frame); the drawings themselves are fetched by the picture as images.
 */
export const boardStackFor = cache(async (revisionId: string): Promise<BoardStack | null> => {
  const [board, thumb, meta, layers] = await Promise.all([
    db.boardModel.findUnique({ where: { revisionId }, select: { source: true, widthMm: true, heightMm: true, thicknessMm: true, layerCount: true, finish: true, maskColor: true } }),
    boardThumbFor(revisionId).catch(() => null),
    db.$queryRaw<{ box: { x: number; y: number; w: number; h: number } | null; has_top: boolean | null; has_bottom: boolean | null }[]>`
      SELECT artwork->'box' AS box, jsonb_typeof(artwork->'top') = 'string' AS has_top, jsonb_typeof(artwork->'bottom') = 'string' AS has_bottom
      FROM "BoardModel" WHERE "revisionId" = ${revisionId} LIMIT 1`.catch(() => []),
    db.$queryRaw<{ key: string; type: string; side: string; index: string | null; head: string | null }[]>`
      SELECT l->>'key' AS key, l->>'type' AS type, l->>'side' AS side, l->>'index' AS index, left(l->>'svg', 600) AS head
      FROM "BoardModel" b, jsonb_array_elements(CASE WHEN jsonb_typeof(b.artwork->'layers') = 'array' THEN b.artwork->'layers' ELSE '[]'::jsonb END) AS l
      WHERE b."revisionId" = ${revisionId}`.catch(() => []),
  ]);
  if (!board) return null;
  const box = meta[0]?.box ?? { x: 0, y: 0, w: board.widthMm, h: board.heightMm };
  const frame = { width: box.w, height: box.h, origin: { x: box.x, y: box.y } };
  // A drawing with nothing in it (an empty silkscreen file) has no size: leave it out.
  // (The attribute after a space: every drawing also carries stroke-width="0".)
  const drawn = layers.filter((l) => l.key && l.head && !/\swidth="0"/.test(l.head));
  const head = new Map(drawn.map((l) => [l.key, l.head!]));
  const sheets = buildSheets({
    layerCount: board.layerCount,
    thicknessMm: board.thicknessMm,
    maskColor: board.maskColor,
    finish: board.finish,
    layers: drawn.map((l) => ({ key: l.key, type: l.type, side: l.side, index: l.index === null || l.index === "" ? null : Number(l.index) })),
  }).map((s): StackSheet => ({
    ...s,
    images: s.draw.map((d) => ({ href: `/boms/${revisionId}/picture?layer=${encodeURIComponent(d.layer)}&color=${d.color}`, ...layerPlace(head.get(d.layer) ?? "", frame) })),
  }));
  return {
    width: box.w,
    height: box.h,
    thickness: board.thicknessMm,
    layerCount: board.layerCount,
    gerbers: board.source === "gerber" && drawn.length > 0,
    maskColor: board.maskColor,
    faces: { top: !!meta[0]?.has_top, bottom: !!meta[0]?.has_bottom },
    sheets,
    parts: thumb?.parts ?? [],
  };
});
