/**
 * The BoM table as the tool keeps it (Phase 37). A customer's BoM is not always one clean table on one sheet: pages
 * stacked in one sheet (or one CSV) repeat the header and carry a section title, a "Total" row closes the list, a
 * per-designator export has one row per designator, a BoM is split over sheets (top and bottom, PCBA and mechanical),
 * and the approved second sources sit on a sheet of their own. These turn all of that into one table in the
 * customer's own columns, and say what was done. Pure.
 */
import { autoMap, detectHeaderRow, headerConfidence, isDesignatorCell, isHeaderLike, normaliseHeader } from "./columns";
import { BOM_FIELD_LABEL, type BomField, type ColumnMapping } from "./fields";
import { parseQty, readAlternates } from "./scrub";
import { expandRefDes } from "@/lib/refdes";
import { normaliseMpn } from "@/lib/normalise";
import { cellAt, rowAt, type SheetPos } from "./details";

export type TableFinding = { level: "amber" | "red"; text: string };

export type BomTable = {
  sheet: string;
  /** The rows above the header: a title block. */
  title: string[][];
  header: string[];
  /** Columns of the customer's own header row; the tool's columns (a count, a section, alternates) come after them. */
  own: number;
  /** The file had no header row: the tool named the columns ("Column A") and row 1 is a line. */
  headerless: boolean;
  data: string[][];
  /** Where each line starts in the sheet's rows (its first row, when grouped). */
  at: number[];
  /** Section of each data row ("" outside any): a title row inside the table, or the sheet it was merged from. */
  section: string[];
  sections: string[];
  /** "Total" rows: what they say, to check against the lines. */
  totals: { label: string; qty: number; from: string }[];
  /** Header rows repeated inside the table, title rows (section titles, a repeated title block, page footers) taken out. */
  dropped: { headers: number; titles: number };
  /** One row per designator, grouped into lines. */
  grouped: { rows: number; lines: number; key: string } | null;
  findings: TableFinding[];
};

const TOTAL = /^(grand\s+)?(sub-?\s*)?totals?\s*:?$/i;
const SECTION_WORD = /^(sheet|section|page|assembly|sub-?assembly|group|side|module)\b\s*[:\-–]?\s*/i;
/** A section named for a side of the board: "TOP SIDE", "Bottom", "Solder side". */
const SIDE_TITLE = /^(top|bottom|bot|primary|secondary|component|solder|front|back)(\s*(side|layer))?$/i;
/** A page footer or header: "Page 1 of 2", "Sheet 2/3", "- 3 -". */
const PAGE = /^(page|sheet|pg\.?)\s*\d+\s*((of|\/)\s*\d+)?$|^\d+\s*(of|\/)\s*\d+$|^-\s*\d+\s*-$/i;
/** A title that names the document, not a part of it: kept out of the first section. */
const DOC_TITLE = /\b(bom|bill\s*of\s*materials?|parts?\s*list|rev(ision)?\.?\s*[\w.]+)\b/i;
const ITEM_KEY = /^(bomitem|bomitemno|item|itemno|itemnumber|itemid|line|lineno|linenumber|bomline|findno|findnumber|pos|posno)$/;
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const list = (xs: string[], max = 8) => (xs.length > max ? `${xs.slice(0, max).join(", ")} and ${xs.length - max} more` : xs.join(", "));
/** A column the upload adds, named for the sheet it came from when the name still reads as a header. */
const toolColumn = (name: string, sheet: string) => (`${name} (${sheet})`.length <= 40 && `${name} (${sheet})`.split(/\s+/).length <= 5 ? `${name} (${sheet})` : name);
const squash = (r: string[]) => r.map((c) => c.trim().toLowerCase()).filter(Boolean).join("\u0000");

function isHeaderRow(r: string[]): ColumnMapping | null {
  const cells = r.map((c) => c.trim()).filter(Boolean);
  const like = cells.filter(isHeaderLike).length;
  if (cells.length < 2 || like < 2 || like < cells.length * 0.6) return null;
  const { mapping } = autoMap(r);
  return mapping.filter(Boolean).length >= 2 ? mapping : null;
}

