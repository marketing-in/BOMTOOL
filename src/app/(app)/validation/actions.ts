"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { Role } from "@prisma/client";
import { can } from "@/lib/rbac";
import { readSheets } from "@/lib/bom/parse";
import { parseCompetitors } from "@/lib/validation/checks";

type Result = { error?: string; message?: string };

/** A call on a flag is an engineering or quality decision. */
async function reviewer() {
  const user = await requireUser();
  if (!can(user.role as Role, "bom.write") && !can(user.role as Role, "compliance.write")) throw new Error("Forbidden: only engineering, quality or purchasing can make calls");
  return user;
}

const refresh = (revisionId: string) => {
  revalidatePath(`/boms/${revisionId}/validation`);
  revalidatePath("/validation");
};

/**
 * Marks one flag accepted (a false call: waived, with a reason) or prohibited (to be fixed), or clears the call.
 * An acceptance without a reason is refused: the next reader must know why the flag was let through.
 */
export async function setCall(revisionId: string, key: string, status: "ACCEPTED" | "PROHIBITED" | null, reason: string): Promise<Result> {
  const user = await reviewer();
  const why = reason.trim().slice(0, 500);
  if (!/^[a-z]+:[\w.+\-/]+$/i.test(key)) return { error: "Unknown flag." };
  if (status === "ACCEPTED" && !why) return { error: "Say why the flag is a false call." };
  if (!(await db.bomRevision.findUnique({ where: { id: revisionId }, select: { id: true } }))) return { error: "BoM revision not found." };
  if (status === null) await db.validationCall.deleteMany({ where: { revisionId, key } });
  else
    await db.validationCall.upsert({
      where: { revisionId_key: { revisionId, key } },
      create: { revisionId, key, status, reason: why || null, decidedById: user.id },
      update: { status, reason: why || null, decidedById: user.id, decidedAt: new Date() },
    });
  await db.auditLog.create({ data: { userId: user.id, action: "validation.call", entity: "BomRevision", entityId: revisionId, data: { key, status, reason: why || null } } });
  refresh(revisionId);
  return { message: status === null ? "Call cleared" : status === "ACCEPTED" ? "Accepted as a false call" : "Marked prohibited" };
}

/** Adds makers to a customer's competitor list, from pasted text and/or an uploaded CSV or Excel file. */
export async function addCompetitors(customerId: string, form: FormData): Promise<Result> {
  const user = await requireUser("bom.write");
  if (!(await db.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) return { error: "Customer not found." };
  const rows: string[][] = [];
  const text = String(form.get("text") ?? "");
  for (const line of text.split(/\r?\n/)) if (line.trim()) rows.push(line.split("\t"));
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) return { error: "The list file is over 2 MB." };
    try {
      for (const sheet of readSheets(new Uint8Array(await file.arrayBuffer()), file.name)) rows.push(...sheet.rows);
    } catch (e) {
      return { error: `“${file.name}” could not be read: ${e instanceof Error ? e.message : "unknown error"}` };
    }
  }
  const list = parseCompetitors(rows);
  if (!list.length) return { error: "No maker names found. One maker per line; other spellings after a comma or in brackets." };
  const existing = await db.competitorMaker.findMany({ where: { customerId }, select: { id: true, name: true, aliases: true } });
  let added = 0;
  let merged = 0;
  for (const c of list) {
    const same = existing.find((e) => e.name.toLowerCase() === c.name.toLowerCase());
    if (same) {
      const aliases = [...new Set([...same.aliases, ...c.aliases])];
      if (aliases.length !== same.aliases.length) {
        await db.competitorMaker.update({ where: { id: same.id }, data: { aliases } });
        merged++;
      }
      continue;
    }
    await db.competitorMaker.create({ data: { customerId, name: c.name.slice(0, 120), aliases: c.aliases.map((a) => a.slice(0, 120)) } });
    added++;
  }
  await db.auditLog.create({ data: { userId: user.id, action: "competitors.add", entity: "Customer", entityId: customerId, data: { added, merged } } });
  revalidatePath("/validation", "layout");
  revalidatePath("/boms", "layout");
  return { message: `${added} added${merged ? `, ${merged} given other spellings` : ""}` };
}

