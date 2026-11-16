import type { Prisma, Supplier } from "@prisma/client";
import { db } from "@/lib/db";
import { convert, priceAtQty } from "@/lib/currency";
import { readBreaks } from "@/lib/pricing";
import { normaliseManufacturerKey, normaliseMpn } from "@/lib/normalise";
import { BudgetExceededError, istDayKey } from "@/lib/rate-limit";
import { detectOfferEvents, resolveLifecycle, type LifecycleReport } from "@/lib/sourcing-events";
import { parseSiValue } from "@/lib/units";
import { HSN_BY_CATEGORY } from "../../../prisma/seed-data/parts";
import { scoreRevision } from "@/server/bom-pipeline";
import { activeAdapters, callAdapter, pickPart } from "./index";
import type { AdapterKey, AdapterOffer, AdapterPart } from "./types";

const REF_QTY = 1000;

// ───────────────────────────── Suppliers ─────────────────────────────

/** Seller names from aggregators → our supplier codes. */
const SELLER_ALIASES: Record<string, string> = {
  digikey: "DIGIKEY",
  digikeyelectronics: "DIGIKEY",
  mouser: "MOUSER",
  mouserelectronics: "MOUSER",
  farnell: "E14-IN",
  element14: "E14-IN",
  element14india: "E14-IN",
  arrow: "ARROW",
  arrowelectronics: "ARROW",
  tme: "TME",
  transfermultisort: "TME",
  lcsc: "LCSC",
  lcscelectronics: "LCSC",
  robu: "ROBU",
  robuin: "ROBU",
  evelta: "EVELTA",
};
const sellerKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export class SupplierResolver {
  private byCode = new Map<string, Supplier>();
  private byName = new Map<string, Supplier>();
  constructor(suppliers: Supplier[]) {
    for (const s of suppliers) this.remember(s);
  }
  private remember(s: Supplier) {
    this.byCode.set(s.code, s);
    this.byName.set(sellerKey(s.name), s);
  }
  async resolve(o: AdapterOffer, adapter: AdapterKey): Promise<Supplier> {
    const code = o.sellerCode ?? SELLER_ALIASES[sellerKey(o.sellerName)];
    const known = (code && this.byCode.get(code)) || this.byName.get(sellerKey(o.sellerName));
    if (known) return known;
    const created = await db.supplier.create({
      data: {
        code: `NX-${o.sellerName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24)}`,
        name: o.sellerName,
        kind: o.authorised ? "AUTHORISED" : "BROKER",
        isAuthorised: o.authorised,
        country: o.country ?? null,
        currency: o.currency,
        adapter,
        freightPct: o.country === "IN" ? 0.5 : 3,
      },
    });
    this.remember(created);
    return created;
  }
}

// ───────────────────────────── Applying results ─────────────────────────────

export type ApplyResult = { upserted: number; removed: number; events: number };

const unitAtRef = (breaks: { qty: number; price: number }[], currency: string) => {
  const p = priceAtQty(breaks, REF_QTY);
  return p === null ? null : convert(p, currency, "INR");
};

/**
 * Writes one adapter's answer for one part: offers, today's price point, events, part facts.
 * Lifecycle is not set here — sources can disagree, so callers collect every answer and call applyLifecycle once.
 */
