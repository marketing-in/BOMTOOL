/**
 * Board model + placements for the 3D viewer. No Next.js imports so the seed can import samples too.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { expandRefDes } from "@/lib/refdes";
import { classifyLayer, type LayerInfo } from "@/lib/board/layers";
import { parseCentroid, splitPosFile, type PlacementRow } from "@/lib/board/centroid";
import { readSheets } from "@/lib/bom/parse";
import { findParts, type FoundPart, type FoundParts } from "@/lib/board/find-parts";
import { measureFab } from "@/lib/board/fab-measure";
import type { PanelFacts } from "@/lib/board/panel";
import { alignPlacements } from "@/server/placement-align";
import { markSilkFailure, placeFromSilkscreen, type SilkRun } from "@/server/placement-silk";
import { foundFromSilk, placeFromLayers } from "@/lib/board/place-from-silk";

/** What was measured off the files, with the panel's figures when the Gerbers were a panel. */
function fabOf(files: { name: string; text: string }[], panel?: PanelFacts | null) {
  const fab = measureFab(files);
  return panel ? { paste: fab?.paste ?? { top: null, bottom: null }, holes: fab?.holes ?? null, panel } : fab;
}

type Db = PrismaClient;

export type BoardArtwork = {
  top: string | null;
  bottom: string | null;
  layers: { key: string; type: LayerInfo["type"]; side: LayerInfo["side"]; index?: number; svg: string }[];
  /** Board bounding box in mm (Gerber coordinates). */
  box: { x: number; y: number; w: number; h: number } | null;
};

/** Renders Gerber/drill files with tracespace pcb-stackup into per-layer and composite SVGs. */
export async function renderGerbers(files: { name: string; text: string }[], opts: { maskColor: string; finish: string }): Promise<{ artwork: BoardArtwork; files: (LayerInfo & { name: string })[] }> {
  const { default: pcbStackup } = (await import("pcb-stackup")) as unknown as { default: PcbStackupFn };
  const read = files.map((f) => ({ ...f, info: classifyLayer(f.name, f.text) }));
  const classified = read.filter((f) => f.info.type !== "unknown" && f.info.type !== "drawing");
  // Fabrication drawings (via plugging, drill drawings) are named among the files received but never drawn.
  const drawings = read.filter((f) => f.info.type === "drawing");
  const MASK: Record<string, string> = { green: "rgba(0, 92, 38, 0.82)", black: "rgba(18, 18, 20, 0.88)", blue: "rgba(10, 52, 120, 0.82)", red: "rgba(120, 18, 18, 0.82)", white: "rgba(235, 235, 230, 0.9)" };
  const stack = await pcbStackup(
    classified.map((f) => ({ filename: f.name, gerber: f.text, type: f.info.type === "outline" ? "outline" : f.info.type, side: f.info.side })),
    {
      color: {
        sm: MASK[opts.maskColor] ?? MASK.green,
        cf: opts.finish === "HASL" || opts.finish === "LF-HASL" ? "#c0c4c8" : "#d4a520",
        cu: "#b87333",
        fr4: "#6f6436",
        ss: opts.maskColor === "white" ? "#111" : "#f4f4f4",
        sp: "#999",
        out: "#000",
      },
      useOutline: true,
    },
  );
  const toSvg = (await import("gerber-to-svg")) as unknown as { render: (c: unknown, id: string) => string; default?: { render: (c: unknown, id: string) => string } };
  const render = toSvg.render ?? toSvg.default!.render;
  const layers = stack.layers.map((l, i) => {
    const info = classified.find((c) => c.name === l.filename)!.info;
    return { key: `${info.type}-${info.side}-${info.index ?? i}`, type: info.type, side: info.side, index: info.index, svg: render(l.converter, `layer-${i}`) };
  });
  const vb = stack.top.viewBox as number[] | undefined;
  const scale = stack.top.units === "in" ? 25.4 : 1;
  return {
    artwork: {
      top: stack.top.svg,
      bottom: stack.bottom.svg,
      layers,
      box: vb ? { x: (vb[0] / 1000) * scale, y: (vb[1] / 1000) * scale, w: (vb[2] / 1000) * scale, h: (vb[3] / 1000) * scale } : null,
    },
    files: [...classified, ...drawings].map((f) => ({ name: f.name, ...f.info })),
  };
}

type PcbStackupFn = (
  layers: { filename: string; gerber: string; type?: string; side?: string }[],
  options: Record<string, unknown>,
) => Promise<{ top: { svg: string; viewBox?: number[]; units?: string }; bottom: { svg: string }; layers: { filename: string; converter: unknown }[] }>;

