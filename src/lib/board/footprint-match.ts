import { expandRefDes } from "@/lib/refdes";
import { formatValue, isNoValue, looksLikePartName, milliMegaSlip, readReading, sameReading, samePartName, valueKindOf, type Quantity, type Reading, type ValueKind } from "@/lib/board/part-value";

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
  [/SOT-?23-3\b/, "SOT-23"],
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

/**
 * One BoM line. value / description: the line's value cell and description (the value is read from the value cell, else
 * the description); text: both in one string, for callers that do not keep them apart. catalogPkg: the package of the
 * part matched to the line, from our catalogue — compared with the board on its own, since a BoM's package column is
 * often copied from the same CAD data as the board. catalogConfirmed: false when that match is our own guess, not yet
 * confirmed (a disagreement is then to check, not a stop). rawMpn: the part numbers as uploaded (may list alternates).
 * customerPn: the customer's own part number, which a board's value cell sometimes carries.
 */
export type MatchLineIn = {
  id: string;
  lineNo: number;
  refDes: string | null;
  pkg: string | null;
  mpn: string | null;
  dnp: boolean;
  text?: string | null;
  value?: string | null;
  description?: string | null;
  rawMpn?: string | null;
  catalogPkg?: string | null;
  catalogConfirmed?: boolean;
  customerPn?: string | null;
};
/** copper: the land pattern read off the pads under the part ("0402", "SOT-23", "QFN-24 + EP 0.5 mm"), when known. */
export type MatchPlacementIn = { refDes: string; footprint: string | null; x: number; y: number; side: string; value?: string | null; copper?: string | null };

/**
 * One thing found about a designator. level "mismatch" is a stop (red); "check" is for a person to confirm (amber).
 * on: footprint (BoM package vs board footprint), copper (the part's package vs the pads it sits on), catalogue (catalogue package vs board footprint), value (the BoM's
 * value vs the board's), part (part names), kind (a footprint named for another kind of part), package (a package or
 * footprint we cannot read or compare). text goes into the designator's why; detail is the mismatch list's line.
 */
export type RefNote = { on: "board" | "footprint" | "copper" | "catalogue" | "value" | "part" | "kind" | "package"; level: "mismatch" | "check"; text: string; detail: string };

type ValueLineIn = Pick<MatchLineIn, "text" | "value" | "description" | "mpn" | "rawMpn" | "customerPn">;

/** What both sides give for a designator's value, as shown beside its footprint ("220 pF" / "1.5 nF"). */
export type ValuePair = { bom: string; board: string; same: boolean };

/**
 * The BoM's value for the quantity: the value cell, else the description. A bare number in the value cell ("1") is
 * weaker than a value with its unit or prefix in the description ("RES 10K 1%"), so the description wins over it.
 */
function bomReading(line: ValueLineIn, q: Quantity): Reading | null {
  const cell = readReading(line.value, q, "field");
  if (cell && cell.tier < 2) return cell;
  const desc = readReading(line.description, q);
  if (desc && desc.tier < 2) return desc;
  return cell ?? desc ?? readReading(line.text, q);
}

/** The kind of value to compare for a designator, given both sides; null when there is nothing to compare. */
function kindFor(ref: string, line: ValueLineIn, board: string): ValueKind | null {
  const kind = valueKindOf(ref, [line.value, line.description, line.text].filter(Boolean).join(" "));
  // A crystal under Q (older European and Eagle designs): compared by frequency when the board gives it in hertz.
  if (kind === "part" && /^Q\d/i.test(ref.trim()) && readReading(board, "frequency", "field")?.tier === 0) return "frequency";
  return kind;
}

/**
 * The value the BoM gives against the value the board files carry for the same designator. A different value is a
 * different part — the BoM changed after the layout, or one of them is wrong — so it is a mismatch, like a footprint;
 * except the same digits with milli and mega swapped (10 MΩ / 10 mΩ), a typing slip to confirm. Part names (ICs,
 * transistors, diodes) that clearly differ are only to check: CAD libraries often carry generic names. Nothing is
 * said when either side has no readable value, or the board's says "not fitted". compared: both sides gave one.
 */
