/**
 * Reads a customer's job pack (Phase 29, every page since Phase 37): a workbook that carries more than the BoM. An EMS
 * customer often sends one file with the BoM (sometimes over several sheets), the CAD tool's placement report, the
 * lists the pick-and-place machine is loaded from (one per side), the designators that are not fitted, a sheet of
 * approved alternates, and a sheet or title block that names the board, its revision and the build. Every sheet is
 * read and said for; the BoM is the sheet (or sheets) that read most like one, wherever they sit. Pure.
 */
import { readSheets, type ReadSheet } from "./parse";
import type { SheetKind } from "./sheet-kinds";
import { autoMap, detectHeaderRow, isHeaderLike, normaliseHeader } from "./columns";
import type { BomField, ColumnMapping } from "./fields";
import { findBareBoard, scrubRows, type ScrubbedLine } from "./scrub";
import { boardSpecLabel, parseBoardSpec, type BoardSpecText } from "./bare-board";
import { isHeaderless, joinAlternates, joinSameParts, mergeTables, notPartOfBuild, readAlternatesSheet, readBomTable, tableRows, type AlternatesJoin, type AlternatesSheet, type BomTable, type MergeVerdict, type SamePartsJoin } from "./bom-table";
import {
  addPair,
  addPairs,
  cellAt,
  detailFindings,
  emptyDetails,
  isNotes,
  pickDetail,
  readBoardLine,
  readFileName,
  readLines,
  readPairs,
  formDefaults,
  sameRevision,
  sizeOf,
  type CountWhat,
  type PackDetails,
  type SheetPos,
} from "./details";
import { mapCentroidHeader, parseCentroid, type PlacementRow } from "@/lib/board/centroid";
import { expandRefDes } from "@/lib/refdes";
import { normaliseMpn } from "@/lib/normalise";

export type Side = "TOP" | "BOTTOM";
export { SHEET_KIND_LABEL, type SheetKind } from "./sheet-kinds";

export type PackSheet = {
  name: string;
  kind: SheetKind;
  /** Table rows read from it (placements, designators, BoM lines, details). */
  count: number;
  side: Side | null;
  /** False for a sheet the tool read but did not need (a copy, a sheet listing the same parts again, a reference table). */
  used: boolean;
  /** One line for the screen. */
  says: string;
  /** Hidden in the workbook (read all the same). */
  hidden?: boolean;
  /** Rows Excel hides on this sheet, by a filter or by hand (read all the same). */
  hiddenRows?: number;
  /** The person can take this sheet as the BoM (or as part of it). */
  canBeBom?: boolean;
  /** The sheet's table was tidied: repeated headers, titles, footers or total rows left out, or rows grouped. */
  tidied?: boolean;
};

/** A product's parts on several boards, from a sheet that names the board of each ("Board | Ref | Side | X on board"). */
export type BoardGroup = { name: string; refs: string[]; top: number; bottom: number; unplaced: number };

export type LoadRow = { refDes: string; x: number; y: number; rotation: number; partNumber: string | null };
export type NotFitted = { refDes: string; side: Side | null; why: string };
export type PackFinding = { level: "amber" | "red"; text: string };

export type JobPack = {
  bomSheet: string | null;
  /** Every sheet the BoM was taken from: one, or several merged. */
  bomSheets: string[];
  /** The BoM table, tidy: its title block, its header (at headerRow) and its lines, cleaned and merged. */
  rows: string[][];
  headerRow: number;
  sheets: PackSheet[];
  placements: PlacementRow[];
  /** Where the placements came from: a sheet name, or "the load lists". */
  placementSource: string | null;
  loads: { sheet: string; side: Side | null; rows: LoadRow[] }[];
  notFitted: NotFitted[];
  findings: PackFinding[];
  /** What the file says about itself: names, revision, build, board, notes, totals. */
  details: PackDetails;
  /** A part-options sheet joined to the BoM lines. */
  alternates: AlternatesJoin | null;
  /** False when no sheet read like a BoM and one was taken anyway. */
  bomFound: boolean;
  /** True for a CSV or text file: one page only. */
  singlePage: boolean;
  /** Columns of the customer's own header row in `rows`; the tool's columns come after them. */
  ownColumns: number;
  /** The rows kept are not the BoM sheet's rows as they are (tidied, grouped, merged or joined). */
  tidied: boolean;
  /** Parts placed on several boards, per board (positions are per board, so they are not put on one board). */
  boards: { sheet: string; groups: BoardGroup[] } | null;
  /** Sheets listing the BoM's parts again, and what they added to it. */
  joins: SamePartsJoin[];
};

/**
 * "TOP LOAD", "Bottom_DNP", "Solder side": which side a sheet is about. "Primary", "front" and their opposites name a
 * side only with "side" or "layer" after them ("Primary Batteries" is not the top side).
 */
export function sideOfName(name: string): Side | null {
  const n = ` ${name.toLowerCase().replace(/[_\-.()]+/g, " ").replace(/\s+/g, " ")} `;
  const top = / (top|component side|comp side|(primary|front) (side|layer)) /.test(n);
  const bottom = / (bot|bottom|btm|solder side|(secondary|back) (side|layer)) /.test(n);
  return top === bottom ? null : top ? "TOP" : "BOTTOM";
}

const NOT_FITTED_NAME = /\b(dnp|dnf|dni|dnl|dnm|dnc|not\s*fitted|not\s*loaded|no\s*load|not\s*placed|not\s*mounted|not\s*populated|unpopulated|no\s*pop|do\s*not\s*(place|populate|fit|load|install|mount))\b/i;
const DESIGNATOR = /^[A-Za-z]{1,5}\d{1,5}[A-Za-z]?$/;
/** A value in the design file that means "leave the pads empty". */
export const NOT_FITTED_VALUE = /^(dnp|dnf|dni|dnl|dnm|nc|n\/c|nf|n\.?f\.?|no\s*load|not\s*fitted|do\s*not\s*(place|populate|fit|load|install|mount)|no\s*pop|omit)$/i;
/** A side written next to a designator: Cadence's mirror flag (NO = top), or the side itself. */
const SIDE_TOKEN: Record<string, Side> = { NO: "TOP", N: "TOP", TOP: "TOP", T: "TOP", "TOP SIDE": "TOP", YES: "BOTTOM", Y: "BOTTOM", BOTTOM: "BOTTOM", BOT: "BOTTOM", B: "BOTTOM", "BOTTOM SIDE": "BOTTOM", MIRROR: "BOTTOM" };

