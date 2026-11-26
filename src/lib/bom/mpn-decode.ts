/**
 * Reads what a passive's part number says about itself (Phase 29). Makers of ceramic capacitors, chip resistors
 * and chip inductors build the value, voltage, tolerance, dielectric and case size into the number, so a BoM line
 * can be checked against its own description without any catalogue: "50 V" in the text next to a 10 V part number
 * is a mistake someone has to settle before parts are bought. Pure.
 *
 * Only the numbering systems written down here are read; anything else is left alone (null).
 */

export type Decoded = {
  maker: string;
  series: string;
  kind: "capacitor" | "resistor" | "inductor";
  /** Farads, ohms or henries. */
  value: number;
  /** Imperial chip size: "0402". */
  size?: string;
  voltage?: number;
  tolerancePct?: number;
  dielectric?: string;
};

const METRIC_TO_IMPERIAL: Record<string, string> = { "0402": "01005", "0603": "0201", "1005": "0402", "1608": "0603", "2012": "0805", "3216": "1206", "3225": "1210", "4532": "1812", "5750": "2220", "5025": "2010", "6432": "2512" };
const IMPERIAL = ["01005", "0201", "0402", "0603", "0805", "1206", "1210", "1812", "2010", "2220", "2512"];

/** Two-character size codes shared by Murata and Samsung families. */
const MURATA_SIZE: Record<string, string> = { "02": "01005", "03": "0201", "15": "0402", "18": "0603", "21": "0805", "31": "1206", "32": "1210", "43": "1812", "55": "2220" };
const SAMSUNG_SIZE: Record<string, string> = { "02": "01005", "03": "0201", "05": "0402", "10": "0603", "21": "0805", "31": "1206", "32": "1210", "43": "1812", "55": "2220" };
const TAIYO_SIZE: Record<string, string> = { "042": "01005", "063": "0201", "105": "0402", "107": "0603", "212": "0805", "316": "1206", "325": "1210", "432": "1812" };

/** EIA two-character voltage codes (Murata, TDK). */
const EIA_VOLT: Record<string, number> = { "0E": 2.5, "0G": 4, "0J": 6.3, "1A": 10, "1C": 16, "1E": 25, YA: 35, "1V": 35, "1H": 50, "1J": 63, "1K": 80, "2A": 100, "2D": 200, "2E": 250, "2W": 450, "2H": 500, "2J": 630, "3A": 1000, "3D": 2000 };
const MURATA_DIEL: Record<string, string> = { "5C": "C0G", "7U": "U2J", R7: "X7R", R6: "X5R", C7: "X7S", C8: "X6S", D7: "X7T", D8: "X6T", F5: "Y5V", R9: "X8R", L8: "X8L" };
const SAMSUNG_DIEL: Record<string, string> = { A: "X5R", B: "X7R", C: "C0G", F: "Y5V", X: "X6S", Y: "X7S" };
const SAMSUNG_VOLT: Record<string, number> = { R: 4, Q: 6.3, P: 10, O: 16, A: 25, L: 35, B: 50, C: 100, D: 200, E: 250, G: 500, H: 630, I: 1000 };
const YAGEO_VOLT: Record<string, number> = { "4": 4, "5": 6.3, "6": 10, "7": 16, "8": 25, "9": 50, "0": 100, A: 200, Y: 250 };
const KEMET_VOLT: Record<string, number> = { "7": 4, "9": 6.3, "8": 10, "4": 16, "3": 25, "6": 35, "5": 50, "1": 100, "2": 200, A: 250, C: 500, B: 630, D: 1000 };
const KEMET_DIEL: Record<string, string> = { G: "C0G", R: "X7R", P: "X5R", V: "Y5V", U: "Z5U", H: "X8R" };
const WALSIN_DIEL: Record<string, string> = { N: "C0G", B: "X7R", X: "X5R", F: "Y5V" };
const TAIYO_VOLT: Record<string, number> = { A: 4, J: 6.3, L: 10, E: 16, T: 25, G: 35, U: 50, H: 100, Q: 250, S: 630 };
const TAIYO_DIEL: Record<string, string> = { BJ: "X5R", B7: "X7R", C6: "X6S", C7: "X7S", CG: "C0G", CH: "C0G" };
const AVX_VOLT: Record<string, number> = { "4": 4, "6": 6.3, Z: 10, Y: 16, "3": 25, D: 35, "5": 50, "1": 100, "2": 200, "7": 500 };
const AVX_DIEL: Record<string, string> = { A: "C0G", C: "X7R", D: "X5R", G: "Y5V" };

