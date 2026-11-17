import Link from "next/link";
import Form from "next/form";
import { ExternalLink, FileText, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoney } from "@/lib/currency";
import { ALL_ADAPTERS, activeAdapters, adapterStatus, mockEnabled } from "@/server/sourcing";
import { searchMarket } from "@/server/sourcing/market";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { LifecycleBadge, RiskDot } from "@/components/data/badges";
import { PartPhoto } from "@/components/data/part-photo";
import { PartsTabs } from "@/components/parts/parts-tabs";
import { ImportPartButton } from "@/components/parts/import-button";

export const metadata = { title: "Search distributors" };

const EXAMPLES = ["LDO 3.3V SOT-23", "TPS563200", "ESD USB", "STM32 Cortex-M0", "RS-485 transceiver", "MLCC 10uF 25V 0805"];

export default async function MarketSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const currency = await getDisplayCurrency();
  const allowed = can(user.role, "bom.write") || can(user.role, "sourcing.buy");
  const live = activeAdapters().filter((a) => a.searchKeyword && a.kind !== "mock" && a.dailyLimit > 0);
  const [data, budgets] = await Promise.all([
    query && allowed ? searchMarket(query, currency) : Promise.resolve(null),
    Promise.all(ALL_ADAPTERS.filter((a) => a.kind !== "mock" && a.configured()).map(async (a) => ({ a, s: await adapterStatus(a) }))),
  ]);
  const money = (v: number | null) => (v === null ? "—" : formatMoney(v, currency, { unit: true }));

  return (
    <>
      <PageHeader title="Parts catalogue" />
      <PartsTabs current="market" />

      <Form action="/parts/market" className="relative mb-3 max-w-2xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="mq" className="sr-only">Search distributors</label>
        <input
          id="mq"
          name="q"
          defaultValue={query}
          placeholder="Part number or words: TPS563200, LDO 3.3V SOT-23, RS-485 transceiver…"
          className="h-11 w-full rounded-md border bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </Form>
      <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {mockEnabled() && !live.length ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-risk-amber-soft px-2 py-1 font-medium text-foreground" title="No distributor keys are set: results come from the simulated market.">
            <RiskDot level="amber" /> Simulated market
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5" title="One call to each per new search, reused for 15 minutes.">
            <RiskDot level="green" /> Live: {live.map((a) => a.label).join(", ")}
          </span>
        )}
        {budgets.map(({ a, s }) => (
          <span key={a.key} className="num" title="API calls today">{a.label} {s.callsToday}/{a.dailyLimit}</span>
        ))}
      </p>

      {!allowed ? (
        <div className="rounded-xl border bg-card">
          <EmptyState title="Live search is for engineering and purchasing" />
        </div>
      ) : !query ? (
        <div>
          <ul className="flex flex-wrap gap-2" aria-label="Example searches">
            {EXAMPLES.map((x) => (
              <li key={x}>
                <Link href={`/parts/market?q=${encodeURIComponent(x)}`} className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-[13px] outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">
                  {x}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : data ? (
        <>
          <ul className="mb-4 flex flex-wrap gap-2 text-xs">
            {data.sources.map((s) => (
              <li key={s.key} className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2.5">
                <RiskDot level={s.error ? "red" : s.count ? "green" : "grey"} />
                {s.label}: {s.error ? <span className="text-risk-red">{s.error}</span> : `${s.count} result${s.count === 1 ? "" : "s"}${s.cached ? " (cached)" : ""}`}
              </li>
            ))}
          </ul>
          {data.results.length ? (
            <ul className="space-y-3">
              {data.results.map((r) => (
                <li key={r.key} className="overflow-hidden rounded-xl border bg-card">
                  <div className="flex flex-wrap gap-5 p-5">
                    <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md border bg-white p-1">
                      <PartPhoto src={r.imageUrl} alt="" className="max-h-full max-w-full" fallback={<span className="text-[10px] text-muted-foreground">No photo</span>} />
                    </span>
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {r.partId ? (
                          <Link href={`/parts/${r.partId}`} className="num text-base font-semibold hover:underline">{r.mpn}</Link>
                        ) : (
                          <span className="num text-base font-semibold">{r.mpn}</span>
                        )}
                        <span className="text-sm text-muted-foreground">{r.manufacturer}</span>
                        {r.lifecycle ? <LifecycleBadge lifecycle={r.lifecycle} /> : null}
                        {r.rohs === "COMPLIANT" ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><RiskDot level="green" />RoHS</span> : null}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/85">{r.description}</p>
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {r.category ? <span>{r.category}</span> : null}
                        {r.datasheetUrl ? (
                          <a href={r.datasheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                            <FileText className="size-3.5" aria-hidden /> Datasheet
                          </a>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                      <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{r.totalStock.toLocaleString("en-IN")}</span>
                      <span className="num text-xs text-muted-foreground">in stock · from {money(r.best1k)} @1k</span>
                      {r.partId ? (
                        <Link href={`/parts/${r.partId}`} className="inline-flex h-8 items-center rounded-md border px-3 text-sm transition-colors duration-150 hover:bg-muted">
                          In our catalogue
                        </Link>
                      ) : (
                        <ImportPartButton query={query} resultKey={r.key} mpn={r.mpn} />
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto border-t">
                    <table className="w-full min-w-[620px] text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-1.5 font-normal">Distributor</th>
                          <th className="px-4 py-1.5 text-right font-normal">Stock</th>
                          <th className="px-4 py-1.5 text-right font-normal">MOQ</th>
                          <th className="px-4 py-1.5 text-right font-normal">@1</th>
                          <th className="px-4 py-1.5 text-right font-normal">@1k</th>
                          <th className="px-4 py-1.5 text-right font-normal">Lead</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {r.offers.map((o, i) => (
                          <tr key={i} className={o.stock ? undefined : "text-muted-foreground"}>
                            <td className="px-4 py-1.5">
                              {o.url ? (
                                <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                  {o.seller} <ExternalLink className="size-3" aria-hidden />
                                </a>
                              ) : (
                                o.seller
                              )}
                              {o.packaging ? <span className="ml-2 text-xs text-muted-foreground">{o.packaging}</span> : null}
                            </td>
                            <td className="num px-4 py-1.5 text-right">{o.stock.toLocaleString("en-IN")}</td>
                            <td className="num px-4 py-1.5 text-right">{o.moq.toLocaleString("en-IN")}</td>
                            <td className="num px-4 py-1.5 text-right whitespace-nowrap">{money(o.unit1)}</td>
                            <td className="num px-4 py-1.5 text-right whitespace-nowrap">{money(o.unit1k)}</td>
                            <td className="num px-4 py-1.5 text-right text-xs">{o.leadWeeks === null ? "—" : `${o.leadWeeks} wk`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border bg-card">
              <EmptyState title="Nothing found" />
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
