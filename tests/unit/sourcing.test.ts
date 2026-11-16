import { describe, expect, it } from "vitest";
import RedisMock from "ioredis-mock";
import type { Redis } from "ioredis";
import { landedCost, findDutyRate, type DutyRate } from "@/lib/landed-cost";
import { MOCK_FX, parseFxResponse } from "@/lib/currency";
import { TokenBucket, istDayKey } from "@/lib/rate-limit";
import { detectOfferEvents, lifecycleChanged, resolveLifecycle } from "@/lib/sourcing-events";
import { createRng } from "@/lib/rng";
import { webUrl, mapLifecycle, mapMsl, mapReach, mapRohs, parseLeadWeeks, parseLocaleNumber } from "@/server/sourcing/normalise";
import { parseNexarResponse, type NexarResponse } from "@/server/sourcing/adapters/nexar";
import { parseDigikeySearch, type DkSearchResponse } from "@/server/sourcing/adapters/digikey";
import { parseMouserResponse, type MouserResponse } from "@/server/sourcing/adapters/mouser";
import { evolveOffer } from "@/server/sourcing/adapters/mock";
import { RedisCache } from "@/server/sourcing/cache";
import { dueJobs, staleRunIds } from "@/server/jobs/scheduler";
import { guessCategory } from "@/server/sourcing/refresh";

const RATES: DutyRate[] = [
  { prefix: "8542", bcdPct: 0, swsPct: 10, igstPct: 18 },
  { prefix: "8536", bcdPct: 10, swsPct: 10, igstPct: 18 },
  { prefix: "853669", bcdPct: 7.5, swsPct: 10, igstPct: 18 },
];

describe("landed cost", () => {
  it("finds the longest matching HSN prefix", () => {
    expect(findDutyRate("85366990", RATES)?.bcdPct).toBe(7.5);
    expect(findDutyRate("8536 41 00", RATES)?.bcdPct).toBe(10);
    expect(findDutyRate("85423100", RATES)?.bcdPct).toBe(0);
    expect(findDutyRate("90251990", RATES)).toBeNull();
    expect(findDutyRate(null, RATES)).toBeNull();
  });

  it("computes import duty on CIF with SWS and IGST", () => {
    const c = landedCost({ unitPrice: 1, currency: "USD", qty: 100, originCountry: "US", hsn: "85364100", rates: RATES, freightPct: 3, fx: MOCK_FX });
    expect(c.domestic).toBe(false);
    expect(c.goods).toBe(8820);
    expect(c.freight).toBe(264.6);
    expect(c.insurance).toBe(99.23);
    expect(c.assessableValue).toBe(9183.83);
    expect(c.bcd).toBe(918.38);
    expect(c.sws).toBe(91.84);
    expect(c.igst).toBe(1834.93);
    expect(c.total).toBe(12028.97);
    expect(c.netTotal).toBe(10194.05); // IGST is input credit
    expect(c.netPerUnit).toBeCloseTo(101.94, 2);
  });

  it("charges no BCD on ITA items, only IGST", () => {
    const c = landedCost({ unitPrice: 10, currency: "INR", qty: 10, originCountry: "SG", hsn: "85423100", rates: RATES, fx: MOCK_FX });
    expect(c.bcd).toBe(0);
    expect(c.netTotal).toBeCloseTo(100 * 1.01125, 2);
  });

  it("uses GST for domestic purchases and flags no duty", () => {
    const c = landedCost({ unitPrice: 50, currency: "INR", qty: 10, originCountry: "IN", hsn: "85364100", rates: RATES, freightPct: 1, fx: MOCK_FX });
    expect(c.domestic).toBe(true);
    expect(c.bcd).toBe(0);
    expect(c.gst).toBe(90.9);
    expect(c.total).toBe(595.9);
    expect(c.netTotal).toBe(505);
  });

  it("falls back to a default rate and says so", () => {
    const c = landedCost({ unitPrice: 1, currency: "USD", qty: 1, originCountry: "US", hsn: null, rates: RATES, fallback: { prefix: "", bcdPct: 10, swsPct: 10, igstPct: 18 }, fx: MOCK_FX });
    expect(c.dutyAssumed).toBe(true);
    expect(c.bcd).toBeGreaterThan(0);
  });
});

