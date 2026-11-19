import { normaliseMpn, resolveManufacturer, type AliasIndex } from "@/lib/normalise";
import { countRefDes } from "@/lib/refdes";
import type { BomField, ColumnMapping } from "./fields";
import { isBareBoardLine } from "./bare-board";
import { checkLine, checkToIssue } from "./line-checks";

export type ScrubIssue =
  | "MISSING_MPN"
  | "MISSING_QTY"
  | "QTY_FROM_REFDES"
  | "QTY_REFDES_MISMATCH"
  | "UNKNOWN_MANUFACTURER"
  | "DUPLICATE_MPN";

export type ScrubbedLine = {
  lineNo: number;
  rawRow: string[];
  rawMpn: string | null;
  mpn: string | null; // cleaned
  /** Further part numbers the cell or the description names: approved alternates, tried when the first does not match. */
  altMpns?: string[];
  /** The maker an alternate names, by position in altMpns (an alternates column gives "MPN (Maker)"); unset: the line's own. */
  altMakers?: (string | null | undefined)[];
  rawManufacturer: string | null;
  manufacturer: string | null; // canonical, when recognised
  qty: number;
  refDes: string | null;
  description: string | null;
  value: string | null;
  package: string | null;
  dnp: boolean;
  customerPn: string | null;
  /** Scrub codes, and line checks as "CODE: what is wrong". */
  issues: string[];
};

const EMPTY_MPN = /^(n\/?a|none|tbd|tba|-+|\?+|x+|0|null|generic|any)$/i;
const DNP_VALUE = /^(dnp|dnf|dni|nf|nc|no|n|false|0|not fitted|not placed|do not (place|populate|fit|install)|no ?pop|no ?stuff)$/i;
const DNP_TEXT = /\b(DNP|DNF|DNI|NOT ?FITTED|NO ?POP(ULATE)?|DO NOT (PLACE|POPULATE|FIT))\b/i;

