import type { PrismaClient } from "@prisma/client";

/**
 * When live distributor refreshes began: the first job run that made a real adapter call. History
 * recorded from then on is live, earlier history is the simulated market (see src/lib/price-trend.ts).
 * No Next.js imports, so the seed and scripts can use it; cached per process for ten minutes.
 */
const g = globalThis as unknown as { __emsLiveSince?: { at: number; value: Date | null } };

export async function getLiveSince(db: PrismaClient): Promise<Date | null> {
  const cached = g.__emsLiveSince;
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  const rows = await db.$queryRaw<{ t: Date | null }[]>`
    SELECT MIN("startedAt") AS t FROM "JobRun"
    WHERE COALESCE((stats->'calls'->>'nexar')::int, 0)
        + COALESCE((stats->'calls'->>'digikey')::int, 0)
        + COALESCE((stats->'calls'->>'mouser')::int, 0) > 0`;
  const value = rows[0]?.t ?? null;
  g.__emsLiveSince = { at: Date.now(), value };
  return value;
}
