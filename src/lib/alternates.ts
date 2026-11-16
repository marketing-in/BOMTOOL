import type { AlternateType, Lifecycle } from "@prisma/client";

/**
 * Parametric alternates: compare a candidate to the original parameter by parameter, decide
 * whether it can replace it (and how: drop-in, pin-to-pin or functional), then rank the
 * candidates that can by lifecycle, availability, price and second source.
 */

export type ParamValue = { name: string; text: string; num: number | null };

export type AltPart = {
  id: string;
  mpn: string;
  manufacturerId: string;
  manufacturer: string;
  categorySlug: string;
  packageId: string | null;
  packageName: string | null;
  lifecycle: Lifecycle;
  params: Record<string, ParamValue>;
  /** Free own stock + market stock. */
  stock: number;
  /** Best unit price @1k in one currency (null: no offers). */
  unit: number | null;
};

type Rule =
  /** Must be the same (numbers within a relative tolerance). */
  | { kind: "equal"; tol?: number }
  /** Higher is fine: ratings and capabilities. */
  | { kind: "min" }
  /** Lower is fine: losses, tolerances, drift. */
  | { kind: "max" }
  /** Ordered best → worst; same or better is fine. */
  | { kind: "rank"; order: string[] }
  /** The candidate's range must contain the original's (supply, temperature). */
  | { kind: "covers" }
  /** Shown, not judged. */
  | { kind: "info" };

export const RULES: Record<string, Rule> = {
  capacitance: { kind: "equal" },
  resistance: { kind: "equal" },
  inductance: { kind: "equal" },
  voltage: { kind: "min" },
  tolerance: { kind: "max" },
  dielectric: { kind: "rank", order: ["C0G", "NP0", "X8R", "X7R", "X7S", "X6S", "X5R", "Y5V", "Z5U"] },
  power: { kind: "min" },
  current: { kind: "min" },
  isat: { kind: "min" },
  impedance: { kind: "equal", tol: 0.25 },
  frequency: { kind: "equal" },
  load_cap: { kind: "equal" },
  stability: { kind: "max" },
  tempco: { kind: "max" },
  esr: { kind: "max" },
  lifetime: { kind: "info" },
  temp_range: { kind: "covers" },
  core: { kind: "equal" },
  clock: { kind: "min" },
  flash: { kind: "min" },
  ram: { kind: "min" },
  io: { kind: "min" },
  logic_cells: { kind: "min" },
  memory_type: { kind: "equal" },
  density: { kind: "equal" },
  mem_interface: { kind: "equal" },
  topology: { kind: "equal" },
  vin_max: { kind: "min" },
  vout: { kind: "equal", tol: 0.01 },
  iout: { kind: "min" },
  channels: { kind: "equal" },
  gbw: { kind: "min" },
  resolution: { kind: "equal" },
  sample_rate: { kind: "min" },
  protocol: { kind: "equal" },
  data_rate: { kind: "min" },
  supply: { kind: "covers" },
  radio: { kind: "equal" },
  sensor_type: { kind: "equal" },
  polarity: { kind: "equal" },
  vds: { kind: "min" },
  id: { kind: "min" },
  rds_on: { kind: "max" },
  vr: { kind: "min" },
  if: { kind: "min" },
  vz: { kind: "equal", tol: 0.02 },
  color: { kind: "equal" },
  isolation: { kind: "min" },
  ctr: { kind: "info" },
  positions: { kind: "equal" },
  pitch: { kind: "equal" },
  series: { kind: "equal" },
  orientation: { kind: "equal" },
  contact_rating: { kind: "min" },
  coil_voltage: { kind: "equal" },
  switch_type: { kind: "equal" },
  ip_rating: { kind: "min" },
  awg: { kind: "equal" },
  conductors: { kind: "equal" },
  insulation: { kind: "info" },
  material: { kind: "info" },
  dimensions: { kind: "info" },
  thread: { kind: "equal" },
};

/**
 * Families where a footprint fixes the pin-out (a 0603 is a 0603, SOT-23 MOSFETs are G-S-D).
 * Everything else — regulators, MCUs, interface ICs, connectors — can share a package with a
 * different pin-out, so "same package" only ever means pin-to-pin after a datasheet check.
 */
