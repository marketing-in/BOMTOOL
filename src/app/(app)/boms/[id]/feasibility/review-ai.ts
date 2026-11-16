"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AssistantError } from "@/lib/assistant/types";
import type { ReviewResult } from "@/lib/assistant/process-review";
import { machineName } from "@/lib/ops/machines";
import { loadLines, processCheckFor } from "@/server/lines";
import { reviewProcess } from "@/server/assistant/process-review";

export type AiReviewState = { review?: ReviewResult; mode?: "claude" | "mock"; note?: string; error?: string };

/** "Review the process with AI" on Can we build it?: the route, needs, machines and rule check go to the AI. */
export async function reviewProcessWithAi(revisionId: string): Promise<AiReviewState> {
  const user = await requireUser();
  const [pc, lines, rev] = await Promise.all([
    processCheckFor(revisionId),
    loadLines(),
    db.bomRevision.findUnique({ where: { id: revisionId }, select: { revision: true, bom: { select: { name: true } } } }),
  ]);
  if (!pc || !rev) return { error: "This BoM revision has nothing to review yet." };
  try {
    const out = await reviewProcess(
      {
        product: `${rev.bom.name} rev ${rev.revision}`,
        route: pc.route,
        needs: pc.needs,
        check: pc.check,
        lines: lines.filter((l) => l.active).map((l) => ({ code: l.code, name: l.name, type: l.type, machines: l.machines.map((m) => `${m.type}: ${machineName(m)}`) })),
      },
      AbortSignal.timeout(150_000),
    );
    await db.auditLog.create({ data: { userId: user.id, action: "process.review", entity: "BomRevision", entityId: revisionId, data: { mode: out.mode, verdict: out.review.verdict, findings: out.review.findings.length } } });
    return { review: out.review, mode: out.mode, note: out.note };
  } catch (e) {
    return { error: e instanceof AssistantError ? e.message : "The review could not be made. Try again." };
  }
}
