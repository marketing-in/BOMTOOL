/**
 * One BoM's process, in order (Phase 20, 24): the files, whether BoM and board agree, whether we can build it, the bare board, the components, the
 * box, the price, then production. The same numbered strip is on every page of the BoM, with Back / Next from the
 * same list. Pure.
 */

export type StepKey = "bom" | "gerbers" | "match" | "feasibility" | "board" | "parts" | "box" | "quote" | "route" | "line";
export type ViewKey = "analysis" | "supply" | "reverse" | "viewer";

export type Step = { key: StepKey; n: number; label: string; path: string; /** Other pages that belong to this step. */ also?: string[] };
export type View = { key: ViewKey; label: string; path: string };

export const WORKFLOW: Step[] = [
  { key: "bom", n: 1, label: "BoM", path: "", also: ["/map", "/diff", "/quote"] },
  { key: "gerbers", n: 2, label: "Gerbers", path: "/board" },
  { key: "match", n: 3, label: "Footprint match", path: "/match" },
  { key: "feasibility", n: 4, label: "Can we build it?", path: "/feasibility" },
  { key: "board", n: 5, label: "Bare board", path: "/build/board" },
  { key: "parts", n: 6, label: "Components", path: "/build/parts" },
  { key: "box", n: 7, label: "Box", path: "/build/box" },
  { key: "quote", n: 8, label: "Quote", path: "/build/quote", also: ["/build/print"] },
  { key: "route", n: 9, label: "Process route", path: "/route" },
  { key: "line", n: 10, label: "SMT line", path: "/line" },
];

/** Views of the same BoM that are not steps of the process. */
export const MORE: View[] = [
  { key: "analysis", label: "Analysis", path: "/analysis" },
  { key: "supply", label: "Supply chain", path: "/supply" },
  { key: "reverse", label: "Reverse engineering", path: "/reverse" },
  { key: "viewer", label: "3D view", path: "/viewer" },
];

const under = (rest: string, p: string) => rest === p || rest.startsWith(`${p}/`);

/** Which step or view a page of the BoM belongs to, from the path after `/boms/<id>`. */
export function locate(rest: string): { step: Step | null; view: View | null } {
  const r = rest.replace(/\/+$/, "");
  // Longest matching path wins: /build/board is the bare board, not the BoM.
  let best: { len: number; step: Step | null; view: View | null } = { len: -1, step: null, view: null };
  for (const s of WORKFLOW) for (const p of [s.path, ...(s.also ?? [])]) if (p && under(r, p) && p.length > best.len) best = { len: p.length, step: s, view: null };
  for (const v of MORE) if (under(r, v.path) && v.path.length > best.len) best = { len: v.path.length, step: null, view: v };
  if (best.len >= 0) return { step: best.step, view: best.view };
  // `/build` alone opens the bare board; anything else is the BoM itself.
  if (r === "/build") return { step: WORKFLOW.find((s) => s.key === "board")!, view: null };
  return { step: WORKFLOW[0], view: null };
}

export function neighbours(step: Step): { prev: Step | null; next: Step | null } {
  const i = WORKFLOW.findIndex((s) => s.key === step.key);
  return { prev: WORKFLOW[i - 1] ?? null, next: WORKFLOW[i + 1] ?? null };
}

// ── How far each step has got

/** What the database says about the BoM's progress — one cheap query each (src/server/workflow.ts). */
export type StepFacts = {
  mapped: boolean;
  lines: number;
  unmatched: number;
  gerbers: boolean;
  placements: number;
  /** BoM against board (src/lib/board/footprint-match.ts). */
  match: { level: "green" | "amber" | "red"; hasBoard: boolean; note: string } | null;
  review: { passed: boolean; signed: number; gates: number } | null;
  draft: { board: boolean; box: boolean; issued: boolean } | null;
};

export type StepState = { state: "done" | "attention" | "todo"; note: string } | null;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** Done (green), needs attention (amber) or not started, where the data can say; null where it cannot. */
export function stepStates(f: StepFacts): Record<StepKey, StepState> {
  return {
    bom: !f.mapped
      ? { state: "attention", note: "Columns still to map" }
      : !f.lines
        ? { state: "attention", note: "The BoM has no lines" }
        : f.unmatched
          ? { state: "attention", note: `${plural(f.unmatched, "line")} not matched to a part` }
          : { state: "done", note: `${plural(f.lines, "line")}, all matched` },
    gerbers: f.gerbers
      ? f.placements
        ? { state: "done", note: `Gerbers and ${plural(f.placements, "placement")}` }
        : { state: "attention", note: "Gerbers, but no centroid file — part positions are estimated" }
      : f.placements
        ? { state: "attention", note: `Centroid file (${plural(f.placements, "placement")}) but no Gerbers — board size from the project spec` }
        : { state: "todo", note: "No Gerbers yet — the board is drawn from the project spec" },
    match: !f.match ? null : !f.match.hasBoard ? { state: "todo", note: f.match.note } : { state: f.match.level === "green" ? "done" : "attention", note: f.match.note },
    feasibility: f.review?.passed
      ? { state: "done", note: "Every gate signed" }
      : f.review && f.review.signed
        ? { state: "attention", note: `${f.review.signed} of ${f.review.gates} gates signed` }
        : { state: "todo", note: "Not reviewed yet" },
    board: f.draft?.board ? { state: "done", note: "Fab or stock board chosen" } : { state: "todo", note: "Cheapest fab that fits, until one is chosen" },
    parts: null,
    box: f.draft?.box ? { state: "done", note: "Box chosen" } : null,
    quote: f.draft?.issued ? { state: "done", note: "Quote issued" } : null,
    route: null,
    line: null,
  };
}

// ── Progress, for a card or a list

export type StepProgress = { key: StepKey; n: number; label: string; path: string; state: "done" | "attention" | "todo" | "unknown"; note: string | null };

/**
 * A BoM's ten steps in order with how far each has got, how many are done or need a look, and the step to take
 * next: the first one that needs attention or has not been started. Steps the data cannot judge are "unknown" and
 * never the next step.
 */
export function stepProgress(states: Record<StepKey, StepState>): { steps: StepProgress[]; done: number; look: number; next: StepProgress | null } {
  const steps = WORKFLOW.map((s): StepProgress => ({ key: s.key, n: s.n, label: s.label, path: s.path, state: states[s.key]?.state ?? "unknown", note: states[s.key]?.note ?? null }));
  return {
    steps,
    done: steps.filter((s) => s.state === "done").length,
    look: steps.filter((s) => s.state === "attention").length,
    next: steps.find((s) => s.state === "attention" || s.state === "todo") ?? null,
  };
}
