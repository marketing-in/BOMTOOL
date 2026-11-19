/**
 * When the columns of an uploaded BoM can be taken without asking: the upload then skips the mapping page and opens
 * the footprint match (step 3) straight away. The mapping page stays one click away ("Check columns").
 *
 * Certain means one of two things:
 * - a template: this customer's saved mapping fits the header exactly. A person confirmed it before.
 * - an automatic mapping the reader is sure of: the BoM sheet read like one; its header row stands out; the part's
 *   name, the designators and the quantity come from headers the matcher treats as exact or near-exact (75 and up:
 *   "MFR P No" is a prefix of "mfrpn" and scores exactly 75, while "Part" alone or a header that only contains a
 *   field's word is a guess); no other column claims those fields as strongly; and the cells read like what their
 *   headers say.
 * Anything else goes to the mapping page, as before. Pure: it runs on the server and in the upload form's worker.
 */
import { detectHeaderRow, headerConfidence, isDesignatorCell, isHeaderLike } from "./columns";
import { mappingProblem, type BomField, type ColumnMapping } from "./fields";
import { scrubRows } from "./scrub";

/** The lowest header confidence that is not a guess. */
export const SURE_HEADER = 75;
/** Rows looked at for the header, as detectHeaderRow does. */
const SCAN = 25;
/** Share of the cells that must read like their header (autoMap uses the same 0.6 for "Location"/"Position"). */
const CELLS_AGREE = 0.6;

export type CertainInput = {
  /** The rows as kept on the revision: title block, header, lines (and the not-fitted lines the upload adds). */
  rows: string[][];
  headerRow: number;
  mapping: ColumnMapping;
  /** autoMap's confidence for each column (0 for a column it left alone). */
  confidence: number[];
  /** False when no sheet read like a BoM and one was taken anyway. */
  bomFound: boolean;
  /** The mapping is this customer's saved template for the same header. */
  template?: boolean;
};

export type Certainty = { certain: true; via: "template" | "auto" } | { certain: false; why: string };

const no = (why: string): Certainty => ({ certain: false, why });

/** The field a line is matched by: the maker's part number, else the description, else the value. */
export function nameField(mapping: ColumnMapping): BomField {
  return mapping.includes("mpn") ? "mpn" : mapping.includes("description") ? "description" : "value";
}

export function certainMapping(input: CertainInput): Certainty {
  const { rows, headerRow, mapping, confidence } = input;
  const header = rows[headerRow] ?? [];
  if (!header.length || mapping.length !== header.length) return no("The mapping does not fit the header row.");
  const problem = mappingProblem(mapping);
  if (problem) return no(problem);
  if (input.template) return { certain: true, via: "template" };
  if (!input.bomFound) return no("No sheet reads like a BoM.");

  // The header row stands out: the reader's own pick, at least three recognised headers, three more than any other row.
  if (detectHeaderRow(rows, SCAN) !== headerRow) return no("The header row is not clear.");
  const recognised = (r: string[]) => r.filter((c) => c.trim() && isHeaderLike(c)).length;
  const own = recognised(header);
  if (own < 3) return no("Fewer than three headers are recognised.");
  for (let i = 0; i < Math.min(rows.length, SCAN); i++) if (i !== headerRow && recognised(rows[i]) > own - 3) return no("Another row reads almost as much like a header.");

  // The fields that decide the match come from headers that are not guesses.
  const col = (f: BomField) => mapping.indexOf(f);
  const conf = (f: BomField) => (col(f) >= 0 ? (confidence[col(f)] ?? 0) : 0);
  const name = nameField(mapping);
  if (conf(name) < SURE_HEADER) return no(`The ${name === "mpn" ? "part number" : name} column is a guess.`);
  if (col("refDes") < 0) return no("No designator column: the footprints cannot be checked.");
  if (conf("refDes") < SURE_HEADER) return no("The designator column is a guess.");
  for (const f of ["qty", "dnp"] as const) if (col(f) >= 0 && conf(f) < SURE_HEADER) return no(`The ${f === "qty" ? "quantity" : "not-fitted"} column is a guess.`);
  // …and no column left alone claims one of them as strongly.
  for (const f of [name, "refDes", "qty"] as const) {
    if (col(f) < 0) continue;
    const rival = header.findIndex((h, c) => c !== col(f) && mapping[c] === null && headerConfidence(h, f) >= conf(f));
    if (rival >= 0) return no(`“${header[rival]}” could also be the ${f === "mpn" ? "part number" : f === "refDes" ? "designators" : f === "qty" ? "quantity" : f}.`);
  }

  // The cells read like their headers say.
  const lines = scrubRows(rows, headerRow, mapping, new Map());
  const fitted = lines.filter((l) => !l.dnp);
  if (!fitted.length) return no("No fitted line was read.");
  const refs = lines.map((l) => l.refDes ?? "").filter(Boolean);
  if (!refs.length || refs.filter(isDesignatorCell).length < refs.length * CELLS_AGREE) return no("The designator cells do not read like designators.");
  if (name === "mpn") {
    const mpns = lines.map((l) => l.rawMpn ?? "").filter(Boolean);
    if (mpns.filter((m) => /\d/.test(m) && m.length <= 60).length < mpns.length * CELLS_AGREE) return no("The part number cells do not read like part numbers.");
  }
  if (col("qty") >= 0) {
    const share = (code: string) => fitted.filter((l) => l.issues.includes(code)).length / fitted.length;
    if (share("MISSING_QTY") > 0.1) return no("Many lines have no quantity.");
    if (share("QTY_REFDES_MISMATCH") > 0.2) return no("Many quantities differ from their designator counts.");
  }
  return { certain: true, via: "auto" };
}

/** The deciding columns as read ("MPN ← MFR P No"), for the note on step 3 and the audit log. */
export function decidingColumns(header: string[], mapping: ColumnMapping): string[] {
  const label: Partial<Record<BomField, string>> = { mpn: "MPN", description: "Description", value: "Value", refDes: "RefDes", qty: "Qty" };
  const fields: BomField[] = [nameField(mapping), "refDes", "qty"];
  return fields.filter((f) => mapping.includes(f)).map((f) => `${label[f]} ← ${(header[mapping.indexOf(f)] ?? "").trim() || `column ${mapping.indexOf(f) + 1}`}`);
}
