/** Next.js server start hook: starts the in-process price-refresh scheduler unless BullMQ handles jobs. */
export async function register() {
  // This exact form lets Next drop the import from the Edge bundle (BullMQ/ioredis need Node built-ins).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    if (process.env.JOBS_MODE === "bullmq" || process.env.SCHEDULER === "off") return;
    const { startInlineScheduler } = await import("./server/jobs/scheduler");
    startInlineScheduler();
  }
}
