import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Currency } from "@/lib/currency";
import { expandRefDes } from "@/lib/refdes";
import { analyseRevision } from "@/server/bom-pipeline";
import { clearToBuild, feederSetups, lineFits, pickLots, type JobNeeds } from "@/lib/ops/planning";
import { effectiveCapability } from "@/lib/ops/machines";
import { mslState, openBag } from "@/lib/ops/msl";

const CHIP_SIZES = ["01005", "0201", "0402", "0603", "0805", "1206", "1210", "2512"];

async function nextWoNumber() {
  const like = `WO-${new Date().getFullYear()}-`;
  const last = await db.workOrder.findFirst({ where: { number: { startsWith: like } }, orderBy: { number: "desc" }, select: { number: true } });
  return `${like}${String(last ? Number(last.number.slice(like.length)) + 1 : 1).padStart(4, "0")}`;
}

export async function createWorkOrder(input: { bomRevisionId: string; buildQty: number; plannedStart: Date | null; dueDate: Date | null; lineId: string | null; notes: string | null; userId: string }) {
  const rev = await db.bomRevision.findUniqueOrThrow({ where: { id: input.bomRevisionId }, include: { bom: true } });
  const wo = await db.workOrder.create({
    data: {
      number: await nextWoNumber(),
      projectId: rev.bom.projectId,
      bomRevisionId: rev.id,
      buildQty: input.buildQty,
      plannedStart: input.plannedStart,
      dueDate: input.dueDate,
      lineId: input.lineId,
      notes: input.notes,
      createdById: input.userId,
    },
  });
  await refreshCtb(wo.id);
  return wo;
}

/** Full picture of a work order: CTB, blockers, line fit, feeders, reservations. */
export async function analyseWorkOrder(id: string, currency: Currency) {
  const wo = await db.workOrder.findUnique({
    where: { id },
    include: {
      project: { include: { customer: true } },
      line: true,
      bomRevision: { include: { bom: true, placements: { select: { side: true, refDes: true } } } },
      reservations: { include: { lot: { include: { warehouse: true, part: { select: { mpn: true } } } } } },
    },
  });
  if (!wo) return null;
  const a = await analyseRevision(db, wo.bomRevisionId, currency, new Date(), { buildQty: wo.buildQty });
  if (!a) return null;

  const reservedByPart = new Map<string, number>();
  for (const r of wo.reservations) reservedByPart.set(r.partId, (reservedByPart.get(r.partId) ?? 0) + r.qty);
  // Stock this WO can count on: free stock (not reserved by anyone) + what is already reserved for it.
  const ctb = clearToBuild(
    a.lines.map((l) => {
      const ours = l.partId ? reservedByPart.get(l.partId) ?? 0 : 0;
      return { lineId: l.id, partId: l.partId, required: l.required, dnp: l.dnp, available: l.internalQty + ours, onOrder: 0 };
    }),
  );

  // What the job needs from a line.
  const placedLines = a.lines.filter((l) => l.part && !l.dnp);
  const chips = placedLines.map((l) => l.part!.package?.name).filter((n): n is string => !!n && CHIP_SIZES.includes(n));
  const pitches = placedLines.map((l) => l.part!.package?.pitchMm).filter((p): p is number => typeof p === "number" && p > 0);
  const spec = (wo.project.boardSpec ?? {}) as { sizeMm?: [number, number] };
  const bottomRefs = new Set(wo.bomRevision.placements.filter((p) => p.side === "BOTTOM").map((p) => p.refDes));
  const needs: JobNeeds = {
    smallestChip: chips.sort((x, y) => CHIP_SIZES.indexOf(x) - CHIP_SIZES.indexOf(y))[0] ?? null,
    finestPitchMm: pitches.length ? Math.min(...pitches) : null,
    hasBga: placedLines.some((l) => ["BGA", "CSP", "LGA"].includes(l.part!.package?.family ?? "")),
    boardMm: spec.sizeMm ?? null,
    doubleSided: bottomRefs.size > 0,
    hasTht: placedLines.some((l) => l.part!.mountType === "THT"),
    smdLines: placedLines.filter((l) => l.part!.mountType === "SMD").length,
  };
  const smdTop = placedLines.filter((l) => l.part!.mountType === "SMD" && !expandRefDes(l.refDes).every((r) => bottomRefs.has(r)));
  const wide = (l: (typeof placedLines)[number]) => ["QFP", "BGA", "MODULE", "TO"].includes(l.part!.package?.family ?? "") || (l.part!.package?.lengthMm ?? 0) > 8;

  const lines = await db.line.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, include: { machines: true } });
  const placementsPerBoard = placedLines.filter((l) => l.part!.mountType === "SMD").reduce((s, l) => s + l.qtyPerBoard, 0);
  const lineOptions = lines.map((ln) => {
    const fit = lineFits(ln.type, effectiveCapability(ln), needs);
    const feeders = ln.type === "SMT" ? feederSetups(smdTop.map((l) => ({ wide: wide(l) })), ln.feederSlots) : null;
    // Hours: placements at ~50 % of rated CPH plus one hour per feeder setup.
    const hours = ln.type === "SMT" && ln.capacityCph ? (placementsPerBoard * wo.buildQty) / (ln.capacityCph * 0.5) + (feeders?.setups ?? 1) : null;
    return { id: ln.id, code: ln.code, name: ln.name, type: ln.type, fit, feeders, hours };
  });

  const shortageValue = a.lines.reduce((s, l) => s + l.toBuyLanded, 0);
  return { wo, analysis: a, ctb, needs, lineOptions, shortageValue, reservedByPart };
}

