import { db } from "@/lib/db";
import { normaliseMpn } from "@/lib/normalise";
import { BudgetExceededError, TokenBucket, istDayKey } from "@/lib/rate-limit";
import { getCache } from "./cache";
import { nexarAdapter } from "./adapters/nexar";
import { digikeyAdapter } from "./adapters/digikey";
import { mouserAdapter } from "./adapters/mouser";
import { mockAdapter } from "./adapters/mock";
import { element14Adapter, newarkAdapter } from "./adapters/element14";
import { lcscAdapter } from "./adapters/lcsc";
import type { AdapterKey, AdapterPart, SupplierAdapter } from "./types";

export const REAL_ADAPTERS: SupplierAdapter[] = [nexarAdapter, digikeyAdapter, mouserAdapter, newarkAdapter, element14Adapter, lcscAdapter];
export const ALL_ADAPTERS: SupplierAdapter[] = [...REAL_ADAPTERS, mockAdapter];

/**
 * SOURCING_MOCK=auto (default): mock runs only while no real adapter has keys, so live and simulated
 * prices are never mixed. "true" forces it on (demo), "false" forces it off.
 */
export function mockEnabled(): boolean {
  const v = (process.env.SOURCING_MOCK ?? "auto").toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return !REAL_ADAPTERS.some((a) => a.configured());
}

export function activeAdapters(): SupplierAdapter[] {
  return [...REAL_ADAPTERS.filter((a) => a.configured()), ...(mockEnabled() ? [mockAdapter] : [])];
}

const g = globalThis as unknown as { __emsBuckets?: Map<AdapterKey, TokenBucket> };
function bucket(a: SupplierAdapter) {
  g.__emsBuckets ??= new Map();
  let b = g.__emsBuckets.get(a.key);
  if (!b) g.__emsBuckets.set(a.key, (b = new TokenBucket(a.perMinute)));
  return b;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type AdapterStatus = { lastOkAt?: string; lastErrorAt?: string; lastError?: string; callsToday: number };

export async function adapterStatus(a: SupplierAdapter): Promise<AdapterStatus> {
  const cache = await getCache(db);
  const [status, calls] = await Promise.all([
    cache.get<Omit<AdapterStatus, "callsToday">>(`status:${a.key}`),
    cache.get<number>(`budget:${a.key}:${istDayKey()}`),
  ]);
  return { ...(status ?? {}), callsToday: Number(calls ?? 0) };
}

export type CallResult = { parts: AdapterPart[]; cached: boolean };

/**
 * Cached + rate-limited + budgeted adapter call. TTL: how long a previous answer is good enough
 * (scheduled refresh 6 h, on-demand 15 min). Empty answers are cached for a quarter of the TTL.
 */
export async function callAdapter(a: SupplierAdapter, mpn: string, ttlSec: number): Promise<CallResult> {
  return cachedCall(a, `src:${a.key}:${normaliseMpn(mpn)}`, () => a.searchMpn(mpn), ttlSec);
}

/** Free-text search for the parts directory; one call per distributor, cached like MPN lookups. */
export async function searchAdapterKeyword(a: SupplierAdapter, query: string, ttlSec: number): Promise<CallResult> {
  if (!a.searchKeyword) return { parts: [], cached: true };
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  return cachedCall(a, `kw:${a.key}:${q}`, () => a.searchKeyword!(q), ttlSec);
}

async function cachedCall(a: SupplierAdapter, key: string, run: () => Promise<AdapterPart[]>, ttlSec: number): Promise<CallResult> {
  const cache = await getCache(db);
  const hit = await cache.get<AdapterPart[]>(key);
  if (hit) return { parts: hit, cached: true };

  if (a.kind !== "mock") {
    const used = await cache.incr(`budget:${a.key}:${istDayKey()}`, 2 * 86_400);
    if (used > a.dailyLimit) throw new BudgetExceededError(a.key, a.dailyLimit);
    for (let wait = bucket(a).take(); wait > 0; wait = bucket(a).take()) await sleep(Math.min(wait, 65_000));
  }

  const statusKey = `status:${a.key}`;
  try {
    const parts = await run();
    await cache.set(key, parts, parts.length ? ttlSec : Math.max(60, ttlSec / 4));
    if (a.kind !== "mock") {
      const prev = (await cache.get<AdapterStatus>(statusKey)) ?? {};
      await cache.set(statusKey, { ...prev, lastOkAt: new Date().toISOString() }, 30 * 86_400);
    }
    return { parts, cached: false };
  } catch (e) {
    const prev = (await cache.get<AdapterStatus>(statusKey)) ?? {};
    await cache.set(statusKey, { ...prev, lastErrorAt: new Date().toISOString(), lastError: (e as Error).message.slice(0, 300) }, 30 * 86_400);
    throw e;
  }
}

/** Picks the result for this MPN (and maker, when known) from an adapter answer. */
export function pickPart(parts: AdapterPart[], mpn: string, manufacturer?: string | null): AdapterPart | null {
  const key = normaliseMpn(mpn);
  const same = parts.filter((p) => normaliseMpn(p.mpn) === key);
  if (!same.length) return null;
  if (manufacturer) {
    const m = manufacturer.toLowerCase();
    const byMaker = same.find((p) => p.manufacturer.toLowerCase().includes(m.split(" ")[0]) || m.includes(p.manufacturer.toLowerCase().split(" ")[0]));
    if (byMaker) return byMaker;
  }
  return same[0];
}
