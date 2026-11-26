/**
 * Runs the platform the fast way for day-to-day use: a production build (every page compiled once, ahead of
 * time) served by `next start`. `npm run dev` compiles each page the first time it is opened — 20–60 s a page
 * on a 2-core laptop — and keeps a large compiler in memory; here pages open in about a second.
 * `npm start` and `npm run serve` both run this.
 *
 * It never makes you wait for a build once there is one: the app opens at once on the newest finished build, and
 * when the code is newer it builds the new version in the background, then switches to it by itself (a few seconds
 * of restart). While it runs it watches the code: change any file in src, prisma, public or the config and the new
 * version follows a few minutes later. Edit this code directly; nothing has to be copied or rebuilt by hand.
 *
 *   npm start                         start the database if needed, open the app on :3000 straight away, and keep
 *                                     it up to date with the code
 *   npm start -- --port 3001          another port (or the PORT environment variable)
 *   npm start -- --rebuild            build fresh before opening (waits for the build)
 *   npm start -- --no-watch           don't rebuild when the code changes
 *   npm run serve -- --online <url>   behind a public address (npm run online passes the tunnel's URL; it has
 *                                     checked the database already, so this skips that step)
 *
 * Builds alternate between two folders, .next-prod and .next-prod-b (.next-prod.current says which one is live), so
 * a build never touches the files the running app serves; .next-prod-build.log holds the background build's output.
 * Several copies can run (say :3000 and npm run online on :3001); .next-prod.lock lists them (pid, port, folder) so
 * none builds into a folder another one is serving. Type-checking and ESLint are skipped in this build to save time
 * and memory: `npm run typecheck`, `npm run lint` and the tests cover them.
 */
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, utimesSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import type { ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
/** The two build folders: one is served while the other is (re)built. */
const SLOTS = [".next-prod", ".next-prod-b"] as const;
type Slot = (typeof SLOTS)[number];
const pointerFile = path.join(root, ".next-prod.current");
const buildLog = path.join(root, ".next-prod-build.log");
const lockFile = path.join(root, ".next-prod.lock");
const buildIdOf = (slot: Slot) => path.join(root, slot, "BUILD_ID");
/** When a folder's build started (BUILD_ID is stamped with it), or 0 when the folder holds no finished build. */
const builtAt = (slot: Slot) => (existsSync(buildIdOf(slot)) ? statSync(buildIdOf(slot)).mtimeMs : 0);
const otherSlot = (slot: Slot): Slot => (slot === SLOTS[0] ? SLOTS[1] : SLOTS[0]);
/** The live folder: the one .next-prod.current names, else the newest finished build. */
function liveSlot(): Slot {
  try {
    const named = readFileSync(pointerFile, "utf8").trim();
    if ((SLOTS as readonly string[]).includes(named) && builtAt(named as Slot)) return named as Slot;
  } catch {
    // No pointer yet.
  }
  return [...SLOTS].sort((a, b) => builtAt(b) - builtAt(a))[0];
}
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

/** What changed since a build started (null: nothing). BUILD_ID's time is its build's start, so edits saved during a build count. */
function changedSince(slot: Slot): string | null {
  const built = builtAt(slot);
  if (!built) return "there is no production build yet";
  const changed = SOURCES.find((s) => newest(s) > built);
  return changed ? `${changed} changed since the last build` : null;
}

/** The other copies of this script running now, from .next-prod.lock (entries of stopped ones are ignored). */
type Running = { pid: number; port: number; phase: "building" | "serving"; slot?: Slot; building?: Slot };
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
const markSelf = (me: Omit<Running, "pid" | "port">) => writeLock([...readLock(), { pid: process.pid, port, ...me }]);
/** A folder no other running copy serves or builds: safe to build into. */
const freeToBuild = (slot: Slot) => !readLock().some((r) => (r.slot ?? SLOTS[0]) === slot || r.building === slot);

function portFree(p: number) {
  return new Promise<boolean>((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(p);
  });
}

function next(cmd: string[], env: Record<string, string>, log?: number) {
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [nextBin, ...cmd], { stdio: log === undefined ? "inherit" : ["ignore", log, log], env: { ...process.env, ...env } });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** `next build` into a folder, stamped with the time it started. Its output goes to the terminal, or to a log file. */
async function build(slot: Slot, opts: { quiet: boolean }): Promise<{ ok: boolean; seconds: number }> {
  const started = Date.now();
  const log = opts.quiet ? openSync(buildLog, "w") : undefined;
  const code = await next(["build"], { NEXT_DIST_DIR: slot, NEXT_TELEMETRY_DISABLED: "1", SKIP_BUILD_CHECKS: "1" }, log);
  if (log !== undefined) closeSync(log);
  const ok = code === 0 && existsSync(buildIdOf(slot));
  // Stamp the build with the time it started: a file saved while it ran is newer, so the next check rebuilds.
  if (ok) utimesSync(buildIdOf(slot), started / 1000, started / 1000);
  return { ok, seconds: Math.round((Date.now() - started) / 1000) };
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
async function announceWhenUp(url: string, update?: string) {
  const until = Date.now() + 180_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://localhost:${port}/login`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      if (res.status < 500) {
        if (update) {
          console.log(`\n  ✓ ${update} — ${url} (refresh the page).\n`);
          return;
        }
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

  // The build to open with: the live one when there is one, unless a fresh build was asked for.
  let live = liveSlot();
  if (!builtAt(live) || args.includes("--rebuild")) {
    const target = builtAt(live) ? otherSlot(live) : live;
    if (!freeToBuild(target)) fail(`Another npm start is using ${target} right now. Stop it first (Ctrl+C in its window), then run this again.`);
    step(2, builtAt(live) ? "Building the app fresh, as asked …" : "Building the app for the first time …");
    note("This one build takes a few minutes; after it the app always opens at once and keeps itself up to date.");
    markSelf({ phase: "building", building: target });
    const r = await build(target, { quiet: false });
    if (!r.ok) fail("The build failed — see the messages above. npm run dev still runs the app from source.");
    live = target;
    writeFileSync(pointerFile, live);
    note(`Built in ${r.seconds} s.`);
  } else {
    const reason = changedSince(live);
    step(2, reason ? `Opening the current build now; ${reason}, so the new version builds in the background.` : `Build: up to date (built ${ago(Date.now() - builtAt(live))}).`);
  }

  // Sign-in redirects must come back to the address in use: the public one when online, else this port.
  const auth: Record<string, string> = publicUrl ? { NEXTAUTH_URL: publicUrl } : port === 3000 ? {} : { NEXTAUTH_URL: `http://localhost:${port}` };
  const url = publicUrl ?? `http://localhost:${port}`;
  let server: ChildProcess | null = null;
  let switching = false;
  let stopping = false;
  let buildingNow: Slot | null = null;

  const serve = (slot: Slot, update?: string) => {
    writeLock([...readLock(), { pid: process.pid, port, phase: "serving", slot, ...(buildingNow ? { building: buildingNow } : {}) }]);
    server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], { stdio: "inherit", env: { ...process.env, NEXT_DIST_DIR: slot, NEXT_TELEMETRY_DISABLED: "1", ...auth } });
    server.on("exit", (code) => {
      // A switch stops the server on purpose; anything else (Ctrl+C, a crash) ends this script too.
      if (!switching) {
        stopping = true;
        process.exit(code ?? 0);
      }
    });
    void announceWhenUp(url, update);
  };

  step(3, `Starting the app on port ${port} …`);
  serve(live);

  /** Builds the code as it is now into the other folder and, when it is good, switches the app to it. */
  let again = false;
  const refresh = async () => {
    if (buildingNow) {
      again = true;
      return;
    }
    const reason = changedSince(live);
    if (!reason || stopping) return;
    const target = otherSlot(live);
    if (!freeToBuild(target)) {
      note(`${reason}, but another npm start is using ${target}: this copy stays on the current build.`);
      return;
    }
    buildingNow = target;
    writeLock([...readLock(), { pid: process.pid, port, phase: "serving", slot: live, building: target }]);
    console.log(`\n  ↻ ${reason}: building the new version in the background (the app stays open; log: .next-prod-build.log) …`);
    const r = await build(target, { quiet: true });
    buildingNow = null;
    if (stopping) return;
    if (!r.ok) {
      console.log(`\n  ✗ The new version did not build (see .next-prod-build.log): the app keeps running the previous one.\n`);
    } else {
      // A few seconds' restart onto the new folder; the old one stays as it is until the next build reuses it.
      switching = true;
      const old = server;
      await new Promise<void>((resolve) => {
        if (!old || old.exitCode !== null) return resolve();
        old.once("exit", () => resolve());
        old.kill("SIGTERM");
      });
      switching = false;
      live = target;
      writeFileSync(pointerFile, live);
      serve(live, `Updated to the new version (built in ${r.seconds} s)`);
    }
    if (again) {
      again = false;
      void refresh();
    }
  };

  // Ctrl+C reaches the Next.js processes too; let them shut down, then leave the lock.
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("exit", () => writeLock(readLock()));

  // The build that opened may be older than the code: catch up now, then follow every change.
  if (changedSince(live)) void refresh();
  if (!args.includes("--no-watch")) {
    let timer: NodeJS.Timeout | null = null;
    const changed = () => {
      if (timer) clearTimeout(timer);
      // Wait for a quiet spell: a save, a few more saves, then one build.
      timer = setTimeout(() => void refresh(), 20_000);
    };
    const watchers: FSWatcher[] = [];
    for (const s of SOURCES) {
      const full = path.join(root, s);
      if (!existsSync(full)) continue;
      try {
        watchers.push(watch(full, { recursive: statSync(full).isDirectory() }, changed));
      } catch {
        // A folder that cannot be watched is still checked at the next start.
      }
    }
    if (watchers.length) note("Watching the code: the app follows your changes a few minutes after you save.");
  }
}

void main();
