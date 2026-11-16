import type { SupplierKind } from "@prisma/client";

export type SeedSupplier = {
  code: string;
  name: string;
  kind: SupplierKind;
  country: string;
  currency: string;
  adapter?: string;
  authorised: boolean;
  freightPct: number;
  website?: string;
  /** Share of catalogue this supplier lists (0–1) and its price multiplier vs. reference. */
  coverage: number;
  priceFactor: number;
  /** Stock depth multiplier. */
  depth: number;
};

export const SUPPLIERS: SeedSupplier[] = [
  // Internal (tiers 1–3) — stock lives in InventoryLot / ExcessListing; these rows identify the source.
  { code: "INT-STORES", name: "Our stores (Main + Dry store)", kind: "INTERNAL_STOCK", country: "IN", currency: "INR", adapter: "internal", authorised: true, freightPct: 0, coverage: 0, priceFactor: 1, depth: 1 },
  { code: "CONSIGNED", name: "Customer-consigned stock", kind: "CONSIGNED", country: "IN", currency: "INR", adapter: "internal", authorised: true, freightPct: 0, coverage: 0, priceFactor: 1, depth: 1 },
  { code: "OWN-EXCESS", name: "Own excess pool", kind: "OWN_EXCESS", country: "IN", currency: "INR", adapter: "internal", authorised: true, freightPct: 0, coverage: 0, priceFactor: 0.7, depth: 1 },
  { code: "PX-PUNE-EMS", name: "Partner EMS excess — Pune", kind: "PARTNER_EXCESS", country: "IN", currency: "INR", adapter: "excess-feed", authorised: false, freightPct: 0.5, coverage: 0, priceFactor: 0.65, depth: 1 },
  { code: "PX-BLR-OEM", name: "Partner OEM excess — Bengaluru", kind: "PARTNER_EXCESS", country: "IN", currency: "INR", adapter: "excess-feed", authorised: false, freightPct: 0.5, coverage: 0, priceFactor: 0.6, depth: 1 },
  // Authorised distributors (tier 4)
  { code: "DIGIKEY", name: "DigiKey", kind: "AUTHORISED", country: "US", currency: "USD", adapter: "digikey", authorised: true, freightPct: 3, website: "digikey.in", coverage: 0.95, priceFactor: 1.0, depth: 1.0 },
  { code: "MOUSER", name: "Mouser Electronics", kind: "AUTHORISED", country: "US", currency: "USD", adapter: "mouser", authorised: true, freightPct: 3, website: "mouser.in", coverage: 0.92, priceFactor: 1.02, depth: 0.9 },
  { code: "E14-IN", name: "element14 India (Farnell)", kind: "AUTHORISED", country: "IN", currency: "INR", adapter: "element14", authorised: true, freightPct: 1, website: "in.element14.com", coverage: 0.75, priceFactor: 1.08, depth: 0.5 },
  { code: "ARROW", name: "Arrow Electronics", kind: "AUTHORISED", country: "US", currency: "USD", adapter: "arrow", authorised: true, freightPct: 3, website: "arrow.com", coverage: 0.7, priceFactor: 0.97, depth: 1.3 },
  { code: "TME", name: "TME (Transfer Multisort Elektronik)", kind: "AUTHORISED", country: "PL", currency: "EUR", adapter: "tme", authorised: true, freightPct: 3.5, website: "tme.eu", coverage: 0.55, priceFactor: 1.05, depth: 0.4 },
  { code: "LCSC", name: "LCSC Electronics", kind: "AUTHORISED", country: "CN", currency: "USD", adapter: "lcsc", authorised: true, freightPct: 4, website: "lcsc.com", coverage: 0.6, priceFactor: 0.8, depth: 1.5 },
  { code: "ROBU", name: "Robu.in", kind: "AUTHORISED", country: "IN", currency: "INR", adapter: "csv-feed", authorised: false, freightPct: 0.5, website: "robu.in", coverage: 0.2, priceFactor: 1.35, depth: 0.1 },
  { code: "EVELTA", name: "Evelta Electronics", kind: "AUTHORISED", country: "IN", currency: "INR", adapter: "csv-feed", authorised: false, freightPct: 0.5, website: "evelta.com", coverage: 0.25, priceFactor: 1.25, depth: 0.15 },
  // Brokers (tier 5) — flagged counterfeit risk
  { code: "BRK-GLOBAL", name: "Global Component Brokers", kind: "BROKER", country: "HK", currency: "USD", adapter: "broker-feed", authorised: false, freightPct: 4, coverage: 0.15, priceFactor: 1.6, depth: 0.3 },
  { code: "BRK-SZ", name: "Shenzhen Spot Market Trader", kind: "BROKER", country: "CN", currency: "USD", adapter: "broker-feed", authorised: false, freightPct: 4, coverage: 0.12, priceFactor: 1.3, depth: 0.4 },
];

export const WAREHOUSES = [
  { code: "WH-MAIN", name: "Main stores", hasDryStorage: false },
  { code: "WH-DRY", name: "Dry store (MSL cabinets, <5% RH)", hasDryStorage: true },
];
