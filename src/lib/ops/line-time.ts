/**
 * How long this board takes on each of our lines, against what the lines actually did on older jobs and what they are
 * running now (Part 1, line fit). Pure: the database rows come from src/server/line-time.ts.
 *
 * - Estimate: SMT seconds per side = placements ÷ (line cph × efficiency), never below the shortest cycle — the same
 *   rule the quote uses (src/lib/costing/process.ts) — plus set-up per side and the lot's other stages.
 * - History: a finished work order's line hours are its elapsed hours times the share of the day the line works
 *   (shifts × productive hours ÷ 24). That gives seconds per placement on that line, which re-prices this board
 *   "as the line really ran".
 * - Now: what is in progress or queued on each line, when the line is free, and so the earliest this lot can finish.
 */

export type Rates = { smtEfficiency: number; smtMinCycleSec: number; smtSetupHoursPerSide: number; hoursPerShift: number };

export type LineIn = { id: string; code: string; name: string; type: string; shiftsPerDay: number; capacityCph: number | null };
export type JobIn = { qty: number; sides: { side: "TOP" | "BOTTOM"; placements: number }[]; /** Hours of the lot's non-SMT stages (THT, test, box) from the capacity plan. */ otherHours: number };

export type LineEstimate = {
  lineId: string;
  code: string;
  secondsPerBoard: number;
  setupHours: number;
  runHours: number;
  smtHours: number;
  totalHours: number;
  shifts: number;
  days: number;
  /** The same lot priced at this line's measured seconds per placement, when it has history. */
  fromHistory: { secondsPerPlacement: number; smtHours: number; totalHours: number; jobs: number } | null;
};

export type HistoryIn = {
  id: string;
  number: string;
  project: string;
  revision: string;
  lineId: string | null;
  lineCode: string | null;
  shiftsPerDay: number;
  qty: number;
  placementsPerBoard: number;
  start: Date;
  end: Date;
  /** "actual" from the start/finish stamps, "planned" when only the plan is on file. */
  basis: "actual" | "planned";
  sameProject: boolean;
};

export type HistoryRow = HistoryIn & { elapsedHours: number; lineHours: number; secondsPerBoard: number; secondsPerPlacement: number | null };

export type QueueIn = { id: string; number: string; project: string; lineId: string | null; status: string; qty: number; start: Date | null; end: Date | null; startedAt: Date | null };
export type LineNow = {
  lineId: string;
  code: string;
  running: { number: string; project: string; qty: number; hoursLeft: number; endsAt: Date | null } | null;
  queued: { number: string; project: string; status: string; start: Date | null; end: Date | null }[];
  freeAt: Date;
  /** This lot started when the line is free, on the line's own shift pattern. */
  finishAt: Date;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const HOUR = 3_600_000;

export function estimateOnLine(line: LineIn, job: JobIn, rates: Rates): Omit<LineEstimate, "fromHistory"> {
  const qty = Math.max(1, Math.round(job.qty));
  const sides = job.sides.filter((s) => s.placements > 0);
  const effCph = line.capacityCph ? line.capacityCph * rates.smtEfficiency : null;
  const perSide = sides.map((s) => (effCph ? Math.max(rates.smtMinCycleSec, (s.placements / effCph) * 3600) : rates.smtMinCycleSec));
  const secondsPerBoard = perSide.reduce((a, b) => a + b, 0);
  const setupHours = sides.length * rates.smtSetupHoursPerSide;
  const runHours = (qty * secondsPerBoard) / 3600;
  const smtHours = setupHours + runHours;
  const totalHours = smtHours + Math.max(0, job.otherHours);
  const shifts = totalHours / rates.hoursPerShift;
  return { lineId: line.id, code: line.code, secondsPerBoard: r1(secondsPerBoard), setupHours: r1(setupHours), runHours: r1(runHours), smtHours: r1(smtHours), totalHours: r1(totalHours), shifts: r1(shifts), days: r1(shifts / Math.max(1, line.shiftsPerDay)) };
}

export function historyRow(h: HistoryIn, hoursPerShift: number): HistoryRow {
  const elapsedHours = Math.max(0, (h.end.getTime() - h.start.getTime()) / HOUR);
  const share = Math.min(1, (Math.max(1, h.shiftsPerDay) * hoursPerShift) / 24);
  const lineHours = elapsedHours * share;
  const secondsPerBoard = h.qty > 0 ? (lineHours * 3600) / h.qty : 0;
  return { ...h, elapsedHours: r1(elapsedHours), lineHours: r1(lineHours), secondsPerBoard: r1(secondsPerBoard), secondsPerPlacement: h.placementsPerBoard > 0 ? Math.round((secondsPerBoard / h.placementsPerBoard) * 100) / 100 : null };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** This lot on every line, each re-priced from the line's own history where it has some. */
export function estimateAll(lines: LineIn[], job: JobIn, rates: Rates, history: HistoryRow[]): LineEstimate[] {
  const placements = job.sides.reduce((s, x) => s + x.placements, 0);
  return lines.map((l) => {
    const base = estimateOnLine(l, job, rates);
    const mine = history.filter((h) => h.lineId === l.id && h.secondsPerPlacement && h.secondsPerPlacement > 0);
    if (!mine.length || !placements) return { ...base, fromHistory: null };
    const spp = median(mine.map((h) => h.secondsPerPlacement!));
    const smtHours = base.setupHours + (Math.max(1, job.qty) * spp * placements) / 3600;
    return { ...base, fromHistory: { secondsPerPlacement: Math.round(spp * 100) / 100, smtHours: r1(smtHours), totalHours: r1(smtHours + Math.max(0, job.otherHours)), jobs: mine.length } };
  });
}

/** Calendar time for `hours` of work on a line running `shiftsPerDay` shifts. */
export const calendarHours = (hours: number, shiftsPerDay: number, hoursPerShift: number) => (hours / (Math.max(1, shiftsPerDay) * hoursPerShift)) * 24;

export function lineNow(line: LineIn, queue: QueueIn[], lotHours: number, now: Date, hoursPerShift: number): LineNow {
  const mine = queue.filter((q) => q.lineId === line.id);
  const run = mine.find((q) => q.status === "IN_PROGRESS") ?? null;
  const runEnd = run ? (run.end ?? null) : null;
  const running = run ? { number: run.number, project: run.project, qty: run.qty, hoursLeft: runEnd ? r1(Math.max(0, (runEnd.getTime() - now.getTime()) / HOUR)) : 0, endsAt: runEnd } : null;
  const queued = mine.filter((q) => q !== run).sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity)).map((q) => ({ number: q.number, project: q.project, status: q.status, start: q.start, end: q.end }));
  const ends = mine.map((q) => q.end?.getTime() ?? 0);
  const freeAt = new Date(Math.max(now.getTime(), ...ends));
  const finishAt = new Date(freeAt.getTime() + calendarHours(lotHours, line.shiftsPerDay, hoursPerShift) * HOUR);
  return { lineId: line.id, code: line.code, running, queued, freeAt, finishAt };
}
