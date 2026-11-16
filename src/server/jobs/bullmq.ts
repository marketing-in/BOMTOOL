/**
 * BullMQ transport for JOBS_MODE=bullmq (Docker Compose: redis + worker service).
 * Same jobs as the inline scheduler; Redis gives retries, one worker per job and survives app restarts.
 * Not exercised on the dev machine (no Redis there) — verify with `docker compose up` before relying on it.
 */
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { runJob, type JobData, type JobKind, type JobTrigger } from "./index";

const QUEUE = "ems-sourcing";

function connection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined, maxRetriesPerRequest: null };
}

let queue: Queue | null = null;
function getQueue() {
  queue ??= new Queue(QUEUE, { connection: connection() });
  return queue;
}

export async function enqueue(kind: JobKind, trigger: JobTrigger, data: JobData) {
  await getQueue().add(kind, { trigger, ...data }, { removeOnComplete: 200, removeOnFail: 500, attempts: 2, backoff: { type: "exponential", delay: 60_000 } });
}

/** Repeatable schedules (idempotent: re-running updates the same schedulers). */
export async function registerSchedules() {
  const q = getQueue();
  const tz = "Asia/Kolkata";
  await q.upsertJobScheduler("refresh-full-nightly", { pattern: "0 2 * * *", tz }, { name: "refresh.full", data: { trigger: "schedule" } });
  await q.upsertJobScheduler("refresh-hot", { pattern: `15 */${Number(process.env.REFRESH_HOT_HOURS ?? 4)} * * *`, tz }, { name: "refresh.hot", data: { trigger: "schedule" } });
  if (process.env.FX_API_URL) await q.upsertJobScheduler("fx-refresh", { pattern: "5 */12 * * *", tz }, { name: "fx.refresh", data: { trigger: "schedule" } });
}

export function startWorker() {
  return new Worker(
    QUEUE,
    async (job) => {
      const { trigger = "schedule", ...data } = (job.data ?? {}) as JobData & { trigger?: JobTrigger };
      const run = await runJob(job.name as JobKind, trigger, data);
      if (run.status === "FAILED") throw new Error(run.error ?? "job failed");
      return run.id;
    },
    { connection: connection(), concurrency: 1 },
  );
}
