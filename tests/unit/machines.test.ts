import { describe, expect, it } from "vitest";
import { LINES } from "../../prisma/seed-data/factory";
import { LINE_CAP_FIELDS, buildNeeds, checkLine, checkPlant, effectiveCapability, mergeCapability, readSpecs, rolesOfType, specCoverage, specsFromLimits, writeSpecs, type BuildNeeds, type LineIn } from "@/lib/ops/machines";
import { LookupResult, RECORD_TOOL, lookupPrompt, toSpecs, typicalLookup } from "@/lib/assistant/machine-lookup";
import type { AsmPart } from "@/lib/feasibility/joints";

const line = (code: string, type: string, machines: [string, Record<string, unknown>?][], capability: Record<string, unknown> = {}): LineIn => ({
  id: code,
  code,
  name: `${code} line`,
  type,
  capability,
  machines: machines.map(([t, specs], i) => ({ type: t, vendor: "Maker", model: `${t} ${i + 1}`, position: i + 1, specs: specs ?? null })),
});

const SMT = line("L1", "SMT", [
  ["STENCIL_PRINTER", { maxBoardMm: [510, 510], minBoardMm: [50, 50], maxThicknessMm: 6 }],
  ["SPI", { maxBoardMm: [510, 460] }],
  ["PICK_AND_PLACE", { minChip: "0402", minPitchMm: 0.5, maxComponentHeightMm: 6, maxBoardMm: [510, 460] }],
  ["PICK_AND_PLACE", { minChip: "0201", minPitchMm: 0.4, maxComponentMm: [50, 50], maxComponentHeightMm: 15, maxBoardMm: [460, 400] }],
  ["REFLOW_OVEN", { maxBoardMm: [600, 500], maxComponentHeightMm: 30, nitrogen: true }],
  ["AOI", { maxBoardMm: [510, 460] }],
]);

const needs = (over: Partial<BuildNeeds["smt"]> = {}, rest: Partial<BuildNeeds> = {}): BuildNeeds => ({
  boardMm: [100, 80],
  thicknessMm: 1.6,
  smt: { placements: 40, sides: 1, smallestChip: "0402", finestPitchMm: 0.5, hidden: 0, hasBga: false, tallestMm: 5, largestMm: [10, 10], ...over },
  tht: { parts: 0 },
  pressFit: 0,
  coating: false,
  ict: false,
  box: false,
  ...rest,
});

describe("machine limits", () => {
  it("reads limits, ignores junk and keeps other keys", () => {
    const r = readSpecs({ minChip: "0201", minPitchMm: "0.4", maxBoardMm: [510, 460], cph: -5, nitrogen: "yes", heads: 2, source: { by: "claude", at: "x" } });
    expect(r.specs).toEqual({ minChip: "0201", minPitchMm: 0.4, maxBoardMm: [510, 460] });
    expect(r.extra).toEqual({ heads: 2 });
    expect(r.source?.by).toBe("claude");
    expect(readSpecs(null).specs).toEqual({});
    expect(readSpecs({ minChip: "0302", maxBoardMm: [1] }).specs).toEqual({});
  });

  it("stores only the fields that kind of machine has", () => {
    const out = writeSpecs("REFLOW_OVEN", { zones: 10, minChip: "0201", nitrogen: true }, { by: "manual", at: "t" }, { coolingZones: 3 });
    expect(out).toEqual({ coolingZones: 3, zones: 10, nitrogen: true, source: { by: "manual", at: "t" } });
    expect(specCoverage("REFLOW_OVEN", { zones: 10 })).toEqual({ have: 1, of: 4 });
  });
});

describe("a line's capability from its machines", () => {
  it("takes the best placer, the smallest conveyor and the machines present", () => {
    const c = effectiveCapability(SMT);
    expect(c.minChip).toBe("0201");
    expect(c.minPitchMm).toBe(0.4);
    expect(c.maxBoardMm).toEqual([460, 400]);
    expect(c.minBoardMm).toEqual([50, 50]);
    expect(c.maxComponentHeightMm).toBe(15);
    expect(c.nitrogenReflow).toBe(true);
    expect(c.doubleSided).toBe(true);
    expect(c.bga).toBeUndefined();
  });

  it("lets the line's summary fill what no machine states", () => {
    const c = effectiveCapability(line("L9", "SMT", [["PICK_AND_PLACE"], ["XRAY"]], { minChip: "0603", maxBoardMm: [300, 200], doubleSided: false }));
    expect(c.minChip).toBe("0603");
    expect(c.maxBoardMm).toEqual([300, 200]);
    expect(c.bga).toBe(true);
    expect(c.doubleSided).toBe(false);
    expect(c.fromMachines).toEqual(["bga"]);
  });

  it("keeps the line's board size while some conveyor machine has none on file", () => {
    const partial = line("L8", "SMT", [["STENCIL_PRINTER", { maxBoardMm: [600, 510] }], ["PICK_AND_PLACE", { minChip: "0201" }], ["REFLOW_OVEN"]], { maxBoardMm: [510, 460], maxComponentHeightMm: 25 });
    const c = effectiveCapability(partial);
    expect(c.maxBoardMm).toEqual([510, 460]);
    expect(c.fromMachines).not.toContain("maxBoardMm");
    expect(c.maxComponentHeightMm).toBe(25);
    // With no summary to fall back on, what the machines do state is still used.
    expect(effectiveCapability({ ...partial, capability: {} }).maxBoardMm).toEqual([600, 510]);
  });

  it("adds up to the summaries on the seeded lines", () => {
    for (const l of LINES) {
      const c = effectiveCapability({ type: l.type, capability: l.capability, machines: l.machines.map((m, i) => ({ ...m, position: i + 1, specs: m.specs ?? null })) });
      for (const k of ["minChip", "minPitchMm", "maxBoardMm", "minBoardMm", "maxComponentHeightMm", "bga"]) expect([l.code, k, c[k as keyof typeof c]]).toEqual([l.code, k, l.capability[k]]);
    }
  });
});

