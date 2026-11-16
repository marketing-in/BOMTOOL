"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, sortBoardFiles } from "@/lib/board/upload";
import { saveBoardPreview } from "@/server/board";

const optionsSchema = z.object({
  name: z.string().trim().min(1, "Give the board a name.").max(120),
  mask: z.enum(["green", "black", "blue", "red", "white"]),
  finish: z.enum(["ENIG", "HASL", "LF-HASL", "OSP", "ImmAg"]),
  thickness: z.coerce.number().min(0.4).max(3.2),
});

/** Deletes a quick look (Gerbers looked at without a BoM). BoMs already made from it keep their own copy of the board. */
export async function deleteQuickLook(id: string): Promise<{ error?: string }> {
  const user = await requireUser("bom.write");
  const b = await db.boardPreview.findUnique({ where: { id }, select: { name: true } });
  if (!b) return { error: "That quick look no longer exists." };
  await db.boardPreview.delete({ where: { id } });
  await db.auditLog.create({ data: { userId: user.id, action: "board.quicklook.delete", entity: "BoardPreview", entityId: id, data: { name: b.name } } });
  revalidatePath("/viewer");
  return {};
}

/** Gerbers without a BoM: render them and open the board in 3D. */
export async function uploadQuickLook(form: FormData): Promise<{ error?: string } | undefined> {
  const user = await requireUser("bom.write");
  const opts = optionsSchema.safeParse({ name: form.get("name"), mask: form.get("mask"), finish: form.get("finish"), thickness: form.get("thickness") });
  if (!opts.success) return { error: opts.error.issues[0]?.message ?? "Check the board options." };
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose the Gerber files or a zip." };
  if (files.reduce((s, f) => s + f.size, 0) > MAX_UPLOAD_BYTES) return { error: "Files exceed 20 MB in total." };

  let id: string;
  try {
    const { gerbers, centroid, panel } = sortBoardFiles(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    if (!gerbers.length) return { error: "No Gerber or drill files found (RS-274X .GTL/.GBL/.GKO…, KiCad *-F_Cu.gbr, Excellon .DRL)." };
    const b = await saveBoardPreview(db, {
      name: opts.data.name,
      createdById: user.id,
      files: gerbers,
      // A pick-and-place file among the files gives the components their designators and values.
      centroid: centroid ? { name: centroid.name, text: new TextDecoder().decode(centroid.bytes) } : null,
      maskColor: opts.data.mask,
      finish: opts.data.finish,
      thicknessMm: opts.data.thickness,
      panel,
    });
    id = b.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the files." };
  }
  await db.auditLog.create({ data: { userId: user.id, action: "board.quicklook", entity: "BoardPreview", entityId: id, data: { files: files.map((f) => f.name) } } });
  redirect(`/viewer/boards/${id}`);
}
