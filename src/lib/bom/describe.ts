import { parseSiValue } from "@/lib/units";

export type PassiveKind = "capacitor" | "resistor" | "inductor";

export type ParsedDescription = {
  kind: PassiveKind | null;
  capacitance?: number;
  resistance?: number;
  inductance?: number;
  voltage?: number;
  tolerance?: number;
  power?: number;
  dielectric?: string;
  package?: string;
};

const CHIP_SIZES = ["01005", "0201", "0402", "0603", "0805", "1206", "1210", "1812", "2010", "2512"];
/** Metric chip codes customers sometimes use, mapped to imperial. */
const METRIC_TO_IMPERIAL: Record<string, string> = { "0603M": "0201", "1005": "0402", "1608": "0603", "2012": "0805", "3216": "1206", "3225": "1210", "6332": "2512" };

/** Dielectric quality order: a better dielectric can replace a worse one. */
export const DIELECTRIC_RANK: Record<string, number> = { C0G: 5, X8R: 4, X7R: 4, X7S: 3, X6S: 3, X5R: 2, Y5V: 1, Z5U: 1 };

function num(text: string): number | null {
  return parseSiValue(text);
}

/**
 * Pulls passive parameters out of free text such as
 *   "CAP CER 10uF 25V X7R 0805", "10k 1% 0603 0.1W", "RES 4K7 0402", "IND 10uH 1A", "100nF/50V".
 */
export function parseDescription(...parts: (string | null | undefined)[]): ParsedDescription {
  const text = parts
    .filter(Boolean)
    .join(" ")
    .replace(/µ|μ/g, "u")
    // Units written out or the old way: 0.1MICROF, 0.1 MFD, 100 PICOF.
    .replace(/(\d)\s*(?:MICRO\s*F(?:ARADS?)?|MFD|UFD)\b/gi, "$1uF")
    .replace(/(\d)\s*NANO\s*F(?:ARADS?)?\b/gi, "$1nF")
    .replace(/(\d)\s*PICO\s*F(?:ARADS?)?\b/gi, "$1pF");
  const out: ParsedDescription = { kind: null };

  const chip = text.match(new RegExp(`(?<![\\d.])(${CHIP_SIZES.join("|")})(?![\\d.])`));
  if (chip) out.package = chip[1];
  else {
    const metric = text.match(/\b(1005|1608|2012|3216|3225|6332)\s*(metric|M)\b/i);
    if (metric) out.package = METRIC_TO_IMPERIAL[metric[1]];
  }

  const diel = text.match(/\b(X7R|X5R|X7S|X6S|X8R|C0G|COG|NP0|NPO|Y5V|Z5U)\b/i);
  if (diel) {
    const d = diel[1].toUpperCase();
    out.dielectric = d === "NP0" || d === "NPO" || d === "COG" ? "C0G" : d;
  }

  const volt = text.match(/(?<![\w.])(\d+(?:\.\d+)?)\s*V(?:DC|AC)?\b/i);
  if (volt) out.voltage = Number(volt[1]);

  const tol = text.match(/±?\s*(\d+(?:\.\d+)?)\s*%/);
  if (tol) out.tolerance = Number(tol[1]);

  const watt = text.match(/(?<![\w.])(\d+\/\d+|\d+(?:\.\d+)?)\s*(m?)W\b/);
  if (watt) {
    const [a, b] = watt[1].split("/");
    const w = b ? Number(a) / Number(b) : Number(a);
    out.power = watt[2] === "m" ? w / 1000 : w;
  }

  const cap = text.match(/(?<![\w.])(\d+(?:\.\d+)?\s*[pnu]|\d+[pnu]\d+)\s*F\b/i) ?? (/\bCAP/i.test(text) ? text.match(/(?<![\w.])(\d+(?:\.\d+)?\s*[pnu]|\d+[pnu]\d+)(?![\w])/i) : null);
  const ind = text.match(/(?<![\w.])(\d+(?:\.\d+)?\s*[num]|\d+[nu]\d+)\s*H\b/i);
  const res =
    text.match(/(?<![\w.])(\d+(?:\.\d+)?\s*[kKM]?)\s*(?:Ω|ohms?)(?!\w)/i) ??
    text.match(/(?<![\w.])(\d+(?:\.\d+)?[RkKM]\d*)(?![\w.%])/) ??
    (/\bRES/i.test(text) ? text.match(/(?<![\w.])(\d+(?:\.\d+)?[kKM]?)(?![\w.%])(?!\s*(?:V|W|%|pF|nF|uF))/) : null);

  if (cap && !/\bRES|\bIND/i.test(text)) {
    // "100PF" is picofarads: the prefix is lower case whatever the BoM's typing.
    const v = num(cap[1].replace(/\s+/g, "").toLowerCase() + "F");
    if (v !== null) {
      out.kind = "capacitor";
      out.capacitance = v;
    }
  } else if (ind) {
    // "7.2MH" is millihenries: there is no megahenry on a board.
    const v = num(ind[1].replace(/\s+/g, "").toLowerCase() + "H");
    if (v !== null) {
      out.kind = "inductor";
      out.inductance = v;
    }
  } else if (res) {
    const raw = res[1].replace(/\s+/g, "");
    // A bare chip size ("0603") must not be read as a 603 Ω resistor.
    if (!CHIP_SIZES.includes(raw)) {
      const v = num(raw);
      if (v !== null) {
        out.kind = "resistor";
        out.resistance = v;
      }
    }
  }
  return out;
}
