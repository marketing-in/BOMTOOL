import Link from "next/link";
import { AlertTriangle, CircleCheck, CircleDashed, CircleX, History, ListChecks, PackageX, ShoppingCart, TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoney, formatMoneyCompact, getActiveFx } from "@/lib/currency";
import { LIFECYCLE_LABEL } from "@/lib/risk";
import { ALL_ADAPTERS, adapterStatus, mockEnabled } from "@/server/sourcing";
import { analyseRevision } from "@/server/bom-pipeline";
import { ensureFx } from "@/server/fx";
import { PageHeader, Section, Stat, EmptyState } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { RefreshButton } from "@/components/sourcing/refresh-button";
import { AddShortagesButton } from "@/components/sourcing/cart-buttons";
import { Fold } from "@/components/viz/fold";
import { SegBar } from "@/components/viz/seg-bar";

export const metadata = { title: "Sourcing" };

const EVENT: Record<string, { label: string; level: "red" | "amber" | "green" | "grey" }> = {
  PRICE_SPIKE: { label: "Price up", level: "red" },
  PRICE_DROP: { label: "Price down", level: "green" },
  STOCK_OUT: { label: "Out of stock", level: "red" },
  BACK_IN_STOCK: { label: "Back in stock", level: "green" },
  LIFECYCLE_CHANGE: { label: "Lifecycle", level: "amber" },
  NEW_PART: { label: "New part", level: "grey" },
};

