import { describe, expect, it } from "vitest";
import { DEFAULT_RATES } from "@/data/costing";
import { estimatePcb, finishFactor, technologyFactor } from "@/lib/costing/pcb";
import { processCosts, type ProcessStepIn } from "@/lib/costing/process";
import { customBoxSpec, estimateCustomBox, machiningCost } from "@/lib/costing/box";
import { defaultQuantities, niceQty, parseQuantities, quoteForQty, readRates } from "@/lib/costing/quote";
import { componentsCost } from "@/lib/costing/components";
import { ENCLOSURES, boardFits } from "@/lib/board/enclosures";

const gw = { widthMm: 100, heightMm: 80, layers: 4, thicknessMm: 1.6, finish: "ENIG", material: "FR-4 Tg150" };

describe("bare-board estimate", () => {
  it("costs more per board in small lots and never less than the minimum lot", () => {
    const ten = estimatePcb(gw, 10);
    const thousand = estimatePcb(gw, 1000);
    expect(ten.unit).toBeGreaterThan(thousand.unit * 2);
    expect(ten.minLot).toBe(true);
    expect(ten.unit * 10).toBeGreaterThanOrEqual(1500 + 400 * 4 - 0.01);
    expect(thousand.minLot).toBe(false);
    // Still a little cheaper at production volumes, not flat after the first square metre.
    expect(estimatePcb(gw, 5000).unit).toBeLessThan(thousand.unit * 0.97);
  });

  it("prices a 4-layer 100 × 80 board at volume in a plausible range", () => {
    const e = estimatePcb(gw, 500);
    expect(e.technology).toBe("fr4-4l");
    expect(e.unit).toBeGreaterThan(50);
    expect(e.unit).toBeLessThan(200);
    expect(e.tooling).toBeGreaterThan(2000);
  });

  it("charges for more layers, ENIG over HASL, heavy copper and class 3", () => {
    const base = estimatePcb({ ...gw, layers: 2, finish: "HASL-LF" }, 1000).unit;
    expect(estimatePcb({ ...gw, layers: 4, finish: "HASL-LF" }, 1000).unit).toBeGreaterThan(base);
    expect(estimatePcb({ ...gw, layers: 2, finish: "ENIG" }, 1000).unit).toBeGreaterThan(base);
    expect(estimatePcb({ ...gw, layers: 2, finish: "HASL-LF", copperOz: 3 }, 1000).unit).toBeGreaterThan(base);
    expect(estimatePcb({ ...gw, layers: 2, finish: "HASL-LF", ipcClass: 3 }, 1000).unit).toBeGreaterThan(base);
    expect(finishFactor("OSP")).toBeLessThan(1);
    expect(technologyFactor({ ...gw, layers: 8 }).factor).toBeGreaterThan(technologyFactor({ ...gw, layers: 6 }).factor);
    expect(technologyFactor({ ...gw, layers: 6, material: "FR-4 Tg170" }).factor).toBeGreaterThan(technologyFactor({ ...gw, layers: 6 }).factor);
  });

  it("applies the fab's price level", () => {
    expect(estimatePcb(gw, 500, { factor: 0.5 }).unit).toBeCloseTo(estimatePcb(gw, 500).unit * 0.5, 1);
  });
});

const steps: ProcessStepIn[] = [
  { key: "fab", stage: "fab", title: "Bare board", side: null, refs: 0, line: null },
  { key: "kitting", stage: "prep", title: "Kitting", side: null, refs: 0, line: null },
  { key: "print-top", stage: "smt", title: "Paste", side: "TOP", refs: 120, line: "L1" },
  { key: "place-top", stage: "smt", title: "Pick and place", side: "TOP", refs: 120, line: "L1" },
  { key: "xray-top", stage: "smt", title: "X-ray", side: "TOP", refs: 2, line: "L1" },
  { key: "insert", stage: "tht", title: "THT", side: null, refs: 4, line: null },
  { key: "fct", stage: "test", title: "Test", side: null, refs: 0, line: null },
  { key: "assemble", stage: "box", title: "Box build", side: null, refs: 0, line: null },
  { key: "pack", stage: "ship", title: "Pack", side: null, refs: 0, line: null },
];

