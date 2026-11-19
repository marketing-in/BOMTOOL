/**
 * Reading a part's value the way a person does, so the BoM and the board files can be compared by what they mean:
 * 100nF = 0.1µF = 0.1uF = 100n = 0u1, 4K7 = 4.7k = 4700, 10R = 10 Ω, 1n5 = 1.5 nF, 7.2MH = 7.2 mH, 24 MHZ = 24M.
 * The designator says which quantity to look for (C → capacitance, R → resistance, L → inductance, Y/X → frequency,
 * F → current, FB → impedance at 100 MHz), so a description's voltage, current, tolerance or temperature is never
 * taken as the value. Anything that cannot be read with confidence is left unread: the check then says nothing. Pure.
 */

export type Quantity = "capacitance" | "resistance" | "inductance" | "frequency" | "current" | "impedance";
/** "part": the board value names a part (ICs, transistors, diodes), compared by name, not by number. */
export type ValueKind = Quantity | "part";

export const UNIT: Record<Quantity, string> = { capacitance: "F", resistance: "Ω", inductance: "H", frequency: "Hz", current: "A", impedance: "Ω" };

const KIND_OF: Record<string, ValueKind> = {
  C: "capacitance",
  R: "resistance",
  L: "inductance",
  Y: "frequency",
  X: "frequency",
  XT: "frequency",
  XTAL: "frequency",
  XO: "frequency",
  OSC: "frequency",
  F: "current",
  FB: "impedance",
  U: "part",
  IC: "part",
  Q: "part",
  D: "part",
  LED: "part",
  ZD: "part",
};

/** Words that make a BoM line a crystal or an oscillator. */
const CRYSTAL_WORDS = /CRYSTAL|XTAL|OSC|RESONATOR|\d\s*[KMG]?HZ\b/i;

/**
 * What a designator's value measures, from its letters (C12 → capacitance); null when we do not compare it. X is a
 * crystal in most designs but a connector under IEC 81346: given the BoM line's text, X is read as a crystal only
 * when that text says crystal, oscillator or hertz.
 */
export function valueKindOf(ref: string, bomText?: string | null): ValueKind | null {
  const prefix = ref.trim().match(/^[A-Za-z]+/)?.[0].toUpperCase();
  if (!prefix) return null;
  if (prefix === "X" && bomText !== undefined && !CRYSTAL_WORDS.test(bomText ?? "")) return null;
  return KIND_OF[prefix] ?? null;
}

/** A board value that says "nothing fitted" or "not decided": nothing to compare. */
const NOT_A_VALUE = /^(?:dnp|dnf|dni|dnl|dnm|np|nc|n\/c|nf|nm|tbd|tba|n\/a|na|open|no ?pop|not ?fitted|-+|\?+)$/i;
const SAYS_NOT_FITTED = /\b(?:dnp|dnf|dni|dnl|no ?pop|not ?fitted|do not (?:fit|populate|place))\b/i;

export function isNoValue(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  return !t || NOT_A_VALUE.test(t) || SAYS_NOT_FITTED.test(t);
}

/** Chip sizes, imperial and metric: a bare "0603" or "1608" is a size, not 603 Ω. */
const CHIP_SIZES = new Set(["01005", "0201", "0402", "0603", "0805", "1206", "1210", "1812", "2010", "2512", "1005", "1608", "2012", "3216", "3225", "4532", "5025", "6332"]);