/** Links each placement to its BoM line by expanding the line RefDes lists. */
export async function linkPlacements(db: Db, revisionId: string) {
  const lines = await db.bomLine.findMany({ where: { revisionId }, select: { id: true, refDes: true } });
  const byRef = new Map<string, string>();
  for (const l of lines) for (const r of expandRefDes(l.refDes)) byRef.set(r, l.id);
  const placements = await db.placement.findMany({ where: { revisionId }, select: { id: true, refDes: true } });
  let linked = 0;
  for (const p of placements) {
    const lineId = byRef.get(p.refDes) ?? null;
    if (lineId) linked++;
    await db.placement.update({ where: { id: p.id }, data: { bomLineId: lineId } });
  }
  // With the lines known, each part's body is known: put the parts on their pads (Phase 44).
  await alignPlacements(db, revisionId).catch((e) => console.error(`Aligning placements of ${revisionId} failed:`, e));
  return { linked, total: placements.length };
}

/** Placements already read (a job pack's placement sheet), linked to BoM lines. */
export async function savePlacements(db: Db, revisionId: string, placements: PlacementRow[]) {
  await db.$transaction([db.placement.deleteMany({ where: { revisionId } }), db.placement.createMany({ data: placements.map((p) => ({ revisionId, ...p })), skipDuplicates: true })]);
  return linkPlacements(db, revisionId);
}

export async function savePlacementsFromFile(db: Db, revisionId: string, name: string, bytes: Uint8Array) {
  // A workbook's placement table can be on any sheet: take the first sheet that reads as one.
  const tables = /\.pos$/i.test(name) ? [splitPosFile(new TextDecoder().decode(bytes))] : readSheets(bytes, name).map((s) => s.rows);
  let read: ReturnType<typeof parseCentroid> | null = null;
  let failure: unknown = null;
  for (const rows of tables) {
    try {
      const r = parseCentroid(rows);
      if (r.placements.length) {
        read = r;
        break;
      }
    } catch (e) {
      failure ??= e;
    }
  }
  if (!read) throw failure instanceof Error ? failure : new Error("No header with designator and X/Y columns found.");
  const { placements, unit, skipped } = read;
  await db.$transaction([
    db.placement.deleteMany({ where: { revisionId } }),
    db.placement.createMany({ data: placements.map((p) => ({ revisionId, ...p })) }),
  ]);
  const link = await linkPlacements(db, revisionId);
  return { count: placements.length, unit, skipped, ...link };
}

/**
 * Placements from parts read off the Gerbers (Gerber millimetres, like a pick-and-place file), linked to BoM lines.
 * `onPads`: the parts were read off the silkscreen and the pads (Phase 45) and sit on their footprints' centres —
 * stored as "silk" with what the pads are, so the pad alignment does not move them.
 */
export async function savePlacementsFromFound(db: Db, revisionId: string, parts: FoundPart[], opts: { onPads?: boolean } = {}) {
  const onPads = (p: FoundPart) => (opts.onPads ? { snap: "silk", copper: p.tht ? null : p.package || null, padCount: p.pads, padLength: p.w, padWidth: p.d } : {});
  await db.$transaction([
    db.placement.deleteMany({ where: { revisionId } }),
    db.placement.createMany({
      data: parts.map((p) => ({ revisionId, refDes: p.ref, x: p.x, y: p.y, rotation: p.rotation, side: p.side, footprint: p.package || null, value: p.value, ...onPads(p) })),
      skipDuplicates: true,
    }),
  ]);
  return linkPlacements(db, revisionId);
}

/**
 * Found parts whose designators came from the files or the board's own lettering (not numbered by the guesser), so
 * they can meet a BoM's RefDes.
 */
export const hasRealDesignators = (found: FoundParts | null | undefined): found is FoundParts =>
  !!found && found.parts.length > 0 && found.source !== "guessed" && found.source !== "none";

/**
 * A BoM with Gerbers and no file that says where its parts sit: they are placed from the silkscreen designators and
 * the pads (Phase 45). Call it once the BoM's lines exist, and again when the lines or the Gerbers change. Never
 * throws: a board that cannot be read stays without placements, as before, and is marked as tried.
 */
export async function placeFromBoard(db: Db, revisionId: string, opts: { once?: boolean } = {}): Promise<SilkRun | null> {
  try {
    return await placeFromSilkscreen(db, revisionId, opts);
  } catch (e) {
    console.error(`Placing the parts of ${revisionId} from the silkscreen failed:`, e);
    // Remembered on the board: one that cannot be read is not read again on every view.
    await markSilkFailure(db, revisionId, e instanceof Error ? e.message : "unknown error").catch(() => undefined);
    return null;
  }
}

type Layer = { type: string; side: string; svg: string };

/**
 * The parts of a board read on its own from its layer drawings: every footprint, with the designator the silkscreen
 * prints at it. Null when nothing could be read, so the caller keeps what it had.
 */
