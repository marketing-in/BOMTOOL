import { db } from "@/lib/db";
import { MOCK_FX, getActiveFx, parseFxResponse, setActiveFx, type FxTable } from "@/lib/currency";
import { getCache } from "@/server/sourcing/cache";

const CACHE_KEY = "fx:latest";
const g = globalThis as unknown as { __emsFxCheckedAt?: number };

/** Fetches live rates from FX_API_URL (e.g. https://open.er-api.com/v6/latest/INR) and makes them active. */
export async function refreshFx(): Promise<FxTable> {
  const url = process.env.FX_API_URL;
  if (!url) {
    setActiveFx(MOCK_FX);
    return MOCK_FX;
  }
  const res = await fetch(url, {
    headers: process.env.FX_API_KEY ? { Authorization: `Bearer ${process.env.FX_API_KEY}` } : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`FX API HTTP ${res.status}`);
  const fx = parseFxResponse(await res.json(), new URL(url).host);
  if (!fx) throw new Error("FX API response has no INR rate");
  const cache = await getCache(db);
  await cache.set(CACHE_KEY, fx, 7 * 86_400);
  setActiveFx(fx);
  return fx;
}

/** Cheap per-request check: load the last stored live rates into this process (every 10 min at most). */
export async function ensureFx(): Promise<FxTable> {
  const now = Date.now();
  if (g.__emsFxCheckedAt && now - g.__emsFxCheckedAt < 10 * 60_000) return getActiveFx();
  g.__emsFxCheckedAt = now;
  if (!process.env.FX_API_URL) return getActiveFx();
  try {
    const cache = await getCache(db);
    const stored = await cache.get<FxTable>(CACHE_KEY);
    if (stored) setActiveFx(stored);
  } catch {
    // keep whatever is active
  }
  return getActiveFx();
}