describe("conversion cost from the process route", () => {
  const p = processCosts(steps, [{ code: "L1", capacityCph: 78_000 }], DEFAULT_RATES);
  it("times SMT from the line's cph and never below the shortest cycle", () => {
    const place = p.steps.find((s) => s.key === "place-top")!;
    expect(place.seconds).toBe(DEFAULT_RATES.smtMinCycleSec);
    expect(place.perBoard).toBeCloseTo((20 / 3600) * DEFAULT_RATES.smtLinePerHour, 5);
    expect(place.perLot).toBe(DEFAULT_RATES.smtSetupHoursPerSide * DEFAULT_RATES.smtLinePerHour);
    const slow = processCosts(steps, [{ code: "L1", capacityCph: 5_000 }], DEFAULT_RATES).steps.find((s) => s.key === "place-top")!;
    expect(slow.seconds).toBeGreaterThan(200);
  });
  it("prices per part, per board and per unit, and lists the NRE", () => {
    expect(p.steps.find((s) => s.key === "insert")!.perBoard).toBe(4 * DEFAULT_RATES.thtPerPart);
    expect(p.steps.find((s) => s.key === "print-top")!.perBoard).toBe(0);
    expect(p.steps.find((s) => s.key === "assemble")!.perBoard).toBe(DEFAULT_RATES.boxBuildMinutes * DEFAULT_RATES.labourPerMinute);
    expect(p.nre.map((n) => n.key)).toEqual(["stencil", "programming", "first-article", "fixture"]);
  });
});

describe("box made to fit", () => {
  it("holds the board with clearance and the tallest part under the lid", () => {
    const spec = customBoxSpec("sheet-metal", { w: 100, h: 80, thickness: 1.6 }, 12);
    expect(boardFits(spec, 100, 80).fits).toBe(true);
    expect(spec.height).toBeGreaterThan(12 + 1.6 + 6);
    expect(spec.style).toBe("sheet-metal");
  });
  it("puts moulded tooling up front and gets cheaper with volume", () => {
    const spec = customBoxSpec("moulded", { w: 100, h: 80, thickness: 1.6 }, 10);
    const small = estimateCustomBox("moulded", spec, 50);
    const big = estimateCustomBox("moulded", spec, 5000);
    expect(small.nre).toBeGreaterThan(100_000);
    expect(big.unit).toBeLessThan(small.unit);
    expect(machiningCost(3)).toEqual({ perUnit: 105, nre: 2500 });
    expect(machiningCost(0)).toEqual({ perUnit: 0, nre: 0 });
  });
  it("keeps the catalogue boxes consistent", () => {
    for (const e of Object.values(ENCLOSURES)) {
      expect(e.length).toBeGreaterThan(e.width);
      expect(e.wall * 2).toBeLessThan(e.width);
    }
    expect(boardFits(ENCLOSURES["1455N1601"], 100, 80).fits).toBe(true);
    expect(boardFits(ENCLOSURES["1590A"], 100, 80).fits).toBe(false);
  });
});

describe("quote per quantity", () => {
  const process = processCosts(steps, [{ code: "L1", capacityCph: 78_000 }], DEFAULT_RATES);
  const input = (qty: number) => ({
    qty,
    board: { unit: 120, nre: 4600 },
    components: { perBoard: 900, moqExcess: 5000, unpriced: 0 },
    box: { unit: 1800, nre: 0, machiningPerUnit: 70, machiningNre: 2500 },
  });
  it("adds material, conversion, handling and margin per board; NRE once; GST on both", () => {
    const q = quoteForQty(input(500), process, DEFAULT_RATES);
    expect(q.material).toBeCloseTo(120 + 900 + 5000 / 500 + 1800 + 70, 5);
    const handling = q.material * 0.05;
    expect(q.unitPrice).toBeCloseTo((q.material + handling + q.conversion) * 1.12, 5);
    expect(q.lotPrice).toBeCloseTo(q.unitPrice * 500, 5);
    expect(q.nre.map((n) => n.key)).toEqual(["pcb-tooling", "box-cnc", "stencil", "programming", "first-article", "fixture"]);
    expect(q.gst).toBeCloseTo((q.lotPrice + q.nreTotal) * 0.18, 5);
    expect(q.total).toBeCloseTo(q.lotPrice + q.nreTotal + q.gst, 5);
    expect(Object.values(q.byGroup).reduce((s, x) => s + x, 0)).toBeCloseTo(q.unitPrice, 5);
  });
  it("spreads set-up over the lot, so bigger lots cost less per board", () => {
    expect(quoteForQty(input(1000), process, DEFAULT_RATES).unitPrice).toBeLessThan(quoteForQty(input(100), process, DEFAULT_RATES).unitPrice);
  });
  it("leaves MOQ left-overs out when the customer isn't charged for them", () => {
    const q = quoteForQty(input(500), process, { ...DEFAULT_RATES, chargeMoqExcess: false });
    expect(q.rows.some((r) => r.key === "moq")).toBe(false);
  });
});

