import { describe, expect, it } from "vitest";
import { matchFootprints } from "@/lib/board/footprint-match";
import { findMismatches, mismatchNote } from "@/lib/bom/mismatch";
import { calendarHours, estimateAll, estimateOnLine, historyRow, lineNow, type LineIn } from "@/lib/ops/line-time";
import { lookupPrompt, typicalLookup } from "@/lib/assistant/machine-lookup";

describe("mismatches: the product against itself", () => {
  const lines = [
    { id: "a", lineNo: 1, refDes: "R1, R2", pkg: "0603", mpn: "RC0603FR-0710KL", dnp: false },
    { id: "b", lineNo: 2, refDes: "U1", pkg: "SOIC-8", mpn: "LM358DR", dnp: false },
    { id: "c", lineNo: 3, refDes: "C9", pkg: "0402", mpn: "GRM155", dnp: false },
  ];
  const placements = [
    { refDes: "R1", footprint: "R_0603_1608Metric", x: 1, y: 1, side: "TOP" },
    { refDes: "R2", footprint: "R_0603_1608Metric", x: 2, y: 1, side: "TOP" },
    { refDes: "U1", footprint: "QFN-16", x: 5, y: 5, side: "TOP" },
    { refDes: "TP1", footprint: "TestPoint", x: 9, y: 9, side: "BOTTOM" },
  ];

  it("gathers board and BoM disagreements into groups, most serious first", () => {
    const match = matchFootprints(lines, placements);
    const m = findMismatches(match, [
      { lineNo: 1, refDes: "R1, R2", qtyPerBoard: 3, mpn: "RC0603FR-0710KL", dnp: false, issues: ["QTY_REFDES_MISMATCH", "MPN_VALUE_MISMATCH: the line says 1 kΩ; RC0603FR-0710KL is 10 kΩ"] },
      { lineNo: 2, refDes: "U1", qtyPerBoard: 1, mpn: "LM358DR", dnp: false, issues: [] },
      { lineNo: 3, refDes: "C9, R2", qtyPerBoard: 2, mpn: "GRM155", dnp: false, issues: [] },
    ]);
    const keys = m.groups.map((g) => g.key);
    expect(keys).toEqual(["footprint", "not-on-board", "not-in-bom", "mpn", "refdes", "qty"]);
    expect(m.level).toBe("red");
    expect(m.groups.find((g) => g.key === "footprint")!.items[0]).toMatchObject({ ref: "U1", detail: "BoM SOIC-8 · board QFN-16" });
    expect(m.groups.find((g) => g.key === "not-in-bom")!.items[0]).toMatchObject({ ref: "TP1", detail: "TestPoint on the bottom" });
    expect(m.groups.find((g) => g.key === "qty")!.items[0].detail).toBe("quantity 3 · 2 designators");
    expect(m.groups.find((g) => g.key === "refdes")!.items[0]).toMatchObject({ ref: "R2", lineNo: 3, detail: "also on line 1" });
    expect(m.total).toBe(6);
    expect(mismatchNote(m)).toBe("6 mismatches to settle");
  });

  it("is green when nothing disagrees, and says the board is still to come when there is none", () => {
    const none = findMismatches(matchFootprints(lines, []), lines.map((l) => ({ lineNo: l.lineNo, refDes: l.refDes, qtyPerBoard: 1, mpn: l.mpn, dnp: false, issues: [] })));
    expect(none.level).toBe("green");
    expect(none.hasBoard).toBe(false);
    expect(mismatchNote(none)).toBe("BoM consistent; no board to check yet");
  });

  it("treats a designator fitted on one line and DNP on another as a check, not a block", () => {
    const m = findMismatches(matchFootprints([], []), [
      { lineNo: 1, refDes: "R5", qtyPerBoard: 1, mpn: "A", dnp: false, issues: [] },
      { lineNo: 2, refDes: "R5", qtyPerBoard: 1, mpn: "B", dnp: true, issues: [] },
    ]);
    expect(m.groups[0]).toMatchObject({ key: "refdes", level: "amber" });
  });
});