/** How much a field says that a sheet is a BoM. */
const FIELD_WEIGHT: Record<BomField, number> = { mpn: 4, refDes: 3, qty: 3, description: 2, value: 2, manufacturer: 2, package: 1, customerPn: 1, alternates: 1, dnp: 0 };
const fieldScore = (mapping: ColumnMapping) => [...new Set(mapping.filter((f): f is BomField => !!f))].reduce((s, f) => s + FIELD_WEIGHT[f], 0);
const BOM_NAME = /\b(bom|bill|parts?\s*list|components?|pcba|assembly)\b/i;

const sameNumber = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const sameAngle = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d <= 0.5 || d >= 359.5;
};
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const list = (refs: string[], max = 12) => {
  const sorted = [...new Set(refs)].sort(natural);
  return sorted.length > max ? `${sorted.slice(0, max).join(", ")} and ${sorted.length - max} more` : sorted.join(", ");
};
const n = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-IN")} ${k === 1 ? one : many}`;

type Placed = { kind: "placement" | "load-list"; placements: PlacementRow[]; loads: LoadRow[]; hasSide: boolean; headerAt: number; sides: { refDes: string; side: Side }[]; unread: number; boards: BoardGroup[] | null };
type Read =
  | Placed
  | { kind: "not-fitted"; refs: string[] }
  | { kind: "bom"; score: number; table: BomTable }
  | { kind: "alternates"; alt: AlternatesSheet; headerRow: number }
  | { kind: "details"; pairs: NonNullable<ReturnType<typeof readPairs>> | null }
  | { kind: "revision-history"; headerRow: number; revs: { rev: string; i: number; j: number }[] }
  | { kind: "reference"; what: string; headerRow: number; score: number; table: boolean; headerless: boolean }
  | { kind: "other" };

type SheetRead = { name: string; sheet: ReadSheet; rows: string[][]; pos: SheetPos; index: number; r: Read };
const isPlaced = (s: SheetRead): s is SheetRead & { r: Placed } => s.r.kind === "placement" || s.r.kind === "load-list";

/** A table with prices per quantity break: the same part on many rows, a price beside the quantity. */
function isPriceList(header: string[], data: string[][], mapping: ColumnMapping): boolean {
  if (mapping.includes("refDes") || !mapping.includes("mpn") || !header.some((h) => /price|cost|currency|unit\s*rate/i.test(h))) return false;
  const mpns = data.map((r) => r[mapping.indexOf("mpn")]?.trim()).filter(Boolean);
  return mpns.length >= 4 && new Set(mpns).size < mpns.length * 0.7;
}

const REV_COL = /^(rev|revision|version|ver|issue|revno|revisionno)$/;
const DATE_COL = /^(date|changedate|releasedate|revdate|revisiondate|dated)$/;
const CHANGE_COL = /^(description|change|changes|changedescription|eco|ecn|ecr|reason|remarks|comment|comments|details|summary)$/;

function readSheet(name: string, rows: string[][], pos: SheetPos): Read {
  // A table with a designator and X and Y is placement data, whatever else it carries.
  const headerAt = rows.slice(0, 40).findIndex((r) => {
    const m = mapCentroidHeader(r);
    return m.ref !== undefined && m.x !== undefined && m.y !== undefined;
  });
  if (headerAt >= 0) {
    try {
      const cols = mapCentroidHeader(rows[headerAt]);
      const { placements } = parseCentroid(rows);
      if (placements.length) {
        const byRef = new Map(placements.map((p) => [p.refDes, p]));
        const loads: LoadRow[] = [];
        const sides: { refDes: string; side: Side }[] = [];
        let unread = 0;
        for (const r of rows.slice(headerAt + 1)) {
          const ref = (r[cols.ref!] ?? "").trim().toUpperCase();
          if (!ref) continue;
          const x = (r[cols.x!] ?? "").trim();
          if (!/^-?\d/.test(x)) {
            // Below the table, a list of designators with only a side: which side each part goes on.
            const token = [x, cols.side !== undefined ? r[cols.side] ?? "" : "", r[cols.y!] ?? ""].map((t) => t.trim().toUpperCase()).find((t) => SIDE_TOKEN[t]);
            if (DESIGNATOR.test(ref) && token) sides.push({ refDes: ref, side: SIDE_TOKEN[token] });
            else unread++;
            continue;
          }
          const p = byRef.get(ref);
          if (p && !loads.some((l) => l.refDes === p.refDes)) loads.push({ refDes: p.refDes, x: p.x, y: p.y, rotation: p.rotation, partNumber: cols.partNumber !== undefined ? r[cols.partNumber]?.trim() || null : null });
        }
        // The CAD tool's report says which side each part is on; a list the machine is loaded from names the part instead.
        const hasSide = cols.side !== undefined;
        // A product's parts on several boards: each board's designators, and the rows with no designator (a part count).
        let boards: BoardGroup[] | null = null;
        if (cols.board !== undefined) {
          const groups = new Map<string, BoardGroup>();
          for (const r of rows.slice(headerAt + 1)) {
            const name = (r[cols.board] ?? "").trim();
            if (!name) continue;
            const g = groups.get(name) ?? { name, refs: [], top: 0, bottom: 0, unplaced: 0 };
            groups.set(name, g);
            const ref = (r[cols.ref!] ?? "").trim().toUpperCase();
            if (!ref || !/^-?\d/.test((r[cols.x!] ?? "").trim())) {
              g.unplaced++;
              continue;
            }
            g.refs.push(ref);
            if (/^(b|bot|bottom|back|yes|mirror)/i.test((cols.side !== undefined ? r[cols.side] ?? "" : "").trim())) g.bottom++;
            else g.top++;
          }
          if (groups.size >= 2) boards = [...groups.values()];
        }
        return { kind: !hasSide && cols.partNumber !== undefined ? "load-list" : "placement", placements, loads, hasSide, headerAt, sides, unread, boards };
      }
    } catch {
      // not a placement table after all
    }
  }

  if (NOT_FITTED_NAME.test(name.replace(/[_\-.]+/g, " "))) {
    const cells = rows.map((r) => r.find((c) => c.trim()) ?? "").filter(Boolean);
    const refs = cells.filter((c) => !isHeaderLike(c)).flatMap((c) => expandRefDes(c)).filter((r) => DESIGNATOR.test(r));
    if (refs.length && refs.length >= cells.length * 0.6) return { kind: "not-fitted", refs: [...new Set(refs)] };
  }

  const header = detectHeaderRow(rows);
  const head = rows[header] ?? [];
  const data = rows.slice(header + 1);
  const recognised = head.filter(isHeaderLike).length;
  const { mapping } = autoMap(head, data);
  const names = mapping.includes("mpn") || mapping.includes("description") || mapping.includes("value");
  const counts = mapping.includes("qty") || mapping.includes("refDes");
  const priceList = isPriceList(head, data, mapping);
  if (recognised >= 2 && names && counts && data.length >= 1 && !priceList) {
    return { kind: "bom", score: fieldScore(mapping) + (BOM_NAME.test(name.replace(/[_\-.]+/g, " ")) ? 3 : 0), table: readBomTable(rows, name, pos) };
  }

  const alt = readAlternatesSheet(rows, name);
  if (alt) return { kind: "alternates", alt, headerRow: header };

  const pairs = readPairs(rows);
  if (pairs) return { kind: "details", pairs };
  if (isNotes(rows)) return { kind: "details", pairs: null };

  const sig = head.map(normaliseHeader);
  const revCol = sig.findIndex((h) => REV_COL.test(h));
  if (revCol >= 0 && sig.some((h) => DATE_COL.test(h)) && sig.some((h) => CHANGE_COL.test(h)) && data.length <= 80) {
    const revs = data.map((r, k) => ({ rev: r[revCol]?.trim() ?? "", i: header + 1 + k, j: revCol })).filter((x) => x.rev);
    if (revs.length) return { kind: "revision-history", headerRow: header, revs };
  }

  // A table that is not a BoM: a price list, a part list, a catalogue. Read, said for, and not taken.
  const filled = (r: string[]) => r.filter((c) => c.trim()).length;
  const table = filled(head) >= 2 && data.length >= 2 && data.filter((r) => filled(r) >= 2).length >= data.length * 0.6;
  const column = rows.length >= 3 && rows.every((r) => filled(r) <= 1);
  if (table || column) {
    const what = priceList
      ? "a price list (quantity breaks)"
      : column
        ? rows.filter((r) => /\d/.test(r.find((c) => c.trim()) ?? "") && /[A-Za-z]/.test(r.find((c) => c.trim()) ?? "")).length >= rows.length * 0.6
          ? "a list of part numbers, with no quantities"
          : "a list, with no quantities"
        : mapping.includes("mpn") || mapping.includes("description")
          ? "a part list, with no quantities or designators"
          : `a table (${head.filter((c) => c.trim()).slice(0, 4).join(" · ")}${filled(head) > 4 ? " …" : ""})`;
    return { kind: "reference", what, headerRow: column ? 0 : header, score: priceList ? 0 : fieldScore(mapping), table: !column, headerless: !column && isHeaderless(rows) };
  }
  return { kind: "other" };
}

