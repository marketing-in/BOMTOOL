import { describe, expect, it } from "vitest";
import type { MatchStatus } from "@/lib/board/footprint-match";
import { BLINK_STEADY, FLY, SETTLE, TREATMENT, blinkAt, deepen, finalFx, fittedForCheck, flyAt, markFor, planFlyIn, type FlyRef } from "@/lib/board/fly-in";

const at = (ref: string, status: MatchStatus, x: number | null, y: number | null, side: string | null = "TOP"): FlyRef => ({ ref, status, x, y, side: x === null ? null : side });

const COLORS = { green: "#6fcf8e", red: "#f07a70", tint: "#b92d2d", ochre: "#b8860b" };

describe("the 3D fly-in plan", () => {
  // Placement frame: y up, so (2, 38) is the board's top-left corner.
  const refs = [
    at("C1", "match", 30, 10),
    at("R1", "match", 2, 38),
    at("U1", "mismatch", 20, 20),
    at("R9", "check", 40, 30),
    at("TP1", "not-in-bom", 45, 5),
    at("C7", "match", 3, 37, "BOTTOM"),
    at("C99", "not-on-board", null, null),
  ];
  const plan = planFlyIn(refs);

  it("sweeps the top side from the top-left corner, then the bottom, and keeps unplaced designators for the feeder", () => {
    expect(plan.parts[0].ref).toBe("R1");
    expect(plan.parts.at(-1)!.ref).toBe("C7");
    expect(plan.parts.at(-1)!.bottom).toBe(true);
    expect(plan.parts).toHaveLength(6);
    expect(plan.feeder.map((f) => f.ref)).toEqual(["C99"]);
    expect(plan.feeder[0].at).toBeGreaterThanOrEqual(Math.max(...plan.parts.map((p) => p.land)));
  });

  it("looks parts up by designator whatever the case", () => {
    expect(plan.byRef.U1.treatment).toBe("blink");
    expect(planFlyIn([at("c3", "check", 1, 1)]).byRef.C3.ref).toBe("c3");
  });

  it("maps every result to what it does on the board", () => {
    expect(TREATMENT).toEqual({ match: "glow", check: "outline", mismatch: "blink", "not-in-bom": "bare", "not-on-board": "feeder" });
  });

  it("settles in about 2–4 s whatever the part count, with each part setting off no earlier than the one before", () => {
    for (const n of [12, 76, 300, 3000]) {
      const many = Array.from({ length: n }, (_, k) => at(`R${k}`, k % 9 ? "match" : "mismatch", (k % 40) * 2.5, Math.floor(k / 40) * 2.5));
      const p = planFlyIn(many);
      expect(p.duration).toBeGreaterThanOrEqual(2);
      expect(p.duration).toBeLessThanOrEqual(4);
      for (let k = 1; k < p.parts.length; k++) expect(p.parts[k].start).toBeGreaterThanOrEqual(p.parts[k - 1].start);
    }
  });
});

describe("a part through its flight", () => {
  const plan = planFlyIn([at("C1", "match", 10, 10), at("U1", "mismatch", 20, 20), at("R9", "check", 30, 5), at("TP1", "not-in-bom", 5, 25)]);
  const C1 = plan.byRef.C1;

  it("is not there before its turn, then flies down from above and is never half see-through", () => {
    expect(flyAt(C1, C1.start - 0.01).shown).toBe(false);
    const mid = flyAt(C1, C1.start + FLY / 2);
    expect(mid.shown).toBe(true);
    expect(mid.lift).toBeGreaterThan(0);
    expect(mid.lift).toBeLessThan(1);
    // Ease-out: more than half way down at half time.
    expect(mid.lift).toBeLessThan(0.5);
    expect(mid.spin).toBeGreaterThan(0);
  });

  it("lands on its pads, presses into the paste for a moment, glows green briefly, then is plain", () => {
    const down = flyAt(C1, C1.land);
    expect(down).toMatchObject({ lift: 0, dx: 0, dz: 0, spin: 0 });
    expect(flyAt(C1, C1.land + SETTLE / 3).squash).toBeGreaterThan(0);
    expect(flyAt(C1, C1.land + SETTLE).squash).toBe(0);
    expect(flyAt(C1, C1.land + 0.12).glow).toBeCloseTo(1, 2);
    expect(flyAt(C1, C1.settle)).toEqual(finalFx(C1));
    expect(finalFx(C1)).toMatchObject({ shown: true, glow: 0, mark: 0 });
  });

  it("keeps the outline of a mismatch and of a check by eye once landed", () => {
    const U1 = plan.byRef.U1;
    expect(flyAt(U1, U1.land - 0.05).mark).toBe(0);
    expect(flyAt(U1, U1.land + SETTLE).mark).toBe(1);
    expect(flyAt(U1, Infinity)).toMatchObject({ shown: true, mark: 1, glow: 0 });
    expect(flyAt(plan.byRef.R9, Infinity)).toMatchObject({ shown: true, mark: 1 });
  });

  it("leaves a part with no BoM line as bare pads whose outline comes up in its turn", () => {
    const TP1 = plan.byRef.TP1;
    expect(flyAt(TP1, TP1.start - 0.01)).toMatchObject({ shown: false, mark: 0 });
    expect(flyAt(TP1, TP1.land)).toMatchObject({ shown: false, mark: 1 });
    expect(flyAt(TP1, Infinity)).toMatchObject({ shown: false, mark: 1 });
  });
});

describe("result marks", () => {
  it("blinks at 1 Hz, full red on the second and dim on the half second; steady with reduced motion", () => {
    expect(blinkAt(0)).toBeCloseTo(1);
    expect(blinkAt(0.5)).toBeCloseTo(0);
    expect(blinkAt(3)).toBeCloseTo(1);
    expect(BLINK_STEADY).toBe(1);
  });

  it("gives each result its colour: green glow, ochre outline, blinking red, dotted red round bare pads", () => {
    expect(markFor("match", COLORS)).toEqual({ color: COLORS.green, glow: COLORS.green });
    expect(markFor("check", COLORS)).toEqual({ color: "#b8860b", ring: "solid" });
    expect(markFor("mismatch", COLORS)).toMatchObject({ ring: "solid", blink: true, tint: COLORS.tint });
    expect(markFor("not-in-bom", COLORS)).toMatchObject({ ring: "dotted", empty: true });
    expect(markFor("not-on-board", COLORS)).toBeNull();
  });
});

describe("parts the check judged", () => {
  it("draws a designator on a fitted and a DNP line as fitted, and leaves DNP-only parts as footprints", () => {
    const parts = [
      { ref: "R5", dnp: true, x: 1 },
      { ref: "r6", dnp: true, x: 2 },
      { ref: "C1", x: 3 },
    ];
    const out = fittedForCheck(parts, new Set(["R5", "C1"]));
    expect(out.map((p) => [p.ref, !!p.dnp])).toEqual([
      ["R5", false],
      ["r6", true],
      ["C1", false],
    ]);
    // Parts left as they were are the same objects (the studio rebuilds only on a real change).
    expect(out[1]).toBe(parts[1]);
    expect(out[2]).toBe(parts[2]);
    expect(fittedForCheck([{ ref: "r6", dnp: true }], new Set(["R6"]))[0].dnp).toBe(false);
  });
});

describe("the body tint", () => {
  it("keeps the red token's hue but makes it deep enough to read as red under the lights", () => {
    const t = deepen("#f07a70");
    const v = parseInt(t.slice(1), 16);
    const [r, g, b] = [v >> 16, (v >> 8) & 255, v & 255];
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
    expect(deepen("not a colour")).toBe("not a colour");
  });
});
