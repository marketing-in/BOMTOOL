// Exits 0 when the database answers a query within 5 s, else 1. Used by start-online.cmd: a port that only
// looks busy (a leftover postgres child after its main process died) accepts connections but never answers.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL || (existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")).DATABASE_URL : undefined);
const db = new PrismaClient({ datasourceUrl: url });
const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("no answer within 5 s")), 5000));
try {
  await Promise.race([db.$queryRawUnsafe("SELECT 1"), timeout]);
  process.exit(0);
} catch (e) {
  if (process.argv.includes("--why")) console.error(e.message);
  process.exit(1);
}
