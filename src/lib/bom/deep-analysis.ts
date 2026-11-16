import type { PartRisk, RiskFactor } from "@/lib/part-risk";

/** One BoM line, as the deep analysis needs to see it (quantities for this build, money in the display currency). */
export type DeepLine = {
  lineId: string;
  lineNo: number;
  refDes: string;
  mpn: string | null;
  partId: string | null;
  dnp: boolean;
  required: number;
  /** Free stock by sourcing tier: our stores, channel partners & agents, authorised distributors, marketplace (excess + brokers). */
  ours: number;
  partners: number;
  suppliers: number;
  market: number;
  /** Authorised sources with stock. */
  sources: number;
  leadWeeks: number | null;
  lifecycle: string | null;
  rohs: string | null;
  reach: string | null;
  counterfeitRisk: number | null;
  priceTrendPct: number | null;
  /** What this line costs for the build, and what is still to buy (landed). */
  spend: number;
  toBuy: number;
  risk: PartRisk | null;
};

export type ActionLevel = "red" | "amber";
export type DeepAction = { key: string; level: ActionLevel; title: string; detail: string; lines: { lineId: string; label: string; partId: string | null }[]; value: number };
/** Lines by the first sourcing tier that covers them in full. */
export type Coverage = { ours: number; partners: number; suppliers: number; market: number; none: number; unmatched: number };

export type DeepReport = {
  verdict: { level: "green" | "amber" | "red"; title: string; detail: string };
  /** Lines that need parts for this build (not DNP, quantity > 0). */
  counted: number;
  matched: number;
  distribution: { green: number; amber: number; red: number; grey: number };
  coverage: Coverage;
  longestLead: { weeks: number; label: string } | null;
  topRisks: { line: DeepLine; factor: RiskFactor }[];
  actions: DeepAction[];
  pareto: { lineId: string; label: string; partId: string | null; value: number; share: number; cumulative: number }[];
  spendTotal: number;
  toBuyTotal: number;
  lifecycle: { state: string; count: number }[];
  compliance: { rohsIssues: number; rohsUnknown: number; svhc: number; reachUnknown: number };
};

export type DeepExtras = {
  /** Box fit verdict from the box analysis. */
  box?: { ok: boolean; text: string } | null;
  /** Box-build kit items that aren't on the BoM. */
  kitGaps?: string[];
  /** Process steps with a product-specific watch-out. */
  watch?: { title: string; text: string }[];
};

const END_OF_LIFE = new Set(["EOL", "OBSOLETE", "LAST_TIME_BUY"]);
const LONG_LEAD_WEEKS = 12;
const RISING_PCT = 10;

