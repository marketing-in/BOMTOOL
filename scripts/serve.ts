/**
 * Runs the platform the fast way for day-to-day use: a production build (every page compiled once, ahead of
 * time) served by `next start`. `npm run dev` compiles each page the first time it is opened — 20–60 s a page
 * on a 2-core laptop — and keeps a large compiler in memory; here pages open in about a second.
 *
 *   npm run serve                     build if the code changed since the last build, then start on :3000
 *   npm run serve -- --port 3001      another port
 *   npm run serve -- --rebuild        force a fresh build
 *   npm run serve -- --online <url>   behind a public address (npm run online passes the tunnel's URL)
 *
 * The build lives in .next-prod, so it never touches the .next folder that `npm run dev` uses. The database
 * must be running (npm run db:local). Type-checking and ESLint are skipped in this build to save time and
 * memory: `npm run typecheck`, `npm run lint` and the tests cover them.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const DIST = ".next-prod";
const buildId = path.join(root, DIST, "BUILD_ID");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
/** Anything that changes what `next build` produces. .env is read at start-up, so editing it needs no rebuild. */
const SOURCES = ["src", "public", "prisma", "next.config.ts", "package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs"];

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(option("--port") ?? process.env.PORT ?? 3000);

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

function needsBuild(): string | null {
  if (args.includes("--rebuild")) return "a fresh build was asked for";
  if (!existsSync(buildId)) return "there is no production build yet";
  const built = statSync(buildId).mtimeMs;
  const changed = SOURCES.find((s) => newest(s) > built);
  return changed ? `${changed} changed since the last build` : null;
}

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

async function main() {
  if (!(await portFree(port))) {
    console.error(`Port ${port} is in use. Stop the other server or start the app with a different --port.`);
    process.exit(1);
  }
  // Ctrl+C reaches the Next.js process too; let it shut down and exit with it.
  process.on("SIGINT", () => undefined);
  const env = { NEXT_DIST_DIR: DIST, NEXT_TELEMETRY_DISABLED: "1" };

  const reason = needsBuild();
  if (reason) {
    console.log(`Building the app (${reason}). This takes a few minutes; later starts skip it until the code changes.`);
    const started = Date.now();
    const code = await next(["build"], { ...env, SKIP_BUILD_CHECKS: "1" });
    if (code !== 0) process.exit(code);
    console.log(`Built in ${Math.round((Date.now() - started) / 1000)} s.`);
  } else {
    console.log("No code changes since the last build — starting it.");
  }

  // Sign-in redirects must come back to the address in use: the public one when online, else this port.
  const publicUrl = option("--online");
  const auth: Record<string, string> = publicUrl ? { NEXTAUTH_URL: publicUrl } : port === 3000 ? {} : { NEXTAUTH_URL: `http://localhost:${port}` };
  process.exit(await next(["start", "-p", String(port)], { ...env, ...auth }));
}

void main();
