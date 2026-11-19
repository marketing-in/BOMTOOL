import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { GATES, readSignoffs } from "@/lib/feasibility/gates";
import { sectionStates, type StepFacts } from "@/lib/bom/workflow";
import { matchFootprints, matchHeldNote, matchNote, type FootprintMatch } from "@/lib/board/footprint-match";
import { padsFromLayerSvg, placementFit, type BoardFit } from "@/lib/board/placement-fit";
import { bodyFromFootprint, mountFromFootprint } from "@/lib/board/find-parts";
import { findMismatches, mismatchNote, type Mismatches } from "@/lib/bom/mismatch";

/**
 * Where the board's Gerber drawing sits in the placements' own frame, without loading the drawing itself (it is
 * large): the frame, and whether the top side is on file.
 */
export const boardFrameFor = cache(async (revisionId: string): Promise<{ box: { x: number; y: number; w: number; h: number }; hasTop: boolean } | null> => {
  const rows = await db.$queryRaw<{ box: { x: number; y: number; w: number; h: number } | null; has_top: boolean | null }[]>`
    SELECT artwork->'box' AS box, jsonb_typeof(artwork->'top') = 'string' AS has_top FROM "BoardModel" WHERE "revisionId" = ${revisionId} LIMIT 1`;
  const r = rows[0];
  return r?.box ? { box: r.box, hasTop: !!r.has_top } : null;
});

/**
 * Do the placements sit on the Gerbers? The copper layers' pad flashes and the board outline, read from the drawings
 * kept with the board, against every placement. Null when the board was not made from Gerbers (nothing to compare).
 */
export const boardFitFor = cache(async (revisionId: string): Promise<BoardFit | null> => {
  const [rows, placements] = await Promise.all([
    db.$queryRaw<{ source: string; box: { x: number; y: number; w: number; h: number } | null; copper: { side: string; svg: string }[] | null }[]>`
      SELECT source, artwork->'box' AS box,
        (SELECT jsonb_agg(jsonb_build_object('side', l->>'side', 'svg', l->>'svg')) FROM jsonb_array_elements(artwork->'layers') l WHERE l->>'type' = 'copper' AND l->>'side' IN ('top', 'bottom')) AS copper
      FROM "BoardModel" WHERE "revisionId" = ${revisionId} LIMIT 1`,
    db.placement.findMany({ where: { revisionId }, select: { refDes: true, footprint: true, x: true, y: true, side: true } }),
  ]);
  const b = rows[0];
  if (!b || b.source !== "gerber" || !placements.length) return null;
  const copper = b.copper ?? [];
  const pads = { top: copper.filter((l) => l.side === "top").flatMap((l) => padsFromLayerSvg(l.svg)), bottom: copper.filter((l) => l.side === "bottom").flatMap((l) => padsFromLayerSvg(l.svg)) };
  return placementFit({
    box: b.box,
    pads,
    placements: placements.map((p) => {
      const body = p.footprint ? bodyFromFootprint(p.footprint) : null;
      // Its own pads lie within about half the body's diagonal of the placement point. A footprint name we cannot size
      // (the generic 3 × 3 mm guess: "Module", "BERG_4PIN…") may be a large module or connector: look further.
      const unknown = !body || (body.kind === "generic" && body.length === 3 && body.width === 3);
      const reach = unknown ? 12 : Math.hypot(body.length, body.width) / 2 + 1;
      return { refDes: p.refDes, x: p.x, y: p.y, side: p.side, reach, tht: mountFromFootprint(p.footprint) === "THT" };
    }),
  });
});

/** The BoM against the board: every designator's package and value against the footprint and value placed under it. */
export const footprintMatchFor = cache(async (revisionId: string): Promise<FootprintMatch> => {
  const [lines, placements] = await Promise.all([
    db.bomLine.findMany({ where: { revisionId }, orderBy: { lineNo: "asc" }, select: { id: true, lineNo: true, refDes: true, rawPackage: true, rawMpn: true, rawValue: true, rawDescription: true, customerPartNumber: true, dnp: true, needsReview: true, partId: true, part: { select: { mpn: true, package: { select: { name: true } } } } } }),
    db.placement.findMany({ where: { revisionId }, select: { refDes: true, footprint: true, x: true, y: true, side: true, value: true } }),
  ]);
  const fit = await boardFitFor(revisionId).catch(() => null);
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
    placements,
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
