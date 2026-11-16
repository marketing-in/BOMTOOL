/**
 * Runs a real PostgreSQL server without Docker (for machines without Docker Desktop).
 * Data lives in ./.pgdata. Credentials match .env.example (ems/ems, db "ems", port 5432).
 *
 *   npm run db:local        start (Ctrl+C to stop)
 *   npm run db:local:stop   stop a server left running (e.g. terminal closed)
 */
import EmbeddedPostgres from "embedded-postgres";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), ".pgdata");
const port = Number(process.env.PGPORT ?? 5432);

async function postgresControl() {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  return (await import(`@embedded-postgres/${platform}-${process.arch}`)) as { pg_ctl: string };
}

async function stop() {
  const { pg_ctl } = await postgresControl();
  const res = spawnSync(pg_ctl, ["stop", "-D", dataDir, "-m", "fast"], { stdio: "inherit" });
  process.exit(res.status ?? 0);
}

async function start() {
  if (existsSync(path.join(dataDir, "PG_VERSION"))) {
    const { pg_ctl } = await postgresControl();
    const status = spawnSync(pg_ctl, ["status", "-D", dataDir], { stdio: "ignore" });
    if (status.error) throw status.error;
    if (status.status === 0) {
      console.log(`Local PostgreSQL is already running in ${dataDir}. No need to start it again.`);
      console.log("Run npm run serve to start the app, or npm run db:local:stop to stop the database.");
      return;
    }
  }

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "ems",
    password: "ems",
    port,
    persistent: true,
    // Windows defaults to WIN1252; part data contains Ω, µ, ü etc.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase("ems");

  console.log(`PostgreSQL running on localhost:${port} (data: ${dataDir}). Ctrl+C to stop.`);

  const shutdown = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

(process.argv[2] === "stop" ? stop() : start()).catch((err) => {
  console.error(err);
  process.exit(1);
});