export function compareValue(ref: string, line: ValueLineIn, boardValue: string | null | undefined): { note: RefNote | null; compared: boolean; pair: ValuePair | null } {
  const none = { note: null, compared: false, pair: null };
  const board = (boardValue ?? "").trim();
  if (isNoValue(board)) return none;
  const kind = kindFor(ref, line, board);
  if (!kind) return none;
  if (kind === "part") {
    if (!looksLikePartName(board)) return none;
    const same = samePartName(board, [line.mpn, line.rawMpn], [line.value, line.description, line.text, line.customerPn]);
    if (same === null) return none;
    const bom = line.mpn ?? line.rawMpn ?? "";
    const pair = { bom, board, same };
    return { note: same ? null : { on: "part", level: "check", text: `part: BoM ${bom}, board ${board}`, detail: `BoM ${bom} · board ${board}` }, compared: true, pair };
  }
  const want = bomReading(line, kind);
  const have = readReading(board, kind, "field");
  if (!want || !have) return none;
  const a = formatValue(want.v, kind);
  const b = formatValue(have.v, kind);
  if (sameReading(want, have)) return { note: null, compared: true, pair: { bom: a, board: b, same: true } };
  const pair = { bom: a, board: b, same: false };
  if (milliMegaSlip(want.v, have.v)) return { note: { on: "value", level: "check", text: `value to confirm: BoM ${a}, board ${b} (milli or mega?)`, detail: `BoM ${a} · board ${b}: milli or mega?` }, compared: true, pair };
  return { note: { on: "value", level: "mismatch", text: `value: BoM ${a}, board ${b}`, detail: `BoM ${a} · board ${b}` }, compared: true, pair };
}

/** The note alone (see compareValue). */
export function checkValue(ref: string, line: ValueLineIn, boardValue: string | null | undefined): RefNote | null {
  return compareValue(ref, line, boardValue).note;
}

/** The value difference alone, as the designator's why says it ("value: BoM 220 pF, board 1.5 nF"), or null. */
export function valueDiffers(ref: string, bomText: string | null | undefined, boardValue: string | null | undefined): string | null {
  const v = checkValue(ref, { text: bomText, mpn: null }, boardValue);
  return v?.on === "value" ? v.text : null;
}

type PartKindName = "capacitor" | "resistor" | "inductor";
const KIND_OF_REF: Record<string, PartKindName> = { C: "capacitor", R: "resistor", L: "inductor" };
const FOOTPRINT_KIND: [RegExp, PartKindName][] = [
  [/^(?:C|CP|CAP|CAPC|CAPACITOR)(?=[ -]?\d|[ -]|$)/, "capacitor"],
  [/^(?:R|RES|RESC|RESISTOR)(?=[ -]?\d|[ -]|$)/, "resistor"],
  [/^(?:L|IND|INDC|INDUCTOR)(?=[ -]?\d|[ -]|$)/, "inductor"],
];

/** The kind of part a footprint's name is for ("C_0402" → capacitor, "IND_7MH2-1" → inductor), or null. */
export function footprintKind(footprint: string | null | undefined): PartKindName | null {
  const f = (footprint ?? "").toUpperCase().replace(/_/g, " ").trim();
  return FOOTPRINT_KIND.find(([re]) => re.test(f))?.[1] ?? null;
}

/**
 * A footprint named for another kind of part ("C_0402" under an inductor): often one generic chip library used for
 * both, which is fine, but sometimes the wrong land under the part. Only to check by eye, never a stop.
 */
export function kindCheck(ref: string, footprint: string | null | undefined): RefNote | null {
  const want = KIND_OF_REF[ref.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? ""];
  const named = footprintKind(footprint);
  if (!want || !named || want === named) return null;
  const text = `footprint named for ${named === "inductor" ? "an" : "a"} ${named} on ${want === "inductor" ? "an" : "a"} ${want}`;
  return { on: "kind", level: "check", text, detail: `${footprint?.trim()} is named for ${named === "inductor" ? "an" : "a"} ${named}; ${ref} is ${want === "inductor" ? "an" : "a"} ${want}` };
}

const sameSignature = (a: string, b: string) => {
  const sa = signature(a);
  const sb = signature(b);
  return plain(a) === plain(b) || (!!sa && !!sb && signatureLabel(sa) === signatureLabel(sb));
};

/**
 * The package of the part matched to the line, from our catalogue, against the board's footprint. Says something
 * only when the catalogue's package differs from the BoM's package column and clearly disagrees with the board. A
 * stop when the match is confirmed (an exact part number, or a person chose it); when it is still our own guess, the
 * guess may be what is wrong, so it is only to check.
 */
