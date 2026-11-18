/**
 * One BoM's process, in seven steps, as the user set them on 18 Nov 2026: 1 the BoM · 2 its Gerbers · 3 footprints
 * and mismatches (the BoM against the board) · 4 which of our lines can build it, with the process route · 5 its
 * components · 6 the bare board's estimate · 7 the estimate and quote. The steps run down the left side of every
 * BoM page; the views (Analysis, Supply chain, 3D view) sit on top. The SMT line is no longer a step: it runs in the
 * 3D view, beside the board in 3D, 2D and layers. There is no box step either. A section's old address still works:
 * it opens its step's page (or the 3D view) at that section. Pure.
 */

/** The parts of the process the data can judge, each a section of one step's page ("box" and "line" are not steps). */
export type SectionKey = "bom" | "gerbers" | "match" | "mismatch" | "lines" | "board" | "feasibility" | "parts" | "box" | "quote" | "route" | "line";
export type StepKey = "bom" | "gerbers" | "footprint" | "parts" | "lines" | "board" | "quote";
export type ViewKey = "analysis" | "supply" | "viewer";

/** `path`: the section's own address (it redirects to the step's page at `#anchor`); `also`: other pages that belong to it. */
export type Section = { key: SectionKey; label: string; path: string; anchor: string; also?: string[] };
export type Step = { key: StepKey; n: number; label: string; path: string; sections: Section[]; /** Not every product needs it, so it is never the step to take next. */ optional?: boolean };
export type View = { key: ViewKey; label: string; path: string };

export const WORKFLOW: Step[] = [
  { key: "bom", n: 1, label: "BoM", path: "", sections: [{ key: "bom", label: "BoM", path: "", anchor: "bom", also: ["/map", "/diff", "/quote"] }] },
  { key: "gerbers", n: 2, label: "Gerber", path: "/board", sections: [{ key: "gerbers", label: "Gerber", path: "/board", anchor: "gerbers" }] },
  {
    key: "footprint",
    n: 3,
    label: "Footprint & mismatch",
    path: "/match",
    sections: [
      { key: "match", label: "Footprint", path: "/match", anchor: "compare" },
      { key: "mismatch", label: "Mismatches", path: "/mismatch", anchor: "mismatches" },
    ],
  },
  {
    key: "lines",
    n: 4,
    label: "Line possible",
    path: "/lines",
    sections: [
      { key: "lines", label: "Line possible", path: "/lines", anchor: "line-fit" },
      { key: "route", label: "Process route", path: "/route", anchor: "route" },
    ],
  },
  { key: "parts", n: 5, label: "Components", path: "/build/parts", sections: [{ key: "parts", label: "Components", path: "/build/parts", anchor: "components" }] },
  { key: "board", n: 6, label: "Bare board", path: "/build/board", sections: [{ key: "board", label: "Bare board", path: "/build/board", anchor: "bare-board", also: ["/build"] }] },
  {
    key: "quote",
    n: 7,
    label: "Estimate & quote",
    path: "/feasibility",
    sections: [
      { key: "feasibility", label: "Estimate", path: "/feasibility", anchor: "estimate" },
      { key: "quote", label: "Quote", path: "/build/quote", anchor: "quote", also: ["/build/print"] },
    ],
  },
];

/** Views of the same BoM that are not steps of the process. The 3D view also runs the board on our SMT lines. */
export const MORE: View[] = [
  { key: "analysis", label: "Analysis", path: "/analysis" },
  { key: "supply", label: "Supply chain", path: "/supply" },
  { key: "viewer", label: "3D view", path: "/viewer" },
];

/** Sections that live on a view instead of a step: the SMT line runs in the 3D view. */
const ON_VIEW: Partial<Record<SectionKey, { path: string; anchor: string }>> = { line: { path: "/viewer", anchor: "smt-line" } };

const under = (rest: string, p: string) => rest === p || rest.startsWith(`${p}/`);

