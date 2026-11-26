/**
 * Places a BoM's parts from the board itself (Phase 45): when no pick-and-place file, placement sheet or component
 * data came with the Gerbers, the silkscreen's designators and the copper's footprints still say where every part
 * sits (src/lib/board/place-from-silk.ts). The placements are stored as "silk": they are made on their pads, so the
 * pad alignment of Phase 44 leaves them alone. No Next.js imports, so the seed and scripts can use it too.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { placeFromLayers, type PlaceReport } from "@/lib/board/place-from-silk";
import { expandRefDes } from "@/lib/refdes";

type Db = PrismaClient;
type Layer = { type: string; side: string; svg: string };

/**
 * Which reader made a reading. Raise it when the reader gets better: a board read by an older one is read once more
 * the next time it is looked at, so a saved BoM gets the better placing without being uploaded again.
 */
export const SILK_READER = 2;

/** What one reading gave, kept on the board (`BoardModel.alignment.silk`) so it is said once and not read again on every view. */
export type SilkRun = {
  /** The reader that made it (SILK_READER); absent on readings older than the version mark. */
  version?: number;
  placed: number;
  /** Designators the BoM lists. */
  designators: number;
  footprints: number;
  /** Designators read off the silkscreen. */
  labels: number;
  missing: string[];
  extra: string[];
  unlettered: number;
  mismatches: PlaceReport["mismatches"];
  /** Placed designators whose line says nothing the land could be checked against. */
  unchecked: string[];
  /** Placed designators whose rotation is only the footprint's axis: nothing on the board says which way round. */
  axisOnly: string[];
  /** Why the board could not be read, when the reading failed: kept so a board that fails is not read on every view. */
  error?: string;
  at: string;
};

const noRun = (error?: string): SilkRun => ({ version: SILK_READER, placed: 0, designators: 0, footprints: 0, labels: 0, missing: [], extra: [], unlettered: 0, mismatches: [], unchecked: [], axisOnly: [], ...(error ? { error } : {}), at: new Date().toISOString() });

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The reading kept on a board (`BoardModel.alignment`), or null when the board was never read this way. */
export function silkRunOf(alignment: unknown): SilkRun | null {
  const run = record(alignment).silk;
  if (!run || typeof run !== "object") return null;
  const r = run as Partial<SilkRun>;
  return { ...noRun(), version: r.version, ...r, mismatches: r.mismatches ?? [], unchecked: r.unchecked ?? [], axisOnly: r.axisOnly ?? [] };
}

/** Keeps a reading on the board, beside whatever else its alignment holds. */
async function keepRun(db: Db, revisionId: string, kept: Record<string, unknown>, run: SilkRun) {
  await db.boardModel.update({ where: { revisionId }, data: { alignment: { ...kept, silk: run } as unknown as Prisma.InputJsonValue } });
}

/** Notes on the board that reading it failed, so the viewer does not fetch and read megabytes of drawings on every view. */
export async function markSilkFailure(db: Db, revisionId: string, error: string) {
  const board = await db.boardModel.findUnique({ where: { revisionId }, select: { alignment: true } });
  if (board) await keepRun(db, revisionId, record(board.alignment), noRun(error.slice(0, 300)));
}

/** Placements a file gave (a pick-and-place file, a placement sheet, the Gerbers' own component data): not ours to replace. */
const fromFiles: Prisma.PlacementWhereInput = { OR: [{ snap: null }, { snap: { not: "silk" } }] };

/**
 * Places the revision's parts from its silkscreen and pads. Does nothing (null) without a Gerber board or BoM lines,
 * when a file already says where the parts sit, or when the placed parts came with a quick look's own components.
 * `once`: also nothing when the board was read before — for the viewer, which asks on every view.
 * Run again after the lines or the Gerbers change: it replaces only what it placed itself.
 */
export async function placeFromSilkscreen(db: Db, revisionId: string, opts: { once?: boolean } = {}): Promise<SilkRun | null> {
  const board = await db.boardModel.findUnique({ where: { revisionId }, select: { source: true, alignment: true } });
  if (!board || board.source !== "gerber") return null;
  const kept = record(board.alignment);
  const ran = !!kept.silk;
  // Read once per reader: a reading by an older reader is replaced by the next view.
  const current = record(kept.silk).version === SILK_READER;
  if (opts.once && ran && current) return null;
  const [given, own, lines] = await Promise.all([
    db.placement.count({ where: { revisionId, ...fromFiles } }),
    db.placement.count({ where: { revisionId, snap: "silk" } }),
    db.bomLine.findMany({
      where: { revisionId },
      select: { id: true, refDes: true, rawMpn: true, rawDescription: true, rawPackage: true, dnp: true, part: { select: { mpn: true, description: true, package: { select: { name: true } } } } },
    }),
  ]);
  // "silk" placements this never made are a quick look's parts, saved with the BoM that was made from them.
  if (given || (own && !ran)) return null;
  if (!lines.some((l) => l.refDes?.trim())) {
    // Nothing to place: said once, so the viewer does not ask again on every view.
    if (opts.once) await keepRun(db, revisionId, kept, noRun());
    return null;
  }

  // One query for the drawings it reads, as the pad alignment does: the whole artwork is many megabytes.
  const rows = await db.$queryRaw<{ layers: Layer[] | null }[]>`
    SELECT (SELECT jsonb_agg(jsonb_build_object('type', l->>'type', 'side', l->>'side', 'svg', l->>'svg')) FROM jsonb_array_elements(artwork->'layers') l
        WHERE (l->>'type' IN ('copper', 'soldermask', 'silkscreen') AND l->>'side' IN ('top', 'bottom')) OR l->>'type' = 'drill') AS layers
    FROM "BoardModel" WHERE "revisionId" = ${revisionId} LIMIT 1`;
  const layers = rows[0]?.layers ?? [];
  // The customer's own words first: a part we matched to the line may still be our guess.
  const res = placeFromLayers(
    layers,
    lines.map((l) => ({ refDes: l.refDes, mpn: l.rawMpn ?? l.part?.mpn, description: l.rawDescription ?? l.part?.description, pkg: l.rawPackage ?? l.part?.package?.name, dnp: l.dnp })),
  );
  const lineOf = new Map<string, string>();
  for (const l of lines) for (const ref of expandRefDes(l.refDes)) if (!lineOf.has(ref)) lineOf.set(ref, l.id);
  const run: SilkRun = {
    version: SILK_READER,
    placed: res.placements.length,
    designators: lineOf.size,
    footprints: res.footprints,
    labels: res.labels,
    missing: res.report.missing,
    extra: res.report.extra.map((e) => e.refDes),
    unlettered: res.report.unlettered.length,
    mismatches: res.report.mismatches,
    unchecked: res.report.unchecked,
    axisOnly: res.placements.filter((p) => !p.turn).map((p) => p.refDes),
    at: new Date().toISOString(),
  };
  await db.$transaction([
    db.placement.deleteMany({ where: { revisionId, snap: "silk" } }),
    // Linked to their lines as they are made: the designator is the BoM's own.
    db.placement.createMany({
      data: res.placements.map((p) => ({ revisionId, refDes: p.refDes, x: p.x, y: p.y, rotation: p.rotation, side: p.side, bomLineId: lineOf.get(p.refDes) ?? null, snap: "silk", copper: p.copper, padCount: p.pads, padLength: p.length, padWidth: p.width })),
      skipDuplicates: true,
    }),
    db.boardModel.update({ where: { revisionId }, data: { alignment: { ...kept, silk: run } as unknown as Prisma.InputJsonValue } }),
  ]);
  return run;
}
