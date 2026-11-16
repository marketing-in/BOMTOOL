/**
 * Price trends from price history. A trend only means something inside one consistent series: the same
 * seller, the same currency and the same market. Mixing them compares a simulated USD price with a live
 * INR one and reports a 20,000 % "rise".
 */

export type PricePoint = { supplierId: string | null; currency: string; unitPrice: number; recordedAt: Date };

const DAY = 86_400_000;

/**
 * Rows recorded once live distributor refreshes began are live; earlier ones come from the simulated
 * market (with real keys configured the simulator stops refreshing, so the two never interleave).
 */
export function isLive(p: Pick<PricePoint, "recordedAt">, liveSince: Date | null): boolean {
  return !!liveSince && p.recordedAt.getTime() >= liveSince.getTime();
}

export function seriesKey(p: PricePoint, liveSince: Date | null): string {
  return `${p.supplierId ?? "-"}|${p.currency}|${isLive(p, liveSince) ? "live" : "sim"}`;
}

/** Groups history into consistent series, oldest point first. */
export function priceSeries(points: PricePoint[], liveSince: Date | null): Map<string, PricePoint[]> {
  const groups = new Map<string, PricePoint[]>();
  for (const p of points) {
    const k = seriesKey(p, liveSince);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const list of groups.values()) list.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  return groups;
}

/**
 * % change of the best series over the window. Once any live data exists only live series count;
 * among those the one with the most points wins. Null when no series has two points in the window.
 */
export function priceTrendPct(points: PricePoint[], opts: { liveSince: Date | null; now?: Date; windowDays?: number }): number | null {
  const since = (opts.now ?? new Date()).getTime() - (opts.windowDays ?? 90) * DAY;
  const recent = points.filter((p) => p.recordedAt.getTime() >= since && p.unitPrice > 0);
  const anyLive = recent.some((p) => isLive(p, opts.liveSince));
  const pool = recent.filter((p) => isLive(p, opts.liveSince) === anyLive);
  const best = [...priceSeries(pool, opts.liveSince).values()].filter((s) => s.length > 1).sort((a, b) => b.length - a.length)[0];
  if (!best) return null;
  const first = best[0].unitPrice;
  return ((best.at(-1)!.unitPrice - first) / first) * 100;
}
