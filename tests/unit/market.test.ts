import { describe, expect, it } from "vitest";
import { mergeAnswers, relevance } from "@/lib/market-merge";
import { parseDigikeyKeyword, type DkProduct } from "@/server/sourcing/adapters/digikey";
import type { AdapterPart } from "@/server/sourcing/types";

const offer = (seller: string, stock: number, price: number, currency = "INR", moq = 1) => ({
  sellerName: seller,
  sellerCode: seller.toUpperCase(),
  authorised: true,
  sku: `${seller}-1`,
  stock,
  moq,
  spq: 1,
  currency,
  priceBreaks: [
    { qty: 1, price: price * 2 },
    { qty: 1000, price },
  ],
  factoryLeadTimeWeeks: null,
});
const part = (mpn: string, offers: AdapterPart["offers"], extra: Partial<AdapterPart> = {}): AdapterPart => ({ mpn, manufacturer: "Texas Instruments", description: "Buck converter", offers, ...extra });

describe("distributor search merge", () => {
  it("puts every distributor's offer for the same part on one row", () => {
    const rows = mergeAnswers(
      [
        { adapter: "digikey", parts: [part("TPS563200DDCR", [offer("DigiKey", 5000, 20)], { imageUrl: "https://mm.digikey.com/x.jpg" })] },
        { adapter: "mouser", parts: [part("TPS563200DDCR", [offer("Mouser", 30000, 0.2, "USD")], { datasheetUrl: "//www.ti.com/lit/ds/tps563200.pdf" })] },
      ],
      "INR",
      "TPS563200DDCR",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].offers.map((o) => o.seller)).toEqual(["DigiKey", "Mouser"]);
    expect(rows[0].totalStock).toBe(35000);
    expect(rows[0].imageUrl).toBe("https://mm.digikey.com/x.jpg");
    expect(rows[0].datasheetUrl).toBe("https://www.ti.com/lit/ds/tps563200.pdf");
    // Mouser's USD 0.20 is ₹17.64 at the offline rate (88.2), below DigiKey's ₹20.
    expect(rows[0].best1k).toBeCloseTo(17.64);
  });

  it("prices a part at the quantity asked for, from sellers that have stock", () => {
    const answers = [{ adapter: "mouser" as const, parts: [part("RC1210FR-0710KL", [offer("Mouser", 9000, 5), offer("Empty", 0, 1)])] }];
    // 40 pieces sit on the 1-piece break (₹10); the cheaper seller has no stock, so it is not the price.
    expect(mergeAnswers(answers, "INR", "10k 1210", 40)[0].bestAtNeed).toBeCloseTo(10);
    expect(mergeAnswers(answers, "INR", "10k 1210", 2000)[0].bestAtNeed).toBeCloseTo(5);
    expect(mergeAnswers(answers, "INR", "10k 1210")[0].bestAtNeed).toBeNull();
  });

  it("ranks the exact part first, then MPN prefixes, and pushes dev kits last", () => {
    const rows = mergeAnswers(
      [
        {
          adapter: "mouser",
          parts: [
            part("TPS563202SDRLR", [offer("Mouser", 30950, 17)]),
            part("TPS563200EVM-652", [offer("Mouser", 12, 4000)], { description: "Evaluation module" }),
            part("TPS563200DDCT", [offer("Mouser", 400, 22)]),
            part("TPS563200", [offer("Mouser", 10, 25)]),
          ],
        },
      ],
      "INR",
      "TPS563200",
    );
    expect(rows.map((r) => r.mpn)).toEqual(["TPS563200", "TPS563200DDCT", "TPS563202SDRLR", "TPS563200EVM-652"]);
    expect(relevance({ mpn: "LM358DR", description: "Op amp" }, "op amp")).toBe(3);
  });
});

describe("DigiKey keyword search", () => {
  it("lists exact matches first, once per MPN", () => {
    const p = (mpn: string): DkProduct => ({ ManufacturerProductNumber: mpn, Manufacturer: { Name: "TI" }, ProductVariations: [] });
    const parts = parseDigikeyKeyword({ ExactMatches: [p("TPS563200DDCR")], Products: [p("TPS563200DDCR"), p("TPS563201DDCR")] }, "INR");
    expect(parts.map((x) => x.mpn)).toEqual(["TPS563200DDCR", "TPS563201DDCR"]);
  });
});
