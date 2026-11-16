import type { Condition, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { convert, priceAtQty } from "@/lib/currency";
import { readBreaks } from "@/lib/pricing";
import { landedCost, type LandedCost } from "@/lib/landed-cost";
import { purchaseQty } from "@/lib/bom/buildqty";
import { FALLBACK_DUTY, analyseRevision, loadDutyRates } from "@/server/bom-pipeline";

// ───────────────────────────── Numbering ─────────────────────────────

async function nextNumber(prefix: "RFQ" | "PO") {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-`;
  const last =
    prefix === "RFQ"
      ? await db.rfq.findFirst({ where: { number: { startsWith: like } }, orderBy: { number: "desc" }, select: { number: true } })
      : await db.purchaseOrderDraft.findFirst({ where: { number: { startsWith: like } }, orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.slice(like.length)) + 1 : 1;
  return `${like}${String(n).padStart(4, "0")}`;
}

// ───────────────────────────── Cart ─────────────────────────────

export async function openCart(userId: string) {
  return (
    (await db.cart.findFirst({ where: { userId, status: "OPEN" }, orderBy: { createdAt: "desc" } })) ??
    (await db.cart.create({ data: { userId, name: "My cart" } }))
  );
}

export type CartAdd = {
  partId: string;
  qty: number;
  supplierId?: string | null;
  offerId?: string | null;
  excessListingId?: string | null;
  bomLineId?: string | null;
  isBid?: boolean;
  bidPrice?: number | null;
  currency?: string;
  note?: string | null;
};

/** Adds demand. Re-adding the same BoM line replaces its quantity instead of doubling it. */
export async function addToCart(userId: string, items: CartAdd[]) {
  const cart = await openCart(userId);
  let added = 0;
  for (const it of items) {
    if (it.qty <= 0) continue;
    const existing = it.bomLineId
      ? await db.cartItem.findFirst({ where: { cartId: cart.id, bomLineId: it.bomLineId, isBid: !!it.isBid } })
      : await db.cartItem.findFirst({ where: { cartId: cart.id, partId: it.partId, supplierId: it.supplierId ?? null, bomLineId: null, isBid: !!it.isBid } });
    const data = {
      qty: it.qty,
      supplierId: it.supplierId ?? null,
      offerId: it.offerId ?? null,
      excessListingId: it.excessListingId ?? null,
      isBid: !!it.isBid,
      bidPrice: it.bidPrice ?? null,
      currency: it.currency ?? "INR",
      note: it.note ?? null,
    };
    if (existing) await db.cartItem.update({ where: { id: existing.id }, data });
    else await db.cartItem.create({ data: { cartId: cart.id, partId: it.partId, bomLineId: it.bomLineId ?? null, ...data } });
    added++;
  }
  await db.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
  return { cartId: cart.id, added };
}

/** Every short line of a BoM revision → cart, from the best external source of its sourcing plan. */
export async function addShortagesToCart(userId: string, revisionId: string) {
  const a = await analyseRevision(db, revisionId, "INR");
  if (!a) throw new Error("BoM revision not found");
  const items: CartAdd[] = [];
  for (const l of a.lines) {
    if (!l.partId || l.dnp) continue;
    const external = l.allocations.filter((x) => x.tier >= 3);
    const toOrder = external.reduce((s, x) => s + x.orderQty, 0);
    const uncovered = l.shortfall;
    if (!toOrder && !uncovered) continue;
    const main = [...external].sort((x, y) => y.qty - x.qty)[0];
    items.push({
      partId: l.partId,
      qty: toOrder + uncovered,
      supplierId: main?.supplierId ?? l.bestAuthorised?.supplierId ?? null,
      offerId: main?.offerId ?? l.bestAuthorised?.offerId ?? null,
      excessListingId: main?.excessListingId ?? null,
      bomLineId: l.id,
      note: `${a.revision.bom.name} rev ${a.revision.revision} · ${l.refDes ?? `line ${l.lineNo}`}`,
    });
  }
  return addToCart(userId, items);
}

// ───────────────────────────── RFQ ─────────────────────────────

/** Turns the open cart into an RFQ to the chosen suppliers. Lines are aggregated per part. */
export async function createRfqFromCart(userId: string, input: { supplierIds: string[]; dueDate?: Date | null; notes?: string | null; incoterm?: string | null }) {
  const cart = await db.cart.findFirst({ where: { userId, status: "OPEN" }, include: { items: true }, orderBy: { createdAt: "desc" } });
  if (!cart || !cart.items.length) throw new Error("Your cart is empty.");
  if (!input.supplierIds.length) throw new Error("Pick at least one supplier to ask.");

  const byPart = new Map<string, { qty: number; bid: number | null; suppliers: string[]; notes: string[] }>();
  for (const it of cart.items) {
    const agg = byPart.get(it.partId) ?? { qty: 0, bid: null, suppliers: [], notes: [] };
    agg.qty += it.qty;
    if (it.isBid && it.bidPrice) agg.bid = Math.min(agg.bid ?? Infinity, Number(it.bidPrice));
    if (it.supplierId) agg.suppliers.push(it.supplierId);
    if (it.note) agg.notes.push(it.note);
    byPart.set(it.partId, agg);
  }

  const rfq = await db.rfq.create({
    data: {
      number: await nextNumber("RFQ"),
      createdById: userId,
      dueDate: input.dueDate ?? new Date(Date.now() + 3 * 86_400_000),
      notes: input.notes ?? null,
      incoterm: input.incoterm ?? "DAP, our factory",
      suppliers: { connect: input.supplierIds.map((id) => ({ id })) },
      lines: {
        create: [...byPart.entries()].map(([partId, a]) => ({
          partId,
          qty: a.qty,
          targetPrice: a.bid,
          currency: "INR",
          preferredSupplierId: a.suppliers[0] ?? null,
          note: a.notes.slice(0, 3).join("; ") || null,
        })),
      },
    },
  });
  await db.cart.update({ where: { id: cart.id }, data: { status: "CLOSED", name: `→ ${rfq.number}` } });
  return rfq;
}

export type QuoteLineInput = {
  rfqLineId: string;
  unitPrice: number | null;
  qtyOffered?: number | null;
  leadTimeWeeks?: number | null;
  dateCode?: string | null;
  condition?: Condition;
  cocAvailable?: boolean;
};

export async function saveQuote(
  rfqId: string,
  supplierId: string,
  input: { currency: string; freight?: number | null; validUntil?: Date | null; notes?: string | null; source?: string; lines: QuoteLineInput[] },
) {
  const rfq = await db.rfq.findUniqueOrThrow({ where: { id: rfqId }, include: { lines: true, suppliers: { select: { id: true } } } });
  const lineIds = new Set(rfq.lines.map((l) => l.id));
  const priced = input.lines.filter((l) => lineIds.has(l.rfqLineId) && l.unitPrice !== null && l.unitPrice !== undefined && l.unitPrice >= 0);
  const rfqQty = new Map(rfq.lines.map((l) => [l.id, l.qty]));

  await db.$transaction(async (tx) => {
    const quote = await tx.quote.upsert({
      where: { rfqId_supplierId: { rfqId, supplierId } },
      create: { rfqId, supplierId, currency: input.currency, freight: input.freight ?? null, validUntil: input.validUntil ?? null, notes: input.notes ?? null, source: input.source ?? "MANUAL" },
      update: { currency: input.currency, freight: input.freight ?? null, validUntil: input.validUntil ?? null, notes: input.notes ?? null, source: input.source ?? "MANUAL", receivedAt: new Date() },
    });
    await tx.quoteLine.deleteMany({ where: { quoteId: quote.id } });
    if (priced.length) {
      await tx.quoteLine.createMany({
        data: priced.map((l) => ({
          quoteId: quote.id,
          rfqLineId: l.rfqLineId,
          unitPrice: l.unitPrice!,
          qtyOffered: l.qtyOffered ?? rfqQty.get(l.rfqLineId)!,
          leadTimeWeeks: l.leadTimeWeeks ?? null,
          dateCode: l.dateCode ?? null,
          condition: l.condition ?? "NEW_FACTORY_SEALED",
          cocAvailable: l.cocAvailable ?? true,
        })),
      });
    }
    if (!rfq.suppliers.some((s) => s.id === supplierId)) await tx.rfq.update({ where: { id: rfqId }, data: { suppliers: { connect: { id: supplierId } } } });
    const quoted = await tx.quote.count({ where: { rfqId } });
    const total = Math.max(rfq.suppliers.length, quoted);
    if (rfq.status !== "CLOSED") await tx.rfq.update({ where: { id: rfqId }, data: { status: quoted >= total ? "QUOTED" : "PARTIALLY_QUOTED" } });
  });
  return { priced: priced.length };
}

/** Builds a quote from the supplier's current offers (API / mock / price list) for each RFQ line. */
export async function quoteFromOffers(rfqId: string, supplierId: string) {
  const rfq = await db.rfq.findUniqueOrThrow({
    where: { id: rfqId },
    include: { lines: { include: { part: { include: { offers: { where: { supplierId } } } } } } },
  });
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  const lines: QuoteLineInput[] = [];
  let currency = supplier.currency;
  for (const l of rfq.lines) {
    const offers = l.part.offers.filter((o) => readBreaks(o.priceBreaks).length);
    if (!offers.length) continue;
    // Prefer an offer that can cover the qty from stock, then the cheapest at that qty.
    const scored = offers
      .map((o) => {
        const qty = purchaseQty(l.qty, o.moq, o.spq);
        const unit = priceAtQty(readBreaks(o.priceBreaks), qty);
        return { o, qty, unit, inr: unit === null ? Infinity : convert(unit, o.currency, "INR") };
      })
      .sort((a, b) => Number(b.o.stock >= l.qty) - Number(a.o.stock >= l.qty) || a.inr - b.inr);
    const best = scored[0];
    if (best.unit === null) continue;
    currency = best.o.currency;
    lines.push({
      rfqLineId: l.id,
      unitPrice: best.unit,
      qtyOffered: best.o.stock >= l.qty ? best.qty : best.o.stock || best.qty,
      leadTimeWeeks: best.o.stock >= l.qty ? 1 : (best.o.factoryLeadTimeWeeks ?? null),
      dateCode: best.o.dateCode,
      condition: best.o.condition,
      cocAvailable: best.o.cocAvailable,
    });
  }
  // Mixed currencies within one supplier are unusual; normalise everything to the last one seen.
  return saveQuote(rfqId, supplierId, { currency, source: "API", lines, notes: "Built from current distributor offers" });
}

// ───────────────────────────── Comparison ─────────────────────────────

export type CompareCell = {
  quoteLineId: string;
  supplierId: string;
  unit: number; // quote currency
  currency: string;
  qtyOffered: number;
  leadTimeWeeks: number | null;
  covers: boolean;
  landed: LandedCost;
  awarded: boolean;
  condition: Condition;
  coc: boolean;
  dateCode: string | null;
};

export async function getRfqComparison(rfqId: string) {
  const rfq = await db.rfq.findUnique({
    where: { id: rfqId },
    include: {
      createdBy: { select: { name: true } },
      suppliers: true,
      lines: { include: { part: { include: { manufacturer: true } } }, orderBy: { part: { mpn: "asc" } } },
      quotes: { include: { supplier: true, lines: true } },
      purchaseOrders: { select: { id: true, number: true, supplierId: true, status: true } },
    },
  });
  if (!rfq) return null;
  const rates = await loadDutyRates(db);

  const rows = rfq.lines.map((line) => {
    const cells: CompareCell[] = [];
    for (const q of rfq.quotes) {
      const ql = q.lines.find((x) => x.rfqLineId === line.id);
      if (!ql) continue;
      const qty = Math.min(ql.qtyOffered, Math.max(line.qty, 1));
      // Quote-level freight is spread over lines by goods value; else the supplier's default %.
      const goodsTotal = q.lines.reduce((s, x) => s + Number(x.unitPrice) * x.qtyOffered, 0);
      const share = goodsTotal > 0 ? (Number(ql.unitPrice) * ql.qtyOffered) / goodsTotal : 0;
      const landed = landedCost({
        unitPrice: Number(ql.unitPrice),
        currency: q.currency,
        qty: Math.max(qty, 1),
        originCountry: q.supplier.country,
        hsn: line.part.hsnCode,
        rates,
        fallback: FALLBACK_DUTY,
        ...(q.freight !== null ? { freightTotal: Number(q.freight) * share * (qty / Math.max(ql.qtyOffered, 1)) } : { freightPct: Number(q.supplier.freightPct) }),
      });
      cells.push({
        quoteLineId: ql.id,
        supplierId: q.supplierId,
        unit: Number(ql.unitPrice),
        currency: q.currency,
        qtyOffered: ql.qtyOffered,
        leadTimeWeeks: ql.leadTimeWeeks,
        covers: ql.qtyOffered >= line.qty,
        landed,
        awarded: ql.awarded,
        condition: ql.condition,
        coc: ql.cocAvailable,
        dateCode: ql.dateCode,
      });
    }
    const eligible = cells.filter((c) => c.covers);
    const best = (eligible.length ? eligible : cells).sort((a, b) => a.landed.netPerUnit - b.landed.netPerUnit)[0] ?? null;
    return { line, cells, bestQuoteLineId: best?.quoteLineId ?? null };
  });

  const supplierTotals = rfq.quotes.map((q) => {
    const awarded = rows.flatMap((r) => r.cells.filter((c) => c.supplierId === q.supplierId && c.awarded));
    return {
      supplierId: q.supplierId,
      lines: q.lines.length,
      awardedLines: awarded.length,
      awardedNet: awarded.reduce((s, c) => s + c.landed.netTotal, 0),
      allNet: rows.reduce((s, r) => s + (r.cells.find((c) => c.supplierId === q.supplierId)?.landed.netTotal ?? 0), 0),
    };
  });
  return { rfq, rows, supplierTotals };
}

/** Sets awards: one quote line per RFQ line (or none). */
export async function setAwards(rfqId: string, awards: { rfqLineId: string; quoteLineId: string | null }[]) {
  const quotes = await db.quote.findMany({ where: { rfqId }, select: { id: true } });
  const quoteIds = quotes.map((q) => q.id);
  await db.$transaction(async (tx) => {
    for (const a of awards) {
      await tx.quoteLine.updateMany({ where: { rfqLineId: a.rfqLineId, quoteId: { in: quoteIds } }, data: { awarded: false } });
      if (a.quoteLineId) await tx.quoteLine.updateMany({ where: { id: a.quoteLineId, rfqLineId: a.rfqLineId, quoteId: { in: quoteIds } }, data: { awarded: true } });
    }
  });
}

/** Awards the cheapest landed quote line that covers the qty, for every line. */
export async function awardBest(rfqId: string) {
  const c = await getRfqComparison(rfqId);
  if (!c) throw new Error("RFQ not found");
  await setAwards(rfqId, c.rows.map((r) => ({ rfqLineId: r.line.id, quoteLineId: r.bestQuoteLineId })));
}

/** One PO draft per supplier from the awarded lines, with an INR landed-cost breakdown. */
export async function createPurchaseOrders(rfqId: string, userId: string) {
  const c = await getRfqComparison(rfqId);
  if (!c) throw new Error("RFQ not found");
  const bySupplier = new Map<string, { cell: CompareCell; line: (typeof c.rows)[number]["line"] }[]>();
  for (const r of c.rows) {
    for (const cell of r.cells.filter((x) => x.awarded)) {
      bySupplier.set(cell.supplierId, [...(bySupplier.get(cell.supplierId) ?? []), { cell, line: r.line }]);
    }
  }
  if (!bySupplier.size) throw new Error("Award at least one line first.");
  const already = new Set(c.rfq.purchaseOrders.map((p) => p.supplierId));
  const created: string[] = [];
  for (const [supplierId, items] of bySupplier) {
    if (already.has(supplierId)) continue;
    // PO qty = what the supplier quoted (already MOQ/reel rounded); landed figures scale with it.
    const poQty = (i: (typeof items)[number]) => i.cell.qtyOffered;
    const sum = (k: keyof LandedCost) => items.reduce((s, i) => s + ((i.cell.landed[k] as number) * poQty(i)) / Math.max(i.cell.landed.qty, 1), 0);
    const breakdown = {
      goods: sum("goods"), freight: sum("freight"), insurance: sum("insurance"), bcd: sum("bcd"), sws: sum("sws"),
      igst: sum("igst"), gst: sum("gst"), total: sum("total"), netTotal: sum("netTotal"), creditable: sum("creditable"),
      fxRate: items[0].cell.landed.fxRate,
    };
    const po = await db.purchaseOrderDraft.create({
      data: {
        number: await nextNumber("PO"),
        supplierId,
        rfqId,
        currency: items[0].cell.currency,
        status: "DRAFT",
        costBreakdown: breakdown as Prisma.InputJsonValue,
        createdById: userId,
        lines: {
          create: items.map((i) => ({
            partId: i.line.partId,
            qty: poQty(i),
            unitPrice: i.cell.unit,
            quoteLineId: i.cell.quoteLineId,
            leadTimeWeeks: i.cell.leadTimeWeeks,
          })),
        },
      },
    });
    created.push(po.id);
  }
  await db.rfq.update({ where: { id: rfqId }, data: { status: "CLOSED" } });
  return created;
}
