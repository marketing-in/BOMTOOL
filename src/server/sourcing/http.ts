import { AdapterError, type AdapterKey } from "./types";

/** One request; a dropped connection (not an HTTP error or a timeout) is tried once more after a short pause. */
export async function fetchJson<T>(adapter: AdapterKey, url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  try {
    return await fetchOnce<T>(adapter, url, init, timeoutMs);
  } catch (e) {
    if (!(e instanceof AdapterError) || e.status !== undefined || /timed out/.test(e.message) || init.signal?.aborted) throw e;
    await new Promise((r) => setTimeout(r, 800));
    return fetchOnce<T>(adapter, url, init, timeoutMs);
  }
}

async function fetchOnce<T>(adapter: AdapterKey, url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const outer = init.signal;
  outer?.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      // Never echo request headers/keys; the body of an error response is safe to keep short.
      throw new AdapterError(adapter, `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`, res.status);
    }
    return (text ? JSON.parse(text) : {}) as T;
  } catch (e) {
    if (e instanceof AdapterError) throw e;
    if ((e as Error).name === "AbortError") throw new AdapterError(adapter, `timed out after ${timeoutMs} ms`);
    throw new AdapterError(adapter, (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

type Token = { value: string; expiresAt: number };
const tokens = new Map<string, Token>();

/** OAuth2 client-credentials token, cached in memory until a minute before expiry. */
export async function clientCredentialsToken(
  adapter: AdapterKey,
  tokenUrl: string,
  form: Record<string, string>,
): Promise<string> {
  const key = `${adapter}:${form.client_id}`;
  const cached = tokens.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const body = new URLSearchParams({ grant_type: "client_credentials", ...form });
  const json = await fetchJson<{ access_token?: string; expires_in?: number }>(adapter, tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!json.access_token) throw new AdapterError(adapter, "token response had no access_token");
  tokens.set(key, { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 600) * 1000 });
  return json.access_token;
}