function ago(d: Date | string | null | undefined) {
  if (!d) return "never";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

export default async function SourcingPage() {
  const user = await requireUser();
  const currency = await getDisplayCurrency();
  await ensureFx();
  const mock = mockEnabled();
  const [statuses, runs, events, revisions, openRfqs] = await Promise.all([
    Promise.all(ALL_ADAPTERS.map(async (a) => ({ a, s: await adapterStatus(a) }))),
    db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 8 }),
    db.sourcingEvent.findMany({ orderBy: { createdAt: "desc" }, take: 14, include: { part: { select: { id: true, mpn: true } }, supplier: { select: { name: true } } } }),
    db.bomRevision.findMany({ where: { status: { in: ["MATCHED", "QUOTED", "RELEASED"] } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true } }),
    db.rfq.findMany({ where: { status: { not: "CLOSED" } }, orderBy: { createdAt: "desc" }, take: 6, include: { _count: { select: { lines: true, quotes: true, suppliers: true } } } }),
  ]);

  // Shortages across recent BoMs: lines that need buying, short-first.
  const analyses = (await Promise.all(revisions.map((r) => analyseRevision(db, r.id, currency)))).filter((a) => !!a);
  const shortages = analyses.flatMap((a) =>
    a.lines
      .filter((l) => l.partId && !l.dnp && (l.shortfall > 0 || l.toBuyLanded > 0))
      .map((l) => ({ a, l })),
  );
  shortages.sort((x, y) => y.l.shortfall - x.l.shortfall || y.l.toBuyLanded - x.l.toBuyLanded);
  const fx = getActiveFx();
  const buyer = can(user.role, "sourcing.buy");
  const toBuy = analyses.reduce((s, a) => s + a.totals.toBuyLanded, 0);
  const short = shortages.filter((x) => x.l.shortfall > 0).length;
  const priceUps = events.filter((e) => e.kind === "PRICE_SPIKE").length;
  const stockOuts = events.filter((e) => e.kind === "STOCK_OUT").length;
  const PALETTE = ["var(--cost-1)", "var(--cost-3)", "var(--cost-4)", "var(--cost-7)", "var(--cost-5)", "var(--cost-2)", "var(--cost-6)", "var(--cost-8)"];
  const lastRun = runs[0];

  return (
    <>
      <PageHeader
        title="Sourcing"
        actions={buyer ? <RefreshButton scope={{ hot: true, label: "Hot parts" }} label="Refresh hot parts" /> : null}
      />

      {mock ? (
        <div className="mb-6 flex items-start gap-2.5 rounded-md border border-risk-amber/40 bg-risk-amber-soft px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk-amber" aria-hidden />
          <span title="Prices and stock come from the mock market and move on their own every hour. Mock offers stay labelled until you purge them.">
            <strong className="font-semibold">Simulated market.</strong> No distributor keys set — add Nexar, DigiKey or Mouser keys to <span className="font-medium">.env</span> for live data.
          </span>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ShoppingCart} label="To buy, landed" value={formatMoneyCompact(toBuy, currency)} hint={`${analyses.length} BoM${analyses.length === 1 ? "" : "s"} · net of GST credit`} />
        <Stat icon={ListChecks} label="Lines to buy" value={shortages.length} hint="after our stock" />
        <Stat icon={PackageX} label="Short everywhere" value={short} hint={short ? "no source has enough" : "all can be bought"} tone={short ? "red" : "green"} />
        <Stat icon={TrendingUp} label="Market changes" value={events.length} hint={`${priceUps} price up · ${stockOuts} out of stock`} tone={priceUps + stockOuts ? "amber" : "plain"} />
      </div>
      {toBuy > 0 && analyses.length > 1 ? (
        <div className="mb-6 rounded-xl border bg-card p-5">
          <SegBar
            thick
            label="To buy, by BoM"
            segs={analyses.map((a, i) => ({ key: a.revision.id, label: `${a.revision.bom.name} rev ${a.revision.revision}`, value: a.totals.toBuyLanded, color: PALETTE[i % PALETTE.length], text: formatMoneyCompact(a.totals.toBuyLanded, currency) }))}
          />
        </div>
      ) : null}

      <ul className="mb-6 flex flex-wrap gap-2" aria-label="Supplier data feeds">
        {statuses.map(({ a, s }) => {
          const live = a.kind !== "mock" && a.configured();
          const on = a.kind === "mock" ? mock : live;
          // An error counts only while it is the latest thing that happened: one that a later good call followed is history.
          const failing = on && !!s.lastError && (!s.lastOkAt || (!!s.lastErrorAt && s.lastErrorAt > s.lastOkAt));
          const Icon = !on ? CircleDashed : failing ? CircleX : CircleCheck;
          const state = a.kind === "mock" ? (mock ? "Active" : "Off") : live ? "Live" : "Not configured";
          const help = a.kind === "mock" ? (mock ? "No live keys set" : "Live adapters configured") : live ? undefined : `Set ${a.envVars.join(" + ")}`;
          return (
            <li key={a.key} title={help} className={`max-w-full rounded-md border bg-card px-3 py-2 ${failing ? "border-risk-red/40" : ""}`}>
              <div className="flex items-center gap-2 text-sm">
                <Icon className={`size-4 shrink-0 ${!on ? "text-muted-foreground" : Icon === CircleX ? "text-risk-red" : "text-risk-green"}`} aria-hidden />
                <span className="font-medium">{a.label}</span>
                <span className="text-xs text-muted-foreground">{state}</span>
                {a.kind !== "mock" ? <span className="num text-xs text-muted-foreground">· {s.callsToday}/{a.dailyLimit} calls · OK {ago(s.lastOkAt)}</span> : null}
              </div>
              {failing && s.lastError ? <div className="mt-1 line-clamp-2 max-w-md text-xs text-risk-red" title={s.lastError}>{s.lastError}</div> : null}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Section
          title="Buy list"
          action={<span className="text-xs text-muted-foreground" title="Landed, net of GST credit">landed</span>}
        >
          {shortages.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 pl-4 font-normal">Part</th>
                    <th className="px-3 py-2 font-normal">BoM</th>
                    <th className="px-3 py-2 text-right font-normal">Need</th>
                    <th className="px-3 py-2 text-right font-normal">To order</th>
                    <th className="py-2 pr-4 pl-3 text-right font-normal">Landed</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {shortages.slice(0, 14).map(({ a, l }) => (
                    <tr key={l.id}>
                      <td className="py-2 pr-3 pl-4">
                        <Link href={`/parts/${l.partId}`} className="num font-medium hover:underline">{l.part!.mpn}</Link>
                        <div className="text-xs text-muted-foreground">{l.part!.manufacturer.name}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <Link href={`/boms/${a.revision.id}`} className="hover:underline">{a.revision.bom.name}</Link>
                        <span className="num text-muted-foreground"> rev {a.revision.revision}</span>
                      </td>
                      <td className="num px-3 py-2 text-right">{l.required.toLocaleString("en-IN")}</td>
                      <td className="num px-3 py-2 text-right">
                        {l.allocations.filter((x) => x.tier >= 3).reduce((s, x) => s + x.orderQty, 0).toLocaleString("en-IN")}
                        {l.shortfall ? (
                          <span className="mt-0.5 flex items-center justify-end gap-1.5 text-xs whitespace-nowrap text-risk-red">
                            <RiskDot level="red" />
                            {l.shortfall.toLocaleString("en-IN")} short
                          </span>
                        ) : null}
                      </td>
                      <td className="num py-2 pr-4 pl-3 text-right whitespace-nowrap">{formatMoney(l.toBuyLanded, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {buyer ? (
                <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
                  <span className="mr-auto text-xs text-muted-foreground">Add to cart</span>
                  {analyses.map((a) => (
                    <AddShortagesButton key={a.revision.id} revisionId={a.revision.id} label={`${a.revision.bom.name} rev ${a.revision.revision}`} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState title="Nothing to buy" />
          )}
        </Section>

        <div className="min-w-0 space-y-6">
          <Section title="Market changes">
            {events.length ? (
              <ul className="divide-y text-sm">
                {events.map((e) => {
                  const info = EVENT[e.kind] ?? { label: e.kind, level: "grey" as const };
                  const d = e.data as Record<string, string | number | null>;
                  const detail =
                    e.kind === "PRICE_SPIKE" || e.kind === "PRICE_DROP"
                      ? `${Number(d.pct) > 0 ? "+" : ""}${d.pct}% → ${formatMoney(Number(d.to), "INR", { unit: true })} @1k`
                      : e.kind === "LIFECYCLE_CHANGE"
                        ? `${LIFECYCLE_LABEL[d.from as keyof typeof LIFECYCLE_LABEL] ?? d.from} → ${LIFECYCLE_LABEL[d.to as keyof typeof LIFECYCLE_LABEL] ?? d.to}`
                        : e.kind === "BACK_IN_STOCK"
                          ? `${Number(d.to).toLocaleString("en-IN")} pcs`
                          : "";
                  return (
                    <li key={e.id} className="flex items-start gap-2.5 px-4 py-2">
                      <RiskDot level={info.level} className="mt-1.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <Link href={`/parts/${e.part.id}`} className="num font-medium hover:underline">{e.part.mpn}</Link>
                          <span className="text-xs">{info.label}</span>
                          <span className="num text-xs text-muted-foreground">{detail}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{e.supplier?.name ?? ""} · {ago(e.createdAt)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="No changes yet" />
            )}
          </Section>

          <Section title="Open RFQs" action={<Link href="/sourcing/rfqs" className="text-xs text-muted-foreground hover:text-foreground">All</Link>}>
            {openRfqs.length ? (
              <ul className="divide-y text-sm">
                {openRfqs.map((r) => (
                  <li key={r.id}>
                    <Link href={`/sourcing/rfqs/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-part-soft">
                      <span className="num font-medium">{r.number}</span>
                      <span className="text-xs text-muted-foreground">{r._count.lines} lines</span>
                      <span className="num ml-auto text-xs text-muted-foreground">{r._count.quotes}/{r._count.suppliers} quoted</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No open RFQs" />
            )}
          </Section>
        </div>
      </div>

      <Fold
        className="mt-6"
        icon={History}
        title="Refresh runs"
        note={`Hot parts every ${process.env.REFRESH_HOT_HOURS ?? 4} h · full catalogue 02:00 IST · FX ${fx.source} ${fx.asOf}`}
        figure={lastRun ? `last ${ago(lastRun.startedAt)}` : "none yet"}
      >
        {runs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-normal">Started</th>
                  <th className="px-4 py-2 font-normal">Job</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 text-right font-normal">Parts</th>
                  <th className="px-4 py-2 text-right font-normal">Offers</th>
                  <th className="px-4 py-2 text-right font-normal">Changes</th>
                  <th className="px-4 py-2 text-right font-normal">API calls</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map((r) => {
                  const s = (r.stats ?? {}) as { label?: string; parts?: number; offersUpserted?: number; events?: number; calls?: Record<string, number>; errors?: string[] };
                  const secs = r.finishedAt ? Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000) : null;
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 text-xs whitespace-nowrap">{ago(r.startedAt)}</td>
                      <td className="px-4 py-2 text-xs">
                        {r.kind}
                        <span className="text-muted-foreground"> · {r.trigger}{s.label ? ` · ${s.label}` : ""}</span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <RiskDot level={r.status === "DONE" ? (s.errors?.length ? "amber" : "green") : r.status === "FAILED" ? "red" : "grey"} />
                          {r.status.toLowerCase()}
                          {secs !== null ? <span className="num text-muted-foreground">{secs}s</span> : null}
                        </span>
                        {r.error ? <div className="text-risk-red">{r.error}</div> : null}
                      </td>
                      <td className="num px-4 py-2 text-right">{s.parts ?? "—"}</td>
                      <td className="num px-4 py-2 text-right">{s.offersUpserted ?? "—"}</td>
                      <td className="num px-4 py-2 text-right">{s.events ?? "—"}</td>
                      <td className="num px-4 py-2 text-right text-xs">{s.calls ? Object.entries(s.calls).map(([k, v]) => `${k} ${v}`).join(" · ") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No refresh has run yet" />
        )}
      </Fold>
    </>
  );
}
