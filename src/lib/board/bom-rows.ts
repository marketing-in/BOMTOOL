import { scoreToRisk } from "@/lib/risk";
import type { ViewerPart } from "@/components/viewer/types";

export type BomRow = {
  key: string;
  lineNo: number | null;
  lineId: string | null;
  mpn: string | null;
  manufacturer: string | null;
  refs: string[];
  dnp: boolean;
  matched: boolean;
  level: "green" | "amber" | "red" | "grey";
  supply: ViewerPart["supply"];
  rohs: ViewerPart["rohs"];
  reach: ViewerPart["reach"];
};

/** One row per BoM line (all its designators), in line order. */
export function bomRows(parts: ViewerPart[]): BomRow[] {
  const byLine = new Map<string, BomRow>();
  for (const p of parts) {
    const key = p.lineId ?? `ref:${p.refDes}`;
    const row = byLine.get(key);
    if (row) {
      row.refs.push(p.refDes);
      continue;
    }
    byLine.set(key, {
      key,
      lineNo: p.lineNo,
      lineId: p.lineId,
      mpn: p.mpn,
      manufacturer: p.manufacturer,
      refs: [p.refDes],
      dnp: p.dnp,
      matched: !!p.partId,
      level: p.dnp ? "grey" : p.risk?.level ?? (p.partId ? scoreToRisk(p.worst) : "red"),
      supply: p.supply,
      rohs: p.rohs,
      reach: p.reach,
    });
  }
  return [...byLine.values()].sort((a, b) => (a.lineNo ?? 1e9) - (b.lineNo ?? 1e9) || a.refs[0].localeCompare(b.refs[0], undefined, { numeric: true }));
}