describe("line fit: running time against older jobs and the line now", () => {
  const rates = { smtEfficiency: 0.35, smtMinCycleSec: 20, smtSetupHoursPerSide: 1.5, hoursPerShift: 6.8 };
  const L1: LineIn = { id: "l1", code: "L1", name: "SMT 1", type: "SMT", shiftsPerDay: 2, capacityCph: 78_000 };
  const L2: LineIn = { id: "l2", code: "L2", name: "SMT 2", type: "SMT", shiftsPerDay: 3, capacityCph: 135_000 };
  const job = { qty: 500, sides: [{ side: "TOP" as const, placements: 400 }, { side: "BOTTOM" as const, placements: 60 }], otherHours: 4 };

  it("prices a lot with the quote's rule: placements ÷ effective cph, never under the shortest cycle", () => {
    const e = estimateOnLine(L1, job, rates);
    // Top: 400 / (78 000 × 0.35) h = 52.7 s; bottom: 60 → 7.9 s, held at 20 s.
    expect(e.secondsPerBoard).toBeCloseTo(72.7, 1);
    expect(e.setupHours).toBe(3);
    expect(e.smtHours).toBeCloseTo(3 + (500 * 72.75) / 3600, 0);
    expect(e.totalHours).toBeCloseTo(e.smtHours + 4, 0);
    expect(e.days).toBeCloseTo(e.shifts / 2, 0);
  });

  it("turns a finished job into seconds per placement, and re-prices the lot from that line's history", () => {
    const h = historyRow({ id: "w", number: "WO-1", project: "P", revision: "A", lineId: "l1", lineCode: "L1", shiftsPerDay: 2, qty: 300, placementsPerBoard: 200, start: new Date("2026-10-01T06:00:00Z"), end: new Date("2026-10-02T06:00:00Z"), basis: "actual", sameProject: false }, 6.8);
    // 24 elapsed hours × (2 × 6.8 / 24) = 13.6 line hours → 163.2 s a board → 0.82 s a placement.
    expect(h.lineHours).toBe(13.6);
    expect(h.secondsPerBoard).toBeCloseTo(163.2, 1);
    expect(h.secondsPerPlacement).toBeCloseTo(0.82, 2);
    const [e1, e2] = estimateAll([L1, L2], job, rates, [h]);
    expect(e1.fromHistory).toMatchObject({ jobs: 1, secondsPerPlacement: 0.82 });
    expect(e1.fromHistory!.smtHours).toBeCloseTo(3 + (500 * 0.82 * 460) / 3600, 0);
    expect(e2.fromHistory).toBeNull();
  });

  it("knows when each line is free and when this lot would finish there", () => {
    const now = new Date("2026-11-16T06:00:00Z");
    const queue = [
      { id: "a", number: "WO-7", project: "GW", lineId: "l1", status: "IN_PROGRESS", qty: 100, start: new Date("2026-11-15T06:00:00Z"), end: new Date("2026-11-17T06:00:00Z"), startedAt: new Date("2026-11-15T06:00:00Z") },
      { id: "b", number: "WO-8", project: "MC", lineId: "l1", status: "PLANNED", qty: 50, start: new Date("2026-11-17T06:00:00Z"), end: new Date("2026-11-18T06:00:00Z"), startedAt: null },
    ];
    const n1 = lineNow(L1, queue, 13.6, now, 6.8);
    expect(n1.running).toMatchObject({ number: "WO-7", hoursLeft: 24 });
    expect(n1.queued.map((q) => q.number)).toEqual(["WO-8"]);
    expect(n1.freeAt.toISOString()).toBe("2026-11-18T06:00:00.000Z");
    expect(n1.finishAt.getTime() - n1.freeAt.getTime()).toBe(calendarHours(13.6, 2, 6.8) * 3_600_000);
    const n2 = lineNow(L2, queue, 10, now, 6.8);
    expect(n2.running).toBeNull();
    expect(n2.freeAt).toEqual(now);
  });
});

describe("machine look-up by brand and year", () => {
  it("asks for the version of that year when the model is known", () => {
    const p = lookupPrompt({ type: "PICK_AND_PLACE", vendor: "Yamaha", model: "YSM20R", year: 2018 });
    expect(p).toContain("Machine: Yamaha YSM20R (bought or built around 2018)");
    expect(p).toContain("version sold around 2018");
  });

  it("asks the AI to work out the model from brand and year when the model is blank", () => {
    const p = lookupPrompt({ type: "REFLOW_OVEN", vendor: "Heller", model: "", year: 2015 });
    expect(p).toContain("made by Heller (bought or built around 2015); the model is not known");
    expect(p).toContain("record the most likely one as the model");
    expect(typicalLookup({ type: "REFLOW_OVEN", vendor: "Heller", model: "", year: 2015 }).model).toBe("Reflow oven (2015)");
  });
});
