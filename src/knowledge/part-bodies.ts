/**
 * What a part looks like, read from what its BoM line says — versioned seed data for the 3D board
 * (src/lib/board/bodies.ts `bodyForLine`). An ordered list of recognisers: each says what it matches (a part-number
 * pattern, words of the description, words of the footprint name) and the body that goes with it — kind, shape,
 * size in mm, colour, pins and pitch — with a one-line note of where the numbers come from.
 *
 * How a line is read: the part number is trusted first, then the description, then the footprint name (CAD library
 * names are the designer's own and are sometimes wrong: a SOT-223 regulator drawn on a "TO263" footprint). Within
 * each of the three the first recogniser in the list wins, so the list runs from the specific to the general:
 * a "HEATSINK TO-220" is a heatsink, not a TO-220.
 *
 * Sizes are datasheet body sizes (x = length along the pin rows, y = width, z = height above the board). A note
 * that says "typical" or "estimate" is a family value, not one maker's drawing.
 */
import type { BodyKind, BodyShape, BodySpec } from "@/lib/board/bodies";

/** Raise when a size or a rule changes, so stored bodies can be told from fresh ones. */
export const PART_BODIES_VERSION = 2;

/** One BoM line as the recognisers see it: every field upper-cased and trimmed; `text` is all three in one. */
export type BodyLine = { mpn: string; description: string; pkg: string; refDes: string; text: string };

export type BodyRecogniser = {
  id: string;
  /** Tested on the part number. */
  mpn?: RegExp;
  /** Tested on the description. */
  description?: RegExp;
  /** Tested on the package / footprint name. */
  pkg?: RegExp;
  /** The body for a line that matched; null when the line turns out not to be this part after all. */
  body: (line: BodyLine, hit: RegExpMatchArray) => BodySpec | null;
  /** Where the sizes come from. */
  source: string;
};

const BLACK = "#1f1f22";
const HEADER_BLACK = "#1c1c1f";
/** Natural (undyed) nylon 6/6: Mini-Fit, KK and JST housings. */
const NYLON = "#e9e4d4";
const ALUMINIUM = "#c9ccd2";
const MLCC_TAN = "#b89466";
const RES_BLACK = "#2a2a2a";
const FERRITE = "#2b2b2e";
const TANTALUM_AMBER = "#c9a227";

const spec = (kind: BodyKind, shape: BodyShape | null, length: number, width: number, height: number, color: string, pins: number, pitch: number): BodySpec => ({
  kind,
  ...(shape ? { shape } : {}),
  length: round(length),
  width: round(width),
  height: round(height),
  color,
  pins,
  pitch,
});
const round = (v: number) => Math.round(v * 100) / 100;

// --- Reading numbers out of a line ------------------------------------------------------------------------------

/** "20POS", "10 Pin", "4 WAY", "6CKT": how many contacts a connector line says it has. */
function positions(t: string): number | null {
  const m = t.match(/(?:^|[^0-9.])(\d{1,3})[-\s]?(?:POS(?:ITION)?S?|PINS?|WAYS?|CKTS?|CIRCUITS?|CONTACTS?)\b/);
  return m ? Number(m[1]) : null;
}

