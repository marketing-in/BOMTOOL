export const BOM_FIELDS = [
  "mpn",
  "manufacturer",
  "qty",
  "refDes",
  "description",
  "value",
  "package",
  "dnp",
  "customerPn",
  "alternates",
] as const;

export type BomField = (typeof BOM_FIELDS)[number];

export const BOM_FIELD_LABEL: Record<BomField, string> = {
  mpn: "MPN",
  manufacturer: "Manufacturer",
  qty: "Qty per board",
  refDes: "RefDes / Designator",
  description: "Description",
  value: "Value",
  package: "Package / Footprint",
  dnp: "DNP / Populate",
  customerPn: "Customer part no.",
  alternates: "Alternate MPNs",
};

/** One entry per source column: the field it feeds, or null to ignore the column. */
export type ColumnMapping = (BomField | null)[];

export function isBomField(value: unknown): value is BomField {
  return typeof value === "string" && (BOM_FIELDS as readonly string[]).includes(value);
}

/** What a mapping still lacks before its lines can be matched: "MPN, Description or Value", "Qty or RefDes". */
export function missingFields(mapping: ColumnMapping): string[] {
  const m: string[] = [];
  if (!mapping.includes("mpn") && !mapping.includes("description") && !mapping.includes("value")) m.push("MPN, Description or Value");
  if (!mapping.includes("qty") && !mapping.includes("refDes")) m.push("Qty or RefDes");
  return m;
}

/**
 * Why a mapping cannot be used, or null when it can: one column per field, something to match each line by, and a
 * quantity or designators. The one check the mapping page, its editor and an upload that skips the page all share.
 */
export function mappingProblem(mapping: ColumnMapping): string | null {
  const used = mapping.filter(Boolean);
  if (new Set(used).size !== used.length) return "Each field can only be mapped to one column.";
  if (!mapping.includes("mpn") && !mapping.includes("description") && !mapping.includes("value")) return "Map at least an MPN, Description or Value column so lines can be matched.";
  if (!mapping.includes("qty") && !mapping.includes("refDes")) return "Map a Qty or RefDes column.";
  return null;
}
