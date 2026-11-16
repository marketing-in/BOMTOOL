import { expandRefDes } from "@/lib/refdes";
import { parseDescription } from "@/lib/bom/describe";
import { formatSi } from "@/lib/bom/mpn-decode";

/**
 * Do the BoM and the board agree? (Phase 24) Every designator of the BoM, with the package its line names, against
 * the part placed on the board under that designator, with the footprint the CAD files give it. Pure.
 */

export type Level = "green" | "amber" | "red";
export type MatchStatus = "match" | "mismatch" | "check" | "not-on-board" | "not-in-bom";

/** What a footprint or package name says, reduced to what can be compared. */
export type Signature = { kind: "chip"; size: string } | { kind: "leaded"; family: string; pins: number } | { kind: "named"; name: string };

const CHIPS = ["01005", "0201", "0402", "0603", "0805", "1206", "1210", "1812", "2010", "2512"];
/** IPC-7351 names carry the metric size: RESC1608X55N is an 0603. */
const METRIC: Record<string, string> = { "0402": "01005", "0603": "0201", "1005": "0402", "1608": "0603", "2012": "0805", "3216": "1206", "3225": "1210", "4532": "1812", "5025": "2010", "6332": "2512" };

/** Families that are the same land pattern for our purpose. */
const FAMILY: [RegExp, string][] = [
  [/\b(?:[LTVH]?QFP|PQFP)/, "QFP"],
  [/\b(?:[UVWT]?F?QFPN|[VWUT]?D?QFN|MLF|DFN|SON|WSON|UDFN)/, "QFN"],
  [/\b(?:TSSOP|SSOP|MSOP|VSSOP|QSOP)/, "TSSOP"],
  [/\b(?:SOIC|SOP|SO)(?=[-_ ]?\d)/, "SOIC"],
  [/\b(?:[FTUW]?BGA|CSP|WLCSP)/, "BGA"],
  [/\b(?:P?DIP|DIL)/, "DIP"],
  [/\bPLCC/, "PLCC"],
];

const NAMED: [RegExp, string][] = [
  [/SOT-?23-?5\b|SOT-?25\b/, "SOT-23-5"],
  [/SOT-?23-?6\b|SOT-?26\b/, "SOT-23-6"],
  [/SOT-?23(?!-?\d)/, "SOT-23"],
  [/SOT-?223/, "SOT-223"],
  [/SOT-?89/, "SOT-89"],
  [/SOT-?323|SC-?70(?!-)/, "SOT-323"],
  [/SOD-?123/, "SOD-123"],
  [/SOD-?323/, "SOD-323"],
  [/SOD-?882/, "SOD-882"],
  [/TO-?220/, "TO-220"],
  [/TO-?263|D2PAK/, "TO-263"],
  [/TO-?252|\bDPAK/, "TO-252"],
  [/TO-?92/, "TO-92"],
  [/DO-?41/, "DO-41"],
  [/\bSMA\b|DO-?214AC/, "SMA"],
  [/\bSMB\b|DO-?214AA/, "SMB"],
  [/\bSMC\b|DO-?214AB/, "SMC"],
  [/HC-?49/, "HC-49"],
];

/** Reads a package or footprint name ("0603", "C_0603_1608Metric", "LQFP-48_7x7mm_P0.5mm", "SOT-23"). */
export function signature(name: string | null | undefined): Signature | null {
  // CAD names join words with underscores ("C_0603_1608Metric"): treat them as spaces so word boundaries work.
  const f = (name ?? "").toUpperCase().replace(/_/g, " ").trim();
  if (!f) return null;
  const named = NAMED.find(([re]) => re.test(f));
  if (named) return { kind: "named", name: named[1] };
  for (const [re, family] of FAMILY) {
    const m = f.match(new RegExp(`${re.source}[-_ ]?(\\d{1,4})`));
    if (m) return { kind: "leaded", family, pins: Number(m[1]) };
  }
  const ipc = f.match(/\b(?:RESC|CAPC|INDC|LEDC|DIOC|FUSC|BEADC)(\d{4})/);
  if (ipc && METRIC[ipc[1]]) return { kind: "chip", size: METRIC[ipc[1]] };
  const chip = f.match(new RegExp(`(?:^|[^0-9])(${CHIPS.join("|")})(?![0-9])`));
  if (chip) return { kind: "chip", size: chip[1] };
  return null;
}