export async function removeCompetitor(id: string): Promise<Result> {
  const user = await requireUser("bom.write");
  const c = await db.competitorMaker.findUnique({ where: { id }, select: { customerId: true, name: true } });
  if (!c) return { error: "Not found." };
  await db.competitorMaker.delete({ where: { id } });
  await db.auditLog.create({ data: { userId: user.id, action: "competitors.remove", entity: "Customer", entityId: c.customerId, data: { name: c.name } } });
  revalidatePath("/validation", "layout");
  revalidatePath("/boms", "layout");
  return { message: `${c.name} removed` };
}

const KINDS = ["SOLDER_PASTE", "FLUX", "STENCIL", "OTHER"] as const;
const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
};
const str = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max) || null;

/** Adds or edits an item of the consumables register (paste jars, flux, stencils). */
export async function saveConsumable(form: FormData): Promise<Result> {
  const user = await requireUser("inventory.write");
  const id = str(form.get("id"));
  const kind = String(form.get("kind") ?? "");
  if (!(KINDS as readonly string[]).includes(kind)) return { error: "Choose paste, flux, stencil or other." };
  const name = str(form.get("name"));
  if (!name) return { error: "Give it a name." };
  const quantity = num(form.get("quantity"));
  if (quantity === null || quantity < 0) return { error: "Quantity must be a number, zero or more." };
  const unit = str(form.get("unit"), 20) ?? (kind === "STENCIL" ? "pcs" : kind === "FLUX" ? "ml" : "g");
  const expires = str(form.get("expiresAt"), 10);
  const expiresAt = expires ? new Date(`${expires}T00:00:00Z`) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { error: "Expiry is not a date." };
  const revisionId = str(form.get("revisionId"));
  if (revisionId && !(await db.bomRevision.findUnique({ where: { id: revisionId }, select: { id: true } }))) return { error: "That BoM revision no longer exists." };
  const side = str(form.get("side"), 10);
  const thickness = num(form.get("thicknessMm"));
  const spec: Record<string, unknown> = {};
  for (const k of ["alloy", "powderType", "fluxType", "frame"] as const) {
    const v = str(form.get(k), 60);
    if (v) spec[k] = v;
  }
  if (side === "TOP" || side === "BOTTOM" || side === "BOTH") spec.side = side;
  if (thickness !== null) spec.thicknessMm = thickness;
  const data = {
    kind: kind as (typeof KINDS)[number],
    name,
    quantity,
    unit,
    minQty: num(form.get("minQty")),
    location: str(form.get("location"), 80),
    lot: str(form.get("lot"), 80),
    expiresAt,
    revisionId,
    note: str(form.get("note"), 500),
    spec: Object.keys(spec).length ? (spec as Prisma.InputJsonValue) : Prisma.JsonNull,
  };
  const saved = id ? await db.consumable.update({ where: { id }, data }) : await db.consumable.create({ data });
  await db.auditLog.create({ data: { userId: user.id, action: id ? "consumable.update" : "consumable.create", entity: "Consumable", entityId: saved.id, data: { kind, name, quantity, unit } } });
  revalidatePath("/validation", "layout");
  if (revisionId) revalidatePath(`/boms/${revisionId}/validation`);
  return { message: id ? "Saved" : `${name} added` };
}

export async function deleteConsumable(id: string): Promise<Result> {
  const user = await requireUser("inventory.write");
  const c = await db.consumable.findUnique({ where: { id }, select: { name: true, revisionId: true } });
  if (!c) return { error: "Not found." };
  await db.consumable.delete({ where: { id } });
  await db.auditLog.create({ data: { userId: user.id, action: "consumable.delete", entity: "Consumable", entityId: id, data: { name: c.name } } });
  revalidatePath("/validation", "layout");
  if (c.revisionId) revalidatePath(`/boms/${c.revisionId}/validation`);
  return { message: `${c.name} removed` };
}

/** Looks the BoM's part numbers not in our catalogue up at the distributors again, in the background. */
export async function lookUpParts(revisionId: string): Promise<Result> {
  const user = await requireUser("bom.write");
  if (!(await db.bomRevision.findUnique({ where: { id: revisionId }, select: { id: true } }))) return { error: "BoM revision not found." };
  const { startJob } = await import("@/server/jobs");
  await startJob("bom.lookup", "manual", { revisionId, userId: user.id, label: "BoM part numbers at the distributors" });
  refresh(revisionId);
  return { message: "Looking the part numbers up at the distributors. This page shows the result when it is done." };
}