describe("editing a line's own summary", () => {
  it("applies valid values, clears empty ones and keeps keys the form does not show", () => {
    const merged = mergeCapability(
      { minChip: "0402", minPitchMm: 0.5, bga: true, torqueControlled: true },
      { minChip: "0201", minPitchMm: null, maxBoardMm: [510, 460], bga: false, doubleSided: "yes", pressFit: true },
    );
    expect(merged).toEqual({ minChip: "0201", maxBoardMm: [510, 460], bga: false, torqueControlled: true, pressFit: true });
    expect(mergeCapability(null, { minChip: "0302", maxBoardMm: [10] })).toEqual({});
  });

  it("shows each type of line only the fields that apply", () => {
    expect(rolesOfType("MIXED")).toEqual(["smt", "tht"]);
    const smt = LINE_CAP_FIELDS.filter((f) => f.roles.includes("smt")).map((f) => f.key);
    expect(smt).toContain("minChip");
    expect(smt).not.toContain("wave");
    expect(LINE_CAP_FIELDS.filter((f) => f.roles.includes("box")).map((f) => f.key)).toEqual(["harness"]);
  });

  it("feeds what is typed back into the check", () => {
    const l = line("L5", "SMT", [["STENCIL_PRINTER"], ["PICK_AND_PLACE"], ["REFLOW_OVEN"]], mergeCapability({}, { minChip: "0603" }));
    expect(checkLine(l, needs({ smallestChip: "0402" }), new Set()).steps.find((s) => s.stage === "place")!.level).toBe("red");
  });
});

describe("what a board needs", () => {
  const part = (refDes: string, over: Partial<AsmPart> & { heightMm?: number }): AsmPart & { heightMm?: number } => ({ refDes, side: "TOP", mount: "SMT", kind: "chip", pkg: "0603", pins: 2, pitchMm: 0, lengthMm: 1.6, widthMm: 0.8, ...over });
  it("reads chips, pitch, hidden joints, height, sides and through-hole", () => {
    const n = buildNeeds(
      [
        part("C1", { pkg: "0402" }),
        part("C2", { pkg: "0201", side: "BOTTOM" }),
        part("U1", { kind: "quad", pkg: "QFP-64", pins: 64, pitchMm: 0.5, lengthMm: 12, widthMm: 12, heightMm: 1.6 }),
        part("U2", { kind: "array", pkg: "BGA-100", pins: 100, pitchMm: 0.8, lengthMm: 10, widthMm: 10 }),
        part("K1", { kind: "generic", pkg: "Relay", heightMm: 15.5, lengthMm: 20, widthMm: 10 }),
        part("J1", { mount: "THT", kind: "connector", pkg: "Header", pins: 10 }),
      ],
      { widthMm: 120, heightMm: 90, thicknessMm: 1.6 },
      { coating: true },
    );
    expect(n.boardMm).toEqual([120, 90]);
    expect(n.smt.placements).toBe(5);
    expect(n.smt.sides).toBe(2);
    expect(n.smt.smallestChip).toBe("0201");
    expect(n.smt.finestPitchMm).toBe(0.5);
    expect(n.smt.hasBga).toBe(true);
    expect(n.smt.hidden).toBeGreaterThanOrEqual(1);
    expect(n.smt.tallestMm).toBe(15.5);
    expect(n.smt.largestMm).toEqual([20, 10]);
    expect(n.tht.parts).toBe(1);
    expect(n.coating).toBe(true);
  });
});