const STANDARD_PINOUT = new Set([
  "mlcc",
  "resistor-chip",
  "resistor-current-sense",
  "resistor-network",
  "aluminium-cap",
  "tantalum-cap",
  "polymer-cap",
  "film-cap",
  "supercap",
  "inductor",
  "ferrite-bead",
  "fuse",
  "ptc-ntc",
  "varistor",
  "diode",
  "led",
  "crystal",
  "oscillator",
  "mosfet",
  "bjt",
  "igbt",
  "wide-bandgap",
]);

export type Outcome = "same" | "better" | "worse" | "differs" | "unknown" | "info";
export type Check = { key: string; name: string; from: string | null; to: string | null; outcome: Outcome };

/** Numbers in a value, keeping "1.8-5.5" as two numbers rather than 1.8 and −5.5. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/[-−]?\d+(?:\.\d+)?/g)) {
    let s = m[0];
    const before = m.index ? text[m.index - 1] : "";
    if ((s[0] === "-" || s[0] === "−") && /[\d.]/.test(before)) s = s.slice(1);
    out.push(Number(s.replace("−", "-")));
  }
  return out;
}

function rangeOf(v: ParamValue): [number, number] | null {
  const n = numbersIn(v.text);
  if (!n.length) return null;
  return [Math.min(...n.slice(0, 2)), Math.max(...n.slice(0, 2))];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function numeric(v: ParamValue): number | null {
  if (v.num !== null && Number.isFinite(v.num)) return v.num;
  const n = numbersIn(v.text);
  return n.length === 1 ? n[0] : null;
}

/** Compares one parameter; `a` is the original, `b` the candidate. */
export function compareParam(key: string, a: ParamValue, b: ParamValue | undefined): Check {
  const base = { key, name: a.name, from: a.text, to: b?.text ?? null };
  const rule = RULES[key] ?? { kind: "equal" };
  if (rule.kind === "info") return { ...base, outcome: "info" };
  if (!b) return { ...base, outcome: "unknown" };
  if (rule.kind === "rank") {
    const ia = rule.order.findIndex((x) => norm(a.text).includes(x.toLowerCase()));
    const ib = rule.order.findIndex((x) => norm(b.text).includes(x.toLowerCase()));
    if (ia < 0 || ib < 0) return { ...base, outcome: norm(a.text) === norm(b.text) ? "same" : "unknown" };
    // C0G and NP0 are the same class.
    const cls = (i: number) => (i <= 1 ? 0 : i);
    return { ...base, outcome: cls(ib) === cls(ia) ? "same" : cls(ib) < cls(ia) ? "better" : "worse" };
  }
  if (rule.kind === "covers") {
    const ra = rangeOf(a);
    const rb = rangeOf(b);
    if (!ra || !rb) return { ...base, outcome: norm(a.text) === norm(b.text) ? "same" : "unknown" };
    if (ra[0] === rb[0] && ra[1] === rb[1]) return { ...base, outcome: "same" };
    return { ...base, outcome: rb[0] <= ra[0] && rb[1] >= ra[1] ? "better" : "worse" };
  }
  const na = numeric(a);
  const nb = numeric(b);
  if (na === null || nb === null) return { ...base, outcome: norm(a.text) === norm(b.text) ? "same" : rule.kind === "equal" ? "differs" : "unknown" };
  const tol = rule.kind === "equal" ? (rule.tol ?? 0.005) : 0.005;
  const close = Math.abs(na - nb) <= Math.max(Math.abs(na), Math.abs(nb)) * tol;
  if (close) return { ...base, outcome: "same" };
  if (rule.kind === "equal") return { ...base, outcome: "differs" };
  const higher = nb > na;
  return { ...base, outcome: rule.kind === "min" ? (higher ? "better" : "worse") : higher ? "worse" : "better" };
}

export type Verdict = {
  ok: boolean;
  type: AlternateType | null;
  confidence: number;
  checks: Check[];
  /** One line for the UI: why this class, and what to verify. */
  summary: string;
};

