import { convert, getActiveFx, type FxTable } from "@/lib/currency";

export type DutyRate = { prefix: string; description?: string; bcdPct: number; swsPct: number; igstPct: number; note?: string | null };

/** Longest HSN-prefix match; null when nothing matches. */
export function findDutyRate(hsn: string | null | undefined, rates: DutyRate[]): DutyRate | null {
  const code = (hsn ?? "").replace(/\D/g, "");
  if (!code) return null;
  let best: DutyRate | null = null;
  for (const r of rates) {
    if (r.prefix && code.startsWith(r.prefix) && (!best || r.prefix.length > best.prefix.length)) best = r;
  }
  return best;
}

export type LandedInput = {
  unitPrice: number;
  currency: string;
  qty: number;
  /** Supplier ship-from country (ISO-2). "IN" = domestic purchase. */
  originCountry: string | null;
  hsn: string | null;
  rates: DutyRate[];
  /** Freight as % of goods value (supplier default) unless freightTotal is given. */
  freightPct?: number;
  /** Freight for this line, in the purchase currency. */
  freightTotal?: number;
  /** Insurance % of goods for customs valuation when actual insurance is unknown (Indian rule: 1.125 %). */
  insurancePct?: number;
  /** GST on domestic purchases. */
  gstPct?: number;
  /** Rate used when the HSN has no match. */
  fallback?: DutyRate;
  fx?: FxTable;
};

export type LandedCost = {
  domestic: boolean;
  qty: number;
  goods: number;
  freight: number;
  insurance: number;
  assessableValue: number;
  bcd: number;
  sws: number;
  igst: number;
  gst: number;
  /** Everything paid, INR. */
  total: number;
  /** IGST/GST we can claim back as input tax credit. */
  creditable: number;
  /** What the part really costs us after input credit — the number to compare suppliers on. */
  netTotal: number;
  netPerUnit: number;
  grossPerUnit: number;
  duty: DutyRate | null;
  dutyAssumed: boolean;
  fxRate: number; // INR per 1 unit of purchase currency
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Landed cost in INR.
 * Import:   AV = goods + freight + insurance;  BCD = AV × bcd;  SWS = BCD × sws;
 *           IGST = (AV + BCD + SWS) × igst;    total = AV + BCD + SWS + IGST;  IGST is creditable.
 * Domestic: GST = (goods + freight) × gst;     total = goods + freight + GST;  GST is creditable.
 */
export function landedCost(i: LandedInput): LandedCost {
  const fx = i.fx ?? getActiveFx();
  const fxRate = convert(1, i.currency, "INR", fx);
  const qty = Math.max(0, i.qty);
  const goods = i.unitPrice * qty * fxRate;
  const freight = i.freightTotal !== undefined ? i.freightTotal * fxRate : goods * ((i.freightPct ?? 0) / 100);
  const domestic = (i.originCountry ?? "").toUpperCase() === "IN";

  if (domestic) {
    const gst = (goods + freight) * ((i.gstPct ?? 18) / 100);
    const total = goods + freight + gst;
    const netTotal = total - gst;
    return {
      domestic, qty, goods: round2(goods), freight: round2(freight), insurance: 0, assessableValue: 0, bcd: 0, sws: 0, igst: 0,
      gst: round2(gst), total: round2(total), creditable: round2(gst), netTotal: round2(netTotal),
      netPerUnit: qty ? netTotal / qty : 0, grossPerUnit: qty ? total / qty : 0, duty: null, dutyAssumed: false, fxRate,
    };
  }

  const matched = findDutyRate(i.hsn, i.rates);
  const duty = matched ?? i.fallback ?? null;
  const insurance = goods * ((i.insurancePct ?? 1.125) / 100);
  const av = goods + freight + insurance;
  const bcd = av * ((duty?.bcdPct ?? 0) / 100);
  const sws = bcd * ((duty?.swsPct ?? 10) / 100);
  const igst = (av + bcd + sws) * ((duty?.igstPct ?? 18) / 100);
  const total = av + bcd + sws + igst;
  const netTotal = total - igst;
  return {
    domestic, qty, goods: round2(goods), freight: round2(freight), insurance: round2(insurance), assessableValue: round2(av),
    bcd: round2(bcd), sws: round2(sws), igst: round2(igst), gst: 0, total: round2(total), creditable: round2(igst),
    netTotal: round2(netTotal), netPerUnit: qty ? netTotal / qty : 0, grossPerUnit: qty ? total / qty : 0,
    duty, dutyAssumed: !matched, fxRate,
  };
}
