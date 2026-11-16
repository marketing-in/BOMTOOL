/**
 * What the components of one build cost, from each line's sourcing plan at that quantity (src/server/bom-pipeline):
 * our stock at book cost (market price when the lot has none), customer-consigned stock free, bought parts landed,
 * MOQ / reel left-overs apart, and a shortfall — or stock offered without a price — at the market price of the part.
 */

export type LineCostIn = {
  id: string;
  dnp: boolean;
  matched: boolean;
  /** Priced in another step (the bare board, the box). */
  excluded: boolean;
  required: number;
  shortfall: number;
  allocations: { tier: number; kind: string; qty: number; orderQty: number; unit: number | null; landedUnit: number | null }[];
  /** Best authorised landed unit (else plain unit) — the market price of the part. */
  marketUnit: number | null;
};

export type LineCost = {
  /** Cost of the parts this build uses, incl. attrition. */
  cost: number;
  /** MOQ / reel parts bought beyond the need. */
  moqExcess: number;
  /** Average unit over the build need. */
  unit: number | null;
  /** Tier of the source that covers most of the need. */
  mainTier: number | null;
  priced: boolean;
  /** Short with no price at all. */
  unpricedQty: number;
};

export function lineCost(l: LineCostIn): LineCost {
  if (l.dnp || l.excluded) return { cost: 0, moqExcess: 0, unit: null, mainTier: null, priced: true, unpricedQty: 0 };
  if (!l.matched) return { cost: 0, moqExcess: 0, unit: null, mainTier: null, priced: false, unpricedQty: l.required };
  let cost = 0;
  let moqExcess = 0;
  let unpricedQty = 0;
  for (const a of l.allocations) {
    const own = a.tier <= 2;
    const unit = a.kind === "CONSIGNED" ? 0 : own ? (a.unit ?? l.marketUnit) : (a.landedUnit ?? a.unit ?? l.marketUnit);
    if (unit === null) {
      unpricedQty += a.qty;
      continue;
    }
    cost += unit * a.qty;
    if (!own) moqExcess += unit * Math.max(0, a.orderQty - a.qty);
  }
  if (l.shortfall > 0) {
    if (l.marketUnit !== null) cost += l.marketUnit * l.shortfall;
    else unpricedQty += l.shortfall;
  }
  const main = [...l.allocations].sort((a, b) => b.qty - a.qty)[0];
  return { cost, moqExcess, unit: l.required ? cost / l.required : null, mainTier: main?.tier ?? null, priced: unpricedQty === 0, unpricedQty };
}

export function componentsCost(lines: LineCostIn[], qty: number) {
  const byLine = new Map(lines.map((l) => [l.id, lineCost(l)]));
  const all = [...byLine.values()];
  return {
    perBoard: all.reduce((s, x) => s + x.cost, 0) / Math.max(1, qty),
    moqExcess: all.reduce((s, x) => s + x.moqExcess, 0),
    unpriced: all.filter((x) => !x.priced).length,
    byLine,
  };
}
