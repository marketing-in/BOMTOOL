import { normaliseHeader } from "@/lib/bom/columns";
import { cleanMpn, parseQty } from "@/lib/bom/scrub";
import type { PriceBreak } from "@/lib/currency";

export type PriceListField = "mpn" | "manufacturer" | "stock" | "moq" | "spq" | "currency" | "leadTime" | "dateCode" | "packaging" | "sku" | "description";

export type PriceListMapping = {
  fields: Partial<Record<PriceListField, number>>;
  /** Price columns and the quantity break each represents. */
  breaks: { col: number; qty: number }[];
};

const SYN: Record<PriceListField, string[]> = {
  mpn: ["mpn", "manufacturerpartnumber", "mfrpartnumber", "mfrpn", "partnumber", "partno", "pn"],
  manufacturer: ["manufacturer", "mfr", "make", "brand"],
  stock: ["stock", "qtyavailable", "available", "availability", "instock", "quantityavailable", "inventory", "qty"],
  moq: ["moq", "minimumorderquantity", "minorderqty", "minqty", "min"],
  spq: ["spq", "packqty", "standardpack", "standardpackqty", "mult", "multiple", "reelqty"],
  currency: ["currency", "curr", "ccy"],
  leadTime: ["leadtime", "leadtimeweeks", "lt", "leadweeks", "factoryleadtime"],
  dateCode: ["datecode", "dc"],
  packaging: ["packaging", "package", "pkg"],
  sku: ["sku", "supplierpartnumber", "ourpartnumber", "itemcode", "code"],
  description: ["description", "desc"],
};

/** Header → price-break quantity: "1+", "Price 100+", "@1000", "10-99", "Unit price (1k)". */
export function breakQtyFromHeader(header: string): number | null {
  const h = header.toLowerCase().replace(/,/g, "");
  if (!/(price|\+|@|-|\d+k\b)/.test(h)) return null;
  const k = h.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if (k) return Math.round(Number(k[1]) * 1000);
  const m = h.match(/@?\s*(\d+)\s*(?:\+|-|pcs|$|\))/);
  if (m) return Number(m[1]);
  // "Unit price", "Price (INR)", "Rate" with no quantity → single break at 1.
  if (/price|rate/.test(h) && !/\d/.test(h)) return 1;
  return null;
}

export function autoMapPriceList(headers: string[]): PriceListMapping {
  const fields: PriceListMapping["fields"] = {};
  const breaks: PriceListMapping["breaks"] = [];
  headers.forEach((raw, col) => {
    const h = normaliseHeader(raw);
    if (!h) return;
    const field = (Object.keys(SYN) as PriceListField[]).find((f) => SYN[f].includes(h) && fields[f] === undefined);
    if (field) {
      fields[field] = col;
      return;
    }
    const qty = breakQtyFromHeader(raw);
    if (qty !== null && !breaks.some((b) => b.qty === qty)) breaks.push({ col, qty });
  });
  breaks.sort((a, b) => a.qty - b.qty);
  return { fields, breaks };
}

export type PriceListEntry = {
  mpn: string;
  manufacturer: string | null;
  description: string | null;
  sku: string | null;
  stock: number;
  moq: number;
  spq: number;
  currency: string;
  leadTimeWeeks: number | null;
  dateCode: string | null;
  packaging: string | null;
  priceBreaks: PriceBreak[];
};

function price(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^\d.,]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parsePriceList(rows: string[][], headerRow: number, mapping: PriceListMapping, defaultCurrency: string): { entries: PriceListEntry[]; skipped: number } {
  const get = (r: string[], f: PriceListField) => (mapping.fields[f] !== undefined ? r[mapping.fields[f]!]?.trim() || null : null);
  const entries: PriceListEntry[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerRow + 1)) {
    const mpn = cleanMpn(get(r, "mpn"));
    const breaks = mapping.breaks
      .map((b) => ({ qty: b.qty, price: price(r[b.col]) }))
      .filter((b): b is PriceBreak => b.price !== null);
    if (!mpn || !breaks.length) {
      if (r.some((c) => c)) skipped++;
      continue;
    }
    const cur = (get(r, "currency") ?? defaultCurrency).toUpperCase().replace(/[^A-Z]/g, "") || defaultCurrency;
    entries.push({
      mpn,
      manufacturer: get(r, "manufacturer"),
      description: get(r, "description"),
      sku: get(r, "sku"),
      stock: Math.round(parseQty(get(r, "stock")) ?? 0),
      moq: Math.max(1, Math.round(parseQty(get(r, "moq")) ?? 1)),
      spq: Math.max(1, Math.round(parseQty(get(r, "spq")) ?? 1)),
      currency: cur.length === 3 ? cur : defaultCurrency,
      leadTimeWeeks: parseQty(get(r, "leadTime")),
      dateCode: get(r, "dateCode"),
      packaging: get(r, "packaging"),
      priceBreaks: breaks.sort((a, b) => a.qty - b.qty),
    });
  }
  return { entries, skipped };
}
