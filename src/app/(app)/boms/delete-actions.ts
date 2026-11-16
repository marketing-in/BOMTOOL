"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { confirmWord } from "@/lib/bom/delete";
import { deleteRevision, removeBoardFiles, revisionImpact } from "@/server/bom-delete";

/**
 * Deletes one BoM revision, after the user has typed its revision label. Returns where to go next: the BoM's latest
 * other revision, or the BoM list when it was the only one.
 */
export async function deleteBomRevision(revisionId: string, typed: string): Promise<{ error?: string; next?: string }> {
  const user = await requireUser("bom.write");
  const impact = await revisionImpact(db, revisionId);
  if (!impact) return { error: "That BoM revision no longer exists." };
  if (typed.trim().toLowerCase() !== confirmWord(impact).toLowerCase()) return { error: `Type ${confirmWord(impact)} to confirm.` };
  const res = await deleteRevision(db, revisionId);
  if (!res.ok) return { error: res.error };
  await db.auditLog.create({
    data: { userId: user.id, action: "bom.delete", entity: "BomRevision", entityId: revisionId, data: { bom: impact.bomName, revision: impact.revision, lines: impact.lines, bomDeleted: res.bomDeleted } },
  });
  revalidatePath("/boms");
  revalidatePath("/viewer");
  revalidatePath("/");
  return { next: res.nextRevisionId ? `/boms/${res.nextRevisionId}` : "/boms" };
}

/** Removes a revision's Gerbers and part positions; the BoM lines stay. */
export async function removeBomBoardFiles(revisionId: string): Promise<{ error?: string; message?: string }> {
  const user = await requireUser("bom.write");
  if (!(await db.bomRevision.findUnique({ where: { id: revisionId }, select: { id: true } }))) return { error: "That BoM revision no longer exists." };
  const r = await removeBoardFiles(db, revisionId);
  if (!r.boards && !r.placements) return { error: "There are no board files to remove." };
  await db.auditLog.create({ data: { userId: user.id, action: "board.remove", entity: "BomRevision", entityId: revisionId, data: r } });
  for (const p of ["board", "viewer", "feasibility", "build/board", ""]) revalidatePath(`/boms/${revisionId}${p ? `/${p}` : ""}`);
  return { message: [r.boards ? "Gerbers removed" : null, r.placements ? `${r.placements} part positions removed` : null].filter(Boolean).join(" · ") };
}
