/**
 * BoM pipeline: scrub → match → analyse/score. Takes a PrismaClient so the seed script and the app
 * share exactly the same code path (no Next.js imports here).
 */
import type { Condition, Prisma, PrismaClient, SupplierKind } from "@prisma/client";
import { convert, type Currency, type PriceBreak } from "@/lib/currency";
import { bestOffer, readBreaks } from "@/lib/pricing";
import { priceAtQty } from "@/lib/currency";
import { SUPPLIER_TIER } from "@/lib/risk";
import type { AliasIndex } from "@/lib/normalise";
import type { ColumnMapping } from "@/lib/bom/fields";
import { scrubRows } from "@/lib/bom/scrub";
import { Catalog, matchLine, type CatalogPart } from "@/lib/bom/match";
import { purchaseQty, requiredQty } from "@/lib/bom/buildqty";
import { compareSources, type Candidate, type StrategyKey } from "@/lib/costing/strategy";
import { fractionalYear, median, scoreBom, scoreLine, type Scores } from "@/lib/bom/scores";
import { landedCost, type DutyRate } from "@/lib/landed-cost";
import { DEFAULT_DUTY } from "@/data/hsn-duty";
import { priceTrendPct as trendOf } from "@/lib/price-trend";
import { getLiveSince } from "@/server/price-history";

type Db = PrismaClient;

export const FALLBACK_DUTY: DutyRate = { prefix: "", bcdPct: DEFAULT_DUTY.bcdPct, swsPct: 10, igstPct: 18, description: DEFAULT_DUTY.description };

export async function loadDutyRates(db: Db): Promise<DutyRate[]> {
  const rows = await db.hsnDutyRate.findMany();
  return rows.map((r) => ({ prefix: r.prefix, description: r.description, bcdPct: Number(r.bcdPct), swsPct: Number(r.swsPct), igstPct: Number(r.igstPct), note: r.note }));
}

export async function loadAliasIndex(db: Db): Promise<AliasIndex> {
  const rows = await db.manufacturerAlias.findMany({ include: { manufacturer: { select: { name: true } } } });
  return new Map(rows.map((r) => [r.alias, r.manufacturer.name]));
}

export async function loadCatalog(db: Db): Promise<Catalog> {
  const parts = await db.part.findMany({
    include: {
      manufacturer: { select: { name: true } },
      category: { select: { slug: true } },
      package: { select: { name: true } },
      parameters: { include: { parameter: { select: { key: true } } } },
    },
  });
  return new Catalog(
    parts.map<CatalogPart>((p) => ({
      id: p.id,
      mpn: p.mpn,
      mpnNormalised: p.mpnNormalised,
      manufacturer: p.manufacturer.name,
      categorySlug: p.category.slug,
      packageName: p.package?.name ?? null,
      lifecycle: p.lifecycle,
      num: Object.fromEntries(p.parameters.map((x) => [x.parameter.key, x.valueNum])),
      text: Object.fromEntries(p.parameters.map((x) => [x.parameter.key, x.valueText])),
    })),
  );
}

/** Re-runs scrub + match for a revision from its stored raw rows and mapping, then scores it. */
export async function ingestRevision(db: Db, revisionId: string, ctx?: { catalog?: Catalog; aliases?: AliasIndex }) {
  const rev = await db.bomRevision.findUniqueOrThrow({ where: { id: revisionId } });
  const rows = (rev.rawRows ?? []) as string[][];
  const mapping = (rev.columnMapping ?? []) as ColumnMapping;
  const aliases = ctx?.aliases ?? (await loadAliasIndex(db));
  const catalog = ctx?.catalog ?? (await loadCatalog(db));
  const lines = scrubRows(rows, rev.headerRow, mapping, aliases);
  // Match first (CPU only), then write in a few bulk statements: the transaction stays short however long the BoM.
  const matched = lines.map((l) => ({ l, m: matchLine(l, catalog) }));

  await db.$transaction(async (tx) => {
    await tx.bomLine.deleteMany({ where: { revisionId } });
    const created = await tx.bomLine.createManyAndReturn({
      data: matched.map(({ l, m }) => ({
        revisionId,
        lineNo: l.lineNo,
        rawMpn: l.rawMpn,
        rawManufacturer: l.rawManufacturer,
        rawDescription: l.description,
        rawPackage: l.package,
        rawValue: l.value,
        rawRow: l.rawRow,
        refDes: l.refDes,
        qtyPerBoard: Math.ceil(l.qty),
        dnp: l.dnp,
        customerPartNumber: l.customerPn,
        issues: l.issues,
        partId: m.selected?.partId ?? null,
        needsReview: m.needsReview && !l.dnp,
      })),
      select: { id: true, lineNo: true },
    });
    // Line numbers are unique per revision (@@unique([revisionId, lineNo])).
    const lineId = new Map(created.map((c) => [c.lineNo, c.id]));
    await tx.bomLineMatch.createMany({
      data: matched.flatMap(({ l, m }) =>
        m.candidates.map((c) => ({
          bomLineId: lineId.get(l.lineNo)!,
          partId: c.partId,
          method: c.method,
          confidence: c.confidence,
          reason: c.reason,
          selected: c.partId === m.selected?.partId,
        })),
      ),
    });
    await tx.bomRevision.update({ where: { id: revisionId }, data: { status: "MATCHED" } });
  });
  return scoreRevision(db, revisionId);
}

