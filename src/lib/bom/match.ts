import type { Lifecycle, MatchMethod } from "@prisma/client";
import { normaliseMpn } from "@/lib/normalise";
import { parseDescription, DIELECTRIC_RANK, type ParsedDescription } from "./describe";
import type { ScrubbedLine } from "./scrub";

export type CatalogPart = {
  id: string;
  mpn: string;
  mpnNormalised: string;
  manufacturer: string;
  categorySlug: string;
  packageName: string | null;
  lifecycle: Lifecycle;
  /** Numeric parameter values (SI) and text values, by parameter key. */
  num: Record<string, number | null>;
  text: Record<string, string>;
};

export type MatchCandidate = { partId: string; method: MatchMethod; confidence: number; reason: string };

export type MatchResult = {
  candidates: MatchCandidate[];
  selected: MatchCandidate | null;
  needsReview: boolean;
};

const CATEGORIES: Record<"capacitor" | "resistor" | "inductor", string[]> = {
  capacitor: ["mlcc", "tantalum-cap", "aluminium-cap", "polymer-cap", "film-cap"],
  resistor: ["resistor-chip", "resistor-current-sense"],
  inductor: ["inductor"],
};

/** Matching thresholds: auto-select at ≥ AUTO_SELECT; anything not exact still asks for a human look. */
export const AUTO_SELECT = 60;

export function levenshtein(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-6;

export class Catalog {
  private byKey = new Map<string, CatalogPart[]>();
  constructor(readonly parts: CatalogPart[]) {
    for (const p of parts) this.byKey.set(p.mpnNormalised, [...(this.byKey.get(p.mpnNormalised) ?? []), p]);
  }
  exact(key: string) {
    return this.byKey.get(key) ?? [];
  }
}

function mpnCandidates(line: ScrubbedLine, catalog: Catalog): MatchCandidate[] {
  const own = mpnCandidatesFor(line.mpn, line, catalog);
  if (Math.max(0, ...own.map((c) => c.confidence)) >= 90) return own;
  // An approved alternate the customer wrote into the same cell.
  // An alternate that names its own maker is checked against that maker, not the first part's.
  const alternates = (line.altMpns ?? []).flatMap((alt, i) => {
    const maker = line.altMakers?.[i];
    return mpnCandidatesFor(alt, maker === undefined ? line : { ...line, manufacturer: maker }, catalog).map((c) => ({ ...c, reason: `Alternate named on the line (${alt}): ${c.reason}` }));
  });
  return [...own, ...alternates];
}

function mpnCandidatesFor(mpn: string | null, line: ScrubbedLine, catalog: Catalog): MatchCandidate[] {
  if (!mpn) return [];
  const key = normaliseMpn(mpn);
  const mfrAgrees = (p: CatalogPart) => !line.manufacturer || line.manufacturer === p.manufacturer;
  const out: MatchCandidate[] = [];

  for (const p of catalog.exact(key)) {
    const literal = mpn.trim().toUpperCase() === p.mpn.toUpperCase();
    out.push({
      partId: p.id,
      method: literal ? "EXACT" : "NORMALISED",
      confidence: mfrAgrees(p) ? (literal ? 100 : 98) : 70,
      reason: mfrAgrees(p) ? "MPN match" : `MPN match, but manufacturer is ${p.manufacturer}`,
    });
  }
  if (out.length) return out;

  // Fuzzy: ordering-code variants (…TR, …-T, /NOPB, #PBF), truncated MPNs and small typos.
  if (key.length < 5) return out;
  for (const p of catalog.parts) {
    const k = p.mpnNormalised;
    let conf = 0;
    let reason = "";
    if ((k.startsWith(key) || key.startsWith(k)) && Math.min(k.length, key.length) >= 6) {
      const diff = Math.abs(k.length - key.length);
      if (diff <= 6) {
        conf = 88 - diff * 3;
        reason = k.startsWith(key) ? `Base MPN of ${p.mpn} (ordering suffix differs)` : `${p.mpn} with extra suffix`;
      }
    } else if (key.length >= 6) {
      const d = levenshtein(key, k, 2);
      if (d <= 2) {
        conf = 80 - d * 10;
        reason = `Close to ${p.mpn} (${d} character${d > 1 ? "s" : ""} different)`;
      }
    }
    if (!conf) continue;
    if (line.manufacturer && line.manufacturer !== p.manufacturer) conf -= 25;
    else if (line.manufacturer) conf += 5;
    out.push({ partId: p.id, method: "FUZZY", confidence: Math.max(1, Math.min(95, conf)), reason });
  }
  return out;
}

function parametricCandidates(line: ScrubbedLine, catalog: Catalog): MatchCandidate[] {
  const want: ParsedDescription = parseDescription(line.value, line.description, line.package);
  if (!want.kind) return [];
  const primaryKey = want.kind === "capacitor" ? "capacitance" : want.kind === "resistor" ? "resistance" : "inductance";
  const primary = want[primaryKey];
  if (primary === undefined) return [];

  const out: MatchCandidate[] = [];
  for (const p of catalog.parts) {
    if (!CATEGORIES[want.kind].includes(p.categorySlug)) continue;
    const have = p.num[primaryKey];
    if (have === null || have === undefined || !near(have, primary)) continue;
    if (want.package && p.packageName !== want.package) continue;

    let conf = 70;
    const notes: string[] = [];
    if (want.package) conf += 10;
    if (want.voltage !== undefined) {
      const v = p.num.voltage;
      if (v === null || v === undefined || v < want.voltage) continue;
      if (near(v, want.voltage)) conf += 5;
      else notes.push(`${v} V ≥ ${want.voltage} V`);
    }
    if (want.dielectric) {
      const d = p.text.dielectric;
      if (!d || (DIELECTRIC_RANK[d] ?? 0) < (DIELECTRIC_RANK[want.dielectric] ?? 0)) continue;
      if (d === want.dielectric) conf += 5;
      else notes.push(`${d} for ${want.dielectric}`);
    } else if (want.kind === "capacitor" && p.categorySlug !== "mlcc") {
      conf -= 5; // unspecified dielectric: prefer MLCC
    }
    if (want.tolerance !== undefined) {
      const t = p.num.tolerance;
      if (t !== null && t !== undefined && t > want.tolerance) continue;
    }
    if (want.power !== undefined) {
      const w = p.num.power;
      if (w !== null && w !== undefined && w < want.power) continue;
    }
    if (p.lifecycle === "ACTIVE") conf += 3;
    else conf -= 10;
    conf -= notes.length * 3;
    out.push({
      partId: p.id,
      method: "PARAMETRIC",
      confidence: Math.max(1, Math.min(90, conf)),
      reason: `Parametric: ${p.mpn}${notes.length ? ` (${notes.join(", ")})` : ""}`,
    });
  }
  return out;
}

export function matchLine(line: ScrubbedLine, catalog: Catalog): MatchResult {
  let candidates = mpnCandidates(line, catalog);
  const best = Math.max(0, ...candidates.map((c) => c.confidence));
  if (best < 90) candidates = [...candidates, ...parametricCandidates(line, catalog)];

  const seen = new Set<string>();
  candidates = candidates
    .sort((a, b) => b.confidence - a.confidence)
    .filter((c) => (seen.has(c.partId) ? false : (seen.add(c.partId), true)))
    .slice(0, 5);

  const top = candidates[0];
  const selected = top && top.confidence >= AUTO_SELECT ? top : null;
  const needsReview = !selected || selected.confidence < 95;
  return { candidates, selected, needsReview };
}
