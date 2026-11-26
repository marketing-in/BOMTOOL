import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { refreshParts, type RefreshStats } from "@/server/sourcing/refresh";
import { refreshFx } from "@/server/fx";
import { lookUpRevision } from "@/server/sourcing/lookup";

/** bom.lookup: a BoM's part numbers not in the catalogue, looked up at the distributors (Phase 47). */
export type JobKind = "refresh.hot" | "refresh.full" | "refresh.parts" | "fx.refresh" | "bom.lookup";
export type JobTrigger = "schedule" | "manual" | "startup";
export type JobData = { partIds?: string[]; userId?: string; label?: string; revisionId?: string };

/** TTL for cached adapter answers: scheduled runs accept 6 h old data, buyers clicking refresh get ≤ 15 min. */
const TTL: Record<JobTrigger, number> = { schedule: 6 * 3600, startup: 6 * 3600, manual: 15 * 60 };

/** Parts that matter right now: on any non-archived BoM, in an open cart or an open RFQ. */
export async function hotPartIds(): Promise<string[]> {
  const [lines, carts, rfqs] = await Promise.all([
    db.bomLine.findMany({ where: { partId: { not: null }, dnp: false, revision: { status: { not: "ARCHIVED" } } }, select: { partId: true }, distinct: ["partId"] }),
    db.cartItem.findMany({ where: { cart: { status: "OPEN" } }, select: { partId: true }, distinct: ["partId"] }),
    db.rfqLine.findMany({ where: { rfq: { status: { in: ["DRAFT", "SENT", "PARTIALLY_QUOTED", "QUOTED"] } } }, select: { partId: true }, distinct: ["partId"] }),
  ]);
  return [...new Set([...lines.map((l) => l.partId!), ...carts.map((c) => c.partId), ...rfqs.map((r) => r.partId)])];
}

async function allPartIds() {
  return (await db.part.findMany({ select: { id: true }, orderBy: { mpn: "asc" } })).map((p) => p.id);
}

async function alreadyRunning(kind: JobKind, data: JobData = {}) {
  if (kind === "refresh.parts") return null;
  const since = new Date(Date.now() - 2 * 3600_000);
  // One look-up per BoM at a time; two BoMs may be looked up side by side.
  if (kind === "bom.lookup") return db.jobRun.findFirst({ where: { kind, status: "RUNNING", startedAt: { gt: since }, stats: { path: ["revisionId"], equals: data.revisionId ?? "" } } });
  return db.jobRun.findFirst({ where: { kind, status: "RUNNING", startedAt: { gt: since } } });
}

function createRun(kind: JobKind, trigger: JobTrigger, data: JobData) {
  const stats = { ...(data.label ? { label: data.label } : {}), ...(data.revisionId ? { revisionId: data.revisionId } : {}) };
  return db.jobRun.create({ data: { kind, trigger, startedBy: data.userId, stats: Object.keys(stats).length ? stats : undefined } });
}

/**
 * Runs a job and records it in JobRun. Skips (returns the running one) if the same kind is already
 * running and started < 2 h ago. Pass runId to continue a record created by startJob.
 */
export async function runJob(kind: JobKind, trigger: JobTrigger, data: JobData = {}, runId?: string) {
  if (!runId) {
    const running = await alreadyRunning(kind, data);
    if (running) return running;
  }
  const run = runId ? { id: runId } : await createRun(kind, trigger, data);
  // `at` is the heartbeat the scheduler reads to tell a slow run from one cut off by a restart.
  const save = (stats: RefreshStats) =>
    db.jobRun.update({ where: { id: run.id }, data: { stats: { ...(data.label ? { label: data.label } : {}), ...stats, at: new Date().toISOString() } as unknown as Prisma.InputJsonValue } }).then(() => undefined);
  try {
    if (kind === "bom.lookup") {
      const progress = (s: object) => db.jobRun.update({ where: { id: run.id }, data: { stats: { ...(data.label ? { label: data.label } : {}), ...s, at: new Date().toISOString() } as unknown as Prisma.InputJsonValue } }).then(() => undefined);
      const stats = await lookUpRevision(db, data.revisionId ?? "", { ttlSec: 24 * 3600, onProgress: progress });
      await db.jobRun.update({ where: { id: run.id }, data: { status: "DONE", finishedAt: new Date(), stats: { ...(data.label ? { label: data.label } : {}), ...stats } as unknown as Prisma.InputJsonValue } });
    } else if (kind === "fx.refresh") {
      const fx = await refreshFx();
      await db.jobRun.update({ where: { id: run.id }, data: { status: "DONE", finishedAt: new Date(), stats: { source: fx.source, asOf: fx.asOf, usd: fx.rates.USD, eur: fx.rates.EUR } } });
    } else {
      const ids = kind === "refresh.parts" ? (data.partIds ?? []) : kind === "refresh.hot" ? await hotPartIds() : await allPartIds();
      const stats = await refreshParts(ids, { ttlSec: TTL[trigger], onProgress: save });
      await db.jobRun.update({
        where: { id: run.id },
        data: { status: "DONE", finishedAt: new Date(), stats: { ...(data.label ? { label: data.label } : {}), ...stats } as unknown as Prisma.InputJsonValue },
      });
    }
  } catch (e) {
    await db.jobRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: (e as Error).message.slice(0, 1000) } });
  }
  return db.jobRun.findUniqueOrThrow({ where: { id: run.id } });
}

/**
 * Starts a job without blocking the caller. With JOBS_MODE=bullmq it is queued for the worker;
 * otherwise it runs in this process. Returns the JobRun id (inline) or null (queued).
 */
export async function startJob(kind: JobKind, trigger: JobTrigger, data: JobData = {}): Promise<string | null> {
  if (process.env.JOBS_MODE === "bullmq") {
    const { enqueue } = await import("./bullmq");
    await enqueue(kind, trigger, data);
    return null;
  }
  // Create the run record first so the UI can poll it, then execute in the background.
  const running = await alreadyRunning(kind, data);
  if (running) return running.id;
  const run = await createRun(kind, trigger, data);
  void runJob(kind, trigger, data, run.id).catch((e) => console.error(`[jobs] ${kind} failed`, e));
  return run.id;
}

/**
 * After a BoM is matched: its part numbers not in our catalogue are looked up at the distributors, in the background.
 * Never in tests or the seed (no outside calls there), and only when a distributor is configured.
 */
export async function lookUpAfterMatch(revisionId: string, userId?: string | null): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.env.BOM_LOOKUP === "off") return;
  // Without a distributor key only the simulated market could answer: nothing worth a run on its own.
  const { REAL_ADAPTERS } = await import("@/server/sourcing");
  if (!REAL_ADAPTERS.some((a) => a.configured() && a.dailyLimit > 0)) return;
  try {
    await startJob("bom.lookup", "manual", { revisionId, userId: userId ?? undefined, label: "BoM part numbers at the distributors" });
  } catch (e) {
    console.error(`[jobs] looking up BoM ${revisionId} at the distributors could not start`, e);
  }
}

