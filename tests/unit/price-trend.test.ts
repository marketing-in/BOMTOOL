import { describe, expect, it } from "vitest";
import { priceSeries, priceTrendPct, type PricePoint } from "@/lib/price-trend";

const now = new Date("2026-10-26T12:00:00Z");
const day = (d: number) => new Date(now.getTime() - d * 86_400_000);
const pt = (supplierId: string, currency: string, unitPrice: number, daysAgo: number): PricePoint => ({ supplierId, currency, unitPrice, recordedAt: day(daysAgo) });

describe("price trend", () => {
  it("measures one consistent series, not first-vs-last across sellers and currencies", () => {
    const points = [pt("dk", "USD", 0.05, 30), pt("dk", "USD", 0.055, 10), pt("mouser", "INR", 11.8, 5)];
    // Old behaviour would report (11.8 - 0.05) / 0.05 = +23,500 %.
    expect(priceTrendPct(points, { liveSince: null, now })).toBeCloseTo(10);
  });

  it("uses live data only once it exists, and says so when it is too short", () => {
    const liveSince = day(3);
    const sim = [pt("dk", "INR", 5, 60), pt("dk", "INR", 5.2, 40), pt("dk", "INR", 5.1, 20)];
    expect(priceTrendPct([...sim, pt("dk", "INR", 11.8, 2)], { liveSince, now })).toBeNull();
    expect(priceTrendPct([...sim, pt("dk", "INR", 11.8, 2), pt("dk", "INR", 12.4, 1)], { liveSince, now })).toBeCloseTo(5.08, 1);
  });

  it("falls back to the simulated market when nothing is live yet", () => {
    expect(priceTrendPct([pt("dk", "INR", 10, 50), pt("dk", "INR", 9, 1)], { liveSince: null, now })).toBeCloseTo(-10);
  });

  it("ignores points outside the window and prefers the longest series", () => {
    const points = [pt("a", "INR", 1, 200), pt("a", "INR", 2, 10), pt("a", "INR", 3, 5), pt("b", "INR", 10, 20), pt("b", "INR", 11, 10), pt("b", "INR", 12, 5)];
    expect(priceTrendPct(points, { liveSince: null, now })).toBeCloseTo(20);
  });

  it("keys series by seller, currency and market", () => {
    const s = priceSeries([pt("dk", "INR", 1, 10), pt("dk", "USD", 1, 9), pt("dk", "INR", 1, 1)], day(3));
    expect([...s.keys()].sort()).toEqual(["dk|INR|live", "dk|INR|sim", "dk|USD|sim"]);
  });
});