describe("judging a line step by step", () => {
  const plant = new Set(["XRAY"]);
  const level = (n: BuildNeeds, l: LineIn = SMT) => checkLine(l, n, plant);

  it("passes a board every machine takes", () => {
    const c = level(needs());
    expect(c.level).toBe("green");
    expect(c.roles).toEqual(["smt"]);
    expect(c.steps.map((s) => s.stage)).toEqual(["print", "spi", "place", "reflow", "aoi"]);
    expect(c.steps.find((s) => s.stage === "place")!.machines).toHaveLength(2);
  });

  it("stops a chip, pitch or board the machines cannot take, naming the machine", () => {
    const chip = level(needs({ smallestChip: "01005" }));
    expect(chip.level).toBe("red");
    expect(chip.steps.find((s) => s.stage === "place")!.reasons[0]).toMatch(/01005 chips are smaller than the 0201/);
    expect(level(needs({ finestPitchMm: 0.3 })).steps.find((s) => s.stage === "place")!.reasons[0]).toMatch(/0\.3 mm pitch is finer than the placers' 0\.4 mm/);
    const big = level(needs({}, { boardMm: [500, 450] }));
    expect(big.level).toBe("red");
    expect(big.steps.find((s) => s.stage === "place")!.reasons.join(" ")).toMatch(/PICK_AND_PLACE 4's 460×400 mm/);
    expect(big.steps.find((s) => s.stage === "print")!.level).toBe("green");
    expect(level(needs({ tallestMm: 20 })).steps.find((s) => s.stage === "place")!.level).toBe("red");
  });

  it("treats a too-small board as a panel away, not a stop", () => {
    const c = level(needs({}, { boardMm: [30, 20] }));
    expect(c.level).toBe("amber");
    expect(c.steps.find((s) => s.stage === "print")!.reasons).toEqual(["board 30×20 mm is under the 50×50 mm the line's machines take — run it in a panel or on a carrier"]);
    // Said once, where the board enters — not again at every machine.
    expect(c.steps.filter((s) => s.stage !== "print").flatMap((s) => s.reasons).join(" ")).not.toMatch(/panel/);
  });

  it("is amber when a limit is not on file, and red when a needed machine is missing", () => {
    const bare = line("L5", "SMT", [["STENCIL_PRINTER"], ["PICK_AND_PLACE"], ["REFLOW_OVEN"]]);
    const c = level(needs(), bare);
    expect(c.level).toBe("amber");
    expect(c.steps.find((s) => s.stage === "place")!.reasons).toContain("smallest chip the placers take is not on file");
    expect(c.steps.find((s) => s.stage === "spi")!.recommended).toBe(true);
    const noOven = line("L6", "SMT", [["STENCIL_PRINTER"], ["PICK_AND_PLACE"]]);
    expect(level(needs(), noOven).steps.find((s) => s.stage === "reflow")).toMatchObject({ level: "red", reasons: ["no reflow oven on this line"] });
  });

  it("judges by the line summary where the machines are silent", () => {
    const summary = line("L7", "SMT", [["STENCIL_PRINTER"], ["PICK_AND_PLACE"], ["REFLOW_OVEN"]], { minChip: "0402", minPitchMm: 0.5, maxBoardMm: [400, 300] });
    const place = level(needs({ smallestChip: "0201" }), summary).steps.find((s) => s.stage === "place")!;
    expect(place.level).toBe("red");
    expect(place.reasons[0]).toMatch(/\(line summary\)$/);
  });

  it("sends hidden joints to X-ray: on the line, elsewhere in the plant, or nowhere", () => {
    const bga = needs({ hidden: 2, hasBga: true });
    expect(level(bga).steps.find((s) => s.stage === "xray")).toMatchObject({ level: "amber" });
    expect(checkLine(SMT, bga, new Set()).steps.find((s) => s.stage === "xray")).toMatchObject({ level: "red" });
    const withXray = { ...SMT, machines: [...SMT.machines, { type: "XRAY", vendor: "N", model: "Q7", position: 9, specs: { maxBoardMm: [500, 400] } }] };
    expect(level(bga, withXray).steps.find((s) => s.stage === "xray")!.level).toBe("green");
  });

  it("checks through-hole, press-fit, coating and test on a THT line", () => {
    const tht = line("L3", "THT", [["WAVE_SOLDER", { maxBoardMm: [450, 400] }], ["PRESS_FIT"]]);
    const n = needs({ placements: 0 }, { tht: { parts: 4 }, pressFit: 2, coating: true, ict: true });
    const c = level(n, tht);
    expect(c.roles).toEqual(["tht"]);
    // The press has no board size on file: amber, it cannot be confirmed.
    expect(c.steps.map((s) => [s.stage, s.level])).toEqual([["tht-solder", "green"], ["press-fit", "amber"], ["coat", "red"], ["test", "amber"]]);
    expect(c.steps[1].reasons).toEqual(["Maker PRESS_FIT 2: largest board not on file"]);
    expect(level(needs(), tht).level).toBe("na");
    // A through-hole line's own board size speaks for its machines that have none on file.
    const summed = line("L3", "THT", [["WAVE_SOLDER"], ["PRESS_FIT"]], { maxBoardMm: [508, 457] });
    expect(level(needs({ placements: 0 }, { tht: { parts: 4 }, pressFit: 2 }), summed).level).toBe("green");
    expect(level(needs({ placements: 0 }, { tht: { parts: 4 }, boardMm: [600, 300] }), summed).steps[0].reasons[0]).toMatch(/\(line summary\)$/);
  });
});

describe("the plant's answer", () => {
  const THT = line("L3", "THT", [["WAVE_SOLDER", { maxBoardMm: [450, 400] }]]);
  const SMALL = line("L2", "SMT", [["STENCIL_PRINTER", { maxBoardMm: [300, 250] }], ["PICK_AND_PLACE", { minChip: "0603", minPitchMm: 0.65 }], ["REFLOW_OVEN"]]);

  it("picks a line for each role, the best first", () => {
    const p = checkPlant([SMALL, SMT, THT], needs({}, { tht: { parts: 3 } }));
    expect(p.level).toBe("green");
    expect(p.use).toEqual({ smt: "L1", tht: "L3" });
    expect(p.summary).toBe("Our machines can build it: L1 for the surface-mount side, L3 for through-hole, coating and test.");
  });

  it("lets the line the route planned win a tie, never a worse fit", () => {
    const TWIN: LineIn = { ...SMT, id: "L5", code: "L5", name: "L5 line" };
    // Two lines that fit equally well: the first on file unless the route planned the other.
    expect(checkPlant([SMT, TWIN], needs()).use).toEqual({ smt: "L1" });
    expect(checkPlant([SMT, TWIN], needs(), { smt: "L5" }).use).toEqual({ smt: "L5" });
    // A planned line that fits worse does not push out one that fits.
    const p = checkPlant([SMT, SMALL], needs({ smallestChip: "0402" }), { smt: "L2" });
    expect(p.use).toEqual({ smt: "L1" });
    expect(p.level).toBe("green");
  });

  it("says why when no line can, and leaves retired lines out", () => {
    const p = checkPlant([SMALL, { ...SMT, active: false }], needs({ smallestChip: "0201" }));
    expect(p.level).toBe("red");
    expect(p.lines.map((l) => l.code)).toEqual(["L2"]);
    expect(p.summary).toBe("Our machines cannot build it as it stands: no line can do the surface-mount side — L2: 0201 chips are smaller than the 0603 the placers take.");
    expect(checkPlant([THT], needs()).summary).toMatch(/no SMT line on file/);
    expect(checkPlant([SMT], needs({ placements: 0 })).summary).toMatch(/Nothing to assemble/);
  });
});

describe("looking a machine up", () => {
  it("asks for the limits that matter for that kind, with the knowledge base's list", () => {
    const p = lookupPrompt({ type: "PICK_AND_PLACE", vendor: "Yamaha", model: "YRM20" });
    expect(p).toContain("Machine: Yamaha YRM20");
    expect(p).toContain("Smallest chip");
    expect(p).toContain("Finest lead pitch (mm)");
    expect(p).toMatch(/What our knowledge base says matters for a pick-and-place machine/);
    expect(lookupPrompt({ type: "SCREWDRIVER_STATION", vendor: "D", model: "X" })).toContain("none in particular");
  });

  it("has a strict tool whose every object is closed and fully required", () => {
    const visit = (s: Record<string, unknown>): void => {
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        expect(Object.keys(s.properties as object).sort()).toEqual([...(s.required as string[])].sort());
      }
      for (const v of Object.values(s)) if (v && typeof v === "object") visit(v as Record<string, unknown>);
    };
    visit(RECORD_TOOL.input_schema as unknown as Record<string, unknown>);
    expect(RECORD_TOOL.strict).toBe(true);
  });

  it("checks a result's ranges and converts it to the machine's fields", () => {
    const r = typicalLookup({ type: "PICK_AND_PLACE", vendor: "Yamaha", model: "YRM20" });
    expect(LookupResult.parse(r)).toEqual(r);
    expect(r.confidence).toBe("low");
    expect(r.summary).toMatch(/not for the Yamaha YRM20 itself/);
    expect(toSpecs("PICK_AND_PLACE", r)).toMatchObject({ minChip: "0201", minPitchMm: 0.4, maxBoardMm: [460, 400] });
    expect(LookupResult.safeParse({ ...r, limits: { ...r.limits, minPitchMm: 40 } }).success).toBe(false);
    expect(specsFromLimits("REFLOW_OVEN", { ...r.limits, zones: 10 })).toEqual({ maxBoardMm: [460, 400], maxComponentHeightMm: 15, zones: 10 });
  });
});
