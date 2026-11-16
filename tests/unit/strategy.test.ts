import { describe, expect, it } from "vitest";
import { compareSources, compareStrategies, fill, isStrategy, RISK_BAND, sourceRisk, type Candidate, type StrategyLine } from "@/lib/costing/strategy";

const c = (over: Partial<Candidate>): Candidate => ({ tier: 4, kind: "AUTHORISED", source: "DigiKey", available: 10_000, unit: 10, leadWeeks: 1, coc: true, condition: "NEW_FACTORY_SEALED", offerId: "o1", excessListingId: null, ...over });

const stores = c({ tier: 1, kind: "INTERNAL_STOCK", source: "Our stores", available: 300, unit: 12, leadWeeks: 0, offerId: null });
const digikey = c({ source: "DigiKey", unit: 10, leadWeeks: 1, offerId: "dk" });
const mouser = c({ source: "Mouser", unit: 9.5, leadWeeks: 3, offerId: "mo" });
const partner = c({ tier: 3, kind: "PARTNER_EXCESS", source: "Partner EMS", unit: 6, leadWeeks: 1, coc: false, condition: "NEW_OPEN_REEL", offerId: null, excessListingId: "ex" });
const broker = c({ tier: 5, kind: "BROKER", source: "Broker X", unit: 4, leadWeeks: 2, coc: false, offerId: "br" });
const all = [stores, digikey, mouser, partner, broker];
const order = (key: Parameters<typeof compareSources>[0], cs = all) => [...cs].sort(compareSources(key)).map((x) => x.source);

describe("how risky a source is", () => {
  it("ranks our shelf, authorised sellers, partner stock and brokers", () => {
    expect(sourceRisk(stores)).toBe(0);
    expect(sourceRisk(digikey)).toBe(1);
    expect(sourceRisk(c({ coc: false }))).toBe(1.5);
    expect(sourceRisk(partner)).toBe(4);
    expect(sourceRisk(c({ tier: 3, kind: "CHANNEL_PARTNER" }))).toBe(2);
    expect(sourceRisk(broker)).toBe(5);
    expect([0, 1.5, 4, 5].map(RISK_BAND)).toEqual(["ours", "authorised", "open", "broker"]);
    expect([isStrategy("price"), isStrategy("order"), isStrategy(undefined)]).toEqual([true, false, false]);
  });
});

describe("the order a line is filled in", () => {
  it("our order goes by tier, then price", () => {
    expect(order("order")).toEqual(["Our stores", "Partner EMS", "Mouser", "DigiKey", "Broker X"]);
  });

  it("lowest price goes by landed price alone", () => {
    expect(order("price")).toEqual(["Broker X", "Partner EMS", "Mouser", "DigiKey", "Our stores"]);
  });

  it("shortest lead takes the shelf, then the fastest seller, safer first among equals", () => {
    expect(order("lead")).toEqual(["Our stores", "DigiKey", "Partner EMS", "Broker X", "Mouser"]);
    // A seller with the whole need in stock is as fast as our shelf; ours still goes first.
    expect(order("lead", [c({ source: "In stock", leadWeeks: 0, unit: 1 }), stores])).toEqual(["Our stores", "In stock"]);
    expect(order("lead", [c({ leadWeeks: null, source: "Unknown lead" }), mouser])).toEqual(["Mouser", "Unknown lead"]);
  });

  it("lowest risk takes our stock, authorised sellers, partner stock, and brokers last", () => {
    expect(order("risk")).toEqual(["Our stores", "DigiKey", "Mouser", "Partner EMS", "Broker X"]);
  });
});

describe("filling one line", () => {
  it("takes from the top of the order until the need is covered", () => {
    const f = fill("order", { required: 1000, candidates: all });
    expect(f.used.map((u) => [u.c.source, u.qty])).toEqual([["Our stores", 300], ["Partner EMS", 700]]);
    expect(f.cost).toBe(300 * 12 + 700 * 6);
    expect(f.short).toBe(0);
    expect(fill("price", { required: 1000, candidates: all }).used.map((u) => u.c.source)).toEqual(["Broker X"]);
  });

  it("leaves out sources with no price or no stock, and says what is still short", () => {
    const f = fill("price", { required: 500, candidates: [c({ unit: null }), c({ available: 0, unit: 1 }), c({ source: "Small", available: 100, unit: 2 })] });
    expect(f.used.map((u) => u.c.source)).toEqual(["Small"]);
    expect(f.short).toBe(400);
    expect(fill("lead", { required: 10, candidates: [] })).toEqual({ used: [], short: 10, cost: 0 });
  });
});

describe("comparing the strategies over a BoM", () => {
  const lines: StrategyLine[] = [
    { id: "l1", label: "U1 MCU", required: 100, candidates: [stores, digikey, broker], current: { tier: 1, offerId: null, excessListingId: null } },
    { id: "l2", label: "R1 10k", required: 1000, candidates: [stores, digikey, mouser], current: { tier: 4, offerId: "mo", excessListingId: null } },
    { id: "l3", label: "X9 custom", required: 100, candidates: [], current: null },
  ];
  const [ours, price, lead, risk] = compareStrategies(lines, 100);

  it("returns our order first, then price, lead and risk", () => {
    expect([ours.key, price.key, lead.key, risk.key]).toEqual(["order", "price", "lead", "risk"]);
  });

  it("adds up the cost a board from how each line is filled", () => {
    // Our order: U1 from stores (100 × 12); R1 300 from stores, 700 from Mouser.
    expect(ours.perBoard).toBeCloseTo((100 * 12 + 300 * 12 + 700 * 9.5) / 100, 6);
    // Lowest price: U1 from the broker, R1 from Mouser.
    expect(price.perBoard).toBeCloseTo((100 * 4 + 1000 * 9.5) / 100, 6);
    expect(price.perBoard).toBeLessThan(ours.perBoard);
    expect(price.perBoard).toBeLessThanOrEqual(Math.min(lead.perBoard, risk.perBoard));
  });

  it("takes the slowest source used as the wait", () => {
    expect(price.leadWeeks).toBe(3);
    expect(price.slowest).toEqual({ label: "R1 10k", source: "Mouser" });
    // Shortest lead: stores, then DigiKey at one week rather than Mouser at three.
    expect(lead.leadWeeks).toBe(1);
    expect(lead.leadWeeks).toBeLessThanOrEqual(Math.min(ours.leadWeeks, price.leadWeeks, risk.leadWeeks));
  });

  it("counts where lines come from, split lines, short lines and what would change", () => {
    expect(price.mix).toEqual({ ours: 0, authorised: 1, open: 0, broker: 1 });
    expect(risk.mix).toEqual({ ours: 1, authorised: 1, open: 0, broker: 0 });
    expect(risk.mix.broker).toBe(0);
    expect(ours.split).toBe(1);
    expect(price.split).toBe(0);
    // X9 has nowhere to buy under any strategy.
    expect([ours.short, price.short, lead.short, risk.short]).toEqual([1, 1, 1, 1]);
    expect(ours.changes).toBe(0);
    expect(price.changes).toBe(1);
    expect(lead.changes).toBe(1);
    expect(compareStrategies([], 100).map((s) => s.perBoard)).toEqual([0, 0, 0, 0]);
  });
});
