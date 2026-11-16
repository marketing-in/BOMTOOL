import type { Condition, Lifecycle, ReachStatus, RohsStatus, SupplierKind } from "@prisma/client";

export const SCORE_KEYS = ["availability", "resilience", "quality", "economic", "sustainability"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
export type Scores = Record<ScoreKey, number>;

export const SCORE_LABEL: Record<ScoreKey, string> = {
  availability: "Availability",
  resilience: "Resilience",
  quality: "Quality",
  economic: "Economic",
  sustainability: "Sustainability",
};

export const SCORE_HELP: Record<ScoreKey, string> = {
  availability: "Stock we can reach (internal, excess, authorised) against the build need, number of authorised sources and factory lead time.",
  resilience: "Lifecycle status, number of independent sources and whether a drop-in alternate exists.",
  quality: "Brand, condition and date code of the source we would use, years in market and counterfeit exposure.",
  economic: "Our unit price against the market median at this quantity, and the 90-day price trend.",
  sustainability: "RoHS, REACH and conflict-minerals status, reuse of excess stock and local supply.",
};

export type ChosenSource = {
  kind: SupplierKind;
  condition: Condition;
  dateCode: string | null;
  coc: boolean;
  country: string | null;
};

export type ScoreInput = {
  need: number;
  lifecycle: Lifecycle;
  introducedYear: number | null;
  counterfeitRisk: number;
  brandTier: number;
  rohs: RohsStatus;
  reach: ReachStatus;
  conflictMinerals: boolean;
  internalQty: number;
  excessQty: number;
  authorisedStock: number;
  authorisedSources: number; // authorised offers with stock > 0
  factoryLeadWeeks: number | null; // shortest among authorised offers
  dropInAlternates: number;
  chosen: ChosenSource | null;
  chosenUnit: number | null;
  marketUnits: number[]; // authorised unit prices at this quantity, same currency as chosenUnit
  priceTrendPct: number | null;
  /** Fractional year (see fractionalYear). */
  nowYear: number;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function availabilityScore(i: ScoreInput): number {
  if (i.need <= 0) return 100;
  const reachable = i.internalQty + i.excessQty + i.authorisedStock;
  const sourceBonus = Math.min(20, i.authorisedSources * 5);
  if (i.internalQty >= i.need) return clamp(90 + Math.min(10, i.authorisedSources * 2));
  if (reachable >= i.need) {
    let s = 70 + sourceBonus;
    if (i.authorisedStock < i.need) s -= 10; // depends on excess to close the gap
    return clamp(s);
  }
  // Short: proportional to coverage, then penalised by how long the factory takes to make more.
  let s = (reachable / i.need) * 55;
  const lt = i.factoryLeadWeeks;
  if (lt === null) s -= 10;
  else if (lt > 26) s -= 10;
  else if (lt <= 8) s += 10;
  return clamp(s);
}

const LIFECYCLE_BASE: Record<Lifecycle, number> = { ACTIVE: 75, NRND: 45, LAST_TIME_BUY: 25, EOL: 15, OBSOLETE: 5, UNKNOWN: 40 };

export function resilienceScore(i: ScoreInput): number {
  let s = LIFECYCLE_BASE[i.lifecycle];
  if (i.authorisedSources <= 1) s -= 10;
  else s += Math.min(15, (i.authorisedSources - 1) * 5);
  if (i.dropInAlternates > 0) s += 10;
  return clamp(s);
}

const CONDITION_ADJ: Record<Condition, number> = { NEW_FACTORY_SEALED: 15, NEW_OPEN_REEL: 8, NEW_PARTIAL: 0, REFURBISHED: -20, USED: -30 };

/** Fractional year, e.g. 2026.81 for late October 2026. */
export function fractionalYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (365.25 * 86_400_000);
}

/** "2142" (YYWW) → age in years at `nowYear` (fractional), null when unparsable. */
export function dateCodeAge(dc: string | null, nowYear: number): number | null {
  const m = dc?.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  return nowYear - (2000 + Number(m[1]) + (week - 1) / 52);
}

export function qualityScore(i: ScoreInput): number {
  let s = 50 + (i.brandTier - 3) * 8;
  if (i.chosen) {
    s += CONDITION_ADJ[i.chosen.condition];
    const age = dateCodeAge(i.chosen.dateCode, i.nowYear);
    if (age !== null) s += age <= 2 ? 10 : age <= 4 ? 0 : -15;
    if (!i.chosen.coc) s -= 10;
    if (i.chosen.kind === "BROKER") s -= 15;
  }
  if (i.introducedYear) {
    const years = i.nowYear - i.introducedYear;
    s += years < 2 ? 0 : years <= 15 ? 8 : years <= 25 ? 3 : -5;
  }
  s -= (i.counterfeitRisk - 1) * 4;
  return clamp(s);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function economicScore(i: ScoreInput): number {
  const med = median(i.marketUnits);
  let s: number;
  if (i.chosenUnit === null || med === null || med === 0) s = 50;
  else {
    const ratio = i.chosenUnit / med;
    s = ratio <= 0.7 ? 95 : ratio <= 1 ? 75 + ((1 - ratio) / 0.3) * 20 : ratio <= 1.25 ? 60 : ratio <= 1.6 ? 40 : 20;
  }
  const t = i.priceTrendPct;
  if (t !== null) s += t > 10 ? -15 : t > 3 ? -5 : t < -3 ? 5 : 0;
  return clamp(s);
}

const ROHS_PTS: Record<RohsStatus, number> = { COMPLIANT: 40, COMPLIANT_WITH_EXEMPTION: 30, NON_COMPLIANT: 0, UNKNOWN: 15 };
const REACH_PTS: Record<ReachStatus, number> = { COMPLIANT: 25, CONTAINS_SVHC: 10, UNKNOWN: 10 };

export function sustainabilityScore(i: ScoreInput): number {
  let s = ROHS_PTS[i.rohs] + REACH_PTS[i.reach] + (i.conflictMinerals ? 10 : 0);
  if (i.chosen) {
    if (["INTERNAL_STOCK", "CONSIGNED", "OWN_EXCESS", "PARTNER_EXCESS"].includes(i.chosen.kind)) s += 15; // reuse, no new transport
    else if (i.chosen.country === "IN") s += 10;
    else s += 5;
  }
  return clamp(s);
}

export function scoreLine(i: ScoreInput): Scores {
  return {
    availability: availabilityScore(i),
    resilience: resilienceScore(i),
    quality: qualityScore(i),
    economic: economicScore(i),
    sustainability: sustainabilityScore(i),
  };
}

/**
 * Rolls line scores up to the BoM. Availability and resilience are bottlenecks — one unbuyable part
 * stops the build — so they blend the mean with the worst line. The others are spend-weighted.
 */
export function scoreBom(lines: { scores: Scores; spend: number }[]): Scores | null {
  if (!lines.length) return null;
  const mean = (k: ScoreKey) => lines.reduce((s, l) => s + l.scores[k], 0) / lines.length;
  const worst = (k: ScoreKey) => Math.min(...lines.map((l) => l.scores[k]));
  const totalSpend = lines.reduce((s, l) => s + Math.max(l.spend, 0), 0);
  const weighted = (k: ScoreKey) =>
    totalSpend > 0 ? lines.reduce((s, l) => s + l.scores[k] * Math.max(l.spend, 0), 0) / totalSpend : mean(k);
  return {
    availability: clamp(0.5 * mean("availability") + 0.5 * worst("availability")),
    resilience: clamp(0.5 * mean("resilience") + 0.5 * worst("resilience")),
    quality: clamp(weighted("quality")),
    economic: clamp(weighted("economic")),
    sustainability: clamp(weighted("sustainability")),
  };
}