/** Capacitor tolerance letters that are a percentage (B, C and D are fractions of a picofarad). */
const CAP_TOL: Record<string, number> = { F: 1, G: 2, J: 5, K: 10, M: 20, Z: 80 };
const RES_TOL: Record<string, number> = { B: 0.1, C: 0.25, D: 0.5, F: 1, G: 2, J: 5, K: 10, M: 20 };
const IND_TOL: Record<string, number> = { F: 1, G: 2, H: 3, J: 5, K: 10, M: 20, N: 30 };

/** "104" → 100 nF, "8R2" → 8.2 pF, "R47" → 0.47 pF, "109" → 1 pF (a last 9 is ×0.1, an 8 ×0.01). In farads. */
export function capCode(code: string): number | null {
  const c = code.toUpperCase();
  let pf: number | null = null;
  if (/^\d{3}$/.test(c)) {
    const exp = Number(c[2]);
    pf = Number(c.slice(0, 2)) * (exp === 9 ? 0.1 : exp === 8 ? 0.01 : 10 ** exp);
  } else if (/^\dR\d$/.test(c)) pf = Number(`${c[0]}.${c[2]}`);
  else if (/^R\d\d$/.test(c)) pf = Number(`0.${c.slice(1)}`);
  else if (/^\d\dR$/.test(c)) pf = Number(c.slice(0, 2));
  return pf === null || !(pf > 0) ? null : pf * 1e-12;
}

/** "103" → 10 kΩ, "1002" → 10 kΩ, "4R7" → 4.7 Ω, "10K0" → 10 kΩ, "4K7" → 4.7 kΩ, "0R" and "000" → 0. In ohms. */
export function resCode(code: string): number | null {
  const c = code.toUpperCase();
  if (/^0+$/.test(c) || /^0R0*$/.test(c)) return 0;
  if (/^\d{3,4}$/.test(c)) return Number(c.slice(0, -1)) * 10 ** Number(c.slice(-1));
  const m = c.match(/^(\d*)([RKM])(\d*)$/);
  if (!m || (!m[1] && !m[3])) return null;
  const v = Number(`${m[1] || "0"}.${m[3] || "0"}`);
  return v * (m[2] === "K" ? 1e3 : m[2] === "M" ? 1e6 : 1);
}

/** RF chip inductors count in nanohenries: "47N" → 47 nH, "4N7" → 4.7 nH, "R10" → 100 nH. In henries. */
export function nhCode(code: string): number | null {
  const c = code.toUpperCase();
  let nh: number | null = null;
  if (/^\d\dN$/.test(c)) nh = Number(c.slice(0, 2));
  else if (/^\dN\d$/.test(c)) nh = Number(`${c[0]}.${c[2]}`);
  else if (/^R\d\d$/.test(c)) nh = Number(`0.${c.slice(1)}`) * 1000;
  else if (/^\dR\d$/.test(c)) nh = Number(`${c[0]}.${c[2]}`) * 1000;
  return nh === null || !(nh > 0) ? null : nh * 1e-9;
}

/** Power inductors count in microhenries: "2R2" → 2.2 µH, "100" → 10 µH, "R47" → 0.47 µH. In henries. */
export function uhCode(code: string): number | null {
  const c = code.toUpperCase();
  let uh: number | null = null;
  if (/^\d{3}$/.test(c)) uh = Number(c.slice(0, 2)) * 10 ** Number(c[2]);
  else if (/^\dR\d$/.test(c)) uh = Number(`${c[0]}.${c[2]}`);
  else if (/^R\d\d$/.test(c)) uh = Number(`0.${c.slice(1)}`);
  return uh === null || !(uh > 0) ? null : uh * 1e-6;
}

/** Walsin's three-character voltage: "6R3" → 6.3 V, "500" → 50 V, "101" → 100 V. */
function walsinVolt(code: string): number | null {
  if (/^\dR\d$/.test(code)) return Number(`${code[0]}.${code[2]}`);
  return /^\d{3}$/.test(code) ? Number(code.slice(0, 2)) * 10 ** Number(code[2]) : null;
}

type Rule = { maker: string; series: string; re: RegExp; read: (m: RegExpMatchArray) => Omit<Decoded, "maker" | "series"> | null };

