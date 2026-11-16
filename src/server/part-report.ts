import { db } from "@/lib/db";
import { normaliseMpn } from "@/lib/normalise";
import { readBreaks } from "@/lib/pricing";
import { convert, priceAtQty } from "@/lib/currency";
import { analysePartRisk } from "@/lib/part-risk";
import { priceTrendPct } from "@/lib/price-trend";
import { fractionalYear } from "@/lib/bom/scores";
import { getLiveSince } from "@/server/price-history";

const OURS = new Set(["INTERNAL_STOCK", "CONSIGNED"]);
const SUPPLIERS = new Set(["AUTHORISED", "MANUFACTURER"]);
const NEED = 1000;

/**
 * One catalogue part read the way a buyer would: availability by sourcing tier, risk factors at a 1,000-piece need,
 * price trend and alternates. Reads the database only. Used by `npm run analyse -- part` and the assistant's
 * `get_part` tool. Call `ensureFx()` first so INR conversions use the stored rates.
 */
export async function partReport(query: string) {
  const part = await db.part.findFirst({
    where: { OR: [{ id: query }, { mpnNormalised: normaliseMpn(query) }] },
    include: {
      manufacturer: true,
      category: true,
      package: true,
      offers: { include: { supplier: true } },
      inventoryLots: { include: { warehouse: true } },
      excessListings: { include: { supplier: true } },
      alternatesFrom: { include: { altPart: { select: { mpn: true, lifecycle: true } } } },
      priceHistory: { orderBy: { recordedAt: "asc" } },
    },
  });
  if (!part) return null;
  const liveSince = await getLiveSince(db);
  const ours = part.inventoryLots.map((l) => ({ where: l.isConsigned ? "consigned" : l.warehouse.name, bin: l.bin, free: l.qty - l.reservedQty, dateCode: l.dateCode }));
  const offer = (o: (typeof part.offers)[number]) => {
    const breaks = readBreaks(o.priceBreaks);
    const at1k = priceAtQty(breaks, Math.max(NEED, o.moq));
    return { seller: o.supplier.name, kind: o.supplier.kind, stock: o.stock, moq: o.moq, leadWeeks: o.factoryLeadTimeWeeks, unitAt1kInr: at1k === null ? null : +convert(at1k, o.currency, "INR").toFixed(4), simulated: o.source === "mock" };
  };
  const suppliers = part.offers.filter((o) => SUPPLIERS.has(o.supplier.kind)).map(offer);
  const brokers = part.offers.filter((o) => !SUPPLIERS.has(o.supplier.kind) && !OURS.has(o.supplier.kind)).map(offer);
  const excess = part.excessListings.map((e) => ({ seller: e.supplier.name, qty: e.qty, askInr: e.askPrice ? +convert(Number(e.askPrice), e.currency, "INR").toFixed(4) : null, acceptsBids: e.acceptsBids }));
  const points = part.priceHistory.map((h) => ({ supplierId: h.supplierId, currency: h.currency, unitPrice: Number(h.unitPrice), recordedAt: h.recordedAt }));
  const trend = priceTrendPct(points, { liveSince });
  const leads = suppliers.map((s) => s.leadWeeks).filter((w): w is number => w !== null);
  const risk = analysePartRisk({
    lifecycle: part.lifecycle,
    introducedYear: part.introducedYear,
    counterfeitRisk: part.counterfeitRisk,
    rohs: part.rohs,
    reach: part.reach,
    ownQty: ours.reduce((t, l) => t + Math.max(0, l.free), 0),
    marketplaceQty: excess.reduce((t, e) => t + e.qty, 0) + brokers.reduce((t, b) => t + b.stock, 0),
    authorisedStock: suppliers.reduce((t, s) => t + s.stock, 0),
    authorisedSources: new Set(part.offers.filter((o) => SUPPLIERS.has(o.supplier.kind) && o.stock > 0).map((o) => o.supplierId)).size,
    leadWeeks: leads.length ? Math.min(...leads) : (part.mfrLeadTimeWeeks ?? null),
    alternates: part.alternatesFrom.filter((a) => a.type === "DROP_IN" || a.type === "PIN_TO_PIN").length,
    priceTrendPct: trend,
    need: NEED,
    nowYear: fractionalYear(new Date()),
  });
  return {
    part: { id: part.id, mpn: part.mpn, manufacturer: part.manufacturer.name, category: part.category.name, package: part.package?.name ?? null, pins: part.package?.pinCount ?? null, pitchMm: part.package?.pitchMm ?? null, description: part.description, lifecycle: part.lifecycle, rohs: part.rohs, reach: part.reach, msl: part.msl, datasheet: part.datasheetUrl },
    availability: { ours, suppliers, marketplace: { excess, brokers } },
    priceTrendPct90d: trend,
    risk: { assumedNeed: NEED, ...risk },
    alternates: part.alternatesFrom.map((a) => ({ mpn: a.altPart.mpn, type: a.type, lifecycle: a.altPart.lifecycle })),
  };
}

export type PartReport = NonNullable<Awaited<ReturnType<typeof partReport>>>;
