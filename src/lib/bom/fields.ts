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
};

/** One entry per source column: the field it feeds, or null to ignore the column. */
export type ColumnMapping = (BomField | null)[];

export function isBomField(value: unknown): value is BomField {
  return typeof value === "string" && (BOM_FIELDS as readonly string[]).includes(value);
}
