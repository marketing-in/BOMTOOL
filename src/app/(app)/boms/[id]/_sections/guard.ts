import "server-only";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { matchWithReadColumns } from "@/server/auto-match";

/** A step page opens only for a revision that exists and whose columns are mapped (else the mapping page). */
export async function openRevision(id: string): Promise<{ name: string }> {
  await requireUser();
  const rev = await db.bomRevision.findUnique({ where: { id }, select: { status: true, revision: true, bom: { select: { name: true } } } });
  if (!rev) notFound();
  if (rev.status === "DRAFT") {
    // Uploaded before its board went straight to the footprint match: with its board on file and columns that can be
    // used, it is matched now and opens there. Otherwise its columns come first.
    const user = await requireUser();
    const matched = await matchWithReadColumns(db, id, { userId: user.id, via: "opened-with-board", needBoard: true });
    redirect(matched ? `/boms/${id}/match` : `/boms/${id}/map`);
  }
  return { name: `${rev.bom.name} rev ${rev.revision}` };
}

/** The tab title of a step page: the step, then the BoM. */
export async function stepTitle(id: string, step: string) {
  const rev = await db.bomRevision.findUnique({ where: { id }, select: { revision: true, bom: { select: { name: true } } } });
  return { title: rev ? `${step} — ${rev.bom.name} rev ${rev.revision}` : step };
}
