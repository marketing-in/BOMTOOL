export const CURRENCIES = ["INR", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: string | undefined | null): value is Currency {
  return !!value && (CURRENCIES as readonly string[]).includes(value);
}

/** Rates expressed as "1 unit of currency = N INR". */
export type FxTable = { base: "INR"; rates: Record<string, number>; asOf: string; source: string };

export interface FxProvider {
  name: string;
  getRates(): Promise<FxTable>;
}

/** Offline fallback used when no FX_API_URL is configured. Update periodically. */
export const MOCK_FX: FxTable = {
  base: "INR",
  rates: { INR: 1, USD: 88.2, EUR: 102.6, GBP: 117.4, JPY: 0.59, CNY: 12.35, SGD: 68.4 },
  asOf: "2026-10-01",
  source: "mock",
};

export const mockFxProvider: FxProvider = {
  name: "mock",
  async getRates() {
    return MOCK_FX;
  },
};

/**
 * Rates used by convert() when none are passed. The server swaps in live rates (see
 * src/server/fx.ts); anything that runs before that, or offline, uses MOCK_FX.
 */
let activeFx: FxTable = MOCK_FX;
export function setActiveFx(fx: FxTable) {
  activeFx = fx;
}
export function getActiveFx(): FxTable {
  return activeFx;
}

/**
 * Normalises a typical FX API response ({ base | base_code, rates: { XYZ: units per 1 base } },
 * e.g. open.er-api.com or exchangerate.host) to "1 unit = N INR". Returns null if INR is missing.
 */
export function parseFxResponse(json: unknown, source: string, asOf = new Date()): FxTable | null {
  if (!json || typeof json !== "object") return null;
  const o = json as { base?: string; base_code?: string; rates?: Record<string, number>; conversion_rates?: Record<string, number> };
  const rates = o.rates ?? o.conversion_rates;
  if (!rates || typeof rates.INR !== "number" || rates.INR <= 0) return null;
  const out: Record<string, number> = {};
  for (const [code, perBase] of Object.entries(rates)) {
    if (typeof perBase === "number" && perBase > 0) out[code] = rates.INR / perBase;
  }
  out.INR = 1;
  return { base: "INR", rates: out, asOf: asOf.toISOString().slice(0, 10), source };
}

export function convert(amount: number, from: string, to: string, fx: FxTable = activeFx): number {
  if (from === to) return amount;
  const fromRate = fx.rates[from];
  const toRate = fx.rates[to];
  if (fromRate === undefined || toRate === undefined) {
    throw new Error(`No FX rate for ${from}→${to}`);
  }
  return (amount * fromRate) / toRate;
}

const LOCALE: Record<Currency, string> = { INR: "en-IN", USD: "en-US", EUR: "de-DE" };

/** Formats money; unit prices below 1 keep up to 4 decimals so passives stay readable. */
export function formatMoney(amount: number, currency: Currency, opts: { unit?: boolean } = {}): string {
  const small = opts.unit && Math.abs(amount) < 1;
  return new Intl.NumberFormat(LOCALE[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: small ? 2 : 0,
    maximumFractionDigits: small ? 4 : 2,
  }).format(amount);
}

/** Compact form for dashboards: ₹12.4L, ₹1.2Cr, $45.1K. */
export function formatMoneyCompact(amount: number, currency: Currency): string {
  if (currency === "INR") {
    const abs = Math.abs(amount);
    if (abs >= 1e7) return `₹${(amount / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `₹${(amount / 1e5).toFixed(2)}L`;
    return formatMoney(amount, "INR");
  }
  return new Intl.NumberFormat(LOCALE[currency], {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export type PriceBreak = { qty: number; price: number };

/** Unit price for a quantity from sorted price breaks (highest break ≤ qty, else first break). */
export function priceAtQty(breaks: PriceBreak[], qty: number): number | null {
  if (!breaks.length) return null;
  let price = breaks[0].price;
  for (const b of breaks) {
    if (qty >= b.qty) price = b.price;
    else break;
  }
  return price;
}