export async function applyAdapterPart(partId: string, adapter: AdapterKey, ap: AdapterPart, suppliers: SupplierResolver): Promise<ApplyResult> {
  const part = await db.part.findUniqueOrThrow({ where: { id: partId }, include: { offers: true } });
  const prevBySku = new Map(part.offers.map((o) => [`${o.supplierId}|${o.sku}`, o]));
  const seen = new Set<string>();
  const events: Prisma.SourcingEventCreateManyInput[] = [];
  const dayStart = new Date(`${istDayKey()}T00:00:00+05:30`);
  let upserted = 0;

  for (const o of ap.offers) {
    if (!o.priceBreaks.length && o.stock === 0) continue;
    const supplier = await suppliers.resolve(o, adapter);
    const id = `${supplier.id}|${o.sku}`;
    seen.add(id);
    const prev = prevBySku.get(id);
    const data = {
      packaging: o.packaging ?? null,
      stock: o.stock,
      moq: o.moq,
      spq: o.spq,
      currency: o.currency,
      priceBreaks: o.priceBreaks,
      factoryLeadTimeWeeks: o.factoryLeadTimeWeeks,
      condition: "NEW_FACTORY_SEALED" as const,
      cocAvailable: o.authorised,
      source: adapter,
      url: o.url ?? null,
      fetchedAt: new Date(),
    };
    await db.offer.upsert({
      where: { partId_supplierId_sku: { partId, supplierId: supplier.id, sku: o.sku } },
      create: { partId, supplierId: supplier.id, sku: o.sku, ...data },
      update: data,
    });
    upserted++;

    const nextUnit = unitAtRef(o.priceBreaks, o.currency);
    const prevUnit = prev ? unitAtRef(readBreaks(prev.priceBreaks), prev.currency) : null;
    for (const ev of detectOfferEvents(prev ? { unitInr: prevUnit, stock: prev.stock } : null, { unitInr: nextUnit, stock: o.stock })) {
      events.push({ kind: ev.kind, partId, supplierId: supplier.id, data: { ...ev.data, sku: o.sku } });
    }

    // One price point per supplier per day (native currency, unit price at the reference qty).
    const native = priceAtQty(o.priceBreaks, REF_QTY);
    if (native !== null) {
      await db.priceHistory.deleteMany({ where: { partId, supplierId: supplier.id, recordedAt: { gte: dayStart } } });
      await db.priceHistory.create({ data: { partId, supplierId: supplier.id, unitPrice: native, currency: o.currency, refQty: REF_QTY, stock: o.stock } });
    }
  }

  // Offers this source no longer lists are gone.
  const stale = part.offers.filter((o) => o.source === adapter && !seen.has(`${o.supplierId}|${o.sku}`));
  if (stale.length) await db.offer.deleteMany({ where: { id: { in: stale.map((o) => o.id) } } });

  const update: Prisma.PartUpdateInput = {};
  if (!part.datasheetUrl && ap.datasheetUrl) update.datasheetUrl = ap.datasheetUrl;
  if (!part.imageUrl && ap.imageUrl) update.imageUrl = ap.imageUrl;
  if (ap.mfrLeadTimeWeeks) update.mfrLeadTimeWeeks = ap.mfrLeadTimeWeeks;
  if (part.rohs === "UNKNOWN" && ap.rohs) update.rohs = ap.rohs;
  if (part.reach === "UNKNOWN" && ap.reach) update.reach = ap.reach;
  if (!part.eccn && ap.eccn) update.eccn = ap.eccn;
  // Details still missing are filled from the same answer — no extra calls (Phase 13: details, continuously).
  if (!part.msl && ap.msl) update.msl = ap.msl;
  if (!part.hsnCode && ap.hsn) update.hsnCode = ap.hsn;
  if (!part.description.trim() && ap.description) update.description = ap.description;
  if (Object.keys(update).length) await db.part.update({ where: { id: partId }, data: update });
  if (events.length) await db.sourcingEvent.createMany({ data: events });

  return { upserted, removed: stale.length, events: events.length };
}

/** Sets the part's lifecycle from this run's answers (most severe wins); returns the number of events written. */
export async function applyLifecycle(partId: string, reports: LifecycleReport[], opts: { complete: boolean } = { complete: true }): Promise<number> {
  const part = await db.part.findUniqueOrThrow({ where: { id: partId }, select: { lifecycle: true } });
  const r = resolveLifecycle(part.lifecycle, reports, opts);
  if (!r) return 0;
  await db.part.update({ where: { id: partId }, data: { lifecycle: r.next, lifecycleUpdatedAt: new Date() } });
  if (!r.report) return 0;
  const reported = Object.fromEntries(reports.filter((x) => x.lifecycle).map((x) => [x.source, x.lifecycle!]));
  await db.sourcingEvent.create({ data: { kind: "LIFECYCLE_CHANGE", partId, data: { from: part.lifecycle, to: r.next, source: r.sources.join(", "), reported } } });
  return 1;
}

// ───────────────────────────── Refresh runs ─────────────────────────────

export type RefreshStats = {
  parts: number;
  done: number;
  offersUpserted: number;
  offersRemoved: number;
  events: number;
  calls: Record<string, number>;
  cached: number;
  notFound: number;
  errors: string[];
  skippedAdapters: string[];
  revisionsRescored: number;
};

export async function refreshParts(
  partIds: string[],
  opts: { ttlSec: number; onProgress?: (s: RefreshStats) => Promise<void> | void; rescore?: boolean },
): Promise<RefreshStats> {
  const adapters = activeAdapters();
  const stats: RefreshStats = { parts: partIds.length, done: 0, offersUpserted: 0, offersRemoved: 0, events: 0, calls: {}, cached: 0, notFound: 0, errors: [], skippedAdapters: [], revisionsRescored: 0 };
  const suppliers = new SupplierResolver(await db.supplier.findMany());
  const parts = await db.part.findMany({ where: { id: { in: partIds } }, include: { manufacturer: true } });
  const skipped = new Set<string>();
  let savedAt = Date.now();

  for (const part of parts) {
    let found = false;
    let failed = false;
    const lifecycles: LifecycleReport[] = [];
    for (const a of adapters) {
      if (skipped.has(a.key)) continue;
      try {
        const { parts: answer, cached } = await callAdapter(a, part.mpn, opts.ttlSec);
        if (cached) stats.cached++;
        else stats.calls[a.key] = (stats.calls[a.key] ?? 0) + 1;
        const ap = pickPart(answer, part.mpn, part.manufacturer.name);
        if (!ap) continue;
        found = true;
        lifecycles.push({ source: a.key, lifecycle: ap.lifecycle });
        const r = await applyAdapterPart(part.id, a.key, ap, suppliers);
        stats.offersUpserted += r.upserted;
        stats.offersRemoved += r.removed;
        stats.events += r.events;
      } catch (e) {
        if (e instanceof BudgetExceededError) {
          skipped.add(a.key);
          stats.skippedAdapters.push(a.key);
        } else failed = true;
        if (stats.errors.length < 20) stats.errors.push(`${part.mpn}: ${(e as Error).message}`);
      }
    }
    try {
      stats.events += await applyLifecycle(part.id, lifecycles, { complete: !failed });
    } catch (e) {
      if (stats.errors.length < 20) stats.errors.push(`${part.mpn}: lifecycle: ${(e as Error).message}`);
    }
    if (!found) stats.notFound++;
    stats.done++;
    // Every 10 parts, and at least once a minute when rate limits slow the run down (the scheduler's heartbeat).
    if (opts.onProgress && (stats.done % 10 === 0 || stats.done === parts.length || Date.now() - savedAt > 60_000)) {
      await opts.onProgress(stats);
      savedAt = Date.now();
    }
  }

  if (opts.rescore !== false) {
    const revisions = await db.bomRevision.findMany({
      where: { status: { in: ["MATCHED", "QUOTED", "RELEASED"] }, lines: { some: { partId: { in: partIds } } } },
      select: { id: true },
    });
    for (const r of revisions) await scoreRevision(db, r.id);
    stats.revisionsRescored = revisions.length;
  }
  return stats;
}

