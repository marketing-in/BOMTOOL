import type { Lifecycle, ReachStatus, RohsStatus } from "@prisma/client";
import { scoreToRisk, type RiskLevel } from "@/lib/risk";

/**
 * Risk analysis for one part, the way a sourcing engineer reads a DigiKey / Octopart page: is it
 * still made, can we get it, how fast, is there a plan B, is the price moving, could it be fake, is it
 * compliant, how old is it. Each factor scores 0–100 (higher = safer) with a reason and an action.
 */

export type PartRiskInput = {
  lifecycle: Lifecycle;
  introducedYear: number | null;
  /** 1–5, higher = more counterfeited. */
  counterfeitRisk: number;
  rohs: RohsStatus;
  reach: ReachStatus;
  /** Free stock in our stores and customer consignment. */
  ownQty: number;
  /** Excess pools and brokers. */
  marketplaceQty: number;
  /** Authorised distributors and manufacturer direct. */
  authorisedStock: number;
  /** Authorised offers that have stock. */
  authorisedSources: number;
  /** Shortest factory lead time quoted by an authorised source, else the maker's standard. */
  leadWeeks: number | null;
  /** Recorded drop-in or pin-to-pin alternates. */
  alternates: number;
  /** Change of the best price @1k over the history window, %. */
  priceTrendPct: number | null;
  /** The quantity we judge availability against. */
  need: number;
  nowYear: number;
};

export type RiskFactorKey = "lifecycle" | "supply" | "leadTime" | "alternates" | "price" | "counterfeit" | "compliance" | "age";

export type RiskFactor = { key: RiskFactorKey; label: string; score: number; level: RiskLevel; reason: string; action?: string };

export type PartRisk = { score: number; level: RiskLevel; summary: string; factors: RiskFactor[] };

const WEIGHT: Record<RiskFactorKey, number> = {
  lifecycle: 0.25,
  supply: 0.2,
  leadTime: 0.1,
  alternates: 0.1,
  price: 0.05,
  counterfeit: 0.1,
  compliance: 0.1,
  age: 0.1,
};

const n = (x: number) => Math.round(x).toLocaleString("en-IN");

function lifecycle(i: PartRiskInput): Omit<RiskFactor, "level"> {
  const table: Record<Lifecycle, [number, string, string | undefined]> = {
    ACTIVE: [92, "In production.", undefined],
    NRND: [45, "Not recommended for new designs — the maker is winding it down.", "Approve an alternate before the next revision."],
    LAST_TIME_BUY: [22, "Last-time-buy window is open; after it closes there is no more factory supply.", "Place a last-time buy for the remaining builds, or switch."],
    EOL: [12, "End of life — only remaining stock can be bought.", "Switch to an alternate; buy only what the current orders need."],
    OBSOLETE: [5, "Obsolete — no factory supply.", "Redesign or approve an alternate now; broker stock only with full inspection."],
    UNKNOWN: [50, "Lifecycle not reported by any source yet.", "Refresh offers to read the status from distributors."],
  };
  const [score, reason, action] = table[i.lifecycle];
  return { key: "lifecycle", label: "Lifecycle", score, reason, action };
}

function supply(i: PartRiskInput): Omit<RiskFactor, "level"> {
  const reachable = i.ownQty + i.authorisedStock;
  const cover = i.need > 0 ? reachable / i.need : 0;
  const src = `${i.authorisedSources} authorised source${i.authorisedSources === 1 ? "" : "s"}`;
  let score: number;
  if (i.authorisedSources >= 3 && i.authorisedStock >= i.need * 10) score = 95;
  else if (cover >= 1 && i.authorisedSources >= 2) score = 82;
  else if (cover >= 1) score = 62;
  else if (reachable > 0) score = Math.max(15, Math.round(cover * 55));
  else score = i.marketplaceQty > 0 ? 18 : 5;
  const reason =
    reachable > 0
      ? `${src}; ${n(reachable)} reachable (${n(i.ownQty)} ours, ${n(i.authorisedStock)} at distributors) against ${n(i.need)} needed.`
      : i.marketplaceQty > 0
        ? `Only marketplace stock (${n(i.marketplaceQty)}): excess or brokers.`
        : "No stock anywhere we can see.";
  const action =
    i.authorisedSources <= 1 && reachable > 0
      ? "Single source — qualify a second source or approve an alternate."
      : cover < 1
        ? "Short — add to an RFQ, check alternates and the marketplace."
        : undefined;
  return { key: "supply", label: "Supply", score, reason, action };
}

function leadTime(i: PartRiskInput): Omit<RiskFactor, "level"> {
  const w = i.leadWeeks;
  if (w === null) return { key: "leadTime", label: "Lead time", score: 50, reason: "No factory lead time quoted." };
  const score = w <= 4 ? 95 : w <= 8 ? 85 : w <= 16 ? 65 : w <= 26 ? 40 : 18;
  return {
    key: "leadTime",
    label: "Lead time",
    score,
    reason: `${w} week${w === 1 ? "" : "s"} from the factory once distributor stock is gone.`,
    action: w > 16 ? "Long lead — order early or hold safety stock." : undefined,
  };
}

