import { db } from "@/lib/db";
import { runJob, type JobKind } from "./index";

/**
 * In-process scheduler for machines without Redis (JOBS_MODE=inline). Checks once a minute what is due,
 * based on the last JobRun of each kind, so restarts don't double-run or skip a day.
 *   fx.refresh    every 12 h
 *   refresh.hot   every REFRESH_HOT_HOURS (default 4 h)
 *   refresh.full  daily at 02:00 IST (and any time after, if the 02:00 run was missed)
 */
const HOUR = 3_600_000;

export function istParts(d: Date) {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return { day: ist.toISOString().slice(0, 10), hour: ist.getUTCHours() };
}

/** Pure: what's due given the last start time of each kind. */
export function dueJobs(now: Date, last: Partial<Record<JobKind, Date | null>>, hotHours = 4, fxEnabled = false): JobKind[] {
  const due: JobKind[] = [];
  const age = (k: JobKind) => (last[k] ? now.getTime() - last[k]!.getTime() : Infinity);
  if (fxEnabled && age("fx.refresh") >= 12 * HOUR) due.push("fx.refresh");
  const { day, hour } = istParts(now);
  const lastFullDay = last["refresh.full"] ? istParts(last["refresh.full"]!).day : null;
  if (hour >= 2 && lastFullDay !== day) due.push("refresh.full");
  else if (age("refresh.hot") >= hotHours * HOUR && age("refresh.full") >= hotHours * HOUR) due.push("refresh.hot");
  return due;
}

/** A run that shows no progress for this long was cut off: the server stopped or restarted mid-run. */
export const STALE_RUN_MS = 30 * 60_000;

/**
 * Pure: RUNNING runs with no sign of life (start, or the `at` heartbeat runJob writes into stats) for
 * STALE_RUN_MS. Judged by heartbeat, not by this server's start time — another server on the same database
 * may be running a job right now.
 */
export function staleRunIds(runs: { id: string; startedAt: Date; stats: unknown }[], now: Date, staleMs = STALE_RUN_MS): string[] {
  return runs
    .filter((r) => {
      const beat = (r.stats as { at?: unknown } | null)?.at;
      const last = Math.max(r.startedAt.getTime(), typeof beat === "string" ? Date.parse(beat) || 0 : 0);
      return now.getTime() - last > staleMs;
    })
    .map((r) => r.id);
}

/** Closes cut-off runs, which would otherwise show as running for ever and block their kind for 2 h. */
async function closeStaleRuns(now: Date) {
  const running = await db.jobRun.findMany({ where: { status: "RUNNING" }, select: { id: true, startedAt: true, stats: true } });
  const ids = staleRunIds(running, now);
  if (!ids.length) return;
  await db.jobRun.updateMany({
    where: { id: { in: ids }, status: "RUNNING" },
    data: { status: "FAILED", finishedAt: now, error: "Interrupted: no progress for 30 minutes — the server stopped or restarted while it ran." },
  });
  console.log(`[scheduler] closed ${ids.length} interrupted run(s)`);
}

const g = globalThis as unknown as { __emsScheduler?: NodeJS.Timeout; __emsSchedulerBusy?: boolean };

async function tick() {
  if (g.__emsSchedulerBusy) return;
  g.__emsSchedulerBusy = true;
  try {
    await closeStaleRuns(new Date());
    const kinds: JobKind[] = ["fx.refresh", "refresh.hot", "refresh.full"];
    const lasts = await Promise.all(kinds.map((k) => db.jobRun.findFirst({ where: { kind: k, status: { not: "FAILED" } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } })));
    const last = Object.fromEntries(kinds.map((k, i) => [k, lasts[i]?.startedAt ?? null])) as Record<JobKind, Date | null>;
    for (const kind of dueJobs(new Date(), last, Number(process.env.REFRESH_HOT_HOURS ?? 4), !!process.env.FX_API_URL)) {
      await runJob(kind, "schedule");
    }
  } catch (e) {
    console.error("[scheduler] tick failed", e);
  } finally {
    g.__emsSchedulerBusy = false;
  }
}

export function startInlineScheduler() {
  if (g.__emsScheduler) return;
  // First check 30 s after boot so startup isn't slowed; then every minute.
  setTimeout(() => void tick(), 30_000);
  g.__emsScheduler = setInterval(() => void tick(), 60_000);
  console.log("[scheduler] inline price-refresh scheduler started");
}
