import { describe, expect, it } from "vitest";
import { processOf, stepAt } from "@/knowledge/machine-process";
import { LINES } from "../../prisma/seed-data/factory";
import { findLook } from "@/knowledge/machine-looks";
import { REAL_GAP, isSheetConveyor, itemSpan, layoutLine } from "@/lib/ops/line-layout";

describe("what each machine does to the board", () => {
  const kinds: [string, string][] = [
    ["LASER_MARKER", "Lative F20"],
    ["STENCIL_PRINTER", "GD450"],
    ["SPI", "ICON"],
    ["PICK_AND_PLACE", "YSM20R"],
    ["REFLOW_OVEN", "TW-VP860N"],
    ["AOI", "V5000"],
    ["OTHER", "0.6 m link conveyor"],
    ["OTHER", "1 m link conveyor (inspection)"],
    ["OTHER", "1 m cooling conveyor"],
    ["OTHER", "Bench"],
  ];

  it("gives every kind a description and steps whose shares of one board's time add up to 1", () => {
    for (const [type, model] of kinds) {
      const p = processOf(type, model);
      expect(p.what.length, `${type} ${model}`).toBeGreaterThan(30);
      expect(p.short.length).toBeGreaterThan(10);
      expect(p.steps.length).toBeGreaterThanOrEqual(3);
      expect(p.steps.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 6);
    }
  });

  it("tells the three conveyors apart by what the model says", () => {
    expect(processOf("OTHER", "1 m link conveyor (inspection)").steps[1].title).toBe("Look");
    expect(processOf("OTHER", "1 m cooling conveyor").steps[1].title).toBe("Cool");
    expect(processOf("OTHER", "0.6 m link conveyor").steps[1].title).toBe("Carry");
  });

  it("finds the step a machine is at, part of the way through a board", () => {
    const { steps } = processOf("STENCIL_PRINTER", "GD450");
    expect(stepAt(steps, 0)).toBe(0);
    expect(steps[stepAt(steps, 0.5)].title).toBe("Print");
    expect(stepAt(steps, 0.999)).toBe(steps.length - 1);
    expect(stepAt(steps, 1)).toBe(steps.length - 1);
  });

  it("has a real process (not the fallback) for every machine on our lines", () => {
    for (const line of LINES) for (const m of line.machines) expect(processOf(m.type, m.model).what, `${m.vendor} ${m.model}`).not.toMatch(/not on file/);
  });
});

describe("a conveyor between every two machines", () => {
  const bridge = findLook("OTHER", "Ecopmin", "0.6 m link conveyor")!;

  it("stands a link conveyor between neighbours that have none on the sheet, on every line", () => {
    for (const line of LINES) {
      const machines = line.machines.map((m, i) => ({ id: `${line.name}-${i}`, type: m.type, vendor: m.vendor, model: m.model }));
      const { items, length } = layoutLine(machines, undefined, { bridge });
      const placed = items.filter((it) => it.kind !== "bridge");
      expect(placed.map((it) => it.m?.id)).toEqual(machines.map((m) => m.id));
      // Between any two machines there is now a conveyor: one from the sheet, or one drawn.
      for (let i = 1; i < items.length; i++) {
        const a = items[i - 1], b = items[i];
        const conveyor = (it: typeof a) => it.kind === "bridge" || (it.m ? isSheetConveyor(it.m) : true);
        expect(conveyor(a) || conveyor(b), `${line.name}: ${a.m?.model} → ${b.m?.model}`).toBe(true);
        expect(itemSpan(b)[0] - itemSpan(a)[1]).toBeCloseTo(REAL_GAP);
      }
      expect(itemSpan(items[items.length - 1])[1]).toBeCloseTo(length);
    }
  });

  it("draws none unless asked", () => {
    const machines = LINES[1].machines.map((m, i) => ({ id: String(i), type: m.type, vendor: m.vendor, model: m.model }));
    expect(layoutLine(machines).items.some((it) => it.kind === "bridge")).toBe(false);
  });
});
