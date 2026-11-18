import { describe, expect, it } from "vitest";
import { LINES } from "../../prisma/seed-data/factory";
import { buildNeeds, checkPlant, effectiveCapability, type LineIn } from "@/lib/ops/machines";
import { estimateOnLine, measuredCph } from "@/lib/ops/line-time";
import { simLine, simStations } from "@/lib/ops/sim-stations";
import type { AsmPart } from "@/lib/feasibility/joints";
import { planProduction as planImpl } from "@/vendor/circuitflow/factoryLine.js";
import { makePart } from "@/vendor/circuitflow/entry";

// The vendored planner is untyped JS: read its plan loosely.
type Plan = { stations: { id: string }[]; schedule: Record<string, unknown>[]; results: { aoi: unknown[] }[]; reflow: { zoneMm: number }; times: Record<string, number>; stats: { total: number } };
const planProduction = planImpl as unknown as (board: unknown, parts: unknown, opts: unknown) => Plan;

/** Our plant from the machine sheets (prisma/seed-data/factory.ts), as the app reads it. */
const asLine = (code: string): LineIn => {
  const l = LINES.find((x) => x.code === code)!;
  return { id: code, code, name: l.name, type: l.type, capability: l.capability, machines: l.machines.map((m, i) => ({ ...m, position: i + 1, specs: m.specs ?? null })) };
};
const L1 = asLine("L1");
const L2 = asLine("L2");

describe("our lines, from the machine sheets", () => {
  it("has the machines the sheets list, in flow order", () => {
    expect(L1.machines.filter((m) => m.type !== "OTHER").map((m) => `${m.vendor} ${m.model}`)).toEqual([
      "Famecs Lative F20",
      "HTGD GD450 (semi-automatic)",
      "Magic-ray ICON",
      "Yamaha M20 i-Pulse",
      "Tronwin TW-VP860N",
      "Magic-ray V5000",
    ]);
    expect(L2.machines.map((m) => `${m.vendor} ${m.model}`)).toEqual(["MPM Momentum II 100", "Koh Young KY8030-2", "Yamaha YSM20R Z:LEX #1", "Yamaha YSM20R Z:LEX #2", "Vitronics Soltec Centurion 820", "Magic-ray Cube+"]);
    expect(asLine("L3").machines.map((m) => `${m.vendor} ${m.model}`)).toEqual(["HTGD GD450 (semi-automatic)", "CKD VP-01G", "Yamaha YSM20R", "Tronwin TW-VP860N", "Magic-ray V5300"]);
    // Three SMT lines; the through-hole kit and the box-build line are not in the plant.
    expect(LINES.map((l) => `${l.code}:${l.type}`)).toEqual(["L1:SMT", "L2:SMT", "L3:SMT"]);
  });

  it("takes the board limits from the tightest machine — on Line 1 the laser marker", () => {
    const c1 = effectiveCapability(L1);
    expect(c1.maxBoardMm).toEqual([430, 330]);
    expect(c1.minChip).toBe("0201");
    expect(effectiveCapability(L2).maxBoardMm).toEqual([510, 450]);
  });

  it("stops a board thicker than the marker takes on Line 1 only", () => {
    const part = (refDes: string): AsmPart => ({ refDes, side: "TOP", mount: "SMT", kind: "chip", pkg: "0603", pins: 2, pitchMm: 0, lengthMm: 1.6, widthMm: 0.8 });
    const needs = buildNeeds([part("R1"), part("R2")], { widthMm: 100, heightMm: 80, thicknessMm: 2.4 });
    const plant = checkPlant([L1, L2], needs);
    const l1 = plant.lines.find((l) => l.code === "L1")!;
    expect(l1.steps.find((s) => s.label === "Laser marking")).toMatchObject({ level: "red" });
    expect(plant.use.smt).toBe("L2");
    // Line 2 inspects with the Magic-ray Cube+ (plant notes, 17 Nov 2026).
    expect(plant.lines.find((l) => l.code === "L2")!.steps.find((s) => s.stage === "aoi")).toMatchObject({ level: "green" });
  });

  it("builds QFNs without X-ray (amber) but not BGAs (red)", () => {
    const qfn: AsmPart = { refDes: "U1", side: "TOP", mount: "SMT", kind: "leadless", pkg: "QFN-32", pins: 32, pitchMm: 0.5, lengthMm: 5, widthMm: 5 };
    const bga: AsmPart = { ...qfn, refDes: "U2", kind: "array", pkg: "BGA-100", pins: 100, pitchMm: 0.8, lengthMm: 10, widthMm: 10 };
    const board = { widthMm: 100, heightMm: 80, thicknessMm: 1.6 };
    const xray = (parts: AsmPart[]) => checkPlant([L2], buildNeeds(parts, board)).lines[0].steps.find((s) => s.stage === "xray")!.level;
    expect(xray([qfn])).toBe("amber");
    expect(xray([qfn, bga])).toBe("red");
  });
});

