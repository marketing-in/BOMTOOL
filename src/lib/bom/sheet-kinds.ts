/** What a sheet of a customer's workbook is (src/lib/bom/workbook.ts), kept apart so a screen can name it without the reader. */
export type SheetKind = "bom" | "placement" | "load-list" | "not-fitted" | "alternates" | "details" | "revision-history" | "reference" | "other";

export const SHEET_KIND_LABEL: Record<SheetKind, string> = {
  bom: "BoM",
  placement: "Placement report",
  "load-list": "Load list",
  "not-fitted": "Not fitted",
  alternates: "Alternates",
  details: "Details",
  "revision-history": "Revision history",
  reference: "Reference table",
  other: "Not a table",
};
