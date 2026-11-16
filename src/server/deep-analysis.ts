import "server-only";
import type { Currency } from "@/lib/currency";
import { boxVerdict } from "@/lib/board/box";
import { deepAnalysis, type DeepLine } from "@/lib/bom/deep-analysis";
import { viewerDataWithAnalysis } from "@/server/board-view";

/** The deep-analysis report for one BoM revision, with the viewer data (box, route) it draws on. */
export async function getDeepAnalysis(revisionId: string, currency: Currency) {
  const r = await viewerDataWithAnalysis(revisionId, currency);
  if (!r) return null;
  const { data, analysis: a, riskByLine } = r;
  const lines: DeepLine[] = a.lines.map((l) => ({
    lineId: l.id,
    lineNo: l.lineNo,
    refDes: l.refDes ?? "",
    mpn: l.part?.mpn ?? l.rawMpn ?? null,
    partId: l.part?.id ?? null,
    dnp: l.dnp,
    required: l.required,
    ours: l.internalQty,
    partners: l.partnerQty,
    suppliers: l.authorisedStock,
    market: l.excessQty + l.brokerStock,
    sources: l.authorisedSources,
    leadWeeks: l.factoryLeadWeeks ?? l.part?.mfrLeadTimeWeeks ?? null,
    lifecycle: l.part?.lifecycle ?? null,
    rohs: l.part?.rohs ?? null,
    reach: l.part?.reach ?? null,
    counterfeitRisk: l.part?.counterfeitRisk ?? null,
    priceTrendPct: l.priceTrendPct,
    spend: l.spend,
    toBuy: l.toBuyLanded,
    risk: riskByLine.get(l.id) ?? null,
  }));
  const report = deepAnalysis(lines, {
    box: data.enclosure && data.box ? boxVerdict(data.enclosure, data.box) : null,
    kitGaps: data.box?.kit.filter((k) => k.status === "missing" || k.status === "check").map((k) => k.label) ?? [],
    watch: data.route.filter((s) => s.watch).map((s) => ({ title: s.title, text: s.watch! })),
  });
  return { report, data, analysis: a, lines };
}
