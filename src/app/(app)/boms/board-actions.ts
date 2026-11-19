"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, sortBoardFiles } from "@/lib/board/upload";
import { openArchives } from "@/lib/board/archive";
import { saveGerbers, savePlacementsFromFile } from "@/server/board";

/** Accepts any mix of Gerber/drill files and one centroid file, loose or in a zip. */
export async function uploadBoardFiles(revisionId: string, form: FormData): Promise<{ error?: string; message?: string }> {
  const user = await requireUser("bom.write");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose some files." };
  if (files.reduce((s, f) => s + f.size, 0) > MAX_UPLOAD_BYTES) return { error: "Files exceed 20 MB in total." };
  if (!(await db.bomRevision.findUnique({ where: { id: revisionId }, select: { id: true } }))) return { error: "BoM revision not found." };

  const parts: string[] = [];
  try {
    const { gerbers, centroid, panel } = sortBoardFiles(await openArchives(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))));
    if (gerbers.length) {
      const r = await saveGerbers(db, revisionId, gerbers, { panel });
      parts.push(`${r.layers} layers (${r.copper} copper) · ${r.width.toFixed(1)} × ${r.height.toFixed(1)} mm${panel ? ` · one board of a panel of ${panel.count}` : ""}`);
    }
    if (centroid) {
      const r = await savePlacementsFromFile(db, revisionId, centroid.name, centroid.bytes);
      parts.push(`${r.count} placements (${r.unit}), ${r.linked} linked to BoM lines${r.skipped ? `, ${r.skipped} skipped` : ""}`);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the files." };
  }
  if (!parts.length) return { error: "No Gerber, drill or centroid files recognised." };
  await db.auditLog.create({ data: { userId: user.id, action: "board.upload", entity: "BomRevision", entityId: revisionId, data: { files: files.map((f) => f.name) } } });
  revalidatePath(`/boms/${revisionId}`, "layout");
  revalidatePath(`/boms/${revisionId}/viewer`);
  return { message: parts.join(" · ") };
}
