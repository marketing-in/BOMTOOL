"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { GATES, readSignoffs, reviewPassed, sign, type GateKey } from "@/lib/feasibility/gates";
import { getFeasibility, loadReview } from "@/server/feasibility";

export type ReviewResult = { error?: string; message?: string };

const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Signs the open gate of the review. The checks are worked out again here — what the page showed is not trusted —
 * and the gates go strictly in order; a signed gate is never written again.
 */
export async function signGate(revisionId: string, qty: number, gate: string, note: string, waivers: Record<string, string>): Promise<ReviewResult> {
  const user = await requireUser();
  const role = user.role;
  if (!(can(role, "bom.write") || can(role, "workorder.write") || can(role, "compliance.write"))) return { error: "Your role can read the review but not sign it." };
  if (!GATES.some((g) => g.key === gate)) return { error: "Unknown gate." };

  const f = await getFeasibility(revisionId, qty);
  if (!f) return { error: "BoM revision not found." };
  let review = await loadReview(revisionId);
  if (review?.status === "PASSED") return { error: "This review is complete and locked." };
  if (!review) review = await db.feasibilityReview.create({ data: { revisionId, qty: f.qty, createdById: user.id } });
  else if (review.qty !== f.qty) return { error: `This review is for ${review.qty.toLocaleString("en-IN")} pcs.` };

  const before = readSignoffs(review.signoffs);
  const res = sign(f.checks, before, { gate: gate as GateKey, note: String(note ?? ""), waivers: waivers ?? {} }, { id: user.id, name: user.name ?? user.email ?? "Unknown", canWaive: role === "ADMIN" || role === "QUALITY" }, new Date());
  if ("error" in res) return { error: res.error };
  const passed = reviewPassed(res.signoffs);
  // Only if nobody signed in the meantime: the gate count must still be what was read.
  const done = await db.feasibilityReview.updateMany({
    where: { id: review.id, status: "OPEN", signoffs: { equals: json(before) } },
    data: { signoffs: json(res.signoffs), ...(passed ? { status: "PASSED", closedAt: new Date() } : {}) },
  });
  if (!done.count) return { error: "Someone else signed a gate just now — reload and look again." };
  await db.auditLog.create({ data: { userId: user.id, action: "feasibility.sign", entity: "FeasibilityReview", entityId: review.id, data: json({ gate, waived: res.signoffs.at(-1)?.waived.length ?? 0 }) } }).catch(() => undefined);
  revalidatePath(`/boms/${revisionId}`, "layout");
  const title = GATES.find((g) => g.key === gate)!.title;
  return { message: passed ? "All nine gates signed — the review has passed." : `${title} signed and locked.` };
}

/** The only way back: an administrator closes the review as superseded and a new one starts from gate 1. */
export async function restartReview(revisionId: string, reason: string): Promise<ReviewResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Only an administrator can start a new review." };
  if (String(reason ?? "").trim().length < 10) return { error: "Say why a new review is needed (10 characters or more)." };
  const review = await loadReview(revisionId);
  if (!review) return { error: "There is no review to replace." };
  await db.feasibilityReview.update({ where: { id: review.id }, data: { status: "SUPERSEDED", closedAt: new Date() } });
  await db.auditLog.create({ data: { userId: user.id, action: "feasibility.restart", entity: "FeasibilityReview", entityId: review.id, data: json({ reason: reason.trim().slice(0, 500) }) } }).catch(() => undefined);
  revalidatePath(`/boms/${revisionId}`, "layout");
  return { message: "The old review is kept as superseded. A new one starts at gate 1." };
}