const cap = (value: number | null, rest: Partial<Decoded>): Omit<Decoded, "maker" | "series"> | null => (value === null ? null : { kind: "capacitor", value, ...rest });
const res = (value: number | null, rest: Partial<Decoded>): Omit<Decoded, "maker" | "series"> | null => (value === null ? null : { kind: "resistor", value, ...rest });
const ind = (value: number | null, rest: Partial<Decoded>): Omit<Decoded, "maker" | "series"> | null => (value === null ? null : { kind: "inductor", value, ...rest });

/**
 * One rule per numbering system. Each is written out field by field, so a number that only starts like the series
 * (characters missing, a digit dropped) does not decode.
 */
const RULES: Rule[] = [
  // ── Ceramic capacitors
  {
    // GRM 15 5 R7 1A 104 J A01 D — series, size, thickness, dielectric, voltage, value, tolerance, spec, packing
    maker: "Murata",
    series: "GRM",
    re: /^(G(?:RM|CM|JM|QM|RT|CJ|CG|CD|XT))(\d{2})[0-9A-Z]([0-9A-Z]{2})([0-9A-Z]{2})([0-9R]{3})([A-Z])[A-Z0-9]{3,4}[A-Z]?$/,
    read: (m) => (MURATA_SIZE[m[2]] && MURATA_DIEL[m[3]] && EIA_VOLT[m[4]] ? cap(capCode(m[5]), { size: MURATA_SIZE[m[2]], dielectric: MURATA_DIEL[m[3]], voltage: EIA_VOLT[m[4]], tolerancePct: CAP_TOL[m[6]] }) : null),
  },
  {
    // CL 05 C 8R2 C B 51PNC — series, size, dielectric, value, tolerance, voltage, the rest
    maker: "Samsung Electro-Mechanics",
    series: "CL",
    re: /^CL(\d{2})([A-Z])([0-9R]{3})([A-Z])([A-Z])[A-Z0-9]{3,6}$/,
    read: (m) => (SAMSUNG_SIZE[m[1]] && SAMSUNG_DIEL[m[2]] && SAMSUNG_VOLT[m[5]] ? cap(capCode(m[3]), { size: SAMSUNG_SIZE[m[1]], dielectric: SAMSUNG_DIEL[m[2]], voltage: SAMSUNG_VOLT[m[5]], tolerancePct: CAP_TOL[m[4]] }) : null),
  },
  {
    // CC 0402 K R X7R 9 BB 104 — series, size, tolerance, packing, dielectric, voltage, process, value
    maker: "Yageo",
    series: "CC",
    re: /^CC(\d{4})([A-Z])[A-Z](NPO|NP0|C0G|X7R|X5R|Y5V|X6S|X7S)([0-9A-Z])[A-Z]{2}([0-9R]{3})$/,
    read: (m) => (IMPERIAL.includes(m[1]) && YAGEO_VOLT[m[4]] ? cap(capCode(m[5]), { size: m[1], dielectric: /NP|C0G/.test(m[3]) ? "C0G" : m[3], voltage: YAGEO_VOLT[m[4]], tolerancePct: CAP_TOL[m[2]] }) : null),
  },
  {
    // C 1005 X7R 1H 104 K 050 BB — series, metric size, dielectric, voltage, value, tolerance, thickness, packing.
    // The base number without thickness and packing (C2012X7R1H105K), and the old taped form (…KT, …KT000N), are
    // TDK's too: distributors sell them under the full number.
    maker: "TDK",
    series: "C",
    re: /^C(\d{4})(C0G|NP0|X7R|X5R|X7S|X6S|X7T|X8R)(\d[A-Z])([0-9R]{3})([A-Z])(?:\d{3}[A-Z]{2}|T(?:\d{3}[A-Z])?)?$/,
    read: (m) => (METRIC_TO_IMPERIAL[m[1]] && EIA_VOLT[m[3]] ? cap(capCode(m[4]), { size: METRIC_TO_IMPERIAL[m[1]], dielectric: m[2] === "NP0" ? "C0G" : m[2], voltage: EIA_VOLT[m[3]], tolerancePct: CAP_TOL[m[5]] }) : null),
  },
  {
    // CGA 2 B 2 X7R 1H 104 K 050 BA — the automotive series: one digit for the size
    maker: "TDK",
    series: "CGA",
    re: /^CGA(\d)[A-Z]\d(C0G|NP0|X7R|X5R|X7S|X8R)(\d[A-Z])([0-9R]{3})([A-Z])\d{3}[A-Z]{2}$/,
    read: (m) => {
      const size = ({ "1": "0201", "2": "0402", "3": "0603", "4": "0805", "5": "1206", "6": "1210", "8": "1812", "9": "2220" } as Record<string, string>)[m[1]];
      return size && EIA_VOLT[m[3]] ? cap(capCode(m[4]), { size, dielectric: m[2] === "NP0" ? "C0G" : m[2], voltage: EIA_VOLT[m[3]], tolerancePct: CAP_TOL[m[5]] }) : null;
    },
  },
  {
    // 0402 N 101 J 500 C T — size, dielectric, value, tolerance, voltage, termination, packing ("MC…" is the same part under a distributor's brand)
    maker: "Walsin",
    series: "MLCC",
    re: /^(?:MC)?(0201|0402|0603|0805|1206|1210|1812)([NBXF])([0-9R]{3})([A-Z])(\d{3}|\dR\d)[A-Z]{2}$/,
    read: (m) => cap(capCode(m[3]), { size: m[1], dielectric: WALSIN_DIEL[m[2]], voltage: walsinVolt(m[5]) ?? undefined, tolerancePct: CAP_TOL[m[4]] }),
  },
  {
    // E MK 105 BJ 105 K V -F — voltage, series, size, (a size-tolerance letter,) dielectric, value, tolerance, thickness, packing
    maker: "Taiyo Yuden",
    series: "MK",
    re: /^([A-Z])MK(\d{3})[A-Z ]?(BJ|B7|C6|C7|CG|CH)([0-9R]{3})([A-Z])[A-Z0-9]{1,3}(?:-[A-Z0-9]{1,2})?$/,
    read: (m) => (TAIYO_VOLT[m[1]] && TAIYO_SIZE[m[2]] ? cap(capCode(m[4]), { size: TAIYO_SIZE[m[2]], dielectric: TAIYO_DIEL[m[3]], voltage: TAIYO_VOLT[m[1]], tolerancePct: CAP_TOL[m[5]] }) : null),
  },
  {
    // C 0402 C 104 K 4 R A C TU — series, size, style, value, tolerance, voltage, dielectric, the rest
    maker: "Kemet",
    series: "C",
    re: /^C(\d{4})[A-Z]([0-9R]{3})([A-Z])([0-9A-Z])([A-Z])[A-Z]{2}[A-Z0-9]{0,6}$/,
    read: (m) => (IMPERIAL.includes(m[1]) && KEMET_VOLT[m[4]] && KEMET_DIEL[m[5]] ? cap(capCode(m[2]), { size: m[1], dielectric: KEMET_DIEL[m[5]], voltage: KEMET_VOLT[m[4]], tolerancePct: CAP_TOL[m[3]] }) : null),
  },
  {
    // 0402 5 C 104 K A T 2 A — size, voltage, dielectric, value, tolerance, the rest
    maker: "Kyocera AVX",
    series: "MLCC",
    re: /^(0201|0402|0603|0805|1206|1210|1812)([0-9A-Z])([ACDG])([0-9R]{3})([A-Z])[A-Z0-9][A-Z]\d[A-Z]$/,
    read: (m) => (AVX_VOLT[m[2]] ? cap(capCode(m[4]), { size: m[1], dielectric: AVX_DIEL[m[3]], voltage: AVX_VOLT[m[2]], tolerancePct: CAP_TOL[m[5]] }) : null),
  },
  // ── Chip resistors
  {
    // RC 0402 F R -07 10K L — series, size, tolerance, packing, value written with R, K or M as the decimal point
    maker: "Yageo",
    series: "RC",
    re: /^(?:RC|AC|RT|AT)(0100|0201|0402|0603|0805|1206|1210|1218|2010|2512)([BDFJ])[A-Z]-?(?:07|7W|13|10)(\d*[RKM]\d*)L?$/,
    read: (m) => res(resCode(m[3]), { size: m[1], tolerancePct: RES_TOL[m[2]] }),
  },
  {
    // CRCW 0402 10K0 F K ED — series, size, value in four characters, tolerance, the rest
    maker: "Vishay",
    series: "CRCW",
    re: /^CRCW(\d{4})([0-9RKM]{4})([A-Z])[A-Z0-9]{2,6}$/,
    read: (m) => (IMPERIAL.includes(m[1]) ? res(resCode(/^\d{4}$/.test(m[2]) ? (m[2] === "0000" ? "0R" : m[2]) : m[2]), { size: m[1], tolerancePct: RES_TOL[m[3]] }) : null),
  },
  {
    // ERJ-2RK F 1002 X — series and size, tolerance, value (four digits at 1 %, three at 5 %), packing
    maker: "Panasonic",
    series: "ERJ",
    re: /^ERJ-?(XG|1G|1R|2G|2R|3G|3E|3R|6G|6E|6R|8G|8E|8R|14|12|1T)[A-Z]([BDFJ0])(\d{3,4}|\d*R\d+)[A-Z]$/,
    read: (m) => {
      const size = ({ XG: "01005", "1G": "0201", "1R": "0201", "2G": "0402", "2R": "0402", "3G": "0603", "3E": "0603", "3R": "0603", "6G": "0805", "6E": "0805", "6R": "0805", "8G": "1206", "8E": "1206", "8R": "1206", "14": "1210", "12": "2010", "1T": "2512" } as Record<string, string>)[m[1]];
      return res(resCode(m[3]), { size, tolerancePct: m[2] === "0" ? undefined : RES_TOL[m[2]] });
    },
  },
  {
    // RC 1005 F 103 CS — series, metric size, tolerance, value, packing
    maker: "Samsung Electro-Mechanics",
    series: "RC",
    re: /^RC(0603|1005|1608|2012|3216|3225|5025|6432)([BDFJ])(\d{3,4}|\d*R\d+)CS$/,
    read: (m) => res(resCode(m[3]), { size: METRIC_TO_IMPERIAL[m[1]], tolerancePct: RES_TOL[m[2]] }),
  },
  {
    // RK73 H 1E TTP 1002 F — series, class, size, termination and packing, value, tolerance
    maker: "KOA",
    series: "RK73",
    re: /^RK73[HBG](1F|1H|1E|1J|2A|2B|2E|2H|3A)[A-Z]{1,4}(\d{3,4}|\d*R\d+)([BDFGJ])$/,
    read: (m) => res(resCode(m[2]), { size: ({ "1F": "01005", "1H": "0201", "1E": "0402", "1J": "0603", "2A": "0805", "2B": "1206", "2E": "1210", "2H": "2010", "3A": "2512" } as Record<string, string>)[m[1]], tolerancePct: RES_TOL[m[3]] }),
  },
  {
    // WR 04 X 1002 F TL — series, size, type, value, tolerance, packing
    maker: "Walsin",
    series: "WR",
    re: /^WR(02|04|06|08|12)[XW](\d{3,4}|\d*R\d+)([BDFJ])[A-Z]{1,3}$/,
    read: (m) => res(resCode(m[2]), { size: ({ "02": "0201", "04": "0402", "06": "0603", "08": "0805", "12": "1206" } as Record<string, string>)[m[1]], tolerancePct: RES_TOL[m[3]] }),
  },
  {
    // RMCF 0402 F T 10K0 — series, size, tolerance, packing, value
    maker: "Stackpole",
    series: "RMCF",
    re: /^RMC[FP](\d{4})([BDFJ])[A-Z](\d*[RKM]\d*)$/,
    read: (m) => (IMPERIAL.includes(m[1]) ? res(resCode(m[3]), { size: m[1], tolerancePct: RES_TOL[m[2]] }) : null),
  },
  {
    // CR 0402 - F X - 1002 GLF — series, size, tolerance, value, packing
    maker: "Bourns",
    series: "CR",
    re: /^CR(\d{4})-?([FJ])[XW]-?(\d{3,4}|\d*R\d+)[A-Z]{2,4}$/,
    read: (m) => (IMPERIAL.includes(m[1]) ? res(resCode(m[3]), { size: m[1], tolerancePct: RES_TOL[m[2]] }) : null),
  },
  // ── Chip inductors
  {
    // LQG 15 HS 47N J 02 D — series, size, type, value in nanohenries, tolerance, the rest
    maker: "Murata",
    series: "LQG",
    re: /^LQ([GWP])(\d{2})[A-Z]{1,3}(\d\dN|\dN\d|R\d\d|\dR\d)([A-Z])\d{2}[A-Z]?$/,
    read: (m) => ind(nhCode(m[3]), { size: MURATA_SIZE[m[2]], tolerancePct: IND_TOL[m[4]] }),
  },
  {
    // LQM 21 PN 2R2 M C0 D — the power series count in microhenries
    maker: "Murata",
    series: "LQM",
    re: /^LQ([MH])(\d{2})[A-Z]{1,3}(\d{3}|\dR\d|R\d\d)([A-Z])[A-Z0-9]{2,3}[A-Z]?$/,
    read: (m) => ind(uhCode(m[3]), { size: MURATA_SIZE[m[2]], tolerancePct: IND_TOL[m[4]] }),
  },
  {
    // MLG 1005 S 47N J T000 — series, metric size, type, value in nanohenries, tolerance, packing
    maker: "TDK",
    series: "MLG",
    re: /^ML[GK](\d{4})[A-Z](\d\dN|\dN\d|R\d\d)([A-Z])T\d{3}$/,
    read: (m) => ind(nhCode(m[2]), { size: METRIC_TO_IMPERIAL[m[1]], tolerancePct: IND_TOL[m[3]] }),
  },
];