/** What a cell holds, to tell a header from a line: a link, a number, a code ("TMTD 570"), a word, or a sentence. */
function shape(cell: string): string {
  const c = cell.trim();
  if (!c) return "";
  if (/^https?:\/\//i.test(c)) return "link";
  if (/^-?[\d.,]+$/.test(c)) return "number";
  if (/\d/.test(c) && /[A-Za-z]/.test(c)) return "code";
  return c.split(/\s+/).length > 2 ? "text" : "word";
}

/**
 * A table with no header row: no row reads like one, and row 1 looks like the rows under it (a list of part numbers,
 * a catalogue export). Its first row is a line, not a header.
 */
export function isHeaderless(rows: string[][]): boolean {
  if (rows.length < 3) return false;
  const at = detectHeaderRow(rows);
  if (rows[at].filter(isHeaderLike).length >= 2) return false;
  const first = rows[0];
  const below = rows.slice(1, 41);
  const cols = first.map((c, j) => j).filter((j) => first[j].trim());
  if (!cols.length) return false;
  const alike = cols.filter((j) => {
    const counts = new Map<string, number>();
    for (const r of below) {
      const s = shape(r[j] ?? "");
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return !!top && top[0] !== "word" && shape(first[j]) === top[0];
  });
  return alike.length >= cols.length * 0.6;
}

const columnName = (j: number) => {
  let s = "";
  for (let c = j + 1; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return `Column ${s}`;
};

/** The BoM table of one sheet: header found under any title block, then cleaned and grouped. */
export function readBomTable(rows: string[][], sheet: string, pos: SheetPos): BomTable {
  const headerless = isHeaderless(rows);
  const headerRow = headerless ? -1 : detectHeaderRow(rows);
  const width = Math.max(0, ...rows.map((r) => r.length));
  const header = headerless ? Array.from({ length: width }, (_, j) => columnName(j)) : [...(rows[headerRow] ?? [])];
  const t: BomTable = {
    sheet,
    title: headerless ? [] : rows.slice(0, headerRow),
    header,
    own: header.length,
    headerless,
    data: [],
    at: [],
    section: [],
    sections: [],
    totals: [],
    dropped: { headers: 0, titles: 0 },
    grouped: null,
    findings: [],
  };
  cleanRows(t, rows.slice(headerRow + 1), headerRow + 1, pos);
  groupByItem(t);
  return t;
}

/**
 * Pages stacked in one table: a row that repeats the header (or is another header) starts a new block and is not a
 * line; a one-cell title names the section of the rows under it; a "Total" row is a checksum, not a line; a page
 * footer and a title block printed again on the next page are left out.
 */
function cleanRows(t: BomTable, data: string[][], first: number, pos: SheetPos) {
  const where = (i: number) => rowAt(pos, first + i);
  const mapping = autoMap(t.header, data).mapping;
  const sig = t.header.map(normaliseHeader);
  const col = (f: BomField) => mapping.indexOf(f);
  const titles = new Set(t.title.map(squash).filter(Boolean));
  const isRepeat = (cells: string[]) => {
    const filled = cells.filter(Boolean).length;
    const same = cells.filter((c, j) => c && normaliseHeader(c) === sig[j]).length;
    return filled >= 2 && same >= Math.max(2, filled * 0.8);
  };
  const beforeHeader = (i: number) => {
    const next = data[i + 1];
    return !!next && (isHeaderRow(next.map((c) => c.trim())) !== null || isRepeat(next.map((c) => c.trim())));
  };
  // A one-cell title is a section when it says so ("Sheet: Box build"), when a header follows it, or when the table
  // opens with one (it is divided from its first line); a lone one-cell row in the middle of the lines is not. In a
  // list of one column (part numbers, no header) every row has one cell: those are its lines, not titles.
  const filledRows = data.filter((r) => r.some((c) => c.trim()));
  const oneColumn = t.headerless || t.header.filter((h) => h.trim()).length <= 1 || filledRows.filter((r) => r.filter((c) => c.trim()).length === 1).length >= filledRows.length * 0.8;
  const opens = (() => {
    if (oneColumn) return false;
    const first = data.find((r) => !isRepeat(r.map((c) => c.trim())));
    return !!first && first.filter((c) => c.trim()).length === 1;
  })();
  let section = "";
  let blockStart = true;
  // Columns of the block being read, onto the table's: set by a header row that differs from the first.
  let layout: number[] | null = null;
  data.forEach((raw, i) => {
    const cells = raw.map((c) => c.trim());
    const filled = cells.filter(Boolean).length;
    if (!filled) return;
    if (isRepeat(cells)) {
      layout = null;
      t.dropped.headers++;
      blockStart = true;
      return;
    }
    const other = isHeaderRow(cells);
    if (other) {
      // Another header: its fields go to the table's columns for the same fields; a field the table lacks gets a column.
      layout = cells.map((c, j) => {
        const f = other[j];
        if (!f) return sig.indexOf(normaliseHeader(c));
        if (mapping.indexOf(f) < 0) {
          t.header.push(c);
          sig.push(normaliseHeader(c));
          mapping.push(f);
        }
        return mapping.indexOf(f);
      });
      t.dropped.headers++;
      blockStart = true;
      return;
    }
    // The title block printed again at the top of the next page, and page footers: neither a line nor a section.
    if ((titles.size && titles.has(squash(cells))) || (filled === 1 && PAGE.test(cells.find(Boolean)!))) {
      t.dropped.titles++;
      return;
    }
    const totalAt = cells.findIndex((c) => TOTAL.test(c));
    const ref = col("refDes") >= 0 ? cells[col("refDes")] : "";
    if (totalAt >= 0 && !(ref && isDesignatorCell(ref)) && !(col("mpn") >= 0 && col("mpn") !== totalAt && cells[col("mpn")])) {
      const qty = col("qty") >= 0 ? parseQty(cells[col("qty")]) : null;
      if (qty !== null) t.totals.push({ label: cells[totalAt], qty, from: where(i) });
      return;
    }
    if (filled === 1) {
      const j = cells.findIndex(Boolean);
      const text = cells[j];
      const words = /[A-Za-z]/.test(text) && text.split(/\s+/).length <= 6;
      const asDesignator = j === col("refDes") && isDesignatorCell(text);
      const said = SECTION_WORD.test(text) || beforeHeader(i);
      if (words && !asDesignator && !(oneColumn && !said) && (said || (opens && (blockStart || !/\d/.test(text))))) {
        section = text.replace(SECTION_WORD, "").trim() || text;
        if (!t.sections.includes(section)) t.sections.push(section);
        t.dropped.titles++;
        return;
      }
    }
    blockStart = false;
    let row = raw;
    if (layout) {
      const to = layout;
      row = t.header.map(() => "");
      raw.forEach((c, j) => {
        if (to[j] >= 0 && c) row[to[j]] = c;
      });
    }
    t.data.push(row);
    t.at.push(first + i);
    t.section.push(section);
  });
  // The first block's own section, when it sits in the title block just above the header ("TOP SIDE", then later
  // "BOTTOM SIDE" above the second header): the rows before the first section title are under it.
  const lead = t.section.findIndex(Boolean);
  const above = t.title.at(-1)?.map((c) => c.trim()).filter(Boolean) ?? [];
  if (lead > 0 && above.length === 1 && !DOC_TITLE.test(above[0]) && /[A-Za-z]/.test(above[0])) {
    const text = above[0];
    const later = t.sections.join(" ").toLowerCase().split(/\s+/);
    if (SECTION_WORD.test(text) || SIDE_TITLE.test(text) || text.toLowerCase().split(/\s+/).some((w) => w.length >= 3 && later.includes(w))) {
      const name = text.replace(SECTION_WORD, "").trim() || text;
      for (let k = 0; k < lead; k++) t.section[k] = name;
      if (!t.sections.includes(name)) t.sections.unshift(name);
    }
  }
  const width = t.header.length;
  t.data = t.data.map((r) => Array.from({ length: width }, (_, j) => r[j] ?? ""));
}

/**
 * One row per designator (an ERP or CAD export: "Reference | BOM Item | MPN") becomes one line per item: the
 * designators joined, the quantity counted. The key is an item column that repeats, else the house code, else the MPN;
 * grouped on a part number alone, rows join only when their description, value and package agree too.
 */
function groupByItem(t: BomTable) {
  const { mapping } = autoMap(t.header, t.data);
  const ref = mapping.indexOf("refDes");
  if (ref < 0 || t.data.length < 4) return;
  const withRef = t.data.filter((r) => r[ref]?.trim());
  if (withRef.length < t.data.length * 0.8 || withRef.filter((r) => expandRefDes(r[ref]).length === 1).length < withRef.length * 0.9) return;
  const qty = mapping.indexOf("qty");
  if (qty >= 0 && t.data.some((r) => r[qty]?.trim() && parseQty(r[qty]) !== 1)) return;
  // An item column that repeats groups the rows; a house code or an MPN only when it repeats a lot (a hand-made
  // BoM can have the same part on two lines on purpose).
  const items = t.header.map((h, j) => (ITEM_KEY.test(normaliseHeader(h)) ? j : -1)).filter((j) => j >= 0);
  const repeats = (k: number, share: number) => {
    const vals = t.data.map((r) => r[k]?.trim()).filter(Boolean);
    return vals.length >= t.data.length * 0.8 && new Set(vals).size <= vals.length * share;
  };
  const itemKey = items.find((k) => repeats(k, 0.9));
  const key = itemKey ?? (t.data.length >= 10 ? [mapping.indexOf("customerPn"), mapping.indexOf("mpn")].find((k) => k >= 0 && repeats(k, 0.7)) : undefined);
  if (key === undefined) return;
  const partCols = (["mpn", "manufacturer", "customerPn", "description", "value", "package"] as BomField[]).map((f) => mapping.indexOf(f)).filter((c) => c >= 0);

  // A not-fitted row never joins a fitted one.
  const dnp = mapping.indexOf("dnp");
  const groups = new Map<string, number[]>();
  t.data.forEach((r, i) => {
    const same = itemKey === undefined ? partCols.map((c) => r[c]?.trim().toUpperCase() ?? "").join("\u0000") : "";
    const k = r[key]?.trim() ? `${t.section[i]}\u0000${dnp >= 0 ? r[dnp].trim().toUpperCase() : ""}\u0000${r[key].trim()}\u0000${same}` : `\u0001${i}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  const addQty = qty < 0;
  const header = addQty ? [...t.header, "Quantity (rows counted)"] : t.header;
  const data: string[][] = [];
  const section: string[] = [];
  const at: number[] = [];
  const disagree: string[] = [];
  for (const idx of groups.values()) {
    const rows = idx.map((i) => t.data[i]);
    const row = [...rows[0]];
    row[ref] = rows.map((r) => r[ref].trim()).sort(natural).join(", ");
    if (addQty) row.push(String(rows.length));
    else row[qty] = String(rows.length);
    for (const f of ["mpn", "manufacturer", "customerPn", "description", "value", "package"] as BomField[]) {
      const c = mapping.indexOf(f);
      if (c < 0) continue;
      const vals = new Set(rows.map((r) => r[c].trim().toUpperCase()).filter(Boolean));
      if (vals.size > 1) disagree.push(`${rows[0][key]} (${BOM_FIELD_LABEL[f]})`);
    }
    data.push(row);
    section.push(t.section[idx[0]]);
    at.push(t.at[idx[0]]);
  }
  t.grouped = { rows: t.data.length, lines: data.length, key: t.header[key] };
  t.header = header;
  t.data = data;
  t.section = section;
  t.at = at;
  if (disagree.length) t.findings.push({ level: "red", text: `“${t.sheet}”: rows of one ${t.header[key]} disagree for ${list(disagree)}; the first row was taken.` });
}

type Basis = "designators" | "part numbers" | "house codes" | "descriptions";
const BASES: Basis[] = ["designators", "part numbers", "house codes", "descriptions"];

/** The parts a table names on one basis, or null when it has too few of them to compare. */
function keysOf(t: BomTable, basis: Basis): Set<string> | null {
  const { mapping } = autoMap(t.header, t.data);
  const col = (f: BomField) => mapping.indexOf(f);
  let keys: string[] = [];
  if (basis === "designators") keys = col("refDes") >= 0 ? t.data.flatMap((r) => expandRefDes(r[col("refDes")])) : [];
  else if (basis === "part numbers") keys = col("mpn") >= 0 ? t.data.map((r) => normaliseMpn(r[col("mpn")].trim())).filter(Boolean) : [];
  else if (basis === "house codes") keys = col("customerPn") >= 0 ? t.data.map((r) => r[col("customerPn")].trim().toUpperCase()).filter(Boolean) : [];
  else {
    const text = col("description") >= 0 ? col("description") : col("value");
    keys = text >= 0 ? t.data.map((r) => r[text].trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean) : [];
  }
  const set = new Set(keys);
  return set.size >= 2 || (set.size === 1 && t.data.length === 1) ? set : null;
}

/** Two tables compared on the first basis both can be compared on: designators, then part numbers, then descriptions. */
function compareTables(a: BomTable, b: BomTable): { by: Basis; shared: string[]; ratio: number } | null {
  for (const by of BASES) {
    const ka = keysOf(a, by);
    const kb = keysOf(b, by);
    if (!ka || !kb) continue;
    const shared = [...kb].filter((x) => ka.has(x));
    return { by, shared, ratio: shared.length / Math.max(1, Math.min(ka.size, kb.size)) };
  }
  return null;
}

/** A sheet name that says the BoM is split: a side, or an assembly level (PCBA, mechanical, box build, cables). */
const SPLIT_NAME = /\b(top|bottom|bot|primary|secondary|smt|smd|tht|pth|through[\s-]*hole|pcba|pcb|mech(anical)?|box[\s-]*build|enclosure|housing|cables?|harness|wiring|accessor(y|ies)|packag(e|ing)|labels?|kit|hardware|fasteners?|sub[\s-]*assembly)\b/i;

/**
 * A sheet name that says the lines are not part of the build: spares, a change (ECO) or removed-parts list, an older
 * or draft copy, a quote or a costing. Such a sheet is merged only when the person ticks it.
 */
const NOT_PART_NAME = /\b(spares?|consumables?|ecos?|ecns?|ecrs?|changes?|change\s*log|removed|deleted|obsolete|old|older|previous|superseded|archived?|backup|draft|quot(e|es|ation)|rfq|costing|costs?|pric(e|es|ing))\b/i;
export const notPartOfBuild = (sheet: string) => NOT_PART_NAME.test(sheet.replace(/[_\-.]+/g, " "));

export type MergeVerdict = {
  sheet: string;
  how: "base" | "merged" | "copy" | "same-parts" | "overlaps" | "unsure";
  of?: string;
  shared?: number;
  by?: Basis;
  /** Why an "unsure" sheet was left out: its name, or nothing to compare it with the base by. */
  why?: "name" | "nothing to compare";
  lines: number;
};

/**
 * Several sheets read as a BoM. Sheets with other parts (a side or an assembly each) are merged into one table, each
 * line tagged with its sheet; a copy, or a sheet listing the same parts again, is not; a sheet that shares only some
 * parts is left out and named, for someone to decide. Sheets are compared on what both carry — designators, part
 * numbers, house codes, descriptions; a sheet that cannot be compared is merged only when its name says it is a part of
 * the BoM (a side, the mechanical parts) or the person chose it. The first table is the base.
 */
export function mergeTables(tables: BomTable[], opts: { chosen?: boolean } = {}): { table: BomTable; verdicts: MergeVerdict[]; findings: TableFinding[] } {
  const [base, ...rest] = tables;
  const verdicts: MergeVerdict[] = [{ sheet: base.sheet, how: "base", lines: base.data.length }];
  const findings: TableFinding[] = [];
  const kept: BomTable[] = [base];
  const rowKey = (r: string[]) => r.map((c) => c.trim().toLowerCase()).join("\u0000");
  for (const t of rest) {
    let verdict: MergeVerdict | null = null;
    let compared = false;
    for (const k of kept) {
      const theirs = new Set(k.data.map(rowKey));
      if (t.data.length && t.data.every((r) => theirs.has(rowKey(r)))) {
        verdict = { sheet: t.sheet, how: "copy", of: k.sheet, lines: t.data.length };
        break;
      }
      const c = compareTables(k, t);
      if (!c) continue;
      compared = true;
      if (c.ratio >= 0.8) {
        verdict = { sheet: t.sheet, how: "same-parts", of: k.sheet, shared: c.shared.length, by: c.by, lines: t.data.length };
        break;
      }
      if (c.ratio > 0.2) {
        verdict = { sheet: t.sheet, how: "overlaps", of: k.sheet, shared: c.shared.length, by: c.by, lines: t.data.length };
        findings.push({ level: "amber", text: `“${t.sheet}” shares ${c.shared.length} ${c.by} with “${k.sheet}” but not all: it was left out of the BoM. Check which sheet is right.` });
        break;
      }
    }
    const words = t.sheet.replace(/[_\-.]+/g, " ");
    if (!verdict && !opts.chosen && notPartOfBuild(t.sheet)) {
      verdict = { sheet: t.sheet, how: "unsure", of: base.sheet, why: "name", lines: t.data.length };
      findings.push({ level: "amber", text: `“${t.sheet}” also reads like a BoM, but its name says it is not part of the build (spares, changes, an older copy or a quote): it was left out. Tick “Use as BoM” on it to add its lines.` });
    }
    if (!verdict && !compared && !opts.chosen && !SPLIT_NAME.test(words)) {
      verdict = { sheet: t.sheet, how: "unsure", of: base.sheet, why: "nothing to compare", lines: t.data.length };
      findings.push({ level: "amber", text: `“${t.sheet}” also reads like a BoM, with nothing to compare it with “${base.sheet}” by (designators, part numbers or descriptions): it was left out. Tick “Use as BoM” on it to add its lines.` });
    }
    if (!verdict) {
      // Merged: designators already on a kept sheet are said for, whatever the sheets were compared on.
      for (const k of kept) {
        const mine = keysOf(t, "designators");
        const theirs = keysOf(k, "designators");
        const both = mine && theirs ? [...mine].filter((x) => theirs.has(x)) : [];
        if (both.length) findings.push({ level: "red", text: `Designators on both “${k.sheet}” and “${t.sheet}”: ${list(both.sort(natural))}.` });
      }
      verdict = { sheet: t.sheet, how: "merged", lines: t.data.length };
      kept.push(t);
    }
    verdicts.push(verdict);
  }
  if (kept.length === 1) return { table: base, verdicts, findings };

  // One table in the base's columns: the same column name, else the same field; a field the base lacks gets a column.
  const header = [...base.header];
  const sig = header.map(normaliseHeader);
  const fields = autoMap(header, base.data).mapping;
  const data: string[][] = [];
  const section: string[] = [];
  const at: number[] = [];
  for (const t of kept) {
    const own = autoMap(t.header, t.data).mapping;
    const to = t.header.map((h, j) => {
      const same = sig.indexOf(normaliseHeader(h));
      if (same >= 0 && normaliseHeader(h)) return same;
      const f = own[j];
      if (!f) return -1;
      if (!fields.includes(f)) {
        header.push(h);
        sig.push(normaliseHeader(h));
        fields.push(f);
      }
      return fields.indexOf(f);
    });
    t.data.forEach((r, i) => {
      const row = header.map(() => "");
      r.forEach((c, j) => {
        if (to[j] >= 0 && c) row[to[j]] = c;
      });
      data.push(row);
      at.push(t.at[i]);
      section.push(t.section[i] ? `${t.sheet} · ${t.section[i]}` : t.sheet);
    });
  }
  const table: BomTable = {
    ...base,
    header,
    data: data.map((r) => Array.from({ length: header.length }, (_, j) => r[j] ?? "")),
    at,
    section,
    sections: kept.map((t) => t.sheet),
    totals: kept.flatMap((t) => t.totals),
    findings: kept.flatMap((t) => t.findings),
  };
  return { table, verdicts, findings };
}

/** The table as rows to keep: title block, header, lines; a Section column when the table has sections. */
export function tableRows(t: BomTable): { rows: string[][]; headerRow: number } {
  const withSection = t.section.some(Boolean) && !t.header.some((h) => normaliseHeader(h) === "section");
  const header = withSection ? [...t.header, "Section"] : t.header;
  const width = Math.max(header.length, ...t.title.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, j) => r[j] ?? "");
  return {
    rows: [...t.title.map(pad), pad(header), ...t.data.map((r, i) => pad(withSection ? [...r, t.section[i]] : r))],
    headerRow: t.title.length,
  };
}

// ───────────────────────────── A sheet with the same parts ─────────────────────────────

const MOUNTED_ON = /^(mountedon|board|boardname|onboard|pcb|pcbname|subassembly|subassy)$/;
const BOARD_ROW = /\b(circuit\s*boards?|pcbs?|bare\s*boards?|printed\s*circuit|pwbs?)\b/i;

export type SamePartsJoin = {
  sheet: string;
  /** Lines of the BoM the sheet's rows were found for. */
  matched: number;
  /** Part numbers the sheet adds as alternates, on how many lines, and into which column. */
  alternates: number;
  altLines: number;
  altColumn: string | null;
  /** The sheet's "Mounted on" column, as the lines' section. */
  sectionFrom: string | null;
  sectioned: number;
  /** The circuit boards the sheet describes: what they are made of and their size. */
  boards: { name: string; text: string; size: [number, number] | null; from: string }[];
};

/**
 * A sheet that lists the BoM's parts again (a design or teardown sheet: "Components") is not a second BoM, but it can
 * carry what the BoM lacks: candidate part numbers, the board each part is mounted on, and the circuit boards' material
 * and size. Its rows are found by description, then by designators; what they add goes into the BoM's columns.
 */
export function joinSameParts(t: BomTable, other: BomTable, pos: SheetPos | null): SamePartsJoin {
  const out: SamePartsJoin = { sheet: other.sheet, matched: 0, alternates: 0, altLines: 0, altColumn: null, sectionFrom: null, sectioned: 0, boards: [] };
  const mine = autoMap(t.header, t.data).mapping;
  const theirs = autoMap(other.header, other.data).mapping;
  const text = (m: ColumnMapping) => (m.indexOf("description") >= 0 ? m.indexOf("description") : m.indexOf("value"));
  const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const refsOf = (s: string | undefined) => expandRefDes(s ?? "").sort(natural).join(",");
  const [myText, theirText, myRef, theirRef] = [text(mine), text(theirs), mine.indexOf("refDes"), theirs.indexOf("refDes")];
  const byText = new Map<string, number[]>();
  other.data.forEach((r, i) => {
    const k = theirText >= 0 ? norm(r[theirText]) : "";
    if (k) byText.set(k, [...(byText.get(k) ?? []), i]);
  });
  // The rows of the sheet that belong to each line: the same description (narrowed by designators when several rows
  // share it, as "D1" … "D4" under one "D1-D4" line), else the same designators.
  const match = t.data.map((r) => {
    const refs = myRef >= 0 ? expandRefDes(r[myRef] ?? "") : [];
    const same = myText >= 0 ? byText.get(norm(r[myText])) ?? [] : [];
    if (same.length === 1) return same;
    if (same.length > 1) {
      if (!refs.length) return same;
      const within = same.filter((i) => theirRef >= 0 && expandRefDes(other.data[i][theirRef] ?? "").length > 0 && expandRefDes(other.data[i][theirRef]).every((x) => refs.includes(x)));
      return within;
    }
    const key = refs.sort(natural).join(",");
    return key && theirRef >= 0 ? other.data.map((_, i) => i).filter((i) => refsOf(other.data[i][theirRef]) === key) : [];
  });
  out.matched = match.filter((m) => m.length).length;

  // Candidate part numbers: into the BoM's alternates column, or a column of their own.
  const altCol = theirs.indexOf("alternates");
  if (altCol >= 0) {
    let into = mine.indexOf("alternates");
    const adds = t.data.map((r, i) => {
      const have = new Set([...(into >= 0 ? readAlternates(r[into]) : []), ...(mine.indexOf("mpn") >= 0 && r[mine.indexOf("mpn")]?.trim() ? [{ mpn: r[mine.indexOf("mpn")].trim() }] : [])].map((a) => normaliseMpn(a.mpn)));
      const found: { mpn: string; maker: string | null }[] = [];
      for (const a of match[i].flatMap((k) => readAlternates(other.data[k][altCol]))) {
        if (have.has(normaliseMpn(a.mpn))) continue;
        have.add(normaliseMpn(a.mpn));
        found.push(a);
      }
      return found;
    });
    if (adds.some((a) => a.length)) {
      if (into < 0) {
        t.header = [...t.header, toolColumn("Alternates", other.sheet)];
        t.data = t.data.map((r) => [...r, ""]);
        into = t.header.length - 1;
      }
      out.altColumn = t.header[into];
      t.data.forEach((r, i) => {
        if (!adds[i].length) return;
        const entries = adds[i].map((a) => (a.maker ? `${a.mpn} (${a.maker})` : a.mpn));
        r[into] = [r[into]?.trim(), ...entries].filter(Boolean).join("; ");
        out.alternates += entries.length;
        out.altLines++;
      });
    }
  }

  // The board each part is mounted on, as the section of its line (when the BoM has no sections of its own).
  const mounted = other.header.findIndex((h) => MOUNTED_ON.test(normaliseHeader(h)));
  if (mounted >= 0 && !t.section.some(Boolean)) {
    t.data.forEach((_, i) => {
      const boards = [...new Set(match[i].map((k) => other.data[k][mounted]?.trim()).filter(Boolean))];
      if (boards.length !== 1) return;
      const on = boards[0];
      t.section[i] = on;
      if (!t.sections.includes(on)) t.sections.push(on);
      out.sectioned++;
    });
    if (out.sectioned) out.sectionFrom = other.header[mounted];
  }

  // The circuit boards: their material (stack-up) and outline.
  const h = other.header.map(normaliseHeader);
  const category = h.findIndex((x) => x === "category" || x === "type" || x === "maincategory");
  const material = h.findIndex((x) => x === "material" || x === "materials" || x === "stackup" || x === "construction");
  const sx = h.findIndex((x) => /^(size|dim|dimension)x/.test(x));
  const sy = h.findIndex((x) => /^(size|dim|dimension)y/.test(x));
  const sz = h.findIndex((x) => /^(size|dim|dimension)z/.test(x));
  if (material >= 0) {
    other.data.forEach((r, i) => {
      const isBoard = (category >= 0 && BOARD_ROW.test(r[category] ?? "")) || (theirRef >= 0 && /^(PCB|PWB)\d*$/i.test(r[theirRef]?.trim() ?? ""));
      const what = r[material]?.trim();
      if (!isBoard || !what || !/fr-?\s*4|layers?|\bmm\b|cem|polyimide|alumin/i.test(what)) return;
      // The outline is the two larger sizes: a board drawn standing up has its thickness as Y or Z.
      const dims = [sx, sy, sz].filter((c) => c >= 0).map((c) => Number(r[c])).filter((d) => d > 0);
      const [x, y] = dims.length === 3 ? dims.filter((_, k) => k !== dims.indexOf(Math.min(...dims))) : dims;
      const name = [theirRef >= 0 ? r[theirRef]?.trim() : "", theirText >= 0 ? r[theirText]?.trim() : ""].filter(Boolean).join(" ");
      out.boards.push({ name: name || `Board ${out.boards.length + 1}`, text: what, size: x > 0 && y > 0 ? [x, y] : null, from: pos ? cellAt(pos, other.at[i] ?? i, material) : `“${other.sheet}”` });
    });
  }
  return out;
}

// ───────────────────────────── Alternates ─────────────────────────────

const STATUS = /^(primary|main|preferred|first\s*source|1st\s*source|alternate|alternative|alt|second(ary)?(\s*source)?|2nd\s*source|approved(\s*alternate)?|backup|substitute|optional)$/i;
const IS_PRIMARY = /^(primary|main|preferred|first\s*source|1st\s*source)$/i;

export type AlternatesSheet = {
  sheet: string;
  header: string[];
  data: string[][];
  status: number;
  mpn: number;
  maker: number;
  ipn: number;
  /** Columns that are second sources themselves ("Alt MPN 1", "Second source"). */
  altCols: number[];
};

/** A sheet of part options: primary and alternate parts per BoM item, or alternates in columns of their own. */
export function readAlternatesSheet(rows: string[][], sheet: string): AlternatesSheet | null {
  const headerRow = detectHeaderRow(rows);
  const header = rows[headerRow] ?? [];
  const data = rows.slice(headerRow + 1).filter((r) => r.some((c) => c.trim()));
  if (data.length < 2) return null;
  const { mapping } = autoMap(header, data);
  if (mapping.includes("qty") || mapping.includes("refDes")) return null;
  const status = header.findIndex((_, j) => {
    const vals = data.map((r) => r[j]?.trim()).filter(Boolean);
    return vals.length >= data.length * 0.8 && vals.filter((v) => STATUS.test(v)).length >= vals.length * 0.9 && vals.some((v) => !IS_PRIMARY.test(v));
  });
  const altCols = header.map((h, j) => (headerConfidence(h, "alternates") >= 75 ? j : -1)).filter((j) => j >= 0);
  const mpn = mapping.indexOf("mpn");
  const ipn = mapping.indexOf("customerPn");
  if (!(status >= 0 && (mpn >= 0 || ipn >= 0)) && !altCols.length) return null;
  return { sheet, header, data, status, mpn, maker: mapping.indexOf("manufacturer"), ipn, altCols };
}

export type AlternatesJoin = {
  sheet: string;
  on: string | null;
  entries: number;
  /** Alternate rows (or alternate columns' entries) for the BoM's lines. */
  alternates: number;
  /** Alternate part numbers written for the matcher, and on how many lines. */
  withMpn: number;
  lines: number;
  /** Lines with no part number of their own that get one from an alternate. */
  onlyFromAlternates: number;
  /** Lines whose primary on the options sheet names another part than the BoM. */
  primaryDiffers: number;
  /** Alternates named only by an internal part number: kept on the lines in a column of their own. */
  ipnOnly?: number;
  ipnLines?: number;
  ipnColumn?: string | null;
  /** The column the alternate part numbers went into. */
  column?: string | null;
};

/**
 * Joins a part-options sheet to the BoM on the column they share (an item number, the house code, else the MPN) and
 * writes each line's alternates into the BoM's alternates column, or a column of their own, "MPN (Maker); …", which
 * the matcher tries after the part. An alternate with only an internal part number is kept too, in another column.
 */
export function joinAlternates(t: BomTable, alt: AlternatesSheet): AlternatesJoin {
  const out: AlternatesJoin = { sheet: alt.sheet, on: null, entries: alt.data.length, alternates: 0, withMpn: 0, lines: 0, onlyFromAlternates: 0, primaryDiffers: 0, ipnOnly: 0, ipnLines: 0, ipnColumn: null, column: null };
  const bomMap = autoMap(t.header, t.data).mapping;
  const pairs: { a: number; b: number; label: string }[] = [];
  alt.header.forEach((h, a) => {
    if (a === alt.status || a === alt.mpn || a === alt.maker || alt.altCols.includes(a) || !normaliseHeader(h)) return;
    const b = t.header.findIndex((x) => normaliseHeader(x) === normaliseHeader(h));
    if (b >= 0) pairs.push({ a, b, label: t.header[b] });
  });
  if (alt.ipn >= 0 && bomMap.indexOf("customerPn") >= 0) pairs.push({ a: alt.ipn, b: bomMap.indexOf("customerPn"), label: t.header[bomMap.indexOf("customerPn")] });
  if (alt.mpn >= 0 && bomMap.indexOf("mpn") >= 0) pairs.push({ a: alt.mpn, b: bomMap.indexOf("mpn"), label: t.header[bomMap.indexOf("mpn")] });
  const share = (p: { a: number; b: number }) => {
    const bom = new Set(t.data.map((r) => r[p.b]?.trim().toUpperCase()).filter(Boolean));
    const vals = alt.data.map((r) => r[p.a]?.trim().toUpperCase()).filter(Boolean);
    return vals.length ? vals.filter((v) => bom.has(v)).length / vals.length : 0;
  };
  const best = pairs.map((p) => ({ ...p, s: share(p) })).sort((x, y) => y.s - x.s)[0];
  if (!best || best.s < 0.25) return out;
  out.on = best.label;

  const byKey = new Map<string, string[][]>();
  for (const r of alt.data) {
    const k = r[best.a]?.trim().toUpperCase();
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const bomMpn = bomMap.indexOf("mpn");
  const bomIpn = bomMap.indexOf("customerPn");
  const into = bomMap.indexOf("alternates");
  const cells = t.data.map((r) => {
    const options = byKey.get(r[best.b]?.trim().toUpperCase() ?? "") ?? [];
    const own = bomMpn >= 0 ? normaliseMpn(r[bomMpn] ?? "") : "";
    const ownIpn = bomIpn >= 0 ? (r[bomIpn] ?? "").trim().toUpperCase() : "";
    const already = into >= 0 ? readAlternates(r[into]).map((a) => normaliseMpn(a.mpn)) : [];
    const entries: string[] = [];
    const ipns: string[] = [];
    for (const o of options) {
      const primary = alt.status >= 0 && IS_PRIMARY.test(o[alt.status]?.trim() ?? "");
      const mpns = [...(alt.mpn >= 0 ? [o[alt.mpn]] : []), ...alt.altCols.map((c) => o[c])].map((m) => m?.trim()).filter((m): m is string => !!m);
      if (primary) {
        if (own && mpns[0] && normaliseMpn(mpns[0]) !== own) out.primaryDiffers++;
        continue;
      }
      out.alternates += alt.status >= 0 ? 1 : mpns.length;
      const maker = alt.maker >= 0 ? o[alt.maker]?.trim() : "";
      if (!mpns.length) {
        // No maker's part number: the internal one is kept, for the person who knows the house codes.
        const ipn = alt.ipn >= 0 ? o[alt.ipn]?.trim() : "";
        if (ipn && ipn.toUpperCase() !== ownIpn && !ipns.includes(ipn)) {
          ipns.push(ipn);
          out.ipnOnly = (out.ipnOnly ?? 0) + 1;
        }
        continue;
      }
      for (const m of mpns) {
        if (normaliseMpn(m) === own || already.includes(normaliseMpn(m)) || entries.some((e) => e.startsWith(`${m} `) || e === m)) continue;
        out.withMpn++;
        entries.push(maker ? `${m} (${maker})` : m);
      }
    }
    if (entries.length) {
      out.lines++;
      if (!own) out.onlyFromAlternates++;
    }
    if (ipns.length) out.ipnLines = (out.ipnLines ?? 0) + 1;
    return { entries: entries.join("; "), ipns: ipns.join("; ") };
  });
  if (into >= 0) {
    out.column = t.header[into];
    t.data.forEach((r, i) => {
      if (cells[i].entries) r[into] = [r[into]?.trim(), cells[i].entries].filter(Boolean).join("; ");
    });
  } else if (out.withMpn) {
    out.column = toolColumn("Alternates", alt.sheet);
    t.header = [...t.header, out.column];
    t.data = t.data.map((r, i) => [...r, cells[i].entries]);
  }
  if (out.ipnOnly) {
    out.ipnColumn = `Alternate internal P/Ns (${alt.sheet})`;
    t.header = [...t.header, out.ipnColumn];
    t.data = t.data.map((r, i) => [...r, cells[i].ipns]);
  }
  return out;
}
