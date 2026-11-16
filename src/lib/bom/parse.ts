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

/** Every sheet of a workbook as tidy rows, in the workbook's order (a CSV is one unnamed sheet). Empty sheets are left out. */
export function readSheets(data: ArrayBuffer | Uint8Array, fileName: string): { name: string | null; rows: string[][]; hidden: boolean }[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const ext = extensionOf(fileName);
  if (ext === ".xlsx" || ext === ".xls" || ext === ".xlsm") {
    const wb = XLSX.read(bytes, { type: "array", cellDates: false, dense: true });
    const hidden = new Map((wb.Workbook?.Sheets ?? []).map((s) => [s.name, !!s.Hidden]));
    return wb.SheetNames.map((name) => ({
      name,
      rows: tidyRows(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "", blankrows: false })),
      hidden: hidden.get(name) ?? false,
    })).filter((s) => s.rows.length);
  }
  const one = parseBomFile(bytes, fileName);
  return one.rows.length ? [{ name: one.sheetName, rows: one.rows, hidden: false }] : [];
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