/** A number that starts like a series we read but does not follow it through: most likely damaged. */
const NEAR: [RegExp, string][] = [
  [/^(?:G[A-Z])?M(?:02|03|15|18|21|31|32|43|55)[0-9A-Z](?:5C|7U|R7|R6|C7|C8|D7|F5|R9)(?:0G|0J|1A|1C|1E|YA|1H|2A|2D|2E|2J)/, "Murata ceramic capacitor"],
  [/^CL(?:02|03|05|10|21|31|32|43)[ABCFXY][0-9R]{2}/, "Samsung ceramic capacitor"],
  [/^(?:MC)?(?:0201|0402|0603|0805|1206|1210)[NBXF]\d[0-9R]/, "Walsin ceramic capacitor"],
  [/^CC(?:0201|0402|0603|0805|1206|1210)[A-Z]{2}(?:NPO|X7R|X5R|Y5V)/, "Yageo ceramic capacitor"],
  [/^C(?:0603|1005|1608|2012|3216|3225)(?:C0G|X7R|X5R|X7S)/, "TDK ceramic capacitor"],
  [/^[AJLETGUH]MK(?:063|105|107|212|316|325)/, "Taiyo Yuden ceramic capacitor"],
  [/^RC(?:0201|0402|0603|0805|1206)[BDFJ]R-?(?:07|13)/, "Yageo chip resistor"],
  [/^CRCW(?:0201|0402|0603|0805|1206)/, "Vishay chip resistor"],
  [/^LQ[GWPMH](?:03|15|18|21|31|32)[A-Z]/, "Murata chip inductor"],
];

