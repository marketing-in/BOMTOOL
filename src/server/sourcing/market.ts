import "server-only";
import { db } from "@/lib/db";
import type { Currency } from "@/lib/currency";
import { normaliseMpn } from "@/lib/normalise";
import { mergeAnswers, type MarketResult } from "@/lib/market-merge";
import { activeAdapters, searchAdapterKeyword } from "@/server/sourcing";
import { SupplierResolver, applyAdapterPart, applyLifecycle, upsertPartFromAdapter } from "@/server/sourcing/refresh";
import type { AdapterKey, AdapterPart } from "@/server/sourcing/types";

/** On-demand searches are good for 15 minutes: browsing the results never repeats the API call. */
export const MARKET_TTL_SEC = 15 * 60;

export type { MarketOffer, MarketResult } from "@/lib/market-merge";

export type MarketSource = { key: AdapterKey; label: string; count: number; cached: boolean; error?: string };

/** Raw adapter answers for a query (cached), so an import can reuse them without another call. */
export async function marketAnswers(query: string): Promise<{ adapter: AdapterKey; label: string; parts: AdapterPart[]; cached: boolean; error?: string }[]> {
  return Promise.all(
    activeAdapters()
      // Paused adapters (daily limit 0, e.g. Nexar's evaluation plan) are skipped, not reported as errors.
      .filter((a) => a.searchKeyword && a.dailyLimit > 0)
      .map(async (a) => {
        try {
          const r = await searchAdapterKeyword(a, query, MARKET_TTL_SEC);
          return { adapter: a.key, label: a.label, parts: r.parts, cached: r.cached };
        } catch (e) {
          return { adapter: a.key, label: a.label, parts: [], cached: false, error: e instanceof Error ? e.message : "Search failed" };
        }
      }),
  );
}

export async function searchMarket(query: string, currency: Currency, need?: number): Promise<{ results: MarketResult[]; sources: MarketSource[] }> {
  const answers = await marketAnswers(query);
  const results = mergeAnswers(answers, currency, query, need);
  const known = await db.part.findMany({
    where: { mpnNormalised: { in: [...new Set(results.map((r) => normaliseMpn(r.mpn)))] } },
    select: { id: true, mpnNormalised: true },
  });
  const idByMpn = new Map(known.map((k) => [k.mpnNormalised, k.id]));
  for (const r of results) r.partId = idByMpn.get(normaliseMpn(r.mpn)) ?? null;
  return {
    results,
    sources: answers.map((a) => ({ key: a.adapter, label: a.label, count: a.parts.length, cached: a.cached, error: a.error })),
  };
}

/**
 * Adds a distributor search result to our catalogue with every distributor's offer. Uses the cached answers of the
 * search the user is looking at, so it costs no further API calls.
 */
export async function importMarketResult(query: string, key: string, userId: string): Promise<{ partId: string } | { error: string }> {
  const [mpnKey, maker = ""] = key.split("|");
  const answers = await marketAnswers(query);
  const found = answers.flatMap((a) =>
    a.parts.filter((p) => normaliseMpn(p.mpn) === mpnKey && (p.manufacturer.toLowerCase().split(/\s+/)[0] ?? "") === maker).map((part) => ({ adapter: a.adapter, part })),
  );
  if (!found.length) return { error: "That result is no longer in the search — search again." };
  const { partId, created } = await upsertPartFromAdapter(found[0].part, found[0].adapter);
  const suppliers = new SupplierResolver(await db.supplier.findMany());
  for (const f of found) await applyAdapterPart(partId, f.adapter, f.part, suppliers);
  await applyLifecycle(
    partId,
    found.map((f) => ({ source: f.adapter, lifecycle: f.part.lifecycle ?? null })),
  );
  await db.auditLog.create({ data: { userId, action: "part.import", entity: "Part", entityId: partId, data: { mpn: found[0].part.mpn, sources: found.map((f) => f.adapter), created } } });
  return { partId };
}
