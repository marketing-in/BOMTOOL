import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Prisma's defaults (2 s to get a connection, 5 s per interactive transaction) are too tight for a busy
    // 2-core plant laptop: a BoM ingest or stock reservation that runs long is slow, not wrong.
    transactionOptions: { maxWait: 10_000, timeout: 60_000 },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
