"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assessPair } from "@/server/alternates";
import { scoreRevision } from "@/server/bom-pipeline";

export type AlternateState = { error?: string; message?: string } | undefined;

const TYPE_LABEL = { DROP_IN: "drop-in", PIN_TO_PIN: "pin-to-pin", FUNCTIONAL: "functional", UPGRADE: "upgrade" } as const;

/** BoMs that use the part get re-scored: a drop-in alternate changes their resilience score. */
async function rescoreBomsUsing(partId: string) {
  const lines = await db.bomLine.findMany({ where: { partId }, select: { revisionId: true }, distinct: ["revisionId"] });
  for (const l of lines) await scoreRevision(db, l.revisionId);
  return lines.map((l) => l.revisionId);
}

/** Records a parametric suggestion as an approved alternate. The verdict is recomputed here, never taken from the browser. */
export async function approveAlternate(partId: string, altPartId: string): Promise<AlternateState> {
  const user = await requireUser("bom.write");
  if (partId === altPartId) return { error: "A part can’t be its own alternate." };
  const v = await assessPair(partId, altPartId);
  if (!v) return { error: "Part not found." };
  if (!v.ok || !v.type) return { error: `Not an alternate: ${v.summary}.` };
  const data = { type: v.type, confidence: v.confidence, notes: v.summary, approvedBy: user.email, approvedAt: new Date() };
  await db.alternate.upsert({ where: { partId_altPartId: { partId, altPartId } }, create: { partId, altPartId, ...data }, update: data });
  await db.auditLog.create({
    data: { userId: user.id, action: "alternate.approve", entity: "Alternate", entityId: `${partId}:${altPartId}`, data: { partId, altPartId, type: v.type, confidence: v.confidence } },
  });
  const revisions = await rescoreBomsUsing(partId);
  revalidatePath(`/parts/${partId}`);
  for (const r of revisions) revalidatePath(`/boms/${r}`);
  return { message: `Approved as a ${TYPE_LABEL[v.type]} alternate.` };
}

export async function removeAlternate(partId: string, altPartId: string): Promise<AlternateState> {
  const user = await requireUser("bom.write");
  const existing = await db.alternate.findUnique({ where: { partId_altPartId: { partId, altPartId } } });
  if (!existing) return { error: "That alternate is no longer recorded." };
  await db.alternate.delete({ where: { id: existing.id } });
  await db.auditLog.create({
    data: { userId: user.id, action: "alternate.remove", entity: "Alternate", entityId: `${partId}:${altPartId}`, data: { partId, altPartId, type: existing.type } },
  });
  const revisions = await rescoreBomsUsing(partId);
  revalidatePath(`/parts/${partId}`);
  for (const r of revisions) revalidatePath(`/boms/${r}`);
  return { message: "Alternate removed." };
}