// ───────────────────────────── New parts from distributors ─────────────────────────────

/** Distributor category wording → our category slug. */
export function guessCategory(text: string | null | undefined, description?: string | null): string {
  const t = `${text ?? ""} ${description ?? ""}`.toLowerCase();
  const rules: [RegExp, string][] = [
    [/current.?sense|metal.?strip|shunt/, "resistor-current-sense"],
    [/microcontroller|\bmcu\b/, "mcu"],
    [/rf transceiver|wi-?fi|bluetooth|\bble\b|\blora\b|rf module|wireless/, "rf-wireless"],
    [/op amp|operational|amplifier/, "op-amp"],
    [/\badc|\bdac|data acquisition/, "data-converter"],
    [/dc.?dc|regulator|pmic|power (distribution )?switch|ldo|buck|boost/, "power-ic"],
    [/interface|transceiver|uart|usb|rs-?485|can\b/, "interface-ic"],
    [/memory|flash|eeprom|dram/, "memory"],
    [/mosfet|\bfet\b/, "mosfet"],
    [/diode|tvs|esd|rectifier|schottky|zener/, "diode"],
    [/logic|gate|inverter|timer|clock/, "logic-ic"],
    [/chip resistor|resistor/, "resistor-chip"],
    [/ceramic|mlcc/, "mlcc"],
    [/inductor/, "inductor"],
    [/connector|header/, "connector-header"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? "uncategorised";
}

/** Creates (or finds) a catalogue part from a distributor answer. Returns the part id. */
export async function upsertPartFromAdapter(ap: AdapterPart, adapter: AdapterKey): Promise<{ partId: string; created: boolean }> {
  const key = normaliseManufacturerKey(ap.manufacturer);
  const alias = await db.manufacturerAlias.findUnique({ where: { alias: key }, include: { manufacturer: true } });
  const manufacturer =
    alias?.manufacturer ??
    (await db.manufacturer.findFirst({ where: { name: { equals: ap.manufacturer, mode: "insensitive" } } })) ??
    (await db.manufacturer.create({ data: { name: ap.manufacturer, brandTier: 3, aliases: { create: key ? [{ alias: key }] : [] } } }));

  const mpnNormalised = normaliseMpn(ap.mpn);
  const existing = await db.part.findUnique({ where: { mpnNormalised_manufacturerId: { mpnNormalised, manufacturerId: manufacturer.id } } });
  if (existing) return { partId: existing.id, created: false };

  const slug = guessCategory(ap.category, ap.description);
  const category = (await db.category.findUnique({ where: { slug } })) ?? (await db.category.findUniqueOrThrow({ where: { slug: "uncategorised" } }));
  const params = await db.parameter.findMany({ where: { key: { in: Object.keys(ap.params ?? {}) } } });
  const part = await db.part.create({
    data: {
      mpn: ap.mpn,
      mpnNormalised,
      manufacturerId: manufacturer.id,
      categoryId: category.id,
      description: ap.description ?? ap.mpn,
      datasheetUrl: ap.datasheetUrl ?? null,
      imageUrl: ap.imageUrl ?? null,
      lifecycle: ap.lifecycle ?? "UNKNOWN",
      rohs: ap.rohs ?? "UNKNOWN",
      reach: ap.reach ?? "UNKNOWN",
      msl: ap.msl ?? null,
      eccn: ap.eccn ?? null,
      hsnCode: ap.hsn ?? HSN_BY_CATEGORY[slug] ?? null,
      mfrLeadTimeWeeks: ap.mfrLeadTimeWeeks ?? null,
      source: adapter,
      parameters: {
        create: params.map((p) => ({ parameterId: p.id, valueText: ap.params![p.key], valueNum: p.dataType === "number" ? parseSiValue(ap.params![p.key]) : null })),
      },
    },
  });
  await db.sourcingEvent.create({ data: { kind: "NEW_PART", partId: part.id, data: { source: adapter, mpn: ap.mpn } } });
  return { partId: part.id, created: true };
}
