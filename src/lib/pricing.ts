import { convert, getActiveFx, priceAtQty, type Currency, type FxTable, type PriceBreak } from "@/lib/currency";

export type OfferLike = {
  supplierId: string;
  currency: string;
  stock: number;
  moq: number;
  priceBreaks: unknown;
};

export function readBreaks(value: unknown): PriceBreak[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((b): b is PriceBreak => typeof b?.qty === "number" && typeof b?.price === "number")
    .sort((a, b) => a.qty - b.qty);
}

/**
 * Cheapest in-stock offer for a quantity, in the display currency.
 * Falls back to the cheapest offer ignoring stock when nobody has enough.
 */
export function bestOffer<T extends OfferLike>(
  offers: T[],
  qty: number,
  currency: Currency,
  // Same rates as convert(): live once the server has loaded them, the offline table before that.
  fx: FxTable = getActiveFx(),
): { offer: T; unit: number; inStock: boolean } | null {
  let best: { offer: T; unit: number; inStock: boolean } | null = null;
  for (const offer of offers) {
    const unitNative = priceAtQty(readBreaks(offer.priceBreaks), Math.max(qty, offer.moq));
    if (unitNative === null) continue;
    const unit = convert(unitNative, offer.currency, currency, fx);
    const inStock = offer.stock >= qty;
    const better = !best || (inStock && !best.inStock) || (inStock === best.inStock && unit < best.unit);
    if (better) best = { offer, unit, inStock };
  }
  return best;
}