const label = (l: DeepLine) => `${l.mpn ?? "unmatched"} (${l.refDes || `line ${l.lineNo}`})`;
const ref = (l: DeepLine) => ({ lineId: l.lineId, label: label(l), partId: l.partId });
const sum = (ls: DeepLine[], f: (l: DeepLine) => number) => ls.reduce((s, l) => s + f(l), 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Reads a whole BoM the way a sourcing lead would: is it ready, where does supply come from,
 * which lines carry the risk, where the money goes, and what to do first.
 */
export function deepAnalysis(lines: DeepLine[], extras: DeepExtras = {}): DeepReport {
  const counted = lines.filter((l) => !l.dnp && l.required > 0);
  const matched = counted.filter((l) => l.partId);

  const coverage: Coverage = { ours: 0, partners: 0, suppliers: 0, market: 0, none: 0, unmatched: 0 };
  for (const l of counted) {
    if (!l.partId) coverage.unmatched++;
    else if (l.ours >= l.required) coverage.ours++;
    else if (l.ours + l.partners >= l.required) coverage.partners++;
    else if (l.ours + l.partners + l.suppliers >= l.required) coverage.suppliers++;
    else if (l.ours + l.partners + l.suppliers + l.market >= l.required) coverage.market++;
    else coverage.none++;
  }

  const distribution = { green: 0, amber: 0, red: 0, grey: 0 };
  for (const l of counted) distribution[l.partId && l.risk ? (l.risk.level === "grey" ? "grey" : l.risk.level) : "grey"]++;

  // Lines that must be ordered from the factory: stores and distributor stock together can't cover them.
  const factoryOrder = matched.filter((l) => l.ours + l.partners + l.suppliers < l.required && l.leadWeeks !== null);
  const longest = factoryOrder.reduce<DeepLine | null>((m, l) => (!m || (l.leadWeeks ?? 0) > (m.leadWeeks ?? 0) ? l : m), null);

  const actions: DeepAction[] = [];
  const act = (key: string, level: ActionLevel, title: string, detail: string, ls: DeepLine[]) => {
    if (ls.length) actions.push({ key, level, title, detail, lines: ls.map(ref), value: sum(ls, (l) => l.toBuy) });
  };
  const unmatched = counted.filter((l) => !l.partId);
  act("match", "red", `Match ${plural(unmatched.length, "unmatched line")}`, "They can't be priced, bought or built until each points at a catalogue part.", unmatched);
  const eol = matched.filter((l) => END_OF_LIFE.has(l.lifecycle ?? ""));
  act("eol", "red", `Replace or last-time-buy ${plural(eol.length, "end-of-life part")}`, "Buy for the product's remaining life now, or qualify an alternate before the stock is gone.", eol);
  const none = matched.filter((l) => l.ours + l.partners + l.suppliers + l.market < l.required);
  act("uncoverable", "red", `${plural(none.length, "line")} can't be covered from any source`, "Short even after our stores, channel partners, distributors and the marketplace — find an alternate or agree a change with the customer.", none);
  const rohs = matched.filter((l) => l.rohs === "NON_COMPLIANT");
  act("rohs", "red", `${plural(rohs.length, "part")} not RoHS compliant`, "Can't ship into the EU or most OEM supply chains — replace or get the customer's written exemption.", rohs);
  if (extras.box && !extras.box.ok)
    actions.push({ key: "box-fit", level: "red", title: "The board doesn't fit its box", detail: extras.box.text, lines: [], value: 0 });

  const longLead = factoryOrder.filter((l) => (l.leadWeeks ?? 0) >= LONG_LEAD_WEEKS);
  act("long-lead", "amber", `Order ${plural(longLead.length, "long-lead part")} first`, `Not enough stock anywhere, and the factory quotes ${LONG_LEAD_WEEKS}+ weeks — place these orders before anything else.`, longLead);
  const nrnd = matched.filter((l) => l.lifecycle === "NRND");
  act("nrnd", "amber", `Plan alternates for ${plural(nrnd.length, "not-recommended part")}`, "Still sold, but not for new designs — the next step is end-of-life.", nrnd);
  const single = matched.filter((l) => l.sources <= 1 && l.ours < l.required && !END_OF_LIFE.has(l.lifecycle ?? ""));
  act("single-source", "amber", `Qualify a second source for ${plural(single.length, "line")}`, "One authorised source or none: an allocation or a factory problem stops the build.", single);
  const fakes = matched.filter((l) => (l.counterfeitRisk ?? 0) >= 4 && l.ours + l.partners + l.suppliers < l.required);
  act("counterfeit", "amber", `Buy ${plural(fakes.length, "often-counterfeited part")} from authorised channels only`, "If a broker is the only option, budget for inspection and test before use.", fakes);
  const unknown = matched.filter((l) => l.rohs === "UNKNOWN" || l.reach === "UNKNOWN" || l.reach === "CONTAINS_SVHC");
  act("declarations", "amber", `Get RoHS/REACH declarations for ${plural(unknown.length, "part")}`, "Unknown or SVHC status blocks the compliance file for the shipment.", unknown);
  const rising = matched.filter((l) => (l.priceTrendPct ?? 0) >= RISING_PCT);
  act("rising", "amber", `Lock prices for ${plural(rising.length, "part")} rising ${RISING_PCT}%+`, "Prices moved up over the last 90 days — quote with a margin or buy ahead.", rising);
  if (extras.kitGaps?.length)
    actions.push({ key: "kit", level: "amber", title: `Add ${plural(extras.kitGaps.length, "box-build item")} to the BoM`, detail: extras.kitGaps.join(" · "), lines: [], value: 0 });
  if (extras.watch?.length)
    actions.push({ key: "process", level: "amber", title: `Brief the line on ${plural(extras.watch.length, "process watch-out")}`, detail: extras.watch.map((w) => `${w.title}: ${w.text}`).join(" · "), lines: [], value: 0 });
  // Blockers first; within a level, the most money at stake first.
  actions.sort((a, b) => (a.level === b.level ? b.value - a.value || b.lines.length - a.lines.length : a.level === "red" ? -1 : 1));

  const topRisks = matched
    .filter((l) => l.risk?.factors.length)
    .sort((a, b) => a.risk!.score - b.risk!.score)
    .slice(0, 10)
    .map((line) => ({ line, factor: line.risk!.factors[0] }));

  const spendTotal = sum(counted, (l) => l.spend);
  let cumulative = 0;
  const pareto = [...counted]
    .filter((l) => l.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .map((l) => {
      cumulative += l.spend;
      return { lineId: l.lineId, label: label(l), partId: l.partId, value: l.spend, share: spendTotal ? l.spend / spendTotal : 0, cumulative: spendTotal ? cumulative / spendTotal : 0 };
    });

  const states = new Map<string, number>();
  for (const l of matched) states.set(l.lifecycle ?? "UNKNOWN", (states.get(l.lifecycle ?? "UNKNOWN") ?? 0) + 1);

  const blockers = actions.filter((a) => a.level === "red");
  const watchOuts = actions.length - blockers.length;
  const verdict: DeepReport["verdict"] = blockers.length
    ? { level: "red", title: "Not ready to build", detail: `${plural(blockers.length, "blocker")} and ${plural(watchOuts, "watch-out")} — start at the top of the action list.` }
    : watchOuts
      ? { level: "amber", title: "Buildable, with care", detail: `No blockers; ${plural(watchOuts, "watch-out")} to handle before the build.` }
      : { level: "green", title: "Ready to build", detail: "Every line matched, covered and clean on lifecycle and compliance." };

  return {
    verdict,
    counted: counted.length,
    matched: matched.length,
    distribution,
    coverage,
    longestLead: longest?.leadWeeks ? { weeks: longest.leadWeeks, label: label(longest) } : null,
    topRisks,
    actions,
    pareto,
    spendTotal,
    toBuyTotal: sum(counted, (l) => l.toBuy),
    lifecycle: [...states].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count),
    compliance: {
      rohsIssues: matched.filter((l) => l.rohs === "NON_COMPLIANT").length,
      rohsUnknown: matched.filter((l) => l.rohs === "UNKNOWN").length,
      svhc: matched.filter((l) => l.reach === "CONTAINS_SVHC").length,
      reachUnknown: matched.filter((l) => l.reach === "UNKNOWN").length,
    },
  };
}
