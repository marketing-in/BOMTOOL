/**
 * Puts the platform on the internet from this PC through a free Cloudflare quick tunnel:
 * starts the tunnel, reads its https://….trycloudflare.com address and serves the app behind it.
 *
 *   npm run online    Postgres must be running (npm run db:local); Ctrl+C stops both
 *
 * Needs .tools/cloudflared.exe (github.com/cloudflare/cloudflared/releases → cloudflared-windows-amd64.exe).
 * The address changes on every start and only works while this PC is on. Change the seeded demo passwords
 * (Admin → Users) before sharing it: the default one is in the repository.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 3001;
const cloudflared = path.join(process.cwd(), ".tools", "cloudflared.exe");
if (!existsSync(cloudflared)) {
  console.error(`Missing ${cloudflared}. Download cloudflared-windows-amd64.exe from github.com/cloudflare/cloudflared/releases and save it there.`);
  process.exit(1);
}

process.on("SIGINT", () => undefined);
const tunnel = spawn(cloudflared, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "ignore", "pipe"] });
let app: ReturnType<typeof spawn> | undefined;

tunnel.stderr.setEncoding("utf8");
tunnel.stderr.on("data", (chunk: string) => {
  const url = chunk.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (!url || app) return;
  console.log(`\nOnline at ${url}  (also http://localhost:${PORT} on this PC)\n`);
  app = spawn(process.execPath, ["--experimental-strip-types", path.join("scripts", "serve.ts"), "--port", String(PORT), "--online", url], { stdio: "inherit" });
  app.on("exit", (code) => {
    tunnel.kill();
    process.exit(code ?? 0);
  });
});
tunnel.on("exit", (code) => {
  console.error(`The tunnel stopped (exit ${code}).`);
  app?.kill();
  process.exit(code ?? 1);
});