describe("FX", () => {
  it("normalises an INR-based response", () => {
    const fx = parseFxResponse({ base_code: "INR", rates: { INR: 1, USD: 0.0125, EUR: 0.0108 } }, "test")!;
    expect(fx.rates.USD).toBeCloseTo(80, 6);
    expect(fx.rates.EUR).toBeCloseTo(92.59, 2);
  });
  it("normalises a USD-based response", () => {
    const fx = parseFxResponse({ base: "USD", rates: { USD: 1, INR: 88, EUR: 0.9 } }, "test")!;
    expect(fx.rates.USD).toBe(88);
    expect(fx.rates.EUR).toBeCloseTo(97.78, 2);
    expect(fx.rates.INR).toBe(1);
  });
  it("rejects responses without INR", () => {
    expect(parseFxResponse({ rates: { USD: 1 } }, "x")).toBeNull();
    expect(parseFxResponse("nope", "x")).toBeNull();
  });
});

describe("rate limiting", () => {
  it("allows a burst up to the per-minute rate, then asks to wait", () => {
    let t = 0;
    const b = new TokenBucket(3, () => t);
    expect([b.take(), b.take(), b.take()]).toEqual([0, 0, 0]);
    expect(b.take()).toBe(20_000);
    t += 20_000;
    expect(b.take()).toBe(0);
  });
  it("counts days in IST", () => {
    expect(istDayKey(new Date("2026-10-23T18:29:00Z"))).toBe("2026-10-23");
    expect(istDayKey(new Date("2026-10-23T18:31:00Z"))).toBe("2026-10-24");
  });
});

describe("distributor text normalisation", () => {
  it.each([
    ["$1,234.50", 1234.5],
    ["₹42.30", 42.3],
    ["1.234,50 €", 1234.5],
    ["0,476", 0.476],
    ["1,000", 1000],
    ["12,345,678", 12345678],
    ["", null],
  ])("parses %s", (text, n) => expect(parseLocaleNumber(text)).toBe(n));
  it("parses lead times", () => {
    expect(parseLeadWeeks("8 Weeks")).toBe(8);
    expect(parseLeadWeeks("35 Days")).toBe(5);
    expect(parseLeadWeeks("16")).toBe(16);
    expect(parseLeadWeeks(null)).toBeNull();
  });
  it("maps lifecycle and compliance wording", () => {
    expect(mapLifecycle("Production")).toBe("ACTIVE");
    expect(mapLifecycle("Not For New Designs")).toBe("NRND");
    expect(mapLifecycle("Last Time Buy")).toBe("LAST_TIME_BUY");
    expect(mapLifecycle("End of Life")).toBe("EOL");
    expect(mapLifecycle("Obsolete")).toBe("OBSOLETE");
    expect(mapLifecycle("Discontinued at Digi-Key")).toBeNull();
    expect(mapRohs("ROHS3 Compliant")).toBe("COMPLIANT");
    expect(mapRohs("RoHS Compliant By Exemption")).toBe("COMPLIANT_WITH_EXEMPTION");
    expect(mapReach("REACH Unaffected")).toBe("COMPLIANT");
    expect(mapReach("REACH Affected")).toBe("CONTAINS_SVHC");
    expect(mapMsl("3 (168 Hours)")).toBe("MSL_3");
    expect(mapMsl("2a")).toBe("MSL_2A");
  });
});