describe("components cost of one build", () => {
  const base = { id: "L1", dnp: false, matched: true, excluded: false, required: 1000, shortfall: 0, marketUnit: 2 };
  it("charges our stock at book cost, consigned stock nothing, bought parts landed, and keeps MOQ left-overs apart", () => {
    const c = componentsCost(
      [
        {
          ...base,
          allocations: [
            { tier: 1, kind: "INTERNAL_STOCK", qty: 300, orderQty: 0, unit: 1, landedUnit: 1 },
            { tier: 2, kind: "CONSIGNED", qty: 200, orderQty: 0, unit: 1.5, landedUnit: 1.5 },
            { tier: 4, kind: "AUTHORISED", qty: 500, orderQty: 600, unit: 1.8, landedUnit: 2.1 },
          ],
        },
      ],
      100,
    );
    const l = c.byLine.get("L1")!;
    expect(l.cost).toBeCloseTo(300 * 1 + 0 + 500 * 2.1, 6);
    expect(l.moqExcess).toBeCloseTo(100 * 2.1, 6);
    expect(c.perBoard).toBeCloseTo(l.cost / 100, 6);
    expect(l.mainTier).toBe(4);
  });
  it("values stock without a book cost, listings without an asking price and a shortfall at the market price", () => {
    const l = componentsCost(
      [
        {
          ...base,
          shortfall: 300,
          allocations: [
            { tier: 1, kind: "INTERNAL_STOCK", qty: 600, orderQty: 0, unit: null, landedUnit: null },
            { tier: 3, kind: "CHANNEL_PARTNER", qty: 100, orderQty: 100, unit: null, landedUnit: null },
          ],
        },
      ],
      100,
    ).byLine.get("L1")!;
    expect(l.cost).toBeCloseTo(600 * 2 + 100 * 2 + 300 * 2, 6);
    expect(l.priced).toBe(true);
  });
  it("flags lines with no price and leaves out DNP and lines priced in another step", () => {
    const c = componentsCost(
      [
        { ...base, id: "a", matched: false, allocations: [] },
        { ...base, id: "b", marketUnit: null, shortfall: 1000, allocations: [] },
        { ...base, id: "c", dnp: true, allocations: [] },
        { ...base, id: "d", excluded: true, allocations: [{ tier: 4, kind: "AUTHORISED", qty: 1000, orderQty: 1000, unit: 9, landedUnit: 9 }] },
      ],
      100,
    );
    expect(c.unpriced).toBe(2);
    expect(c.perBoard).toBe(0);
  });
});

describe("quantities and rates", () => {
  it("rounds to the quantities people ask for", () => {
    expect([1, 7, 12, 240, 600, 1000, 2400].map(niceQty)).toEqual([1, 5, 10, 250, 500, 1000, 2500]);
    expect(defaultQuantities(500)).toEqual([500, 1000, 2500]);
    expect(defaultQuantities(120)).toEqual([120, 250, 500]);
  });
  it("parses typed quantities", () => {
    expect(parseQuantities("100, 500 1k; 1k, -3, x")).toEqual([100, 500, 1000]);
    expect(parseQuantities("1 2 3 4 5")).toEqual([1, 2, 3, 4]);
  });
  it("keeps sane stored rates and falls back on the rest", () => {
    const r = readRates({ marginPct: 20, smtEfficiency: 7, testPerBoard: -5, nre: { testFixture: 0 }, chargeMoqExcess: false }, DEFAULT_RATES);
    expect(r.marginPct).toBe(20);
    expect(r.smtEfficiency).toBe(1);
    expect(r.testPerBoard).toBe(DEFAULT_RATES.testPerBoard);
    expect(r.nre.testFixture).toBe(0);
    expect(r.nre.stencilPerSide).toBe(DEFAULT_RATES.nre.stencilPerSide);
    expect(r.chargeMoqExcess).toBe(false);
  });
});
