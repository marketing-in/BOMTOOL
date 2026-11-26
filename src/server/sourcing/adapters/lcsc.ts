import { createHash, randomBytes } from "node:crypto";
import { fetchJson } from "../http";
import { webUrl } from "../normalise";
import { AdapterError, type AdapterPart, type SupplierAdapter } from "../types";

/**
 * LCSC partner API. Access is by application to LCSC, who send an API key and a secret.
 * Docs: https://www.lcsc.com/docs/openapi/index.html — the search endpoint and its parameters are documented there:
 * GET https://ips.lcsc.com/rest/wmsc2agent/search/product?keyword=…&match_type=exact&current_page=1&page_size=…&currency=…
 * plus key, nonce, timestamp and signature on every call.
 *
 * NOT CONFIRMED: that page shows neither the signature recipe nor the response fields. The signature below is the
 * recipe LCSC gives partners (SHA-1 of "key=…&nonce=…&secret=…&timestamp=…", timestamp in seconds) and the fields
 * are read defensively. Check both against the documents LCSC sends with the key before relying on live data; until
 * a key is set, the mock market stands in for LCSC.
 */
const SEARCH_URL = "https://ips.lcsc.com/rest/wmsc2agent/search/product";

type LcscPrice = { ladder?: number; startNumber?: number; productPrice?: number | string; price?: number | string; usdPrice?: number | string; currencySymbol?: string };
type LcscProduct = {
  productCode?: string;
  productModel?: string;
  brandNameEn?: string;
  encapStandard?: string;
  productIntroEn?: string;
  productDescEn?: string;
  stockNumber?: number;
  stock?: number;
  minBuyNumber?: number;
  minPacketNumber?: number;
  productPriceList?: LcscPrice[] | null;
  prices?: LcscPrice[] | null;
  pdfUrl?: string;
  productUrl?: string;
  productImages?: string[] | null;
  isEnvironment?: boolean;
};
export type LcscResponse = { code?: number; success?: boolean; msg?: string; message?: string; result?: unknown; data?: unknown };

/** The product list, wherever the answer keeps it. */
function productsOf(json: LcscResponse): LcscProduct[] {
  for (const holder of [json.result, json.data]) {
    if (Array.isArray(holder)) return holder as LcscProduct[];
    if (holder && typeof holder === "object") {
      for (const k of ["productList", "product_list", "dataList", "list", "products"]) {
        const v = (holder as Record<string, unknown>)[k];
        if (Array.isArray(v)) return v as LcscProduct[];
      }
      if ((holder as LcscProduct).productCode) return [holder as LcscProduct];
    }
  }
  return [];
}

export function parseLcscResponse(json: LcscResponse, currency: string): AdapterPart[] {
  const failed = json.success === false || (typeof json.code === "number" && json.code !== 200 && json.code !== 0);
  if (failed) throw new AdapterError("lcsc", `${json.code ?? ""} ${json.msg ?? json.message ?? "request failed"}`.trim());
  return productsOf(json)
    .filter((p) => p.productModel && p.productCode)
    .map((p) => {
      const breaks = (p.productPriceList ?? p.prices ?? [])
        .map((b) => ({ qty: Number(b.ladder ?? b.startNumber ?? 0), price: Number(b.productPrice ?? b.price ?? b.usdPrice) }))
        .filter((b) => b.qty > 0 && Number.isFinite(b.price))
        .sort((a, b) => a.qty - b.qty);
      return {
        mpn: p.productModel!,
        manufacturer: p.brandNameEn ?? "Unknown",
        description: p.productIntroEn ?? p.productDescEn ?? null,
        datasheetUrl: webUrl(p.pdfUrl),
        imageUrl: webUrl(p.productImages?.[0]),
        rohs: p.isEnvironment === true ? "COMPLIANT" : null,
        params: p.encapStandard ? { Package: p.encapStandard } : undefined,
        offers: [
          {
            sellerName: "LCSC Electronics",
            sellerCode: "LCSC",
            authorised: true,
            country: "CN",
            sku: p.productCode!,
            packaging: null,
            stock: Math.max(0, Math.round(Number(p.stockNumber ?? p.stock ?? 0)) || 0),
            moq: Math.max(1, Number(p.minBuyNumber ?? 1) || 1),
            spq: Math.max(1, Number(p.minPacketNumber ?? 1) || 1),
            currency,
            priceBreaks: breaks,
            factoryLeadTimeWeeks: null,
            url: webUrl(p.productUrl) ?? `https://www.lcsc.com/product-detail/${encodeURIComponent(p.productCode!)}.html`,
          },
        ],
      } satisfies AdapterPart;
    });
}

/** The signed query LCSC asks for on every call (see the note above: the recipe is to confirm with LCSC's documents). */
export function lcscSigned(params: Record<string, string>, key: string, secret: string, now = Date.now(), nonce = randomBytes(8).toString("hex")): URLSearchParams {
  const timestamp = String(Math.floor(now / 1000));
  const signature = createHash("sha1").update(`key=${key}&nonce=${nonce}&secret=${secret}&timestamp=${timestamp}`).digest("hex");
  return new URLSearchParams({ ...params, key, nonce, timestamp, signature });
}

const currency = () => process.env.LCSC_CURRENCY || "USD";

async function search(keyword: string, matchType: "exact" | "fuzzy", pageSize: number, signal?: AbortSignal) {
  const q = lcscSigned({ keyword, match_type: matchType, current_page: "1", page_size: String(pageSize), currency: currency() }, process.env.LCSC_API_KEY!, process.env.LCSC_API_SECRET!);
  const json = await fetchJson<LcscResponse>("lcsc", `${SEARCH_URL}?${q}`, { signal, headers: { Accept: "application/json" } });
  return parseLcscResponse(json, currency());
}

export const lcscAdapter: SupplierAdapter = {
  key: "lcsc",
  label: "LCSC",
  kind: "distributor",
  envVars: ["LCSC_API_KEY", "LCSC_API_SECRET"],
  configured: () => !!process.env.LCSC_API_KEY && !!process.env.LCSC_API_SECRET,
  perMinute: 30,
  dailyLimit: Number(process.env.LCSC_DAILY_LIMIT ?? 900),
  searchMpn: (mpn, signal) => search(mpn, "exact", 10, signal),
  searchKeyword: (query, signal) => search(query, "fuzzy", 20, signal),
};