/** The board's own details from a details sheet, in the board spec's terms. */
export function boardSpecFromDetails(details: PackDetails | null | undefined): BoardSpecText & { pcbRevision?: string } {
  const out: BoardSpecText & { pcbRevision?: string } = {};
  const v = (k: Parameters<typeof pickDetail>[1]) => pickDetail(details, k)?.value ?? null;
  const size = v("boardSize");
  if (size && sizeOf(size).length === 2) out.sizeMm = sizeOf(size) as [number, number];
  const layers = Number(v("layers")?.match(/\d+/)?.[0]);
  if (layers >= 1 && layers <= 40) out.layers = layers;
  const thick = Number(v("thickness")?.match(/\d+(?:\.\d+)?/)?.[0]);
  if (thick > 0 && thick < 10) out.thicknessMm = thick;
  const finish = v("finish");
  if (finish) out.finish = parseBoardSpec(finish).finish ?? finish;
  const mask = v("mask");
  if (mask) out.mask = parseBoardSpec(`${mask} mask`).mask ?? mask.toLowerCase();
  const silk = v("silk");
  if (silk) out.silk = parseBoardSpec(`${silk} legend`).silk ?? silk.toLowerCase();
  const material = v("material");
  if (material) out.material = parseBoardSpec(material).material ?? material;
  const copper = v("copper");
  if (copper) out.copperOz = parseBoardSpec(/oz|micron|um/i.test(copper) ? copper : `${copper} oz`).copperOz;
  const pcbRev = v("pcbRevision");
  if (pcbRev) out.pcbRevision = pcbRev;
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined)) as BoardSpecText & { pcbRevision?: string };
}

/**
 * Reads the whole file. A CSV, or a workbook with one table, comes back as before: its rows. With more sheets, each is
 * named and said for, the BoM sheets are merged when they hold other parts, the sheets are checked against each other,
 * and what the file says about itself is collected. `bomSheets` names the BoM sheet(s) when the person chose them.
 */
