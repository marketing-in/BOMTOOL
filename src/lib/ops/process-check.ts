import { kindOf, machineName, readSpecs, type LineIn, type Level } from "./machines";
import type { Masking, RouteStep } from "./route";

/**
 * The whole process, step by step, against our plant (Phase 23): for every step of the product's route, which of our
 * machines does it — on any active line — or whether a bench does it by hand, and whether the board fits that machine.
 * Then the order of the route is checked against the rules of the trade (test before coating, mask before and
 * de-mask after, clean before coat, programming before functional test, inspect before pack, pack before dispatch).
 */

type How = "machine" | "bench" | "bought-in";

/**
 * What a step needs. `types`: machine types that do it. `missing`: what happens without one — "red" (cannot be done),
 * "amber" (done another way, with `fallback`), or "bench" (normally done by hand: green).
 */
type Need = { types: string[]; missing: "red" | "amber" | "bench" | "bought-in"; fallback?: string; also?: { types: string[]; say: string } };

const NEEDS: Record<string, Need> = {
  fab: { types: [], missing: "bought-in", fallback: "made by the fab partner" },
  kitting: { types: [], missing: "bench", fallback: "picked and counted in stores" },
  print: { types: ["STENCIL_PRINTER"], missing: "red" },
  spi: { types: ["SPI"], missing: "amber", fallback: "no SPI — paste is only checked at AOI" },
  place: { types: ["PICK_AND_PLACE"], missing: "red" },
  reflow: { types: ["REFLOW_OVEN"], missing: "red" },
  aoi: { types: ["AOI"], missing: "amber", fallback: "no AOI — joints are inspected by eye under magnification" },
  xray: { types: ["XRAY"], missing: "red", fallback: "joints under the body cannot be inspected without X-ray" },
  insert: { types: [], missing: "bench", fallback: "inserted by hand at lit benches" },
  wave: { types: ["WAVE_SOLDER"], missing: "amber", fallback: "no wave — hand soldering only", also: { types: ["SELECTIVE_SOLDER"], say: "no wave — the selective machine can solder it, slower" } },
  selective: { types: ["SELECTIVE_SOLDER"], missing: "amber", fallback: "no selective machine — hand soldering only", also: { types: ["WAVE_SOLDER"], say: "no selective machine — wave with a pallet masking the bottom SMD parts" } },
  "mask-wave": { types: ["MASKING_STATION"], missing: "bench", fallback: "masked by hand at a bench" },
  "demask-wave": { types: ["MASKING_STATION"], missing: "bench", fallback: "de-masked by hand at a bench" },
  "press-fit": { types: ["PRESS_FIT"], missing: "red" },
  clean: { types: ["WASHER"], missing: "amber", fallback: "no washer — cleaned by hand, check ionic contamination before coating" },
  "mask-coat": { types: ["MASKING_STATION"], missing: "bench", fallback: "masked by hand at a bench" },
  coat: { types: ["CONFORMAL_COATER"], missing: "red", fallback: "no conformal coater in the plant" },
  "demask-coat": { types: ["MASKING_STATION"], missing: "bench", fallback: "de-masked and inspected by hand under UV" },
  depanel: { types: ["DEPANELER"], missing: "amber", fallback: "no depaneler — separated by hand in a fixture; watch MLCCs near the edge" },
  ict: { types: ["ICT"], missing: "amber", fallback: "no ICT — no bed-of-nails test before functional test", also: { types: ["FLYING_PROBE"], say: "no ICT — the flying probe can test it, slower per board" } },
  "flying-probe": { types: ["FLYING_PROBE"], missing: "amber", fallback: "no flying probe — no electrical test before functional test", also: { types: ["ICT"], say: "no flying probe — ICT needs a fixture built for this board" } },
  program: { types: ["PROGRAMMER", "FCT"], missing: "amber", fallback: "programmed at a bench with a debugger" },
  fct: { types: ["FCT"], missing: "amber", fallback: "no functional tester — tested on a bench rig to the customer's spec" },
  assemble: { types: ["SCREWDRIVER_STATION"], missing: "bench", fallback: "assembled by hand at a bench" },
  "system-test": { types: ["BURN_IN", "FCT"], missing: "amber", fallback: "no tester — tested by hand on a bench" },
  inspect: { types: ["INSPECTION_STATION"], missing: "bench", fallback: "inspected by Quality at a bench" },
  pack: { types: ["PACKING", "LASER_MARKER"], missing: "bench", fallback: "packed by hand" },
  dispatch: { types: ["DISPATCH"], missing: "bench", fallback: "dispatched from stores" },
};

