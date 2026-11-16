/**
 * Ranking what the components step shows — the BoM's lines, and the places one line can be bought from — by lead
 * time, price, risk or stock, low to high or high to low. "order" leaves things as the plant lists them (BoM line
 * order; sources by tier). Pure: the page gives the figures, this decides the order.
 */

export type RankKey = "lead" | "price" | "risk" | "stock";
export type SortKey = RankKey | "order";
export type Dir = "asc" | "desc";

export const SORT: Record<SortKey, { label: string; asc: string; desc: string; first: Dir }> = {
  order: { label: "BoM order", asc: "", desc: "", first: "asc" },
  lead: { label: "Lead time", asc: "shortest first", desc: "longest first", first: "asc" },
  price: { label: "Price", asc: "lowest first", desc: "highest first", first: "asc" },
  risk: { label: "Risk", asc: "lowest first", desc: "highest first", first: "asc" },
  stock: { label: "Stock", asc: "least first", desc: "most first", first: "desc" },
};

export const SORT_KEYS = Object.keys(SORT) as SortKey[];

export const readSort = (v: unknown): SortKey => (typeof v === "string" && v in SORT ? (v as SortKey) : "order");
/** The direction asked for, or the one the figure reads best in: most stock first, the lowest of the others. */
export const readDir = (v: unknown, key: SortKey): Dir => (v === "asc" || v === "desc" ? v : SORT[key].first);

/** What one line or one source is ranked on. A figure we don't know is null. */
export type Figures = {
  /** Weeks until the parts are here; 0 is on a shelf. */
  lead: number | null;
  price: number | null;
  risk: number | null;
  stock: number | null;
  /** False for what cannot be taken at all (a source with no stock, a line that isn't placed): always last. */
  usable?: boolean;
};

/** Among equals on the ranked figure, the better of the others goes first — whatever the direction. Two sources
 * both on a shelf: ours (no risk) before a seller's, which still has to ship. */
const TIES: Record<RankKey, RankKey[]> = {
  lead: ["risk", "price"],
  price: ["lead", "risk"],
  risk: ["lead", "price"],
  stock: ["price", "lead"],
};

const known = (v: number | null): v is number => v !== null && Number.isFinite(v);

/**
 * Orders items by one figure. Unusable items, then items whose figure is unknown, go to the bottom in either
 * direction; ties keep the order they came in.
 */
export function rank<T>(items: readonly T[], figures: (item: T) => Figures, key: RankKey, dir: Dir = SORT[key].first): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return items
    .map((item, i) => ({ item, f: figures(item), i }))
    .sort((a, b) => {
      const usable = Number(b.f.usable !== false) - Number(a.f.usable !== false);
      if (usable) return usable;
      const x = a.f[key];
      const y = b.f[key];
      if (known(x) !== known(y)) return known(x) ? -1 : 1;
      if (known(x) && known(y) && x !== y) return (x - y) * sign;
      for (const t of TIES[key]) {
        const p = a.f[t];
        const q = b.f[t];
        if (known(p) !== known(q)) return known(p) ? -1 : 1;
        // Less is better for lead, price and risk; stock is never a tie-breaker.
        if (known(p) && known(q) && p !== q) return p - q;
      }
      return a.i - b.i;
    })
    .map((x) => x.item);
}

/** How far along its bar a figure sits, 0–1 of the largest known one (for the bar beside the ranked figure). */
export function share(value: number | null, all: (number | null)[]): number {
  if (!known(value)) return 0;
  const max = Math.max(0, ...all.filter(known));
  return max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
}
