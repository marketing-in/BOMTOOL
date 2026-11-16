import "server-only";
import { db } from "@/lib/db";
import { findDutyRate } from "@/lib/landed-cost";
import { analyseRevision, loadDutyRates, FALLBACK_DUTY, type RevisionAnalysis } from "@/server/bom-pipeline";
import type { Currency } from "@/lib/currency";

export type ComplianceRow = {
  lineId: string;
  lineNo: number;
  refDes: string | null;
  partId: string;
  mpn: string;
  manufacturer: string;
  rohs: string;
  reach: string;
  conflictMinerals: boolean;
  eccn: string | null;
  coo: string | null;
  hsn: string | null;
  bcdPct: number;
  dutyAssumed: boolean;
  /** Estimated duty (BCD + SWS) on what we'd import for this build, display currency. */
  dutyEstimate: number;
  cocMissing: boolean;
};

/** Compliance roll-up for one BoM revision at its build quantity. */
export async function complianceReport(revisionId: string, currency: Currency) {
  const a = await analyseRevision(db, revisionId, currency);
  if (!a) return null;
  const rates = await loadDutyRates(db);
  const rows: ComplianceRow[] = [];
  for (const l of a.lines) {
    const p = l.part;
    if (!p || l.dnp) continue;
    const duty = findDutyRate(p.hsnCode, rates) ?? FALLBACK_DUTY;
    // Duty applies to imported allocations only; derive from landed vs goods on non-IN sources.
    const imported = l.allocations.filter((x) => x.tier >= 3 && x.country && x.country !== "IN");
    const goods = imported.reduce((s, x) => s + (x.unit ?? 0) * x.orderQty, 0);
    rows.push({
      lineId: l.id,
      lineNo: l.lineNo,
      refDes: l.refDes,
      partId: p.id,
      mpn: p.mpn,
      manufacturer: p.manufacturer.name,
      rohs: p.rohs,
      reach: p.reach,
      conflictMinerals: p.conflictMineralsDeclared,
      eccn: p.eccn,
      coo: p.countryOfOrigin,
      hsn: p.hsnCode,
      bcdPct: duty.bcdPct,
      dutyAssumed: !findDutyRate(p.hsnCode, rates),
      dutyEstimate: goods * (1 + 0.01125) * (duty.bcdPct / 100) * (1 + duty.swsPct / 100),
      cocMissing: l.allocations.some((x) => !x.coc),
    });
  }
  const count = (f: (r: ComplianceRow) => boolean) => rows.filter(f).length;
  const coo = new Map<string, number>();
  for (const r of rows) coo.set(r.coo ?? "Unknown", (coo.get(r.coo ?? "Unknown") ?? 0) + 1);
  return {
    analysis: a as RevisionAnalysis,
    rows,
    summary: {
      lines: rows.length,
      rohsCompliant: count((r) => r.rohs === "COMPLIANT"),
      rohsExempt: count((r) => r.rohs === "COMPLIANT_WITH_EXEMPTION"),
      rohsNon: count((r) => r.rohs === "NON_COMPLIANT"),
      rohsUnknown: count((r) => r.rohs === "UNKNOWN"),
      reachSvhc: count((r) => r.reach === "CONTAINS_SVHC"),
      reachUnknown: count((r) => r.reach === "UNKNOWN"),
      conflictDeclared: count((r) => r.conflictMinerals),
      controlled: count((r) => !!r.eccn && r.eccn !== "EAR99"),
      cocMissing: count((r) => r.cocMissing),
      dutyEstimate: rows.reduce((s, r) => s + r.dutyEstimate, 0),
      coo: [...coo.entries()].sort((x, y) => y[1] - x[1]),
    },
  };
}
