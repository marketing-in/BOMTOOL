import { describe, expect, it } from "vitest";
import { analysePartRisk, type PartRiskInput } from "@/lib/part-risk";

const base: PartRiskInput = {
  lifecycle: "ACTIVE",
  introducedYear: 2016,
  counterfeitRisk: 1,
  rohs: "COMPLIANT",
  reach: "COMPLIANT",
  ownQty: 5000,
  marketplaceQty: 0,
  authorisedStock: 500_000,
  authorisedSources: 5,
  leadWeeks: 6,
  alternates: 2,
  priceTrendPct: 0.5,
  need: 1000,
  nowYear: 2026.8,
};

describe("part risk analysis", () => {
  it("rates an active, well-stocked, compliant part as low risk", () => {
    const r = analysePartRisk(base);
    expect(r.level).toBe("green");
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.summary).toMatch(/^Low risk/);
  });

  it("never averages away an obsolete part", () => {
    const r = analysePartRisk({ ...base, lifecycle: "OBSOLETE" });
    expect(r.level).not.toBe("green");
    expect(r.score).toBeLessThanOrEqual(45);
    expect(r.factors[0]).toMatchObject({ key: "lifecycle", level: "red" });
    expect(r.factors[0].action).toMatch(/alternate/);
  });

  it("flags single-source and short supply with an action", () => {
    const single = analysePartRisk({ ...base, authorisedSources: 1, authorisedStock: 3000, ownQty: 0 }).factors.find((f) => f.key === "supply")!;
    expect(single.action).toMatch(/second source/);
    const short = analysePartRisk({ ...base, authorisedSources: 1, authorisedStock: 200, ownQty: 100 }).factors.find((f) => f.key === "supply")!;
    expect(short.level).toBe("red");
    expect(short.action).toMatch(/Single source|Short/);
  });

  it("treats marketplace-only stock as a counterfeit exposure", () => {
    const r = analysePartRisk({ ...base, authorisedStock: 0, authorisedSources: 0, ownQty: 0, marketplaceQty: 4000, counterfeitRisk: 3 });
    const c = r.factors.find((f) => f.key === "counterfeit")!;
    expect(c.score).toBeLessThanOrEqual(30);
    expect(c.action).toMatch(/CoC/);
    expect(r.factors.find((f) => f.key === "supply")!.reason).toMatch(/Only marketplace stock/);
  });

  it("scores lead time, price trend and compliance", () => {
    const r = analysePartRisk({ ...base, leadWeeks: 40, priceTrendPct: 18, reach: "CONTAINS_SVHC" });
    const by = Object.fromEntries(r.factors.map((f) => [f.key, f]));
    expect(by.leadTime.level).toBe("red");
    expect(by.price.reason).toMatch(/rising \(\+18\.0%\)/);
    expect(by.compliance.reason).toMatch(/REACH SVHC/);
    expect(analysePartRisk({ ...base, rohs: "NON_COMPLIANT" }).factors[0].key).toBe("compliance");
  });

  it("lists the weakest factors first", () => {
    const r = analysePartRisk({ ...base, alternates: 0, lifecycle: "NRND" });
    const scores = r.factors.map((f) => f.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });
});
