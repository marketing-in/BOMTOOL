/**
 * Reads a customer's job pack (Phase 29): a workbook that carries more than the BoM. An EMS customer often sends one
 * file with the BoM, the CAD tool's placement report, the lists the pick-and-place machine is loaded from (one per
 * side) and the designators that are not fitted. Every sheet is read and named; the BoM is the sheet that reads
 * most like one, wherever it sits. Pure.
 */
import { readSheets } from "./parse";
import { autoMap, detectHeaderRow, isHeaderLike } from "./columns";
import type { ColumnMapping } from "./fields";
import { mapCentroidHeader, parseCentroid, type PlacementRow } from "@/lib/board/centroid";
import { expandRefDes } from "@/lib/refdes";
import { normaliseMpn } from "@/lib/normalise";

export type Side = "TOP" | "BOTTOM";
export type SheetKind = "bom" | "placement" | "load-list" | "not-fitted" | "other";

export type PackSheet = {
  name: string;
  kind: SheetKind;
  /** Table rows read from it (placements, designators, BoM rows). */
  count: number;
  side: Side | null;
  /** False for a sheet the tool read but did not need (a second copy, a sheet it does not know). */
  used: boolean;
  /** One line for the screen. */
  says: string;
};

export type LoadRow = { refDes: string; x: number; y: number; rotation: number; partNumber: string | null };
export type NotFitted = { refDes: string; side: Side | null; why: string };
export type PackFinding = { level: "amber" | "red"; text: string };

export type JobPack = {
  bomSheet: string | null;
  /** The BoM table, tidy, as it stands on the sheet. */
  rows: string[][];
  sheets: PackSheet[];
  placements: PlacementRow[];
  /** Where the placements came from: a sheet name, or "the load lists". */
  placementSource: string | null;
  loads: { sheet: string; side: Side | null; rows: LoadRow[] }[];
  notFitted: NotFitted[];
  findings: PackFinding[];
};

export const SHEET_KIND_LABEL: Record<SheetKind, string> = {
  bom: "BoM",
  placement: "Placement report",
  "load-list": "Load list",
  "not-fitted": "Not fitted",
  other: "Not used",
};

/** "TOP LOAD", "Bottom_DNP", "Solder side": which side a sheet is about. */
export function sideOfName(name: string): Side | null {
  const n = ` ${name.toLowerCase().replace(/[_\-.()]+/g, " ")} `;
  const top = / (top|component side|comp side|primary|front) /.test(n);
  const bottom = / (bot|bottom|btm|solder side|secondary|back) /.test(n);
  return top === bottom ? null : top ? "TOP" : "BOTTOM";
}

const NOT_FITTED_NAME = /\b(dnp|dnf|dni|dnl|dnm|dnc|not\s*fitted|not\s*loaded|no\s*load|not\s*placed|not\s*mounted|not\s*populated|unpopulated|no\s*pop|do\s*not\s*(place|populate|fit|load|install|mount))\b/i;
const DESIGNATOR = /^[A-Za-z]{1,5}\d{1,5}[A-Za-z]?$/;
/** A value in the design file that means "leave the pads empty". */
export const NOT_FITTED_VALUE = /^(dnp|dnf|dni|dnl|dnm|nc|n\/c|nf|n\.?f\.?|no\s*load|not\s*fitted|do\s*not\s*(place|populate|fit|load|install|mount)|no\s*pop|omit)$/i;

