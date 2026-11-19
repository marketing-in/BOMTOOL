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
  // Second sources the customer approves, in a column of their own ("A; B", "MPN (Maker)").
  alternates: {
    exact: [
      "alternates", "alternatives", "alternatempn", "alternatempns", "altmpn", "altmpns", "alternatepartnumber", "alternatepartnumbers", "altpartnumber",
      "altpartnumbers", "alternatepn", "altpn", "secondsource", "secondsources", "secondsourcempn", "substitutes", "substitutempn", "approvedalternates",
      "approvedalternatives", "candidatepartnumber", "candidatepartnumbers", "candidatempn", "candidatempns", "mpn2", "manufacturerpartnumber2", "mfrpartnumber2", "mfrpn2",
    ],
  },
};

/** Headers we recognise but deliberately ignore (they still count toward header-row detection). */
const KNOWN_IGNORED = new Set([
  "item", "itemno", "no", "line", "lineno", "datasheet", "libref", "library", "supplier", "supplier1", "supplierpartnumber",
  "supplierpartnumber1", "digikeypn", "mouserpn", "price", "unitprice", "extprice", "notes", "remarks", "category", "type",
  // Serial-number columns, as Indian and UK BoMs write them: Sl. No., S.No., Sr. No., SI.NO.
  "sino", "slno", "srno", "sno", "serialno", "serialnumber", "sr", "sl", "uom", "unit", "units", "rev", "revision", "status", "rohs", "leadtime", "moq", "total", "amount",
  // The item a row belongs to, and columns customers add next to the part.
  "bomitem", "itemnumber", "itemid", "findno", "findnumber", "bomstatus", "function", "material", "process", "confidence", "evidence", "linecost", "unitcost",
  "cost", "maincategory", "componenttype", "subtype", "mounting", "mountingstyle", "mounttype", "mountedon", "section", "sheet",
]);

/**
 * Words that make a part-number column a second source ("Alternate MPN", "Candidate part numbers"), or a guess
 * ("Likely part number", "Proposed MPN"): parts the matcher tries, never the customer's own part number.
 */
const ALTERNATE_WORD = /\b(alt|alts|alternate|alternates|alternative|alternatives|second[\s-]*sources?|substitutes?|candidates?|backup|equivalents?|likely|probable|possible|proposed|suggested|guess(ed)?|estimated)\b/i;
/** A qualifier in front of a field's name ("Primary Manufacturer", "Preferred MPN"), or "/ Model" behind it. */
const QUALIFIER = /^(primary|preferred|main|approved|selected|recommended|chosen|default)/;
/** Columns the upload adds to keep what no field takes: "Alternate internal P/Ns (BOM Part Options)". */
export const KEPT_ONLY = /^alternate internal p\/ns\b/i;
/** Axes of a size or a position ("Size X (mm)", "Position Y"): never a part field. */
const AXIS = /^(size|dim|dimension|position|pos|offset|cent(er|re)|mid|location|loc)[\s_.-]*[xyz]\b/i;
/** How a part is mounted (SMD/THT) or what it is mounted on: not whether it is fitted. */
const MOUNT_TYPE = /^(mounting|mounted\s*on|mount(ing)?\s*(type|style|technology|tech|method))$/i;
/** Quantities that are not the quantity per board. */
const NOT_BOARD_QTY = /scope|order|min|moq|pack|break|stock|reel|price|cost|spq|mpq|total|country/i;

/** Columns whose name ends in "code" but are not a part code. */
const NOT_A_PART_CODE = /^(hsn|hs|hts|htsus|eccn|tariff|customs|sac|date|lot|batch|bar|qr|country|colou?r|tax|currency|pin|zip|postal|error|status|package|case|footprint|region|area|zone|location|bin|shelf|rack)code$/;

export function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function synonymConfidence(h: string, field: BomField): number {
  const syn = SYNONYMS[field];
  if (syn.exact.includes(h)) return 100;
  if (syn.weak?.includes(h)) return 60;
  // "Manufacturer Part Number 2", "Qty (per board)", "Mfr. P/N" etc.
  if (syn.exact.some((s) => s.length >= 4 && h.startsWith(s))) return 75;
  if (syn.exact.some((s) => s.length >= 6 && h.includes(s))) return 65;
  return 0;
}

/** How confident we are that a header feeds a field (0 = not at all). */
export function headerConfidence(header: string, field: BomField): number {
  const raw = header.trim();
  const h = normaliseHeader(raw);
  if (!h) return 0;
  // A sentence is not a header, and neither is one axis of a size or a position.
  if (raw.length > 40 || raw.split(/\s+/).length > 5 || AXIS.test(raw)) return 0;
  // A column the upload adds to keep data no field takes (alternates known only by a house code).
  if (KEPT_ONLY.test(raw)) return 0;
  const alternate = ALTERNATE_WORD.test(raw);
  if (alternate && (field === "mpn" || field === "manufacturer" || field === "customerPn")) return 0;
  if (field === "dnp" && MOUNT_TYPE.test(raw)) return 0;
  if (field === "qty" && NOT_BOARD_QTY.test(raw) && !SYNONYMS.qty.exact.includes(h)) return 0;
  let conf = synonymConfidence(h, field);
  // "Primary MPN / Model", "Likely part number": the field's own name behind a qualifier, or with a model beside it.
  const bare = h.replace(QUALIFIER, "").replace(/models?$/, "");
  if (bare !== h && bare.length >= 2) conf = Math.max(conf, Math.min(90, synonymConfidence(bare, field) || synonymConfidence(bare.replace(/s$/, ""), field)));
  // The maker's part number named as a word: "MPN / Model", "Mfr MPN".
  if (field === "mpn" && /\bmpns?\b/i.test(raw)) conf = Math.max(conf, 80);
  if (field === "alternates" && alternate && /\b(mpns?|parts?|p\/?ns?|numbers?|models?|sources?)\b/i.test(raw)) conf = Math.max(conf, 85);
  // A house code column a customer names their own way: "ME-Code", "XYZ Code", "Store Code".
  if (!conf && field === "customerPn" && h.length >= 5 && h.length <= 16 && h.endsWith("code") && !NOT_A_PART_CODE.test(h)) return 65;
  return conf;
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

/** A cell of designators: "C1", "R1-R4", "U1, U2 U3". */
export function isDesignatorCell(cell: string): boolean {
  const tokens = cell.split(/[\s,;]+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => /^[A-Z]{1,5}\d{1,5}[A-Z]?([-–][A-Z]{0,5}\d{1,5}[A-Z]?)?$/i.test(t));
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
  // "Location" or "Position" holds designators in some BoMs and a store location in others: the cells decide.
  const refCol = mapping.indexOf("refDes");
  if (sample?.length && refCol >= 0 && (confidence[refCol] <= 75 || /^(locations?|positions?)$/.test(normaliseHeader(headers[refCol])))) {
    const cells = sample.slice(0, 40).map((r) => (r[refCol] ?? "").trim()).filter(Boolean);
    if (cells.length && cells.filter(isDesignatorCell).length < cells.length * 0.6) {
      mapping[refCol] = null;
      confidence[refCol] = 0;
    }
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

/**
 * A customer's saved mapping, for a table the upload may have added columns to (a count of grouped rows, a section,
 * joined alternates): the saved mapping for the customer's own columns, the automatic one for the tool's columns
 * after them — a field the saved mapping already uses is not given twice.
 */
export function templateMapping(saved: ColumnMapping, auto: ColumnMapping, own: number): ColumnMapping {
  const head = saved.slice(0, own);
  return [...head, ...auto.slice(own).map((f) => (f && !head.includes(f) ? f : null))];
}
