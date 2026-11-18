import { describe, expect, it } from "vitest";
import { MORE, WORKFLOW, locate, neighbours, sectionHref, sectionStates, stepProgress, stepState, type StepFacts } from "@/lib/bom/workflow";

describe("the BoM process, in seven steps", () => {
  it("runs BoM → Gerber → Footprint & mismatch → Components → Line possible → Bare board → Estimate & quote, with no box or SMT line step", () => {
    expect(WORKFLOW.map((s) => `${s.n}:${s.key}`)).toEqual(["1:bom", "2:gerbers", "3:footprint", "4:parts", "5:lines", "6:board", "7:quote"]);
    expect(WORKFLOW.map((s) => s.label)).toEqual(["BoM", "Gerber", "Footprint & mismatch", "Components", "Line possible", "Bare board", "Estimate & quote"]);
    expect(WORKFLOW.map((s) => s.sections.map((x) => x.key))).toEqual([["bom"], ["gerbers"], ["match", "mismatch"], ["parts"], ["lines", "route"], ["board"], ["feasibility", "quote"]]);
    expect(WORKFLOW.some((s) => s.sections.some((x) => x.key === "box" || x.key === "line"))).toBe(false);
    expect(WORKFLOW.filter((s) => s.optional)).toEqual([]);
    expect(MORE.map((v) => v.key)).toEqual(["analysis", "supply", "viewer"]);
  });

  it("places every page of a BoM in its step and section, or its view", () => {
    const at = (rest: string) => {
      const { step, section, view } = locate(rest);
      return step ? `${step.key}/${section?.key}` : (view?.key ?? null);
    };
    expect(at("")).toBe("bom/bom");
    expect(at("/")).toBe("bom/bom");
    expect(at("/map")).toBe("bom/bom");
    expect(at("/diff")).toBe("bom/bom");
    expect(at("/board")).toBe("gerbers/gerbers");
    expect(at("/build/parts")).toBe("parts/parts");
    expect(at("/match")).toBe("footprint/match");
    expect(at("/mismatch")).toBe("footprint/mismatch");
    expect(at("/lines")).toBe("lines/lines");
    expect(at("/route")).toBe("lines/route");
    expect(at("/feasibility")).toBe("quote/feasibility");
    expect(at("/build")).toBe("board/board");
    expect(at("/build/board")).toBe("board/board");
    expect(at("/build/quote")).toBe("quote/quote");
    expect(at("/build/print")).toBe("quote/quote");
    expect(at("/viewer")).toBe("viewer");
    expect(locate("/viewer").step).toBeNull();
  });

  it("sends a section's address to its step's page, query kept", () => {
    expect(sectionHref("r1", "parts", { line: "abc", show: "short" })).toBe("/boms/r1/build/parts?line=abc&show=short#components");
    expect(sectionHref("r1", "mismatch")).toBe("/boms/r1/match#mismatches");
    expect(sectionHref("r1", "route", { qty: "500" })).toBe("/boms/r1/lines?qty=500#route");
    // The SMT line runs in the 3D view.
    expect(sectionHref("r1", "line", { smt: "L2" })).toBe("/boms/r1/viewer?smt=L2#smt-line");
    expect(sectionHref("r1", "board")).toBe("/boms/r1/build/board#bare-board");
    expect(sectionHref("r1", "quote", { tag: ["a", "b"], none: undefined })).toBe("/boms/r1/feasibility?tag=a&tag=b#quote");
  });

  it("knows what comes before and after", () => {
    const board = WORKFLOW.find((s) => s.key === "board")!;
    expect(neighbours(board)).toMatchObject({ prev: { key: "lines" }, next: { key: "quote" } });
    expect(neighbours(WORKFLOW[0]).prev).toBeNull();
    expect(neighbours(WORKFLOW[WORKFLOW.length - 1]).next).toBeNull();
  });
});