/** Unicode and spelled-out units brought to one spelling, and a number glued to the unit written after a space. */
function normalise(text: string): string {
  return (
    text
      .replace(/[µμ]/g, "u")
      .replace(/[ΩΩ]/g, "Ω")
      .replace(/\s*(?:±|\+\/-)\s*/g, " ±")
      .replace(/(\d)\s*(?:MICRO\s*F(?:ARADS?)?|MFD|UFD)(?![A-Za-z])/gi, "$1uF")
      .replace(/(\d)\s*NANO\s*F(?:ARADS?)?(?![A-Za-z])/gi, "$1nF")
      .replace(/(\d)\s*PICO\s*F(?:ARADS?)?(?![A-Za-z])/gi, "$1pF")
      .replace(/(\d)\s*MICRO\s*H(?:ENRYS?|ENRIES)?(?![A-Za-z])/gi, "$1uH")
      // Ohms. "MEG" is mega. Upper-case "MOHM" with the M against OHM is milliohm in some catalogues ("10 MOHM") and
      // megaohm in others ("1MOHM"), so it is left unread. "1M OHM", "MOhm" and "MΩ" are mega; "mOhm" is milli.
      .replace(/(\d)\s*([Mm][Ee][Gg](?:[Aa])?|[kKmM]?)(\s*)(OHMS?|Ohms?|ohms?|Ω)(?![A-Za-z])/g, (_all, d: string, p: string, gap: string, unit: string) =>
        p === "M" && !gap && unit.startsWith("OHM") ? `${d}MOHM` : `${d}${p.length > 1 ? "M" : p}Ω`,
      )
      .replace(/(\d)\s*MEG(?![A-Za-z])/gi, "$1MΩ")
      .replace(/(\d)\s*AMPS?(?![A-Za-z])/gi, "$1A")
      // "24 MHZ" → "24MHZ", "220 Ω" → "220Ω", "10 K" → "10K"; "50 V" and "15 PPM" are left as they are.
      .replace(/(\d)\s+(?=(?:[pnumkg]?(?:F|H|HZ|A)|[pnukmre]?Ω|[pnukmre])(?![A-Za-z0-9]))/gi, "$1")
  );
}

/**
 * Words of a value or description. "/" splits "100nF/50V" but not "1/4W"; "@" splits "220R@100MHz"; "_" and a dash
 * after a letter split "1uF_0402" and "22uF-10V". A dash before a number is kept ("-55" is a temperature, not 55).
 */
