import { describe, expect, it } from "vitest";
import { convert, formatMoney, formatMoneyCompact, priceAtQty, MOCK_FX } from "@/lib/currency";
import { buildAliasIndex, normaliseManufacturerKey, normaliseMpn, resolveManufacturer } from "@/lib/normalise";
import { parseSiValue } from "@/lib/units";
import { countRefDes, expandRefDes } from "@/lib/refdes";
import { scoreToRisk, LIFECYCLE_RISK } from "@/lib/risk";
import { bestOffer } from "@/lib/pricing";
import { can } from "@/lib/rbac";

describe("currency", () => {
  it("converts through INR base", () => {
    expect(convert(1, "USD", "INR")).toBeCloseTo(MOCK_FX.rates.USD);
    expect(convert(MOCK_FX.rates.EUR, "INR", "EUR")).toBeCloseTo(1);
    expect(convert(10, "USD", "USD")).toBe(10);
  });
  it("throws on unknown currency", () => {
    expect(() => convert(1, "XYZ", "INR")).toThrow();
  });
  it("keeps sub-unit precision for passives", () => {
    expect(formatMoney(0.0012, "USD", { unit: true })).toBe("$0.0012");
    expect(formatMoney(1234.5, "INR")).toBe("₹1,234.5");
  });
  it("formats lakh / crore", () => {
    expect(formatMoneyCompact(1_250_000, "INR")).toBe("₹12.50L");
    expect(formatMoneyCompact(32_000_000, "INR")).toBe("₹3.20Cr");
  });
  it("picks the highest price break at or below qty", () => {
    const breaks = [{ qty: 1, price: 1 }, { qty: 100, price: 0.8 }, { qty: 1000, price: 0.5 }];
    expect(priceAtQty(breaks, 1)).toBe(1);
    expect(priceAtQty(breaks, 99)).toBe(1);
    expect(priceAtQty(breaks, 100)).toBe(0.8);
    expect(priceAtQty(breaks, 50_000)).toBe(0.5);
    expect(priceAtQty([], 10)).toBeNull();
  });
});

describe("normalisation", () => {
  it("normalises MPNs to a matching key", () => {
    expect(normaliseMpn(" grm188r71h104ka93d ")).toBe("GRM188R71H104KA93D");
    expect(normaliseMpn("RC0603FR-0710KL")).toBe("RC0603FR0710KL");
    expect(normaliseMpn("296-1395-1-ND")).toBe("29613951");
    expect(normaliseMpn("TJA1051T/3,118")).toBe("TJA1051T3118");
  });
  it("strips legal suffixes and diacritics from manufacturer names", () => {
    expect(normaliseManufacturerKey("Texas Instruments Inc.")).toBe("TEXASINSTRUMENTS");
    expect(normaliseManufacturerKey("Würth Elektronik")).toBe("WURTHELEKTRONIK");
    expect(normaliseManufacturerKey("ON Semiconductor")).toBe("ON");
  });
  it("resolves aliases to canonical names", () => {
    const index = buildAliasIndex([
      { name: "Texas Instruments", aliases: ["TI", "Burr-Brown"] },
      { name: "onsemi", aliases: ["ON Semiconductor", "Fairchild"] },
    ]);
    expect(resolveManufacturer("TI", index)).toBe("Texas Instruments");
    expect(resolveManufacturer("texas instruments inc", index)).toBe("Texas Instruments");
    expect(resolveManufacturer("ON Semi", index)).toBe("onsemi");
    expect(resolveManufacturer("Acme Parts Ltd", index)).toBeNull();
    expect(resolveManufacturer("ON Semiconductor", index)).toBe("onsemi");
    expect(resolveManufacturer(undefined, index)).toBeNull();
  });
});

