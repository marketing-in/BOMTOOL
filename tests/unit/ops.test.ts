import { describe, expect, it } from "vitest";
import { bake, closeBag, formatHours, mslState, openBag } from "@/lib/ops/msl";
import { clearToBuild, feederSetups, lineFits, pickLots } from "@/lib/ops/planning";

const t0 = new Date("2026-10-24T08:00:00Z");
const h = (n: number) => new Date(t0.getTime() + n * 3_600_000);

describe("MSL floor-life clock", () => {
  it("ignores MSL 1 and untracked parts", () => {
    expect(mslState({ msl: "MSL_1", openedAt: t0, hoursLeft: null }).tracked).toBe(false);
    expect(mslState({ msl: null, openedAt: null, hoursLeft: null }).tracked).toBe(false);
  });
  it("runs while open, pauses when closed, resets on bake", () => {
    let c = openBag({ msl: "MSL_3", openedAt: null, hoursLeft: null }, t0);
    expect(mslState(c, h(100))).toMatchObject({ running: true, hoursLeft: 68, level: "green", expired: false });
    c = closeBag(c, h(100));
    expect(mslState(c, h(500))).toMatchObject({ running: false, hoursLeft: 68 });
    c = openBag(c, h(500));
    expect(mslState(c, h(550))).toMatchObject({ hoursLeft: 18, level: "red" });
    expect(mslState(c, h(600)).expired).toBe(true);
    c = bake(c);
    expect(mslState(c, h(700))).toMatchObject({ running: false, hoursLeft: 168, expired: false });
  });
  it("treats MSL 6 as always needing a bake", () => {
    expect(mslState({ msl: "MSL_6", openedAt: null, hoursLeft: null }).expired).toBe(true);
  });
  it("formats hours", () => {
    expect(formatHours(68)).toBe("2 d 20 h");
    expect(formatHours(18.5)).toBe("18 h 30 min");
  });
});

describe("clear to build", () => {
  it("counts covered lines and lists blockers, worst first", () => {
    const r = clearToBuild([
      { lineId: "a", partId: "p1", required: 100, dnp: false, available: 150 },
      { lineId: "b", partId: "p2", required: 100, dnp: false, available: 40, onOrder: 60 },
      { lineId: "c", partId: null, required: 10, dnp: false, available: 0 },
      { lineId: "d", partId: "p3", required: 5, dnp: true, available: 0 },
    ]);
    expect(r.pct).toBe(33);
    expect(r.pctWithOrders).toBe(67);
    expect(r.blocking.map((b) => [b.lineId, b.reason, b.short])).toEqual([
      ["b", "SHORT", 60],
      ["c", "UNMATCHED", 10],
    ]);
  });
  it("is 100 % for an empty or all-DNP BoM", () => {
    expect(clearToBuild([]).pct).toBe(100);
  });
});

describe("line capability", () => {
  const l1 = { minChip: "0201", minPitchMm: 0.35, bga: true, maxBoardMm: [510, 460] as [number, number], doubleSided: true };
  const l2 = { minChip: "0402", minPitchMm: 0.4, bga: true, maxBoardMm: [460, 400] as [number, number] };
  const job = { smallestChip: "0201", finestPitchMm: 0.4, hasBga: false, boardMm: [100, 80] as [number, number], doubleSided: false, hasTht: true, smdLines: 30 };
  it("explains why a line can't build a job", () => {
    expect(lineFits("SMT", l1, job)).toEqual({ ok: true, reasons: [] });
    expect(lineFits("SMT", l2, job).reasons).toEqual(["smallest chip 0201 < line minimum 0402"]);
    expect(lineFits("SMT", l2, { ...job, smallestChip: "0402", boardMm: [470, 100] }).reasons[0]).toMatch(/exceeds/);
    expect(lineFits("THT", {}, { ...job, hasTht: false }).ok).toBe(false);
  });
});

describe("feeders and lot picking", () => {
  it("counts setups against slots", () => {
    expect(feederSetups([{ wide: false }, { wide: true }, { wide: false }], 3)).toEqual({ needed: 4, slots: 3, setups: 2, fits: false });
    expect(feederSetups([], 100).setups).toBe(1);
  });
  it("uses consigned stock first, then the shortest floor life, then FIFO", () => {
    const d = (s: string) => new Date(s);
    const lots = [
      { id: "old", free: 100, dateCode: "2401", receivedAt: d("2024-02-01"), mslHoursLeft: null, consignedFor: null },
      { id: "new", free: 500, dateCode: "2620", receivedAt: d("2026-06-01"), mslHoursLeft: null, consignedFor: null },
      { id: "open", free: 50, dateCode: "2610", receivedAt: d("2026-03-01"), mslHoursLeft: 20, consignedFor: null },
      { id: "kd", free: 30, dateCode: "2601", receivedAt: d("2026-01-10"), mslHoursLeft: null, consignedFor: "cust-1" },
      { id: "other", free: 999, dateCode: "2001", receivedAt: d("2020-01-01"), mslHoursLeft: null, consignedFor: "cust-2" },
    ];
    expect(pickLots(lots, 200, "cust-1")).toEqual([
      { lotId: "kd", qty: 30 },
      { lotId: "open", qty: 50 },
      { lotId: "old", qty: 100 },
      { lotId: "new", qty: 20 },
    ]);
  });
});