describe("running time from the measured placement rate", () => {
  it("adds up the placers' measured rates, or gives none when one is missing", () => {
    expect(measuredCph(L1.machines)).toBe(8500);
    expect(measuredCph(L2.machines)).toBe(132000);
    expect(measuredCph([{ type: "PICK_AND_PLACE", specs: { actualCph: 5000 } }, { type: "PICK_AND_PLACE", specs: {} }])).toBeNull();
  });

  it("uses it instead of rated × efficiency", () => {
    const rates = { smtEfficiency: 0.35, smtMinCycleSec: 20, smtSetupHoursPerSide: 1.5, hoursPerShift: 6.8 };
    const job = { qty: 100, sides: [{ side: "TOP" as const, placements: 2640 }], otherHours: 0 };
    const line = { id: "L2", code: "L2", name: "L2", type: "SMT", shiftsPerDay: 3, capacityCph: 190000 };
    // 2640 placements at 132 000 an hour = 72 s; rated × 0.35 = 66 500 an hour = 142.9 s.
    expect(estimateOnLine({ ...line, actualCph: 132000 }, job, rates).secondsPerBoard).toBe(72);
    expect(estimateOnLine(line, job, rates).secondsPerBoard).toBe(142.9);
  });
});

describe("a line as the simulation's stations", () => {
  it("maps Line 1 machine by machine and leaves the conveyors out", () => {
    const s = simStations(L1.machines);
    expect(s.map((x) => x.id)).toEqual(["marker", "printer", "spi", "pnp", "reflow", "aoi"]);
    expect(s.find((x) => x.id === "printer")!.rates.cycleSec).toBe(17.5);
    expect(s.find((x) => x.id === "reflow")!.rates).toMatchObject({ heatedLengthMm: 2652, zones: 8 });
    expect(s.find((x) => x.id === "pnp")).toMatchObject({ machine: "Yamaha M20 i-Pulse", label: "M20 i-Pulse", count: 1, rates: { actualCph: 8500, ratedCph: 30000 } });
  });

  it("runs Line 2's two placers as one station at their summed rate", () => {
    const pnp = simStations(L2.machines).find((x) => x.id === "pnp")!;
    expect(pnp).toMatchObject({ count: 2, machine: "2 × Yamaha YSM20R Z:LEX", label: "2 × YSM20R Z:LEX", rates: { actualCph: 132000, ratedCph: 190000 } });
    expect(simLine({ code: "L2", name: "Line 2", machines: L2.machines })!.stations.map((x) => x.id)).toEqual(["printer", "spi", "pnp", "reflow", "aoi"]);
    expect(simLine({ code: "L3", name: "Line 3", machines: asLine("L3").machines })!.stations.map((x) => x.id)).toEqual(["printer", "spi", "pnp", "reflow", "aoi"]);
    // A line without printer, placer and oven is not an SMT line for the simulation.
    expect(simLine({ code: "T", name: "THT", machines: [{ type: "WAVE_SOLDER", vendor: "EMST", model: "Stallion", position: 1, specs: null }] })).toBeNull();
  });

  it("schedules a board through our line's stations and nothing else", () => {
    const parts = Array.from({ length: 12 }, (_, i) => makePart({ ref: `R${i + 1}`, x: 10 + i * 6, y: 20, rot: 0, side: "top", package: "0603", value: "10k", w: 1.6, d: 0.8, h: 0.45 }));
    const board = { id: "b", name: "Test", source: "blueprint", width: 100, height: 80, layers: 2, parts };
    // Line 2 without its AOI: the planner schedules only the stations the line has.
    const noAoi = L2.machines.filter((m) => m.type !== "AOI");
    const plan = planProduction(board, parts, { boards: 3, line: simLine({ code: "L2", name: "Line 2", machines: noAoi }) });
    expect(plan.stations.map((s) => s.id)).toEqual(["printer", "spi", "pnp", "reflow"]);
    expect(Object.keys(plan.schedule[0])).toEqual(["printer", "spi", "pnp", "reflow"]);
    expect(plan.results[0].aoi).toEqual([]);
    expect(planProduction(board, parts, { boards: 1, line: simLine({ code: "L2", name: "Line 2", machines: L2.machines }) }).stations.map((s) => s.id)).toEqual(["printer", "spi", "pnp", "reflow", "aoi"]);
    expect(plan.reflow.zoneMm).toBeCloseTo(3550 / 9, 1);
    // 12 placements at 132 000 an hour, plus 3 s transfer.
    expect(plan.times.pnp).toBe(3.33);
    expect(plan.stats.total).toBeGreaterThan(0);
    // Without a line, circuitflow's own seven stations.
    expect(planProduction(board, parts, { boards: 1 }).stations).toHaveLength(7);
  });
});
