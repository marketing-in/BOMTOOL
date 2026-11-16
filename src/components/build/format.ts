import { convert, formatMoney, formatMoneyCompact, type Currency } from "@/lib/currency";

/** INR amounts from the costing, shown in the display currency. */
export function moneyIn(currency: Currency) {
  const unit = (inr: number | null | undefined) => (inr === null || inr === undefined || !Number.isFinite(inr) ? "—" : formatMoney(convert(inr, "INR", currency), currency, { unit: true }));
  const whole = (inr: number | null | undefined) => (inr === null || inr === undefined || !Number.isFinite(inr) ? "—" : formatMoney(convert(inr, "INR", currency), currency));
  const compact = (inr: number) => formatMoneyCompact(convert(inr, "INR", currency), currency);
  return { unit, whole, compact };
}

export const qtyLabel = (q: number) => `${q.toLocaleString("en-IN")} pcs`;