describe("how far a BoM has got", () => {
  const facts = (over: Partial<StepFacts> = {}): StepFacts => ({ mapped: true, lines: 16, unmatched: 0, gerbers: true, placements: 33, match: { level: "green", hasBoard: true, note: "33 of 33 footprints match" }, mismatch: { level: "green", total: 0, note: "No mismatches" }, review: null, draft: null, ...over });

  it("judges each section", () => {
    const s = sectionStates(facts({ review: { passed: true, signed: 9, gates: 9 }, draft: { board: true, box: true, issued: true } }));
    expect([s.bom?.state, s.gerbers?.state, s.match?.state, s.mismatch?.state, s.feasibility?.state, s.board?.state, s.box?.state, s.quote?.state]).toEqual(["done", "done", "done", "done", "done", "done", "done", "done"]);
    expect(sectionStates(facts({ mapped: false })).bom).toEqual({ state: "attention", note: "Columns still to map" });
    expect(sectionStates(facts({ placements: 0 })).gerbers?.state).toBe("attention");
    expect(sectionStates(facts({ match: null })).match).toBeNull();
    expect(sectionStates(facts({ review: { passed: false, signed: 3, gates: 9 } })).feasibility).toEqual({ state: "attention", note: "3 of 9 gates signed" });
    const none = sectionStates(facts({ gerbers: false, placements: 0 }));
    expect([none.lines, none.parts, none.box, none.quote, none.route, none.line]).toEqual([null, null, null, null, null, null]);
  });

  it("rolls the sections up into the step, naming the section that needs a look", () => {
    const step = (key: string) => WORKFLOW.find((s) => s.key === key)!;
    // A one-section step keeps the section's own words.
    expect(stepState(step("bom"), sectionStates(facts({ unmatched: 2 })))).toEqual({ state: "attention", note: "2 lines not matched to a part" });
    expect(stepState(step("gerbers"), sectionStates(facts({ gerbers: false, placements: 0 })))).toEqual({ state: "todo", note: "No Gerbers yet — the board is drawn from the project spec" });
    expect(stepState(step("footprint"), sectionStates(facts({ mismatch: { level: "red", total: 3, note: "3 mismatches to settle" } })))).toEqual({ state: "attention", note: "Mismatches: 3 mismatches to settle" });
    // The bare board is its own step now.
    expect(stepState(step("board"), sectionStates(facts()))).toEqual({ state: "todo", note: "Cheapest fab that fits, until one is chosen" });
    // Some sections done, others not started: the step needs a look, at the one not started.
    expect(stepState(step("quote"), sectionStates(facts({ review: { passed: false, signed: 0, gates: 9 }, draft: { board: false, box: false, issued: true } })))).toEqual({ state: "attention", note: "Estimate: Not reviewed yet" });
    // Nothing started at all: to do.
    expect(stepState(step("quote"), sectionStates(facts()))?.state).toBe("todo");
    // A step with no section the data can judge says nothing.
    expect(stepState(step("lines"), sectionStates(facts()))).toBeNull();
    expect(stepState(step("parts"), sectionStates(facts()))).toBeNull();
  });

  it("counts the steps done and names the next one, never an unknown one", () => {
    const fresh = stepProgress(sectionStates(facts()));
    expect(fresh.steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect([fresh.done, fresh.look]).toEqual([3, 0]);
    expect(fresh.next).toMatchObject({ n: 6, key: "board", path: "/build/board", state: "todo" });

    // The earliest step that needs a look comes first, even when later ones are done.
    const unmatched = stepProgress(sectionStates(facts({ unmatched: 1, review: { passed: true, signed: 9, gates: 9 }, draft: { board: true, box: false, issued: true } })));
    expect(unmatched.next).toMatchObject({ n: 1, key: "bom", note: "1 line not matched to a part" });
    expect(unmatched.look).toBe(1);

    // Everything known done: components and line possible have no state, and there is nothing to point at.
    const all = stepProgress(sectionStates(facts({ review: { passed: true, signed: 9, gates: 9 }, draft: { board: true, box: false, issued: true } })));
    expect(all.done).toBe(5);
    expect(all.steps.filter((s) => s.state === "unknown").map((s) => s.key)).toEqual(["parts", "lines"]);
    expect(all.next).toBeNull();
  });
});
