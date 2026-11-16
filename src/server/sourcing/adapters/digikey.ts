import { clientCredentialsToken, fetchJson } from "../http";
import { webUrl, mapLifecycle, mapMsl, mapReach, mapRohs, parseLeadWeeks, parseLocaleNumber } from "../normalise";
import type { AdapterPart, SupplierAdapter } from "../types";

/**
 * DigiKey Product Information API v4 (keyword search, exact matches first).
 * Docs: https://developer.digikey.com/products/product-information-v4
 */
const TOKEN_URL = "https://api.digikey.com/v1/oauth2/token";
const SEARCH_URL = "https://api.digikey.com/products/v4/search/keyword";

type DkPricing = { BreakQuantity?: number; UnitPrice?: number | string };
type DkVariation = {
  DigiKeyProductNumber?: string;
  PackageType?: { Name?: string } | null;
  StandardPricing?: DkPricing[] | null;
  QuantityAvailableforPackageType?: number | null;
  MinimumOrderQuantity?: number | null;
  StandardPackage?: number | null;
};
export type DkProduct = {
  ManufacturerProductNumber?: string;
  Manufacturer?: { Name?: string } | null;
  Description?: { ProductDescription?: string; DetailedDescription?: string } | null;
  QuantityAvailable?: number | null;
  ProductUrl?: string | null;
  DatasheetUrl?: string | null;
  PhotoUrl?: string | null;
  ProductStatus?: { Status?: string } | null;
  ManufacturerLeadWeeks?: string | number | null;
  Category?: { Name?: string } | null;
  Parameters?: { ParameterText?: string; ValueText?: string }[] | null;
  Classifications?: {
    RohsStatus?: string | null;
    ReachStatus?: string | null;
    MoistureSensitivityLevel?: string | null;
    ExportControlClassNumber?: string | null;
    HtsusCode?: string | null;
  } | null;
  ProductVariations?: DkVariation[] | null;
};
export type DkSearchResponse = { Products?: DkProduct[] | null; ExactMatches?: DkProduct[] | null; SearchLocaleUsed?: { Currency?: string } | null };

export function parseDigikeyProduct(p: DkProduct, currency: string): AdapterPart | null {
  const mpn = p.ManufacturerProductNumber?.trim();
  if (!mpn) return null;
  const lead = parseLeadWeeks(p.ManufacturerLeadWeeks ?? null);
  return {
    mpn,
    manufacturer: p.Manufacturer?.Name ?? "Unknown",
    description: p.Description?.DetailedDescription || p.Description?.ProductDescription || null,
    category: p.Category?.Name ?? null,
    lifecycle: mapLifecycle(p.ProductStatus?.Status),
    datasheetUrl: webUrl(p.DatasheetUrl),
    imageUrl: webUrl(p.PhotoUrl),
    rohs: mapRohs(p.Classifications?.RohsStatus),
    reach: mapReach(p.Classifications?.ReachStatus),
    msl: mapMsl(p.Classifications?.MoistureSensitivityLevel),
    eccn: p.Classifications?.ExportControlClassNumber ?? null,
    mfrLeadTimeWeeks: lead,
    params: Object.fromEntries((p.Parameters ?? []).filter((x) => x.ParameterText && x.ValueText).map((x) => [x.ParameterText!, x.ValueText!])),
    offers: (p.ProductVariations ?? [])
      .filter((v) => v.DigiKeyProductNumber)
      .map((v) => ({
        sellerName: "DigiKey",
        sellerCode: "DIGIKEY",
        authorised: true,
        country: "US",
        sku: v.DigiKeyProductNumber!,
        packaging: v.PackageType?.Name ?? null,
        stock: Math.max(0, v.QuantityAvailableforPackageType ?? 0),
        moq: Math.max(1, v.MinimumOrderQuantity ?? 1),
        spq: Math.max(1, v.StandardPackage ?? 1),
        currency,
        priceBreaks: (v.StandardPricing ?? [])
          .map((b) => ({ qty: b.BreakQuantity ?? 0, price: parseLocaleNumber(b.UnitPrice ?? null) ?? NaN }))
          .filter((b) => b.qty > 0 && Number.isFinite(b.price))
          .sort((a, b) => a.qty - b.qty),
        factoryLeadTimeWeeks: lead,
        url: p.ProductUrl ?? null,
      })),
  };
}

export function parseDigikeySearch(json: DkSearchResponse, currency: string): AdapterPart[] {
  const used = json.SearchLocaleUsed?.Currency || currency;
  const list = json.ExactMatches?.length ? json.ExactMatches : (json.Products ?? []);
  return list.map((p) => parseDigikeyProduct(p, used)).filter((p): p is AdapterPart => !!p);
}

/** Keyword search: exact MPN matches first, then the rest of the products, one entry per MPN. */
export function parseDigikeyKeyword(json: DkSearchResponse, currency: string): AdapterPart[] {
  const used = json.SearchLocaleUsed?.Currency || currency;
  const seen = new Set<string>();
  return [...(json.ExactMatches ?? []), ...(json.Products ?? [])]
    .map((p) => parseDigikeyProduct(p, used))
    .filter((p): p is AdapterPart => {
      if (!p || seen.has(p.mpn)) return false;
      seen.add(p.mpn);
      return true;
    });
}

function headers(token: string, clientId: string, currency: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "X-DIGIKEY-Client-Id": clientId,
    "X-DIGIKEY-Locale-Site": process.env.DIGIKEY_SITE ?? "IN",
    "X-DIGIKEY-Locale-Language": "en",
    "X-DIGIKEY-Locale-Currency": currency,
  };
}

export const digikeyAdapter: SupplierAdapter = {
  key: "digikey",
  label: "DigiKey",
  kind: "distributor",
  envVars: ["DIGIKEY_CLIENT_ID", "DIGIKEY_CLIENT_SECRET"],
  configured: () => !!(process.env.DIGIKEY_CLIENT_ID && process.env.DIGIKEY_CLIENT_SECRET),
  perMinute: 100,
  dailyLimit: Number(process.env.DIGIKEY_DAILY_LIMIT ?? 900),
  async searchMpn(mpn, signal) {
    const clientId = process.env.DIGIKEY_CLIENT_ID!;
    const token = await clientCredentialsToken("digikey", TOKEN_URL, { client_id: clientId, client_secret: process.env.DIGIKEY_CLIENT_SECRET! });
    const currency = process.env.DIGIKEY_CURRENCY ?? "INR";
    const json = await fetchJson<DkSearchResponse>("digikey", SEARCH_URL, {
      method: "POST",
      signal,
      headers: headers(token, clientId, currency),
      body: JSON.stringify({ Keywords: mpn, Limit: 5, Offset: 0 }),
    });
    return parseDigikeySearch(json, currency);
  },
  async searchKeyword(query, signal) {
    const clientId = process.env.DIGIKEY_CLIENT_ID!;
    const token = await clientCredentialsToken("digikey", TOKEN_URL, { client_id: clientId, client_secret: process.env.DIGIKEY_CLIENT_SECRET! });
    const currency = process.env.DIGIKEY_CURRENCY ?? "INR";
    const json = await fetchJson<DkSearchResponse>("digikey", SEARCH_URL, {
      method: "POST",
      signal,
      headers: headers(token, clientId, currency),
      body: JSON.stringify({ Keywords: query, Limit: 20, Offset: 0 }),
    });
    return parseDigikeyKeyword(json, currency);
  },
};