export function catalogueCheck(line: Pick<MatchLineIn, "pkg" | "catalogPkg" | "mpn" | "catalogConfirmed">, footprint: string | null | undefined): RefNote | null {
  const cat = line.catalogPkg?.trim();
  if (!cat || !footprint?.trim() || (line.pkg?.trim() && sameSignature(line.pkg, cat))) return null;
  if (compare(cat, footprint).status !== "mismatch") return null;
  const s = signature(footprint);
  const fp = s ? signatureLabel(s) : footprint.trim();
  const part = line.mpn ? `catalogue part ${line.mpn}` : "the catalogue part";
  if (line.catalogConfirmed === false) {
    const matched = line.mpn ? `the matched catalogue part ${line.mpn}` : "the matched catalogue part";
    return { on: "catalogue", level: "check", text: `${matched} is ${cat}, board ${fp}: confirm the match`, detail: `board ${fp} · ${matched} is ${cat} (match not confirmed)` };
  }
  return { on: "catalogue", level: "mismatch", text: `footprint ${fp}, ${part} is ${cat}`, detail: `board ${fp} · ${part} is ${cat}` };
}

/**
 * The part against the copper it sits on (Phase 44): the package the line calls for — the matched part's own when the
 * catalogue knows it, else the BoM's package column — against the land pattern read off the pads. A chip of another
 * size, another pin count or another named package is a stop when the part is sure (an exact part number, or the BoM's
 * own package), to check when the part is our guess. Nothing to say when either side cannot be read.
 */
export function copperCheck(line: Pick<MatchLineIn, "pkg" | "catalogPkg" | "mpn" | "catalogConfirmed">, copper: string | null | undefined): RefNote | null {
  const own = line.catalogPkg?.trim() || line.pkg?.trim();
  if (!own || !copper?.trim()) return null;
  const a = signature(own);
  const b = signature(copper);
  if (!a || !b) return null;
  let differs: boolean;
  if (a.kind !== b.kind) {
    // A SOT-23 and a 3-lead leaded name are the same thing seen two ways; only a chip against a leaded part is clear.
    differs = a.kind === "chip" || b.kind === "chip";
  } else if (a.kind === "chip") differs = a.size !== (b as typeof a).size;
  else if (a.kind === "leaded") differs = a.pins !== (b as typeof a).pins;
  else differs = a.name !== (b as typeof a).name;
  if (!differs) return null;
  const who = line.catalogPkg?.trim() ? (line.mpn ? `part ${line.mpn} is ${own}` : `the part is ${own}`) : `BoM says ${own}`;
  const sure = line.catalogPkg?.trim() ? line.catalogConfirmed !== false : true;
  return {
    on: "copper",
    level: sure ? "mismatch" : "check",
    text: `the pads are ${signatureLabel(b)}, ${who}${sure ? "" : ": confirm the match"}`,
    detail: `pads ${signatureLabel(b)} · ${who}`,
  };
}

export type RefResult = {
  ref: string;
  status: MatchStatus;
  why: string;
  lineNo: number | null;
  mpn: string | null;
  bomPkg: string | null;
  footprint: string | null;
  x: number | null;
  y: number | null;
  side: string | null;
  /** What was found, most serious first (empty or absent for a match, not-on-board and not-in-bom). */
  notes?: RefNote[];
  /** The value (or part name) each side gives, when both give one and they were compared. */
  values?: ValuePair;
};

export type FootprintMatch = {
  level: Level;
  /** False when the board has no placed parts to compare with (no Gerbers or pick-and-place file yet). */
  hasBoard: boolean;
  title: string;
  summary: string;
  counts: Record<MatchStatus, number>;
  /** Designators whose value differs between the BoM and the board files (each is a mismatch; a milli/mega slip to confirm is not counted). */
  valueDiffs: number;
  /** Designators whose value (or part name) both sides give, and so was compared. */
  valuesChecked: number;
  total: number;
  refs: RefResult[];
  /** Do the placements sit on the Gerbers (src/lib/board/placement-fit.ts)? Absent when there were no Gerbers to look at. */
  fit?: { level: "green" | "amber" | "red"; note: string; foreign: boolean; misses: number };
};

/** What the footprint check needs from the placement-against-Gerber check: designator (upper case) → why it misses. */
export type FitIn = { level: "green" | "amber" | "red"; note: string; foreign: boolean; why: Record<string, string> };

const n = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-IN")} ${k === 1 ? one : many}`;

const NOTE_ORDER: RefNote["on"][] = ["footprint", "copper", "catalogue", "value", "package", "kind", "part"];
const byWeight = (a: RefNote, b: RefNote) => (a.level === b.level ? NOTE_ORDER.indexOf(a.on) - NOTE_ORDER.indexOf(b.on) : a.level === "mismatch" ? -1 : 1);

