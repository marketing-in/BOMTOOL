import { db } from "@/lib/db";
import { normaliseMpn } from "@/lib/normalise";
import { convert, type PriceBreak } from "@/lib/currency";
import { readBreaks } from "@/lib/pricing";
import { createRng, type Rng } from "@/lib/rng";
import { MOCK_UNIVERSE } from "../mock-universe";
import type { AdapterOffer, AdapterPart, SupplierAdapter } from "../types";

/** Mock market moves once per hour; the same hour always gives the same answer (deterministic). */
export const MOCK_BUCKET_MS = 3_600_000;

export type MockOfferState = { priceBreaks: PriceBreak[]; stock: number; factoryLeadTimeWeeks: number | null };

/** One market step for an offer: small daily-ish drift, rare spikes/drops, stock depletion and restocks. */
export function evolveOffer(prev: MockOfferState, rng: Rng): MockOfferState {
  let factor = 1 + rng.between(-0.02, 0.025);
  const roll = rng.next();
  if (roll < 0.02) factor = 1 + rng.between(0.12, 0.25); // allocation / price spike
  else if (roll < 0.03) factor = 1 - rng.between(0.1, 0.15); // distributor promotion
  const round = (p: number) => (p < 1 ? Math.round(p * 1e5) / 1e5 : Math.round(p * 1e3) / 1e3);

  let stock = prev.stock;
  const s = rng.next();
  if (stock === 0) stock = s < 0.3 ? rng.int(500, 20_000) : 0;
  else if (s < 0.02) stock = 0;
  else stock = Math.max(0, Math.round(stock * (1 + rng.between(-0.2, 0.1))));

  let lead = prev.factoryLeadTimeWeeks;
  if (lead !== null && rng.chance(0.1)) lead = Math.max(1, lead + rng.pick([-1, 1, 2]));

  return { priceBreaks: prev.priceBreaks.map((b) => ({ qty: b.qty, price: round(b.price * factor) })), stock, factoryLeadTimeWeeks: lead };
}

const UNIVERSE_SELLERS = [
  { code: "DIGIKEY", name: "DigiKey", currency: "USD", factor: 1, depth: 1 },
  { code: "MOUSER", name: "Mouser Electronics", currency: "USD", factor: 1.02, depth: 0.9 },
  { code: "LCSC", name: "LCSC Electronics", currency: "USD", factor: 0.8, depth: 1.5 },
  { code: "E14-IN", name: "element14 India (Farnell)", currency: "INR", factor: 1.08, depth: 0.5 },
  { code: "NEWARK", name: "Newark", currency: "USD", factor: 1.04, depth: 0.7 },
];

function universeOffers(mpn: string, usd: number): AdapterOffer[] {
  const out: AdapterOffer[] = [];
  for (const s of UNIVERSE_SELLERS) {
    const rng = createRng(`universe|${mpn}|${s.code}`);
    if (!rng.chance(0.85)) continue;
    const unit = convert(usd * s.factor * rng.between(0.94, 1.08), "USD", s.currency);
    const mult: [number, number][] = usd < 0.05 ? [[1, 8], [10, 4], [100, 1.8], [1000, 1], [4000, 0.7]] : [[1, 1.6], [10, 1.35], [100, 1.15], [1000, 1], [5000, 0.92]];
    out.push({
      sellerName: s.name,
      sellerCode: s.code,
      authorised: true,
      country: s.code === "E14-IN" ? "IN" : s.code === "LCSC" ? "CN" : "US",
      sku: `${s.code}-${normaliseMpn(mpn)}`,
      packaging: "Cut Tape",
      stock: rng.chance(0.12) ? 0 : Math.round((usd < 0.1 ? rng.int(20_000, 400_000) : rng.int(300, 15_000)) * s.depth),
      moq: 1,
      spq: usd < 0.1 ? 3000 : 2500,
      currency: s.currency,
      priceBreaks: mult.map(([qty, m]) => ({ qty, price: Math.round(unit * m * 1e5) / 1e5 })),
      factoryLeadTimeWeeks: rng.int(6, 20),
      url: null,
    });
  }
  return out;
}

export const mockAdapter: SupplierAdapter = {
  key: "mock",
  label: "Mock market (demo data)",
  kind: "mock",
  envVars: [],
  configured: () => true,
  perMinute: 100_000,
  dailyLimit: 1_000_000,
  async searchMpn(mpn) {
    const key = normaliseMpn(mpn);
    const bucket = Math.floor(Date.now() / MOCK_BUCKET_MS);

    // Catalogue part: move its existing mock offers one step.
    const part = await db.part.findFirst({
      where: { mpnNormalised: key },
      include: { manufacturer: true, offers: { where: { source: "mock" }, include: { supplier: true } } },
    });
    if (part?.offers.length) {
      const offers: AdapterOffer[] = part.offers.map((o) => {
        const next = evolveOffer(
          { priceBreaks: readBreaks(o.priceBreaks), stock: o.stock, factoryLeadTimeWeeks: o.factoryLeadTimeWeeks },
          createRng(`${key}|${o.supplierId}|${bucket}`),
        );
        return {
          sellerName: o.supplier.name,
          sellerCode: o.supplier.code,
          authorised: o.supplier.isAuthorised,
          country: o.supplier.country,
          sku: o.sku ?? `${o.supplier.code}-${key}`,
          packaging: o.packaging,
          stock: next.stock,
          moq: o.moq,
          spq: o.spq,
          currency: o.currency,
          priceBreaks: next.priceBreaks,
          factoryLeadTimeWeeks: next.factoryLeadTimeWeeks,
          url: null,
        };
      });
      return [{ mpn: part.mpn, manufacturer: part.manufacturer.name, description: part.description, lifecycle: part.lifecycle, offers }];
    }

    const u = MOCK_UNIVERSE.find((x) => normaliseMpn(x.mpn) === key);
    if (u) {
      return [
        {
          mpn: u.mpn,
          manufacturer: u.manufacturer,
          description: u.description,
          category: u.category,
          lifecycle: u.lifecycle ?? "ACTIVE",
          rohs: "COMPLIANT",
          reach: "COMPLIANT",
          params: u.params,
          offers: universeOffers(u.mpn, u.usd),
        } satisfies AdapterPart,
      ];
    }
    return [];
  },
  /** Directory search over the simulated universe and our catalogue's mock offers. */
  async searchKeyword(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hits = (text: string) => words.every((w) => text.toLowerCase().includes(w) || normaliseMpn(text).includes(normaliseMpn(w)));
    const universe = MOCK_UNIVERSE.filter((u) => hits(`${u.mpn} ${u.manufacturer} ${u.description} ${u.category}`)).map((u) => u.mpn);
    const catalogue = await db.part.findMany({
      where: {
        offers: { some: { source: "mock" } },
        AND: words.map((w) => ({
          OR: [{ mpnNormalised: { contains: normaliseMpn(w) } }, { description: { contains: w, mode: "insensitive" as const } }, { manufacturer: { name: { contains: w, mode: "insensitive" as const } } }],
        })),
      },
      take: 12,
      select: { mpn: true },
    });
    const out: AdapterPart[] = [];
    for (const mpn of [...new Set([...universe, ...catalogue.map((c) => c.mpn)])].slice(0, 20)) out.push(...(await mockAdapter.searchMpn(mpn)));
    return out;
  },
};
