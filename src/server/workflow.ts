import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { GATES, readSignoffs } from "@/lib/feasibility/gates";
import { stepStates, type StepFacts } from "@/lib/bom/workflow";
import { matchFootprints, matchNote, type FootprintMatch } from "@/lib/board/footprint-match";

/** The BoM against the board: every designator's package against the footprint placed under it. */
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

export const footprintMatchFor = cache(async (revisionId: string): Promise<FootprintMatch> => {
  const [lines, placements] = await Promise.all([
    db.bomLine.findMany({ where: { revisionId }, orderBy: { lineNo: "asc" }, select: { id: true, lineNo: true, refDes: true, rawPackage: true, rawMpn: true, rawValue: true, rawDescription: true, dnp: true, part: { select: { mpn: true, package: { select: { name: true } } } } } }),
    db.placement.findMany({ where: { revisionId }, select: { refDes: true, footprint: true, x: true, y: true, side: true, value: true } }),
  ]);
  return matchFootprints(
    lines.map((l) => ({ id: l.id, lineNo: l.lineNo, refDes: l.refDes, pkg: l.rawPackage?.trim() || l.part?.package?.name || null, mpn: l.part?.mpn ?? l.rawMpn, dnp: l.dnp, text: [l.rawValue, l.rawDescription].filter(Boolean).join(" ") || null })),
    placements,
  );
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
  const draft = drafts.find((d) => d.status === "DRAFT");
  const facts: StepFacts = {
    mapped: rev.status !== "DRAFT",
    lines: rev._count.lines,
    unmatched,
    gerbers: rev.board?.source === "gerber",
    placements: rev._count.placements,
    match: rev.status === "DRAFT" ? null : { level: match.level, hasBoard: match.hasBoard, note: matchNote(match) },
    review: review ? { passed: review.status === "PASSED", signed: new Set(readSignoffs(review.signoffs).map((s) => s.gate)).size, gates: GATES.length } : null,
    draft: { board: !!draft?.board, box: !!draft?.box, issued: drafts.some((d) => d.status === "ISSUED") },
  };
  // Red: the BoM and the board disagree, so the machine check should wait.
  return { name: `${rev.bom.name} rev ${rev.revision}`, states: stepStates(facts), matchBlocked: rev.status !== "DRAFT" && match.hasBoard && match.level === "red" };
});