/** Everything found for one placed designator of a BoM line: its status, why, and the notes behind them. */
export function judgeRef(ref: string, l: MatchLineIn, p: Pick<MatchPlacementIn, "footprint" | "value"> & { copper?: string | null }): { status: "match" | "mismatch" | "check"; why: string; notes: RefNote[]; valueCompared: boolean; values: ValuePair | null } {
  const c = compare(l.pkg, p.footprint);
  const notes: RefNote[] = [];
  if (c.status === "mismatch") notes.push({ on: "footprint", level: "mismatch", text: c.why, detail: `BoM ${l.pkg ?? "—"} · board ${p.footprint ?? "—"}` });
  else if (c.status === "check") notes.push({ on: "package", level: "check", text: c.why, detail: `BoM ${l.pkg ?? "names no package"} · board ${p.footprint ?? "—"}` });
  const cat = catalogueCheck(l, p.footprint);
  if (cat) notes.push(cat);
  const cu = copperCheck(l, p.copper);
  if (cu) notes.push(cu);
  const v = compareValue(ref, l, p.value);
  if (v.note) notes.push(v.note);
  const k = kindCheck(ref, p.footprint);
  if (k) notes.push(k);
  notes.sort(byWeight);
  const status = notes.some((n) => n.level === "mismatch") ? "mismatch" : notes.length ? "check" : "match";
  return { status, why: notes.length ? notes.map((n) => n.text).join(" · ") : c.why, notes, valueCompared: v.compared, values: v.pair };
}

/** Whether a designator's value (not its part name) differs between the BoM and the board: a stop. */
const valueStop = (notes: RefNote[] | undefined) => (notes ?? []).some((x) => x.on === "value" && x.level === "mismatch");

/**
 * `fit`, when the Gerbers were read: a placement that does not sit on them (outside the board, or no copper pad under it)
 * is a mismatch whatever its footprint name says — the board cannot be built as drawn.
 */
export function matchFootprints(lines: MatchLineIn[], placements: MatchPlacementIn[], fit?: FitIn | null): FootprintMatch {
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
      summary: `The BoM has ${n(total, "designator")}, but no Gerbers or pick-and-place file say where the parts sit. Add them to check the footprints and values.`,
      counts,
      valueDiffs: 0,
      valuesChecked: 0,
      total: 0,
      refs,
    };
  }
  let valueDiffs = 0;
  let valuesChecked = 0;
  let valuesAgree = 0;
  let footprintDiffs = 0;
  let boardMisses = 0;
  for (const l of fitted)
    for (const ref of expandRefDes(l.refDes)) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      const p = placed.get(ref);
      if (!p) {
        refs.push({ ref, status: "not-on-board", why: "in the BoM, not placed on the board", lineNo: l.lineNo, mpn: l.mpn, bomPkg: l.pkg, footprint: null, x: null, y: null, side: null });
        continue;
      }
      const j = judgeRef(ref, l, p);
      const off = fit?.why[ref];
      if (off) {
        // Not on the Gerbers: that comes first, and makes the designator red whatever its footprint name says.
        boardMisses++;
        j.notes.unshift({ on: "board", level: "mismatch", text: off, detail: off });
        j.why = j.status === "match" ? off : `${off} · ${j.why}`;
        j.status = "mismatch";
      }
      if (valueStop(j.notes)) valueDiffs++;
      if (j.notes.some((x) => x.level === "mismatch" && x.on !== "value" && x.on !== "board")) footprintDiffs++;
      if (j.valueCompared) valuesChecked++;
      if (j.values?.same) valuesAgree++;
      refs.push({ ref, status: j.status, why: j.why, lineNo: l.lineNo, mpn: l.mpn, bomPkg: l.pkg, footprint: p.footprint, x: p.x, y: p.y, side: p.side, notes: j.notes, ...(j.values ? { values: j.values } : {}) });
    }
  for (const p of placements) {
    const ref = p.refDes.toUpperCase();
    if (seen.has(ref) || dnp.has(ref)) continue;
    refs.push({ ref, status: "not-in-bom", why: fit?.why[ref] ? `placed on the board, no BoM line · ${fit.why[ref]}` : "placed on the board, no BoM line", lineNo: null, mpn: null, bomPkg: null, footprint: p.footprint, x: p.x, y: p.y, side: p.side });
  }
  for (const r of refs) counts[r.status]++;
  const total = refs.length;
  const bad = counts.mismatch + counts["not-on-board"] + counts["not-in-bom"];
  const level: Level = bad ? "red" : counts.check ? "amber" : "green";
  const problems = [
    boardMisses ? `${n(boardMisses, "placement")} not on the Gerbers` : null,
    footprintDiffs ? n(footprintDiffs, "footprint") + ` ${footprintDiffs === 1 ? "does" : "do"} not match` : null,
    valueDiffs ? `${n(valueDiffs, "value")} ${valueDiffs === 1 ? "differs" : "differ"} between the BoM and the board` : null,
    counts["not-on-board"] ? `${n(counts["not-on-board"], "BoM designator")} not on the board` : null,
    counts["not-in-bom"] ? `${n(counts["not-in-bom"], "placed part")} not in the BoM` : null,
    counts.check ? `${counts.check.toLocaleString("en-IN")} to check by eye` : null,
  ].filter(Boolean);
  const agree = valuesChecked ? `, and the ${n(valuesChecked, "value")} both name agree` : "";
  // Where some values are wrong, say how many were compared and agree, so nobody wonders whether the rest were looked at.
  const compared = valuesChecked ? ` ${valuesAgree.toLocaleString("en-IN")} of the ${n(valuesChecked, "value")} both name agree.` : "";
  return {
    level,
    hasBoard: true,
    title: fit?.foreign ? "The Gerbers do not fit the placements" : level === "green" ? "BoM and board match" : level === "amber" ? "Almost — a few to check by eye" : "BoM and board do not match",
    summary: fit?.foreign
      ? `${fit.note}${/[.?!]$/.test(fit.note) ? "" : "."} Nothing below can be trusted until the Gerbers and the pick-and-place file are the same board.`
      : level === "green"
        ? `All ${n(total, "designator")} have the same footprint in the BoM and on the board${agree}.`
        : `${counts.match.toLocaleString("en-IN")} of ${n(total, "designator")} match. ${problems.join(" · ")}.${compared}`,
    counts,
    valueDiffs,
    valuesChecked,
    total,
    refs,
    ...(fit ? { fit: { level: fit.level, note: fit.note, foreign: fit.foreign, misses: Object.keys(fit.why).length } } : {}),
  };
}