const sameNumber = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const sameAngle = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d <= 0.5 || d >= 359.5;
};
const list = (refs: string[], max = 12) => {
  const sorted = [...new Set(refs)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return sorted.length > max ? `${sorted.slice(0, max).join(", ")} and ${sorted.length - max} more` : sorted.join(", ");
};

type Placed = { kind: "placement" | "load-list"; placements: PlacementRow[]; loads: LoadRow[]; hasSide: boolean };
type Read =
  | Placed
  | { kind: "not-fitted"; refs: string[] }
  | { kind: "bom"; score: number; dataRows: number }
  | { kind: "other" };

type SheetRead = { name: string; rows: string[][]; r: Read };
const isPlaced = (s: SheetRead): s is SheetRead & { r: Placed } => s.r.kind === "placement" || s.r.kind === "load-list";

function readSheet(name: string, rows: string[][]): Read {
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
        for (const r of rows.slice(headerAt + 1)) {
          const p = byRef.get((r[cols.ref!] ?? "").trim().toUpperCase());
          if (p && !loads.some((l) => l.refDes === p.refDes)) loads.push({ refDes: p.refDes, x: p.x, y: p.y, rotation: p.rotation, partNumber: cols.partNumber !== undefined ? r[cols.partNumber]?.trim() || null : null });
        }
        // The CAD tool's report says which side each part is on; a list the machine is loaded from names the part instead.
        const hasSide = cols.side !== undefined;
        return { kind: !hasSide && cols.partNumber !== undefined ? "load-list" : "placement", placements, loads, hasSide };
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
  const recognised = (rows[header] ?? []).filter(isHeaderLike).length;
  const { mapping } = autoMap(rows[header] ?? [], rows.slice(header + 1));
  const names = mapping.includes("mpn") || mapping.includes("description") || mapping.includes("value");
  const counts = mapping.includes("qty") || mapping.includes("refDes");
  if (recognised >= 2 && names && counts && rows.length - header - 1 >= 1) {
    return { kind: "bom", score: recognised * 3 + (/\b(bom|bill|parts?\s*list)\b/i.test(name.replace(/[_\-.]+/g, " ")) ? 5 : 0), dataRows: rows.length - header - 1 };
  }
  return { kind: "other" };
}

/**
 * Reads the whole file. A CSV, or a workbook with one table, comes back as before: its rows and nothing else. With
 * more sheets, each is named, and the sheets are checked against each other.
 */
export function readJobPack(data: ArrayBuffer | Uint8Array, fileName: string): JobPack {
  const sheets = readSheets(data, fileName);
  const read: SheetRead[] = sheets.map((s) => ({ name: s.name ?? "", rows: s.rows, r: readSheet(s.name ?? "", s.rows) }));
  const pack: JobPack = { bomSheet: null, rows: [], sheets: [], placements: [], placementSource: null, loads: [], notFitted: [], findings: [] };

  // The BoM: the best-scoring BoM-like sheet; failing that, the first sheet with a table (as before).
  const boms = read.filter((s) => s.r.kind === "bom").sort((a, b) => (b.r as { score: number }).score - (a.r as { score: number }).score);
  const bom = boms[0] ?? read.find((s) => s.r.kind === "other" && s.rows.length >= 2) ?? read.find((s) => s.rows.length >= 2) ?? read[0];
  if (bom) {
    pack.bomSheet = sheets[read.indexOf(bom)].name;
    pack.rows = bom.rows;
  }

  // Placements: the CAD report with the most parts; with none, the per-side load lists put together.
  const placed = read.filter(isPlaced).filter((s) => s !== bom);
  const reports = placed.filter((s) => s.r.kind === "placement").sort((a, b) => Number(b.r.hasSide) - Number(a.r.hasSide) || b.r.placements.length - a.r.placements.length);
  const lists = placed.filter((s) => s.r.kind === "load-list");
  const report = reports[0] ?? null;
  for (const l of lists) pack.loads.push({ sheet: l.name, side: sideOfName(l.name), rows: l.r.loads });
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

  // Not fitted: the lists that say so, and design values that mean it.
  const placedSide = new Map(pack.placements.map((p) => [p.refDes, p.side]));
  for (const s of read) {
    if (s.r.kind !== "not-fitted") continue;
    const side = sideOfName(s.name);
    for (const ref of s.r.refs) if (!pack.notFitted.some((n) => n.refDes === ref)) pack.notFitted.push({ refDes: ref, side: side ?? placedSide.get(ref) ?? null, why: `sheet “${s.name}”` });
  }
  for (const p of pack.placements) {
    if (p.value && NOT_FITTED_VALUE.test(p.value.trim()) && !pack.notFitted.some((n) => n.refDes === p.refDes)) pack.notFitted.push({ refDes: p.refDes, side: p.side, why: `value “${p.value.trim()}” in the design file` });
  }

  // What each sheet was, for the screen.
  const n = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-IN")} ${k === 1 ? one : many}`;
  read.forEach((s, i) => {
    const name = sheets[i].name ?? fileName;
    const side = sideOfName(name);
    const sideWord = side ? (side === "TOP" ? "top side" : "bottom side") : null;
    if (s === bom) pack.sheets.push({ name, kind: "bom", count: Math.max(0, s.rows.length - detectHeaderRow(s.rows) - 1), side: null, used: true, says: `${n(Math.max(0, s.rows.length - detectHeaderRow(s.rows) - 1), "row")} — the BoM` });
    else if (s.r.kind === "placement") pack.sheets.push({ name, kind: "placement", count: s.r.placements.length, side, used: s === report, says: s === report ? `${n(s.r.placements.length, "part")} placed — where every part sits` : `${n(s.r.placements.length, "part")} — another placement table, not used` });
    else if (s.r.kind === "load-list") pack.sheets.push({ name, kind: "load-list", count: s.r.loads.length, side, used: true, says: `${n(s.r.loads.length, "part")} to load${sideWord ? `, ${sideWord}` : ""}${report ? " — checked against the placement report" : ""}` });
    else if (s.r.kind === "not-fitted") pack.sheets.push({ name, kind: "not-fitted", count: s.r.refs.length, side, used: true, says: `${n(s.r.refs.length, "designator")} not fitted${sideWord ? `, ${sideWord}` : ""}` });
    else if (s.r.kind === "bom") pack.sheets.push({ name, kind: "bom", count: s.r.dataRows, side: null, used: false, says: `${n(s.r.dataRows, "row")} — another BoM-like sheet, not used` });
    else pack.sheets.push({ name, kind: "other", count: s.rows.length, side: null, used: false, says: `${n(s.rows.length, "row")} — not a table the tool knows` });
  });

  // The sheets against each other.
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
export function checkPackAgainstBom(pack: JobPack, lines: { refDes: string | null; mpn: string | null; dnp: boolean }[]): PackFinding[] {
  const out: PackFinding[] = [];
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
};

export function readPackSummary(raw: unknown): PackSummary | null {
  const p = raw as PackSummary | null;
  return p && typeof p === "object" && Array.isArray(p.sheets) && Array.isArray(p.findings) ? p : null;
}