describe("parseSiValue", () => {
  it.each([
    ["10k", 10_000],
    ["4K7", 4_700],
    ["0R1", 0.1],
    ["100nF", 1e-7],
    ["4.7 µF", 4.7e-6],
    ["4.7uF", 4.7e-6],
    ["22 pF", 22e-12],
    ["25V", 25],
    ["10 mΩ", 0.01],
    ["72 MHz", 72e6],
    ["1%", 1],
    ["1.27 mm", 0.00127],
    ["5 m", 5],
  ])("%s → %d", (input, expected) => {
    expect(parseSiValue(input)).toBeCloseTo(expected, 12);
  });
  it("returns null for non-numeric text", () => {
    expect(parseSiValue("X7R")).toBeNull();
    expect(parseSiValue("")).toBeNull();
  });
});

describe("refdes", () => {
  it("expands ranges and lists", () => {
    expect(expandRefDes("C1-C4, C7")).toEqual(["C1", "C2", "C3", "C4", "C7"]);
    expect(expandRefDes("R1-4")).toEqual(["R1", "R2", "R3", "R4"]);
    expect(expandRefDes("U1 U2;U3")).toEqual(["U1", "U2", "U3"]);
    expect(countRefDes("LED1, LED2")).toBe(2);
    expect(countRefDes(null)).toBe(0);
  });
  it("keeps unrecognised tokens", () => {
    expect(expandRefDes("C5-R9")).toEqual(["C5-R9"]);
  });
});

describe("risk & pricing", () => {
  it("maps scores to traffic lights", () => {
    expect(scoreToRisk(85)).toBe("green");
    expect(scoreToRisk(55)).toBe("amber");
    expect(scoreToRisk(10)).toBe("red");
    expect(scoreToRisk(null)).toBe("grey");
    expect(LIFECYCLE_RISK.OBSOLETE).toBe("red");
  });
  it("prefers an in-stock offer over a cheaper out-of-stock one", () => {
    const offers = [
      { supplierId: "a", currency: "USD", stock: 0, moq: 1, priceBreaks: [{ qty: 1, price: 0.1 }] },
      { supplierId: "b", currency: "INR", stock: 5000, moq: 1, priceBreaks: [{ qty: 1, price: 20 }] },
    ];
    const best = bestOffer(offers, 1000, "INR");
    expect(best?.offer.supplierId).toBe("b");
    expect(best?.unit).toBe(20);
  });
  it("applies MOQ before choosing a price break", () => {
    const offers = [{ supplierId: "a", currency: "USD", stock: 10_000, moq: 1000, priceBreaks: [{ qty: 1, price: 1 }, { qty: 1000, price: 0.5 }] }];
    expect(bestOffer(offers, 10, "USD")?.unit).toBe(0.5);
  });
});

describe("rbac", () => {
  it("grants by role", () => {
    expect(can("ADMIN", "admin.users")).toBe(true);
    expect(can("PURCHASING", "rfq.send")).toBe(true);
    expect(can("VIEWER", "bom.write")).toBe(false);
    expect(can(undefined, "bom.write")).toBe(false);
  });
});

describe("maker names as customers' BoMs write them", () => {
  const idx = buildAliasIndex([
    { name: "Murata Manufacturing", aliases: ["Murata", "Murata Electronics"] },
    { name: "Littelfuse", aliases: ["Littelfuse Inc"] },
    { name: "onsemi", aliases: ["ON Semiconductor", "Fairchild"] },
    { name: "Vishay", aliases: ["Vishay Dale"] },
    { name: "Molex", aliases: [] },
    { name: "Mouser Electronics", aliases: [] },
  ]);
  it("reads past region, division and short-form words", () => {
    expect(resolveManufacturer("Murata Electronics North America", idx)).toBe("Murata Manufacturing");
    expect(resolveManufacturer("Fairchild Semi", idx)).toBe("onsemi");
    expect(resolveManufacturer("Vishay/Dale", idx)).toBe("Vishay");
  });
  it("forgives one typing slip in a long name, never in a short one or between two makers", () => {
    expect(resolveManufacturer("Littlefuse", idx)).toBe("Littelfuse");
    expect(resolveManufacturer("Littelfuze", idx)).toBe("Littelfuse");
    expect(resolveManufacturer("Molax", idx)).toBeNull();
    expect(resolveManufacturer("Constantine Technologies", idx)).toBeNull();
  });
});