/** Can `b` replace `a`, and how? */
export function assessAlternate(a: AltPart, b: AltPart): Verdict {
  const checks = Object.entries(a.params).map(([k, v]) => compareParam(k, v, b.params[k]));
  const samePackage = !!a.packageId && a.packageId === b.packageId;
  checks.push({ key: "package", name: "Package", from: a.packageName, to: b.packageName, outcome: samePackage ? "same" : a.packageId && b.packageId ? "differs" : "unknown" });

  const params = checks.filter((c) => c.key !== "package");
  const blocking = params.filter((c) => c.outcome === "worse" || c.outcome === "differs");
  const judged = params.filter((c) => c.outcome === "same" || c.outcome === "better");
  const unknown = params.filter((c) => c.outcome === "unknown").length;
  if (a.categorySlug !== b.categorySlug || blocking.length || !judged.length) {
    const why = blocking.length ? `${blocking.map((c) => c.name).join(", ")} ${blocking.length === 1 ? "does" : "do"} not meet the original` : "nothing to compare";
    return { ok: false, type: null, confidence: 0, checks, summary: why };
  }

  const allSame = params.every((c) => c.outcome === "same" || c.outcome === "info");
  const standard = STANDARD_PINOUT.has(a.categorySlug);
  let type: AlternateType;
  let confidence: number;
  let summary: string;
  if (samePackage && allSame && standard) {
    [type, confidence, summary] = ["DROP_IN", 95, "Same package and same values — form, fit and function."];
  } else if (samePackage && standard) {
    [type, confidence, summary] = ["PIN_TO_PIN", 85, "Same package; some ratings are better than the original."];
  } else if (samePackage) {
    [type, confidence, summary] = ["PIN_TO_PIN", 70, "Same package, but this family's pin-outs vary — check every pin against both datasheets."];
  } else {
    [type, confidence, summary] = ["FUNCTIONAL", 55, b.packageId && a.packageId ? `Meets the specs in ${b.packageName} — needs a footprint change.` : "Meets the specs; package not confirmed."];
  }
  confidence = Math.max(30, confidence - 5 * unknown);
  if (unknown) summary += ` ${unknown} parameter${unknown === 1 ? "" : "s"} not listed for the candidate.`;
  return { ok: true, type, confidence, checks, summary };
}

const TYPE_WEIGHT: Record<AlternateType, number> = { DROP_IN: 300, PIN_TO_PIN: 200, UPGRADE: 150, FUNCTIONAL: 100 };
const LIFECYCLE_WEIGHT: Partial<Record<Lifecycle, number>> = { ACTIVE: 30, UNKNOWN: 0, NRND: -25, LAST_TIME_BUY: -45 };

export type Suggestion = Verdict & { part: AltPart; rank: number; secondSource: boolean };

/**
 * Candidates that can replace `a`, best first. EOL and obsolete parts are never suggested;
 * ties go to the part that is active, in stock, cheaper and from another manufacturer.
 */
export function rankAlternates(a: AltPart, candidates: AltPart[], limit = 8): Suggestion[] {
  const out: Suggestion[] = [];
  for (const b of candidates) {
    if (b.id === a.id || b.lifecycle === "EOL" || b.lifecycle === "OBSOLETE") continue;
    const v = assessAlternate(a, b);
    if (!v.ok || !v.type) continue;
    const secondSource = b.manufacturerId !== a.manufacturerId;
    let rank = TYPE_WEIGHT[v.type] + v.confidence + (LIFECYCLE_WEIGHT[b.lifecycle] ?? 0);
    rank += Math.min(35, Math.log10(b.stock + 1) * 5);
    if (secondSource) rank += 15;
    if (a.unit !== null && b.unit !== null && a.unit > 0) rank += b.unit <= a.unit ? 10 : b.unit > a.unit * 1.5 ? -10 : 0;
    out.push({ ...v, part: b, rank, secondSource });
  }
  return out.sort((x, y) => y.rank - x.rank || x.part.mpn.localeCompare(y.part.mpn)).slice(0, limit);
}
