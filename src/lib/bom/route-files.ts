/**
 * Files dropped or picked on the upload form, each sent where it belongs: a spreadsheet is the BoM, a zip,
 * a Gerber layer, a drill file or a pick-and-place file goes with the board files. A customer often sends the BoM
 * workbook and the Gerber zip together; dropped on either box, both land in the right place. Pure.
 */

/** Files the BoM reader takes (src/lib/bom/parse.ts). */
export const BOM_FILE = /\.(xlsx|xls|xlsm|csv|tsv|txt)$/i;
const WORKBOOK = /\.(xlsx|xls|xlsm)$/i;
const TABLE = /\.(csv|tsv)$/i;
/** Names a pick-and-place file goes by: such a spreadsheet stays with the board files. */
const PLACEMENT_NAME = /pick|place|centroid|cpl|pnp|insertion|position|(^|[^a-z])(xy|pos)([^a-z]|$)/i;

/** How likely a file is the BoM: a workbook, then a CSV, then (dropped alone on the BoM box) a text file; 0 = not. */
function bomRank(name: string, zone: "bom" | "board", alone: boolean): number {
  const placement = PLACEMENT_NAME.test(name);
  if (WORKBOOK.test(name)) return placement ? (zone === "bom" ? 2 : 0) : 4;
  if (TABLE.test(name)) return placement ? (zone === "bom" ? 1 : 0) : 3;
  // A .txt among board files is a drill file far more often than a BoM.
  if (BOM_FILE.test(name)) return zone === "bom" && alone ? 1 : 0;
  return 0;
}

/**
 * Splits files dropped on one of the two boxes. On the BoM box the most BoM-like spreadsheet is the BoM (it replaces
 * the one chosen before); on the board box a spreadsheet is taken as the BoM only while none is chosen, and only one
 * not named like a pick-and-place file. Everything else goes with the board files. The BoM reader then confirms the
 * choice: a workbook taken off the board box that holds no BoM goes back to the board files (upload-form.tsx).
 */
export function routeFiles<T extends { name: string }>(files: T[], opts: { zone: "bom" | "board"; hasBom: boolean }): { bom: T | null; board: T[] } {
  const take = opts.zone === "bom" || !opts.hasBom;
  let best: T | null = null;
  let rank = 0;
  if (take)
    for (const f of files) {
      const r = bomRank(f.name, opts.zone, files.length === 1);
      if (r > rank) {
        best = f;
        rank = r;
      }
    }
  return { bom: best, board: files.filter((f) => f !== best) };
}

/**
 * The board files after a drop or a pick, or null when they stay as they are. Files routed to the board replace the
 * ones before. A pick on the board box that held only the BoM keeps the board files chosen before. The browser's
 * picker has already replaced the board input's files with that pick, so the form must put the earlier ones back,
 * or the Gerbers it still shows would not be sent.
 */
export function boardAfter<T>(current: T[], routed: T[], zone: "bom" | "board"): T[] | null {
  if (routed.length) return routed;
  return zone === "board" ? current : null;
}
