import type { Prisma, PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";

export interface Cache {
  readonly kind: "redis" | "postgres";
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec: number): Promise<void>;
  /** Atomic counter that starts at 1 and expires after ttlSec. */
  incr(key: string, ttlSec: number): Promise<number>;
}

export class PostgresCache implements Cache {
  readonly kind = "postgres" as const;
  constructor(private readonly db: PrismaClient) {}

  async get<T>(key: string): Promise<T | null> {
    const row = await this.db.apiCache.findUnique({ where: { key } });
    if (!row || row.expiresAt.getTime() <= Date.now()) return null;
    return row.value as T;
  }

  async set(key: string, value: unknown, ttlSec: number) {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    const json = value as Prisma.InputJsonValue;
    await this.db.apiCache.upsert({ where: { key }, create: { key, value: json, expiresAt }, update: { value: json, expiresAt } });
  }

  async incr(key: string, ttlSec: number): Promise<number> {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    const rows = await this.db.$queryRaw<{ n: number }[]>`
      INSERT INTO "ApiCache" ("key", "value", "expiresAt") VALUES (${key}, '1'::jsonb, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE SET
        "value" = CASE WHEN "ApiCache"."expiresAt" <= now() THEN '1'::jsonb
                       ELSE to_jsonb((("ApiCache"."value" #>> '{}')::int) + 1) END,
        "expiresAt" = CASE WHEN "ApiCache"."expiresAt" <= now() THEN EXCLUDED."expiresAt" ELSE "ApiCache"."expiresAt" END
      RETURNING (("value" #>> '{}')::int) AS n`;
    return Number(rows[0]?.n ?? 1);
  }

  /** Housekeeping: drop expired rows. */
  async purgeExpired() {
    await this.db.apiCache.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  }
}

export class RedisCache implements Cache {
  readonly kind = "redis" as const;
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const v = await this.redis.get(key);
    return v === null ? null : (JSON.parse(v) as T);
  }

  async set(key: string, value: unknown, ttlSec: number) {
    await this.redis.set(key, JSON.stringify(value), "EX", Math.max(1, Math.round(ttlSec)));
  }

  async incr(key: string, ttlSec: number): Promise<number> {
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, Math.max(1, Math.round(ttlSec)));
    return n;
  }
}

const g = globalThis as unknown as { __emsCache?: Promise<Cache> };

/** Redis when REDIS_URL answers within 1.5 s, otherwise the Postgres table. Decided once per process. */
export function getCache(db: PrismaClient): Promise<Cache> {
  g.__emsCache ??= (async () => {
    const url = process.env.REDIS_URL;
    if (url) {
      const { default: IORedis } = await import("ioredis");
      // No retries during the probe: a missing Redis must fail fast and must not keep the process alive.
      const redis = new IORedis(url, { lazyConnect: true, connectTimeout: 1500, maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null });
      redis.on("error", () => undefined);
      try {
        await redis.connect();
        await redis.ping();
        // Connected: from now on reconnect normally if Redis restarts.
        redis.options.retryStrategy = (times: number) => Math.min(times * 500, 5000);
        return new RedisCache(redis);
      } catch {
        redis.disconnect();
        console.warn(`[cache] Redis at REDIS_URL not reachable — using Postgres ApiCache instead.`);
      }
    }
    return new PostgresCache(db);
  })();
  return g.__emsCache;
}
