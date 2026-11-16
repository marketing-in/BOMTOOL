/**
 * Prepares the e2e database (ems_e2e, see tests/e2e/database.ts): creates it if it does not exist,
 * applies the migrations and re-seeds it, so a run starts from the seed every time.
 *
 *   npm run db:e2e:setup    Postgres must be running (npm run db:local)
 */
import { spawnSync } from "node:child_process";
import { e2eDatabaseUrl } from "../tests/e2e/database";

const url = e2eDatabaseUrl();
const { hostname, port, pathname } = new URL(url);
console.log(`E2E database: ${pathname.slice(1)} on ${hostname}:${port || 5432}`);

// `migrate deploy` creates the database when it is missing; the seed always wipes and re-seeds.
for (const command of ["prisma migrate deploy", "prisma db seed"]) {
  const res = spawnSync(`npx ${command}`, { stdio: "inherit", shell: true, env: { ...process.env, DATABASE_URL: url } });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
