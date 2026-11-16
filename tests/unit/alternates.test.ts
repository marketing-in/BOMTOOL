import { describe, expect, it } from "vitest";
import { assessAlternate, compareParam, numbersIn, rankAlternates, type AltPart, type ParamValue } from "@/lib/alternates";

const v = (name: string, text: string, num: number | null = null): ParamValue => ({ name, text, num });

function part(over: Partial<AltPart> & { id: string }): AltPart {
  return {
    mpn: over.id.toUpperCase(),
    manufacturerId: "murata",
    manufacturer: "Murata",
    categorySlug: "mlcc",
    packageId: "0603",
    packageName: "0603",
    lifecycle: "ACTIVE",
    params: {},
    stock: 10_000,
    unit: 0.01,
    ...over,
  };
}

const cap = (voltage: number, dielectric = "X7R", capacitance = 1e-7) => ({
  capacitance: v("Capacitance", `${capacitance * 1e9} nF`, capacitance),
  voltage: v("Rated voltage", `${voltage} V`, voltage),
  dielectric: v("Dielectric", dielectric),
  tolerance: v("Tolerance", "10 %", 10),
});

describe("parameter comparison", () => {
  it("reads ranges without mistaking a dash for a minus sign", () => {
    expect(numbersIn("1.8-5.5 V")).toEqual([1.8, 5.5]);
    expect(numbersIn("3.0–3.6 V")).toEqual([3, 3.6]);
    expect(numbersIn("-40 to 125 °C")).toEqual([-40, 125]);
    expect(numbersIn("−40 … +85 °C")).toEqual([-40, 85]);
  });

  it("applies equal / higher-is-fine / lower-is-fine rules", () => {
    expect(compareParam("capacitance", v("C", "100 nF", 1e-7), v("C", "0.1 µF", 1e-7)).outcome).toBe("same");
    expect(compareParam("capacitance", v("C", "100 nF", 1e-7), v("C", "220 nF", 2.2e-7)).outcome).toBe("differs");
    expect(compareParam("voltage", v("V", "25 V", 25), v("V", "50 V", 50)).outcome).toBe("better");
    expect(compareParam("voltage", v("V", "25 V", 25), v("V", "16 V", 16)).outcome).toBe("worse");
    expect(compareParam("tolerance", v("T", "5 %", 5), v("T", "1 %", 1)).outcome).toBe("better");
    expect(compareParam("rds_on", v("R", "20 mΩ", 0.02), v("R", "35 mΩ", 0.035)).outcome).toBe("worse");
  });

  it("ranks dielectrics, treating C0G and NP0 as one class", () => {
    expect(compareParam("dielectric", v("D", "X7R"), v("D", "C0G")).outcome).toBe("better");
    expect(compareParam("dielectric", v("D", "X7R"), v("D", "X5R")).outcome).toBe("worse");
    expect(compareParam("dielectric", v("D", "C0G"), v("D", "NP0")).outcome).toBe("same");
  });

  it("needs the candidate's supply range to cover the original's", () => {
    expect(compareParam("supply", v("S", "3.0–3.6 V"), v("S", "1.8–5.5 V")).outcome).toBe("better");
    expect(compareParam("supply", v("S", "1.8–5.5 V"), v("S", "3.0–3.6 V")).outcome).toBe("worse");
    expect(compareParam("supply", v("S", "3.3 V"), v("S", "3.0–3.6 V")).outcome).toBe("better");
  });

  it("marks missing values unknown and informational ones as info", () => {
    expect(compareParam("esr", v("ESR", "50 mΩ", 0.05), undefined).outcome).toBe("unknown");
    expect(compareParam("lifetime", v("L", "2000 h @ 105 °C"), v("L", "1000 h @ 85 °C")).outcome).toBe("info");
  });
});

describe("assessing a candidate", () => {
  const original = part({ id: "a", params: cap(25) });

  it("same package and values in a standard-footprint family is a drop-in", () => {
    const r = assessAlternate(original, part({ id: "b", manufacturerId: "samsung", params: cap(25) }));
    expect(r).toMatchObject({ ok: true, type: "DROP_IN", confidence: 95 });
  });

  it("better ratings in the same package are pin-to-pin, another package is functional", () => {
    expect(assessAlternate(original, part({ id: "b", params: cap(50) })).type).toBe("PIN_TO_PIN");
    expect(assessAlternate(original, part({ id: "c", params: cap(25), packageId: "0805", packageName: "0805" })).type).toBe("FUNCTIONAL");
  });

  it("rejects a worse dielectric, a lower rating or another category", () => {
    expect(assessAlternate(original, part({ id: "b", params: cap(25, "X5R") })).ok).toBe(false);
    expect(assessAlternate(original, part({ id: "c", params: cap(16) })).ok).toBe(false);
    expect(assessAlternate(original, part({ id: "d", params: cap(25), categorySlug: "tantalum-cap" })).ok).toBe(false);
  });

  it("never calls an IC with the same package more than pin-to-pin, and asks for a pin-out check", () => {
    const ldo = (vout: number) => ({ topology: v("Topology", "LDO"), vout: v("Output voltage", `${vout} V`, vout), iout: v("Output current", "1 A", 1) });
    const a = part({ id: "ams1117", categorySlug: "power-ic", packageId: "sot223", packageName: "SOT-223", params: ldo(3.3) });
    const r = assessAlternate(a, part({ id: "lm1117", categorySlug: "power-ic", packageId: "sot223", packageName: "SOT-223", params: ldo(3.3) }));
    expect(r.type).toBe("PIN_TO_PIN");
    expect(r.summary).toMatch(/pin-outs vary/);
    expect(assessAlternate(a, part({ id: "x", categorySlug: "power-ic", packageId: "sot223", params: ldo(5) })).ok).toBe(false);
  });

  it("lowers confidence for every parameter the candidate does not list", () => {
    const { capacitance, voltage, dielectric } = cap(25);
    const partial = part({ id: "b", params: { capacitance, voltage, dielectric } });
    // Not provably identical any more (tolerance unknown): pin-to-pin 85, minus 5 for the gap.
    expect(assessAlternate(original, partial)).toMatchObject({ type: "PIN_TO_PIN", confidence: 80 });
  });
});

describe("ranking", () => {
  const original = part({ id: "a", params: cap(25) });
  it("skips EOL/obsolete parts and puts drop-ins first", () => {
    const list = rankAlternates(original, [
      part({ id: "functional", params: cap(25), packageId: "0805", packageName: "0805" }),
      part({ id: "eol", params: cap(25), lifecycle: "EOL" }),
      part({ id: "dropin", params: cap(25) }),
      part({ id: "wrong", params: cap(10) }),
    ]);
    expect(list.map((s) => s.part.id)).toEqual(["dropin", "functional"]);
  });

  it("prefers a second source and stock among equals", () => {
    const list = rankAlternates(original, [
      part({ id: "same-maker", params: cap(25), stock: 50_000 }),
      part({ id: "other-maker", manufacturerId: "yageo", params: cap(25), stock: 50_000 }),
      part({ id: "no-stock", manufacturerId: "kemet", params: cap(25), stock: 0 }),
    ]);
    expect(list.map((s) => s.part.id)).toEqual(["other-maker", "same-maker", "no-stock"]);
    expect(list[0].secondSource).toBe(true);
  });
});
