import { describe, expect, it } from "vitest";
import { processOf, stepAt } from "@/knowledge/machine-process";
import { LINES } from "../../prisma/seed-data/factory";

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
