/**
 * A server on the e2e database (ems_e2e), for trying flows that write — uploads, choices, issued quotes — without
 * touching the development data. Distributor keys are blanked, so only the mock market answers and no API quota is
 * spent; the scheduler is off.
 *
 *   npm run db:e2e:setup                     first, to migrate and re-seed ems_e2e
 *   npx tsx scripts/e2e-dev.ts [port]        Turbopack dev server (default 3300, dist dir .next-check)
 *   npx tsx scripts/e2e-dev.ts 3100 --prod   production build in .next-e2e, then `next start` — the server the
 *                                            Playwright suite reuses when it is already running on 3100
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { e2eDatabaseUrl } from "../tests/e2e/database";

const port = process.argv[2] ?? "3300";
const prod = process.argv.includes("--prod");
const next = path.join("node_modules", "next", "dist", "bin", "next");
const blank = ["NEXAR_CLIENT_ID", "NEXAR_CLIENT_SECRET", "DIGIKEY_CLIENT_ID", "DIGIKEY_CLIENT_SECRET", "MOUSER_API_KEY", "ELEMENT14_API_KEY", "ARROW_API_KEY", "TME_TOKEN", "TME_SECRET", "FX_API_URL"];
const env = {
  ...process.env,
  ...Object.fromEntries(blank.map((k) => [k, ""])),
  DATABASE_URL: e2eDatabaseUrl(),
  NEXT_DIST_DIR: prod ? ".next-e2e" : ".next-check",
  NEXTAUTH_URL: `http://localhost:${port}`,
  SCHEDULER: "off",
  NEXT_TELEMETRY_DISABLED: "1",
  // Typecheck and lint run on their own (npx tsc, npm run lint); the build skips them to save time and memory.
  SKIP_BUILD_CHECKS: "1",
};

const run = (args: string[]) =>
  new Promise<number>((resolve) => spawn(process.execPath, [next, ...args], { stdio: "inherit", env }).on("exit", (code) => resolve(code ?? 0)));

(async () => {
  if (prod) {
    const built = await run(["build"]);
    if (built !== 0) process.exit(built);
  }
  process.exit(await run(prod ? ["start", "-p", port] : ["dev", "--turbopack", "-p", port]));
})();