function alternates(i: PartRiskInput): Omit<RiskFactor, "level"> {
  if (i.alternates >= 2) return { key: "alternates", label: "Alternates", score: 95, reason: `${i.alternates} approved alternates.` };
  if (i.alternates === 1) return { key: "alternates", label: "Alternates", score: 80, reason: "One approved alternate." };
  return { key: "alternates", label: "Alternates", score: 40, reason: "No approved alternate.", action: "Review the parametric suggestions and approve one." };
}

function price(i: PartRiskInput): Omit<RiskFactor, "level"> {
  const t = i.priceTrendPct;
  if (t === null) return { key: "price", label: "Price trend", score: 70, reason: "Not enough price history yet." };
  const score = t > 25 ? 20 : t > 10 ? 35 : t > 3 ? 62 : t < -3 ? 95 : 86;
  const dir = t > 3 ? "rising" : t < -3 ? "falling" : "stable";
  return {
    key: "price",
    label: "Price trend",
    score,
    reason: `Best price @1k is ${dir} (${t >= 0 ? "+" : ""}${t.toFixed(1)}%).`,
    action: t > 10 ? "Prices rising — lock pricing with a quote or buy ahead." : undefined,
  };
}

function counterfeit(i: PartRiskInput): Omit<RiskFactor, "level"> {
  const base = [95, 85, 65, 40, 20][Math.max(1, Math.min(5, i.counterfeitRisk)) - 1];
  const authorisedCovers = i.authorisedStock >= i.need;
  const score = authorisedCovers ? Math.min(100, base + 10) : i.authorisedStock === 0 && i.marketplaceQty > 0 ? Math.min(base, 30) : base;
  return {
    key: "counterfeit",
    label: "Counterfeit exposure",
    score,
    reason: `Market exposure ${i.counterfeitRisk}/5${authorisedCovers ? "; authorised stock covers the need" : i.authorisedStock === 0 ? "; no authorised stock" : ""}.`,
    action: score < 70 ? "Buy authorised only; for broker stock require CoC plus X-ray / decap inspection." : undefined,
  };
}

function compliance(i: PartRiskInput): Omit<RiskFactor, "level"> {
  if (i.rohs === "NON_COMPLIANT") return { key: "compliance", label: "RoHS / REACH", score: 8, reason: "Not RoHS compliant.", action: "Not for EU/India-RoHS products — find a compliant equivalent." };
  const unknown = i.rohs === "UNKNOWN" || i.reach === "UNKNOWN";
  const flagged = i.rohs === "COMPLIANT_WITH_EXEMPTION" || i.reach === "CONTAINS_SVHC";
  const score = flagged ? 58 : unknown ? 50 : 95;
  const parts = [i.rohs === "COMPLIANT" ? "RoHS compliant" : i.rohs === "COMPLIANT_WITH_EXEMPTION" ? "RoHS with exemption" : "RoHS unknown", i.reach === "COMPLIANT" ? "no REACH SVHC" : i.reach === "CONTAINS_SVHC" ? "contains a REACH SVHC" : "REACH unknown"];
  return {
    key: "compliance",
    label: "RoHS / REACH",
    score,
    reason: `${parts.join(", ")}.`,
    action: unknown ? "Request the RoHS / REACH declaration from the maker." : flagged ? "Check the exemption expiry / SVHC declaration duty for the customer's market." : undefined,
  };
}

function age(i: PartRiskInput): Omit<RiskFactor, "level"> {
  if (!i.introducedYear) return { key: "age", label: "Years in market", score: 70, reason: "Introduction year unknown." };
  const years = Math.max(0, Math.floor(i.nowYear - i.introducedYear));
  const score = years < 2 ? 72 : years <= 15 ? 90 : years <= 25 ? 62 : 42;
  const reason = years < 2 ? `New part (${years} yr) — field history is short.` : years <= 15 ? `${years} years in market — mature.` : `${years} years in market — obsolescence becomes likely.`;
  return { key: "age", label: "Years in market", score, reason, action: years > 25 ? "Watch for a PCN/EOL notice; keep an alternate ready." : undefined };
}

export function analysePartRisk(i: PartRiskInput): PartRisk {
  const factors: RiskFactor[] = [lifecycle(i), supply(i), leadTime(i), alternates(i), price(i), counterfeit(i), compliance(i), age(i)].map((f) => ({ ...f, level: scoreToRisk(f.score) }));
  const weighted = factors.reduce((s, f) => s + f.score * WEIGHT[f.key], 0);
  // One serious problem must show in the headline, not be averaged away.
  const worst = Math.min(...factors.map((f) => f.score));
  const score = Math.round(Math.min(weighted, worst + 40));
  const level = scoreToRisk(score);
  const concerns = factors.filter((f) => f.level === "red").concat(factors.filter((f) => f.level === "amber"));
  const names = concerns.slice(0, 3).map((f) => f.label.toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "no single factor stands out");
  const summary =
    level === "green"
      ? names.length
        ? `Low risk overall; watch ${list}.`
        : "Low risk: active, well stocked and compliant."
      : `${level === "red" ? "High risk" : "Watch"}: ${list}.`;
  return { score, level, summary, factors: factors.sort((a, b) => a.score - b.score) };
}
