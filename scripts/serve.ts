/**
 * Runs the platform the fast way for day-to-day use: a production build (every page compiled once, ahead of
 * time) served by `next start`. `npm run dev` compiles each page the first time it is opened — 20–60 s a page
 * on a 2-core laptop — and keeps a large compiler in memory; here pages open in about a second.
 * `npm start` and `npm run serve` both run this.
 *
 *   npm start                         start the database if needed, build if the code changed since the last
 *                                     build, then start on :3000
 *   npm start -- --port 3001          another port (or the PORT environment variable)
 *   npm start -- --rebuild            force a fresh build
 *   npm run serve -- --online <url>   behind a public address (npm run online passes the tunnel's URL; it has
 *                                     checked the database already, so this skips that step)
 *
 * The build lives in .next-prod, so it never touches the .next folder that `npm run dev` uses. Several copies can
 * serve that one build (say :3000 and npm run online on :3001), but none may rebuild it while another runs —
 * `next build` empties the folder first, pulling the files out from under the running app. .next-prod.lock
 * lists the copies running (pid, port, building or serving). Type-checking and ESLint are skipped in this build to
 * save time and memory: `npm run typecheck`, `npm run lint` and the tests cover them.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const DIST = ".next-prod";
const buildId = path.join(root, DIST, "BUILD_ID");
const lockFile = path.join(root, `${DIST}.lock`);
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
/** Anything that changes what `next build` produces. .env is read at start-up, so editing it needs no rebuild. */
const SOURCES = ["src", "public", "prisma", "next.config.ts", "package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs"];

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(option("--port") ?? process.env.PORT ?? 3000);
const publicUrl = option("--online");

/** Latest change under a path; a directory's own time moves when files are added or removed. */
function newest(rel: string): number {
  const full = path.join(root, rel);
  if (!existsSync(full)) return 0;
  const st = statSync(full);
  if (!st.isDirectory()) return st.mtimeMs;
  let latest = st.mtimeMs;
  for (const entry of readdirSync(full)) latest = Math.max(latest, newest(path.join(rel, entry)));
  return latest;
}

/** BUILD_ID's time is when its build started (set after each build), so edits saved during a build count as changes. */
function needsBuild(): string | null {
  if (args.includes("--rebuild")) return "a fresh build was asked for";
  if (!existsSync(buildId)) return "there is no production build yet";
  const built = statSync(buildId).mtimeMs;
  const changed = SOURCES.find((s) => newest(s) > built);
  return changed ? `${changed} changed since the last build` : null;
}

/** The other copies of this script running now, from .next-prod.lock (entries of stopped ones are ignored). */
type Running = { pid: number; port: number; phase: "building" | "serving" };
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
function readLock(): Running[] {
  try {
    const list = JSON.parse(readFileSync(lockFile, "utf8")) as Running[];
    return Array.isArray(list) ? list.filter((r) => r.pid !== process.pid && alive(r.pid)) : [];
  } catch {
    return [];
  }
}
function writeLock(list: Running[]) {
  try {
    if (list.length) writeFileSync(lockFile, JSON.stringify(list));
    else if (existsSync(lockFile)) unlinkSync(lockFile);
  } catch {
    // A read-only folder only loses the guard, not the app.
  }
}
const markSelf = (phase: Running["phase"]) => writeLock([...readLock(), { pid: process.pid, port, phase }]);

function portFree(p: number) {
  return new Promise<boolean>((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(p);
  });
}

function next(cmd: string[], env: Record<string, string>) {
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [nextBin, ...cmd], { stdio: "inherit", env: { ...process.env, ...env } });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const step = (n: number, text: string) => console.log(`\n[${n}/3] ${text}`);
const note = (text: string) => console.log(`      ${text}`);
const fail = (text: string): never => {
  console.error(`\n${text}`);
  process.exit(1);
};

