/**
 * Distributor part numbers as customers' BoMs carry them (Phase 47): which distributor a number belongs to, from the
 * column's header or the number's own shape, and which maker a distributor's prefix stands for. Versioned seed data:
 * add a prefix here (with a test) when a customer's BoM shows one we do not know. Only prefixes we are sure of are
 * listed; an unknown prefix says nothing.
 */

export const DISTRIBUTOR_PNS_VERSION = 1;

export type Distributor = "Digi-Key" | "Mouser" | "LCSC" | "Farnell" | "Newark" | "element14" | "Arrow" | "RS" | "TME";

/** Header words naming a distributor ("Part Number (Digikey)", "Mouser #", "LCSC Part", "Farnell Order Code"). */
const HEADER: [RegExp, Distributor][] = [
  [/digi[\s-]?key|\bdk\b/i, "Digi-Key"],
  [/mouser/i, "Mouser"],
  [/\blcsc\b|jlc/i, "LCSC"],
  [/farnell/i, "Farnell"],
  [/newark/i, "Newark"],
  [/element\s?14/i, "element14"],
  [/\barrow\b/i, "Arrow"],
  [/\brs\b(?:\s*(?:components|stock|pn|part|no|#))|rs[\s-]?online/i, "RS"],
  [/\btme\b/i, "TME"],
];

export function distributorFromHeader(header: string | null | undefined): Distributor | null {
  const h = header ?? "";
  return HEADER.find(([re]) => re.test(h))?.[1] ?? null;
}

/** The distributor a number's shape gives away: Digi-Key's "-ND", LCSC's "C" + digits, Mouser's "595-…". */
export function distributorFromPn(pn: string | null | undefined): Distributor | null {
  const p = (pn ?? "").trim().toUpperCase();
  if (!p) return null;
  if (/-ND$/.test(p)) return "Digi-Key";
  if (/^C\d{3,8}$/.test(p)) return "LCSC";
  if (/^\d{2,4}-[A-Z0-9]/.test(p) && MOUSER_PREFIX[p.split("-")[0]]) return "Mouser";
  return null;
}

/** Digi-Key's numeric maker prefixes ("490-5523-1-ND" is Murata). */
export const DIGIKEY_PREFIX: Record<string, string> = {
  "490": "Murata Manufacturing",
  "445": "TDK",
  "399": "KEMET",
  "541": "Vishay",
  "296": "Texas Instruments",
  "497": "STMicroelectronics",
  "553": "Pulse Electronics",
  "513": "Eaton",
  "311": "Yageo",
  "1276": "Samsung Electro-Mechanics",
  "587": "Taiyo Yuden",
  "478": "KYOCERA AVX",
  "732": "Würth Elektronik",
  "1727": "Nexperia",
};

/** Digi-Key's letter prefixes of older catalogue numbers ("P15455CT-ND" is Panasonic, "WM3821-ND" Molex). */
export const DIGIKEY_LETTERS: [RegExp, string][] = [
  [/^P\d/, "Panasonic"],
  [/^F\d/, "Littelfuse"],
  [/^WM\d/, "Molex"],
  [/^A\d/, "TE Connectivity"],
  [/^HS\d/, "Boyd"],
  [/^XC\d/, "ECS Inc"],
];

/** Mouser's numeric maker prefixes ("595-TPS54331DR" is Texas Instruments). */
export const MOUSER_PREFIX: Record<string, string> = {
  "81": "Murata Manufacturing",
  "810": "TDK",
  "80": "KEMET",
  "71": "Vishay",
  "595": "Texas Instruments",
  "511": "STMicroelectronics",
  "863": "onsemi",
  "621": "Diodes Incorporated",
  "576": "Littelfuse",
  "652": "Bourns",
  "538": "Molex",
  "571": "TE Connectivity",
  "667": "Panasonic",
  "603": "Yageo",
  "187": "Samsung Electro-Mechanics",
  "963": "Taiyo Yuden",
  "581": "KYOCERA AVX",
  "710": "Würth Elektronik",
  "771": "Nexperia",
  "584": "Analog Devices",
  "579": "Microchip Technology",
  "726": "Infineon Technologies",
};

/** A distributor number's packaging ending: Digi-Key cut tape, tape and reel, Digi-Reel. */
const PACKING = /(?:CT|TR|DKR)$/;
/** Endings an MPN may lack and still be the same part: lead-free, tape and reel. */
const ORDERING_ENDING = /^(?:\/NOPB|#PBF|PBF|-?TR|\/TR|-T|-E3|-GE3|-M3|-7|-13|G4|-F)+$/;

const alnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type SupplierPnFinding = { level: "red" | "amber"; text: string };

/**
 * A line's distributor part number against its MPN and maker: missing (when the BoM carries the column), not a number
 * of that distributor, a prefix of another maker, or an ordering ending the BoM's part number leaves out.
 * `sameMaker` says whether two maker names are one maker (the alias table's call). Null: nothing to say.
 */
export function checkSupplierPn(
  l: { pn: string | null; distributor: Distributor | null; mpn: string | null; maker: string | null },
  sameMaker: (a: string, b: string) => boolean,
): SupplierPnFinding | null {
  const pn = l.pn?.trim() ?? "";
  const who = l.distributor ?? distributorFromPn(pn);
  const name = who ?? "distributor";
  if (!pn) return l.mpn ? { level: "amber", text: `no ${name} part number on this line` } : null;
  const P = pn.toUpperCase();
  if (who === "Digi-Key" && !/-ND$/.test(P)) return { level: "amber", text: `“${pn}” is not a Digi-Key part number (they end in -ND)` };
  if (who === "LCSC" && !/^C\d{3,8}$/.test(P)) return { level: "amber", text: `“${pn}” is not an LCSC part number (C and digits)` };
  if (!/\d/.test(P)) return { level: "amber", text: `“${pn}” is not a distributor part number` };
  const mpn = l.mpn?.trim() ?? "";
  if (mpn && who === "Digi-Key") {
    const core = P.replace(/-ND$/, "").replace(PACKING, "");
    const M = mpn.toUpperCase();
    if (core.startsWith(M) && core.length > M.length && ORDERING_ENDING.test(core.slice(M.length)))
      return { level: "amber", text: `${name} sells it as ${core}: the BoM's part number leaves out the ordering ending ${core.slice(M.length)}` };
    // The number carries the part number itself: it is the same part.
    if (alnum(core).includes(alnum(M).slice(0, Math.max(5, Math.min(alnum(M).length, 8))))) return null;
  }
  if (!l.maker) return null;
  const prefixMaker =
    who === "Digi-Key" ? (DIGIKEY_PREFIX[P.split("-")[0]] ?? DIGIKEY_LETTERS.find(([re]) => re.test(P))?.[1] ?? null) : who === "Mouser" ? (MOUSER_PREFIX[P.split("-")[0]] ?? null) : null;
  if (prefixMaker && !sameMaker(prefixMaker, l.maker)) return { level: "amber", text: `${name} ${pn} is a ${prefixMaker} number; the line's maker is ${l.maker}` };
  return null;
}