/** Which step (and section) or view a page of the BoM belongs to, from the path after `/boms/<id>`. */
export function locate(rest: string): { step: Step | null; section: Section | null; view: View | null } {
  const r = rest.replace(/\/+$/, "");
  // Longest matching path wins: /build/board is the bare board, not the BoM.
  let best: { len: number; step: Step | null; section: Section | null; view: View | null } = { len: -1, step: null, section: null, view: null };
  for (const st of WORKFLOW)
    for (const sec of st.sections)
      for (const p of [sec.path, ...(sec.also ?? [])]) if (p && under(r, p) && p.length > best.len) best = { len: p.length, step: st, section: sec, view: null };
  for (const v of MORE) if (under(r, v.path) && v.path.length > best.len) best = { len: v.path.length, step: null, section: null, view: v };
  if (best.len >= 0) return { step: best.step, section: best.section, view: best.view };
  return { step: WORKFLOW[0], section: WORKFLOW[0].sections[0], view: null };
}

export function neighbours(step: Step): { prev: Step | null; next: Step | null } {
  const i = WORKFLOW.findIndex((s) => s.key === step.key);
  return { prev: WORKFLOW[i - 1] ?? null, next: WORKFLOW[i + 1] ?? null };
}

/** The step a section is on. */
export function stepOf(key: SectionKey): { step: Step; section: Section } {
  for (const step of WORKFLOW) for (const section of step.sections) if (section.key === key) return { step, section };
  throw new Error(`No section ${key}`);
}

/** Where a section lives now: its step's page (or the view that holds it) with the query kept, scrolled to the section. */
export function sectionHref(id: string, key: SectionKey, query?: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, x);
  const q = qs.toString();
  const view = ON_VIEW[key];
  if (view) return `/boms/${id}${view.path}${q ? `?${q}` : ""}#${view.anchor}`;
  const { step, section } = stepOf(key);
  return `/boms/${id}${step.path}${q ? `?${q}` : ""}#${section.anchor}`;
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
  /** Every mismatch, BoM against board and against itself (src/lib/bom/mismatch.ts). */
  mismatch: { level: "green" | "amber" | "red"; total: number; note: string } | null;
  review: { passed: boolean; signed: number; gates: number } | null;
  draft: { board: boolean; box: boolean; issued: boolean } | null;
};

export type StepState = { state: "done" | "attention" | "todo"; note: string } | null;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** Done (green), needs attention (amber) or not started, where the data can say; null where it cannot. */
export function sectionStates(f: StepFacts): Record<SectionKey, StepState> {
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
    mismatch: !f.mismatch ? null : { state: f.mismatch.total ? "attention" : "done", note: f.mismatch.note },
    lines: null,
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

/**
 * A step's state from its sections': needs a look when any section does, done when every section the data can judge
 * is, not started when none is, and needs a look when some are done and others not started. Null when the data can
 * judge none of its sections.
 */
export function stepState(step: Step, sections: Record<SectionKey, StepState>): StepState {
  const known = step.sections.map((s) => ({ s, st: sections[s.key] })).filter((x): x is { s: Section; st: NonNullable<StepState> } => !!x.st);
  if (!known.length) return null;
  const many = step.sections.length > 1;
  const say = (x: { s: Section; st: NonNullable<StepState> }) => (many ? `${x.s.label}: ${x.st.note}` : x.st.note);
  const look = known.find((x) => x.st.state === "attention");
  if (look) return { state: "attention", note: say(look) };
  const todo = known.filter((x) => x.st.state === "todo");
  if (!todo.length) return { state: "done", note: known.map(say).join(" · ") };
  return { state: todo.length === known.length ? "todo" : "attention", note: say(todo[0]) };
}

export type StepProgress = { key: StepKey; n: number; label: string; path: string; optional: boolean; state: "done" | "attention" | "todo" | "unknown"; note: string | null };

/**
 * A BoM's steps in order with how far each has got, how many are done or need a look, and the step to take
 * next: the first one that needs attention or has not been started. Steps the data cannot judge are "unknown" and,
 * like optional steps, never the next step.
 */
export function stepProgress(sections: Record<SectionKey, StepState>): { steps: StepProgress[]; done: number; look: number; next: StepProgress | null } {
  const steps = WORKFLOW.map((s): StepProgress => {
    const st = stepState(s, sections);
    return { key: s.key, n: s.n, label: s.label, path: s.path, optional: !!s.optional, state: st?.state ?? "unknown", note: st?.note ?? null };
  });
  return {
    steps,
    done: steps.filter((s) => s.state === "done").length,
    look: steps.filter((s) => s.state === "attention").length,
    next: steps.find((s) => !s.optional && (s.state === "attention" || s.state === "todo")) ?? null,
  };
}