/** "print-top" → "print"; keys without a side are their own base. */
export const baseKey = (key: string) => key.replace(/-(top|bottom)$/, "");

export type ProcessStep = {
  key: string;
  title: string;
  stage: RouteStep["stage"];
  level: Level;
  how: How;
  /** "L1 · ASMPT DEK TQ" — the machines that do it, the step's own line first. */
  machines: string[];
  note: string;
  masking: Masking | null;
};

export type OrderIssue = { level: Level; text: string };

export type ProcessCheck = { level: Level; summary: string; steps: ProcessStep[]; order: OrderIssue[] };

const worst = (ls: Level[]): Level => (ls.includes("red") ? "red" : ls.includes("amber") ? "amber" : "green");
const sorted = (p: [number, number]): [number, number] => (p[0] >= p[1] ? p : [p[1], p[0]]);
const fits = (board: [number, number], max: [number, number]) => sorted(board)[0] <= sorted(max)[0] && sorted(board)[1] <= sorted(max)[1];

/** Judges one step against the machines of every active line. */
function judgeStep(step: RouteStep, lines: LineIn[], boardMm: [number, number] | null): ProcessStep {
  const need = NEEDS[baseKey(step.key)] ?? { types: [], missing: "bench" as const, fallback: "done at a bench" };
  const masking = step.masking ?? null;
  const base = { key: step.key, title: step.title, stage: step.stage, masking };
  if (need.missing === "bought-in") return { ...base, level: "green", how: "bought-in", machines: [], note: need.fallback ?? "bought in" };

  const found = lines.flatMap((l) =>
    l.machines.filter((m) => need.types.includes(m.type)).map((m) => ({ line: l.code, name: machineName(m), maxBoard: readSpecs(m.specs).specs.maxBoardMm, type: m.type })),
  );
  // The step's own line first, as the route placed it.
  found.sort((a, b) => Number(b.line === step.where?.line) - Number(a.line === step.where?.line));
  if (found.length) {
    const label = (f: (typeof found)[number]) => `${f.line} · ${f.name}`;
    const takes = boardMm ? found.filter((f) => !f.maxBoard || fits(boardMm, f.maxBoard)) : found;
    if (!takes.length) {
      const biggest = found.map((f) => f.maxBoard!).sort((a, b) => b[0] * b[1] - a[0] * a[1])[0];
      return { ...base, level: "red", how: "machine", machines: found.map(label), note: `board ${boardMm![0]}×${boardMm![1]} mm is larger than ${kindOf(found[0].type).label.toLowerCase()} takes (${biggest[0]}×${biggest[1]} mm)` };
    }
    return {
      ...base,
      level: "green",
      how: "machine",
      machines: takes.map(label),
      note: `${takes.length === 1 ? "done" : "can be done"} on ${takes.map(label).join(", ")}`,
    };
  }
  if (need.also) {
    const alt = lines.flatMap((l) => l.machines.filter((m) => need.also!.types.includes(m.type)).map((m) => `${l.code} · ${machineName(m)}`));
    if (alt.length) return { ...base, level: "amber", how: "machine", machines: alt, note: need.also.say };
  }
  if (need.missing === "bench") return { ...base, level: "green", how: "bench", machines: [], note: need.fallback ?? "done at a bench" };
  return { ...base, level: need.missing, how: need.missing === "red" ? "machine" : "bench", machines: [], note: need.fallback ?? `no ${need.types.map((t) => kindOf(t).label.toLowerCase()).join(" or ")} in the plant` };
}