function words(text: string): string[] {
  return normalise(text)
    .split(/[\s,;:()[\]{}"'@|_]+|\/(?!\d)|(?<!\d)\/|(?<=[A-Za-z%])-(?=\d)/)
    .map((t) => t.replace(/^[–~*]+|^-+(?!\d)|[-–~*.]+$/g, ""))
    .filter(Boolean);
}

const P: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, "": 1, k: 1e3, g: 1e9 };
const NUM = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
// Letter-as-decimal-point codes (4K7, 1n5, 2R2, 32K768) carry one to three digits after the letter: "1N4148" is a diode.

type Mode = "field" | "description";

/**
 * How sure a reading is. 0: the word carries the unit (100nF, 10R, 24MHz, 47nH, 2A); 1: a prefix or a letter for the
 * decimal point only (100n, 4K7, 24M); 2: a bare number (a resistor's "4700"). A description's value is the first
 * word of the surest kind, so "INDUCTOR 2.5m 47nH" is 47 nH and "CRYSTAL 80K ESR 32.768kHz" is 32.768 kHz.
 */
type Tier = 0 | 1 | 2;
/** One reading: the value, how sure it is, and other values it may equally mean (EIA code, a PTC's hold and trip). */
export type Reading = { v: number; tier: Tier; alts: number[] };
type Hit = { v: number; tier: Tier; alt?: number };

/** A resistor code: "103" = 10 kΩ, "4701" = 4.7 kΩ. Only with a multiplier digit of 1 to 9: "100" and "4700" stay plain. */
function eia(n: string): number | undefined {
  if (!/^\d{3,4}$/.test(n) || n.endsWith("0")) return undefined;
  return Number(n.slice(0, -1)) * 10 ** Number(n.slice(-1));
}

/** One word as a value of the quantity, or null. */
function readWord(w: string, q: Quantity, mode: Mode): Hit | null {
  let m: RegExpMatchArray | null;
  switch (q) {
    case "capacitance":
      // "100PF" is picofarads whatever the BoM's typing; "MF" (milli or the old micro?) is not read.
      if ((m = w.match(new RegExp(`^${NUM}([pnu])(F?)$`, "i")))) return { v: Number(m[1]) * P[m[2].toLowerCase()], tier: m[3] ? 0 : 1 };
      if ((m = w.match(/^(\d+)([pnu])(\d{1,2})(F?)$/i))) return { v: Number(`${m[1]}.${m[3]}`) * P[m[2].toLowerCase()], tier: m[4] ? 0 : 1 };
      if ((m = w.match(new RegExp(`^${NUM}F$`, "i")))) return { v: Number(m[1]), tier: 0 };
      return null;
    case "resistance": {
      // k/K kilo, M mega, m milli; R, E and Ω are ohms (4R7, 10E). A bare number is ohms where bare numbers are allowed.
      if ((m = w.match(new RegExp(`^${NUM}([kKM]|m)?([ΩRrEe])?$`)))) {
        const [, n, prefix = "", unit] = m;
        const v = Number(n) * (prefix === "M" ? 1e6 : P[prefix.toLowerCase()]);
        if (unit) return { v, tier: 0 };
        if (prefix) return { v, tier: 1 };
        return CHIP_SIZES.has(n) ? null : { v, tier: 2, alt: mode === "field" ? eia(n) : undefined };
      }
      if ((m = w.match(/^(\d*)([RrEeKkM]|m)(\d{1,3})Ω?$/)) && (m[1] || mode === "field")) {
        const ohms = /[RrEe]/.test(m[2]);
        const mult = ohms ? 1 : m[2] === "M" ? 1e6 : P[m[2].toLowerCase()];
        return { v: Number(`${m[1] || "0"}.${m[3]}`) * mult, tier: ohms ? 0 : 1 };
      }
      return null;
    }
    case "inductance":
      // "7.2MH" is millihenries: there is no megahenry on a board. "2R2" is the inductor code for 2.2 µH.
      if ((m = w.match(new RegExp(`^${NUM}([pnum])(H?)$`, "i")))) return { v: Number(m[1]) * P[m[2].toLowerCase()], tier: m[3] ? 0 : 1 };
      if ((m = w.match(new RegExp(`^${NUM}H$`, "i")))) return { v: Number(m[1]), tier: 0 };
      if ((m = w.match(/^(\d*)([numr])(\d{1,2})(H?)$/i)) && (m[1] || mode === "field")) {
        const p = m[2].toLowerCase();
        return { v: Number(`${m[1] || "0"}.${m[3]}`) * (p === "r" ? 1e-6 : P[p]), tier: m[4] ? 0 : 1 };
      }
      return null;
    case "frequency":
      // A crystal's "M" is mega whatever the case: no one fits a millihertz crystal.
      if ((m = w.match(new RegExp(`^${NUM}([kmg])?HZ$`, "i")))) return { v: Number(m[1]) * freq(m[2]), tier: 0 };
      if ((m = w.match(new RegExp(`^${NUM}([km])$`, "i")))) return { v: Number(m[1]) * freq(m[2]), tier: 1 };
      if ((m = w.match(/^(\d+)([km])(\d{1,3})$/i))) return { v: Number(`${m[1]}.${m[3]}`) * freq(m[2]), tier: 1 };
      return null;
    case "current":
      if ((m = w.match(new RegExp(`^${NUM}(m)?A$`, "i")))) return { v: Number(m[1]) * (m[2] ? 1e-3 : 1), tier: 0 };
      if ((m = w.match(/^(\d+)A(\d{1,2})$/i))) return { v: Number(`${m[1]}.${m[2]}`), tier: 0 };
      return null;
    case "impedance":
      if ((m = w.match(new RegExp(`^${NUM}(k)?[ΩRE]$`, "i")))) return { v: Number(m[1]) * (m[2] ? 1e3 : 1), tier: 0 };
      // A bead's value cell often holds the bare ohms at 100 MHz ("120").
      if ((m = w.match(new RegExp(`^${NUM}$`))) && !CHIP_SIZES.has(m[1])) return { v: Number(m[1]), tier: 2 };
      return null;
  }
}

const freq = (p: string | undefined) => (!p ? 1 : p.toLowerCase() === "k" ? 1e3 : p.toLowerCase() === "g" ? 1e9 : 1e6);

/** A bare number followed by one of these is a voltage, power, tolerance, temperature, size or count, not the value. */
const QUALIFIER = /^(?:V|VDC|VAC|KV|W|MW|KW|WATTS?|%|PCT|PPM|PPM\/°?C|°C?|C|DEG|DEGC|TO|MM|MIL|MILS|IN|INCH|PINS?|POS|WAY|X|PCS)$/i;
/** A bare number after one of these is the far end of a range, a tolerance or a dimension. */
const BEFORE_BARE = /^(?:TO|TOL|TOLERANCE|X)$/i;

/**
 * The value of the quantity in a value cell ("field") or a description: the first word of the surest kind (see Tier).
 * A description's voltage, current, tolerance (±…, after TOL), temperature, ppm or power is not that quantity, and a
 * bare number before one of those, or after TO / TOL / X, is passed over; so is a crystal's ESR and a bead's DC
 * resistance. Bare numbers
 * count only as a resistor's ohms (in a value cell, or a description that says RES/OHM) and a bead's value cell.
 */
export function readReading(text: string | null | undefined, q: Quantity, mode: Mode = "description"): Reading | null {
  if (!text?.trim() || isNoValue(text)) return null;
  const bare = q === "resistance" ? mode === "field" || /\bRES(?:ISTORS?)?\b|\bOHMS?\b|Ω/i.test(text) : q === "impedance" && mode === "field";
  const ws = words(text);
  const at = (k: number) => (k >= 0 && k < ws.length ? readWord(ws[k], q, mode) : null);
  // Numbers that a label claims: a tolerance after TOL; an ESR next to "ESR" when it could be read as the value only
  // without its unit ("80K ESR" is 80 kΩ, not 80 kHz — "16MHz ESR 40" keeps 16 MHz); a bead's DC resistance, which is
  // the smaller of the two numbers around "DCR" when both read ("0.15 OHM DCR 600 OHM").
  const skip = new Set<number>();
  ws.forEach((w, k) => {
    if (/^TOL(?:ERANCE)?$/i.test(w)) skip.add(k + 1);
    if (/^ESR$/i.test(w)) for (const j of [k - 1, k + 1]) if ((at(j)?.tier ?? 0) > 0) skip.add(j);
    if (q === "impedance" && /^DC$/i.test(w)) skip.add(k + 1);
    if (q === "impedance" && /^(?:DCR|RDC)$/i.test(w)) {
      const a = at(k - 1);
      const b = at(k + 1);
      skip.add(a && b ? (a.v < b.v ? k - 1 : k + 1) : a ? k - 1 : k + 1);
    }
  });
  const hits: Hit[] = [];
  ws.forEach((w, i) => {
    if (skip.has(i)) return;
    const h = readWord(w, q, mode);
    if (!h || !Number.isFinite(h.v)) return;
    if (h.tier === 2 && (!bare || QUALIFIER.test(ws[i + 1] ?? "") || BEFORE_BARE.test(ws[i - 1] ?? ""))) return;
    hits.push(h);
  });
  if (!hits.length) return null;
  const best = hits.reduce((a, b) => (b.tier < a.tier ? b : a));
  const alts = best.alt !== undefined ? [best.alt] : [];
  // A resettable fuse names its hold and its trip current: the board may give either.
  if (q === "current" && /\b(?:I?HOLD|I?TRIP)\b/i.test(text)) alts.push(...hits.filter((h) => h !== best && h.tier === 0).map((h) => h.v));
  return { v: best.v, tier: best.tier, alts };
}

/** The value alone (see readReading), or null. */
export function readValue(text: string | null | undefined, q: Quantity, mode: Mode = "description"): number | null {
  return readReading(text, q, mode)?.v ?? null;
}

/** Equal within 1 %. */
export const sameValue = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.01;

/** Two readings agree when any value one may mean is equal to any value the other may mean. */
export const sameReading = (a: Reading, b: Reading) => [a.v, ...a.alts].some((x) => [b.v, ...b.alts].some((y) => sameValue(x, y)));

/** 10 MΩ against 10 mΩ: the same digits with milli and mega mixed up (a typing slip), not another part. */
export const milliMegaSlip = (a: number, b: number) => a > 0 && b > 0 && sameValue(Math.max(a, b) / Math.min(a, b), 1e9);

const SI: [number, string][] = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]];
/** 1.5e-9 F → "1.5 nF"; 2.4e7 Hz → "24 MHz"; 32768 Hz → "32.768 kHz". */
export function formatValue(v: number, q: Quantity): string {
  const unit = UNIT[q];
  if (v === 0) return `0 ${unit}`;
  const [mult, prefix] = SI.find(([m]) => Math.abs(v) >= m * 0.9995) ?? SI[SI.length - 1];
  return `${Number((v / mult).toPrecision(6))} ${prefix}${unit}`;
}

