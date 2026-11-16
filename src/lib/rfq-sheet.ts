import { normaliseHeader } from "@/lib/bom/columns";
import { parseQty } from "@/lib/bom/scrub";

/**
 * RFQ spreadsheet the supplier fills in and sends back. Column A ("Ref") carries our RFQ line id so
 * the returned file maps back even if the supplier re-sorts rows; MPN is the fallback.
 */
export const RFQ_SHEET_HEADER = [
  "Ref",
  "MPN",
  "Manufacturer",
  "Description",
  "Qty required",
  "Target unit price",
  "Unit price",
  "Qty offered",
  "Lead time (weeks)",
  "Date code",
  "Condition (new/refurb)",
  "CoC (Y/N)",
  "Notes",
] as const;

export type RfqSheetInput = {
  rfqNumber: string;
  supplierName: string;
  currency: string;
  dueDate: string | null;
  incoterm: string | null;
  buyer: string;
  lines: { id: string; mpn: string; manufacturer: string; description: string; qty: number; target: number | null }[];
};

export function buildRfqSheet(i: RfqSheetInput): (string | number)[][] {
  return [
    ["Request for quotation", i.rfqNumber],
    ["Supplier", i.supplierName],
    ["Currency", i.currency],
    ["Reply by", i.dueDate ?? ""],
    ["Delivery terms", i.incoterm ?? ""],
    ["Buyer", i.buyer],
    ["Fill in the shaded columns (Unit price … Notes) and send this file back. Do not change the Ref column."],
    [],
    [...RFQ_SHEET_HEADER],
    ...i.lines.map((l) => [l.id, l.mpn, l.manufacturer, l.description, l.qty, l.target ?? "", "", "", "", "", "", "", ""]),
  ];
}

export type ParsedQuoteLine = {
  ref: string | null;
  mpn: string | null;
  unitPrice: number | null;
  qtyOffered: number | null;
  leadTimeWeeks: number | null;
  dateCode: string | null;
  condition: "NEW_FACTORY_SEALED" | "REFURBISHED" | "USED" | "NEW_OPEN_REEL";
  cocAvailable: boolean;
  notes: string | null;
};

export type ParsedQuote = { currency: string | null; lines: ParsedQuoteLine[] };

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) && v.trim() !== "" ? n : null;
}

/** Reads a returned RFQ sheet. Rows without a unit price are "no quote" and are skipped. */
export function parseQuoteSheet(rows: string[][]): ParsedQuote {
  const currencyRow = rows.slice(0, 10).find((r) => normaliseHeader(r[0] ?? "") === "currency");
  const headerIdx = rows.findIndex((r) => r.map(normaliseHeader).includes("unitprice") && r.map(normaliseHeader).includes("mpn"));
  if (headerIdx < 0) throw new Error("This doesn't look like our RFQ sheet: no 'MPN' and 'Unit price' header row.");
  const h = rows[headerIdx].map(normaliseHeader);
  const col = (name: string) => h.indexOf(name);
  const c = {
    ref: col("ref"),
    mpn: col("mpn"),
    unit: col("unitprice"),
    qty: col("qtyoffered"),
    lead: h.findIndex((x) => x.startsWith("leadtime")),
    dc: col("datecode"),
    cond: h.findIndex((x) => x.startsWith("condition")),
    coc: h.findIndex((x) => x.startsWith("coc")),
    notes: col("notes"),
  };
  const lines: ParsedQuoteLine[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const unitPrice = num(r[c.unit]);
    if (unitPrice === null) continue;
    const cond = (r[c.cond] ?? "").toLowerCase();
    lines.push({
      ref: c.ref >= 0 ? r[c.ref]?.trim() || null : null,
      mpn: r[c.mpn]?.trim() || null,
      unitPrice,
      qtyOffered: c.qty >= 0 ? parseQty(r[c.qty]) : null,
      leadTimeWeeks: c.lead >= 0 ? num(r[c.lead]) : null,
      dateCode: c.dc >= 0 ? r[c.dc]?.trim() || null : null,
      condition: /refurb/.test(cond) ? "REFURBISHED" : /used/.test(cond) ? "USED" : /open|partial/.test(cond) ? "NEW_OPEN_REEL" : "NEW_FACTORY_SEALED",
      cocAvailable: c.coc >= 0 ? !/^(n|no|false|0)$/i.test((r[c.coc] ?? "").trim()) : true,
      notes: c.notes >= 0 ? r[c.notes]?.trim() || null : null,
    });
  }
  return { currency: currencyRow?.[1]?.trim().toUpperCase() || null, lines };
}