export function cleanMpn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const unquote = (v: string) => v.replace(/^["'\s]+|["'\s]+$/g, "");
  let s = unquote(unquote(raw).replace(/^(mpn|p\/?n|part ?(no|number)?)\s*[:#]\s*/i, ""));
  s = s.replace(/\s+/g, " ").trim();
  // DigiKey part numbers pasted instead of MPNs: "296-1395-1-ND" can't be cleaned to an MPN,
  // but "LM358DR-ND" style suffixes can.
  s = s.replace(/-ND$/i, "");
  if (!s || EMPTY_MPN.test(s)) return null;
  return s;
}

/**
 * The part numbers in one cell. Customers write an approved second source next to the first: "A / B", "A; B",
 * "A or B", one per line. A slash inside a part number ("LM317T/NOPB") is not a separator: only a slash with a
 * space beside it is.
 */
export function splitMpns(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/\s+\/\s*|\s*\/\s+|\s*[;|\n]\s*|\s+(?:or|OR|alt\.?|ALT\.?)\s+|\s*,\s+/)
    .map((p) => cleanMpn(p))
    .filter((p): p is string => !!p);
  const seen = new Set<string>();
  // After the first, only what looks like a part number counts ("… / TI" names the maker, not a second part).
  return parts.filter((p, i) => (i > 0 && (p.length < 4 || !/\d/.test(p))) || seen.has(normaliseMpn(p)) ? false : (seen.add(normaliseMpn(p)), true));
}

/**
 * An alternates column: "A; B", "A / B", or "MPN (Maker)" per entry, as written by a customer or by the upload when it
 * joins a part-options sheet to the BoM (src/lib/bom/bom-table.ts).
 */
export function readAlternates(raw: string | null | undefined): { mpn: string; maker: string | null }[] {
  if (!raw) return [];
  const out: { mpn: string; maker: string | null }[] = [];
  for (const entry of raw.split(/\s*;\s*|\s*\n\s*/)) {
    const m = entry.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    for (const text of splitMpns(m ? m[1] : entry)) {
      const pn = partNumberIn(text);
      if (!pn || out.some((o) => normaliseMpn(o.mpn) === normaliseMpn(pn.mpn))) continue;
      out.push({ mpn: pn.mpn, maker: m ? m[2].trim() : pn.maker });
    }
  }
  return out;
}

/** Words and values that make an entry a description of a part rather than its number: "RK35xx family", "2 to 4 GB". */
const NOT_A_NUMBER = /\b(family|families|series|class|range|type|compatible|equivalent|similar|based|companion|discrete|generic|module|sensor|chipset|or|to|and|with|in|of|tbd|tbc)\b|(?:^|\s)\d+(?:\.\d+)?\s*(gb|mb|kb|tb|gbit|mbit|mah|ah|uh|µh|nh|mh|v|a|w|mw|hz|khz|mhz|ghz|ohms?|Ω|pf|nf|uf|µf|mm)\b/i;

/** A family written with placeholders: "RV11xx", "BQ2588x", "ICM-426xx", "STM32F0XX", "LM3*". */
const WILDCARD = /[0-9A-Z]x{1,3}(?=$|[-_/\s])|\dX{2,}(?=$|[-_/\s])|[*?#]$/;

/**
 * The part number in one alternate entry, or null when the entry is not one. A second source can be written with its
 * maker in front ("Bosch BMI270", "TI BQ25895"); a guess such as "Rockchip RK35xx family", "LPDDR4X 2 to 4 GB" or a
 * family with placeholders ("TI BQ2588x") names no part, and the matcher should not try it.
 */
export function partNumberIn(text: string): { mpn: string; maker: string | null } | null {
  const t = text.trim();
  if (!t || NOT_A_NUMBER.test(t) || t.split(/\s+/).some((w) => WILDCARD.test(w))) return null;
  const words = t.split(/\s+/);
  const coded = (w: string) => w.length >= 3 && /\d/.test(w) && /[A-Za-z]/.test(w);
  if (words.length === 1) return /\d/.test(t) && t.length >= 3 ? { mpn: t, maker: null } : null;
  // "Maker PART": one coded word last, one to three plain words before it.
  const last = words[words.length - 1];
  const before = words.slice(0, -1);
  if (coded(last) && before.length <= 3 && before.every((w) => /^[A-Za-z][A-Za-z&.-]*$/.test(w))) return { mpn: last, maker: before.join(" ") };
  return null;
}

/** A part number and maker written into the description: "… - MPN : CL05C8R2CB51PNC, MFG. : Samsung". */
export function mpnInText(text: string | null | undefined): { mpn: string | null; maker: string | null } {
  const t = text ?? "";
  const mpn = t.match(/\bM(?:FR)?\.?\s?P\.?\s?N\.?\s*[:=]\s*([A-Z0-9][A-Z0-9\-/=#.+]{4,})/i)?.[1] ?? null;
  const maker = t.match(/\bM(?:FG|FR|AKE|ANUFACTURER)\.?\s*[:=]\s*([A-Za-z][A-Za-z0-9 &.\-]{1,40}?)\s*(?=[,;)\]]|$)/i)?.[1]?.trim() ?? null;
  return { mpn: cleanMpn(mpn?.replace(/[.,;]+$/, "")), maker };
}

export function parseQty(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}

function pick(row: string[], mapping: ColumnMapping, field: BomField): string | null {
  const idx = mapping.indexOf(field);
  if (idx < 0) return null;
  const v = row[idx]?.trim();
  return v ? v : null;
}

/**
 * A real line has an MPN, a quantity or designators. Rows with only text in Value/Description
 * ("Power", "MCU section") are section titles; rows with nothing are spacers.
 */
function isContentRow(row: string[], mapping: ColumnMapping): boolean {
  return (["mpn", "qty", "refDes"] as BomField[]).some((f) => pick(row, mapping, f));
}

/** The bare board's line, when the BoM has one: its text and the customer's code for the board. */
export function findBareBoard(rows: string[][], headerRow: number, mapping: ColumnMapping): { text: string; customerPn: string | null } | null {
  for (const row of rows.slice(headerRow + 1)) {
    const text = pick(row, mapping, "description") ?? pick(row, mapping, "value");
    if (isBareBoardLine(text, pick(row, mapping, "refDes"))) return { text: text!, customerPn: pick(row, mapping, "customerPn") };
  }
  return null;
}

export function scrubRows(rows: string[][], headerRow: number, mapping: ColumnMapping, aliases: AliasIndex): ScrubbedLine[] {
  const lines: ScrubbedLine[] = [];
  for (const row of rows.slice(headerRow + 1)) {
    if (!isContentRow(row, mapping)) continue;
    const issues: string[] = [];
    const rawMpn = pick(row, mapping, "mpn");
    const refDes = pick(row, mapping, "refDes");
    const description = pick(row, mapping, "description");
    const value = pick(row, mapping, "value");
    // The bare board's own line is the board's spec, not a component (src/lib/bom/bare-board.ts).
    if (isBareBoardLine(description ?? value, refDes)) continue;
    const written = mpnInText(description);
    const named = splitMpns(rawMpn);
    const mpn = named[0] ?? null;
    const altMpns = named.slice(1);
    if (written.mpn && !named.some((m) => normaliseMpn(m) === normaliseMpn(written.mpn!))) altMpns.push(written.mpn);
    const altMakers: (string | null | undefined)[] = altMpns.map(() => undefined);
    // Second sources from a column of their own, each with its own maker when it names one.
    for (const alt of readAlternates(pick(row, mapping, "alternates"))) {
      if ((mpn && normaliseMpn(mpn) === normaliseMpn(alt.mpn)) || altMpns.some((a) => normaliseMpn(a) === normaliseMpn(alt.mpn))) continue;
      altMpns.push(alt.mpn);
      altMakers.push(alt.maker ? (resolveManufacturer(alt.maker, aliases) ?? null) : null);
    }
    // A maker written into the description belongs to the part number written next to it.
    const makerFromText = written.maker && (!written.mpn || (mpn && normaliseMpn(written.mpn) === normaliseMpn(mpn))) ? written.maker : null;
    const rawManufacturer = pick(row, mapping, "manufacturer") ?? makerFromText;
    const manufacturer = resolveManufacturer(rawManufacturer, aliases);
    const dnpCell = pick(row, mapping, "dnp");

    const refCount = countRefDes(refDes);
    let qty = parseQty(pick(row, mapping, "qty"));
    if (qty === null) {
      if (refCount) {
        qty = refCount;
        issues.push("QTY_FROM_REFDES");
      } else {
        qty = 0;
        issues.push("MISSING_QTY");
      }
    } else if (refCount && refCount !== qty && qty !== 0) {
      // A quantity of 0 next to designators is the usual way to write "not fitted", not a miscount.
      issues.push("QTY_REFDES_MISMATCH");
    }

    // "Populate = Yes/Fitted" means placed; "DNP = x" means not placed; free text "DNP" anywhere too.
    const dnpHeader = mapping.indexOf("dnp");
    let dnp = false;
    if (dnpCell) {
      const isPopulateColumn = dnpHeader >= 0 && /populate|fitted|fit|mount|install|assemble|placement/i.test(rows[headerRow]?.[dnpHeader] ?? "");
      dnp = isPopulateColumn ? DNP_VALUE.test(dnpCell) : !/^(no|n|false|0|-)$/i.test(dnpCell);
    }
    if (!dnp && (DNP_TEXT.test(value ?? "") || DNP_TEXT.test(description ?? ""))) dnp = true;
    if (qty === 0 && !issues.includes("MISSING_QTY")) dnp = true;

    if (!mpn && !dnp) issues.push("MISSING_MPN");
    if (rawManufacturer && !manufacturer && !makerFromText) issues.push("UNKNOWN_MANUFACTURER");
    if (altMpns.length) issues.push("MULTIPLE_MPN");
    if (!dnp) issues.push(...checkLine({ mpns: [...(mpn ? [mpn] : []), ...altMpns], description, value, package: pick(row, mapping, "package") }).map(checkToIssue));

    lines.push({
      lineNo: lines.length + 1,
      rawRow: row,
      rawMpn,
      mpn,
      altMpns,
      ...(altMakers.some((m) => m !== undefined) ? { altMakers } : {}),
      rawManufacturer,
      manufacturer,
      qty,
      refDes,
      description,
      value,
      package: pick(row, mapping, "package"),
      dnp,
      customerPn: pick(row, mapping, "customerPn"),
      issues,
    });
  }

  // Same MPN on several lines usually means the customer split one part by section; flag for merge.
  const byKey = new Map<string, ScrubbedLine[]>();
  for (const l of lines) {
    if (!l.mpn) continue;
    const key = normaliseMpn(l.mpn);
    byKey.set(key, [...(byKey.get(key) ?? []), l]);
  }
  for (const group of byKey.values()) {
    if (group.length > 1) group.forEach((l) => l.issues.push("DUPLICATE_MPN"));
  }
  return lines;
}
