import "server-only";
import { db } from "@/lib/db";
import type { Scores } from "@/lib/bom/scores";
import { stepProgress, type StepKey, type StepState } from "@/lib/bom/workflow";
import { workflowFor } from "@/server/workflow";
import { boardThumbFor, type BoardThumb } from "@/server/board-thumb";

/** The newest cards get the board picture and the progress bar; older ones stay plain, so a long list stays quick. */
const RICH = 24;

export type BomCardData = {
  id: string;
  name: string;
  customer: string;
  stage: string;
  partNumber: string | null;
  revision: string;
  status: string;
  lines: number;
  placements: number;
  matched: number;
  buildQty: number;
  scores: Scores | null;
  /** Lines whose part is not active any more. */
  risk: number;
  /** Lines with an issue or waiting for a review. */
  issues: number;
  /** The steps with how far each has got and the step to take next; null for older cards (not worked out). */
  progress: ReturnType<typeof stepProgress> | null;
  board: BoardThumb | null;
};

/**
 * What a BoM card shows (Phase 26), newest first: the revision's own figures, where it stands in its steps and
 * its board for the picture. One query for the list, then a handful of small ones per card.
 */
export async function bomCards(limit?: number): Promise<BomCardData[]> {
  const revisions = await db.bomRevision.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      bom: { include: { project: { include: { customer: true } } } },
      lines: { select: { qtyPerBoard: true, dnp: true, issues: true, partId: true, needsReview: true, part: { select: { lifecycle: true } } } },
    },
  });
  const rich = revisions.slice(0, RICH);
  const [flows, boards] = await Promise.all([
    Promise.all(rich.map((r) => workflowFor(r.id).catch(() => null))),
    Promise.all(rich.map((r) => boardThumbFor(r.id).catch(() => null))),
  ]);
  return revisions.map((r, i) => {
    const states = (flows[i]?.states ?? null) as Record<StepKey, StepState> | null;
    return {
      id: r.id,
      name: r.bom.name,
      customer: r.bom.project.customer.name,
      stage: r.bom.project.stage,
      partNumber: r.bom.assemblyPartNumber,
      revision: r.revision,
      status: r.status,
      lines: r.lines.length,
      placements: r.lines.filter((l) => !l.dnp).reduce((s, l) => s + l.qtyPerBoard, 0),
      matched: r.lines.filter((l) => l.partId).length,
      buildQty: r.buildQty,
      scores: (r.scores as Scores | null) ?? null,
      risk: r.lines.filter((l) => l.part && l.part.lifecycle !== "ACTIVE").length,
      issues: r.lines.filter((l) => l.issues.length || l.needsReview).length,
      progress: states ? stepProgress(states) : null,
      board: boards[i] ?? null,
    };
  });
}