// ── Part names (ICs, transistors, diodes)

const plain = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Package words: a board value that names the package says nothing about which part. */
const PACKAGE_WORD = /^(?:[A-Z]?LGA|[A-Z]{0,2}QFN|[A-Z]{0,2}QFP|[A-Z]{0,2}BGA|[A-Z]?DFN|[A-Z]?SON|T?SSOP|MSOP|SOIC|SOP|SOT|SOD|DIP|PDIP|TO|DO|SMA|SMB|SMC|HC49|DPAK|D2PAK|CSP|WLCSP|LED|CONN)\d/;

/**
 * Whether a board value reads as a part number ("SNP739", "LM358", "1N4148") rather than a value, a package or a
 * generic library name ("LDO_3V3", "MCU", "LGA24"). Only then is it compared with the BoM's part.
 */
export function looksLikePartName(v: string | null | undefined): boolean {
  const t = (v ?? "").trim();
  if (!t || /\s/.test(t) || isNoValue(t)) return false;
  const p = plain(t);
  if (p.length < 4 || PACKAGE_WORD.test(p)) return false;
  if (!(/\d{3,}/.test(p) || /[A-Z]{2,}\d{2,}/.test(p))) return false;
  const qs: Quantity[] = ["capacitance", "resistance", "inductance", "frequency", "current"];
  return !qs.some((q) => readValue(t, q, "field") !== null);
}