describe("adapter parsers", () => {
  it("parses a Nexar supSearchMpn answer with authorised and broker sellers", () => {
    const json: NexarResponse = {
      data: {
        supSearchMpn: {
          hits: 1,
          results: [
            {
              part: {
                mpn: "LM358DR",
                shortDescription: "Dual op-amp",
                manufacturer: { name: "Texas Instruments" },
                category: { name: "Op Amps" },
                bestDatasheet: { url: "https://example.com/lm358.pdf" },
                bestImage: { url: "https://sigma.octopart.com/12345/image/Texas-Instruments-LM358DR.jpg" },
                specs: [{ attribute: { shortname: "lifecyclestatus", name: "Lifecycle Status" }, displayValue: "Production (Last Updated: 1 month ago)" }],
                sellers: [
                  {
                    company: { name: "Digi-Key" },
                    isAuthorized: true,
                    country: "US",
                    offers: [{ sku: "296-1014-1-ND", inventoryLevel: 52000, moq: 1, packaging: "Cut Tape", factoryLeadDays: 42, prices: [{ quantity: 1, price: 0.5, currency: "USD", convertedPrice: 44, convertedCurrency: "INR" }, { quantity: 100, price: 0.2, currency: "USD", convertedPrice: 17.6, convertedCurrency: "INR" }] }],
                  },
                  { company: { name: "Some Broker HK" }, isAuthorized: false, offers: [{ sku: null, inventoryLevel: 3000, moq: 100, prices: [{ quantity: 100, price: 0.3, currency: "USD" }] }] },
                ],
              },
            },
          ],
        },
      },
    };
    const [p] = parseNexarResponse(json, "INR");
    expect(p).toMatchObject({
      mpn: "LM358DR",
      manufacturer: "Texas Instruments",
      lifecycle: "ACTIVE",
      datasheetUrl: "https://example.com/lm358.pdf",
      imageUrl: "https://sigma.octopart.com/12345/image/Texas-Instruments-LM358DR.jpg",
    });
    expect(p.offers[0]).toMatchObject({ sellerName: "Digi-Key", authorised: true, currency: "INR", stock: 52000, factoryLeadTimeWeeks: 6 });
    expect(p.offers[0].priceBreaks).toEqual([{ qty: 1, price: 44 }, { qty: 100, price: 17.6 }]);
    expect(p.offers[1]).toMatchObject({ authorised: false, currency: "USD", moq: 100, sku: "Some Broker HK:LM358DR" });
  });

  it("raises GraphQL errors", () => {
    expect(() => parseNexarResponse({ errors: [{ message: "Not authorized" }] })).toThrow(/Not authorized/);
  });

  it("parses a DigiKey v4 keyword search, exact matches first", () => {
    const json: DkSearchResponse = {
      SearchLocaleUsed: { Currency: "INR" },
      ExactMatches: [
        {
          ManufacturerProductNumber: "LM358DR",
          Manufacturer: { Name: "Texas Instruments" },
          Description: { ProductDescription: "IC OPAMP GP 2 CIRCUIT 8SOIC", DetailedDescription: "General Purpose Amplifier 2 Circuit 8-SOIC" },
          ProductStatus: { Status: "Active" },
          ManufacturerLeadWeeks: "6",
          ProductUrl: "https://www.digikey.in/en/products/detail/x",
          PhotoUrl: "https://mm.digikey.com/Volume0/opasdata/d220001/medias/images/4977/296~4040047~D~8.JPG",
          Classifications: { RohsStatus: "ROHS3 Compliant", ReachStatus: "REACH Unaffected", MoistureSensitivityLevel: "1  (Unlimited)", ExportControlClassNumber: "EAR99" },
          ProductVariations: [
            { DigiKeyProductNumber: "296-1014-1-ND", PackageType: { Name: "Cut Tape (CT)" }, QuantityAvailableforPackageType: 50000, MinimumOrderQuantity: 1, StandardPackage: 1, StandardPricing: [{ BreakQuantity: 1, UnitPrice: 42.5 }, { BreakQuantity: 10, UnitPrice: 30.1 }] },
            { DigiKeyProductNumber: "296-1014-2-ND", PackageType: { Name: "Tape & Reel (TR)" }, QuantityAvailableforPackageType: 0, MinimumOrderQuantity: 2500, StandardPackage: 2500, StandardPricing: [{ BreakQuantity: 2500, UnitPrice: 9.8 }] },
          ],
        },
      ],
      Products: [{ ManufacturerProductNumber: "LM358DRG4" }],
    };
    const parts = parseDigikeySearch(json, "USD");
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ mpn: "LM358DR", lifecycle: "ACTIVE", rohs: "COMPLIANT", reach: "COMPLIANT", msl: "MSL_1", eccn: "EAR99", mfrLeadTimeWeeks: 6 });
    expect(parts[0].imageUrl).toBe("https://mm.digikey.com/Volume0/opasdata/d220001/medias/images/4977/296~4040047~D~8.JPG");
    expect(parts[0].offers).toHaveLength(2);
    expect(parts[0].offers[1]).toMatchObject({ sellerCode: "DIGIKEY", currency: "INR", moq: 2500, spq: 2500, stock: 0 });
  });

  it("parses a Mouser part-number answer with formatted prices", () => {
    const json: MouserResponse = {
      Errors: [],
      SearchResults: {
        NumberOfResult: 1,
        Parts: [
          {
            ManufacturerPartNumber: "LM358DR",
            Manufacturer: "Texas Instruments",
            MouserPartNumber: "595-LM358DR",
            Description: "Operational Amplifiers",
            ImagePath: "http://www.mouser.com/images/texasinstruments/images/ITP_TI_SOIC-8_D_t.jpg",
            Availability: "33,104 In Stock",
            AvailabilityInStock: "33104",
            LeadTime: "42 Days",
            LifecycleStatus: null,
            Min: "1",
            Mult: "1",
            ROHSStatus: "RoHS Compliant",
            PriceBreaks: [{ Quantity: 1, Price: "$0.47", Currency: "USD" }, { Quantity: 1000, Price: "$0.104", Currency: "USD" }],
            ProductCompliance: [{ ComplianceName: "ECCN", ComplianceValue: "EAR99" }],
          },
        ],
      },
    };
    const [p] = parseMouserResponse(json);
    expect(p).toMatchObject({ mpn: "LM358DR", rohs: "COMPLIANT", eccn: "EAR99", mfrLeadTimeWeeks: 6, lifecycle: null });
    // Upgraded to https so the photo never loads as mixed content.
    expect(p.imageUrl).toBe("https://www.mouser.com/images/texasinstruments/images/ITP_TI_SOIC-8_D_t.jpg");
    expect(p.offers[0]).toMatchObject({ sellerCode: "MOUSER", stock: 33104, currency: "USD", priceBreaks: [{ qty: 1, price: 0.47 }, { qty: 1000, price: 0.104 }] });
  });

  it("accepts only web links for photos and datasheets", () => {
    expect(webUrl("//media.digikey.com/photos/x.jpg")).toBe("https://media.digikey.com/photos/x.jpg");
    expect(webUrl("javascript:alert(1)")).toBeNull();
    expect(webUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(webUrl("images/relative.jpg")).toBeNull();
    expect(webUrl("  ")).toBeNull();
  });

  it("raises Mouser errors", () => {
    expect(() => parseMouserResponse({ Errors: [{ Message: "Invalid unique identifier." }] })).toThrow(/Invalid unique/);
  });
});

