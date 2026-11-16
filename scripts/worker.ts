/** BullMQ worker for JOBS_MODE=bullmq (run by the `worker` service in docker-compose.yml). */
import { registerSchedules, startWorker } from "../src/server/jobs/bullmq";

async function main() {
  await registerSchedules();
  const worker = startWorker();
  worker.on("completed", (job) => console.log(`[worker] ${job.name} done (${job.returnvalue})`));
  worker.on("failed", (job, err) => console.error(`[worker] ${job?.name} failed: ${err.message}`));
  console.log("[worker] listening for sourcing jobs");
  const stop = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
