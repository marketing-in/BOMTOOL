/**
 * circuitflow's part master (1,454 semiconductors + 1,229 resistors) as typed rows, and a pure search over it.
 * Reference data — "illustrative, not verified purchasing data" per its source.
 */

export type MasterSemi = { kind: "semi"; category: string; subType: string; mpn: string; manufacturer: string; description: string; specs: string; package: string; mount: string; use: string; alternates: string };
export type MasterRes = { kind: "res"; type: string; size: string; value: string; ohms: number; tolerance: string; power: string; maxV: string; tcr: string; mpn: string; manufacturer: string; crossRef: string; packaging: string };
export type MasterRow = MasterSemi | MasterRes;
type Raw = { semiconductorFields: string[]; resistorFields: string[]; semiconductors: unknown[][]; resistors: unknown[][] };

export function readPartMaster(raw: Raw): MasterRow[] {
  const zip = (fields: string[], row: unknown[]) => Object.fromEntries(fields.map((f, i) => [f, row[i] ?? ""]));
  return [
    ...raw.semiconductors.map((r) => ({ kind: "semi", ...zip(raw.semiconductorFields, r) }) as MasterSemi),
    ...raw.resistors.map((r) => ({ kind: "res", ...zip(raw.resistorFields, r) }) as MasterRes),
  ];
}

export const masterCategory = (r: MasterRow) => (r.kind === "semi" ? r.category : "Resistor");

/** Case-insensitive search over MPN, maker, description/value and package; every word must match. */
export function searchPartMaster(rows: MasterRow[], q: string, category: string | null, page = 1, size = 40) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hay = (r: MasterRow) =>
    (r.kind === "semi" ? [r.mpn, r.manufacturer, r.description, r.package, r.subType, r.category, r.specs] : [r.mpn, r.manufacturer, r.value, r.size, r.type, r.tolerance, r.power]).join(" ").toLowerCase();
  const hits = rows.filter((r) => (!category || masterCategory(r) === category) && words.every((w) => hay(r).includes(w)));
  const pages = Math.max(1, Math.ceil(hits.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { total: hits.length, page: p, pages, rows: hits.slice((p - 1) * size, p * size) };
}

export function masterCategories(rows: MasterRow[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(masterCategory(r), (counts.get(masterCategory(r)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}
