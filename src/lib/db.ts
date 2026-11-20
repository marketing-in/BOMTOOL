import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * On Vercel the database is across the network (Neon's pooler) and one page can fire dozens of queries at once:
 * give each function more connections and a longer wait than Prisma's serverless defaults (5 and 10 s).
 */
function hostedUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !process.env.VERCEL) return undefined;
  const u = new URL(url);
  if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "10");
  if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "30");
  return u.toString();
}
const url = hostedUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Prisma's defaults (2 s to get a connection, 5 s per interactive transaction) are too tight for a busy
    // 2-core plant laptop: a BoM ingest or stock reservation that runs long is slow, not wrong.
    transactionOptions: { maxWait: 10_000, timeout: 60_000 },
    ...(url ? { datasourceUrl: url } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
