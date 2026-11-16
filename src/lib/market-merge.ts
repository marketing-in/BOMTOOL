import type { Lifecycle, RohsStatus } from "@prisma/client";
import { convert, priceAtQty, type Currency } from "@/lib/currency";
import { normaliseMpn } from "@/lib/normalise";
import { webUrl } from "@/server/sourcing/normalise";
import type { AdapterKey, AdapterPart } from "@/server/sourcing/types";

/** Distributor search results merged into one row per part, ranked the way a buyer scans them. */

export type MarketOffer = {
  seller: string;
  adapter: AdapterKey;
  authorised: boolean;
  stock: number;
  moq: number;
  packaging: string | null;
  unit1: number | null;
  unit1k: number | null;
  leadWeeks: number | null;
  url: string | null;
};

export type MarketResult = {
  key: string;
  mpn: string;
  manufacturer: string;
  description: string | null;
  category: string | null;
  lifecycle: Lifecycle | null;
  rohs: RohsStatus | null;
  imageUrl: string | null;
  datasheetUrl: string | null;
  params: Record<string, string>;
  offers: MarketOffer[];
  totalStock: number;
  /** Lowest unit price at 1k across offers, display currency. */
  best1k: number | null;
  /** Lowest unit price for the quantity asked about, from sellers with stock; null when no quantity was given. */
  bestAtNeed: number | null;
  /** Set when the part is already in our catalogue. */
  partId: string | null;
};

export const resultKey = (mpn: string, maker: string) => `${normaliseMpn(mpn)}|${maker.toLowerCase().split(/\s+/)[0] ?? ""}`;

const KIT = /\b(evm|eval|evaluation|demo|dev(elopment)? (board|kit)|starter kit)\b|-?(EVM|EVAL|KIT)\b/i;

/** 0 exact MPN, 1 MPN starts with the query, 2 MPN contains it, 3 anything else, 4 dev kits. */
export function relevance(r: Pick<MarketResult, "mpn" | "description">, query: string): number {
  const q = normaliseMpn(query);
  const m = normaliseMpn(r.mpn);
  if (KIT.test(r.mpn) || KIT.test(r.description ?? "")) return 4;
  if (!q || q.length < 3) return 3;
  return m === q ? 0 : m.startsWith(q) ? 1 : m.includes(q) ? 2 : 3;
}

export function mergeAnswers(answers: { adapter: AdapterKey; parts: AdapterPart[] }[], currency: Currency, query = "", need?: number): MarketResult[] {
  const byKey = new Map<string, MarketResult>();
  for (const { adapter, parts } of answers) {
    for (const p of parts) {
      const key = resultKey(p.mpn, p.manufacturer);
      const r: MarketResult = byKey.get(key) ?? {
        key,
        mpn: p.mpn,
        manufacturer: p.manufacturer,
        description: p.description,
        category: p.category ?? null,
        lifecycle: p.lifecycle ?? null,
        rohs: p.rohs ?? null,
        imageUrl: null,
        datasheetUrl: null,
        params: {},
        offers: [],
        totalStock: 0,
        best1k: null,
        bestAtNeed: null,
        partId: null,
      };
      r.imageUrl ??= webUrl(p.imageUrl);
      r.datasheetUrl ??= webUrl(p.datasheetUrl);
      r.description ??= p.description;
      r.lifecycle ??= p.lifecycle ?? null;
      r.rohs ??= p.rohs ?? null;
      r.params = { ...p.params, ...r.params };
      for (const o of p.offers) {
        const at = (q: number) => {
          const v = priceAtQty(o.priceBreaks, Math.max(q, o.moq));
          return v === null ? null : convert(v, o.currency, currency);
        };
        const unit1k = at(1000);
        r.offers.push({
          seller: o.sellerName,
          adapter,
          authorised: o.authorised,
          stock: o.stock,
          moq: o.moq,
          packaging: o.packaging ?? null,
          unit1: at(1),
          unit1k,
          leadWeeks: o.factoryLeadTimeWeeks ?? null,
          url: o.url ?? null,
        });
        r.totalStock += o.stock;
        if (unit1k !== null && (r.best1k === null || unit1k < r.best1k)) r.best1k = unit1k;
        const atNeed = need && o.stock > 0 ? at(need) : null;
        if (atNeed !== null && (r.bestAtNeed === null || atNeed < r.bestAtNeed)) r.bestAtNeed = atNeed;
      }
      byKey.set(key, r);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => relevance(a, query) - relevance(b, query) || Number(b.totalStock > 0) - Number(a.totalStock > 0) || b.totalStock - a.totalStock || a.mpn.localeCompare(b.mpn),
  );
}
