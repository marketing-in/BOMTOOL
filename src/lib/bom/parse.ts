import * as XLSX from "xlsx";
import Papa from "papaparse";

export type ParsedSheet = { sheetName: string | null; rows: string[][] };

export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".csv", ".tsv", ".txt"] as const;
export const MAX_BOM_BYTES = 10 * 1024 * 1024;

function extensionOf(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : "";
}

function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // Excel "CSV (Windows)" exports are cp1252; fall back when UTF-8 decoding produced replacement chars.
  const text = utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
  return text.replace(/^﻿/, "");
}

/** Trims cells and drops trailing empty columns and fully empty rows. */
export function tidyRows(rows: unknown[][]): string[][] {
  const out = rows
    .map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c).replace(/\s+/g, " ").trim())))
    .filter((r) => r.some((c) => c));
  const width = out.reduce((w, r) => {
    let last = r.length - 1;
    while (last >= 0 && !r[last]) last--;
    return Math.max(w, last + 1);
  }, 0);
  return out.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
}

export type ReadSheet = {
  name: string | null;
  rows: string[][];
  hidden: boolean;
  /** The sheet's own row number (1-based) of each tidy row, and the column the rows start at, to say where a value came from. */
  rowNo: number[];
  col0: number;
  /** Rows with content that Excel hides (a filter, or rows hidden by hand); they are read all the same. */
  hiddenRows: number;
  filtered: boolean;
};

/** Every sheet of a workbook as tidy rows, in the workbook's order (a CSV is one unnamed sheet). Empty sheets are left out. */
export function readSheets(data: ArrayBuffer | Uint8Array, fileName: string): ReadSheet[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const ext = extensionOf(fileName);
  if (ext === ".xlsx" || ext === ".xls" || ext === ".xlsm") {
    // cellStyles reads which rows are hidden; it is slow on a large catalogue, so only a BoM-sized file gets it.
    const wb = XLSX.read(bytes, { type: "array", cellDates: false, dense: true, cellStyles: bytes.length <= 2_000_000, cellHTML: false });
    const hidden = new Map((wb.Workbook?.Sheets ?? []).map((s) => [s.name, !!s.Hidden]));
    return wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 } };
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: true });
      const kept: unknown[][] = [];
      const rowNo: number[] = [];
      let hiddenRows = 0;
      raw.forEach((r, i) => {
        if (!r.some((c) => c !== null && c !== undefined && String(c).trim())) return;
        kept.push(r);
        rowNo.push(range.s.r + i + 1);
        if (ws["!rows"]?.[range.s.r + i]?.hidden) hiddenRows++;
      });
      return { name, rows: tidyRows(kept), hidden: hidden.get(name) ?? false, rowNo, col0: range.s.c, hiddenRows, filtered: !!ws["!autofilter"] };
    }).filter((s) => s.rows.length);
  }
  const one = parseBomFile(bytes, fileName);
  return one.rows.length ? [{ name: one.sheetName, rows: one.rows, hidden: false, rowNo: one.rows.map((_, i) => i + 1), col0: 0, hiddenRows: 0, filtered: false }] : [];
}

export function parseBomFile(data: ArrayBuffer | Uint8Array, fileName: string): ParsedSheet {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const ext = extensionOf(fileName);

  if (ext === ".csv" || ext === ".tsv" || ext === ".txt") {
    const text = decodeText(bytes);
    const result = Papa.parse<string[]>(text, {
      skipEmptyLines: "greedy",
      delimiter: ext === ".tsv" ? "\t" : "", // "" = auto-detect (comma, semicolon, tab)
    });
    return { sheetName: null, rows: tidyRows(result.data) };
  }

  if (ext === ".xlsx" || ext === ".xls" || ext === ".xlsm") {
    const wb = XLSX.read(bytes, { type: "array", cellDates: false, dense: true });
    // First sheet that actually holds a table (some exports put a cover sheet first).
    for (const name of wb.SheetNames) {
      const rows = tidyRows(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "", blankrows: false }));
      if (rows.length >= 2) return { sheetName: name, rows };
    }
    return { sheetName: wb.SheetNames[0] ?? null, rows: [] };
  }

  throw new Error(`Unsupported file type "${ext || fileName}". Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
}
