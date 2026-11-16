import "server-only";
import { db } from "@/lib/db";
import { mslState } from "@/lib/ops/msl";

export type Alert = {
  id: string;
  kind: "MARKET" | "SHORTAGE" | "MSL" | "RFQ_DUE" | "PO_APPROVAL";
  level: "red" | "amber" | "green" | "grey";
  title: string;
  detail: string;
  href: string;
  at: Date;
  /** Present for market events, which can be acknowledged. */
  eventId?: string;
};

const MARKET_LABEL: Record<string, string> = {
  PRICE_SPIKE: "Price up",
  PRICE_DROP: "Price down",
  STOCK_OUT: "Out of stock",
  BACK_IN_STOCK: "Back in stock",
  LIFECYCLE_CHANGE: "Lifecycle changed",
  NEW_PART: "New part added",
};

/** Market events (acknowledgeable) plus alerts derived live from work orders, MSL bags, RFQs and POs. */
export async function getAlerts(): Promise<Alert[]> {
  const now = new Date();
  const [events, wos, lots, rfqs, pos] = await Promise.all([
    db.sourcingEvent.findMany({ where: { acknowledged: false, kind: { not: "BACK_IN_STOCK" } }, orderBy: { createdAt: "desc" }, take: 60, include: { part: { select: { id: true, mpn: true } }, supplier: { select: { name: true } } } }),
    db.workOrder.findMany({ where: { status: { in: ["PLANNED", "KITTING", "READY"] }, clearToBuildPct: { lt: 100 } }, include: { bomRevision: { include: { bom: true } } } }),
    db.inventoryLot.findMany({ where: { mslOpenedAt: { not: null } }, include: { part: { select: { mpn: true } } } }),
    db.rfq.findMany({ where: { status: { in: ["SENT", "PARTIALLY_QUOTED"] }, dueDate: { lt: now } } }),
    db.purchaseOrderDraft.findMany({ where: { status: "PENDING_APPROVAL" }, include: { supplier: true } }),
  ]);
  const out: Alert[] = [];
  for (const e of events) {
    const d = e.data as Record<string, string | number | null>;
    const level = e.kind === "PRICE_SPIKE" || e.kind === "STOCK_OUT" ? "red" : e.kind === "LIFECYCLE_CHANGE" ? "amber" : "grey";
    const detail =
      e.kind === "PRICE_SPIKE" || e.kind === "PRICE_DROP"
        ? `${Number(d.pct) > 0 ? "+" : ""}${d.pct}% at ${e.supplier?.name ?? "a supplier"}`
        : e.kind === "LIFECYCLE_CHANGE"
          ? `${d.from} → ${d.to}`
          : (e.supplier?.name ?? "");
    out.push({ id: `ev-${e.id}`, eventId: e.id, kind: "MARKET", level, title: `${MARKET_LABEL[e.kind] ?? e.kind}: ${e.part.mpn}`, detail, href: `/parts/${e.part.id}`, at: e.createdAt });
  }
  for (const w of wos) {
    out.push({ id: `wo-${w.id}`, kind: "SHORTAGE", level: (w.clearToBuildPct ?? 0) < 80 ? "red" : "amber", title: `${w.number} not clear to build (${w.clearToBuildPct ?? 0}%)`, detail: `${w.bomRevision.bom.name} · ${w.buildQty} pcs`, href: `/operations/work-orders/${w.id}`, at: w.updatedAt });
  }
  for (const l of lots) {
    const m = mslState({ msl: l.msl, openedAt: l.mslOpenedAt, hoursLeft: l.floorLifeHoursLeft }, now);
    if (!m.tracked || !m.running || (m.hoursLeft ?? 0) >= 24) continue;
    out.push({ id: `msl-${l.id}`, kind: "MSL", level: "red", title: m.expired ? `${l.part.mpn}: floor life expired — bake before use` : `${l.part.mpn}: ${Math.floor(m.hoursLeft ?? 0)} h floor life left`, detail: `Bin ${l.bin}`, href: `/inventory?f=msl`, at: l.mslOpenedAt! });
  }
  for (const r of rfqs) out.push({ id: `rfq-${r.id}`, kind: "RFQ_DUE", level: "amber", title: `${r.number} past reply-by date`, detail: "Chase suppliers or compare what came in", href: `/sourcing/rfqs/${r.id}`, at: r.dueDate! });
  for (const p of pos) out.push({ id: `po-${p.id}`, kind: "PO_APPROVAL", level: "amber", title: `${p.number} awaiting approval`, detail: p.supplier.name, href: `/sourcing/pos/${p.id}`, at: p.createdAt });
  const rank = { red: 0, amber: 1, green: 2, grey: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || b.at.getTime() - a.at.getTime());
}

export async function alertCount() {
  const alerts = await getAlerts();
  return alerts.filter((a) => a.level === "red" || a.level === "amber").length;
}
