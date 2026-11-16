import { describe, expect, it } from "vitest";
import { deepAnalysis, type DeepLine } from "@/lib/bom/deep-analysis";
import type { PartRisk } from "@/lib/part-risk";

const risk = (score: number, level: PartRisk["level"], factor = "Supply"): PartRisk => ({
  score,
  level,
  summary: "",
  factors: [{ key: "supply", label: factor, score, level, reason: `${factor} reason`, action: `${factor} action` }],
});

let n = 0;
const line = (o: Partial<DeepLine>): DeepLine => ({
  lineId: `l${++n}`,
  lineNo: n,
  refDes: `R${n}`,
  mpn: `MPN${n}`,
  partId: `p${n}`,
  dnp: false,
  required: 100,
  ours: 0,
  partners: 0,
  suppliers: 0,
  market: 0,
  sources: 3,
  leadWeeks: 8,
  lifecycle: "ACTIVE",
  rohs: "COMPLIANT",
  reach: "COMPLIANT",
  counterfeitRisk: 1,
  priceTrendPct: 0,
  spend: 100,
  toBuy: 0,
  risk: risk(90, "green"),
  ...o,
});

describe("deepAnalysis", () => {
  const A = line({ ours: 500, spend: 50 });
  const B = line({ ours: 20, suppliers: 5000, sources: 1, toBuy: 300, spend: 400, risk: risk(55, "amber", "Sources") });
  const C = line({ suppliers: 10, market: 400, counterfeitRisk: 5, toBuy: 900, spend: 1200, risk: risk(45, "amber", "Counterfeit") });
  const D = line({ ours: 5, leadWeeks: 20, lifecycle: "EOL", toBuy: 2000, spend: 2500, risk: risk(15, "red", "Lifecycle") });
  const E = line({ partId: null, mpn: null, refDes: "U9", risk: null, toBuy: 0, spend: 0 });
  const F = line({ dnp: true, spend: 999 });
  const G = line({ ours: 1000, rohs: "UNKNOWN", priceTrendPct: 15, spend: 150 });
  const r = deepAnalysis([A, B, C, D, E, F, G], { box: { ok: false, text: "C25 hits the lid by 7.1 mm" }, kitGaps: ["Rubber feet ×4", "Product label"] });

  it("counts lines that need parts, leaving DNP out", () => {
    expect(r.counted).toBe(6);
    expect(r.matched).toBe(5);
    expect(r.distribution).toEqual({ green: 2, amber: 2, red: 1, grey: 1 });
  });

  it("finds the first sourcing tier that covers each line", () => {
    expect(r.coverage).toEqual({ ours: 2, partners: 0, suppliers: 1, market: 1, none: 1, unmatched: 1 });
    expect(r.longestLead).toEqual({ weeks: 20, label: `${D.mpn} (${D.refDes})` });
  });

  it("puts blockers first, most money at stake first", () => {
    expect(r.actions.map((a) => [a.key, a.level])).toEqual([
      ["eol", "red"],
      ["uncoverable", "red"],
      ["match", "red"],
      ["box-fit", "red"],
      ["long-lead", "amber"],
      ["counterfeit", "amber"],
      ["single-source", "amber"],
      ["declarations", "amber"],
      ["rising", "amber"],
      ["kit", "amber"],
    ]);
    expect(r.actions.find((a) => a.key === "match")?.lines[0].label).toBe("unmatched (U9)");
    expect(r.verdict).toMatchObject({ level: "red", title: "Not ready to build" });
    expect(r.verdict.detail).toContain("4 blockers");
  });

  it("ranks the riskiest lines by their weakest factor", () => {
    expect(r.topRisks.map((t) => t.line.lineId)).toEqual([D.lineId, C.lineId, B.lineId, A.lineId, G.lineId]);
    expect(r.topRisks[0].factor.label).toBe("Lifecycle");
  });

  it("shows where the money goes", () => {
    expect(r.spendTotal).toBe(4300);
    expect(r.toBuyTotal).toBe(3200);
    expect(r.pareto[0]).toMatchObject({ lineId: D.lineId, value: 2500 });
    expect(r.pareto.at(-1)?.cumulative).toBeCloseTo(1);
    expect(r.pareto.some((p) => p.lineId === F.lineId)).toBe(false);
  });

  it("calls a clean BoM ready", () => {
    const clean = deepAnalysis([line({ ours: 100 }), line({ ours: 50, suppliers: 500 })]);
    expect(clean.verdict.level).toBe("green");
    expect(clean.actions).toEqual([]);
  });
});
