import type { Lifecycle } from "@prisma/client";

export type OfferSnapshot = { unitInr: number | null; stock: number };
export type DetectedEvent = { kind: "PRICE_SPIKE" | "PRICE_DROP" | "STOCK_OUT" | "BACK_IN_STOCK"; data: Record<string, number | string | null> };

/** A move of at least this much in the unit price at the reference quantity is worth telling a buyer. */
export const PRICE_EVENT_PCT = 10;

export function detectOfferEvents(prev: OfferSnapshot | null, next: OfferSnapshot): DetectedEvent[] {
  if (!prev) return [];
  const out: DetectedEvent[] = [];
  if (prev.unitInr && next.unitInr) {
    const pct = ((next.unitInr - prev.unitInr) / prev.unitInr) * 100;
    if (pct >= PRICE_EVENT_PCT) out.push({ kind: "PRICE_SPIKE", data: { from: prev.unitInr, to: next.unitInr, pct: Math.round(pct * 10) / 10 } });
    else if (pct <= -PRICE_EVENT_PCT) out.push({ kind: "PRICE_DROP", data: { from: prev.unitInr, to: next.unitInr, pct: Math.round(pct * 10) / 10 } });
  }
  if (prev.stock > 0 && next.stock === 0) out.push({ kind: "STOCK_OUT", data: { from: prev.stock } });
  if (prev.stock === 0 && next.stock > 0) out.push({ kind: "BACK_IN_STOCK", data: { to: next.stock } });
  return out;
}

/** Lifecycle moves we report (any change except to/from UNKNOWN). */
export function lifecycleChanged(prev: Lifecycle, next: Lifecycle | null | undefined): next is Lifecycle {
  return !!next && next !== "UNKNOWN" && prev !== "UNKNOWN" && next !== prev;
}

/** Same order as the lifecycle score: ACTIVE is the least severe, OBSOLETE the most. */
const LIFECYCLE_SEVERITY: Record<Lifecycle, number> = { UNKNOWN: -1, ACTIVE: 0, NRND: 1, LAST_TIME_BUY: 2, EOL: 3, OBSOLETE: 4 };

export type LifecycleReport = { source: string; lifecycle: Lifecycle | null | undefined };

/**
 * One lifecycle per part per refresh. When sources disagree the most severe wins, so the status no
 * longer flips with the order adapters answer in. UNKNOWN and missing answers are ignored.
 * A step towards less severe needs every source to have answered (`complete`), so one failed call
 * can't bounce a part down and back up. `report` is false for UNKNOWN → known (filled in quietly).
 */
export function resolveLifecycle(
  prev: Lifecycle,
  reports: LifecycleReport[],
  opts: { complete: boolean } = { complete: true },
): { next: Lifecycle; sources: string[]; report: boolean } | null {
  const known = reports.filter((r): r is { source: string; lifecycle: Lifecycle } => !!r.lifecycle && r.lifecycle !== "UNKNOWN");
  if (!known.length) return null;
  const next = known.reduce<Lifecycle>((worst, r) => (LIFECYCLE_SEVERITY[r.lifecycle] > LIFECYCLE_SEVERITY[worst] ? r.lifecycle : worst), known[0].lifecycle);
  if (next === prev) return null;
  if (!opts.complete && LIFECYCLE_SEVERITY[next] < LIFECYCLE_SEVERITY[prev]) return null;
  return { next, sources: known.filter((r) => r.lifecycle === next).map((r) => r.source), report: lifecycleChanged(prev, next) };
}
