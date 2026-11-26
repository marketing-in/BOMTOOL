import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { GATES, readSignoffs } from "@/lib/feasibility/gates";
import { sectionStates, type StepFacts } from "@/lib/bom/workflow";
import { matchFootprints, matchHeldNote, matchNote, type FootprintMatch } from "@/lib/board/footprint-match";
import { placementFit, type BoardFit } from "@/lib/board/placement-fit";
import { copperPads, type CopperPads } from "@/lib/board/copper-pads";
import { bodyFromFootprint, mountFromFootprint } from "@/lib/board/find-parts";
import { findMismatches, mismatchNote, type Mismatches } from "@/lib/bom/mismatch";
import { silkRunOf } from "@/server/placement-silk";
import { getCache } from "@/server/sourcing/cache";
import { boardHead, fullArtwork, slimArtwork } from "@/server/board-art";

/**
 * Where the board's Gerber drawing sits in the placements' own frame, without loading the drawing itself (it is
 * large): the frame, and whether the top side is on file.
 */
export const boardFrameFor = cache(async (revisionId: string): Promise<{ box: { x: number; y: number; w: number; h: number }; hasTop: boolean } | null> => {
  // From the slim artwork (src/server/board-art.ts): asking the database for the box alone unpacks the whole drawing.
  const art = await slimArtwork(revisionId);
  return art?.box ? { box: art.box, hasTop: !!art.top } : null;
});

/** A board's pads, kept per board version: reading them walks every pad of both outer layers. */
const PADS = new Map<string, CopperPads>();
/** How long the pads read off a board version stay in the shared cache: a new upload is a new version anyway. */
const PADS_TTL = 30 * 86_400;

/**
 * A board's pads (Gerber boards only), without fetching its drawings when they have been read before: the drawings of
 * a large board run to tens of megabytes, the pads to a fraction of that. In memory first, then the shared cache (so a
 * fresh server on Vercel does not start over), then read off the copper, mask and drill layers.
 */
async function boardPads(revisionId: string): Promise<{ box: { x: number; y: number; w: number; h: number } | null; pads: CopperPads } | null> {
  const h = await boardHead(revisionId);
  if (!h || h.source !== "gerber") return null;
  const art = await slimArtwork(revisionId);
  const b = { box: art?.box ?? null };
  const key = `${revisionId}:${new Date(h.updatedAt).getTime()}`;
  const remember = (pads: CopperPads) => {
    if (PADS.size > 24) PADS.delete(PADS.keys().next().value!);
    PADS.set(key, pads);
    return { box: b.box, pads };
  };
  const mem = PADS.get(key);
  if (mem) return { box: b.box, pads: mem };
  const shared = await getCache(db)
    .then((c) => c.get<CopperPads>(`pads:${key}`))
    .catch(() => null);
  if (shared?.top && shared.bottom) return remember(shared);
  // The pads come off the outer copper, the mask openings and the drills: read through the one full read a request allows.
  const full = await fullArtwork(revisionId);
  const pads = copperPads((full?.layers ?? []).filter((l) => ((l.type === "copper" || l.type === "soldermask") && (l.side === "top" || l.side === "bottom")) || l.type === "drill"));
  await getCache(db)
    .then((c) => c.set(`pads:${key}`, pads, PADS_TTL))
    .catch(() => undefined);
  return remember(pads);
}

/**
 * Do the placements sit on the Gerbers? The copper layers' pad flashes and the board outline, read from the drawings
 * kept with the board, against every placement. Null when the board was not made from Gerbers (nothing to compare).
 */
export const boardFitFor = cache(async (revisionId: string): Promise<BoardFit | null> => {
  const placements = await db.placement.findMany({ where: { revisionId }, select: { refDes: true, footprint: true, x: true, y: true, side: true, padLength: true, padWidth: true, copper: true } });
  if (!placements.length) return null;
  const b = await boardPads(revisionId);
  if (!b) return null;
  // Pads the mask opens over, vias left out: a part beside a via is not on copper.
  const cu = b.pads;
  const pads = { top: cu.top.map((p) => ({ x: p.x, y: p.y })), bottom: cu.bottom.map((p) => ({ x: p.x, y: p.y })) };
  return placementFit({
    box: b.box,
    pads,
    placements: placements.map((p) => {
      const body = p.footprint ? bodyFromFootprint(p.footprint) : null;
      // Its own pads lie within about half the body's diagonal of the placement point. A footprint name we cannot size
      // (the generic 3 × 3 mm guess: "Module", "BERG_4PIN…") may be a large module or connector: look further.
      const unknown = !body || (body.kind === "generic" && body.length === 3 && body.width === 3);
      // A land read off the copper says how far its own pads reach: a transformer's pins sit far from its centre.
      const land = p.padLength && p.padWidth ? Math.hypot(p.padLength, p.padWidth) / 2 + 1 : 0;
      const reach = Math.max(land, unknown ? 12 : Math.hypot(body.length, body.width) / 2 + 1);
      return { refDes: p.refDes, x: p.x, y: p.y, side: p.side, reach, tht: mountFromFootprint(p.footprint) === "THT" || /through-hole/.test(p.copper ?? "") };
    }),
  });
});

