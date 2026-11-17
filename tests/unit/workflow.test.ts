import { describe, expect, it } from "vitest";
import { MORE, WORKFLOW, locate, neighbours, sectionHref, sectionStates, stepProgress, stepState, type StepFacts } from "@/lib/bom/workflow";

describe("the BoM process, in five steps", () => {
  it("runs BoM, Gerbers & components → compare & mismatches → estimate & quote → box (optional) → route & SMT line", () => {
    expect(WORKFLOW.map((s) => `${s.n}:${s.key}`)).toEqual(["1:files", "2:compare", "3:estimate", "4:box", "5:production"]);
    expect(WORKFLOW.map((s) => s.sections.map((x) => x.key))).toEqual([["bom", "gerbers", "parts"], ["match", "mismatch"], ["feasibility", "board", "quote"], ["box"], ["route", "lines", "line"]]);
    expect(WORKFLOW.filter((s) => s.optional).map((s) => s.key)).toEqual(["box"]);
    expect(MORE.map((v) => v.key)).toEqual(["analysis", "supply", "reverse", "viewer"]);
  });

  it("places every page of a BoM in its step and section, or its view", () => {
    const at = (rest: string) => {
      const { step, section, view } = locate(rest);
      return step ? `${step.key}/${section?.key}` : (view?.key ?? null);
    };
    expect(at("")).toBe("files/bom");
    expect(at("/")).toBe("files/bom");
    expect(at("/map")).toBe("files/bom");
    expect(at("/diff")).toBe("files/bom");
    expect(at("/board")).toBe("files/gerbers");
    expect(at("/build/parts")).toBe("files/parts");
    expect(at("/match")).toBe("compare/match");
    expect(at("/mismatch")).toBe("compare/mismatch");
    expect(at("/feasibility")).toBe("estimate/feasibility");
    expect(at("/build")).toBe("estimate/board");
    expect(at("/build/board")).toBe("estimate/board");
    expect(at("/build/quote")).toBe("estimate/quote");
    expect(at("/build/print")).toBe("estimate/quote");
    expect(at("/build/box")).toBe("box/box");
    expect(at("/route")).toBe("production/route");
    expect(at("/lines")).toBe("production/lines");
    expect(at("/line")).toBe("production/line");
    expect(at("/viewer")).toBe("viewer");
    expect(locate("/viewer").step).toBeNull();
  });

  it("sends a section's old address to its step's page, query kept", () => {
    expect(sectionHref("r1", "parts", { line: "abc", show: "short" })).toBe("/boms/r1?line=abc&show=short#components");
    expect(sectionHref("r1", "mismatch")).toBe("/boms/r1/match#mismatches");
    expect(sectionHref("r1", "lines", { qty: "500" })).toBe("/boms/r1/route?qty=500#line-fit");
    expect(sectionHref("r1", "quote", { tag: ["a", "b"], none: undefined })).toBe("/boms/r1/feasibility?tag=a&tag=b#quote");
  });

  it("knows what comes before and after", () => {
    const est = WORKFLOW.find((s) => s.key === "estimate")!;
    expect(neighbours(est)).toMatchObject({ prev: { key: "compare" }, next: { key: "box" } });
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
    expect(stepState(step("files"), sectionStates(facts({ unmatched: 2 })))).toEqual({ state: "attention", note: "BoM: 2 lines not matched to a part" });
    expect(stepState(step("compare"), sectionStates(facts({ mismatch: { level: "red", total: 3, note: "3 mismatches to settle" } })))).toEqual({ state: "attention", note: "Mismatches: 3 mismatches to settle" });
    // Some sections done, others not started: the step needs a look, at the one not started.
    expect(stepState(step("files"), sectionStates(facts({ gerbers: false, placements: 0 })))).toEqual({ state: "attention", note: "Gerbers: No Gerbers yet — the board is drawn from the project spec" });
    // Nothing started at all: to do.
    expect(stepState(step("estimate"), sectionStates(facts()))?.state).toBe("todo");
    // A step with no section the data can judge says nothing.
    expect(stepState(step("production"), sectionStates(facts()))).toBeNull();
    // A one-section step keeps the section's own words.
    expect(stepState(step("box"), sectionStates(facts({ draft: { board: false, box: true, issued: false } })))).toEqual({ state: "done", note: "Box chosen" });
  });

  it("counts the steps done and names the next one, never an optional or unknown one", () => {
    const fresh = stepProgress(sectionStates(facts()));
    expect(fresh.steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect([fresh.done, fresh.look]).toEqual([2, 0]);
    expect(fresh.next).toMatchObject({ n: 3, key: "estimate", path: "/feasibility", state: "todo" });

    // The earliest step that needs a look comes first, even when later ones are done.
    const unmatched = stepProgress(sectionStates(facts({ unmatched: 1, review: { passed: true, signed: 9, gates: 9 }, draft: { board: true, box: true, issued: true } })));
    expect(unmatched.next).toMatchObject({ n: 1, key: "files", note: "BoM: 1 line not matched to a part" });
    expect(unmatched.look).toBe(1);

    // Everything known done: the box is done too, the route has no state, and there is nothing to point at.
    const all = stepProgress(sectionStates(facts({ review: { passed: true, signed: 9, gates: 9 }, draft: { board: true, box: true, issued: true } })));
    expect(all.done).toBe(4);
    expect(all.steps.filter((s) => s.state === "unknown").map((s) => s.key)).toEqual(["production"]);
    expect(all.next).toBeNull();

    // An unchosen box is optional and unknown: never the next step.
    expect(stepProgress(sectionStates(facts({ review: { passed: true, signed: 9, gates: 9 }, draft: { board: true, box: false, issued: true } }))).next).toBeNull();
  });
});
