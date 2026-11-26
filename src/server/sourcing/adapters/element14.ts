import { fetchJson } from "../http";
import { webUrl } from "../normalise";
import { AdapterError, type AdapterKey, type AdapterPart, type SupplierAdapter } from "../types";

/**
 * element14 Product Search API (REST, JSON): one API for the Newark, element14 and Farnell stores, chosen with
 * `storeInfo.id`. Generic access needs only the API key from the element14 Partner Portal.
 * Docs: https://partner.element14.com/docs/Product_Search_API_REST__Description
 *
 * The docs give no currency in the response: prices are in the store's own currency, set per store below.
 */
const BASE = "https://api.element14.com/catalog/products";

type E14Product = {
  sku?: string;
  displayName?: string;
  brandName?: string;
  vendorName?: string;
  translatedManufacturerPartNumber?: string;
  productStatus?: string;
  rohsStatusCode?: string;
  packSize?: number;
  unitOfMeasure?: string;
  translatedMinimumOrderQuality?: number;
  inv?: number;
  stock?: { level?: number; leastLeadTime?: number; status?: number } | null;
  prices?: { from?: number; to?: number; cost?: number }[] | null;
  datasheets?: { type?: string; description?: string; url?: string }[] | null;
  image?: { mainImageURL?: string } | null;
  productURL?: string;
};

/** Every search answers in a "…Return" wrapper (keywordSearchReturn, manufacturerPartNumberSearchReturn …). */
export type E14Response = Record<string, { numberOfResults?: number; products?: E14Product[] } | unknown> & { Fault?: unknown };

export type E14Store = { key: AdapterKey; label: string; store: string; sellerCode: string; sellerName: string; country: string; currency: string };

/** A product status the docs list: only "no longer manufactured" says anything about the part's life. */
const lifecycleOf = (status: string | undefined) => (status === "NO_LONGER_MANUFACTURED" ? "OBSOLETE" : null);

export function parseE14Response(adapter: AdapterKey, json: E14Response, s: Omit<E14Store, "key" | "label" | "store">): AdapterPart[] {
  if (json.Fault) throw new AdapterError(adapter, `API fault: ${JSON.stringify(json.Fault).slice(0, 200)}`);
  const wrapper = Object.values(json).find((v): v is { products?: E14Product[] } => !!v && typeof v === "object" && Array.isArray((v as { products?: unknown }).products));
  return (wrapper?.products ?? [])
    .filter((p) => p.translatedManufacturerPartNumber && p.sku)
    .map((p) => {
      const breaks = (p.prices ?? [])
        .map((b) => ({ qty: Number(b.from ?? 0), price: Number(b.cost) }))
        .filter((b) => b.qty > 0 && Number.isFinite(b.price))
        .sort((a, b) => a.qty - b.qty);
      // leastLeadTime is in days in the samples ("leastLeadTime": 5 beside short-lead stock).
      const leadDays = p.stock?.leastLeadTime;
      const lead = typeof leadDays === "number" && leadDays > 0 ? Math.ceil(leadDays / 7) : null;
      return {
        mpn: p.translatedManufacturerPartNumber!,
        manufacturer: p.brandName ?? p.vendorName ?? "Unknown",
        description: p.displayName ?? null,
        lifecycle: lifecycleOf(p.productStatus),
        datasheetUrl: webUrl(p.datasheets?.[0]?.url),
        imageUrl: webUrl(p.image?.mainImageURL),
        rohs: p.rohsStatusCode === "YES" ? "COMPLIANT" : p.rohsStatusCode === "NO" ? "NON_COMPLIANT" : null,
        offers: [
          {
            sellerName: s.sellerName,
            sellerCode: s.sellerCode,
            authorised: true,
            country: s.country,
            sku: p.sku!,
            packaging: p.unitOfMeasure ?? null,
            stock: Math.max(0, Math.round(Number(p.stock?.level ?? p.inv ?? 0)) || 0),
            moq: Math.max(1, Number(p.translatedMinimumOrderQuality ?? 1) || 1),
            spq: Math.max(1, Number(p.packSize ?? 1) || 1),
            currency: s.currency,
            priceBreaks: breaks,
            factoryLeadTimeWeeks: lead,
            url: webUrl(p.productURL),
          },
        ],
      } satisfies AdapterPart;
    });
}

/** The search URL for one store. The docs' table names the key `callInfo.apiKey`, their examples `callinfo.apiKey`: both are sent. */
export function e14Url(store: string, term: string, apiKey: string, results = 5): string {
  const q = new URLSearchParams({
    term,
    "storeInfo.id": store,
    "resultsSettings.offset": "0",
    "resultsSettings.numberOfResults": String(results),
    "resultsSettings.responseGroup": "large",
    "callInfo.responseDataFormat": "JSON",
    "callInfo.apiKey": apiKey,
    "callinfo.apiKey": apiKey,
  });
  return `${BASE}?${q}`;
}

const apiKey = (key: AdapterKey) => (key === "newark" ? process.env.NEWARK_API_KEY || process.env.ELEMENT14_API_KEY : process.env.ELEMENT14_API_KEY) ?? "";

function storeAdapter(s: E14Store, envVars: string[], dailyLimit: number): SupplierAdapter {
  return {
    key: s.key,
    label: s.label,
    kind: "distributor",
    envVars,
    configured: () => !!apiKey(s.key),
    // The docs state no rate limit; two calls a second is a polite pace.
    perMinute: 60,
    dailyLimit,
    async searchMpn(mpn, signal) {
      const json = await fetchJson<E14Response>(s.key, e14Url(s.store, `manuPartNum:${mpn}`, apiKey(s.key)), { signal, headers: { Accept: "application/json" } });
      return parseE14Response(s.key, json, s);
    },
    async searchKeyword(query, signal) {
      const json = await fetchJson<E14Response>(s.key, e14Url(s.store, `any:${query}`, apiKey(s.key), 20), { signal, headers: { Accept: "application/json" } });
      return parseE14Response(s.key, json, s);
    },
  };
}

/** Newark (US). Same key as element14 unless a Newark key of its own is set. */
export const newarkAdapter = storeAdapter(
  { key: "newark", label: "Newark", store: process.env.NEWARK_STORE || "www.newark.com", sellerCode: "NEWARK", sellerName: "Newark", country: "US", currency: process.env.NEWARK_CURRENCY || "USD" },
  ["ELEMENT14_API_KEY"],
  Number(process.env.NEWARK_DAILY_LIMIT ?? 900),
);

const E14_STORE = process.env.ELEMENT14_STORE || "in.element14.com";
/** The store's country from its id ("in.element14.com" → IN, "sg.element14.com" → SG). */
const E14_COUNTRY = (E14_STORE.split(".")[0] || "in").toUpperCase();

/** element14 in the store set by ELEMENT14_STORE (India by default: in.element14.com, prices in INR). */
export const element14Adapter = storeAdapter(
  {
    key: "element14",
    label: "element14",
    store: E14_STORE,
    sellerCode: `E14-${E14_COUNTRY}`,
    sellerName: E14_COUNTRY === "IN" ? "element14 India (Farnell)" : `element14 ${E14_COUNTRY}`,
    country: E14_COUNTRY,
    currency: process.env.ELEMENT14_CURRENCY || (E14_COUNTRY === "IN" ? "INR" : "USD"),
  },
  ["ELEMENT14_API_KEY"],
  Number(process.env.ELEMENT14_DAILY_LIMIT ?? 900),
);