const tidy = (raw: string) => raw.toUpperCase().replace(/\s+/g, "").replace(/^#/, "");

/** What the part number says, or null when it is not one of the numbering systems above. */
export function decodeMpn(raw: string | null | undefined): Decoded | null {
  const s = tidy(raw ?? "");
  if (s.length < 8) return null;
  for (const rule of RULES) {
    const m = s.match(rule.re);
    if (!m) continue;
    const d = rule.read(m);
    if (d) return { maker: rule.maker, series: rule.series, ...d };
  }
  return null;
}

/** The family a number starts like, when it does not read as a whole number of that family. */
export function damagedLike(raw: string | null | undefined): string | null {
  const s = tidy(raw ?? "");
  if (s.length < 8 || decodeMpn(s)) return null;
  return NEAR.find(([re]) => re.test(s))?.[1] ?? null;
}

const SI: [number, string][] = [[1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]];
/** 1e-7 F → "100 nF"; 4700 Ω → "4.7 kΩ". */
export function formatSi(value: number, unit: string): string {
  if (value === 0) return `0 ${unit}`;
  const [mult, prefix] = SI.find(([m]) => Math.abs(value) >= m * 0.9995) ?? SI[SI.length - 1];
  return `${Number((value / mult).toPrecision(4))} ${prefix}${unit}`;
}

export const UNIT_OF: Record<Decoded["kind"], string> = { capacitor: "F", resistor: "Ω", inductor: "H" };

/** "100 nF · 10 V · X7R · ±5 % · 0402" */
export function decodedLabel(d: Decoded): string {
  return [formatSi(d.value, UNIT_OF[d.kind]), d.voltage ? `${d.voltage} V` : null, d.dielectric ?? null, d.tolerancePct ? `±${d.tolerancePct} %` : null, d.size ?? null].filter(Boolean).join(" · ");
}
