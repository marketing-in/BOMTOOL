import type { PriceBreak } from "@/lib/currency";
import { clientCredentialsToken, fetchJson } from "../http";
import { webUrl, mapLifecycle, mapRohs } from "../normalise";
import { AdapterError, type AdapterOffer, type AdapterPart, type SupplierAdapter } from "../types";

/**
 * Nexar Supply (Octopart data): one call returns offers from many sellers.
 * Docs: https://support.nexar.com/support/solutions/articles/101000471937 (Supply queries)
 */
const TOKEN_URL = "https://identity.nexar.com/connect/token";
const API_URL = "https://api.nexar.com/graphql";

export const NEXAR_QUERY = /* GraphQL */ `
  query EmsSearchMpn($q: String!, $limit: Int!, $country: String!, $currency: String!) {
    supSearchMpn(q: $q, limit: $limit, country: $country, currency: $currency) {
      hits
      results {
        part {
          mpn
          shortDescription
          manufacturer { name }
          category { name }
          bestDatasheet { url }
          bestImage { url }
          specs { attribute { shortname name } displayValue }
          sellers(authorizedOnly: false) {
            company { name }
            isAuthorized
            country
            offers {
              sku
              inventoryLevel
              moq
              packaging
              factoryLeadDays
              clickUrl
              prices { quantity price currency convertedPrice convertedCurrency }
            }
          }
        }
      }
    }
  }
`;

type NexarPrice = { quantity: number; price: number; currency: string; convertedPrice?: number | null; convertedCurrency?: string | null };
type NexarOffer = {
  sku?: string | null;
  inventoryLevel?: number | null;
  moq?: number | null;
  packaging?: string | null;
  factoryLeadDays?: number | null;
  clickUrl?: string | null;
  prices?: NexarPrice[] | null;
};
type NexarSeller = { company?: { name?: string | null } | null; isAuthorized?: boolean | null; country?: string | null; offers?: NexarOffer[] | null };
type NexarPart = {
  mpn: string;
  shortDescription?: string | null;
  manufacturer?: { name?: string | null } | null;
  category?: { name?: string | null } | null;
  bestDatasheet?: { url?: string | null } | null;
  bestImage?: { url?: string | null } | null;
  specs?: { attribute?: { shortname?: string | null; name?: string | null } | null; displayValue?: string | null }[] | null;
  sellers?: NexarSeller[] | null;
};
export type NexarResponse = {
  data?: { supSearchMpn?: { hits?: number; results?: { part?: NexarPart | null }[] | null } | null } | null;
  errors?: { message: string }[];
};

/** Prefer prices already converted to the requested currency; else the seller's own currency. */
function pickBreaks(prices: NexarPrice[], want: string): { currency: string; breaks: PriceBreak[] } | null {
  const converted = prices.filter((p) => p.convertedCurrency === want && typeof p.convertedPrice === "number");
  if (converted.length) {
    return { currency: want, breaks: converted.map((p) => ({ qty: p.quantity, price: p.convertedPrice! })).sort((a, b) => a.qty - b.qty) };
  }
  if (!prices.length) return null;
  const currency = prices.find((p) => p.currency === want)?.currency ?? prices[0].currency;
  return { currency, breaks: prices.filter((p) => p.currency === currency).map((p) => ({ qty: p.quantity, price: p.price })).sort((a, b) => a.qty - b.qty) };
}

export function parseNexarResponse(json: NexarResponse, currency = "INR"): AdapterPart[] {
  if (json.errors?.length) throw new AdapterError("nexar", json.errors.map((e) => e.message).join("; "));
  const results = json.data?.supSearchMpn?.results ?? [];
  return results
    .map((r) => r.part)
    .filter((p): p is NexarPart => !!p?.mpn)
    .map((p) => {
      const spec = (short: string) => p.specs?.find((s) => s.attribute?.shortname === short)?.displayValue ?? null;
      const offers: AdapterOffer[] = [];
      for (const seller of p.sellers ?? []) {
        const sellerName = seller.company?.name?.trim();
        if (!sellerName) continue;
        for (const o of seller.offers ?? []) {
          const picked = pickBreaks(o.prices ?? [], currency);
          offers.push({
            sellerName,
            authorised: !!seller.isAuthorized,
            country: seller.country ?? null,
            sku: o.sku || `${sellerName}:${p.mpn}`,
            packaging: o.packaging ?? null,
            stock: Math.max(0, o.inventoryLevel ?? 0),
            moq: Math.max(1, o.moq ?? 1),
            spq: 1,
            currency: picked?.currency ?? currency,
            priceBreaks: picked?.breaks ?? [],
            factoryLeadTimeWeeks: o.factoryLeadDays ? Math.ceil(o.factoryLeadDays / 7) : null,
            url: o.clickUrl ?? null,
          });
        }
      }
      return {
        mpn: p.mpn,
        manufacturer: p.manufacturer?.name ?? "Unknown",
        description: p.shortDescription ?? null,
        category: p.category?.name ?? null,
        lifecycle: mapLifecycle(spec("lifecyclestatus")),
        rohs: mapRohs(spec("rohs")),
        datasheetUrl: webUrl(p.bestDatasheet?.url),
        imageUrl: webUrl(p.bestImage?.url),
        params: Object.fromEntries((p.specs ?? []).filter((s) => s.attribute?.name && s.displayValue).map((s) => [s.attribute!.name!, s.displayValue!])),
        offers,
      };
    });
}

export const nexarAdapter: SupplierAdapter = {
  key: "nexar",
  label: "Nexar / Octopart",
  kind: "aggregator",
  envVars: ["NEXAR_CLIENT_ID", "NEXAR_CLIENT_SECRET"],
  configured: () => !!(process.env.NEXAR_CLIENT_ID && process.env.NEXAR_CLIENT_SECRET),
  perMinute: 30,
  dailyLimit: Number(process.env.NEXAR_DAILY_LIMIT ?? 30),
  async searchMpn(mpn, signal) {
    const token = await clientCredentialsToken("nexar", TOKEN_URL, {
      client_id: process.env.NEXAR_CLIENT_ID!,
      client_secret: process.env.NEXAR_CLIENT_SECRET!,
      scope: "supply.domain",
    });
    const currency = process.env.SOURCING_CURRENCY ?? "INR";
    const json = await fetchJson<NexarResponse>("nexar", API_URL, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: NEXAR_QUERY, variables: { q: mpn, limit: 3, country: "IN", currency } }),
    });
    return parseNexarResponse(json, currency);
  },
};
