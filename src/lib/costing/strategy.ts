/**
 * Ways to source the components of a build. The plant's own order is our stock → partners → distributors →
 * marketplace; a strategy re-orders every line's sources instead — by lowest price, shortest lead time or lowest
 * supply risk — and the line is then filled from the top of that order until its need is covered. The quote's
 * analysis (src/server/bom-pipeline.ts) and the comparison shown before choosing use the same order. Pure.
 */

export type StrategyKey = "price" | "lead" | "risk";
export type OrderKey = StrategyKey | "order";

export const STRATEGY: Record<OrderKey, { label: string; picks: string }> = {
  order: { label: "Our sourcing order", picks: "Our stores first, then partners, authorised distributors, and the open market last." },
  price: { label: "Lowest price", picks: "The cheapest landed price on every line, wherever it comes from." },
  lead: { label: "Shortest lead time", picks: "Whatever is on a shelf soonest: our stores first, then the fastest seller." },
  risk: { label: "Lowest risk", picks: "Our stores, then authorised distributors with a certificate; brokers only when nobody else has stock." },
};

export const isStrategy = (v: unknown): v is StrategyKey => v === "price" || v === "lead" || v === "risk";

/** One place a line could be bought from, priced for the quantity the build needs. */
export type Candidate = {
  tier: number;
  kind: string;
  source: string;
  available: number;
  /** Landed unit cost at the build's need; null when nothing gives the source a price. */
  unit: number | null;
  /** Weeks until the build's need is here from this source: 0 when it covers the need from stock, else its quoted or factory lead. */
  leadWeeks: number | null;
  coc: boolean;
  condition: string;
  offerId: string | null;
  excessListingId: string | null;
};

type SourceRef = Pick<Candidate, "tier" | "offerId" | "excessListingId">;

export type StrategyLine = {
  id: string;
  label: string;
  /** Parts the build needs on this line, attrition included. */
  required: number;
  candidates: Candidate[];
  /** The source the current quote takes most of this line from, if any. */
  current: SourceRef | null;
};

/**
 * How exposed a source is: 0 our own shelf, 1 an authorised seller, 2–4 partner and excess stock by paperwork and
 * condition, 5 a broker.
 */
export function sourceRisk(c: Pick<Candidate, "tier" | "kind" | "coc" | "condition">): number {
  if (c.tier <= 2) return 0;
  if (c.kind === "AUTHORISED" || c.kind === "MANUFACTURER") return c.coc ? 1 : 1.5;
  if (c.kind === "BROKER") return 5;
  return 2 + (c.coc ? 0 : 1) + (c.condition === "NEW_FACTORY_SEALED" ? 0 : 1);
}

export type Band = "ours" | "authorised" | "open" | "broker";
export const RISK_BAND = (r: number): Band => (r === 0 ? "ours" : r < 2 ? "authorised" : r < 5 ? "open" : "broker");

const lead = (c: Candidate) => (c.tier <= 2 ? 0 : (c.leadWeeks ?? Infinity));
const price = (c: Candidate) => c.unit ?? Infinity;
const tier = (c: Candidate) => c.tier;

const KEYS: Record<OrderKey, ((c: Candidate) => number)[]> = {
  order: [tier, price],
  price: [price, lead, sourceRisk],
  // Equally fast: the safer source first, so our shelf leads a seller's stock (as the per-line ranking, rank.ts).
  lead: [lead, sourceRisk, price],
  risk: [sourceRisk, lead, price],
};

/** Sorts sources into the order a line is filled in. Ties keep their existing order. */
export function compareSources(key: OrderKey) {
  return (a: Candidate, b: Candidate) => {
    for (const f of KEYS[key]) {
      const x = f(a);
      const y = f(b);
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  };
}

/** Fills one line from its sources in the strategy's order. */
export function fill(key: OrderKey, line: Pick<StrategyLine, "required" | "candidates">) {
  const sorted = line.candidates.filter((c) => c.available > 0 && c.unit !== null).sort(compareSources(key));
  const used: { c: Candidate; qty: number }[] = [];
  let remaining = line.required;
  for (const c of sorted) {
    if (remaining <= 0) break;
    const qty = Math.min(remaining, c.available);
    used.push({ c, qty });
    remaining -= qty;
  }
  return { used, short: Math.max(0, remaining), cost: used.reduce((s, u) => s + u.qty * u.c.unit!, 0) };
}

const same = (a: SourceRef | null, b: SourceRef) => !!a && (b.offerId ? a.offerId === b.offerId : b.excessListingId ? a.excessListingId === b.excessListingId : a.tier <= 2 && !a.offerId && !a.excessListingId);

export type StrategyResult = {
  key: OrderKey;
  label: string;
  picks: string;
  /** Components for one board, landed. An estimate: left-overs from minimum order quantities are not in it. */
  perBoard: number;
  /** The slowest source used sets the wait, weeks. */
  leadWeeks: number;
  slowest: { label: string; source: string } | null;
  /** Lines by where most of their parts come from. */
  mix: Record<Band, number>;
  /** Lines that need more than one source. */
  split: number;
  /** Lines no source covers in full: the rest waits for the factory. */
  short: number;
  /** Lines whose main source is not the one the quote uses now. */
  changes: number;
};

export function compareStrategies(lines: StrategyLine[], buildQty: number): StrategyResult[] {
  const boards = Math.max(1, buildQty);
  return (Object.keys(STRATEGY) as OrderKey[]).map((key) => {
    const r: StrategyResult = { key, ...STRATEGY[key], perBoard: 0, leadWeeks: 0, slowest: null, mix: { ours: 0, authorised: 0, open: 0, broker: 0 }, split: 0, short: 0, changes: 0 };
    for (const l of lines) {
      const f = fill(key, l);
      // The need includes attrition, so it is spread over the boards rather than taken as quantity per board.
      r.perBoard += f.cost / boards;
      if (f.short > 0) r.short++;
      if (!f.used.length) continue;
      if (f.used.length > 1) r.split++;
      for (const u of f.used) {
        const w = lead(u.c);
        if (Number.isFinite(w) && w > r.leadWeeks) {
          r.leadWeeks = w;
          r.slowest = { label: l.label, source: u.c.source };
        }
      }
      const main = [...f.used].sort((a, b) => b.qty - a.qty)[0].c;
      r.mix[RISK_BAND(sourceRisk(main))]++;
      if (!same(l.current, main)) r.changes++;
    }
    return r;
  });
}