describe("mock market", () => {
  const start = { priceBreaks: [{ qty: 1, price: 1 }, { qty: 1000, price: 0.5 }], stock: 10_000, factoryLeadTimeWeeks: 10 };
  it("is deterministic for the same seed", () => {
    expect(evolveOffer(start, createRng("a|b|1"))).toEqual(evolveOffer(start, createRng("a|b|1")));
  });
  it("moves prices within bounds and keeps breaks ordered", () => {
    for (let i = 0; i < 200; i++) {
      const next = evolveOffer(start, createRng(`seed-${i}`));
      const f = next.priceBreaks[1].price / 0.5;
      expect(f).toBeGreaterThan(0.84);
      expect(f).toBeLessThan(1.26);
      expect(next.stock).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("events", () => {
  it("detects spikes, drops, stock-outs and restocks", () => {
    expect(detectOfferEvents({ unitInr: 100, stock: 10 }, { unitInr: 112, stock: 10 })[0]).toMatchObject({ kind: "PRICE_SPIKE", data: { pct: 12 } });
    expect(detectOfferEvents({ unitInr: 100, stock: 10 }, { unitInr: 85, stock: 10 })[0].kind).toBe("PRICE_DROP");
    expect(detectOfferEvents({ unitInr: 100, stock: 10 }, { unitInr: 105, stock: 0 }).map((e) => e.kind)).toEqual(["STOCK_OUT"]);
    expect(detectOfferEvents({ unitInr: 100, stock: 0 }, { unitInr: 100, stock: 5 }).map((e) => e.kind)).toEqual(["BACK_IN_STOCK"]);
    expect(detectOfferEvents(null, { unitInr: 1, stock: 1 })).toEqual([]);
  });
  it("reports real lifecycle changes only", () => {
    expect(lifecycleChanged("ACTIVE", "NRND")).toBe(true);
    expect(lifecycleChanged("ACTIVE", "ACTIVE")).toBe(false);
    expect(lifecycleChanged("ACTIVE", null)).toBe(false);
    expect(lifecycleChanged("UNKNOWN", "ACTIVE")).toBe(false);
  });
});

describe("lifecycle across sources", () => {
  // TJA1051T/3,118 in the first live refresh: DigiKey said last-time-buy, Mouser said EOL.
  const disagree = [
    { source: "digikey", lifecycle: "LAST_TIME_BUY" as const },
    { source: "mouser", lifecycle: "EOL" as const },
  ];

  it("takes the most severe status, whatever order sources answer in", () => {
    expect(resolveLifecycle("ACTIVE", disagree)).toEqual({ next: "EOL", sources: ["mouser"], report: true });
    expect(resolveLifecycle("ACTIVE", [...disagree].reverse())).toEqual({ next: "EOL", sources: ["mouser"], report: true });
  });

  it("raises nothing on the next refresh when sources still disagree the same way", () => {
    expect(resolveLifecycle("EOL", disagree)).toBeNull();
    expect(resolveLifecycle("EOL", [...disagree].reverse())).toBeNull();
  });

  it("lists every source that agrees on the winning status", () => {
    expect(resolveLifecycle("ACTIVE", [{ source: "digikey", lifecycle: "NRND" }, { source: "mouser", lifecycle: "NRND" }])?.sources).toEqual(["digikey", "mouser"]);
  });

  it("ignores unknown and missing answers", () => {
    expect(resolveLifecycle("ACTIVE", [{ source: "nexar", lifecycle: "UNKNOWN" }, { source: "mouser", lifecycle: null }])).toBeNull();
    expect(resolveLifecycle("ACTIVE", [{ source: "nexar", lifecycle: "UNKNOWN" }, { source: "digikey", lifecycle: "NRND" }])?.next).toBe("NRND");
    expect(resolveLifecycle("ACTIVE", [])).toBeNull();
  });

  it("fills an unknown status quietly", () => {
    expect(resolveLifecycle("UNKNOWN", [{ source: "digikey", lifecycle: "ACTIVE" }])).toEqual({ next: "ACTIVE", sources: ["digikey"], report: false });
  });

  it("only steps down when every source answered", () => {
    // Mouser's call failed this run, DigiKey alone says last-time-buy: keep EOL until both answer.
    const dkOnly = [{ source: "digikey", lifecycle: "LAST_TIME_BUY" as const }];
    expect(resolveLifecycle("EOL", dkOnly, { complete: false })).toBeNull();
    expect(resolveLifecycle("EOL", dkOnly, { complete: true })).toEqual({ next: "LAST_TIME_BUY", sources: ["digikey"], report: true });
    // Getting worse is reported even from a partial run.
    expect(resolveLifecycle("ACTIVE", [{ source: "mouser", lifecycle: "OBSOLETE" }], { complete: false })?.next).toBe("OBSOLETE");
  });
});

describe("scheduler", () => {
  const at = (iso: string) => new Date(iso);
  it("runs the full refresh once per IST day after 02:00", () => {
    expect(dueJobs(at("2026-10-23T21:00:00Z"), { "refresh.full": at("2026-10-22T21:00:00Z") })).toContain("refresh.full"); // 02:30 IST 24th
    expect(dueJobs(at("2026-10-23T20:00:00Z"), { "refresh.full": at("2026-10-22T21:00:00Z"), "refresh.hot": at("2026-10-23T19:00:00Z") })).toEqual([]); // 01:30 IST
  });
  it("runs hot refresh every N hours", () => {
    const last = { "refresh.full": at("2026-10-23T00:00:00Z"), "refresh.hot": at("2026-10-23T06:00:00Z") };
    expect(dueJobs(at("2026-10-23T09:00:00Z"), last, 4)).toEqual([]);
    expect(dueJobs(at("2026-10-23T10:30:00Z"), last, 4)).toEqual(["refresh.hot"]);
  });
  it("closes a run only after 30 minutes without a heartbeat", () => {
    const now = at("2026-10-27T06:00:00Z");
    const runs = [
      { id: "cut-off", startedAt: at("2026-10-27T03:45:00Z"), stats: { done: 170, at: "2026-10-27T05:10:00Z" } },
      { id: "slow-but-alive", startedAt: at("2026-10-27T03:45:00Z"), stats: { done: 20, at: "2026-10-27T05:45:00Z" } },
      { id: "just-started", startedAt: at("2026-10-27T05:50:00Z"), stats: null },
      { id: "never-reported", startedAt: at("2026-10-27T05:00:00Z"), stats: null },
    ];
    expect(staleRunIds(runs, now)).toEqual(["cut-off", "never-reported"]);
  });
  it("refreshes FX every 12 h when a live source is configured", () => {
    const last = { "refresh.full": at("2026-10-23T00:00:00Z"), "refresh.hot": at("2026-10-23T06:00:00Z"), "fx.refresh": at("2026-10-22T20:00:00Z") };
    expect(dueJobs(at("2026-10-23T09:00:00Z"), last, 4, true)).toEqual(["fx.refresh"]);
    expect(dueJobs(at("2026-10-23T09:00:00Z"), last, 4, false)).toEqual([]);
  });
});

describe("caches", () => {
  it("Redis cache stores JSON with TTL and counts", async () => {
    const cache = new RedisCache(new RedisMock() as unknown as Redis);
    await cache.set("k", { a: 1 }, 60);
    expect(await cache.get("k")).toEqual({ a: 1 });
    expect(await cache.get("missing")).toBeNull();
    expect(await cache.incr("c", 60)).toBe(1);
    expect(await cache.incr("c", 60)).toBe(2);
  });
});

describe("category guessing", () => {
  it.each([
    ["Embedded - Microcontrollers", "mcu"],
    ["Voltage Regulators - DC DC Switching", "power-ic"],
    ["Chip Resistor - Surface Mount", "resistor-chip"],
    ["Clock/Timing - Programmable Timers", "logic-ic"],
    ["RF Transceiver Modules", "rf-wireless"],
    ["Something new", "uncategorised"],
  ])("%s → %s", (text, slug) => expect(guessCategory(text)).toBe(slug));
  it("spots current-sense resistors from the description", () => {
    expect(guessCategory("Chip Resistor - Surface Mount", "0.1 Ω 2512 power metal-strip current-sense resistor")).toBe("resistor-current-sense");
  });
});