export const signatureLabel = (s: Signature) => (s.kind === "chip" ? s.size : s.kind === "leaded" ? `${s.family}-${s.pins}` : s.name);

const plain = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Compares the BoM's package with the board's footprint. */
export function compare(bomPkg: string | null | undefined, footprint: string | null | undefined): { status: "match" | "mismatch" | "check"; why: string } {
  const a = signature(bomPkg);
  const b = signature(footprint);
  if (!bomPkg?.trim() && !footprint?.trim()) return { status: "check", why: "no package in the BoM and no footprint on the board" };
  if (!bomPkg?.trim()) return { status: "check", why: "the BoM line names no package" };
  if (!footprint?.trim()) return { status: "check", why: "the board files name no footprint" };
  if (a && b) {
    if (a.kind !== b.kind) return { status: "mismatch", why: `BoM ${signatureLabel(a)}, board ${signatureLabel(b)}` };
    const same = a.kind === "chip" ? a.size === (b as typeof a).size : a.kind === "leaded" ? a.family === (b as typeof a).family && a.pins === (b as typeof a).pins : a.name === (b as typeof a).name;
    return same ? { status: "match", why: signatureLabel(a) } : { status: "mismatch", why: `BoM ${signatureLabel(a)}, board ${signatureLabel(b)}` };
  }
  // Names we cannot read (modules, connectors): the same words, or one inside the other, is a match.
  const pa = plain(bomPkg);
  const pb = plain(footprint);
  if (pa === pb || (pa.length >= 4 && pb.includes(pa)) || (pb.length >= 4 && pa.includes(pb))) return { status: "match", why: bomPkg.trim() };
  return { status: "check", why: `cannot compare “${bomPkg.trim()}” with “${footprint.trim()}”` };
}

/** text: the line's value and description; value: what the design file carries for the designator. */
export type MatchLineIn = { id: string; lineNo: number; refDes: string | null; pkg: string | null; mpn: string | null; dnp: boolean; text?: string | null };
export type MatchPlacementIn = { refDes: string; footprint: string | null; x: number; y: number; side: string; value?: string | null };

const NOT_A_VALUE = /^(dnp|dnf|dni|dnl|dnm|nc|n\/c|nf|tbd|n\/a|-+)$/i;

/**
 * The value the BoM line gives against the value the design file carries for the same designator (C, R and L only).
 * They differ when the BoM was changed after the layout — a tuned value, a later revision — or by mistake; either
 * way someone confirms which is right. Returns what differs, or null.
 */
export function valueDiffers(ref: string, bomText: string | null | undefined, designValue: string | null | undefined): string | null {
  const design = (designValue ?? "").trim();
  if (!design || !bomText?.trim() || NOT_A_VALUE.test(design)) return null;
  const prefix = ref.match(/^[A-Za-z]+/)?.[0].toUpperCase();
  const kind = prefix === "C" ? "capacitor" : prefix === "R" ? "resistor" : prefix === "L" ? "inductor" : null;
  if (!kind) return null;
  const bare = /^\d+(?:\.\d+)?\s*[pnuµμm]$/i.test(design);
  const have = parseDescription(kind === "capacitor" ? `CAP ${design}${bare ? "F" : ""}` : kind === "inductor" ? `IND ${design}${bare ? "H" : ""}` : `RES ${design}`);
  const want = parseDescription(bomText);
  if (want.kind !== kind || have.kind !== kind) return null;
  const key = kind === "capacitor" ? "capacitance" : kind === "resistor" ? "resistance" : "inductance";
  const a = want[key];
  const b = have[key];
  if (a === undefined || b === undefined || Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.01) return null;
  const unit = kind === "capacitor" ? "F" : kind === "resistor" ? "Ω" : "H";
  return `value: BoM ${formatSi(a, unit)}, design file ${formatSi(b, unit)}`;
}

export type RefResult = { ref: string; status: MatchStatus; why: string; lineNo: number | null; mpn: string | null; bomPkg: string | null; footprint: string | null; x: number | null; y: number | null; side: string | null };

export type FootprintMatch = {
  level: Level;
  /** False when the board has no placed parts to compare with (no Gerbers or pick-and-place file yet). */
  hasBoard: boolean;
  title: string;
  summary: string;
  counts: Record<MatchStatus, number>;
  /** Designators whose footprint matches but whose value differs between the BoM and the design file. */
  valueDiffs: number;
  total: number;
  refs: RefResult[];
};

