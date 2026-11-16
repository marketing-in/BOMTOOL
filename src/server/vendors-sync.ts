import type { Prisma, PrismaClient } from "@prisma/client";
import { ALL_VENDORS, CHANNEL_PARTNERS } from "../../prisma/seed-data/vendors";
import { CATALOGUE_ENCLOSURES } from "../../prisma/seed-data/parts";
import { normaliseMpn } from "../lib/normalise";

/** Deterministic 0–1 from a string, so re-runs give the same sample stock. */
function unit(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Adds the Phase 10 sample vendors and channel-partner stock lists without touching other data: suppliers are
 * upserted by code; a partner's listings are created only for parts it doesn't list yet. Safe to re-run.
 */
export async function syncVendors(db: PrismaClient, opts: { mockOffers?: boolean } = {}) {
  for (const v of ALL_VENDORS) {
    const data = { name: v.name, kind: v.kind, country: v.country, currency: v.currency, freightPct: v.freightPct, supplies: v.supplies, capabilities: v.capabilities as Prisma.InputJsonValue, isAuthorised: false, adapter: v.kind === "CHANNEL_PARTNER" ? "partner-feed" : null };
    await db.supplier.upsert({ where: { code: v.code }, create: { code: v.code, ...data }, update: data });
  }

  // Parts on BoMs, with a reference price (best authorised unit price at the first break, in INR terms of the offer).
  const parts = await db.part.findMany({
    where: { bomLines: { some: {} } },
    select: { id: true, mpn: true, offers: { where: { supplier: { kind: { in: ["AUTHORISED", "MANUFACTURER"] } } }, select: { priceBreaks: true, currency: true } } },
  });
  let listings = 0;
  for (const p of CHANNEL_PARTNERS) {
    const supplier = await db.supplier.findUniqueOrThrow({ where: { code: p.code } });
    const caps = p.capabilities as { leadDays: number; coverage: number; priceFactor: number; location: string };
    const have = new Set((await db.excessListing.findMany({ where: { supplierId: supplier.id }, select: { partId: true } })).map((l) => l.partId));
    const rows: Prisma.ExcessListingCreateManyInput[] = [];
    for (const part of parts) {
      if (have.has(part.id) || unit(`${p.code}|${part.mpn}`) > caps.coverage) continue;
      const breaks = part.offers.flatMap((o) => ((o.priceBreaks ?? []) as { qty: number; price: number }[]).map((b) => ({ ...b, currency: o.currency })));
      const ref = breaks.filter((b) => b.currency === p.currency).sort((a, b) => a.price - b.price)[0];
      const r = unit(`${p.code}|qty|${part.mpn}`);
      rows.push({
        partId: part.id,
        supplierId: supplier.id,
        qty: Math.round((200 + r * 9_800) / 50) * 50,
        askPrice: ref ? Number((ref.price * caps.priceFactor).toFixed(4)) : null,
        currency: p.currency,
        dateCode: `${24 + Math.floor(r * 2)}${String(1 + Math.floor(r * 50)).padStart(2, "0")}`,
        condition: "NEW_FACTORY_SEALED",
        cocAvailable: r > 0.25,
        location: caps.location,
        acceptsBids: true,
        leadDays: caps.leadDays,
      });
    }
    if (rows.length) await db.excessListing.createMany({ data: rows });
    listings += rows.length;
  }
  const enclosures = await syncEnclosureParts(db, opts);
  return { vendors: ALL_VENDORS.length, listings, enclosures };
}

/**
 * Adds the catalogue enclosures the box step offers as parts (category "enclosure"), only where missing. With
 * `mockOffers` (a fresh seed without API keys) each gets simulated distributor offers; otherwise a refresh fetches
 * real ones.
 */
export async function syncEnclosureParts(db: PrismaClient, opts: { mockOffers?: boolean } = {}) {
  const category = await db.category.findUnique({ where: { slug: "enclosure" } });
  if (!category) return 0;
  const params = new Map((await db.parameter.findMany({ where: { key: { in: ["material", "dimensions", "ip_rating"] } } })).map((x) => [x.key, x.id]));
  const sellers = opts.mockOffers ? await db.supplier.findMany({ where: { code: { in: ["DIGIKEY", "MOUSER"] } } }) : [];
  let added = 0;
  for (const e of CATALOGUE_ENCLOSURES) {
    const mfr = await db.manufacturer.upsert({ where: { name: e.mfr }, create: { name: e.mfr, brandTier: 4, country: "CA" }, update: {} });
    if (await db.part.findFirst({ where: { mpnNormalised: normaliseMpn(e.mpn), manufacturerId: mfr.id }, select: { id: true } })) continue;
    const part = await db.part.create({
      data: {
        mpn: e.mpn,
        mpnNormalised: normaliseMpn(e.mpn),
        manufacturerId: mfr.id,
        categoryId: category.id,
        description: e.desc,
        rohs: "COMPLIANT",
        reach: "COMPLIANT",
        hsnCode: "76169990",
        eccn: "EAR99",
        countryOfOrigin: "CA",
        mountType: e.mount ?? "CHASSIS",
        mfrLeadTimeWeeks: e.lt,
        counterfeitRisk: e.cf ?? 1,
        source: "seed",
      },
    });
    const rows = Object.entries(e.params).filter(([k]) => params.has(k)).map(([k, valueText]) => ({ partId: part.id, parameterId: params.get(k)!, valueText }));
    if (rows.length) await db.partParameter.createMany({ data: rows });
    for (const s of sellers) {
      const r = unit(`${s.code}|${e.mpn}`);
      const usd = e.usd * (0.95 + r * 0.12);
      await db.offer.create({
        data: {
          partId: part.id,
          supplierId: s.id,
          sku: `${s.code}-${normaliseMpn(e.mpn)}`,
          packaging: "Bulk",
          stock: Math.round(20 + r * 600),
          currency: "USD",
          priceBreaks: [1, 10, 50, 100, 500].map((qty, i) => ({ qty, price: Number((usd * [1.35, 1.2, 1.1, 1, 0.92][i]).toFixed(2)) })),
          factoryLeadTimeWeeks: e.lt ?? 6,
          source: "mock",
        },
      });
    }
    added++;
  }
  return added;
}
