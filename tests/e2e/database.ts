import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/** E2E runs get their own database on the same Postgres server, never the development one. */
export const E2E_DB_NAME = "ems_e2e";

function dotenv(): Record<string, string | undefined> {
  try {
    return parseEnv(readFileSync(path.resolve(__dirname, "../../.env"), "utf8"));
  } catch {
    return {};
  }
}

const sameDatabase = (a: URL, b: URL) =>
  a.hostname === b.hostname && (a.port || "5432") === (b.port || "5432") && a.pathname === b.pathname;

/**
 * E2E_DATABASE_URL if set, otherwise DATABASE_URL with the database name swapped for ems_e2e.
 * Both are looked up the way Next.js and Prisma do it: the shell environment first, then .env.
 */
export function e2eDatabaseUrl(): string {
  const file = dotenv();
  const devUrl = process.env.DATABASE_URL || file.DATABASE_URL;
  const explicit = process.env.E2E_DATABASE_URL || file.E2E_DATABASE_URL;
  if (!explicit && !devUrl) throw new Error("No DATABASE_URL to derive the e2e database from: set it (or E2E_DATABASE_URL) in .env.");
  const url = new URL((explicit || devUrl)!);
  if (!explicit) url.pathname = `/${E2E_DB_NAME}`;
  if (devUrl && sameDatabase(url, new URL(devUrl))) throw new Error("E2E_DATABASE_URL points at the development database; e2e needs its own.");
  return url.toString();
}
