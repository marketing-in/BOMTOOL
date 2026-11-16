import { describe, expect, it } from "vitest";
import { MORE, WORKFLOW, locate, neighbours, stepProgress, stepStates, type StepFacts } from "@/lib/bom/workflow";

describe("the BoM process, in order", () => {
  it("runs files → footprint match → can we build it → board → parts → box → quote → production", () => {
    expect(WORKFLOW.map((s) => `${s.n}:${s.key}`)).toEqual(["1:bom", "2:gerbers", "3:match", "4:feasibility", "5:board", "6:parts", "7:box", "8:quote", "9:route", "10:line"]);
    expect(MORE.map((v) => v.key)).toEqual(["analysis", "supply", "reverse", "viewer"]);
  });

  it("places every page of a BoM in its step or view", () => {
    const at = (rest: string) => {
      const { step, view } = locate(rest);
      return step?.key ?? view?.key ?? null;
    };
    expect(at("")).toBe("bom");
    expect(at("/")).toBe("bom");
    expect(at("/map")).toBe("bom");
    expect(at("/diff")).toBe("bom");
    expect(at("/board")).toBe("gerbers");
    expect(at("/match")).toBe("match");
    expect(at("/feasibility")).toBe("feasibility");
    expect(at("/build")).toBe("board");
    expect(at("/build/board")).toBe("board");
    expect(at("/build/parts")).toBe("parts");
    expect(at("/build/print")).toBe("quote");
    expect(at("/route")).toBe("route");
    expect(at("/line")).toBe("line");
    expect(at("/viewer")).toBe("viewer");
    expect(locate("/viewer").step).toBeNull();
  });

  it("knows what comes before and after", () => {
    const feas = WORKFLOW.find((s) => s.key === "feasibility")!;
    expect(neighbours(feas)).toMatchObject({ prev: { key: "match" }, next: { key: "board" } });
    expect(neighbours(WORKFLOW.find((s) => s.key === "match")!)).toMatchObject({ prev: { key: "gerbers" }, next: { key: "feasibility" } });
    expect(neighbours(WORKFLOW[0]).prev).toBeNull();
    expect(neighbours(WORKFLOW[WORKFLOW.length - 1]).next).toBeNull();
  });
});

describe("how far a BoM has got", () => {
  const facts = (over: Partial<StepFacts> = {}): StepFacts => ({ mapped: true, lines: 16, unmatched: 0, gerbers: true, placements: 33, match: { level: "green", hasBoard: true, note: "33 of 33 footprints match" }, review: null, draft: null, ...over });

  it("marks finished steps done", () => {
    const s = stepStates(facts({ review: { passed: true, signed: 9, gates: 9 }, draft: { board: true, box: true, issued: true } }));
    expect([s.bom?.state, s.gerbers?.state, s.match?.state, s.feasibility?.state, s.board?.state, s.box?.state, s.quote?.state]).toEqual(["done", "done", "done", "done", "done", "done", "done"]);
  });

  it("flags what needs attention, in words", () => {
    expect(stepStates(facts({ mapped: false })).bom).toEqual({ state: "attention", note: "Columns still to map" });
    expect(stepStates(facts({ unmatched: 2 })).bom).toEqual({ state: "attention", note: "2 lines not matched to a part" });
    expect(stepStates(facts({ placements: 0 })).gerbers?.state).toBe("attention");
    expect(stepStates(facts({ match: { level: "red", hasBoard: true, note: "2 designators do not match the board" } })).match).toEqual({ state: "attention", note: "2 designators do not match the board" });
    expect(stepStates(facts({ match: { level: "amber", hasBoard: false, note: "Add Gerbers to check the footprints" } })).match?.state).toBe("todo");
    expect(stepStates(facts({ match: null })).match).toBeNull();
    expect(stepStates(facts({ review: { passed: false, signed: 3, gates: 9 } })).feasibility).toEqual({ state: "attention", note: "3 of 9 gates signed" });
  });

  it("leaves untouched steps to do, and says nothing where the data cannot tell", () => {
    const s = stepStates(facts({ gerbers: false, placements: 0 }));
    expect(s.gerbers?.state).toBe("todo");
    expect(stepStates(facts({ gerbers: false })).gerbers).toEqual({ state: "attention", note: "Centroid file (33 placements) but no Gerbers — board size from the project spec" });
    expect(s.feasibility?.state).toBe("todo");
    expect(s.board?.state).toBe("todo");
    expect([s.parts, s.box, s.quote, s.route, s.line]).toEqual([null, null, null, null, null]);
  });

  it("counts the steps done and names the next one to take", () => {
    // Fresh upload with Gerbers: files and footprints done, the machine check is next.
    const fresh = stepProgress(stepStates(facts()));
    expect(fresh.steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([fresh.done, fresh.look]).toEqual([3, 0]);
    expect(fresh.next).toMatchObject({ n: 4, key: "feasibility", path: "/feasibility", state: "todo" });

    // The earliest step that needs a look comes first, even when later ones are done.
    const unmatched = stepProgress(stepStates(facts({ unmatched: 1, draft: { board: true, box: true, issued: true } })));
    expect(unmatched.next).toMatchObject({ n: 1, key: "bom", note: "1 line not matched to a part" });
    expect(unmatched.look).toBe(1);

    // No Gerbers: that is the next thing to add; the footprint match waits behind it.
    expect(stepProgress(stepStates(facts({ gerbers: false, placements: 0, match: { level: "amber", hasBoard: false, note: "Add Gerbers to check the footprints" } }))).next).toMatchObject({ n: 2, key: "gerbers" });

    // Steps the data cannot judge are never "next"; with everything known done there is nothing to point at.
    const all = stepProgress(stepStates(facts({ review: { passed: true, signed: 9, gates: 9 }, draft: { board: true, box: true, issued: true } })));
    expect(all.done).toBe(7);
    expect(all.steps.filter((s) => s.state === "unknown").map((s) => s.key)).toEqual(["parts", "route", "line"]);
    expect(all.next).toBeNull();
  });
});