function ago(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** Starts the local database if it is stopped (and creates it the first time) — scripts/db-ensure.ts. */
function ensureDatabase() {
  const res = spawnSync(process.execPath, [tsxCli, "--env-file-if-exists=.env", path.join("scripts", "db-ensure.ts")], {
    stdio: "inherit",
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

/** Says where to open the app once it answers a page (after Next.js's own start-up lines, so it is the last thing on screen). */
async function announceWhenUp(url: string) {
  const until = Date.now() + 180_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://localhost:${port}/login`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      if (res.status < 500) {
        const line = "─".repeat(url.length + 12);
        console.log(`\n  ${line}\n  The app is running: open ${url}\n  in your browser. Ctrl+C here stops it.\n  ${line}\n`);
        return;
      }
    } catch {
      // Not up yet.
    }
  }
}

async function main() {
  if (publicUrl) {
    step(1, "Database: checked by npm run online.");
  } else {
    step(1, "Checking the database …");
    ensureDatabase();
    note("Database: ready.");
  }

  const others = readLock();
  if (!(await portFree(port))) {
    const same = others.find((r) => r.port === port);
    if (same) fail(`npm start is already running on port ${port} (process ${same.pid}): open http://localhost:${port}.\nTo restart it, stop it first (Ctrl+C in its window).`);
    fail(
      `Port ${port} is already in use — the app may already be running there: try http://localhost:${port}.\n` +
        `If something else is using it, stop that, or start on another port: npm start -- --port ${port + 1}`,
    );
  }
  // Ctrl+C reaches the Next.js process too; let it shut down and exit with it (taking this copy off the lock).
  process.on("SIGINT", () => undefined);
  process.on("exit", () => writeLock(readLock()));
  const env = { NEXT_DIST_DIR: DIST, NEXT_TELEMETRY_DISABLED: "1" };

  const reason = needsBuild();
  const building = others.find((r) => r.phase === "building");
  const serving = others.find((r) => r.phase === "serving");
  if (building) {
    fail(
      `Another npm start (process ${building.pid}) is building the app right now. Wait until it says the app is running,\n` +
        `then open http://localhost:${building.port} — or run npm start again once it is up to serve here too.`,
    );
  }
  if (reason && serving) {
    const where = `npm start is running on port ${serving.port} (process ${serving.pid}) from the current build`;
    if (args.includes("--rebuild") || !existsSync(buildId)) {
      fail(`Can't build now: ${where}, and building would pull the files out from under it.\nStop it first (Ctrl+C in its window), then run this again.`);
    }
    step(2, `Build: kept as it is — ${reason}, but ${where}.`);
    note("Rebuilding would pull the files out from under it, so this serves the same build. To pick up the changes,");
    note("stop every running npm start (Ctrl+C in its window) and run npm start again.");
  } else if (reason) {
    step(2, `Building the app: ${reason}.`);
    note("The first build takes a few minutes (longer on a 2-core laptop); later starts skip it until the code changes.");
    markSelf("building");
    const started = Date.now();
    const code = await next(["build"], { ...env, SKIP_BUILD_CHECKS: "1" });
    if (code !== 0) fail(`The build failed (exit code ${code}) — see the messages above. npm run dev still runs the app from source.`);
    // Stamp the build with the time it started: a file saved while it ran is newer, so the next start rebuilds.
    utimesSync(buildId, started / 1000, started / 1000);
    note(`Built in ${Math.round((Date.now() - started) / 1000)} s.`);
  } else {
    step(2, `Build: up to date (built ${ago(Date.now() - statSync(buildId).mtimeMs)}, no code changes since) — skipping it.`);
  }

  // Sign-in redirects must come back to the address in use: the public one when online, else this port.
  const auth: Record<string, string> = publicUrl ? { NEXTAUTH_URL: publicUrl } : port === 3000 ? {} : { NEXTAUTH_URL: `http://localhost:${port}` };
  step(3, `Starting the app on port ${port} …`);
  markSelf("serving");
  void announceWhenUp(publicUrl ?? `http://localhost:${port}`);
  process.exit(await next(["start", "-p", String(port)], { ...env, ...auth }));
}

void main();