// ───────────────────────────── Analysis ─────────────────────────────

export type Allocation = {
  tier: number;
  kind: SupplierKind;
  source: string;
  supplierId: string | null;
  available: number;
  /** Parts taken from this source for the build. */
  qty: number;
  /** What we would actually order (MOQ / reel rounding); 0 for stock we already hold. */
  orderQty: number;
  unit: number | null; // display currency
  condition: Condition;
  dateCode: string | null;
  coc: boolean;
  country: string | null;
  leadWeeks: number | null;
  /** Per-unit cost in display currency after freight, insurance and duty, net of GST/IGST input credit. */
  landedUnit: number | null;
  offerId: string | null;
  excessListingId: string | null;
};

const lineInclude = {
  part: {
    include: {
      manufacturer: true,
      category: true,
      package: true,
      offers: { include: { supplier: true } },
      inventoryLots: true,
      excessListings: { include: { supplier: true } },
      alternatesFrom: { where: { type: "DROP_IN" }, select: { id: true } },
      priceHistory: { orderBy: { recordedAt: "asc" } },
    },
  },
  matches: { include: { part: { include: { manufacturer: true } } }, orderBy: { confidence: "desc" } },
} satisfies Prisma.BomLineInclude;

export type AnalysedLine = Prisma.BomLineGetPayload<{ include: typeof lineInclude }> & {
  attritionPct: number;
  required: number;
  internalQty: number;
  /** Stock lists of our channel partners and sourcing agents (tier 2 in the buyer's view). */
  partnerQty: number;
  /** Own and partner-EMS/OEM excess (channel partners not included). */
  excessQty: number;
  authorisedStock: number;
  brokerStock: number;
  totalStock: number;
  authorisedSources: number;
  factoryLeadWeeks: number | null;
  lastUpdated: Date | null;
  allocations: Allocation[];
  /** Every place this line could be bought from, priced at the build's need (src/lib/costing/strategy.ts). */
  candidates: Candidate[];
  chosen: Allocation | null;
  /** Best authorised offer for the shortfall — what Add-to-cart/RFQ would start from. */
  bestAuthorised: {
    supplier: string;
    supplierId: string;
    offerId: string;
    unit: number;
    landedUnit: number | null;
    moq: number;
    spq: number;
    breaks: PriceBreak[];
    currency: Currency;
  } | null;
  shortfall: number;
  toBuyCost: number;
  /** Same, landed (freight + duty, net of input credit). */
  toBuyLanded: number;
  spend: number;
  priceTrendPct: number | null;
  scores: Scores | null;
};

const AUTHORISED: SupplierKind[] = ["AUTHORISED", "MANUFACTURER"];

/** A source a quote tries first for one line (the rest of the waterfall still covers what it can't). */
export type LinePin = { offerId?: string; excessListingId?: string; ours?: boolean };

type Ctx = { buildQty: number; customerId: string; currency: Currency; nowYear: number; rates: DutyRate[]; now: Date; liveSince: Date | null; pins?: Map<string, LinePin>; /** Order every line's sources by this instead of the plant's tiers. */ strategy?: StrategyKey };

