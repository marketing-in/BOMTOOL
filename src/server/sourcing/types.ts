import type { Lifecycle, Msl, ReachStatus, RohsStatus } from "@prisma/client";
import type { PriceBreak } from "@/lib/currency";

export type AdapterKey = "nexar" | "digikey" | "mouser" | "newark" | "element14" | "lcsc" | "mock";

/** One seller's offer as reported by an adapter (prices in the offer's own currency). */
export type AdapterOffer = {
  sellerName: string;
  /** Our Supplier.code when the adapter *is* the seller (DigiKey, Mouser); aggregators leave it empty. */
  sellerCode?: string;
  authorised: boolean;
  country?: string | null;
  sku: string;
  packaging?: string | null;
  stock: number;
  moq: number;
  spq: number;
  currency: string;
  priceBreaks: PriceBreak[];
  factoryLeadTimeWeeks: number | null;
  url?: string | null;
};

export type AdapterPart = {
  mpn: string;
  manufacturer: string;
  description: string | null;
  category?: string | null;
  lifecycle?: Lifecycle | null;
  datasheetUrl?: string | null;
  /** Product photo (distributor CDN), https only. */
  imageUrl?: string | null;
  rohs?: RohsStatus | null;
  reach?: ReachStatus | null;
  msl?: Msl | null;
  hsn?: string | null;
  eccn?: string | null;
  mfrLeadTimeWeeks?: number | null;
  params?: Record<string, string>;
  offers: AdapterOffer[];
};

export interface SupplierAdapter {
  key: AdapterKey;
  label: string;
  kind: "aggregator" | "distributor" | "mock";
  /** Env vars that must be set for the adapter to run. */
  envVars: string[];
  configured(): boolean;
  perMinute: number;
  dailyLimit: number;
  searchMpn(mpn: string, signal?: AbortSignal): Promise<AdapterPart[]>;
  /** Free-text search ("LDO 3.3V SOT-23", "TPS54331") for the parts directory; up to ~20 parts. */
  searchKeyword?(query: string, signal?: AbortSignal): Promise<AdapterPart[]>;
}

export class AdapterError extends Error {
  constructor(
    readonly adapter: AdapterKey,
    message: string,
    readonly status?: number,
  ) {
    super(`${adapter}: ${message}`);
  }
}
