export type BuildQtyInput = {
  qtyPerBoard: number;
  buildQty: number;
  /** Line attrition / scrap allowance in percent (from package, overridden by category). */
  attritionPct: number;
  dnp?: boolean;
};

export type BuildQty = { base: number; attrition: number; required: number };

/** Parts the build consumes: qty/board × boards, plus attrition rounded up to whole parts. */
export function requiredQty({ qtyPerBoard, buildQty, attritionPct, dnp }: BuildQtyInput): BuildQty {
  if (dnp || qtyPerBoard <= 0 || buildQty <= 0) return { base: 0, attrition: 0, required: 0 };
  const base = Math.ceil(qtyPerBoard * buildQty);
  const attrition = Math.ceil((base * attritionPct) / 100);
  return { base, attrition, required: base + attrition };
}

/** Share of a reel above which we buy the whole reel (cut-tape premium + feeder setup make partials poor value). */
export const FULL_REEL_THRESHOLD = 0.6;

/**
 * Quantity to order from a supplier for a shortfall: at least MOQ, rounded up to full SPQ multiples
 * once the order is ≥ 60% of a reel. Returns 0 when nothing is short.
 */
export function purchaseQty(shortfall: number, moq = 1, spq = 1): number {
  if (shortfall <= 0) return 0;
  let qty = Math.max(shortfall, moq);
  if (spq > 1 && qty >= spq * FULL_REEL_THRESHOLD) qty = Math.ceil(qty / spq) * spq;
  return qty;
}
