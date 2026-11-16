"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma, WorkOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { bake, closeBag, openBag } from "@/lib/ops/msl";
import { createWorkOrder, issueToLine, refreshCtb, releaseReservations, reserveForWorkOrder } from "@/server/operations";

type Result = { error?: string; message?: string } | undefined;
const fail = (e: unknown): Result => ({ error: e instanceof Error ? e.message : "Something went wrong." });

// ───────────────────────────── Work orders ─────────────────────────────

const woSchema = z.object({
  bomRevisionId: z.string().min(1, "Pick a BoM revision"),
  buildQty: z.coerce.number().int().min(1, "Build qty must be at least 1"),
  plannedStart: z.string().optional(),
  dueDate: z.string().optional(),
  lineId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export async function createWo(_prev: Result, form: FormData): Promise<Result> {
  const user = await requireUser("workorder.write");
  const p = woSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  let id: string;
  try {
    const wo = await createWorkOrder({
      bomRevisionId: p.data.bomRevisionId,
      buildQty: p.data.buildQty,
      plannedStart: p.data.plannedStart ? new Date(p.data.plannedStart) : null,
      dueDate: p.data.dueDate ? new Date(p.data.dueDate) : null,
      lineId: p.data.lineId || null,
      notes: p.data.notes || null,
      userId: user.id,
    });
    await db.auditLog.create({ data: { userId: user.id, action: "wo.create", entity: "WorkOrder", entityId: wo.id } });
    id = wo.id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/operations", "layout");
  redirect(`/operations/work-orders/${id}`);
}

export async function scheduleWo(id: string, input: { lineId: string | null; plannedStart: string | null; days: number }): Promise<Result> {
  await requireUser("workorder.write");
  const start = input.plannedStart ? new Date(input.plannedStart) : null;
  const end = start ? new Date(start.getTime() + Math.max(1, input.days) * 86_400_000) : null;
  await db.workOrder.update({ where: { id }, data: { lineId: input.lineId, plannedStart: start, plannedEnd: end } });
  revalidatePath("/operations", "layout");
  return { message: "Schedule updated" };
}

export async function setWoStatus(id: string, status: WorkOrderStatus): Promise<Result> {
  const user = await requireUser("workorder.write");
  await db.workOrder.update({ where: { id }, data: { status } });
  await db.auditLog.create({ data: { userId: user.id, action: `wo.${status.toLowerCase()}`, entity: "WorkOrder", entityId: id } });
  revalidatePath("/operations", "layout");
  return { message: `Status: ${status.toLowerCase().replace("_", " ")}` };
}

export async function reserveWo(id: string): Promise<Result> {
  const user = await requireUser("inventory.write").catch(() => requireUser("workorder.write"));
  try {
    const r = await reserveForWorkOrder(id, user.id);
    revalidatePath("/operations", "layout");
    revalidatePath("/inventory");
    return { message: `Reserved stock for ${r.reservedLines} lines` };
  } catch (e) {
    return fail(e);
  }
}

export async function releaseWo(id: string): Promise<Result> {
  const user = await requireUser("inventory.write").catch(() => requireUser("workorder.write"));
  const r = await releaseReservations(id, user.id);
  revalidatePath("/operations", "layout");
  revalidatePath("/inventory");
  return { message: `Released ${r.released} reservations` };
}

export async function issueWo(id: string): Promise<Result> {
  const user = await requireUser("inventory.write");
  const r = await issueToLine(id, user.id);
  revalidatePath("/operations", "layout");
  revalidatePath("/inventory");
  return { message: `Issued ${r.issued} picks to the line` };
}

export async function recalcCtb(id: string): Promise<Result> {
  await requireUser();
  const pct = await refreshCtb(id);
  revalidatePath(`/operations/work-orders/${id}`);
  return { message: `Clear to build ${pct}%` };
}

// ───────────────────────────── Lines ─────────────────────────────

const lineSchema = z.object({
  name: z.string().min(1).max(120),
  capacityCph: z.coerce.number().int().min(0).nullable(),
  feederSlots: z.coerce.number().int().min(0).nullable(),
  shiftsPerDay: z.coerce.number().int().min(1).max(3),
  active: z.boolean(),
  capability: z.record(z.string(), z.unknown()),
});

export async function updateLine(id: string, input: z.input<typeof lineSchema>): Promise<Result> {
  const user = await requireUser("lines.write");
  const p = lineSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message };
  await db.line.update({ where: { id }, data: { ...p.data, capability: p.data.capability as Prisma.InputJsonValue } });
  await db.auditLog.create({ data: { userId: user.id, action: "line.update", entity: "Line", entityId: id } });
  revalidatePath("/operations", "layout");
  return { message: "Line saved" };
}

// ───────────────────────────── Inventory ─────────────────────────────

const receiveSchema = z.object({
  partId: z.string().min(1, "Pick a part"),
  warehouseId: z.string().min(1),
  bin: z.string().min(1, "Bin is required").max(40),
  qty: z.coerce.number().int().min(1, "Qty must be ≥ 1"),
  lotCode: z.string().max(60).optional(),
  dateCode: z.string().max(10).optional(),
  unitCost: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).default("INR"),
  countryOfOrigin: z.string().max(2).optional(),
  cocOnFile: z.coerce.boolean().optional(),
  customerId: z.string().optional(),
});

export async function receiveStock(_prev: Result, form: FormData): Promise<Result> {
  const user = await requireUser("inventory.write");
  const raw = Object.fromEntries(form);
  const p = receiveSchema.safeParse({ ...raw, cocOnFile: raw.cocOnFile === "on" });
  if (!p.success) return { error: p.error.issues[0]?.message };
  const part = await db.part.findUnique({ where: { id: p.data.partId }, select: { msl: true, mpn: true, countryOfOrigin: true } });
  if (!part) return { error: "Part not found" };
  const lot = await db.inventoryLot.create({
    data: {
      partId: p.data.partId,
      warehouseId: p.data.warehouseId,
      bin: p.data.bin,
      qty: p.data.qty,
      lotCode: p.data.lotCode || null,
      dateCode: p.data.dateCode || null,
      msl: part.msl,
      unitCost: p.data.unitCost ?? null,
      currency: p.data.currency,
      countryOfOrigin: p.data.countryOfOrigin || part.countryOfOrigin,
      cocOnFile: !!p.data.cocOnFile,
      isConsigned: !!p.data.customerId,
      customerId: p.data.customerId || null,
    },
  });
  await db.stockMovement.create({ data: { type: "RECEIVE", partId: p.data.partId, lotId: lot.id, qty: p.data.qty, userId: user.id } });
  revalidatePath("/inventory");
  return { message: `Received ${p.data.qty.toLocaleString("en-IN")} × ${part.mpn} into ${p.data.bin}` };
}

export async function adjustLot(lotId: string, newQty: number, reason: string): Promise<Result> {
  const user = await requireUser("inventory.write");
  if (!Number.isInteger(newQty) || newQty < 0) return { error: "Quantity must be a whole number ≥ 0" };
  if (!reason.trim()) return { error: "Give a reason (count, damage, scrap …)" };
  const lot = await db.inventoryLot.findUnique({ where: { id: lotId } });
  if (!lot) return { error: "Lot not found" };
  if (newQty < lot.reservedQty) return { error: `${lot.reservedQty} pcs are reserved for work orders — release them first` };
  await db.$transaction([
    db.inventoryLot.update({ where: { id: lotId }, data: { qty: newQty } }),
    db.stockMovement.create({ data: { type: "ADJUST", partId: lot.partId, lotId, qty: newQty - lot.qty, userId: user.id, note: reason } }),
  ]);
  revalidatePath("/inventory");
  return { message: "Stock adjusted" };
}

export async function mslAction(lotId: string, action: "open" | "close" | "bake"): Promise<Result> {
  const user = await requireUser("inventory.write");
  const lot = await db.inventoryLot.findUnique({ where: { id: lotId } });
  if (!lot || !lot.msl) return { error: "Lot is not moisture-sensitive" };
  const clock = { msl: lot.msl, openedAt: lot.mslOpenedAt, hoursLeft: lot.floorLifeHoursLeft };
  const next = action === "open" ? openBag(clock) : action === "close" ? closeBag(clock) : bake(clock);
  await db.$transaction([
    db.inventoryLot.update({ where: { id: lotId }, data: { mslOpenedAt: next.openedAt, floorLifeHoursLeft: next.hoursLeft } }),
    db.stockMovement.create({ data: { type: action === "open" ? "MSL_OPEN" : action === "close" ? "MSL_CLOSE" : "BAKE", partId: lot.partId, lotId, userId: user.id } }),
  ]);
  revalidatePath("/inventory");
  return { message: action === "open" ? "Bag opened — floor-life clock running" : action === "close" ? "Into dry storage — clock paused" : "Baked — floor life reset" };
}
