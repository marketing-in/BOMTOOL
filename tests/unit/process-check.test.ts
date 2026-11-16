import { describe, expect, it } from "vitest";
import { buildRoute, isKeepOut, type RouteLine, type RoutePart } from "@/lib/ops/route";
import { checkProcess, orderIssues } from "@/lib/ops/process-check";
import { mockReview, reviewPrompt, REVIEW_TOOL } from "@/lib/assistant/process-review";
import { buildNeeds, type LineIn } from "@/lib/ops/machines";

const part = (refDes: string, o: Partial<RoutePart> = {}): RoutePart => ({ refDes, side: "TOP", mount: "SMD", pkg: "0603", family: "CHIP", pitchMm: null, category: "resistor-chip", msl: null, dnp: false, ...o });

const ROUTE_LINES: RouteLine[] = [
  { code: "L1", name: "SMT", type: "SMT", capability: { minChip: "0201", minPitchMm: 0.4, bga: true, doubleSided: true, maxBoardMm: [400, 300] }, machines: [{ type: "STENCIL_PRINTER", vendor: "DEK", model: "TQ" }, { type: "PICK_AND_PLACE", vendor: "ASM", model: "TX2" }, { type: "REFLOW_OVEN", vendor: "Heller", model: "1913" }, { type: "AOI", vendor: "KY", model: "Zenith" }] },
  { code: "L3", name: "THT", type: "THT", capability: { wave: true }, machines: [{ type: "WAVE_SOLDER", vendor: "Ersa", model: "POWERFLOW" }, { type: "CONFORMAL_COATER", vendor: "PVA", model: "Delta 8" }, { type: "FLYING_PROBE", vendor: "Takaya", model: "APT" }] },
];

const asLines = (machines: Record<string, { type: string; vendor: string; model: string; specs?: unknown }[]>): LineIn[] =>
  Object.entries(machines).map(([code, ms]) => ({ id: code, code, name: code, type: code === "L3" ? "THT" : "SMT", capability: {}, machines: ms.map((m, i) => ({ ...m, position: i + 1, specs: m.specs ?? null })) }));

describe("masking and non-masking in the route", () => {
  it("knows which parts coating must not reach", () => {
    expect(isKeepOut({ category: "connector-header", mount: "THT" })).toBe(true);
    expect(isKeepOut({ category: "relay", mount: "THT" })).toBe(true);
    expect(isKeepOut({ category: "sensor", mount: "SMD" })).toBe(true);
    expect(isKeepOut({ category: "resistor-chip", mount: "SMD" })).toBe(false);
  });

  it("masks keep-outs before coating, de-masks after, and tests before coating", () => {
    const parts = [part("R1"), part("J1", { mount: "THT", category: "connector-header" }), part("K1", { mount: "THT", category: "relay" })];
    const route = buildRoute({ parts, board: { layers: 2, finish: "HASL", widthMm: 80, heightMm: 60 }, stage: "NPI", buildQty: 100, coating: "acrylic", lines: ROUTE_LINES });
    const keys = route.map((s) => s.key);
    expect(keys.indexOf("flying-probe")).toBeLessThan(keys.indexOf("coat"));
    expect(keys.indexOf("mask-coat")).toBe(keys.indexOf("coat") - 1);
    expect(keys.indexOf("demask-coat")).toBe(keys.indexOf("coat") + 1);
    expect(route.find((s) => s.key === "mask-coat")!.refs).toEqual(["J1", "K1"]);
    expect(route.find((s) => s.key === "coat")!.masking).toMatchObject({ needed: true });
    expect(keys.slice(-3)).toEqual(["inspect", "pack", "dispatch"]);
  });

  it("coats without masking when nothing must be kept clear", () => {
    const route = buildRoute({ parts: [part("R1"), part("U1", { category: "op-amp" })], board: { layers: 2, finish: "HASL", widthMm: 80, heightMm: 60 }, stage: "NPI", buildQty: 100, coating: "acrylic", lines: ROUTE_LINES });
    expect(route.some((s) => s.key.startsWith("mask-"))).toBe(false);
    expect(route.find((s) => s.key === "coat")!.masking).toEqual({ needed: false, what: "no masking: no connectors, switches, relays or sensors to keep clear" });
  });

  it("masks press-fit holes before the wave; selective needs no mask", () => {
    const wave = buildRoute({ parts: [part("R1"), part("J1", { mount: "THT", category: "connector-header" }), part("P1", { mount: "PRESS_FIT", category: "connector-header" })], board: { layers: 4, finish: "ENIG", widthMm: 100, heightMm: 80 }, stage: "NPI", buildQty: 100, lines: ROUTE_LINES });
    expect(wave.map((s) => s.key)).toEqual(expect.arrayContaining(["mask-wave", "wave", "demask-wave", "press-fit"]));
    const k = wave.map((s) => s.key);
    expect(k.indexOf("mask-wave")).toBeLessThan(k.indexOf("wave"));
    expect(k.indexOf("demask-wave")).toBeLessThan(k.indexOf("press-fit"));
    const sel = buildRoute({ parts: [part("C9", { side: "BOTTOM" }), part("J1", { mount: "THT", category: "connector-header" })], board: { layers: 4, finish: "ENIG", widthMm: 100, heightMm: 80 }, stage: "NPI", buildQty: 100, lines: ROUTE_LINES });
    expect(sel.find((s) => s.key === "selective")!.masking).toMatchObject({ needed: false });
    expect(sel.some((s) => s.key === "mask-wave")).toBe(false);
  });
});

