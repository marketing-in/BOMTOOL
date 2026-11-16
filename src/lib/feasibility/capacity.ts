/**
 * How long a lot takes on our lines: hours per stage of the route, turned into shifts and working days.
 * Stages run one after another (the lot finishes a stage before the next starts) — the cautious figure. Pure.
 */
import { ASSEMBLY, type AssemblyConfig } from "@/data/assembly";

export type CapacityInput = {
  qty: number;
  smt: { side: "TOP" | "BOTTOM"; line: string | null; placements: number; secondsPerBoard: number; setupHours: number; shiftsPerDay: number }[];
  tht: { parts: number; joints: number; selective: boolean; pressFitParts: number; line: string | null; shiftsPerDay: number } | null;
  coating: boolean;
  /** Parts masked before coating and unmasked after. */
  maskParts?: number;
  test: { nets: number; ict: boolean; program: boolean; line: string | null; shiftsPerDay: number };
  box: { minutesPerUnit: number; line: string | null; shiftsPerDay: number } | null;
};

export type StagePlan = {
  key: string;
  label: string;
  line: string | null;
  setupHours: number;
  runHours: number;
  hours: number;
  /** Seconds of work one board takes at this stage. */
  secondsPerBoard: number;
  shifts: number;
  shiftsPerDay: number;
  days: number;
  note: string;
};

export type CapacityPlan = {
  qty: number;
  hoursPerShift: number;
  stages: StagePlan[];
  totalHours: number;
  totalShifts: number;
  /** Working days with each line on its own shift pattern. */
  days: number;
  bottleneck: string | null;
  /** The same lot if every stage ran 1, 2 or 3 shifts a day. */
  daysAt: { shiftsPerDay: number; days: number }[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function planCapacity(input: CapacityInput, cfg: AssemblyConfig = ASSEMBLY): CapacityPlan {
  const qty = Math.max(1, Math.round(input.qty));
  const hoursPerShift = cfg.shift.hours * cfg.shift.productive;
  const t = cfg.time;
  const stages: StagePlan[] = [];
  const add = (key: string, label: string, line: string | null, shiftsPerDay: number, setupHours: number, secondsPerBoard: number, parallel: number, note: string) => {
    const runHours = (qty * secondsPerBoard) / 3600 / Math.max(1, parallel);
    const hours = setupHours + runHours;
    const shifts = hours / hoursPerShift;
    const spd = Math.max(1, shiftsPerDay);
    stages.push({ key, label, line, setupHours, runHours, hours, secondsPerBoard, shifts, shiftsPerDay: spd, days: shifts / spd, note });
  };

  for (const s of input.smt)
    add(
      `smt-${s.side.toLowerCase()}`,
      input.smt.length > 1 ? `SMT — ${s.side.toLowerCase()} side` : "SMT",
      s.line,
      s.shiftsPerDay,
      s.setupHours,
      s.secondsPerBoard,
      1,
      `${s.placements} placements, ${r1(s.secondsPerBoard)} s a board; print, SPI, reflow and AOI run in line`,
    );

  if (input.tht) {
    const h = input.tht;
    const insert = (h.parts * t.thtInsertSecPerPart) / t.insertionBenches;
    const solder = h.selective ? h.joints * t.selectiveSecPerJoint : 3600 / t.waveBoardsPerHour;
    const press = h.pressFitParts * t.pressFitSecPerPart;
    add(
      "tht",
      "Through-hole",
      h.line,
      h.shiftsPerDay,
      h.parts || h.pressFitParts ? 0.5 : 0,
      insert + solder + press,
      1,
      [
        h.parts ? `${h.parts} parts inserted at ${t.insertionBenches} benches` : null,
        h.parts ? (h.selective ? `selective solder, ${h.joints} joints at ${t.selectiveSecPerJoint} s` : `wave at ${t.waveBoardsPerHour} boards an hour`) : null,
        h.pressFitParts ? `${h.pressFitParts} press-fit` : null,
      ]
        .filter(Boolean)
        .join("; "),
    );
  }

  if (input.coating) add("finish", "Cleaning & coating", input.tht?.line ?? null, input.tht?.shiftsPerDay ?? input.test.shiftsPerDay, 0.5, t.cleanSecPerBoard + t.coatSecPerBoard + (input.maskParts ?? 0) * cfg.consumables.maskSecPerPart, 1, input.maskParts ? `Wash, mask ${input.maskParts} parts, coat, unmask and UV check` : "Wash, coat and UV check — nothing to mask");

  const probe = input.test.ict ? t.ictSecPerBoard : Math.max(t.flyingProbeMinSec, input.test.nets * t.flyingProbeSecPerNet);
  const testSec = t.depanelSecPerBoard + probe + (input.test.program ? t.programSecPerBoard : 0) + t.fctSecPerBoard;
  add(
    "test",
    "Depanel, test & programming",
    input.test.line,
    input.test.shiftsPerDay,
    0.5,
    testSec,
    t.testStations,
    `${input.test.ict ? "ICT" : `flying probe, about ${input.test.nets} nets`}${input.test.program ? ", firmware" : ""}, functional test; ${t.testStations} stations`,
  );

  if (input.box)
    add(
      "box",
      "Box build & system test",
      input.box.line,
      input.box.shiftsPerDay,
      0.5,
      input.box.minutesPerUnit * 60 + t.systemTestSecPerUnit,
      t.boxOperators,
      `${input.box.minutesPerUnit} min a unit, ${t.boxOperators} operators, then system test`,
    );

  add("pack", "Packing", input.box?.line ?? input.test.line, input.box?.shiftsPerDay ?? input.test.shiftsPerDay, 0, t.packSecPerUnit, t.packOperators, `Label and pack, ${t.packOperators} operators`);

  const totalHours = stages.reduce((s, x) => s + x.hours, 0);
  const totalShifts = stages.reduce((s, x) => s + x.shifts, 0);
  const bottleneck = [...stages].sort((a, b) => b.hours - a.hours)[0]?.key ?? null;
  return {
    qty,
    hoursPerShift,
    stages,
    totalHours,
    totalShifts,
    days: stages.reduce((s, x) => s + x.days, 0),
    bottleneck,
    daysAt: [1, 2, 3].map((n) => ({ shiftsPerDay: n, days: totalShifts / n })),
  };
}
