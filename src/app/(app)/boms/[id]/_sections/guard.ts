import "server-only";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** A step page opens only for a revision that exists and whose columns are mapped (else the mapping page). */
export async function openRevision(id: string): Promise<{ name: string }> {
  await requireUser();
  const rev = await db.bomRevision.findUnique({ where: { id }, select: { status: true, revision: true, bom: { select: { name: true } } } });
  if (!rev) notFound();
  if (rev.status === "DRAFT") redirect(`/boms/${id}/map`);
  return { name: `${rev.bom.name} rev ${rev.revision}` };
}

/** The tab title of a step page: the step, then the BoM. */
export async function stepTitle(id: string, step: string) {
  const rev = await db.bomRevision.findUnique({ where: { id }, select: { revision: true, bom: { select: { name: true } } } });
  return { title: rev ? `${step} — ${rev.bom.name} rev ${rev.revision}` : step };
}
