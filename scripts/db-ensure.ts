/**
 * Makes sure the local database is up before the app starts, so `npm run dev` and `npm start` work on their
 * own without a second terminal running `npm run db:local`.
 *
 *   1. DATABASE_URL points somewhere other than this machine → nothing to manage, just check it answers.
 *   2. The local server (./.pgdata) is stopped → start it in the background; it keeps running after the app
 *      stops (npm run db:local:stop stops it).
 *   3. No ./.pgdata yet → create it and the "ems" database, then load the demo data.
 *   4. Apply any migrations the database doesn't have yet (a no-op when it is up to date).
 */
import EmbeddedPostgres from "embedded-postgres";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, ".pgdata");
const logFile = path.join(dataDir, "server.log");

function target(): { host: string; port: number } | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return { host: u.hostname, port: Number(u.port || 5432) };
  } catch {
    return null;
  }
}

function answers(host: string, port: number, ms = 1500) {
  return new Promise<boolean>((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(ms, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

async function pgCtl() {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  return ((await import(`@embedded-postgres/${platform}-${process.arch}`)) as { pg_ctl: string }).pg_ctl;
}

function prisma(args: string[]) {
  const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
  // No "update available" box: on the everyday start command it would push a major Prisma upgrade on plant users.
  const res = spawnSync(bin, args, { stdio: "inherit", env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" }, shell: process.platform === "win32" });
  if (res.status !== 0) throw new Error(`prisma ${args.join(" ")} failed`);
}

async function main() {
  const t = target();
  if (!t) throw new Error("DATABASE_URL is missing or invalid in .env (copy it from .env.example).");
  const local = ["localhost", "127.0.0.1", "::1"].includes(t.host);

  if (await answers(t.host, t.port)) {
    // Up already (ours, Docker's or a remote one).
  } else if (!local) {
    throw new Error(`The database at ${t.host}:${t.port} is not answering. Start it, or point DATABASE_URL at localhost.`);
  } else {
    const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
    if (fresh) {
      console.log("No local database yet — creating one in .pgdata …");
      const pg = new EmbeddedPostgres({
        databaseDir: dataDir,
        user: "ems",
        password: "ems",
        port: t.port,
        persistent: true,
        initdbFlags: ["--encoding=UTF8", "--locale=C"],
      });
      await pg.initialise();
      await pg.start();
      await pg.createDatabase("ems");
      await pg.stop();
    }
    console.log(`Starting the local database on port ${t.port} (log: .pgdata/server.log) …`);
    const ctl = await pgCtl();
    const res = spawnSync(ctl, ["start", "-D", dataDir, "-l", logFile, "-w", "-t", "60", "-o", `-p ${t.port}`], { stdio: "ignore" });
    if (res.status !== 0 || !(await answers(t.host, t.port))) {
      throw new Error(`The local database did not start. See .pgdata/server.log, or run npm run db:local to see the error.`);
    }
    if (fresh) {
      prisma(["migrate", "deploy"]);
      prisma(["db", "seed"]);
      return;
    }
  }

  prisma(["migrate", "deploy"]);
}

main().catch((err) => {
  console.error(`\nDatabase not ready: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