export async function refreshCtb(id: string) {
  const r = await analyseWorkOrder(id, "INR");
  if (r) await db.workOrder.update({ where: { id }, data: { clearToBuildPct: r.ctb.pct } });
  return r?.ctb.pct ?? null;
}

/** Reserves internal + consigned stock for every line, consigned first then shortest floor life / FIFO. */
export async function reserveForWorkOrder(id: string, userId: string) {
  const r = await analyseWorkOrder(id, "INR");
  if (!r) throw new Error("Work order not found");
  const customerId = r.wo.project.customerId;
  let reservedLines = 0;
  await db.$transaction(async (tx) => {
    for (const l of r.analysis.lines) {
      if (!l.partId || l.dnp || !l.required) continue;
      const already = r.reservedByPart.get(l.partId) ?? 0;
      const need = l.required - already;
      if (need <= 0) continue;
      const lots = await tx.inventoryLot.findMany({ where: { partId: l.partId } });
      const picks = pickLots(
        lots.map((x) => ({
          id: x.id,
          free: x.qty - x.reservedQty,
          dateCode: x.dateCode,
          receivedAt: x.receivedAt,
          mslHoursLeft: mslState({ msl: x.msl, openedAt: x.mslOpenedAt, hoursLeft: x.floorLifeHoursLeft }).hoursLeft,
          consignedFor: x.isConsigned ? x.customerId : null,
        })),
        need,
        customerId,
      );
      for (const p of picks) {
        await tx.reservation.create({ data: { workOrderId: id, lotId: p.lotId, partId: l.partId, bomLineId: l.id, qty: p.qty } });
        await tx.inventoryLot.update({ where: { id: p.lotId }, data: { reservedQty: { increment: p.qty } } });
        await tx.stockMovement.create({ data: { type: "RESERVE", partId: l.partId, lotId: p.lotId, qty: p.qty, workOrderId: id, userId } });
      }
      if (picks.length) reservedLines++;
    }
    if (r.wo.status === "PLANNED") await tx.workOrder.update({ where: { id }, data: { status: "KITTING" } });
  });
  await refreshCtb(id);
  return { reservedLines };
}

export async function releaseReservations(id: string, userId: string) {
  const res = await db.reservation.findMany({ where: { workOrderId: id, issued: false } });
  await db.$transaction([
    ...res.map((r) => db.inventoryLot.update({ where: { id: r.lotId }, data: { reservedQty: { decrement: r.qty } } })),
    ...res.map((r) => db.stockMovement.create({ data: { type: "UNRESERVE", partId: r.partId, lotId: r.lotId, qty: r.qty, workOrderId: id, userId } })),
    db.reservation.deleteMany({ where: { workOrderId: id, issued: false } }),
  ]);
  await refreshCtb(id);
  return { released: res.length };
}

/** Issues reserved stock to the line: deducts lots, opens MSL bags (floor life starts). */
export async function issueToLine(id: string, userId: string) {
  const res = await db.reservation.findMany({ where: { workOrderId: id, issued: false }, include: { lot: true } });
  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const r of res) {
      const clock = openBag({ msl: r.lot.msl, openedAt: r.lot.mslOpenedAt, hoursLeft: r.lot.floorLifeHoursLeft }, now);
      const tracked = mslState(clock, now).tracked;
      await tx.inventoryLot.update({
        where: { id: r.lotId },
        data: { qty: { decrement: r.qty }, reservedQty: { decrement: r.qty }, ...(tracked && !r.lot.mslOpenedAt ? { mslOpenedAt: now } : {}) },
      });
      await tx.reservation.update({ where: { id: r.id }, data: { issued: true } });
      await tx.stockMovement.create({ data: { type: "ISSUE", partId: r.partId, lotId: r.lotId, qty: r.qty, workOrderId: id, userId } });
      if (tracked && !r.lot.mslOpenedAt) await tx.stockMovement.create({ data: { type: "MSL_OPEN", partId: r.partId, lotId: r.lotId, workOrderId: id, userId, note: "Opened at kitting" } });
    }
    await tx.workOrder.update({ where: { id }, data: { status: "READY" } });
  });
  return { issued: res.length };
}

export async function updateWorkOrder(id: string, data: Prisma.WorkOrderUpdateInput) {
  return db.workOrder.update({ where: { id }, data });
}