/** Packing words that are not part of the part: "/NOPB", "#PBF", "-TR". */
const PACKING = /^(?:NOPB|PBF|TR|CT|T|R|REEL|TAPE|BULK|TUBE)$/;
/**
 * The name with and without a reel or tape ending after a letter ("TLV70033DDCR" / "…DDCT", "…CBU6TR"); a stripped
 * form is kept only while it is six characters or more.
 */
const unpacked = (p: string) => [p, ...["TR", "CT", "R", "T"].filter((e) => p.endsWith(e) && /[A-Z]/.test(p[p.length - e.length - 1] ?? "")).map((e) => p.slice(0, -e.length)).filter((s) => s.length >= 6)];

/** A board name with a lower-case "x" for any one character ("STM32F103C8Tx"), as a pattern; null when it has none. */
function wildcard(board: string): RegExp | null {
  if (!/x/.test(board) || !/[A-Z]/.test(board)) return null;
  const chars = [...board].filter((c) => /[A-Za-z0-9]/.test(c));
  if (chars.filter((c) => c !== "x").length < 4) return null;
  return new RegExp(chars.map((c) => (c === "x" ? "[A-Z0-9]?" : c.toUpperCase())).join(""));
}

/** The board name's pieces found in the part number in order ("LM1117-3.3" in "LM1117IMPX-3.3/NOPB"). */
function inOrder(board: string, n: string): boolean {
  const parts = board.split(/[-_/\s]+/).map(plain).filter(Boolean);
  if (parts.length < 2 || parts[0].length < 4) return false;
  let at = 0;
  for (const p of parts) {
    const i = n.indexOf(p, at);
    if (i < 0) return false;
    at = i + p.length;
  }
  return true;
}

/**
 * The board's part name against the BoM's part numbers and text: the same when one holds the other, ignoring
 * punctuation and case (board "SNP739", BoM "SNP739D01CLE"), when they differ only in a reel letter, when the board's
 * lower-case "x" stands for a character ("STM32F103C8Tx"), or when the board's pieces sit in the part number in order
 * ("LM1117-3.3", "LM1117IMPX-3.3/NOPB"). Texts (value, description, the customer's own part number) may name it too.
 * Null when there is nothing to compare.
 */
export function samePartName(board: string, mpns: (string | null | undefined)[], texts: (string | null | undefined)[] = []): boolean | null {
  const pb = plain(board);
  const given = mpns.filter((m): m is string => !!m?.trim());
  const pieces = given.flatMap((m) => m.split(/\s*(?:\/|;|,|\bOR\b)\s*/i)).map(plain);
  const names = [...new Set([...pieces, ...given.map(plain)])].filter((s) => s.length >= 3 && !PACKING.test(s));
  if (!names.length || pb.length < 4) return null;
  const wild = wildcard(board);
  const ub = unpacked(pb);
  const same = (n: string) => n.includes(pb) || (n.length >= 4 && pb.includes(n)) || unpacked(n).some((x) => ub.some((y) => x.includes(y))) || !!wild?.test(n) || inOrder(board, n);
  if (names.some(same)) return true;
  return texts.some((t) => plain(t ?? "").includes(pb));
}