/** Contact pitch a line states ("4.2MM", ".100\"", "2.54"), else the family's usual one. */
function pitchFrom(t: string, usual: number): number {
  if (/(?:^|[^0-9])\.100|0\.1"|2\.54/.test(t)) return 2.54;
  if (/(?:^|[^0-9])\.050|1\.27/.test(t)) return 1.27;
  if (/(?:^|[^0-9])\.079|(?:^|[^0-9.])2(?:\.0+)?\s?MM/.test(t)) return 2;
  if (/(?:^|[^0-9])\.156|3\.96/.test(t)) return 3.96;
  const mm = t.match(/(?:^|[^0-9.])(\d(?:\.\d+)?)\s?MM\b/);
  return mm && Number(mm[1]) >= 0.3 && Number(mm[1]) <= 7.62 ? Number(mm[1]) : usual;
}

/**
 * Connectors that are not a strip of square posts or their sockets, whatever their line calls them: flat-cable and
 * board-to-board connectors (0.3–1 mm pitch, a few millimetres wide however many contacts), D-subs, card and cable
 * sockets. Drawn as a pin strip they come out 100–200 mm long.
 */
const NOT_A_PIN_STRIP = /\bFPC\b|\bFFC\b|\bBTB\b|\bB2B\b|BOARD[-\s]TO[-\s]BOARD|MEZZ|D-?SUB|\bIC\b|DIP|PLCC|\bSIM\b|CARD|USB|HDMI|\bRJ|JACK|COAX|\bEDGE\b/;
/** Square posts and their sockets are made at 1 mm pitch and up. */
const MIN_STRIP_PITCH = 1;

/** "1X20", "2x10", "10X2": the rows and columns of a pin grid. */
function grid(t: string): { rows: number; cols: number } | null {
  const a = t.match(/(?:^|[^0-9.])([1-4])\s?X\s?(\d{1,2})(?![0-9.]|\s?MM)/);
  if (a) return { rows: Number(a[1]), cols: Number(a[2]) };
  const b = t.match(/(?:^|[^0-9.])(\d{1,2})\s?X\s?([1-4])(?![0-9.]|\s?MM)/);
  return b ? { rows: Number(b[2]), cols: Number(b[1]) } : null;
}

/**
 * Rows × columns of a pin header. A grid when the line gives one; else the position count, in two rows when the
 * line says so: "DUAL ROW", a jumper-block footprint ("JUMPER_8POS" holds eight jumpers, so 2 × 8), or TE's
 * two-row AMPMODU breakaway families (826632, 826925, 146257). A line that does not say is laid out in one row;
 * the copper under the part corrects it where there is copper (`headerOnCopper`, src/lib/board/bodies.ts).
 */
function headerGrid(l: BodyLine): { rows: number; cols: number } | null {
  const g = grid(l.text);
  if (g) return g;
  const n = positions(l.description) ?? positions(l.mpn + " " + l.pkg);
  const jumpers = Number(l.pkg.match(/JUMPER[_\s-]?(\d{1,2})[_\s-]?POS/)?.[1] ?? 0);
  if (jumpers && (!n || n === jumpers * 2)) return { rows: 2, cols: jumpers };
  if (!n) return null;
  const dual = /DUAL|DBL|DOUBLE|2[-\s]?ROWS?|TWO[-\s]ROW/.test(l.text) || /(?:^|-)(?:826632|826925|146257)-/.test(l.mpn);
  return dual && n % 2 === 0 ? { rows: 2, cols: n / 2 } : { rows: 1, cols: n };
}

/** Pin count written beside a package word: "144LQFP", "LQFP-144", "8-SOIC", "SO8", "SO-N8". */
function pinsBeside(t: string, word: string): number | null {
  const before = t.match(new RegExp(`(?:^|[^0-9.])(\\d{1,3})[-\\s]?(?:PINS?[-\\s]?|LD[-\\s]?|L[-\\s]?)?(?:${word})(?![A-Z])`));
  if (before) return Number(before[1]);
  const after = t.match(new RegExp(`(?:^|[^A-Z])(?:${word})[-_\\s]?[GNW]?[-_\\s]?(\\d{1,3})(?![0-9.]|X)`));
  return after ? Number(after[1]) : null;
}

/** A body outline written in the line: "(5X5)", "7 X 7 MM". */
function outline(t: string): [number, number] | null {
  const m = t.match(/(?:^|[^0-9.])(\d{1,2}(?:\.\d+)?)\s?[X×]\s?(\d{1,2}(?:\.\d+)?)(?![0-9.])/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** A chip that drives a transformer, a holder for a fuse or a shunt for a header names the part without being it. */
const NOT_THE_PART = /^IC\b|\bDRIVER\b|\bDRVR\b|\bHOLDER\b|\bCLIP\b|\bSHUNT\b/;
/** What goes with a heatsink without being one. (A "clip-on" heatsink is one.) */
const HEATSINK_ACCESSORY = /COMPOUND|GREASE|\bPASTE\b|\bPAD\b|\bTAPE\b|INSULATOR|\bMICA\b|\bKIT\b|\bSCREW|\bFOR\s+(?:A\s+)?HEAT\s?SINK|\bCLIP\s+FOR\b/;
/**
 * A description that names another kind of part than a passive: series letters are short, and other makers use the
 * same ones for transistors, microphones and chips ("MSD…" is a Coilcraft inductor and an onsemi transistor).
 */
const ANOTHER_KIND = /^IC\b|\bTRANS(?:ISTOR)?\b|\bNPN\b|\bPNP\b|MOSFET|\bFET\b|\bDIODE\b|\bMIC(?:ROPHONE)?\b|\bMEMS\b|\bCONN(?:ECTOR)?\b|\bREG(?:ULATOR)?\b|\bMCU\b|\bSWITCH\b|\bLED\b/;
/** An IC package named in a description: the line is a chip, whatever its part number looks like. */
const IC_PACKAGE = /QFN|QFP|DFN|SOIC|SSOP|MSOP|\bSOP\b|\bSON\b|BGA|T?SOT-?\d|SC-?70|\bDIP\b/;

// --- Aluminium cans ---------------------------------------------------------------------------------------------

/** Rated-voltage codes in aluminium-capacitor part numbers (Panasonic, Nichicon, Rubycon, United Chemi-Con). */
const VOLT_CODE: Record<string, number> = { "0G": 4, "0J": 6.3, "1A": 10, "1C": 16, "1E": 25, "1V": 35, "1H": 50, "1J": 63, "1K": 80, "2A": 100, "2C": 160, "2D": 200, "2E": 250, "2V": 350, "2G": 400, "2W": 450 };

/** Capacitance × rated voltage (µF·V), from the description ("68UF 35V") or the part number's codes ("1V680"). */
function chargeOf(l: BodyLine): number | null {
  const uF = l.description.match(/(\d+(?:\.\d+)?)\s?(?:UF|\u039CF|\u00B5F|MFD)/);
  const v = l.description.match(/(?:^|[^0-9.])(\d+(?:\.\d+)?)\s?V(?:DC)?\b/);
  if (uF && v) return Number(uF[1]) * Number(v[1]);
  const code = l.mpn.match(/(0G|0J|1A|1C|1E|1V|1H|1J|1K|2A|2C|2D|2E|2V|2G|2W)(\d\d)(\d)(?!\d)/);
  return code ? VOLT_CODE[code[1]] * Number(code[2]) * 10 ** Number(code[3]) : null;
}

/** Standard can diameters, mm. */
const CAN_DIAMETER = "4|5|6\\.3|8|10|12\\.5|16|18|22|25|30|35";

/** Panasonic's own case codes where they are not a plain diameter: D8 is the 6.3 mm can, 7.7 mm tall. */
const PANASONIC_CASE: Record<string, [number, number]> = { D8: [6.3, 7.7], H13: [12.5, 13.5], J16: [16, 16.5], K16: [18, 16.5] };

/** SMD (V-chip) can sizes by stored charge: [µF·V up to, diameter, height]. */
const SMD_CAN_BY_CHARGE: [number, number, number][] = [[150, 4, 5.4], [400, 5, 5.4], [1000, 6.3, 5.4], [3000, 6.3, 7.7], [7000, 8, 10.2], [16000, 10, 10.2], [40000, 12.5, 13.5], [Infinity, 16, 16.5]];
/** The usual height of an SMD can of each diameter when only the diameter is known. */
const SMD_CAN_HEIGHT: Record<string, number> = { 4: 5.4, 5: 5.4, 6.3: 7.7, 8: 10.2, 10: 10.2, 12.5: 13.5, 16: 16.5, 18: 16.5 };
/** Radial can sizes by stored charge: [µF·V up to, diameter, height]. */
const RADIAL_BY_CHARGE: [number, number, number][] = [[250, 4, 7], [800, 5, 11], [1600, 6.3, 11], [3300, 8, 11.5], [6000, 10, 12.5], [10000, 10, 16], [14000, 10, 20], [25000, 12.5, 20], [33000, 12.5, 25], [56000, 16, 25], [80000, 16, 31.5], [Infinity, 18, 35.5]];

/**
 * Diameter and height of an aluminium can: "8X10.2" written out, a Panasonic case code or a "D8" / "DIA 10"
 * diameter in the footprint name, else the standard case for its capacitance × voltage.
 */
function canSize(l: BodyLine, smd: boolean): [number, number] {
  const written = l.text.match(new RegExp(`(?:^|[^0-9.])(${CAN_DIAMETER})\\s?[X×*]\\s?(\\d{1,2}(?:\\.\\d+)?)(?![0-9.])`));
  if (written) return [Number(written[1]), Number(written[2])];
  const byCharge = (rows: [number, number, number][], cv: number) => rows.find((r) => cv <= r[0]) ?? rows[rows.length - 1];
  const cv = chargeOf(l);
  const usualHeight = (d: number) => (smd ? (SMD_CAN_HEIGHT[String(d)] ?? d) : (RADIAL_BY_CHARGE.filter((r) => r[1] === d).find((r) => (cv ?? 0) <= r[0]) ?? [0, d, d * 1.5])[2]);
  const panasonic = /^EE[EHVUA]/.test(l.mpn) ? l.pkg.match(/(?:^|[^A-Z0-9])(D8|H13|J16|K16)(?![A-Z0-9.])/) : null;
  if (panasonic) return PANASONIC_CASE[panasonic[1]];
  const dia = l.pkg.match(new RegExp(`(?:^|[^A-Z0-9])(?:D|DIA|Ø|Φ)\\s?(${CAN_DIAMETER})(?:\\.0)?(?:MM)?(?![0-9.])`));
  if (dia) return [Number(dia[1]), usualHeight(Number(dia[1]))];
  if (cv !== null) {
    const row = byCharge(smd ? SMD_CAN_BY_CHARGE : RADIAL_BY_CHARGE, cv);
    return [row[1], row[2]];
  }
  return smd ? [6.3, 7.7] : [8, 11.5];
}

/** An SMD can stands on a square plastic base 0.3 mm wider than the can. */
const smdCan = (l: BodyLine) => {
  const [d, h] = canSize(l, true);
  return spec("can", "smdcan", d + 0.3, d + 0.3, h, ALUMINIUM, 2, round(d * 0.6));
};
const radialCan = (l: BodyLine) => {
  const [d, h] = canSize(l, false);
  return spec("can", "electrolytic", d, d, h, "#26272a", 2, d <= 5 ? 2 : d <= 6.3 ? 2.5 : d <= 8 ? 3.5 : d <= 13 ? 5 : 7.5);
};

// --- Chip parts -------------------------------------------------------------------------------------------------

/** Chip sizes by EIA (inch) code: length, width, the usual MLCC thickness and the thick-film resistor thickness. */
const CHIP: Record<string, [number, number, number, number]> = {
  "01005": [0.4, 0.2, 0.2, 0.13],
  "0201": [0.6, 0.3, 0.3, 0.23],
  "0402": [1.0, 0.5, 0.5, 0.35],
  "0603": [1.6, 0.8, 0.8, 0.45],
  "0805": [2.0, 1.25, 0.85, 0.5],
  "1206": [3.2, 1.6, 1.15, 0.55],
  "1210": [3.2, 2.5, 1.6, 0.55],
  "1806": [4.5, 1.6, 1.6, 0.6],
  "1808": [4.5, 2.0, 1.5, 0.6],
  "1812": [4.5, 3.2, 1.6, 0.6],
  "2010": [5.0, 2.5, 1.6, 0.55],
  "2220": [5.7, 5.0, 2.0, 0.6],
  "2512": [6.35, 3.2, 2.0, 0.6],
};
/** Metric size codes that are not also an inch code (0402 and 0603 are read as inch sizes). */
const METRIC_CHIP: Record<string, string> = { "1005": "0402", "1608": "0603", "2012": "0805", "3216": "1206", "3225": "1210", "4516": "1806", "4520": "1808", "4532": "1812", "5025": "2010", "5750": "2220", "6332": "2512" };
const CHIP_CODES = "01005|0201|0402|0603|0805|1206|1210|1806|1808|1812|2010|2220|2512";
const eia = (code: string): string | null => (CHIP[code] ? code : (METRIC_CHIP[code] ?? null));
/**
 * A chip size standing on its own in a description or footprint name: "0805", "C_0603", "RES1206". Four digits
 * with a unit after them are a value ("2220PF", "1206 OHM"), and of several sizes the last is the case — the value
 * comes first in a description.
 */
const CHIP_SIZE = new RegExp(`(?:^|[^0-9.])(${CHIP_CODES})(?![0-9]|(?:[PNUM\u00B5][FH]|[KM]?HZ|MM|PPM)\\b|\\s?[KMR]?\\s?OHMS?\\b)`, "g");
const chipCode = (t: string): string | null => [...t.matchAll(CHIP_SIZE)].pop()?.[1] ?? null;

type ChipClass = "capacitor" | "resistor" | "inductor" | "led" | "other";
const CHIP_COLOUR: Record<ChipClass, string> = { capacitor: MLCC_TAN, resistor: RES_BLACK, inductor: "#3a3a3a", led: "#f2f2ea", other: RES_BLACK };

function chip(code: string, cls: ChipClass, thickness?: number | null): BodySpec {
  const [L, W, capH, resH] = CHIP[code];
  const h = thickness ?? (cls === "capacitor" ? capH : cls === "resistor" ? resH : cls === "led" ? Math.min(0.8, W) : Math.min(capH, W));
  return spec("chip", null, L, W, h, CHIP_COLOUR[cls], 2, round(L * 0.75));
}

/** What a chip-sized part is, from the words of its line, else from its designator. */
function chipClass(l: BodyLine): ChipClass | null {
  const t = l.description + " " + l.pkg;
  // A ferrite bead's "600 OHM" does not make it a resistor: the part's own name is read first.
  if (/FERRITE|\bBEAD\b|\bIND\b|INDUCTOR/.test(t)) return "inductor";
  if (/\bLED\b/.test(t)) return "led";
  if (/\bCAP|MLCC|CERAMIC|\bX[5-8][RSTUV]\b|\bC0G\b|\bNP0\b|(?:^|[^A-Z])CC\d{4}/.test(t)) return "capacitor";
  if (/\bRES\b|RESISTOR|\bOHMS?\b|(?:^|[^A-Z])RC\d{4}/.test(t)) return "resistor";
  if (/THERMISTOR|\bNTC\b|VARISTOR|\bTVS\b|\bESD\b/.test(t)) return "other";
  const prefix = l.refDes.match(/^[A-Z]+/)?.[0] ?? "";
  return ({ C: "capacitor", R: "resistor", L: "inductor", FB: "inductor", LED: "led" } as Record<string, ChipClass>)[prefix] ?? null;
}

/** Murata's thickness letter (GRM21B… is 1.25 mm thick). */
const MURATA_THICKNESS: Record<string, number> = { 2: 0.2, 3: 0.3, 5: 0.5, 6: 0.6, 8: 0.8, 9: 0.85, A: 1.0, M: 1.15, B: 1.25, N: 1.35, C: 1.6, R: 1.8, D: 2.0, E: 2.5 };
const MURATA_SIZE: Record<string, string> = { "03": "0201", "15": "0402", "18": "0603", "21": "0805", "31": "1206", "32": "1210", "43": "1812", "55": "2220" };
const SAMSUNG_SIZE: Record<string, string> = { "03": "0201", "05": "0402", "10": "0603", "21": "0805", "31": "1206", "32": "1210", "43": "1812", "55": "2220" };
const TAIYO_SIZE: Record<string, string> = { "063": "0201", "105": "0402", "107": "0603", "212": "0805", "316": "1206", "325": "1210", "432": "1812" };
const PANASONIC_RES: Record<string, string> = { "1G": "0201", "2R": "0402", "2G": "0402", "3G": "0603", "3E": "0603", "6G": "0805", "6E": "0805", "8G": "1206", "8E": "1206", "14": "1210", "12": "2010", "1T": "2512" };
const ROHM_RES: Record<string, string> = { "006": "0201", "01": "0402", "03": "0603", "10": "0805", "18": "1206", "25": "1210", "50": "2010", "100": "2512" };

// --- Tantalum ---------------------------------------------------------------------------------------------------

/** Moulded tantalum cases (EIA 535BAAC): length, width, height. */
const TANTALUM_CASE: Record<string, [number, number, number]> = { R: [2.0, 1.3, 1.2], P: [2.0, 1.3, 1.2], A: [3.2, 1.6, 1.6], T: [3.5, 2.8, 1.2], B: [3.5, 2.8, 1.9], C: [6.0, 3.2, 2.5], V: [7.3, 4.3, 1.9], D: [7.3, 4.3, 2.8], E: [7.3, 4.3, 4.0], X: [7.3, 4.3, 4.0] };
const TANTALUM_METRIC: Record<string, string> = { "2012": "R", "3216": "A", "3528": "B", "6032": "C", "7343": "D", "1206": "A", "1411": "B", "2312": "C", "2917": "D" };

function tantalum(l: BodyLine): BodySpec | null {
  // Texas Instruments' "TPS…" chips share three letters with a tantalum series: a line that says it is a chip is one.
  if (!/\bCAP|TANT/.test(l.description) && (ANOTHER_KIND.test(l.description) || IC_PACKAGE.test(l.description))) return null;
  const fromMpn = l.mpn.match(/^(?:T49\d|T52\d|T530)([A-Z])|^(?:TAJ|TPS|TCJ|TLJ|TPM)([A-Z])/);
  const named = l.text.match(/CASE[-\s]?([A-EPRTVX])\b/)?.[1];
  const metric = l.text.match(/(?:^|[^0-9])(2012|3216|3528|6032|7343|1411|2312|2917|1206)(?![0-9])/)?.[1];
  const cv = chargeOf(l) ?? 100;
  const letter = fromMpn?.[1] ?? fromMpn?.[2] ?? named ?? (metric ? TANTALUM_METRIC[metric] : cv <= 50 ? "A" : cv <= 150 ? "B" : cv <= 400 ? "C" : cv <= 1000 ? "D" : "E");
  const [L, W, H] = TANTALUM_CASE[letter] ?? TANTALUM_CASE.B;
  return spec("molded", "tantalum", L, W, H, TANTALUM_AMBER, 2, round(L * 0.75));
}

// --- Power inductors --------------------------------------------------------------------------------------------

const powerInductor = (length: number, width: number, height: number) => spec("generic", "power-inductor", length, width, height, "#3a3d40", 2, round(length * 0.8));

/**
 * The "wwhh" size code most shielded power inductors carry: the side in mm when it is 10–19 ("1270" = a 12 mm
 * part), else in tenths ("7030" = 7.0 mm); the height in tenths ("70" = 7.0 mm) unless it is too small to be
 * ("1210" = 12 mm side, 10 mm tall).
 */
function sideAndHeight(code: string): [number, number] {
  const ww = Number(code.slice(0, 2));
  const hh = Number(code.slice(2));
  return [ww >= 10 && ww <= 19 ? ww : ww / 10, hh >= 13 ? hh / 10 : hh];
}

/** Bourns SRP moulded inductors: the real outline for each nominal side (the code rounds it down). */
const BOURNS_SRP_OUTLINE: Record<string, [number, number]> = { 4: [4.45, 4.06], 5: [5.7, 5.2], 6.5: [7.1, 6.5], 7: [7.3, 6.6], 10: [11.0, 10.0], 12: [13.5, 12.5], 17: [17.15, 17.15] };
/** Eaton (Coiltronics / Cooper Bussmann) DR shielded drums: outline and height. */
const EATON_DR: Record<string, [number, number, number]> = { "73": [7.6, 7.6, 3.55], "74": [7.6, 7.6, 4.35], "125": [12.5, 12.5, 6.0], "127": [12.5, 12.5, 8.0], "1030": [10.3, 10.5, 3.0], "1040": [10.3, 10.5, 4.0], "1050": [10.3, 10.5, 5.0] };
/** Würth WE-PD order-code prefixes: outline and height. */
const WURTH_WE_PD: Record<string, [number, number]> = { "744770": [12, 8], "744771": [12, 6], "7447779": [7.3, 4.5], "744778": [7.3, 3.2] };
/** Vishay IHLP profile letters: height in mm. */
const IHLP_HEIGHT: Record<string, number> = { A: 1.2, B: 2.0, C: 3.0, D: 4.0, E: 5.0, F: 6.4, G: 7.0 };
/** Sumida CDRH three-digit sizes: the last digit names a height step. */
const CDRH_HEIGHT: Record<string, number> = { 3: 3.4, 4: 4.5, 5: 6.0, 7: 8.0, 8: 8.0 };

// --- Packages ---------------------------------------------------------------------------------------------------

/** LQFP / TQFP bodies by pin count (JEDEC MS-026): side × side, pitch. */
const QFP_BODY: Record<number, [number, number, number]> = {
  32: [7, 7, 0.8],
  44: [10, 10, 0.8],
  48: [7, 7, 0.5],
  52: [10, 10, 0.65],
  64: [10, 10, 0.5],
  80: [12, 12, 0.5],
  100: [14, 14, 0.5],
  120: [16, 16, 0.5],
  128: [14, 14, 0.4],
  144: [20, 20, 0.5],
  176: [24, 24, 0.5],
  208: [28, 28, 0.5],
  216: [24, 24, 0.4],
  256: [28, 28, 0.4],
};
/** The usual QFN side for a pin count at 0.5 mm pitch (JEDEC MO-220). */
const QFN_SIDE: Record<number, number> = { 8: 3, 10: 3, 12: 3, 16: 3, 20: 4, 24: 4, 28: 5, 32: 5, 36: 6, 40: 6, 44: 7, 48: 7, 56: 8, 64: 9, 68: 10, 72: 10, 76: 9, 80: 12, 88: 12, 100: 12 };
/** TSSOP body length by pin count (JEDEC MO-153). */
const TSSOP_LENGTH: Record<number, number> = { 8: 3.0, 14: 5.0, 16: 5.0, 20: 6.5, 24: 7.8, 28: 9.7, 38: 9.7, 48: 12.5, 56: 14.0, 64: 17.0 };
/** SSOP (5.3 mm wide) body length by pin count (JEDEC MO-150). */
const SSOP_LENGTH: Record<number, number> = { 8: 3.0, 14: 6.2, 16: 6.2, 20: 7.2, 24: 8.2, 28: 10.2 };
/** SOIC body length by pin count: narrow (3.9 mm, JEDEC MS-012) and wide (7.5 mm, MS-013). */
const SOIC_NARROW: Record<number, number> = { 8: 4.9, 14: 8.65, 16: 9.9 };
const SOIC_WIDE: Record<number, number> = { 16: 10.3, 18: 11.55, 20: 12.8, 24: 15.4, 28: 17.9 };

function qfp(pins: number, t: string): BodySpec | null {
  const written = outline(t);
  const size = written && written[0] >= 4 && written[0] <= 40 && written[1] >= 4 && written[1] <= 40 ? written : null;
  const known = QFP_BODY[pins];
  if (!known && !size) return null;
  const [L, W] = size ?? [known[0], known[1]];
  return spec("quad", null, L, W, /TQFP/.test(t) ? 1.0 : /[PM]QFP/.test(t) ? 2.7 : 1.4, BLACK, pins, known?.[2] ?? 0.5);
}

function qfn(pins: number, t: string): BodySpec {
  const written = outline(t);
  const side = QFN_SIDE[pins] ?? Math.max(3, Math.ceil(pins / 8) + 1);
  const [L, W] = written && written[0] >= 1 && written[0] <= 14 && written[1] >= 1 && written[1] <= 14 ? written : [side, side];
  return spec("leadless", null, L, W, /UQFN|UFQFN|X2?QFN/.test(t) ? 0.55 : /WQFN|WFQFN/.test(t) ? 0.75 : 0.85, BLACK, pins, pins <= 8 && L >= 3 ? 0.65 : 0.5);
}

function tssop(pins: number): BodySpec {
  const fine = pins === 38 || pins >= 48;
  return spec("gullwing", null, TSSOP_LENGTH[pins] ?? round((pins / 2) * (fine ? 0.5 : 0.65) + 0.3), pins >= 48 ? 6.1 : 4.4, 1.0, BLACK, pins, fine ? 0.5 : 0.65);
}

function soic(pins: number, l: BodyLine): BodySpec {
  // Sixteen pins come in both widths. The line says which, or the part number: Texas Instruments' wide body is "DW".
  const wide = pins >= 18 || (pins === 16 && (/WIDE|SOIC-?16W|16-?SOIC-?W|\bDW\b|7\.5\s?MM|\.300|300\s?MIL/.test(l.text) || /[0-9A-Z]DW(?:R|T)?(?:G4|Q1)?$/.test(l.mpn)));
  const length = (wide ? SOIC_WIDE[pins] : SOIC_NARROW[pins]) ?? round((pins / 2) * 1.27 + 0.2);
  return spec("gullwing", null, length, wide ? 7.5 : 3.9, wide ? 2.35 : 1.5, BLACK, pins, 1.27);
}

/** STM32 part numbers name their own package: the pin-count letter, then the package letter. */
const STM32_PINS: Record<string, number> = { F: 20, G: 28, K: 32, T: 36, S: 44, C: 48, R: 64, M: 80, V: 100, Q: 132, Z: 144, I: 176, B: 208 };

// --- Connectors -------------------------------------------------------------------------------------------------

const pinHeader = (rows: number, cols: number, pitch: number) => spec("connector", "header", cols * pitch, rows * pitch, pitch < 2 ? 4.5 : 8.5, HEADER_BLACK, rows * cols, pitch);

/** Molex Mini-Fit Jr. order numbers, also in the ten-digit form (0039281043): series, then the circuits in the 2nd–3rd digits. */
const MINI_FIT_NUMBER = /^(?:00)?39-?(28|29|30)-?\d(\d\d)\d$/;

/** Molex Mini-Fit Jr. header: two rows at 4.2 mm; the housing is 1.2 mm longer than its circuits. */
const miniFit = (circuits: number, rightAngle: boolean) => {
  const n = Math.max(2, circuits + (circuits % 2));
  return spec("connector", "minifit", (n / 2) * 4.2 + 1.2, rightAngle ? 12.8 : 9.6, rightAngle ? 9.6 : 12.8, NYLON, n, 4.2);
};

/** A one-row wire-to-board header with a locking wall (Molex KK / SL, JST XH / PH / VH / EH), `length` long over all. */
const lockHeader = (circuits: number, pitch: number, length: number, width: number, height: number, color: string) => spec("connector", "kk-header", length, width, height, color, circuits, pitch);

/** A 2 × N shrouded IDC header at 2.54 mm; with ejector latches it is longer and the levers stand above the shroud. */
function boxHeader(pins: number, latches: boolean, pitch: number): BodySpec {
  const cols = Math.max(2, Math.ceil(pins / 2));
  const k = pitch / 2.54;
  return latches
    ? spec("connector", "latch-header", (cols - 1) * pitch + 22.9 * k, 9.4 * k, 15.4 * k, HEADER_BLACK, cols * 2, pitch)
    : spec("connector", "box-header", (cols - 1) * pitch + 10.16 * k, 8.9 * k, 9.1 * k, HEADER_BLACK, cols * 2, pitch);
}

// --- Magnetics --------------------------------------------------------------------------------------------------

/** RM core footprints (IEC 62317-4): side and height of the clipped pair. */
const RM_CORE: Record<number, [number, number]> = { 4: [9.8, 10.4], 5: [12.3, 10.4], 6: [14.7, 12.4], 7: [17.2, 13.4], 8: [19.7, 16.4], 10: [24.7, 18.6], 12: [29.8, 24.5], 14: [34.7, 30.1] };

/**
 * A wound transformer from the core its line names. An E core "E32/16/9" is 32 mm wide, each half 16 mm long and
 * the stack 9 mm thick; on a horizontal bobbin the winding stands about 0.7 × the width tall and the pin rails add
 * to the length of the pair. Other families by their own proportions.
 */
function transformer(l: BodyLine): BodySpec | null {
  if (NOT_THE_PART.test(l.description)) return null;
  const pins = positions(l.text) ?? 10;
  const core = l.text.match(/(?:^|[^A-Z0-9])(ETD|EFD|EE|EF|EI|ER|EC|EP|EQ|PQ|RM|E)[-\s]?(\d{1,2})(\d{2})?(?:\/(\d{1,2}(?:\.\d)?)(?:\/(\d{1,2}(?:\.\d)?))?)?(?![0-9])/);
  const of = (length: number, width: number, height: number, pitch: number) => spec("module", "transformer", length, width, height, FERRITE, pins, pitch);
  if (!core) return of(25, 21, 20, 3.81);
  const [, family, n1, n2, half, stack] = core;
  const a = Number(n1);
  const pitch = a >= 30 ? 5.08 : a >= 19 ? 3.81 : 2.54;
  if (family === "RM") {
    const [side, high] = RM_CORE[a] ?? [a * 2.47, a * 2.05];
    return of(side, side, high + 2.5, a >= 10 ? 3.81 : 2.54);
  }
  if (family === "PQ" && n2) return of(a + 0.5, a * 0.72, Number(n2) + 3.5, pitch);
  if (family === "EP") return of(a * 1.05, a * 0.75, a + 1, 2.54);
  if (family === "EFD") return of(a + 2, a + 5, a * 0.42 + 2, a >= 25 ? 3.81 : 2.54);
  if (family === "ETD") return of(a + 2, a + 8, a * 0.75 + 4, 5.08);
  const pair = half ? Number(half) * 2 : a * 0.9;
  return of(a + 1.5, pair + 5, Math.max((stack ? Number(stack) : a * 0.3) + 3, a * 0.7 + 3), pitch);
}

// --- The list ---------------------------------------------------------------------------------------------------

const DIODE_PACKAGES: [RegExp, [number, number, number]][] = [
  [/\bSMA\b|DO-?214-?AC/, [4.3, 2.6, 2.2]],
  [/\bSMB\b|DO-?214-?AA/, [4.3, 3.6, 2.3]],
  [/\bSMC\b|DO-?214-?AB/, [6.9, 5.9, 2.3]],
  [/SOD-?123(?:F|FL|W)?/, [2.7, 1.6, 1.1]],
  [/SOD-?323|SC-?76/, [1.7, 1.3, 0.95]],
  [/SOD-?523|SC-?79/, [1.2, 0.8, 0.6]],
  [/SOD-?128/, [3.8, 2.5, 1.0]],
  [/SOD-?80|MINI-?MELF/, [3.5, 1.5, 1.5]],
];
const DIODE_WORDS = /\bSM[ABC]\b|DO-?214-?A[ABC]|SOD-?(?:123|323|523|128|80)|SC-?7[69]|MINI-?MELF/;

const SMALL_OUTLINE: [RegExp, [number, number, number, number, number]][] = [
  // [pattern, [length, width, height, pins, pitch]]
  [/SOT-?23-?6|TSOT-?23-?6|SOT-?26|SC-?74\b/, [2.9, 1.6, 1.1, 6, 0.95]],
  [/SOT-?23-?5|TSOT-?23-?5|SOT-?25|SC-?74A/, [2.9, 1.6, 1.1, 5, 0.95]],
  [/SOT-?363|SC-?70-?6|SC-?88\b/, [2.0, 1.25, 0.95, 6, 0.65]],
  [/SOT-?353|SC-?70-?5|SC-?88A/, [2.0, 1.25, 0.95, 5, 0.65]],
  [/SOT-?323|SC-?70/, [2.0, 1.25, 0.95, 3, 0.65]],
  [/SOT-?563|SOT-?666/, [1.6, 1.2, 0.55, 6, 0.5]],
  [/SOT-?523|SC-?89|SOT-?416/, [1.6, 0.8, 0.75, 3, 0.5]],
  [/SOT-?89/, [4.5, 2.5, 1.5, 3, 1.5]],
  [/SOT-?143/, [2.9, 1.3, 1.0, 4, 1.9]],
  [/SOT-?23|TO-?236/, [2.9, 1.3, 1.0, 3, 0.95]],
];
const SMALL_OUTLINE_WORDS = /T?SOT-?(?:23|25|26|89|143|323|353|363|416|523|563|666)|SC-?(?:70|74|88|89)|TO-?236/;

const SMD_CRYSTAL: [RegExp, [number, number, number, number]][] = [
  // [pattern, [length, width, height, pads]]
  [/7050|7\.0\s?X\s?5\.0|^ABM7|^NX7050/, [7.0, 5.0, 1.3, 4]],
  [/5032|5\.0\s?X\s?3\.2|^ABM3|^NX5032|^7B-/, [5.0, 3.2, 1.1, 4]],
  [/3225|3\.2\s?X\s?2\.5|^ABM8|^NX3225|^FA-238|^TSX-3225|^7M-/, [3.2, 2.5, 0.8, 4]],
  [/2520|2\.5\s?X\s?2\.0|^ABM10|^NX2520|^FA-20H/, [2.5, 2.0, 0.6, 4]],
  [/2016|2\.0\s?X\s?1\.6|^ABM11|^NX2016|^FA-128|^8Y-/, [2.0, 1.6, 0.5, 4]],
  [/1612|1\.6\s?X\s?1\.2|^ABM12|^NX1612/, [1.6, 1.2, 0.4, 4]],
  [/3215|3\.2\s?X\s?1\.5|^ABS07|^FC-135|^CM315|^ECS-\.327-.*-34/, [3.2, 1.5, 0.9, 2]],
  [/2012|2\.0\s?X\s?1\.2|^ABS06|^FC-12M|^CM212/, [2.0, 1.2, 0.6, 2]],
];

const FUSE_WHITE = "#e9e6dc";
const POLYFUSE_GREEN = "#2e4034";
/** Resettable (PPTC) fuses: thickness by chip size (Littelfuse nnnnL, Bourns MF-xSMF). */
const POLYFUSE_HEIGHT: Record<string, number> = { "0402": 0.5, "0603": 0.7, "0805": 0.9, "1206": 0.9, "1210": 0.9, "1812": 1.1, "2010": 1.1, "2512": 1.3 };
const BOURNS_PPTC: Record<string, string> = { PSMF: "0805", NSMF: "1206", USMF: "1210", MSMF: "1812", FSMF: "0603", PSHT: "0805", NSHT: "1206", MSHT: "1812" };

function polyfuse(code: string | null): BodySpec {
  if (code === "2016") return spec("chip", "fuse", 5.0, 4.0, 1.1, POLYFUSE_GREEN, 2, 3.8);
  if (code === "2920") return spec("chip", "fuse", 7.4, 5.1, 1.6, POLYFUSE_GREEN, 2, 5.6);
  const c = code && CHIP[code] ? code : "1812";
  return spec("chip", "fuse", CHIP[c][0], CHIP[c][1], POLYFUSE_HEIGHT[c] ?? 1.1, POLYFUSE_GREEN, 2, round(CHIP[c][0] * 0.75));
}

/** Board-mount extruded heatsinks for one TO-220, 34.92 mm wide and 12.7 mm deep, on two solder pins 25.4 mm apart. */
const pinHeatsink = (height: number) => spec("generic", "heatsink", 34.92, 12.7, height, "#17181a", 2, 25.4);

export const PART_BODIES: BodyRecogniser[] = [
  // ---- Heatsinks (before the TO-220 they are made for) ----
  {
    id: "heatsink-aavid-5131",
    mpn: /^5(?:13|31)([0-3])02[BUV]\d{5}G?$/,
    body: (_l, m) => pinHeatsink([25.4, 38.1, 50.8, 63.5][Number(m[1])]),
    source: "Aavid (Boyd) 5130 / 5310 series outline: 34.92 × 12.7 mm, 1.0 / 1.5 / 2.0 / 2.5 in tall (the 1.5 in one is 38.1 mm, distributor data)",
  },
  {
    id: "heatsink-aavid-5298",
    mpn: /^529802[BUV]\d{5}G?$/,
    body: () => spec("generic", "heatsink", 41.91, 25.4, 38.1, "#17181a", 2, 25.4),
    source: "Aavid 529802B02500G: 41.91 × 25.4 × 38.1 mm (distributor data)",
  },
  {
    id: "heatsink",
    description: /HEAT\s?SINK/,
    pkg: /HEAT\s?SINK/,
    body: (l) => {
      if (HEATSINK_ACCESSORY.test(l.description)) return null;
      const inches = l.description.match(/(\d(?:\.\d+)?)\s?(?:"|IN\b|INCH)/);
      const mm = l.description.match(/(\d{2}(?:\.\d+)?)\s?MM/);
      const tall = inches ? Number(inches[1]) * 25.4 : mm ? Number(mm[1]) : null;
      // A height, pins or "vertical" means the board-mount extrusion; otherwise the small clip-on kind.
      if (tall || /PINS?\b|VERT|BOARD|BRD|TALL/.test(l.description)) return pinHeatsink(tall && tall >= 10 && tall <= 80 ? tall : 25.4);
      return spec("generic", "heatsink", 19.05, 13.21, 12.7, "#17181a", 0, 0);
    },
    source: "Typical TO-220 heatsinks: board-mount extrusion 34.92 × 12.7 mm at the stated height; clip-on 19.05 × 13.21 × 12.7 mm (Aavid 5073 / 5772)",
  },

  // ---- Aluminium and tantalum capacitors ----
  {
    id: "smd-can",
    mpn: /^EE[EHV]-?[A-Z]|^U(?:WT|CD|UD|WX|CL|CM|CZ|UR|UX|WZ|CW|WG|CB|WD|WP|WF|WJ|UQ|UE)\d[A-Z]\d|^E(?:MVE|MZA|MVY|MZR|MVA|MHB|MZJ|MVH|MZK|MLA|MKZ)\d|^865\d{6}|^ED[KH]\d|^(?:PCV|PXA|APXA|HHX[A-D])\d/,
    description: /(?:\bCAP|ALUM|ELECTROLYTIC|POLYMER).*(?:ALUM|ELECTROLYTIC|\bELEC\b|HYBRID).*\b(?:SMD|SMT|SURFACE)\b|V-?CHIP/,
    pkg: /V-?CHIP|CP_ELEC|(?:ELEC|ALUM|ELCAP|ELKO)[A-Z]*[_\s-]?.*SM[DT]|SM[DT].*(?:ELEC|ALUM)/,
    body: smdCan,
    source: "SMD can sizes of Panasonic EEE / EEH / EEV, Nichicon UWT / UCD and United Chemi-Con MV series: Ø4–18 mm on a square base; the EEH-ZA 6.3 mm can is 7.7 mm tall (case D8, distributor data); unsized lines estimated from µF × V",
  },
  {
    id: "radial-can",
    mpn: /^(?:EEU|ECA|EEA)-?[A-Z0-9]|^U(?:VR|VZ|PW|PM|HE|HW|PJ|PS|VK|VY|KA|FW|ES|RS|LD|BT|HD|HV|PA)\d[A-Z]\d|^\d+(?:\.\d+)?(?:ZLH|ZLJ|ZLQ|ZL|YXF|YXG|YXJ|YXM|PX|YK|ML|TXW)\d|^860\d{6}/,
    description: /(?:\bCAP|ALUM|ELECTROLYTIC).*(?:ALUM|ELECTROLYTIC|\bELEC\b)/,
    pkg: /CP_RADIAL|RADIAL[_\s-]?D|(?:^|[^A-Z])(?:ELKO|ELCAP)/,
    body: radialCan,
    source: "Standard radial can sizes Ø4 × 7 … Ø18 × 35.5 mm (Panasonic EEU, Nichicon UVR / UPW, Rubycon YXF / ZLH); unsized lines estimated from µF × V",
  },
  {
    id: "tantalum",
    mpn: /^(?:T49\d|T52\d|T530|TAJ|TPS|TCJ|TLJ|TPM)[A-EPRTVWXY]\d{3}[JKM]\d{3}|^F9[1-8]\d[A-Z]\d{3}[KM]|^[25]93D\d{3}X|^TR3[A-E]\d{3}[KM]/,
    description: /\bTANT/,
    pkg: /\bTANT|(?:^|[^A-Z])CT(?:3216|3528|6032|7343)/,
    body: tantalum,
    source: "EIA 535BAAC moulded tantalum cases A 3216 … E 7343 (Kemet T491, AVX TAJ / TPS); part numbers in their full form only: series, case letter, three capacitance digits, tolerance letter, voltage",
  },

  // ---- Shielded and moulded power inductors ----
  {
    id: "inductor-bourns-srp",
    mpn: /^SRP(\d{4})/,
    body: (l, m) => {
      if (ANOTHER_KIND.test(l.description)) return null;
      const [side, h] = sideAndHeight(m[1]);
      const [L, W] = BOURNS_SRP_OUTLINE[String(side)] ?? [side, side];
      return powerInductor(L, W, h);
    },
    source: "Bourns SRP series: SRPwwhh = nominal side and height in 0.1 mm (SRP1270 = 13.5 × 12.5 mm footprint class, 7.0 mm max height; distributors list 13.7 × 13.7 × 7.0 max)",
  },
  {
    id: "inductor-bourns-srr",
    mpn: /^S(?:RR|RU|RN|DR)(\d{4})/,
    body: (l, m) => {
      if (ANOTHER_KIND.test(l.description)) return null;
      const [side, h] = sideAndHeight(m[1]);
      return powerInductor(side + (side >= 10 ? 0.5 : 0), side + (side >= 10 ? 0.5 : 0), h);
    },
    source: "Bourns SRR / SRU / SRN / SDR shielded drums: size code = side and height (SRR1260 = 12.5 × 12.5 × 6.0 mm)",
  },
  {
    id: "inductor-coilcraft",
    mpn: /^(?:X[AFEG]L|MS[SD]|LPS)(\d{4})[A-Z]?-\d{3}[A-Z]/,
    body: (l, m) => {
      if (ANOTHER_KIND.test(l.description)) return null;
      const [side, h] = sideAndHeight(m[1]);
      return powerInductor(side + 0.3, side + 0.3, h + 0.1);
    },
    source: "Coilcraft XAL / XFL / MSS / MSD / LPS: size code = side and height in 0.1 mm (XAL7030 = 7.5 × 7.5 × 3.1 mm, MSS1260 = 12.3 × 12.3 × 6.0 mm); the number must go on as Coilcraft's do (-222MEC: value code and tolerance)",
  },
  {
    id: "inductor-eaton-dr",
    mpn: /^DR[AQ]?(73|74|125|127|1030|1040|1050)-/,
    body: (_l, m) => powerInductor(...EATON_DR[m[1]]),
    source: "Eaton (Coiltronics) DR datasheet: DR73 7.6 × 7.6 × 3.55, DR74 7.6 × 7.6 × 4.35, DR125 12.5 × 12.5 × 6.0, DR127 12.5 × 12.5 × 8.0 mm",
  },
  {
    id: "inductor-wurth-we-pd",
    mpn: /^(7447779|744770|744771|744778)\d/,
    body: (_l, m) => powerInductor(WURTH_WE_PD[m[1]][0], WURTH_WE_PD[m[1]][0], WURTH_WE_PD[m[1]][1]),
    source: "Würth WE-PD: 744770 = 1280 (12 × 12 × 8), 744771 = 1260 (12 × 12 × 6), 7447779 = 7345 (7.3 × 7.3 × 4.5), 744778 = 7332 (7.3 × 7.3 × 3.2 mm)",
  },
  {
    id: "inductor-vishay-ihlp",
    mpn: /^IHLP-?(\d{2})\d{2}([A-G])[A-Z]/,
    body: (_l, m) => powerInductor(Number(m[1]) * 0.254 + 0.4, Number(m[1]) * 0.254 + 0.2, IHLP_HEIGHT[m[2]]),
    source: "Vishay IHLP: size code in 0.01 in (2525 = 6.86 × 6.47 mm), profile letter = height (CZ 3.0, DZ 4.0 mm)",
  },
  {
    id: "inductor-sumida-cdrh",
    mpn: /^CDRH(?:(\d{1,2})D(\d{2})|(\d{2})(\d))/,
    body: (_l, m) => (m[1] ? powerInductor(Number(m[1]) + 0.7, Number(m[1]) + 0.7, Number(m[2]) / 10 + 0.2) : powerInductor(Number(m[3]), Number(m[3]), CDRH_HEIGHT[m[4]] ?? Number(m[4]))),
    source: "Sumida CDRH: CDRH127 = 12 × 12 × 8.0, CDRH125 = 12 × 12 × 6.0, CDRH6D28 = 6.7 × 6.7 × 3.0 mm",
  },
  {
    id: "inductor-tdk",
    mpn: /^(?:SLF|VLS|CLF|LTF|VLF|VLCF|SPM)(\d{4,6})[A-Z]{0,4}-(?:\d?R\d+|\d{2,3})[A-Z]/,
    body: (l, m) => {
      if (ANOTHER_KIND.test(l.description)) return null;
      const d = m[1];
      if (d.length === 6) return powerInductor(Number(d.slice(0, 2)) / 10, Number(d.slice(2, 4)) / 10, Number(d.slice(4)) / 10);
      const side = Number(d.slice(0, d.length - 2)) / 10;
      return powerInductor(side, side, Number(d.slice(-2)) / 10);
    },
    source: "TDK SLF / VLS / CLF / SPM: size code = side and height in 0.1 mm (SLF12575 = 12.5 × 12.5 × 7.5, VLS252012 = 2.5 × 2.0 × 1.2 mm); the number must go on as TDK's do (T-100M, HBX-2R2M: letters, then the value code)",
  },
  {
    id: "inductor-power",
    description: /\bIND(?:UCTOR)?\b.*(?:SHIELD|\bPWR\b|POWER|\b\d+(?:\.\d+)?A\b)|\bCHOKE\b.*\b(?:SMD|SMT)\b/,
    body: (l) => {
      if (NOT_THE_PART.test(l.description) || chipCode(l.description + " " + l.pkg)) return null;
      const size = outline(l.description);
      if (size && size[0] >= 2 && size[0] <= 30) return powerInductor(size[0], size[1], Math.max(1, Math.min(size[0], size[1]) * 0.5));
      const amps = Number(l.description.match(/(?:^|[^0-9.])(\d+(?:\.\d+)?)\s?A\b/)?.[1] ?? 0);
      return amps >= 15 ? powerInductor(13.5, 12.5, 6.5) : amps >= 6 ? powerInductor(10.3, 10.5, 4.0) : amps > 0 && amps < 1.5 ? powerInductor(6.0, 6.0, 3.0) : powerInductor(7.3, 7.3, 4.5);
    },
    source: "Estimate from the rated current when no series is recognised: 6 mm, 7.3 mm, 10 mm and 12.5 mm shielded classes",
  },

  // ---- Transformers ----
  {
    id: "current-sense-transformer-pulse-fis",
    mpn: /^FIS1\d\d(?:NL)?$/,
    body: () => spec("module", "ct-transformer", 17.6, 15.0, 12.5, "#e6dcc3", 3, 5.08),
    source: "Pulse FIS1xx through-hole current-sense transformers: 17.6 × 15.0 mm, 12.5 mm seated height (distributor data)",
  },
  {
    id: "current-sense-transformer",
    description: /(?:CUR+(?:ENT)?\.?|CURR)\s?SENSE.*(?:XFRMR|XFMR|TRANSFORMER|TRANS\b)|(?:XFRMR|XFMR|TRANSFORMER).*(?:CUR+(?:ENT)?\.?|CURR)\s?SENSE/,
    body: (l) => (NOT_THE_PART.test(l.description) || /\bSMD\b|\bSMT\b|SURFACE/.test(l.description) ? null : spec("module", "ct-transformer", 17.6, 15.0, 12.5, "#e6dcc3", 3, 5.08)),
    source: "Typical through-hole encapsulated current-sense transformer, 17.6 × 15 × 12.5 mm (Pulse FIS class); SMD ones are left to their package",
  },
  {
    id: "transformer",
    description: /TRANSFORMER|XFRMR|XFMR|\bFLYBACK\b/,
    pkg: /TRANSFORMER|XFRMR|XFMR|^(?:ETD|EFD|EE|EF|EI|ER|EP|PQ|RM|E)[-\s]?\d{1,4}(?:\/\d|$|[_\s-])/,
    body: transformer,
    source: "Ferrite core outlines (TDK / Ferroxcube E, EF, ETD, EFD, PQ, RM): an E core named a/b/c is a mm wide, each half b mm long, the stack c mm thick; wound height and pin rails estimated from the core",
  },

  // ---- Wire-to-board and board-to-board connectors ----
  {
    id: "molex-mini-fit-jr",
    mpn: /^(?:00)?39-?(?:28|29|30)-?\d{4}$|^556[69]-?\d\d/,
    description: /MINI-?FIT|HEADER.*\b4\.20?\s?MM\b|\b4\.20?\s?MM\b.*HEADER/,
    pkg: /MINI-?FIT|^(?:00)?39-?(?:28|29|30)-?\d{4}$|(?:^|[^0-9])556[69](?:[^0-9]|$)/,
    body: (l) => {
      const fromNumber = l.mpn.match(MINI_FIT_NUMBER) ?? l.pkg.match(MINI_FIT_NUMBER);
      const old = l.mpn.match(/^556([69])-?(\d\d)/);
      const circuits = fromNumber ? Number(fromNumber[2]) : old ? Number(old[2]) : positions(l.text);
      if (!circuits) return null;
      return miniFit(circuits, fromNumber?.[1] === "30" || old?.[1] === "9" || /\bR\/?A\b|RIGHT[-\s]?ANGLE|\bRT\s?ANG/.test(l.description));
    },
    source: "Molex Mini-Fit Jr. 5566 / 5569 headers (39-28, 39-29, 39-30): 4.2 mm pitch, two rows, circuits = 2nd–3rd digits of the last group; 4 circuits = 9.6 × 9.6 × 12.8 mm",
  },
  {
    id: "molex-kk-254",
    mpn: /^(?:00)?22-?(?:23|27|11|03|04|05|28|29)-?\d(\d\d)\d$|^(?:AE-)?6410-?(\d\d)/,
    description: /\bKK[-\s]?(?:254|100)?\b.*HEADER|HEADER.*\bKK\b/,
    body: (l, m) => {
      const n = Number(m[1] ?? m[2]) || positions(l.text);
      return n ? lockHeader(n, 2.54, n * 2.54, 5.8, 10.3, NYLON) : null;
    },
    source: "Molex KK 254 (6410, 22-23-20xx) friction-lock header: 2.54 mm × circuits long, 5.8 mm deep; height approximate (3.2 mm base, lock wall and pin tips about 10 mm)",
  },
  {
    id: "molex-kk-396",
    mpn: /^(?:00)?26-?(?:60|48|61|04|03)-?\d(\d\d)\d$/,
    body: (_l, m) => lockHeader(Number(m[1]), 3.96, Number(m[1]) * 3.96, 8.0, 13.5, NYLON),
    source: "Molex KK 396 (26-60-40xx) header: 3.96 mm × circuits long; depth and height approximate",
  },
  {
    id: "molex-sl",
    mpn: /^0?(?:70543|70553|70545)-?\d\d(\d\d)$/,
    body: (l, m) => {
      const n = positions(l.description) ?? Number(m[1]) + 1;
      return lockHeader(n, 2.54, n * 2.54 + 2.5, 6.4, 11.9, HEADER_BLACK);
    },
    source: "Molex SL 70543 / 70553 shrouded header: 2.54 mm pitch, circuits = last two digits + 1 (-0001 = 2); housing size approximate, drawing not read",
  },
  {
    id: "jst-wire-to-board",
    mpn: /^B(\d{1,2})[BP]-(XH|PH|VH|EH)/,
    body: (_l, m) => {
      const n = Number(m[1]);
      if (m[2] === "XH") return lockHeader(n, 2.5, (n - 1) * 2.5 + 4.9, 5.75, 7.0, NYLON);
      if (m[2] === "PH") return lockHeader(n, 2.0, (n - 1) * 2.0 + 3.9, 4.5, 6.0, NYLON);
      if (m[2] === "VH") return lockHeader(n, 3.96, (n - 1) * 3.96 + 3.9, 9.4, 11.0, NYLON);
      return lockHeader(n, 2.5, (n - 1) * 2.5 + 5.0, 3.8, 6.0, NYLON);
    },
    source: "JST XH (2.5 mm, A + 4.9 × 5.75 × 7.0), PH (2.0 mm, A + 3.9 × 4.5 × 6.0), VH (3.96 mm) and EH (2.5 mm) top-entry headers",
  },
  {
    id: "box-header",
    mpn: /^N?25(\d\d)-[56]|^30[23]-[SR](\d\d)\d|^612(\d{3})21[67]21/,
    description: /\bFRC\b|\bIDC\b|BOX\s?HEADER|SHROUDED.*HEADER|HEADER.*SHROUD|EJECT|LATCH.*HEADER|HEADER.*LATCH/,
    pkg: /(?:^|[^A-Z])(?:FRC|IDC)(?![A-Z])|BOX[_\s-]?HEADER|SHROUD|EJECT/,
    body: (l, m) => {
      const g = grid(l.text);
      const pins = Number(m[1] ?? m[2] ?? m[3]) || positions(l.text) || (g ? g.rows * g.cols : 0);
      if (!pins) return null;
      const latches = /LATCH|EJECT/.test(l.text) && !/(?:WITHOUT|W\/O|NO)\s?(?:SIDE\s)?(?:LATCH|EJECT)/.test(l.text);
      return boxHeader(pins, latches, pitchFrom(l.description, 2.54));
    },
    source: "Typical 2.54 mm IDC box headers (3M 2500 / 3000, Würth WR-BHD): 10 way = 20.3 × 8.9 × 9.1 mm; with ejector latches about 33 × 9.4 × 15 mm",
  },
  {
    id: "terminal-block",
    description: /TERM(?:INAL)?\.?\s?BL(?:OC)?K|SCREW\s?TERM/,
    pkg: /TERM(?:INAL)?[_\s-]?BL(?:OC)?K|SCREW[_\s-]?TERM/,
    body: (l) => {
      const n = positions(l.text) ?? 2;
      const pitch = pitchFrom(l.description, 5.08);
      return spec("connector", "terminal", n * pitch, pitch >= 5 ? 8 : 7, pitch >= 5 ? 10 : 8.5, "#2f8a43", n, pitch);
    },
    source: "Typical PCB screw terminal blocks: 5.0 / 5.08 mm pitch 8 mm deep 10 mm tall, 3.5 / 3.81 mm pitch 7 × 8.5 mm",
  },
  {
    id: "pin-socket",
    description: /(?:CONN|HEADER|HDR|STRIP).*\b(?:RCPT|RECEPTACLE|SOCKET|FEMALE)\b|\b(?:RCPT|RECEPTACLE|SOCKET|FEMALE)\b.*(?:HEADER|HDR|STRIP)/,
    body: (l) => {
      // A socket for a chip, a card, a flat cable or a cable plug is not a strip of contacts.
      const pitch = pitchFrom(l.description, 2.54);
      if (NOT_A_PIN_STRIP.test(l.description) || pitch < MIN_STRIP_PITCH) return null;
      const g = headerGrid(l);
      return g ? spec("connector", null, g.cols * pitch, g.rows * pitch, pitch < 2 ? 4.6 : 8.5, HEADER_BLACK, g.rows * g.cols, pitch) : null;
    },
    source: "Typical 2.54 mm socket strips: 8.5 mm tall, one pitch per contact; 1 mm pitch and up (finer ones are flat-cable and board-to-board connectors, left to their footprint)",
  },
  {
    id: "pin-header",
    description: /HEADER|\bHDR\b|\bBERG\b|PIN\s?STRIP|BRKWA?Y|BREAKAWAY|\bJUMPER\b/,
    pkg: /HEADER|(?:^|[^A-Z])HDR|PINHD|BERG|JUMPER[_\s-]?\d/,
    body: (l) => {
      const pitch = pitchFrom(l.description, 2.54);
      const g = NOT_THE_PART.test(l.description) || NOT_A_PIN_STRIP.test(l.description) || pitch < MIN_STRIP_PITCH ? null : headerGrid(l);
      return g ? pinHeader(g.rows, g.cols, pitch) : null;
    },
    source: "Square-post headers (TE AMPMODU, Samtec TSW): 2.54 mm pitch, 2.5 mm plastic, posts to 8.5 mm; two rows when the line says so",
  },

  // ---- Crystals ----
  {
    id: "crystal-hc49-smd",
    mpn: /^ABLS\d?-|^ECS-.*-5PL?X|^ATS\d+[A-Z]*SM|^FOXSD|^HC-?49\/?US?-?SM|^9C-/,
    description: /(?:HC-?)?49\/?U?S?X?[-\s]*(?:SMD|SMT|SM\b)|CSM-?7/,
    pkg: /(?:HC-?)?49\/?U?S?X?[-_\s]*(?:SMD|SMT|SM\b)|CSM-?7/,
    body: (l) => spec("crystal", "hc49-smd", 11.4, 4.8, /-5PLX|LOW\s?PROFILE/.test(l.text) ? 3.2 : 4.3, ALUMINIUM, 2, 9.5),
    source: "HC-49/US SMD (ECS CSM-7X, Abracon ABLS): 11.4 × 4.8 mm, 4.3 mm tall, low profile 3.2 mm (distributor data)",
  },
  {
    id: "crystal-hc49",
    description: /HC-?49/,
    pkg: /HC-?49/,
    body: (l) => spec("crystal", "hc49", 11.05, 4.65, /49\/?U(?![S])|HC-?49\/?U\b/.test(l.text) && !/49\/?US|49S/.test(l.text) ? 13.5 : 3.5, ALUMINIUM, 2, 4.88),
    source: "HC-49/U (13.5 mm tall) and HC-49/US (3.5 mm) through-hole crystal cans, 11.05 × 4.65 mm, leads 4.88 mm apart",
  },
  {
    id: "crystal-smd",
    mpn: /^(?:ABM\d|ABS0\d|NX\d{4}|FA-\d|FC-\d|TSX-\d|CM\d1[25]|7[BM]-|8Y-)/,
    description: /CRYSTAL|\bXTAL\b|\bOSC(?:ILLATOR)?\b|\bXO\b|\bTCXO\b/,
    pkg: /CRYSTAL|XTAL|(?:^|[^A-Z])OSC/,
    body: (l) => {
      const row = SMD_CRYSTAL.find(([re]) => re.test(l.mpn) || re.test(l.description + " " + l.pkg));
      const watch = /32\.768|\.327/.test(l.text);
      const [L, W, H, pads] = row ? row[1] : watch ? [3.2, 1.5, 0.9, 2] : [3.2, 2.5, 0.8, 4];
      if (!row && !/(?:^|[^A-Z])SM[DT](?![A-Z])/.test(l.text)) return null;
      return spec("crystal", null, L, W, H, ALUMINIUM, pads, round(L * 0.6));
    },
    source: "Ceramic SMD crystal sizes 7050 … 1612 and 3215 watch crystals (Abracon ABM / ABS, NDK NX, Epson FA / FC); an unsized SMD crystal is drawn as 3.2 × 2.5 mm",
  },

  // ---- Fuses ----
  {
    id: "fuse-littelfuse-nano2",
    mpn: /^0?4(?:51|52|53|48|49)(?:\d{3}\.|\d\d\.\d|\d\.\d\d|\.\d{3})(?:[MNHD]R|$)/,
    body: () => spec("chip", "fuse", 6.1, 2.69, 2.69, FUSE_WHITE, 2, 4.6),
    source: "Littelfuse NANO2 451 / 452 / 453 / 448 / 449 datasheet: 6.10 × 2.69 × 2.69 mm ceramic square body with end caps; numbers in Littelfuse's form only (four amp-rating characters with a decimal point, then MR / NR)",
  },
  {
    id: "polyfuse",
    mpn: /^(0603|0805|1206|1210|1812|2016|2920)L\d{3}|^MF-(PSMF|NSMF|USMF|MSMF|FSMF|PSHT|NSHT|MSHT)|^(?:MINISMDC|NANOSMDC|MICROSMD)\d/,
    description: /POLY\s?(?:FUSE|SWITCH)|\bPPTC\b|RESETTABLE|\bPTC\b.*(?:RESET|FUSE)/,
    body: (l, m) => polyfuse(m[1] ?? (m[2] ? BOURNS_PPTC[m[2]] : null) ?? (/^MINISMDC/.test(l.mpn) ? "1812" : /^NANOSMDC/.test(l.mpn) ? "1206" : /^MICROSMD/.test(l.mpn) ? "1210" : (l.text.match(/(?:^|[^0-9])(2016|2920)(?![0-9])/)?.[1] ?? chipCode(l.description + " " + l.pkg)))),
    source: "Resettable fuses by chip size (Littelfuse 0603L … 2920L, Bourns MF-xSMF): 1812 = 4.5 × 3.2 × 1.1 mm",
  },
  {
    id: "fuse-smd",
    description: /\bFUSE\b.*(?:BRD\s?MNT|BOARD\s?M(?:OU)?NT|\b\d?SM[DT]\b|SURFACE)/,
    body: (l) => {
      if (NOT_THE_PART.test(l.description)) return null;
      const code = chipCode(l.description + " " + l.pkg);
      return code ? spec("chip", "fuse", CHIP[code][0], CHIP[code][1], Math.min(CHIP[code][1], 1.0), FUSE_WHITE, 2, round(CHIP[code][0] * 0.75)) : spec("chip", "fuse", 6.1, 2.69, 2.69, FUSE_WHITE, 2, 4.6);
    },
    source: "SMD fuses: chip sizes as marked, else the 6.1 × 2.69 mm square-body (2410) class",
  },

  // ---- Chip capacitors and resistors by part number ----
  {
    id: "mlcc-by-part-number",
    mpn: /^C(0402|0603|1005|1608|2012|3216|3225|4532|5750)(?:X[5-8][RSTUV]|C0G|NP0|CH|JB|Y5V)\d[A-Z]\d{3}[A-Z](\d{3})?|^G[RCJQ]M(\d\d)([0-9A-Z])|^C(0201|0402|0603|0805|1206|1210|1812|2220)[CXYTS]\d{3}[A-Z]\d[A-Z]|^CL(03|05|10|21|31|32|43|55)[A-Z]\d{3}|^CC(\d{4})[A-Z]{2}|^(0201|0402|0603|0805|1206|1210|1812)[0-9YZ][ACDGZ]\d{3}[A-Z]A[TZ]|^[A-Z]MK(063|105|107|212|316|325|432)/,
    body: (_l, m) => {
      // TDK writes the metric size and, in the long form, the thickness in 0.01 mm.
      if (m[1]) return chip(METRIC_CHIP[m[1]] ?? ({ "0402": "01005", "0603": "0201" } as Record<string, string>)[m[1]], "capacitor", m[2] ? Number(m[2]) / 100 : null);
      if (m[3]) return MURATA_SIZE[m[3]] ? chip(MURATA_SIZE[m[3]], "capacitor", MURATA_THICKNESS[m[4]] ?? null) : null;
      const code = m[5] ?? (m[6] ? SAMSUNG_SIZE[m[6]] : null) ?? (m[7] ? eia(m[7]) : null) ?? m[8] ?? (m[9] ? TAIYO_SIZE[m[9]] : null);
      return code ? chip(code, "capacitor") : null;
    },
    source: "MLCC part numbers carry the case: TDK C2012 (metric, thickness code 085 = 0.85 mm), Murata GRM21B (0805, 1.25 mm), Kemet C0805C, Samsung CL21, Yageo CC0805, AVX 0805, Taiyo Yuden 212",
  },
  {
    id: "chip-resistor-by-part-number",
    mpn: /^(?:CRCW|RMCF|RNCP|CRG|CRGCQ|CRM|CRL|ERA|RCS|RCA|WSL|LVK|CSR|RL|TNPW|RT|AC|RC|CR[A-Z]?)-?(0201|0402|0603|0805|1206|1210|1812|2010|2512|1005|1608|2012|3216|3225|5025|6332)|^ERJ-?[A-Z]?(1G|2R|2G|3G|3E|6G|6E|8G|8E|14|12|1T)|^MCR(006|01|03|10|18|25|50|100)[A-Z]/,
    body: (_l, m) => {
      const code = m[1] ? eia(m[1]) : m[2] ? PANASONIC_RES[m[2]] : ROHM_RES[m[3]];
      return code ? chip(code, "resistor") : null;
    },
    source: "Chip resistor part numbers carry the case: Vishay CRCW0805, Yageo RC0805, Bourns CR0805 / CRA2512, Panasonic ERJ-6 (0805), Rohm MCR10 (0805); thick-film thickness 0.35–0.6 mm",
  },

  // ---- Power and small-signal semiconductor packages ----
  {
    id: "sot-223",
    description: /SOT-?223/,
    pkg: /SOT-?223/,
    body: () => spec("gullwing", "sot223", 6.5, 3.5, 1.6, BLACK, 4, 2.3),
    source: "JEDEC TO-261 (SOT-223): 6.5 × 3.5 × 1.6 mm body, three leads at 2.3 mm and the tab",
  },
  {
    id: "d2pak",
    description: /D2-?PAK|D²PAK|DDPAK|TO-?263/,
    pkg: /D2-?PAK|DDPAK|TO-?263/,
    body: (l) => spec("power", "dpak", 10.16, 9.15, 4.45, BLACK, /(?:D2-?PAK|TO-?263)-?[57]\b/.test(l.text) ? 5 : 3, 2.54),
    source: "JEDEC TO-263 (D2PAK): 10.16 × 9.15 × 4.45 mm body",
  },
  {
    id: "dpak",
    description: /(?:^|[^A-Z0-9])D-?PAK|TO-?252/,
    pkg: /(?:^|[^A-Z0-9])D-?PAK|TO-?252/,
    body: () => spec("power", "dpak", 6.6, 6.1, 2.3, BLACK, 3, 2.28),
    source: "JEDEC TO-252 (DPAK): 6.6 × 6.1 × 2.3 mm body",
  },
  {
    id: "to-247",
    description: /TO-?247|TO-?3P\b/,
    pkg: /TO-?247|TO-?3P\b/,
    body: (l) => (HEATSINK_ACCESSORY.test(l.description) || /HEAT\s?SINK/.test(l.description) ? null : spec("power", "to220", 15.9, 5.0, 24.5, BLACK, 3, 5.45)),
    source: "JEDEC TO-247: 15.9 × 5.0 mm, body 20.9 mm tall standing on 3.6 mm of lead",
  },
  {
    id: "to-220",
    description: /TO-?220/,
    pkg: /TO-?220/,
    body: (l) => {
      // An insulator, a clip or a mounting kit for a TO-220 is not one.
      if (HEATSINK_ACCESSORY.test(l.description) || /HEAT\s?SINK/.test(l.description)) return null;
      const word = l.text.match(/TO-?220\S*/)?.[0] ?? "";
      const pins = /220-?AC|220-?2/.test(word) ? 2 : /220-?[57]\b/.test(word) ? Number(word.match(/220-?([57])/)?.[1]) : 3;
      return spec("power", "to220", 10.2, 4.6, 18.5, BLACK, pins, pins === 2 ? 5.08 : pins === 3 ? 2.54 : 1.7);
    },
    source: "JEDEC TO-220: 10.2 × 4.6 mm, body and tab 15.9 mm tall standing on 2.6–3.6 mm of lead; TO-220AC has two leads",
  },
  {
    id: "to-92",
    description: /TO-?92/,
    pkg: /TO-?92/,
    body: () => spec("power", "to92", 4.6, 3.6, 6.6, BLACK, 3, 1.27),
    source: "JEDEC TO-92: 4.6 × 3.6 mm, 4.6 mm body standing on 2 mm of lead",
  },
  {
    id: "diode-smd",
    description: DIODE_WORDS,
    pkg: DIODE_WORDS,
    body: (l, m) => {
      // SMA, SMB and SMC are also coaxial connectors.
      if (/^SM[ABC]$/.test(m[0]) && /CONN|JACK|PLUG|COAX|\bRF\b|ANTENNA/.test(l.description)) return null;
      const size = DIODE_PACKAGES.find(([re]) => re.test(m[0]))?.[1] ?? DIODE_PACKAGES.find(([re]) => re.test(l.text))?.[1];
      return size ? spec("molded", null, size[0], size[1], size[2], BLACK, 2, round(size[0] * 0.85)) : null;
    },
    source: "JEDEC DO-214AC / AA / AB (SMA 4.3 × 2.6, SMB 4.3 × 3.6, SMC 6.9 × 5.9 mm) and SOD-123 / 323 / 523 bodies",
  },
  {
    id: "small-outline-transistor",
    description: SMALL_OUTLINE_WORDS,
    pkg: SMALL_OUTLINE_WORDS,
    body: (l, m) => {
      // The match is the family ("SOT23"); the whole word says which one ("SOT23-5").
      const s = SMALL_OUTLINE.find(([re]) => re.test(l.description.includes(m[0]) ? l.description : l.pkg))?.[1];
      return s ? spec("gullwing", null, s[0], s[1], s[2], BLACK, s[3], s[4]) : null;
    },
    source: "JEDEC / JEITA small outlines: SOT-23 2.9 × 1.3 × 1.0, SOT-23-5/6 2.9 × 1.6, SC-70 2.0 × 1.25, SOT-89 4.5 × 2.5 mm",
  },

  // ---- Integrated circuits by package and pin count ----
  {
    id: "stm32",
    mpn: /^STM32[A-Z][0-9A-Z]{3}([FGKTSCRMVQZIB])[0-9A-Z]([TUP])\d/,
    body: (_l, m) => {
      const pins = STM32_PINS[m[1]];
      return m[2] === "T" ? qfp(pins, "LQFP") : m[2] === "U" ? qfn(pins, "UFQFPN") : tssop(pins);
    },
    source: "ST part numbering: pin-count letter (C 48, R 64, V 100, Z 144, I 176) and package letter (T LQFP, U UFQFPN, P TSSOP)",
  },
  {
    id: "qfp",
    description: /[ELTHVPM]*QFP/,
    pkg: /[ELTHVPM]*QFP/,
    body: (l, m) => {
      const t = l.description.includes(m[0]) ? l.description : l.pkg;
      const pins = pinsBeside(t, "[ELTHVPM]*QFP") ?? pinsBeside(l.text, "[ELTHVPM]*QFP");
      return pins ? qfp(pins, t) : null;
    },
    source: "JEDEC MS-026 LQFP / TQFP: 48 = 7 × 7, 64 = 10 × 10, 100 = 14 × 14, 144 = 20 × 20, 176 = 24 × 24 mm at 0.5 mm; LQFP 1.4 mm, TQFP 1.0 mm tall",
  },
  {
    id: "qfn",
    description: /[A-Z]*QFN|\bMLF\b|LFCSP|[A-Z]*DFN|(?:^|[^A-Z])[WVU]?SON\b/,
    pkg: /[A-Z]*QFN|\bMLF|LFCSP|[A-Z]*DFN|(?:^|[^A-Z])[WVU]?SON/,
    body: (l, m) => {
      const t = l.description.includes(m[0]) ? l.description : l.pkg;
      const pins = pinsBeside(t, "[A-Z]*QFN|MLF|LFCSP|[A-Z]*DFN|[WVU]?SON") ?? pinsBeside(l.text, "[A-Z]*QFN|MLF|LFCSP|[A-Z]*DFN|[WVU]?SON");
      return pins ? qfn(pins, t) : null;
    },
    source: "JEDEC MO-220 QFN / DFN: 16 = 3 × 3, 24 = 4 × 4, 32 = 5 × 5, 48 = 7 × 7, 64 = 9 × 9 mm at 0.5 mm, 0.85 mm tall; a written outline wins",
  },
  {
    id: "tssop",
    description: /H?TSSOP/,
    pkg: /H?TSSOP/,
    body: (l) => {
      const pins = pinsBeside(l.description, "H?TSSOP") ?? pinsBeside(l.text, "H?TSSOP");
      return pins ? tssop(pins) : null;
    },
    source: "JEDEC MO-153 TSSOP: 4.4 mm wide at 0.65 mm (16 = 5.0, 20 = 6.5, 28 = 9.7 mm long), 48+ pins 6.1 mm wide at 0.5 mm; 1.0 mm tall",
  },
  {
    id: "msop",
    description: /MSOP|VSSOP|(?:^|[^A-Z])USOP/,
    pkg: /MSOP|VSSOP/,
    body: (l) => {
      const pins = pinsBeside(l.text, "MSOP|VSSOP|USOP") ?? 8;
      return spec("gullwing", null, pins >= 12 ? 4.0 : 3.0, 3.0, 0.85, BLACK, pins, pins === 8 ? 0.65 : 0.5);
    },
    source: "JEDEC MO-187 MSOP / VSSOP: 3.0 × 3.0 × 0.85 mm, 8 pins at 0.65 mm, 10 at 0.5 mm",
  },
  {
    id: "ssop",
    description: /(?:^|[^A-Z])(?:SSOP|QSOP)/,
    pkg: /(?:^|[^A-Z])(?:SSOP|QSOP)/,
    body: (l) => {
      const pins = pinsBeside(l.text, "SSOP|QSOP");
      if (!pins) return null;
      return /QSOP/.test(l.text) ? spec("gullwing", null, pins <= 16 ? 4.9 : pins <= 24 ? 8.65 : 9.9, 3.9, 1.5, BLACK, pins, 0.635) : spec("gullwing", null, SSOP_LENGTH[pins] ?? round((pins / 2) * 0.65 + 1), 5.3, 1.75, BLACK, pins, 0.65);
    },
    source: "JEDEC MO-150 SSOP (5.3 mm wide, 0.65 mm) and MO-137 QSOP (3.9 mm wide, 0.635 mm)",
  },
  {
    id: "soic",
    description: /(?:^|[^A-Z])(?:SOIC|SOP|SO)(?![A-Z])/,
    pkg: /(?:^|[^A-Z])(?:SOIC|SOP|SO)(?![A-FH-MO-VX-Z])/,
    body: (l, m) => {
      const t = l.description.includes(m[0].trim()) ? l.description : l.pkg;
      const pins = pinsBeside(t, "SOIC|SOP|SO") ?? pinsBeside(l.text, "SOIC|SOP|SO");
      return pins && pins >= 4 && pins <= 32 && pins % 2 === 0 ? soic(pins, l) : null;
    },
    source: "JEDEC MS-012 narrow SOIC (3.9 mm wide: 8 = 4.9, 14 = 8.65, 16 = 9.9 mm long, 1.5 mm tall) and MS-013 wide (7.5 mm, 18 pins and up)",
  },
  {
    id: "dip",
    description: /(?:^|[^A-Z])P?DIP(?![A-Z])/,
    pkg: /(?:^|[^A-Z])P?DIP(?![A-Z])/,
    body: (l) => {
      const pins = pinsBeside(l.text, "P?DIP");
      return pins && pins % 2 === 0 ? spec("gullwing", "dip", (pins / 2) * 2.54, pins >= 24 && !/\.300|300\s?MIL|SKINNY|NARROW/.test(l.text) ? 13.7 : 6.4, 3.6, BLACK, pins, 2.54) : null;
    },
    source: "JEDEC MS-001 / MS-011 plastic DIP: 2.54 mm pitch, 6.4 mm wide body (13.7 mm from 24 pins), 3.6 mm tall",
  },
  {
    id: "bga",
    description: /[A-Z]*BGA/,
    pkg: /[A-Z]*BGA/,
    body: (l) => {
      const pins = pinsBeside(l.text, "[A-Z]*BGA");
      if (!pins) return null;
      const pitch = pitchFrom(l.description, pins >= 256 ? 1.0 : 0.8);
      const size = outline(l.description);
      const side = round(Math.ceil(Math.sqrt(pins)) * pitch + 1);
      return spec("array", null, size?.[0] ?? side, size?.[1] ?? side, 1.2, BLACK, pins, pitch);
    },
    source: "BGA outline estimated from the ball count and pitch (a full grid plus 1 mm); a written outline wins",
  },

  // ---- Chip parts by the size code in the description or footprint name ----
  {
    id: "chip-by-size",
    description: new RegExp(`(?:^|[^0-9.])(${CHIP_CODES})(?![0-9])`),
    pkg: new RegExp(`(?:^|[^0-9.])(${CHIP_CODES})(?![0-9])`),
    body: (l) => {
      const code = chipCode(l.description) ?? chipCode(l.pkg);
      const cls = chipClass(l);
      return code && cls ? chip(code, cls) : null;
    },
    source: "EIA chip sizes 01005 … 2512; MLCC thickness typical for the case (0805 = 0.85 mm), thick-film resistors 0.35–0.6 mm",
  },
];