/** The strip's one-line note for the step. */
export function matchNote(m: Pick<FootprintMatch, "level" | "hasBoard" | "counts" | "total"> & Partial<Pick<FootprintMatch, "valueDiffs" | "refs" | "fit">>): string {
  if (!m.hasBoard) return "Add Gerbers to check the footprints";
  if (m.fit?.foreign) return "The Gerbers do not fit the placements";
  if (m.level === "green") return `${m.total.toLocaleString("en-IN")} of ${m.total.toLocaleString("en-IN")} footprints match`;
  const bad = m.counts.mismatch + m.counts["not-on-board"] + m.counts["not-in-bom"];
  if (!bad) return `${m.counts.check.toLocaleString("en-IN")} to check by eye`;
  const values = m.valueDiffs ?? 0;
  // Only values are wrong: say so, so nobody looks for a footprint problem.
  const onlyValues = values > 0 && values === bad && (m.refs ?? []).every((r) => r.status !== "mismatch" || (r.notes ?? []).every((x) => x.level !== "mismatch" || x.on === "value"));
  if (onlyValues) return `${n(values, "value")} ${values === 1 ? "does" : "do"} not match the board`;
  const base = `${n(bad, "designator")} ${bad === 1 ? "does" : "do"} not match the board`;
  return values ? `${base}, ${values.toLocaleString("en-IN")} by value` : base;
}

/**
 * What has to be fixed before going on from the step, named for what is actually red: "Fix the values first",
 * "Fix the footprints and values first", "Fix the missing designators first".
 */
export function matchHeldNote(m: Pick<FootprintMatch, "counts" | "refs">): string {
  const reds = m.refs.filter((r) => r.status === "mismatch");
  const footprints = reds.some((r) => !r.notes?.length || r.notes.some((x) => x.level === "mismatch" && x.on !== "value"));
  const what = [footprints ? "footprints" : null, reds.some((r) => valueStop(r.notes)) ? "values" : null, m.counts["not-on-board"] + m.counts["not-in-bom"] ? "missing designators" : null].filter((x): x is string => !!x);
  if (!what.length) return "Fix the BoM or the board files first";
  return `Fix the ${what.length > 1 ? `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}` : what[0]} first`;
}