function partsFromDrawings(layers: Layer[] | null | undefined): FoundParts | null {
  try {
    const found = foundFromSilk(placeFromLayers(layers));
    return found.parts.length ? found : null;
  } catch (e) {
    console.error("Reading the parts off the layer drawings failed:", e);
    return null;
  }
}

export async function saveGerbers(db: Db, revisionId: string, files: { name: string; text: string }[], opts: { panel?: PanelFacts | null } = {}) {
  const rev = await db.bomRevision.findUniqueOrThrow({ where: { id: revisionId }, include: { bom: { include: { project: true } } } });
  const spec = (rev.bom.project.boardSpec ?? {}) as { layers?: number; thicknessMm?: number; finish?: string; mask?: string; silk?: string; sizeMm?: [number, number] };
  const maskColor = spec.mask ?? "green";
  const finish = spec.finish ?? "ENIG";
  const { artwork, files: info } = await renderGerbers(files, { maskColor, finish });
  const copper = info.filter((f) => f.type === "copper").length;
  const data = {
    source: "gerber",
    widthMm: artwork.box?.w ?? spec.sizeMm?.[0] ?? 100,
    heightMm: artwork.box?.h ?? spec.sizeMm?.[1] ?? 80,
    layerCount: copper || spec.layers || 2,
    thicknessMm: spec.thicknessMm ?? 1.6,
    finish,
    maskColor,
    silkColor: spec.silk ?? "white",
    files: info as unknown as Prisma.InputJsonValue,
    artwork: artwork as unknown as Prisma.InputJsonValue,
    // Paste apertures and drill counts, measured now because the raw files are not kept.
    fab: (fabOf(files, opts.panel) ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  };
  await db.boardModel.upsert({ where: { revisionId }, create: { revisionId, ...data }, update: data });
  // New copper under placements already saved: put the parts on these pads.
  if (await db.placement.count({ where: { revisionId } })) await alignPlacements(db, revisionId).catch((e) => console.error(`Aligning placements of ${revisionId} failed:`, e));
  return { layers: info.filter((f) => f.type !== "drawing").length, copper, width: data.widthMm, height: data.heightMm };
}

/** The files gave no parts of their own: they were guessed from the pads, or none were found at all. */
export const wasGuessed = (found: FoundParts) => found.source === "guessed" || (found.source === "none" && !found.parts.length);

/**
 * What the old guesser made of a board, replaced by the reading of its silkscreen and pads. The files' own warnings
 * are kept; what the guesser said about its guess is not. Marked as read, so a stored quick look is read only once.
 */
export function fromDrawings(guess: FoundParts, layers: Layer[] | null | undefined): FoundParts {
  const read = partsFromDrawings(layers);
  if (!read) return { ...guess, reader: "silk" };
  return { ...read, notes: [...guess.notes.filter((n) => !/inferred|could not be read from these files/i.test(n)), ...read.notes] };
}

/** Renders a Gerber set that has no BoM yet into a shareable quick-look board. */
export async function saveBoardPreview(
  db: Db,
  input: {
    name: string;
    createdById: string | null;
    files: { name: string; text: string }[];
    centroid?: { name: string; text: string } | null;
    maskColor: string;
    finish: string;
    thicknessMm: number;
    panel?: PanelFacts | null;
  },
) {
  const { artwork, files: info } = await renderGerbers(input.files, { maskColor: input.maskColor, finish: input.finish });
  if (!artwork.layers.length) throw new Error("None of the files could be drawn — are they RS-274X Gerbers?");
  const copper = info.filter((f) => f.type === "copper").length;
  // Raw files aren't kept, so the components are read now: designators from the files when they carry any (a
  // component layer, a pick-and-place file, X2 pad designators), else from the silkscreen and the pads.
  // Finding parts must never block the upload: a board that draws is still worth showing.
  let components: ReturnType<typeof findParts>;
  try {
    components = findParts(input.files, input.centroid);
  } catch (e) {
    components = { source: "none", parts: [], notes: [`The components could not be read from these files (${e instanceof Error ? e.message : "unknown error"}).`] };
  }
  if (wasGuessed(components)) components = fromDrawings(components, artwork.layers);
  return db.boardPreview.create({
    data: {
      name: input.name,
      createdById: input.createdById,
      widthMm: artwork.box?.w ?? 100,
      heightMm: artwork.box?.h ?? 80,
      layerCount: copper || 2,
      thicknessMm: input.thicknessMm,
      finish: input.finish,
      maskColor: input.maskColor,
      silkColor: input.maskColor === "white" ? "black" : "white",
      files: info as unknown as Prisma.InputJsonValue,
      artwork: artwork as unknown as Prisma.InputJsonValue,
      components: components as unknown as Prisma.InputJsonValue,
      fab: (fabOf(input.files, input.panel) ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
}