/** The BoM against the board: every designator's package and value against the footprint and value placed under it. */
export const footprintMatchFor = cache(async (revisionId: string): Promise<FootprintMatch> => {
  const [lines, placements] = await Promise.all([
    db.bomLine.findMany({ where: { revisionId }, orderBy: { lineNo: "asc" }, select: { id: true, lineNo: true, refDes: true, rawPackage: true, rawMpn: true, rawValue: true, rawDescription: true, customerPartNumber: true, dnp: true, needsReview: true, partId: true, part: { select: { mpn: true, package: { select: { name: true } } } } } }),
    db.placement.findMany({ where: { revisionId }, select: { refDes: true, footprint: true, x: true, y: true, side: true, value: true, copper: true, snap: true } }),
  ]);
  const fit = await boardFitFor(revisionId).catch(() => null);
  // Parts placed from the silkscreen and the pads: what that reading found for each, kept on the board.
  const silk = placements.some((p) => p.snap === "silk") ? silkRunOf((await db.boardModel.findUnique({ where: { revisionId }, select: { alignment: true } }))?.alignment) : null;
  const differs = new Set(silk?.mismatches.map((m) => m.refDes) ?? []);
  const unchecked = new Set(silk?.unchecked ?? []);
  return matchFootprints(
    lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      refDes: l.refDes,
      pkg: l.rawPackage?.trim() || l.part?.package?.name || null,
      mpn: l.part?.mpn ?? l.rawMpn,
      dnp: l.dnp,
      value: l.rawValue,
      description: l.rawDescription,
      rawMpn: l.rawMpn,
      // The matched part's own package, checked against the board on its own: a BoM's package column is often
      // copied from the same CAD data as the board, so it cannot catch a wrong land by itself.
      catalogPkg: l.part?.package?.name ?? null,
      // An exact part number, or one a person chose, is confirmed; a fuzzy or parametric guess still needs review.
      catalogConfirmed: !!l.partId && !l.needsReview,
      customerPn: l.customerPartNumber,
    })),
    placements.map(({ snap, ...p }) => (snap === "silk" ? { ...p, onPads: true, fits: differs.has(p.refDes) ? false : unchecked.has(p.refDes) || !silk ? null : true } : p)),
    fit,
  );
});

/** Every mismatch in the product: the BoM against the board and against itself (Part 1, step 3). */
export const mismatchesFor = cache(async (revisionId: string): Promise<Mismatches> => {
  const [match, lines] = await Promise.all([
    footprintMatchFor(revisionId),
    db.bomLine.findMany({ where: { revisionId }, orderBy: { lineNo: "asc" }, select: { lineNo: true, refDes: true, qtyPerBoard: true, rawMpn: true, dnp: true, issues: true, part: { select: { mpn: true } } } }),
  ]);
  return findMismatches(match, lines.map((l) => ({ lineNo: l.lineNo, refDes: l.refDes, qtyPerBoard: l.qtyPerBoard, mpn: l.part?.mpn ?? l.rawMpn, dnp: l.dnp, issues: l.issues })));
});

/**
 * How far one BoM revision has got through its process — a handful of small queries, cheap enough for the strip on
 * every page of the BoM. Null when the revision does not exist.
 */
export const workflowFor = cache(async (revisionId: string) => {
  const [rev, unmatched, review, drafts, match] = await Promise.all([
    db.bomRevision.findUnique({
      where: { id: revisionId },
      select: { status: true, revision: true, bom: { select: { name: true } }, board: { select: { source: true } }, _count: { select: { lines: { where: { dnp: false } }, placements: true } } },
    }),
    db.bomLine.count({ where: { revisionId, dnp: false, partId: null } }),
    db.feasibilityReview.findFirst({ where: { revisionId, status: { not: "SUPERSEDED" } }, orderBy: { createdAt: "desc" }, select: { status: true, signoffs: true } }),
    db.customerQuote.findMany({ where: { revisionId }, orderBy: { createdAt: "desc" }, select: { status: true, board: true, box: true } }),
    footprintMatchFor(revisionId),
  ]);
  if (!rev) return null;
  const mm = rev.status === "DRAFT" ? null : await mismatchesFor(revisionId);
  const draft = drafts.find((d) => d.status === "DRAFT");
  const facts: StepFacts = {
    mapped: rev.status !== "DRAFT",
    lines: rev._count.lines,
    unmatched,
    gerbers: rev.board?.source === "gerber",
    placements: rev._count.placements,
    match: rev.status === "DRAFT" ? null : { level: match.level, hasBoard: match.hasBoard, note: matchNote(match) },
    mismatch: mm ? { level: mm.level, total: mm.total, note: mismatchNote(mm) } : null,
    review: review ? { passed: review.status === "PASSED", signed: new Set(readSignoffs(review.signoffs).map((s) => s.gate)).size, gates: GATES.length } : null,
    draft: { board: !!draft?.board, box: !!draft?.box, issued: drafts.some((d) => d.status === "ISSUED") },
  };
  // Red: the BoM and the board disagree (a footprint or a value), so the machine check should wait.
  const matchBlocked = rev.status !== "DRAFT" && match.hasBoard && match.level === "red";
  return { name: `${rev.bom.name} rev ${rev.revision}`, states: sectionStates(facts), matchBlocked, matchHeld: matchBlocked ? matchHeldNote(match) : null };
});

/**
 * How the revision's columns were last taken: by the upload on its own (a saved template, or an automatic mapping it
 * was sure of), or null when a person confirmed them on the mapping page. Read from the audit log.
 */
export const columnsTakenFor = cache(async (revisionId: string): Promise<{ via: "template" | "auto"; columns: string[] } | null> => {
  const last = await db.auditLog.findFirst({ where: { entity: "BomRevision", entityId: revisionId, action: "bom.map" }, orderBy: { createdAt: "desc" }, select: { data: true } });
  const d = (last?.data ?? null) as { auto?: unknown; via?: unknown; columns?: unknown } | null;
  if (!d || d.auto !== true) return null;
  return { via: d.via === "template" ? "template" : "auto", columns: Array.isArray(d.columns) ? d.columns.filter((c): c is string => typeof c === "string") : [] };
});