/** The rules of the trade the route must keep. */
export function orderIssues(steps: Pick<RouteStep, "key" | "masking">[]): OrderIssue[] {
  const keys = steps.map((s) => s.key);
  const first = (base: string) => keys.findIndex((k) => baseKey(k) === base);
  const last = (base: string) => keys.map((k) => baseKey(k)).lastIndexOf(base);
  const has = (base: string) => first(base) >= 0;
  const out: OrderIssue[] = [];
  const before = (a: string, b: string, level: Level, text: string) => {
    if (has(a) && has(b) && last(a) > first(b)) out.push({ level, text });
  };
  before("ict", "coat", "red", "In-circuit test runs after conformal coating — the probes cannot reach the test points through the coat. Test first, then coat.");
  before("flying-probe", "coat", "red", "Flying probe runs after conformal coating — the probes cannot reach the test points through the coat. Test first, then coat.");
  before("clean", "coat", "red", "Cleaning comes after coating — flux residue under the coat causes corrosion and poor adhesion. Clean first.");
  before("mask-coat", "coat", "red", "Masking comes after coating — the keep-outs are already coated.");
  before("coat", "demask-coat", "red", "De-masking comes before coating — the masks must stay on until the coating has cured.");
  before("mask-wave", "wave", "red", "Masking comes after the wave — the holes are already full of solder.");
  before("wave", "demask-wave", "red", "De-masking comes before the wave.");
  before("demask-wave", "press-fit", "red", "Press-fit comes before the wave mask is removed.");
  before("reflow", "xray", "amber", "X-ray before reflow inspects joints that do not exist yet.");
  before("program", "fct", "amber", "Functional test runs before the firmware is loaded.");
  before("inspect", "pack", "red", "Packing comes before final inspection — the lot must be accepted first.");
  before("pack", "dispatch", "red", "Dispatch comes before packing.");
  const coat = steps.find((s) => baseKey(s.key) === "coat");
  if (coat?.masking?.needed && !has("mask-coat")) out.push({ level: "red", text: "Coating needs masking but there is no masking step before it." });
  if (has("mask-coat") && !has("demask-coat")) out.push({ level: "amber", text: "Masks go on before coating but no step takes them off." });
  if (has("pack") && !has("inspect")) out.push({ level: "amber", text: "No final inspection before packing." });
  if (has("dispatch") && last("dispatch") !== keys.length - 1) out.push({ level: "amber", text: "Dispatch is not the last step." });
  return out;
}

/** Every step of the route against the plant, and the route's order against the rules. */
export function checkProcess(route: RouteStep[], lines: LineIn[], boardMm: [number, number] | null): ProcessCheck {
  const active = lines.filter((l) => l.active !== false);
  const steps = route.map((s) => judgeStep(s, active, boardMm));
  const order = orderIssues(route);
  const level = worst([...steps.map((s) => s.level), ...order.map((o) => o.level)]);
  const reds = steps.filter((s) => s.level === "red");
  const ambers = steps.filter((s) => s.level === "amber");
  const masked = route.filter((s) => s.masking?.needed && /^mask-/.test(s.key)).length;
  const summary =
    level === "red"
      ? `The process cannot run as it stands: ${[...reds.map((s) => `${s.title} — ${s.note}`), ...order.filter((o) => o.level === "red").map((o) => o.text)].slice(0, 2).join("; ")}`
      : `All ${steps.length} steps can be done${ambers.length ? `, ${ambers.length} of them another way than planned` : ""}${masked ? `; ${masked} masking step${masked === 1 ? "" : "s"}` : "; no masking needed"}${order.length ? `; ${order.length} order point${order.length === 1 ? "" : "s"} to check` : "; the order is correct"}.`;
  return { level, summary, steps, order };
}
