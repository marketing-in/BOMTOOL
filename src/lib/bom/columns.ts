import type { BomField, ColumnMapping } from "./fields";

/** Header synonyms seen in Altium, KiCad, OrCAD, Eagle and hand-made customer BoMs (normalised form). */
const SYNONYMS: Record<BomField, { exact: string[]; weak?: string[] }> = {
  mpn: {
    exact: [
      "mpn", "mpn1", "manufacturerpartnumber", "manufacturerpartnumber1", "manufacturerpn", "manufacturerpartno",
      "mfrpartnumber", "mfrpartno", "mfrpn", "mfgpn", "mfgpartnumber", "mfgpartno", "partnumbermanufacturer",
      "mfrpartnum", "mfgpartnum", "makerpartnumber", "makerpartno", "makepartnumber", "makepartno", "manufacturerspartnumber", "manufacturerspartno",
      "mfrspartnumber", "mfrspartno", "mfgrpartnumber", "mfgrpartno", "mfgrpn", "manufacturerpartnum", "manufacturerpartcode", "mfrpartcode",
    ],
    weak: ["partnumber", "partno", "pn"],
  },
  manufacturer: {
    exact: ["manufacturer", "manufacturer1", "manufacturername", "mfr", "mfrname", "mfg", "mfgname", "make", "brand"],
  },
  qty: {
    exact: ["qty", "quantity", "qtyperboard", "qtyperpcb", "qtyper", "quantityperboard", "quantityperpcb", "qtypcb", "qtyboard", "pcs", "count"],
  },
  refDes: {
    exact: [
      "refdes", "designator", "designators", "reference", "references", "referencedesignator", "referencedesignators",
      "partreference", "ref", "refs", "position", "positions", "location",
    ],
  },
  description: {
    exact: ["description", "desc", "partdescription", "itemdescription", "details", "particulars", "specification", "specifications", "componentdescription", "materialdescription", "partdesc", "itemdesc", "descriptionofgoods"],
  },
  // Altium puts the value in "Comment"; OrCAD in "Part".
  value: { exact: ["value", "val", "partvalue", "comment"], weak: ["part"] },
  package: { exact: ["package", "footprint", "pcbfootprint", "case", "casepackage", "packagecase", "size", "packagesize"] },
  dnp: { exact: ["dnp", "dnf", "dni", "populate", "populated", "fitted", "fit", "mount", "install", "assemble", "nostuff", "placement"] },
  customerPn: {
    exact: [
      "customerpartnumber", "customerpn", "cpn", "ipn", "internalpartnumber", "internalpn", "companypartnumber", "ourpartnumber", "partcode", "itemcode",
      "materialcode", "materialnumber", "materialno", "stockcode", "sapcode", "sapnumber", "sapno", "erpcode", "housepartnumber", "housepn", "customercode",
    ],
  },
};

/** Headers we recognise but deliberately ignore (they still count toward header-row detection). */
const KNOWN_IGNORED = new Set([
  "item", "itemno", "no", "line", "lineno", "datasheet", "libref", "library", "supplier", "supplier1", "supplierpartnumber",
  "supplierpartnumber1", "digikeypn", "mouserpn", "price", "unitprice", "extprice", "notes", "remarks", "category", "type",
  // Serial-number columns, as Indian and UK BoMs write them: Sl. No., S.No., Sr. No., SI.NO.
  "sino", "slno", "srno", "sno", "serialno", "serialnumber", "sr", "sl", "uom", "unit", "units", "rev", "revision", "status", "rohs", "leadtime", "moq", "total", "amount",
]);

/** Columns whose name ends in "code" but are not a part code. */
const NOT_A_PART_CODE = /^(hsn|hs|sac|date|lot|batch|bar|qr|country|colou?r|tax|currency|pin|zip|postal|error|status)code$/;

export function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** How confident we are that a header feeds a field (0 = not at all). */
export function headerConfidence(header: string, field: BomField): number {
  const h = normaliseHeader(header);
  if (!h) return 0;
  const syn = SYNONYMS[field];
  if (syn.exact.includes(h)) return 100;
  if (syn.weak?.includes(h)) return 60;
  // "Manufacturer Part Number 2", "Qty (per board)", "Mfr. P/N" etc.
  if (syn.exact.some((s) => s.length >= 4 && h.startsWith(s))) return 75;
  if (syn.exact.some((s) => s.length >= 6 && h.includes(s))) return 65;
  // A house code column a customer names their own way: "ME-Code", "XYZ Code", "Store Code".
  if (field === "customerPn" && h.length >= 5 && h.length <= 16 && h.endsWith("code") && !NOT_A_PART_CODE.test(h)) return 65;
  return 0;
}

export function isHeaderLike(cell: string): boolean {
  const h = normaliseHeader(cell);
  if (!h) return false;
  if (KNOWN_IGNORED.has(h)) return true;
  return (Object.keys(SYNONYMS) as BomField[]).some((f) => headerConfidence(cell, f) >= 65);
}

/**
 * Picks the header row among the first rows: the row with the most recognised header cells.
 * Customer exports often put a title block (project, revision, date) above the table.
 */
export function detectHeaderRow(rows: string[][], scan = 25): number {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, scan); i++) {
    const cells = rows[i].filter((c) => c.trim());
    const recognised = cells.filter(isHeaderLike).length;
    const score = recognised * 3 + Math.min(cells.length, 6) * 0.1;
    if (recognised >= 2 && score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

export type AutoMapResult = { mapping: ColumnMapping; confidence: number[] };

/** Cells that read like a description ("CAP CER 100nF 50V X7R 0402") rather than a value ("100nF"). */
function readsLikeDescription(cells: string[]): boolean {
  const filled = cells.map((c) => c.trim()).filter(Boolean);
  if (filled.length < 2) return false;
  const wordy = filled.filter((c) => c.length >= 14 && /[\s,;]/.test(c)).length;
  return wordy >= filled.length * 0.6;
}

/**
 * Assigns each field to at most one column, highest confidence first; ties go to the left-most column. Given the
 * rows under the header, a column guessed as the value (OrCAD's "Part") becomes the description when its cells
 * read like descriptions and no other column is one.
 */
export function autoMap(headers: string[], sample?: string[][]): AutoMapResult {
  const pairs: { col: number; field: BomField; conf: number }[] = [];
  headers.forEach((header, col) => {
    (Object.keys(SYNONYMS) as BomField[]).forEach((field) => {
      const conf = headerConfidence(header, field);
      if (conf > 0) pairs.push({ col, field, conf });
    });
  });
  pairs.sort((a, b) => b.conf - a.conf || a.col - b.col);

  const mapping: ColumnMapping = headers.map(() => null);
  const confidence = headers.map(() => 0);
  const usedFields = new Set<BomField>();
  for (const p of pairs) {
    if (usedFields.has(p.field) || mapping[p.col] !== null) continue;
    mapping[p.col] = p.field;
    confidence[p.col] = p.conf;
    usedFields.add(p.field);
  }
  const valueCol = mapping.indexOf("value");
  if (sample?.length && valueCol >= 0 && !mapping.includes("description") && confidence[valueCol] < 100 && readsLikeDescription(sample.slice(0, 40).map((r) => r[valueCol] ?? ""))) {
    mapping[valueCol] = "description";
  }
  return { mapping, confidence };
}

/** Stable key for a header row, used to auto-apply a customer's saved template. */
export function headerSignature(headers: string[]): string {
  return headers.map(normaliseHeader).filter(Boolean).join("|");
}
