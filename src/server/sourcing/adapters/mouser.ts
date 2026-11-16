import { fetchJson } from "../http";
import { webUrl, mapLifecycle, mapRohs, parseLeadWeeks, parseLocaleNumber } from "../normalise";
import { AdapterError, type AdapterPart, type SupplierAdapter } from "../types";

/**
 * Mouser Search API v1, part-number search.
 * Docs: https://api.mouser.com/api/docs/ui/index
 */
const SEARCH_URL = "https://api.mouser.com/api/v1/search/partnumber";
const KEYWORD_URL = "https://api.mouser.com/api/v1/search/keyword";

type MouserPart = {
  ManufacturerPartNumber?: string;
  Manufacturer?: string;
  MouserPartNumber?: string;
  Description?: string;
  Category?: string;
  DataSheetUrl?: string;
  ImagePath?: string | null;
  ProductDetailUrl?: string;
  LifecycleStatus?: string | null;
  LeadTime?: string | null;
  Availability?: string | null;
  AvailabilityInStock?: string | null;
  Min?: string | number | null;
  Mult?: string | number | null;
  ROHSStatus?: string | null;
  PriceBreaks?: { Quantity?: number; Price?: string; Currency?: string }[] | null;
  ProductCompliance?: { ComplianceName?: string; ComplianceValue?: string }[] | null;
};
export type MouserResponse = {
  Errors?: { Message?: string; Code?: string }[] | null;
  SearchResults?: { NumberOfResult?: number; Parts?: MouserPart[] | null } | null;
};

export function parseMouserResponse(json: MouserResponse): AdapterPart[] {
  if (json.Errors?.length) throw new AdapterError("mouser", json.Errors.map((e) => e.Message ?? e.Code).join("; "));
  return (json.SearchResults?.Parts ?? [])
    .filter((p) => p.ManufacturerPartNumber && p.MouserPartNumber)
    .map((p) => {
      const stock = parseLocaleNumber(p.AvailabilityInStock ?? null) ?? parseLocaleNumber(p.Availability?.match(/[\d.,]+/)?.[0] ?? null) ?? 0;
      const breaks = (p.PriceBreaks ?? [])
        .map((b) => ({ qty: b.Quantity ?? 0, price: parseLocaleNumber(b.Price ?? null) ?? NaN, currency: b.Currency }))
        .filter((b) => b.qty > 0 && Number.isFinite(b.price))
        .sort((a, b) => a.qty - b.qty);
      const compliance = (name: string) => p.ProductCompliance?.find((c) => c.ComplianceName === name)?.ComplianceValue ?? null;
      const lead = parseLeadWeeks(p.LeadTime ?? null);
      return {
        mpn: p.ManufacturerPartNumber!,
        manufacturer: p.Manufacturer ?? "Unknown",
        description: p.Description ?? null,
        category: p.Category ?? null,
        lifecycle: mapLifecycle(p.LifecycleStatus) ?? null,
        datasheetUrl: webUrl(p.DataSheetUrl),
        imageUrl: webUrl(p.ImagePath),
        rohs: mapRohs(p.ROHSStatus),
        eccn: compliance("ECCN"),
        mfrLeadTimeWeeks: lead,
        offers: [
          {
            sellerName: "Mouser Electronics",
            sellerCode: "MOUSER",
            authorised: true,
            country: "US",
            sku: p.MouserPartNumber!,
            packaging: null,
            stock: Math.round(stock),
            moq: Math.max(1, parseLocaleNumber(p.Min ?? null) ?? 1),
            spq: Math.max(1, parseLocaleNumber(p.Mult ?? null) ?? 1),
            currency: breaks[0]?.currency ?? process.env.MOUSER_CURRENCY ?? "USD",
            priceBreaks: breaks.map(({ qty, price }) => ({ qty, price })),
            factoryLeadTimeWeeks: lead,
            url: p.ProductDetailUrl ?? null,
          },
        ],
      };
    });
}

export const mouserAdapter: SupplierAdapter = {
  key: "mouser",
  label: "Mouser",
  kind: "distributor",
  envVars: ["MOUSER_API_KEY"],
  configured: () => !!process.env.MOUSER_API_KEY,
  // Mouser allows 30 calls a minute. The bucket starts full and refills as it drains, so a burst can reach twice
  // this number in its first minute: 14 keeps even that under the limit.
  perMinute: 14,
  dailyLimit: Number(process.env.MOUSER_DAILY_LIMIT ?? 900),
  async searchMpn(mpn, signal) {
    const url = `${SEARCH_URL}?apiKey=${encodeURIComponent(process.env.MOUSER_API_KEY!)}`;
    const json = await fetchJson<MouserResponse>("mouser", url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ SearchByPartRequest: { mouserPartNumber: mpn, partSearchOptions: "Exact" } }),
    });
    return parseMouserResponse(json);
  },
  async searchKeyword(query, signal) {
    const url = `${KEYWORD_URL}?apiKey=${encodeURIComponent(process.env.MOUSER_API_KEY!)}`;
    const json = await fetchJson<MouserResponse>("mouser", url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ SearchByKeywordRequest: { keyword: query, records: 20, startingRecord: 0, searchOptions: "None", searchWithYourSignUpLanguage: "false" } }),
    });
    return parseMouserResponse(json);
  },
};