export function readJobPack(data: ArrayBuffer | Uint8Array, fileName: string, opts: { bomSheets?: string[] } = {}): JobPack {
  const sheets = readSheets(data, fileName);
  const singlePage = !/\.(xlsx|xlsm|xls)$/i.test(fileName);
  const read: SheetRead[] = sheets.map((s, index) => {
    const name = s.name ?? fileName.split(/[\\/]/).pop() ?? fileName;
    const pos = { name: s.name, rowNo: s.rowNo, col0: s.col0 };
    return { name, sheet: s, rows: s.rows, pos, index, r: readSheet(name, s.rows, pos) };
  });
  const pack: JobPack = {
    bomSheet: null,
    bomSheets: [],
    rows: [],
    headerRow: 0,
    sheets: [],
    placements: [],
    placementSource: null,
    loads: [],
    notFitted: [],
    findings: [],
    details: emptyDetails(),
    alternates: null,
    bomFound: true,
    singlePage,
    ownColumns: 0,
    tidied: false,
    boards: null,
    joins: [],
  };
  const details = pack.details;
  const tables = new Map<SheetRead, BomTable>();
  const tableOf = (s: SheetRead): BomTable => {
    if (s.r.kind === "bom") return s.r.table;
    if (!tables.has(s)) tables.set(s, readBomTable(s.rows, s.name, s.pos));
    return tables.get(s)!;
  };
  const scoreOf = (s: SheetRead) => (s.r.kind === "bom" ? s.r.score : s.r.kind === "reference" ? s.r.score : 0);

  // ── The BoM: the sheets that read like one (or the ones chosen), best first; hidden sheets only when nothing else.
  const chosen = opts.bomSheets?.length ? read.filter((s) => opts.bomSheets!.includes(s.name)) : [];
  let candidates = chosen.length ? chosen : read.filter((s) => s.r.kind === "bom");
  const hiddenSkipped = new Map<SheetRead, string>();
  if (!chosen.length && candidates.some((s) => !s.sheet.hidden)) {
    for (const s of candidates.filter((c) => c.sheet.hidden)) hiddenSkipped.set(s, "");
    candidates = candidates.filter((s) => !s.sheet.hidden);
  }
  // Best first: a sheet whose name says spares, changes or an older copy last; then the most BoM fields, the fuller
  // sheet, and workbook order (merged sheets keep the customer's order).
  candidates.sort((a, b) => (chosen.length ? 0 : Number(notPartOfBuild(a.name)) - Number(notPartOfBuild(b.name))) || scoreOf(b) - scoreOf(a) || tableOf(b).data.length - tableOf(a).data.length || a.index - b.index);
  if (!candidates.length) {
    // No sheet reads like a BoM: the table with the most BoM fields, never a details, options or placement sheet.
    pack.bomFound = false;
    const usable = read.filter((s) => s.r.kind === "reference" && s.r.table && s.r.score >= 2).sort((a, b) => scoreOf(b) - scoreOf(a));
    const fallback = usable[0] ?? read.find((s) => (s.r.kind === "reference" || s.r.kind === "other") && s.rows.length >= 2) ?? read.find((s) => s.rows.length >= 2) ?? read[0];
    if (fallback) {
      candidates = [fallback];
      const others = read.filter((s) => s !== fallback && s.r.kind === "reference" && s.r.table).length;
      if (read.length > 1 || fallback.r.kind !== "other") pack.findings.push({ level: "amber", text: `No sheet reads like a BoM (a part number or description next to a quantity or designators); “${fallback.name}” was taken. Check the columns${others ? ", or tick “Use as BoM” on another sheet" : ""}.` });
    }
  }
  let verdicts: MergeVerdict[] = [];
  let table: BomTable | null = null;
  if (candidates.length) {
    const merged = mergeTables(candidates.map(tableOf), { chosen: chosen.length > 0 });
    table = merged.table;
    verdicts = merged.verdicts;
    pack.findings.push(...merged.findings, ...table.findings);
    pack.bomSheets = verdicts.filter((v) => v.how === "base" || v.how === "merged").map((v) => v.sheet);
    pack.bomSheet = candidates[0].sheet.name;
    pack.ownColumns = candidates[0] ? tableOf(candidates[0]).own : 0;
  }
  const bomReads = new Set(candidates);
  const base = candidates[0] ?? null;

  // ── Sheets that list the BoM's parts again: what they carry that the BoM lacks (second sources, the board each part
  // is on, the circuit boards' material and size) is joined to the lines.
  const joined = new Map<SheetRead, SamePartsJoin>();
  if (table) {
    for (const v of verdicts) {
      if (v.how !== "same-parts") continue;
      const s = read.find((x) => x.name === v.sheet)!;
      const j = joinSameParts(table, tableOf(s), s.pos);
      joined.set(s, j);
      pack.joins.push(j);
    }
  }

  // ── Alternates: each part-options sheet joined to the BoM lines.
  const altJoins = new Map<SheetRead, AlternatesJoin>();
  for (const s of read) {
    if (s.r.kind !== "alternates" || !table || bomReads.has(s)) continue;
    const j = joinAlternates(table, s.r.alt);
    altJoins.set(s, j);
    pack.alternates ??= j;
    if (j.on && j.primaryDiffers) pack.findings.push({ level: "amber", text: `“${s.name}” names another primary part than the BoM for ${n(j.primaryDiffers, "line")}.` });
  }

  // ── Placements: the CAD report with the most parts; with none, the per-side load lists put together. A sheet of parts
  // on several boards is read per board: its positions are each board's own, so they are not put on one board.
  const placed = read.filter(isPlaced).filter((s) => !bomReads.has(s));
  const multi = placed.filter((s) => s.r.boards);
  const reports = placed.filter((s) => s.r.kind === "placement" && !s.r.boards).sort((a, b) => Number(b.r.hasSide) - Number(a.r.hasSide) || b.r.placements.length - a.r.placements.length);
  const boardSheet = multi[0] ?? null;
  if (boardSheet) {
    pack.boards = { sheet: boardSheet.name, groups: boardSheet.r.boards! };
    // The board each part is on, as the section of its line; and what the sheet adds (alternates).
    if (table) {
      const j = joinSameParts(table, tableOf(boardSheet), boardSheet.pos);
      if (j.sectioned || j.alternates) {
        joined.set(boardSheet, j);
        pack.joins.push(j);
      }
    }
  }
  if (table) {
    const kept = tableRows(table);
    pack.rows = kept.rows;
    pack.headerRow = kept.headerRow;
    pack.tidied = !base || JSON.stringify(pack.rows) !== JSON.stringify(base.rows);
  }
  const lists = placed.filter((s) => s.r.kind === "load-list" && !s.r.boards);
  const report = reports[0] ?? null;
  // A load list can be a copy of another, or the per-side lists in one: said for, not checked twice.
  const loadKey = (rows: LoadRow[]) => rows.map((r) => `${r.refDes}@${r.x},${r.y},${r.rotation}`).sort().join("|");
  const sidedLists = lists.filter((l) => sideOfName(l.name));
  const unionKey = sidedLists.length >= 2 ? loadKey(sidedLists.flatMap((l) => l.r.loads)) : null;
  const listRole = new Map<SheetRead, string>();
  lists.forEach((l, i) => {
    const key = loadKey(l.r.loads);
    const earlier = lists.slice(0, i).find((e) => loadKey(e.r.loads) === key);
    if (earlier) listRole.set(l, `the same parts as “${earlier.name}”`);
    else if (!sideOfName(l.name) && unionKey && key === unionKey) listRole.set(l, `${sidedLists.map((x) => x.name).join(" + ")} in one list`);
    else if (!sideOfName(l.name) && unionKey) {
      const union = new Set(sidedLists.flatMap((x) => x.r.loads.map((r) => r.refDes)));
      const own = new Set(l.r.loads.map((r) => r.refDes));
      const differ = [...own].filter((r) => !union.has(r)).concat([...union].filter((r) => !own.has(r)));
      pack.findings.push({ level: "red", text: `“${l.name}” is not the same as ${sidedLists.map((x) => `“${x.name}”`).join(" and ")} together${differ.length ? `: ${list(differ)}` : " (positions or angles differ)"}.` });
    }
  });
  for (const l of lists) if (!listRole.has(l)) pack.loads.push({ sheet: l.name, side: sideOfName(l.name), rows: l.r.loads });
  const sided = pack.loads.filter((l) => l.side);
  if (report) {
    pack.placements = report.r.placements;
    pack.placementSource = report.name;
  } else if (pack.loads.length) {
    // No CAD report: the load lists say where the parts go. Per-side lists give the side; a merged list alone cannot.
    const use = sided.length ? sided : pack.loads;
    const seen = new Set<string>();
    for (const l of use) {
      const src = lists.find((s) => s.name === l.sheet)!;
      for (const p of src.r.placements) {
        if (seen.has(p.refDes)) continue;
        seen.add(p.refDes);
        pack.placements.push({ ...p, side: l.side ?? p.side });
      }
    }
    pack.placementSource = "the load lists";
    if (!sided.length) pack.findings.push({ level: "amber", text: "The load list does not say which side each part is on; all parts were taken as top side." });
  }

  // Top/bottom lists under a load list: each designator's side, against the placement data.
  const sideSays = new Map<SheetRead, string>();
  const at = new Map(pack.placements.map((p) => [p.refDes, p]));
  for (const s of placed) {
    if (!s.r.sides.length) continue;
    const wrong = s.r.sides.filter((x) => at.get(x.refDes) && at.get(x.refDes)!.side !== x.side).map((x) => x.refDes);
    const unknown = s.r.sides.filter((x) => pack.placements.length && !at.has(x.refDes)).map((x) => x.refDes);
    if (wrong.length) pack.findings.push({ level: "red", text: `The top/bottom list on “${s.name}” puts ${list(wrong)} on the other side than ${pack.placementSource === "the load lists" ? "the load lists" : `“${pack.placementSource}”`}.` });
    if (unknown.length) pack.findings.push({ level: "amber", text: `The top/bottom list on “${s.name}” names ${list(unknown)}, which are not on the board.` });
    sideSays.set(s, `its top/bottom list of ${n(s.r.sides.length, "designator")}${pack.placements.length ? (wrong.length || unknown.length ? " differs from the placements" : ` agrees with “${pack.placementSource}”`) : ""}`);
  }

  // ── Not fitted: the lists that say so, and design values that mean it.
  const placedSide = new Map(pack.placements.map((p) => [p.refDes, p.side]));
  for (const s of read) {
    if (s.r.kind !== "not-fitted") continue;
    const side = sideOfName(s.name);
    for (const ref of s.r.refs) if (!pack.notFitted.some((x) => x.refDes === ref)) pack.notFitted.push({ refDes: ref, side: side ?? placedSide.get(ref) ?? null, why: `sheet “${s.name}”` });
  }
  for (const p of pack.placements) {
    if (p.value && NOT_FITTED_VALUE.test(p.value.trim()) && !pack.notFitted.some((x) => x.refDes === p.refDes)) pack.notFitted.push({ refDes: p.refDes, side: p.side, why: `value “${p.value.trim()}” in the design file` });
  }

  // ── What the file says about itself, strongest first: details sheets, the BoM's title block, the other sheets' headers.
  for (const s of read) {
    if (s.r.kind !== "details") continue;
    if (s.r.pairs) addPairs(details, s.r.pairs, s.pos);
    else readLines(details, s.rows, s.rows.length, s.pos, { names: false });
  }
  if (base && table) readLines(details, base.rows, table.title.length, base.pos, { names: true });
  for (const s of read) {
    if (s === base) continue;
    const upTo = isPlaced(s) ? s.r.headerAt : bomReads.has(s) ? detectHeaderRow(s.rows) : s.r.kind === "alternates" ? s.r.headerRow : s.r.kind === "reference" || s.r.kind === "revision-history" ? s.r.headerRow : 0;
    if (upTo > 0) readLines(details, s.rows, upTo, s.pos, { names: false, scopeSheet: s.name });
    if (s.r.kind === "revision-history") {
      const last = s.r.revs[s.r.revs.length - 1];
      addPair(details, "Revision", last.rev, cellAt(s.pos, last.i, last.j), "sheet", s.name);
    }
  }
  // The circuit boards a sheet of the same parts describes: each board's material and size; with one board, its spec.
  const pcbs = pack.joins.flatMap((j) => j.boards);
  for (const b of pcbs) addPair(details, `Board · ${b.name}`, `${b.text}${b.size ? ` · ${b.size[0]} × ${b.size[1]} mm` : ""}`, b.from, "sheet", null);
  if (pcbs.length === 1) {
    const [b] = pcbs;
    const spec = parseBoardSpec(b.text);
    if (b.size) addPair(details, "Board size", `${b.size[0]} × ${b.size[1]}`, b.from, "sheet", null);
    if (spec.layers) addPair(details, "Layers", String(spec.layers), b.from, "sheet", null);
    if (spec.thicknessMm) addPair(details, "Thickness", `${spec.thicknessMm} mm`, b.from, "sheet", null);
    if (spec.material) addPair(details, "Material", spec.material, b.from, "sheet", null);
    if (spec.finish) addPair(details, "Finish", spec.finish, b.from, "sheet", null);
    if (spec.mask) addPair(details, "Solder mask", spec.mask, b.from, "sheet", null);
  }
  if (table) {
    for (const t of table.totals) details.totals.push({ label: t.label, said: t.qty, what: "pieces", from: t.from, sheet: table.sheet });
    const mapping = autoMap(pack.rows[pack.headerRow] ?? [], pack.rows.slice(pack.headerRow + 1)).mapping;
    const bare = findBareBoard(pack.rows, pack.headerRow, mapping);
    if (bare) readBoardLine(details, bare.text, `${base?.name ? `“${base.name}”` : "the BoM"}, the bare board's line`);
  }
  readFileName(details, fileName);
  pack.findings.push(...detailFindings(details));

  // ── What each sheet was, for the screen.
  const bomVerdict = new Map(verdicts.map((v) => [v.sheet, v]));
  const joinSays = (j: SamePartsJoin | undefined) =>
    j
      ? [
          j.alternates ? `${n(j.alternates, "candidate part number")} on ${n(j.altLines, "line")}, added to “${j.altColumn}”` : null,
          j.sectioned ? `“${j.sectionFrom}” is the section of ${n(j.sectioned, "line")}` : null,
          j.boards.length ? `${n(j.boards.length, "circuit board")}: material and size read` : null,
        ].filter(Boolean)
      : [];
  read.forEach((s) => {
    const name = s.name;
    const side = sideOfName(name);
    const sideWord = side ? (side === "TOP" ? "top side" : "bottom side") : null;
    const t0 = s.r.kind === "bom" ? s.r.table : bomReads.has(s) ? tableOf(s) : null;
    const tidied = !!t0 && (t0.dropped.headers > 0 || t0.dropped.titles > 0 || t0.totals.length > 0 || !!t0.grouped || t0.headerless);
    const extra = {
      ...(s.sheet.hidden ? { hidden: true } : {}),
      ...(s.sheet.hiddenRows ? { hiddenRows: s.sheet.hiddenRows } : {}),
      ...(s.r.kind === "bom" || bomReads.has(s) || (s.r.kind === "reference" && s.r.table && (s.r.score >= 2 || !pack.bomFound)) ? { canBeBom: true } : {}),
      ...(tidied ? { tidied: true } : {}),
    };
    const push = (sheet: Omit<PackSheet, "name">) => pack.sheets.push({ name, ...sheet, ...extra });
    const v = bomReads.has(s) ? bomVerdict.get(s.name) : undefined;
    if (v && table) {
      const t = tableOf(s);
      if (v.how === "base") {
        const rows = t.grouped ? `${n(t.grouped.rows, "row")}, one per designator → ${n(t.data.length, "line")} by “${t.grouped.key}”` : n(t.data.length, "row");
        const parts = [
          `${rows} — ${pack.bomFound ? "the BoM" : "taken as the BoM: no sheet read like one"}${pack.bomSheets.length > 1 ? `, with ${pack.bomSheets.slice(1).map((x) => `“${x}”`).join(", ")}` : ""}`,
          t.headerless ? "no header row: the columns are named A, B, …" : null,
          t.sections.length ? `${n(t.sections.length, "section")}: ${t.sections.slice(0, 4).map((x) => `“${x}”`).join(", ")}${t.sections.length > 4 ? " …" : ""}` : null,
          t.dropped.headers ? `${n(t.dropped.headers, "repeated header")} left out` : null,
          t.totals.length ? `${n(t.totals.length, "total row")} checked, not a line` : null,
        ];
        push({ kind: "bom", count: t.data.length, side, used: true, says: parts.filter(Boolean).join(" · ") });
      } else if (v.how === "merged") push({ kind: "bom", count: v.lines, side, used: true, says: `${t.grouped ? `${n(t.grouped.rows, "row")} → ${n(v.lines, "line")}` : n(v.lines, "row")} — merged into the BoM, each tagged “${t.sheet}”` });
      else if (v.how === "copy") push({ kind: "bom", count: v.lines, side, used: false, says: `${n(v.lines, "row")} — a copy of “${v.of}”, not used` });
      else if (v.how === "same-parts") {
        const adds = joinSays(joined.get(s));
        push({ kind: "bom", count: v.lines, side, used: adds.length > 0, says: `${n(v.lines, "row")} — the same parts as “${v.of}” (by ${v.by}), not a second BoM${adds.length ? `; taken from it: ${adds.join(" · ")}` : ", not used"}` });
      } else if (v.how === "unsure")
        push({ kind: "bom", count: v.lines, side, used: false, says: `${n(v.lines, "row")} — also reads like a BoM, ${v.why === "name" ? "but its name says it is not part of the build" : `with nothing to compare it with “${v.of}” by`}: left out` });
      else push({ kind: "bom", count: v.lines, side, used: false, says: `${n(v.lines, "row")} — shares ${n(v.shared ?? 0, v.by === "designators" ? "designator" : v.by === "descriptions" ? "description" : "part number")} with “${v.of}”, left out: check which is right` });
    } else if (s.r.kind === "bom") {
      const why = hiddenSkipped.has(s) ? "a hidden sheet, not used" : "not used";
      push({ kind: "bom", count: s.r.table.data.length, side, used: false, says: `${n(s.r.table.data.length, "row")} — another BoM-like sheet, ${why}` });
    } else if (s.r.kind === "placement" && s.r.boards) {
      const groups = s.r.boards;
      const placedOn = groups.reduce((k, g) => k + g.refs.length, 0);
      const unplaced = groups.reduce((k, g) => k + g.unplaced, 0);
      const adds = joinSays(joined.get(s));
      push({
        kind: "placement",
        count: placedOn,
        side,
        used: s === boardSheet,
        says: [
          `${n(placedOn, "part")} with a designator on ${n(groups.length, "board")}: ${groups.map((g) => `${g.name} ${g.refs.length}`).join(", ")}`,
          unplaced ? `${n(unplaced, "row")} without a designator` : null,
          "each board's own positions, so they are not put on one 3D board",
          ...adds,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } else if (s.r.kind === "placement") {
      const sideList = sideSays.get(s);
      push({ kind: "placement", count: s.r.placements.length, side, used: s === report, says: [s === report ? `${n(s.r.placements.length, "part")} placed — where every part sits` : `${n(s.r.placements.length, "part")} — another placement table, not used`, sideList].filter(Boolean).join(" · ") });
    } else if (s.r.kind === "load-list") {
      const role = listRole.get(s);
      const sideList = sideSays.get(s);
      const first = `${n(s.r.loads.length, "part")} to load${sideWord ? `, ${sideWord}` : ""}`;
      push({ kind: "load-list", count: s.r.loads.length, side, used: !role, says: [role ? `${first}: ${role}` : `${first}${report ? ` — checked against “${report.name}”` : ""}`, sideList, s.r.unread ? `${n(s.r.unread, "row")} below the list not read` : null].filter(Boolean).join(" · ") });
    } else if (s.r.kind === "not-fitted") push({ kind: "not-fitted", count: s.r.refs.length, side, used: true, says: `${n(s.r.refs.length, "designator")} not fitted${sideWord ? `, ${sideWord}` : ""}` });
    else if (s.r.kind === "alternates") {
      const j = altJoins.get(s);
      const ipn = j?.ipnOnly ? `${n(j.ipnOnly, "alternate")} with only an internal part number (${n(j.ipnLines ?? 0, "line")}), kept in “${j.ipnColumn}”` : null;
      push({
        kind: "alternates",
        count: s.r.alt.data.length,
        side: null,
        used: !!j?.on,
        says: j?.on
          ? [
              `${n(j.alternates, "alternate")}, joined on “${j.on}”`,
              j.withMpn ? `${n(j.withMpn, "alternate part number")} on ${n(j.lines, "line")}, tried when the first part does not match` : null,
              ipn,
              j.onlyFromAlternates ? `${n(j.onlyFromAlternates, "line")} get their only part number here` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : `${n(s.r.alt.data.length, "row")} of part options — no column to join them to the BoM`,
      });
    } else if (s.r.kind === "details") {
      const from = (d: { from: string }) => d.from.startsWith(`“${name}”`);
      const items = details.items.filter(from).length;
      const totals = details.totals.filter(from).length;
      const notes = details.notes.filter(from).length;
      const said = [items ? n(items, "detail") : null, totals ? n(totals, "total") : null, notes ? n(notes, "note") : null].filter(Boolean).join(", ");
      push({ kind: "details", count: s.rows.length, side: null, used: !!(items || totals || notes), says: said ? `${n(s.rows.length, "row")}: ${said} — read into the BoM's details` : `${n(s.rows.length, "row")} — nothing the tool can use` });
    } else if (s.r.kind === "revision-history") {
      const last = s.r.revs[s.r.revs.length - 1];
      push({ kind: "revision-history", count: s.r.revs.length, side: null, used: true, says: `${n(s.r.revs.length, "revision")} — the latest is ${last.rev}` });
    } else if (s.r.kind === "reference") {
      const rows = s.r.headerless ? s.rows.length : s.rows.length - s.r.headerRow - (s.r.table ? 1 : 0);
      push({ kind: "reference", count: rows, side: null, used: false, says: `${n(rows, "row")}${s.r.headerless ? " (no header row)" : ""} — ${s.r.what}, not a BoM` });
    } else push({ kind: "other", count: s.rows.length, side: null, used: false, says: `${n(s.rows.length, "row")} — not a table the tool knows` });
  });

  // ── The sheets against each other.
  if (report && pack.loads.length) {
    const at = new Map(report.r.placements.map((p) => [p.refDes, p]));
    for (const l of pack.loads) {
      const unknown = l.rows.filter((r) => !at.has(r.refDes)).map((r) => r.refDes);
      if (unknown.length) pack.findings.push({ level: "red", text: `“${l.sheet}” loads ${list(unknown)}, which the placement report does not have.` });
      const moved = l.rows.filter((r) => {
        const p = at.get(r.refDes);
        return p && !(sameNumber(p.x, r.x, 0.011) && sameNumber(p.y, r.y, 0.011) && sameAngle(p.rotation, r.rotation));
      });
      if (moved.length) pack.findings.push({ level: "red", text: `“${l.sheet}” places ${list(moved.map((r) => r.refDes))} at another position or angle than the placement report.` });
      if (l.side) {
        const wrong = l.rows.filter((r) => at.get(r.refDes) && at.get(r.refDes)!.side !== l.side).map((r) => r.refDes);
        if (wrong.length) pack.findings.push({ level: "red", text: `“${l.sheet}” lists ${list(wrong)}, which the placement report has on the other side.` });
      }
    }
    const loaded = new Set(pack.loads.flatMap((l) => l.rows.map((r) => r.refDes)));
    const off = new Set(pack.notFitted.map((x) => x.refDes));
    const orphans = report.r.placements.filter((p) => !loaded.has(p.refDes) && !off.has(p.refDes)).map((p) => p.refDes);
    if (orphans.length) pack.findings.push({ level: "amber", text: `On the board but in no load list and no not-fitted list: ${list(orphans)}.` });
    const both = [...off].filter((r) => loaded.has(r));
    if (both.length) pack.findings.push({ level: "red", text: `Listed as not fitted and also in a load list: ${list(both)}.` });
  }
  return pack;
}

/** The pack against the BoM's own designators, once the columns are known. */
export function checkPackAgainstBom(pack: Pick<JobPack, "placements" | "notFitted" | "loads"> & { boards?: JobPack["boards"] }, lines: { refDes: string | null; mpn: string | null; dnp: boolean }[]): PackFinding[] {
  const out: PackFinding[] = [];
  if (pack.boards) {
    // Parts on several boards: each board's designators against the BoM's.
    const onBoards = new Set(pack.boards.groups.flatMap((g) => g.refs));
    const named = new Set(lines.flatMap((l) => expandRefDes(l.refDes)));
    const stray = [...onBoards].filter((r) => !named.has(r));
    if (stray.length) out.push({ level: "amber", text: `On a board in “${pack.boards.sheet}” but on no BoM line: ${list(stray)}.` });
    const missing = lines.filter((l) => !l.dnp).flatMap((l) => expandRefDes(l.refDes)).filter((r) => !onBoards.has(r));
    if (missing.length && onBoards.size) out.push({ level: "amber", text: `On a BoM line but on no board in “${pack.boards.sheet}”: ${list(missing)}.` });
  }
  if (!pack.placements.length) return out;
  const fitted = new Map<string, string | null>();
  for (const l of lines) if (!l.dnp) for (const r of expandRefDes(l.refDes)) fitted.set(r, l.mpn);
  const all = new Set(lines.flatMap((l) => expandRefDes(l.refDes)));
  const placed = new Set(pack.placements.map((p) => p.refDes));
  const off = new Set(pack.notFitted.map((x) => x.refDes));

  const notOnBoard = [...fitted.keys()].filter((r) => !placed.has(r));
  if (notOnBoard.length) out.push({ level: "red", text: `On a BoM line but not in the placement data: ${list(notOnBoard)}.` });
  const unexplained = [...placed].filter((r) => !all.has(r) && !off.has(r));
  if (unexplained.length) out.push({ level: "red", text: `On the board, on no BoM line and not listed as not fitted: ${list(unexplained)}.` });
  const contradicted = [...off].filter((r) => fitted.has(r));
  if (contradicted.length) out.push({ level: "red", text: `Listed as not fitted but on a fitted BoM line: ${list(contradicted)}.` });

  if (pack.loads.length) {
    const loaded = new Map(pack.loads.flatMap((l) => l.rows.map((r) => [r.refDes, r.partNumber] as const)));
    const unloaded = [...fitted.keys()].filter((r) => placed.has(r) && !loaded.has(r));
    if (unloaded.length) out.push({ level: "amber", text: `On a fitted BoM line but in no load list: ${list(unloaded)}.` });
    // The load list names the part for each designator: it should be one the BoM line names.
    const other = [...loaded].filter(([ref, pn]) => {
      const mpn = fitted.get(ref);
      if (!pn || !mpn) return false;
      const a = normaliseMpn(pn);
      return !a.includes(normaliseMpn(mpn)) && !normaliseMpn(mpn).includes(a);
    });
    if (other.length) out.push({ level: "red", text: `The load list names another part than the BoM for ${list(other.map(([r]) => r))}.` });
  }
  return out;
}

/**
 * BoM rows for designators that are on the board, on no BoM line, and explained as not fitted — so the BoM and the
 * board agree and the 3D view leaves those pads empty. One row each, in the BoM's own columns.
 */
export function notFittedRows(pack: JobPack, header: string[], mapping: ColumnMapping, bomRefs: Set<string>): string[][] {
  const col = (f: ColumnMapping[number]) => mapping.indexOf(f);
  const ref = col("refDes");
  const text = col("description") >= 0 ? col("description") : col("value");
  if (ref < 0 || (col("qty") < 0 && text < 0 && col("dnp") < 0)) return [];
  const at = new Map(pack.placements.map((p) => [p.refDes, p]));
  const rows: string[][] = [];
  for (const nf of pack.notFitted) {
    if (bomRefs.has(nf.refDes)) continue;
    const p = at.get(nf.refDes);
    const what = p?.value && !NOT_FITTED_VALUE.test(p.value.trim()) ? p.value.trim() : null;
    const row = header.map(() => "");
    row[ref] = nf.refDes;
    if (col("qty") >= 0) row[col("qty")] = "0";
    if (text >= 0) row[text] = `Not fitted${what ? ` — ${what}` : ""} (${nf.why})`;
    if (col("value") >= 0 && col("value") !== text && what) row[col("value")] = what;
    if (col("package") >= 0 && p?.footprint) row[col("package")] = p.footprint;
    if (col("dnp") >= 0) row[col("dnp")] = "DNP";
    rows.push(row);
  }
  return rows;
}

/** What is kept on the revision: enough to say what was read, without the rows. */
export type PackSummary = {
  sheets: PackSheet[];
  placementSource: string | null;
  placements: number;
  notFitted: NotFitted[];
  /** Designators added to the BoM as not-fitted lines. */
  added: string[];
  findings: PackFinding[];
  /** The bare board's line, as read. */
  board: { text: string; label: string; customerPn: string | null } | null;
  /** What the upload did to the fabrication files (a panel cut to one board, a drill file rewritten). */
  boardNotes: string[];
  /** What the file says about itself, with where each value came from, and its totals as checked (Phase 37). */
  details?: PackDetails;
  alternates?: AlternatesJoin | null;
  /** The sheets the BoM was taken from. */
  bomSheets?: string[];
  /** A CSV: one page only. */
  singlePage?: boolean;
  /** BoM lines read (before not-fitted lines were added). */
  lines?: number;
  /** False when no sheet read like a BoM and one was taken anyway. */
  bomFound?: boolean;
  /** Columns of the customer's own header; the tool's columns (a count, a section, alternates) come after them. */
  ownColumns?: number;
  /** The rows kept are not the sheet's rows as they are: tidied, grouped, merged or joined. */
  tidied?: boolean;
  /** Parts on several boards, per board. */
  boards?: JobPack["boards"];
};

const COUNT_WORDS: Record<CountWhat, string> = {
  designators: "designators on the BoM lines",
  "designators-with-mpn": "designators on lines with a part number",
  "designators-with-any-mpn": "designators on lines with a part number or an alternate",
  lines: "BoM lines",
  pieces: "parts per board on the BoM lines",
  options: "rows on the part-options sheet",
  placements: "placements",
};

/** The file's own totals against what was read: a count of designators, lines, pieces, options or placements. */
function checkTotals(pack: JobPack, lines: ScrubbedLine[]): PackDetails["totals"] {
  const refs = (ls: ScrubbedLine[]) => new Set(ls.flatMap((l) => expandRefDes(l.refDes))).size;
  const designators = refs(lines) || pack.placements.length || null;
  const read: Record<CountWhat, number | null> = {
    designators,
    "designators-with-mpn": designators === null ? null : refs(lines.filter((l) => l.mpn)),
    "designators-with-any-mpn": designators === null ? null : refs(lines.filter((l) => l.mpn || l.altMpns?.length)),
    lines: lines.length,
    pieces: Math.round(lines.reduce((s, l) => s + l.qty, 0) * 1000) / 1000,
    options: pack.alternates?.on ? pack.alternates.entries : null,
    placements: pack.placements.length || null,
  };
  return pack.details.totals.map((t) => {
    const sheet = t.what === "placements" && t.sheet ? pack.sheets.find((s) => s.name === t.sheet && (s.kind === "placement" || s.kind === "load-list")) : null;
    return { ...t, read: sheet ? sheet.count : read[t.what] };
  });
}

/**
 * The summary kept on the revision, from the pack and the BoM as mapped: not-fitted designators become not-fitted
 * lines, the bare board's line is read, and the sheets, the details and the totals are checked against the lines.
 */
export function summarisePack(pack: JobPack, args: { rows: string[][]; headerRow: number; mapping: ColumnMapping; boardNotes?: string[] }): { summary: PackSummary; rows: string[][]; spec: BoardSpecText | null; lines: ScrubbedLine[] } {
  const { headerRow, mapping } = args;
  let rows = args.rows;
  const before = scrubRows(rows, headerRow, mapping, new Map());
  const extra = notFittedRows(pack, rows[headerRow] ?? [], mapping, new Set(before.flatMap((l) => expandRefDes(l.refDes))));
  if (extra.length) rows = [...rows, ...extra];
  const lines = extra.length ? scrubRows(rows, headerRow, mapping, new Map()) : before;
  const bare = findBareBoard(rows, headerRow, mapping);
  const spec = bare ? parseBoardSpec(bare.text) : null;
  const totals = checkTotals(pack, before);
  const off = totals.filter((t) => t.read !== null && t.read !== undefined && t.read !== t.said);
  const summary: PackSummary = {
    sheets: pack.sheets,
    placementSource: pack.placementSource,
    placements: pack.placements.length,
    notFitted: pack.notFitted,
    added: extra.map((r) => r[mapping.indexOf("refDes")]),
    findings: [
      ...pack.findings,
      ...checkPackAgainstBom(pack, lines.map((l) => ({ refDes: l.refDes, mpn: l.mpn, dnp: l.dnp }))),
      ...off.map((t) => ({ level: "amber" as const, text: `${t.from} gives ${t.label.toLowerCase()} ${t.said.toLocaleString("en-IN")}; the tool read ${t.read!.toLocaleString("en-IN")} ${COUNT_WORDS[t.what]}.` })),
    ],
    board: bare && spec ? { text: bare.text, label: boardSpecLabel(spec), customerPn: bare.customerPn } : null,
    boardNotes: args.boardNotes ?? [],
    details: { ...pack.details, totals },
    alternates: pack.alternates,
    bomSheets: pack.bomSheets,
    singlePage: pack.singlePage,
    lines: before.length,
    bomFound: pack.bomFound,
    ownColumns: pack.ownColumns,
    tidied: pack.tidied,
    boards: pack.boards,
  };
  return { summary, rows, spec, lines };
}

/** Is there anything worth keeping beyond a plain one-table BoM? A name read off the file name alone is not. */
export function summaryWorthKeeping(s: PackSummary): boolean {
  return (
    s.sheets.length > 1 ||
    !!s.tidied ||
    !!s.board ||
    s.boardNotes.length > 0 ||
    s.findings.length > 0 ||
    !!s.details?.items.some((d) => d.via !== "file-name") ||
    !!s.details?.notes.length ||
    !!s.details?.totals.length ||
    !!s.alternates?.on
  );
}

/**
 * What the upload form shows right after a file is chosen, read in the browser: every sheet, what was taken, the
 * details, and the values the form can fill in. The server reads the file again on upload.
 */
export function previewPack(data: ArrayBuffer | Uint8Array, fileName: string, opts: { bomSheets?: string[] } = {}) {
  const pack = readJobPack(data, fileName, opts);
  const header = pack.rows[pack.headerRow] ?? [];
  const { mapping } = autoMap(header, pack.rows.slice(pack.headerRow + 1));
  const { summary } = summarisePack(pack, { rows: pack.rows, headerRow: pack.headerRow, mapping });
  return { summary, defaults: formDefaults(pack.details), bomSheet: pack.bomSheet, bomSheets: pack.bomSheets, bomFound: pack.bomFound, rows: pack.rows.length - pack.headerRow - 1 };
}

export function readPackSummary(raw: unknown): PackSummary | null {
  const p = raw as PackSummary | null;
  return p && typeof p === "object" && Array.isArray(p.sheets) && Array.isArray(p.findings) ? p : null;
}

/** The details the form and the revision take, and where the file disagrees with what was typed. */
export { formDefaults, pickDetail, sameRevision };