describe("the order rules", () => {
  it("accepts the route's own order", () => {
    const route = buildRoute({ parts: [part("R1"), part("J1", { mount: "THT", category: "connector-header" })], board: { layers: 2, finish: "HASL", widthMm: 80, heightMm: 60 }, stage: "NPI", buildQty: 100, coating: "acrylic", lines: ROUTE_LINES });
    expect(orderIssues(route)).toEqual([]);
  });

  it("catches test after coating, packing before inspection and dispatch before packing", () => {
    const issues = orderIssues([{ key: "clean" }, { key: "coat" }, { key: "ict" }, { key: "pack" }, { key: "inspect" }, { key: "dispatch" }, { key: "fct" }].map((s) => ({ ...s, masking: undefined })));
    const text = issues.map((i) => i.text).join(" | ");
    expect(text).toMatch(/In-circuit test runs after conformal coating/);
    expect(text).toMatch(/Packing comes before final inspection/);
    expect(text).toMatch(/Dispatch is not the last step/);
    expect(issues.find((i) => /In-circuit/.test(i.text))!.level).toBe("red");
  });

  it("wants a mask step when coating needs masking", () => {
    const issues = orderIssues([{ key: "coat", masking: { needed: true, what: "J1" } }]);
    expect(issues.map((i) => i.text)).toContain("Coating needs masking but there is no masking step before it.");
  });
});

