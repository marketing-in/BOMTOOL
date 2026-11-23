/**
 * Puts a BoM's placed parts on their own pads (Phase 44): lines the pick-and-place file up with the board's copper,
 * centres each part on its land pattern, and keeps what the copper says it is. The file's own coordinates are kept
 * (cadX / cadY / cadRotation) so running it again — new Gerbers, relinked lines — always starts from them.
 * No Next.js imports, so the seed and scripts can use it too.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { copperPads } from "@/lib/board/copper-pads";
import { snapPlacements, type SnapBody, type SnapIn } from "@/lib/board/placement-snap";
import { bodyFor, packageFromFootprint } from "@/lib/board/bodies";
import { bodyFromFootprint, kindForLine, mountFromFootprint } from "@/lib/board/find-parts";
import { expandRefDes } from "@/lib/refdes";

type Db = PrismaClient;
type Layer = { type: string; side: string; svg: string };

export type Alignment = {
  dx: number;
  dy: number;
  checked: number;
  /** Parts with a pad within reach before and after the offset. */
  before: number;
  after: number;
  /** Which way the centre lies from a pin-1 point, per side, when the file gives pin 1. */
  prior: { TOP: { dir: number; mirrored: boolean } | null; BOTTOM: { dir: number; mirrored: boolean } | null };
  counts: { pads: number; kept: number; offCopper: number; turned: number; moved: number };
  at: string;
};

const kindOf = (ref: string, footprint: string) => {
  const k = kindForLine(ref, footprint, null, null);
  return k && k !== "passive" ? k : undefined;
};

/**
 * Re-centres every placement of a revision on its pads. Does nothing (returns null) without Gerber copper or without
 * placements. Safe to run again at any time.
 */
export async function alignPlacements(db: Db, revisionId: string): Promise<Alignment | null> {
  const rows = await db.$queryRaw<{ source: string; layers: Layer[] | null }[]>`
    SELECT source,
      (SELECT jsonb_agg(jsonb_build_object('type', l->>'type', 'side', l->>'side', 'svg', l->>'svg')) FROM jsonb_array_elements(artwork->'layers') l
        WHERE (l->>'type' IN ('copper', 'soldermask') AND l->>'side' IN ('top', 'bottom')) OR l->>'type' = 'drill') AS layers
    FROM "BoardModel" WHERE "revisionId" = ${revisionId} LIMIT 1`;
  const board = rows[0];
  if (!board || board.source !== "gerber" || !board.layers?.length) return null;
  const [placements, lines, packages] = await Promise.all([
    db.placement.findMany({ where: { revisionId } }),
    db.bomLine.findMany({
      where: { revisionId },
      select: { id: true, refDes: true, rawPackage: true, dnp: true, part: { select: { mpn: true, category: { select: { slug: true } }, package: true } } },
    }),
    db.package.findMany({ select: { name: true, family: true, lengthMm: true, widthMm: true, heightMm: true, pinCount: true, pitchMm: true } }),
  ]);
  if (!placements.length) return null;
  const pads = copperPads(board.layers);
  if (!pads.top.length && !pads.bottom.length) return null;

  const names = packages.map((p) => p.name);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const byRef = new Map<string, (typeof lines)[number]>();
  for (const l of lines) for (const r of expandRefDes(l.refDes)) byRef.set(r.toUpperCase(), l);
  // The body the part is: the MPN's package, else the package the BoM line names, else the footprint's own name.
  const bodyOf = (ref: string, footprint: string | null, line: (typeof lines)[number] | null): SnapBody | null => {
    if (line?.part?.package) return bodyFor(line.part.package, { category: line.part.category.slug, mpn: line.part.mpn });
    const named = packageFromFootprint(line?.rawPackage, names);
    const pkg = named ? packages.find((p) => p.name === named) : null;
    if (pkg) return bodyFor(pkg, { category: line?.part?.category.slug ?? null });
    if (footprint) return bodyFromFootprint(footprint, kindOf(ref, footprint));
    if (line?.rawPackage) return bodyFromFootprint(line.rawPackage, kindOf(ref, line.rawPackage));
    return null;
  };

  const input: SnapIn[] = placements.map((p) => {
    const line = (p.bomLineId && byId.get(p.bomLineId)) || byRef.get(p.refDes.toUpperCase()) || null;
    const body = bodyOf(p.refDes, p.footprint, line);
    return {
      refDes: p.refDes,
      // Always from the file's own coordinates: a second run must not start from the first run's answer.
      x: p.cadX ?? p.x,
      y: p.cadY ?? p.y,
      rotation: p.cadRotation ?? p.rotation,
      side: p.side === "BOTTOM" ? "BOTTOM" : "TOP",
      body: body ? { kind: body.kind, length: body.length, width: body.width, pins: body.pins, pitch: body.pitch } : null,
      tht: mountFromFootprint(p.footprint) === "THT",
      dnp: line?.dnp ?? false,
    };
  });
  const res = snapPlacements(input, pads);
  const byRefOut = new Map(res.parts.map((s) => [s.refDes, s]));

  // One statement per few hundred rows: a board of 700 parts is one round trip, not 700.
  const rowsOut = placements.map((p) => {
    const s = byRefOut.get(p.refDes)!;
    return Prisma.sql`(${p.id}, ${p.cadX ?? p.x}::float8, ${p.cadY ?? p.y}::float8, ${p.cadRotation ?? p.rotation}::float8, ${s.x}::float8, ${s.y}::float8, ${s.rotation}::float8, ${s.how}::text, ${s.copper?.label ?? null}::text, ${s.copper?.pads ?? null}::int, ${s.copper?.length ?? null}::float8, ${s.copper?.width ?? null}::float8)`;
  });
  for (let i = 0; i < rowsOut.length; i += 400) {
    await db.$executeRaw`
      UPDATE "Placement" AS t SET "cadX" = v.cadx, "cadY" = v.cady, "cadRotation" = v.cadrot, x = v.x, y = v.y, rotation = v.rot,
        snap = v.snap, copper = v.copper, "padCount" = v.pads, "padLength" = v.plen, "padWidth" = v.pwid
      FROM (VALUES ${Prisma.join(rowsOut.slice(i, i + 400))}) AS v(id, cadx, cady, cadrot, x, y, rot, snap, copper, pads, plen, pwid)
      WHERE t.id = v.id`;
  }
  const alignment: Alignment = {
    ...res.registration,
    prior: res.prior,
    counts: {
      pads: res.parts.filter((s) => s.how === "pads").length,
      kept: res.parts.filter((s) => s.how === "kept").length,
      offCopper: res.parts.filter((s) => s.how === "off-copper").length,
      turned: res.parts.filter((s) => s.turned).length,
      moved: res.parts.filter((s) => s.moved >= 0.05).length,
    },
    at: new Date().toISOString(),
  };
  await db.boardModel.update({ where: { revisionId }, data: { alignment: alignment as unknown as Prisma.InputJsonValue } });
  return alignment;
}