function analyseLine(line: Prisma.BomLineGetPayload<{ include: typeof lineInclude }>, ctx: Ctx): AnalysedLine {
  const { buildQty, customerId, currency, nowYear, rates } = ctx;
  const p = line.part;
  const empty = {
    attritionPct: 0, required: 0, internalQty: 0, partnerQty: 0, excessQty: 0, authorisedStock: 0, brokerStock: 0, totalStock: 0,
    authorisedSources: 0, factoryLeadWeeks: null, lastUpdated: null, allocations: [], candidates: [], chosen: null, bestAuthorised: null,
    shortfall: 0, toBuyCost: 0, toBuyLanded: 0, spend: 0, priceTrendPct: null, scores: null,
  };
  if (!p) return { ...line, ...empty, required: line.dnp ? 0 : line.qtyPerBoard * buildQty };

  const attritionPct = Number(p.category.attritionPct ?? p.package?.attritionPct ?? (p.mountType === "SMD" ? 1 : 0.5));
  const { required } = requiredQty({ qtyPerBoard: line.qtyPerBoard, buildQty, attritionPct, dnp: line.dnp });

  // Candidate sources in waterfall order.
  type Src = Omit<Allocation, "qty" | "orderQty" | "landedUnit"> & {
    moq: number;
    spq: number;
    breaks: PriceBreak[] | null;
    /** Unit price in `currency` for sources without breaks (excess asks, lot cost). */
    nativeUnit: number | null;
    currency: string;
    freightPct: number;
  };
  const landed = (native: number | null, cur: string, qty: number, country: string | null, freightPct: number) => {
    if (native === null || qty <= 0) return null;
    const c = landedCost({ unitPrice: native, currency: cur, qty, originCountry: country, hsn: p.hsnCode, rates, freightPct, fallback: FALLBACK_DUTY });
    return convert(c.netPerUnit, "INR", currency);
  };
  const sources: Src[] = [];
  for (const lot of p.inventoryLots) {
    if (lot.isConsigned && lot.customerId !== customerId) continue; // another customer's material
    const free = lot.qty - lot.reservedQty;
    if (free <= 0) continue;
    sources.push({
      tier: lot.isConsigned ? 2 : 1, kind: lot.isConsigned ? "CONSIGNED" : "INTERNAL_STOCK", source: lot.isConsigned ? "Consigned stock" : `Stores ${lot.bin}`,
      supplierId: null, available: free, unit: lot.unitCost ? convert(Number(lot.unitCost), lot.currency, currency) : null,
      condition: lot.condition, dateCode: lot.dateCode, coc: lot.cocOnFile, country: "IN", leadWeeks: 0, moq: 1, spq: 1, breaks: null,
      nativeUnit: lot.unitCost ? Number(lot.unitCost) : null, currency: lot.currency, freightPct: 0, offerId: null, excessListingId: null,
    });
  }
  for (const e of p.excessListings) {
    sources.push({
      tier: 3, kind: e.supplier.kind, source: e.supplier.name, supplierId: e.supplierId, available: e.qty,
      unit: e.askPrice ? convert(Number(e.askPrice), e.currency, currency) : null, condition: e.condition, dateCode: e.dateCode,
      coc: e.cocAvailable, country: e.supplier.country, leadWeeks: e.leadDays ? Math.ceil(e.leadDays / 7) : 1, moq: 1, spq: 1, breaks: null,
      nativeUnit: e.askPrice ? Number(e.askPrice) : null, currency: e.currency, freightPct: Number(e.supplier.freightPct), offerId: null, excessListingId: e.id,
    });
  }
  for (const o of p.offers) {
    if (o.stock <= 0) continue;
    const breaks = readBreaks(o.priceBreaks);
    sources.push({
      tier: SUPPLIER_TIER[o.supplier.kind], kind: o.supplier.kind, source: o.supplier.name, supplierId: o.supplierId, available: o.stock,
      unit: null, condition: o.condition, dateCode: o.dateCode, coc: o.cocAvailable, country: o.supplier.country,
      leadWeeks: o.factoryLeadTimeWeeks, moq: o.moq, spq: o.spq, breaks, nativeUnit: null, currency: o.currency,
      freightPct: Number(o.supplier.freightPct), offerId: o.id, excessListingId: null,
    });
  }
  // Within a tier: internal by date code (FIFO), external by price at the quantity we'd need.
  const remainingAtStart = required;
  const unitFor = (s: Src, qty: number) =>
    s.breaks ? (() => { const n = priceAtQty(s.breaks!, Math.max(qty, s.moq)); return n === null ? null : convert(n, s.currency, currency); })() : s.unit;
  sources.sort((a, b) => a.tier - b.tier || (a.tier <= 2 ? (a.dateCode ?? "").localeCompare(b.dateCode ?? "") : (unitFor(a, remainingAtStart) ?? Infinity) - (unitFor(b, remainingAtStart) ?? Infinity)));
  // Each source on its own, as if it were asked for the whole need — what a sourcing strategy orders the line by.
  // A seller holding the whole need ships from stock: no wait. One holding less waits for the factory.
  const priced = sources.map((s): Candidate => {
    const qty = Math.max(1, Math.min(required, s.available));
    const external = s.tier >= 3;
    const orderQty = external ? Math.min(s.available, purchaseQty(qty, s.moq, s.spq)) : 0;
    const native = s.breaks ? priceAtQty(s.breaks, Math.max(orderQty || qty, s.moq)) : s.nativeUnit;
    const unit = external ? (landed(native, s.currency, orderQty || qty, s.country, s.freightPct) ?? unitFor(s, orderQty || qty)) : unitFor(s, qty);
    return { tier: s.tier, kind: s.kind, source: s.tier === 1 ? "Our stores" : s.source, available: s.available, unit, leadWeeks: s.offerId && s.available >= required ? 0 : s.leadWeeks, coc: s.coc, condition: s.condition, offerId: s.offerId, excessListingId: s.excessListingId };
  });
  // Consigned stock is the customer's and costs us nothing; our own stock with no book cost is worth what the market asks.
  const marketUnit = Math.min(...priced.filter((c) => c.tier >= 4 && c.unit !== null).map((c) => c.unit!));
  const candidates = priced.map((c) => (c.unit !== null ? c : c.tier === 2 ? { ...c, unit: 0 } : c.tier === 1 && Number.isFinite(marketUnit) ? { ...c, unit: marketUnit } : c));
  if (ctx.strategy) {
    // The quote sources this BoM by lowest price, shortest lead or lowest risk instead of the plant's order.
    const by = compareSources(ctx.strategy);
    const order = sources.map((_, i) => i).sort((a, b) => by(candidates[a], candidates[b]));
    const sorted = order.map((i) => sources[i]);
    sources.splice(0, sources.length, ...sorted);
  }
  // A quote's chosen source goes first; the sort is stable, so the rest keep their waterfall order.
  const pin = ctx.pins?.get(line.id);
  if (pin) {
    const first = (s: Src) => (pin.offerId ? s.offerId === pin.offerId : pin.excessListingId ? s.excessListingId === pin.excessListingId : !!pin.ours && s.tier <= 2);
    sources.sort((a, b) => Number(first(b)) - Number(first(a)));
  }

  const allocations: Allocation[] = [];
  let remaining = required;
  for (const s of sources) {
    if (remaining <= 0) break;
    const qty = Math.min(remaining, s.available);
    if (qty <= 0) continue;
    const external = s.tier >= 3;
    const orderQty = external ? Math.min(s.available, purchaseQty(qty, s.moq, s.spq)) : 0;
    const native = s.breaks ? priceAtQty(s.breaks, Math.max(orderQty || qty, s.moq)) : s.nativeUnit;
    allocations.push({
      tier: s.tier, kind: s.kind, source: s.source, supplierId: s.supplierId, available: s.available, qty, orderQty,
      unit: unitFor(s, orderQty || qty), condition: s.condition, dateCode: s.dateCode, coc: s.coc, country: s.country, leadWeeks: s.leadWeeks,
      landedUnit: external ? landed(native, s.currency, orderQty || qty, s.country, s.freightPct) : unitFor(s, qty),
      offerId: s.offerId, excessListingId: s.excessListingId,
    });
    remaining -= qty;
  }
  const shortfall = Math.max(0, remaining);
  const chosen = [...allocations].sort((a, b) => b.qty - a.qty)[0] ?? null;

  const authorisedOffers = p.offers.filter((o) => AUTHORISED.includes(o.supplier.kind));
  const internalQty = p.inventoryLots.filter((l) => !l.isConsigned || l.customerId === customerId).reduce((s, l) => s + Math.max(0, l.qty - l.reservedQty), 0);
  const partnerQty = p.excessListings.filter((e) => e.supplier.kind === "CHANNEL_PARTNER").reduce((s, e) => s + e.qty, 0);
  const excessQty = p.excessListings.filter((e) => e.supplier.kind !== "CHANNEL_PARTNER").reduce((s, e) => s + e.qty, 0);
  const authorisedStock = authorisedOffers.reduce((s, o) => s + o.stock, 0);
  const brokerStock = p.offers.filter((o) => o.supplier.kind === "BROKER").reduce((s, o) => s + o.stock, 0);
  const authorisedSources = authorisedOffers.filter((o) => o.stock > 0).length;
  const leads = authorisedOffers.map((o) => o.factoryLeadTimeWeeks).filter((x): x is number => x !== null);
  const fetched = p.offers.map((o) => o.fetchedAt.getTime());

  const externalNeed = Math.max(1, required - internalQty);
  const best = bestOffer(authorisedOffers, externalNeed, currency);
  const bestNative = best ? priceAtQty(readBreaks(best.offer.priceBreaks), Math.max(externalNeed, best.offer.moq)) : null;
  const bestAuthorised = best
    ? {
        supplier: best.offer.supplier.name,
        supplierId: best.offer.supplierId,
        offerId: best.offer.id,
        unit: best.unit,
        landedUnit: landed(bestNative, best.offer.currency, Math.max(externalNeed, best.offer.moq), best.offer.supplier.country, Number(best.offer.supplier.freightPct)),
        moq: best.offer.moq,
        spq: best.offer.spq,
        currency,
        breaks: readBreaks(best.offer.priceBreaks).map((b) => ({ qty: b.qty, price: convert(b.price, best.offer.currency, currency) })),
      }
    : null;
  const marketUnits = authorisedOffers
    .map((o) => priceAtQty(readBreaks(o.priceBreaks), Math.max(externalNeed, o.moq)))
    .map((u, i) => (u === null ? null : convert(u, authorisedOffers[i].currency, currency)))
    .filter((u): u is number => u !== null);

  // 90-day trend of one consistent series (same seller, currency and market).
  const priceTrendPct = trendOf(
    p.priceHistory.map((h) => ({ supplierId: h.supplierId, currency: h.currency, unitPrice: Number(h.unitPrice), recordedAt: h.recordedAt })),
    { liveSince: ctx.liveSince, now: ctx.now },
  );
  const toBuyCost = allocations.filter((a) => a.tier >= 3).reduce((s, a) => s + (a.unit ?? 0) * a.orderQty, 0);
  const toBuyLanded = allocations.filter((a) => a.tier >= 3).reduce((s, a) => s + (a.landedUnit ?? a.unit ?? 0) * a.orderQty, 0);
  const chosenUnit = chosen?.unit ?? best?.unit ?? null;
  const spend = (chosenUnit ?? median(marketUnits) ?? 0) * required;

  const scores = line.dnp
    ? null
    : scoreLine({
        need: required,
        lifecycle: p.lifecycle,
        introducedYear: p.introducedYear,
        counterfeitRisk: p.counterfeitRisk,
        brandTier: p.manufacturer.brandTier,
        rohs: p.rohs,
        reach: p.reach,
        conflictMinerals: p.conflictMineralsDeclared,
        internalQty,
        // Partner stock is reachable like excess for supply depth.
        excessQty: excessQty + partnerQty,
        authorisedStock,
        authorisedSources,
        factoryLeadWeeks: leads.length ? Math.min(...leads) : null,
        dropInAlternates: p.alternatesFrom.length,
        chosen,
        chosenUnit,
        marketUnits,
        priceTrendPct,
        nowYear,
      });

  return {
    ...line,
    attritionPct,
    required,
    internalQty,
    partnerQty,
    excessQty,
    authorisedStock,
    brokerStock,
    totalStock: internalQty + partnerQty + excessQty + authorisedStock + brokerStock,
    authorisedSources,
    factoryLeadWeeks: leads.length ? Math.min(...leads) : null,
    lastUpdated: fetched.length ? new Date(Math.max(...fetched)) : null,
    allocations,
    candidates,
    chosen,
    bestAuthorised,
    shortfall,
    toBuyCost,
    toBuyLanded,
    spend,
    priceTrendPct,
    scores,
  };
}