describe("checkProcess: every step against the plant", () => {
  const parts = [part("R1"), part("J1", { mount: "THT", category: "connector-header" })];
  const route = buildRoute({ parts, board: { layers: 2, finish: "HASL", widthMm: 80, heightMm: 60 }, stage: "NPI", buildQty: 100, coating: "acrylic", lines: ROUTE_LINES });

  it("finds the machine for each step, benches for hand steps, and the fab as bought in", () => {
    const lines = asLines({
      L1: [{ type: "STENCIL_PRINTER", vendor: "DEK", model: "TQ" }, { type: "SPI", vendor: "KY", model: "8030" }, { type: "PICK_AND_PLACE", vendor: "ASM", model: "TX2" }, { type: "REFLOW_OVEN", vendor: "Heller", model: "1913" }, { type: "AOI", vendor: "KY", model: "Zenith" }],
      L3: [{ type: "WAVE_SOLDER", vendor: "Ersa", model: "POWERFLOW" }, { type: "WASHER", vendor: "PBT", model: "SWASH" }, { type: "CONFORMAL_COATER", vendor: "PVA", model: "Delta 8" }, { type: "FLYING_PROBE", vendor: "Takaya", model: "APT" }, { type: "FCT", vendor: "In-house", model: "Rig" }, { type: "DEPANELER", vendor: "LPKF", model: "CM" }],
    });
    const pc = checkProcess(route, lines, [80, 60]);
    const s = (k: string) => pc.steps.find((x) => x.key === k)!;
    expect(s("fab")).toMatchObject({ how: "bought-in", level: "green" });
    expect(s("print-top")).toMatchObject({ how: "machine", level: "green" });
    expect(s("print-top").machines[0]).toBe("L1 · DEK TQ");
    expect(s("mask-coat")).toMatchObject({ how: "bench", level: "green" });
    expect(s("coat").masking).toMatchObject({ needed: true });
    expect(s("dispatch")).toMatchObject({ how: "bench", level: "green" });
    expect(pc.level).toBe("green");
    expect(pc.summary).toMatch(/the order is correct/);
  });

  it("is red without a needed machine, amber with a slower way, red when the board is too big", () => {
    const noCoater = asLines({ L1: [{ type: "STENCIL_PRINTER", vendor: "DEK", model: "TQ" }, { type: "PICK_AND_PLACE", vendor: "ASM", model: "TX2" }, { type: "REFLOW_OVEN", vendor: "Heller", model: "1913" }], L3: [{ type: "SELECTIVE_SOLDER", vendor: "Ersa", model: "VERSAFLOW" }] });
    const pc = checkProcess(route, noCoater, [80, 60]);
    expect(pc.steps.find((x) => x.key === "coat")!.level).toBe("red");
    expect(pc.steps.find((x) => x.key === "wave")).toMatchObject({ level: "amber", note: "no wave — the selective machine can solder it, slower" });
    expect(pc.level).toBe("red");
    const small = asLines({ L1: [{ type: "STENCIL_PRINTER", vendor: "DEK", model: "TQ", specs: { maxBoardMm: [50, 50] } }] });
    expect(checkProcess(route, small, [80, 60]).steps.find((x) => x.key === "print-top")!).toMatchObject({ level: "red" });
  });
});

describe("the simulated AI review", () => {
  const parts = [part("R1"), part("J1", { mount: "THT", category: "connector-header" })];
  const route = buildRoute({ parts, board: { layers: 2, finish: "HASL", widthMm: 80, heightMm: 60 }, stage: "NPI", buildQty: 100, coating: "acrylic", lines: ROUTE_LINES });
  const lines = asLines({ L1: [{ type: "STENCIL_PRINTER", vendor: "DEK", model: "TQ" }, { type: "PICK_AND_PLACE", vendor: "ASM", model: "TX2" }, { type: "REFLOW_OVEN", vendor: "Heller", model: "1913" }] });
  const check = checkProcess(route, lines, [80, 60]);
  const needs = buildNeeds([], { widthMm: 80, heightMm: 60, thicknessMm: 1.6 });
  const input = { product: "Test board rev A", route, needs, check, lines: [{ code: "L1", name: "SMT", type: "SMT", machines: ["STENCIL_PRINTER: DEK TQ"] }] };

  it("turns the check into a review: verdict, findings, masking, test and dispatch", () => {
    const r = mockReview(input);
    expect(r.verdict).toBe("not_ready");
    expect(r.findings.some((f) => f.step.startsWith("Conformal coating") && f.level === "red")).toBe(true);
    expect(r.masking).toMatch(/Masking before coating — J1/);
    expect(r.test).toMatch(/Flying probe test/);
    expect(r.dispatch).toMatch(/Final inspection, packing and dispatch are all in the route/);
  });

  it("sends the route, machines and check — and a strict tool to record the review", () => {
    const p = reviewPrompt(input);
    expect(p).toContain("Masking before coating");
    expect(p).toContain("STENCIL_PRINTER: DEK TQ");
    expect(REVIEW_TOOL.input_schema.additionalProperties).toBe(false);
    expect(REVIEW_TOOL.input_schema.required).toEqual(["verdict", "summary", "findings", "masking", "test", "dispatch"]);
  });
});