const n = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-IN")} ${k === 1 ? one : many}`;

export function matchFootprints(lines: MatchLineIn[], placements: MatchPlacementIn[]): FootprintMatch {
  const counts: Record<MatchStatus, number> = { match: 0, mismatch: 0, check: 0, "not-on-board": 0, "not-in-bom": 0 };
  const placed = new Map(placements.map((p) => [p.refDes.toUpperCase(), p]));
  const fitted = lines.filter((l) => !l.dnp);
  const dnp = new Set(lines.filter((l) => l.dnp).flatMap((l) => expandRefDes(l.refDes)));
  const refs: RefResult[] = [];
  const seen = new Set<string>();
  if (!placements.length) {
    const total = fitted.reduce((s, l) => s + expandRefDes(l.refDes).length, 0);
    return {
      level: "amber",
      hasBoard: false,
      title: "No board to compare with yet",
      summary: `The BoM has ${n(total, "designator")}, but no Gerbers or pick-and-place file say where the parts sit. Add them to check the footprints.`,
      counts,
      valueDiffs: 0,
      total: 0,
      refs,
    };
  }
  let valueDiffs = 0;
  for (const l of fitted)
    for (const ref of expandRefDes(l.refDes)) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      const p = placed.get(ref);
      if (!p) {
        refs.push({ ref, status: "not-on-board", why: "in the BoM, not placed on the board", lineNo: l.lineNo, mpn: l.mpn, bomPkg: l.pkg, footprint: null, x: null, y: null, side: null });
        continue;
      }
      const c = compare(l.pkg, p.footprint);
      // The footprint can match while the value does not: that is for a person to settle, not a pass.
      const v = valueDiffers(ref, l.text, p.value);
      if (v) valueDiffs++;
      refs.push({ ref, status: v && c.status === "match" ? "check" : c.status, why: v ? `${c.why} · ${v}` : c.why, lineNo: l.lineNo, mpn: l.mpn, bomPkg: l.pkg, footprint: p.footprint, x: p.x, y: p.y, side: p.side });
    }
  for (const p of placements) {
    const ref = p.refDes.toUpperCase();
    if (seen.has(ref) || dnp.has(ref)) continue;
    refs.push({ ref, status: "not-in-bom", why: "placed on the board, no BoM line", lineNo: null, mpn: null, bomPkg: null, footprint: p.footprint, x: p.x, y: p.y, side: p.side });
  }
  for (const r of refs) counts[r.status]++;
  const total = refs.length;
  const bad = counts.mismatch + counts["not-on-board"] + counts["not-in-bom"];
  const level: Level = bad ? "red" : counts.check ? "amber" : "green";
  const problems = [
    counts.mismatch ? n(counts.mismatch, "footprint") + ` ${counts.mismatch === 1 ? "does" : "do"} not match` : null,
    counts["not-on-board"] ? `${n(counts["not-on-board"], "BoM designator")} not on the board` : null,
    counts["not-in-bom"] ? `${n(counts["not-in-bom"], "placed part")} not in the BoM` : null,
    counts.check ? `${counts.check.toLocaleString("en-IN")} to check by eye` : null,
    valueDiffs ? `${n(valueDiffs, "value")} ${valueDiffs === 1 ? "differs" : "differ"} from the design file` : null,
  ].filter(Boolean);
  return {
    level,
    hasBoard: true,
    title: level === "green" ? "BoM and board match" : level === "amber" ? "Almost — a few to check by eye" : "BoM and board do not match",
    summary: level === "green" ? `All ${n(total, "designator")} have the same footprint in the BoM and on the board.` : `${counts.match.toLocaleString("en-IN")} of ${n(total, "designator")} match. ${problems.join(" · ")}.`,
    counts,
    valueDiffs,
    total,
    refs,
  };
}

/** The strip's one-line note for the step. */
export function matchNote(m: Pick<FootprintMatch, "level" | "hasBoard" | "counts" | "total">): string {
  if (!m.hasBoard) return "Add Gerbers to check the footprints";
  if (m.level === "green") return `${m.total.toLocaleString("en-IN")} of ${m.total.toLocaleString("en-IN")} footprints match`;
  const bad = m.counts.mismatch + m.counts["not-on-board"] + m.counts["not-in-bom"];
  return bad ? `${n(bad, "designator")} do not match the board`.replace("1 designator do", "1 designator does") : `${m.counts.check.toLocaleString("en-IN")} to check by eye`;
}