function loadRevision(db: Db, revisionId: string) {
  return db.bomRevision.findUnique({
    where: { id: revisionId },
    include: {
      bom: { include: { project: { include: { customer: true } }, revisions: { select: { id: true, revision: true }, orderBy: { createdAt: "asc" } } } },
      lines: { include: lineInclude, orderBy: { lineNo: "asc" } },
    },
  });
}

/**
 * The same line analysis at several build quantities, loaded once and re-run in memory — what a customer quote
 * prices at each quantity. `pins` puts a chosen source first on its line.
 */
export async function analyseRevisionAt(db: Db, revisionId: string, currency: Currency, quantities: number[], pins?: Map<string, LinePin>, now = new Date(), strategy?: StrategyKey) {
  const rev = await loadRevision(db, revisionId);
  if (!rev) return null;
  const [rates, liveSince] = await Promise.all([loadDutyRates(db), getLiveSince(db)]);
  const base = { customerId: rev.bom.project.customerId, currency, nowYear: fractionalYear(now), rates, now, liveSince, pins, strategy };
  return { revision: rev, byQty: new Map(quantities.map((q) => [q, rev.lines.map((l) => analyseLine(l, { ...base, buildQty: q }))])) };
}

export async function analyseRevision(db: Db, revisionId: string, currency: Currency, now = new Date(), opts: { buildQty?: number } = {}) {
  const rev = await loadRevision(db, revisionId);
  if (!rev) return null;
  const [rates, liveSince] = await Promise.all([loadDutyRates(db), getLiveSince(db)]);
  const ctx: Ctx = { buildQty: opts.buildQty ?? rev.buildQty, customerId: rev.bom.project.customerId, currency, nowYear: fractionalYear(now), rates, now, liveSince };
  const lines = rev.lines.map((l) => analyseLine(l, ctx));
  const scored = lines.filter((l) => l.scores).map((l) => ({ scores: l.scores!, spend: l.spend }));
  return {
    revision: rev,
    lines,
    scores: scoreBom(scored),
    totals: {
      toBuy: lines.reduce((s, l) => s + l.toBuyCost, 0),
      toBuyLanded: lines.reduce((s, l) => s + l.toBuyLanded, 0),
      fromStock: lines.reduce((s, l) => s + l.allocations.filter((a) => a.tier <= 2).reduce((x, a) => x + (a.unit ?? 0) * a.qty, 0), 0),
      shortLines: lines.filter((l) => l.part && !l.dnp && l.shortfall > 0).length,
      unmatched: lines.filter((l) => !l.partId && !l.dnp).length,
      needsReview: lines.filter((l) => l.needsReview).length,
      placementsPerBoard: lines.filter((l) => !l.dnp).reduce((s, l) => s + l.qtyPerBoard, 0),
    },
  };
}

export type RevisionAnalysis = NonNullable<Awaited<ReturnType<typeof analyseRevision>>>;

/** Persists line + BoM scores (INR basis) so dashboards and lists don't recompute. */
export async function scoreRevision(db: Db, revisionId: string) {
  const a = await analyseRevision(db, revisionId, "INR");
  if (!a) return null;
  await db.$transaction([
    ...a.lines.map((l) =>
      db.bomLine.update({
        where: { id: l.id },
        data: {
          requiredQty: l.required,
          scoreAvailability: l.scores?.availability ?? null,
          scoreResilience: l.scores?.resilience ?? null,
          scoreQuality: l.scores?.quality ?? null,
          scoreEconomic: l.scores?.economic ?? null,
          scoreSustainability: l.scores?.sustainability ?? null,
        },
      }),
    ),
    db.bomRevision.update({ where: { id: revisionId }, data: { scores: a.scores ?? undefined, scoredAt: new Date() } }),
  ]);
  return a;
}
