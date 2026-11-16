import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl } from "./tests/e2e/database";

// E2E has its own database, ems_e2e, next to the dev one (npm run db:local, then npm run db:e2e:setup;
// npm run test:e2e re-seeds it before every run). The development database is never touched.
// Runs against a production build on port 3100 (built into .next-e2e) — fast and close to real use.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 300_000,
  // Generous: first hit on a dev-server route compiles it, which is slow on a busy machine.
  expect: { timeout: 90_000 },
  fullyParallel: false,
  // One at a time: two browsers plus the server overload the plant's 2-core laptop and time out sign-ins.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // An existing Chrome installation can run the suite on hosts Playwright no longer downloads for.
    launchOptions: {
      ...(process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : {}),
      args: ["--enable-unsafe-swiftshader"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: process.env.E2E_SKIP_BUILD === "1" ? "npx next start -p 3100" : "npx next build && npx next start -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 1_200_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
      SCHEDULER: "off",
      NEXTAUTH_URL: "http://localhost:3100",
      DATABASE_URL: e2eDatabaseUrl(),
      // Empty values win over .env: the distributor adapters stay unconfigured, so the app runs on its
      // simulated market and offline FX rates. E2E never calls a real API.
      NEXAR_CLIENT_ID: "",
      NEXAR_CLIENT_SECRET: "",
      DIGIKEY_CLIENT_ID: "",
      DIGIKEY_CLIENT_SECRET: "",
      MOUSER_API_KEY: "",
      FX_API_URL: "",
    },
  },
});
