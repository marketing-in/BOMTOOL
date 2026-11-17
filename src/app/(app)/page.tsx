import Link from "next/link";
import type { Lifecycle } from "@prisma/client";
import { ArrowUpRight, Bell, ChevronDown, CircuitBoard, ClipboardList, Cpu, Factory, FileUp, Hourglass, Search, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoneyCompact } from "@/lib/currency";
import { LIFECYCLE_LABEL, LIFECYCLE_RISK } from "@/lib/risk";
import { getDashboard } from "@/server/catalogue";
import { getAlerts } from "@/server/alerts";
import { bomCards } from "@/server/bom-cards";
import { ALL_ADAPTERS, adapterStatus, mockEnabled } from "@/server/sourcing";
import { Section } from "@/components/data/page-header";
import { LifecycleBadge, RiskDot } from "@/components/data/badges";
import { KnowledgeEntrances } from "@/components/knowledge/entrances";
import { BomCard } from "@/components/bom/bom-card";
import { Info } from "@/components/viz/info";
import { Kpi } from "@/components/viz/kpi";

import { SegBar } from "@/components/viz/seg-bar";
import { cn } from "@/lib/utils";

export const metadata = { title: "Home" };

const LIFECYCLE_ORDER: Lifecycle[] = ["ACTIVE", "NRND", "LAST_TIME_BUY", "EOL", "OBSOLETE", "UNKNOWN"];
const BAR: Record<string, string> = { green: "bg-risk-green", amber: "bg-risk-amber", red: "bg-risk-red", grey: "bg-risk-grey" };
const INK: Record<string, string> = { green: "var(--risk-green)", amber: "var(--risk-amber)", red: "var(--risk-red)", grey: "var(--risk-grey)" };
const WO_STATUS: Record<string, string> = { IN_PROGRESS: "Running", KITTING: "Kitting", READY: "Ready", PLANNED: "Planned" };
const ALERT_RANK = { red: 0, amber: 1, green: 2, grey: 3 } as const;
const CHIP = "inline-flex min-h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring";

function ago(d: Date | string | undefined | null) {
  if (!d) return "never";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * Home (Phase 26: picture first): the day at a glance — three chips, four figures, a ring per line, the newest BoMs
 * as cards with their own boards, and what needs attention.
 */
export default async function HomePage() {
  const user = await requireUser();
  const currency = await getDisplayCurrency();
  const [d, alerts, supply, lastRefresh, cards] = await Promise.all([
    getDashboard(currency),
    getAlerts(),
    Promise.all(ALL_ADAPTERS.map(async (a) => ({ a, s: await adapterStatus(a) }))),
    db.jobRun.findFirst({ where: { kind: { in: ["refresh.hot", "refresh.full"] }, status: "DONE" }, orderBy: { startedAt: "desc" }, select: { finishedAt: true, startedAt: true } }),
    bomCards(4),
  ]);
  const mock = mockEnabled();
  const now = new Date();
  const lcTotal = Object.values(d.lifecycle).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const running = d.lines.filter((l) => l.workOrders[0]?.status === "IN_PROGRESS").length;
  const urgent = [...alerts].sort((a, b) => ALERT_RANK[a.level] - ALERT_RANK[b.level] || b.at.getTime() - a.at.getTime());
  const redAlerts = alerts.filter((a) => a.level === "red").length;
  const amberAlerts = alerts.filter((a) => a.level === "amber").length;
  const atRisk = d.revisions.filter((r) => r.riskCount > 0).length;
  const firstName = user.name?.split(" ")[0] ?? "there";
  const workOrders = d.lines.reduce((s, l) => s + l.workOrders.length, 0);

  return (
    <>
      <section className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="page-heading text-[2rem] leading-tight font-semibold tracking-tight">
            {greeting(now)}, {firstName}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now)}</p>
          <ul className="mt-3 flex flex-wrap gap-1.5 text-xs" aria-label="Today">
            <li>
              <Link href="/operations" className={CHIP}>
                <Factory className="size-3.5 text-primary" aria-hidden /> <span className="num font-semibold">{running} of {d.lines.length}</span> lines running
              </Link>
            </li>
            <li>
              <Link href="/alerts" className={cn(CHIP, redAlerts && "border-risk-red/30 bg-risk-red-soft hover:bg-risk-red-soft")}>
                <Bell className={cn("size-3.5", redAlerts ? "text-risk-red" : "text-muted-foreground")} aria-hidden />
                {redAlerts ? <><span className="num font-semibold">{redAlerts}</span> urgent alert{redAlerts === 1 ? "" : "s"}</> : "No urgent alerts"}
              </Link>
            </li>
            <li>
              <Link href="/boms" className={CHIP}>
                <CircuitBoard className={cn("size-3.5", atRisk ? "text-risk-amber" : "text-risk-green")} aria-hidden /> <span className="num font-semibold">{atRisk}</span> BoM{atRisk === 1 ? "" : "s"} with lifecycle risk
              </Link>
            </li>
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user.role, "bom.write") ? (
            <Link href="/boms/new" className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-colors duration-150 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring">
              <FileUp className="size-4" aria-hidden /> Upload a BoM
            </Link>
          ) : null}
          <Link href="/parts" className="inline-flex h-11 items-center gap-2 rounded-md border bg-card px-4 text-sm outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">
            <Search className="size-4 text-muted-foreground" aria-hidden /> Find a part
          </Link>
        </div>
      </section>

      <div className="dashboard-figures grid grid-cols-2 overflow-hidden rounded-xl border bg-card lg:grid-cols-4" aria-label="Key figures">
        <Kpi icon={Cpu} label="Parts in catalogue" value={d.partCount.toLocaleString("en-IN")} info={<p>{d.supplierCount} sources, including our own stores and excess.</p>} />
        <Kpi icon={Wallet} label="Own stock value" value={formatMoneyCompact(d.ownStockValue, currency)} info={<p>Stock we own. Customer-consigned stock is not counted.</p>} />
        <Kpi
          icon={Hourglass}
          label="Open MSL bags"
          value={d.openMslBags}
          tone={d.mslExpiring ? "red" : "plain"}
          note={d.mslExpiring ? `${d.mslExpiring} under 24 h` : undefined}
          info={<p>{d.mslExpiring ? `${d.mslExpiring} open bag${d.mslExpiring === 1 ? " has" : "s have"} under 24 hours of floor life left: use or bake them.` : "Every open bag is within its floor life."}</p>}
        />
        <Kpi icon={ClipboardList} label="Active work orders" value={workOrders} info={<p>Planned, kitting, ready or running, on {d.lines.length} lines.</p>} />
      </div>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Section
            title="Production readiness"
            action={
              <span className="flex items-center gap-2">
                <Info label="About the rings" align="end">
                  <p>The ring is clear-to-build: the share of the work order&apos;s kit that is on hand.</p>
                </Info>
                <Link href="/operations/lines" className="text-xs text-muted-foreground hover:text-foreground">All lines</Link>
              </span>
            }
          >
            <ul className="divide-y">
              {d.lines.map((line) => {
                const wo = line.workOrders[0];
                const ctb = wo?.clearToBuildPct ?? null;
                const level = !wo ? "grey" : wo.status === "IN_PROGRESS" || (ctb ?? 0) >= 90 ? "green" : (ctb ?? 0) >= 60 ? "amber" : "red";
                return (
                  <li key={line.id} className="px-5 py-4" title={`${line._count.machines} stations`}>
                    <div className="mb-2.5 flex items-center justify-between gap-4">
                      <Link href="/operations/lines" className="flex min-w-0 items-center gap-3 text-sm font-medium hover:text-primary">
                        <span className="num rounded-md bg-muted px-2 py-1 text-xs font-semibold">{line.code}</span>
                        <span className="truncate">{line.name.replace(/^.*—\s*/, "")}</span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs">
                        <RiskDot level={level} />{wo ? WO_STATUS[wo.status] : "Idle"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div role="meter" aria-label={`${line.code} clear to build`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ctb ?? 0} aria-valuetext={wo ? `${ctb ?? 0}% kit ready` : "No work order"} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="readiness-fill h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${Math.min(100, Math.max(0, ctb ?? 0))}%`, backgroundColor: INK[level] }} />
                      </div>
                      <span className="num w-12 shrink-0 text-right text-sm font-semibold">{wo ? `${ctb ?? 0}%` : "—"}</span>
                    </div>
                    <p className="mt-1.5 pl-11 text-xs text-muted-foreground">{wo ? wo.project.name : "No work order assigned"}</p>
                  </li>
                );
              })}
            </ul>
          </Section>

          <section aria-labelledby="home-boms">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="home-boms" className="text-lg font-semibold tracking-tight">
                Customer BoMs
              </h2>
              <Link href="/boms" className="text-xs text-muted-foreground hover:text-foreground">All BoMs</Link>
            </div>
            {cards.length ? (
              <div className="grid gap-3">
                {cards.map((b) => <BomCard key={b.id} b={b} compact />)}
              </div>
            ) : (
              <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">No BoMs yet.</p>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <Section
            title="Needs attention"
            action={
              <Link href="/alerts" className="text-xs text-muted-foreground hover:text-foreground">
                All {alerts.length}
              </Link>
            }
          >
            {urgent.length ? (
              <>
                <div className="px-5 pt-4 pb-3">
                  <SegBar
                    label="Alerts by urgency"
                    segs={[
                      { key: "red", label: "Urgent", value: redAlerts, color: "var(--risk-red)" },
                      { key: "amber", label: "To watch", value: amberAlerts, color: "var(--risk-amber)" },
                      { key: "rest", label: "For information", value: alerts.length - redAlerts - amberAlerts, color: "var(--risk-grey)" },
                    ]}
                  />
                </div>
                <ul className="divide-y border-t">
                  {urgent.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <Link href={a.href} className="flex items-start gap-3 px-5 py-3.5 transition-colors duration-150 hover:bg-muted/50">
                        <RiskDot level={a.level} className="mt-1.5" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{a.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{ago(a.at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">All clear.</p>
            )}
          </Section>

          <details className="group overflow-hidden rounded-xl border bg-card">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <h2 className="text-base font-semibold">Supply data</h2>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {mock ? <span className="rounded-md bg-risk-amber-soft px-2 py-0.5 font-medium text-risk-amber">Simulated</span> : null}
                {ago(lastRefresh?.finishedAt ?? lastRefresh?.startedAt)}
                <ChevronDown className="size-4 transition-transform duration-150 group-open:rotate-180" aria-hidden />
              </span>
            </summary>
            <ul className="divide-y border-t">
              {supply.map(({ a, s }) => {
                const on = a.kind === "mock" ? mock : a.configured() && a.dailyLimit > 0;
                const failing = on && !!s.lastErrorAt && (!s.lastOkAt || s.lastErrorAt > s.lastOkAt);
                const state = a.kind === "mock" ? (mock ? "Simulated market" : "Off — live data in use") : !a.configured() ? "Not configured" : a.dailyLimit <= 0 ? "Paused" : failing ? "Last call failed" : "Live";
                return (
                  <li key={a.key} className="flex items-center gap-3 px-5 py-3.5 text-sm">
                    <RiskDot level={!on ? "grey" : failing ? "red" : a.kind === "mock" ? "amber" : "green"} />
                    <span className="min-w-0 flex-1 truncate">{a.label}</span>
                    <span className="text-xs text-muted-foreground">{state}</span>
                    {a.kind !== "mock" && on ? <span className="num w-14 text-right text-xs text-muted-foreground">{s.callsToday} calls</span> : null}
                  </li>
                );
              })}
            </ul>
          </details>

          <Section title="Catalogue lifecycle">
            <div className="px-4 pt-4 pb-3">
              <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label="Lifecycle distribution">
                {LIFECYCLE_ORDER.filter((lc) => d.lifecycle[lc]).map((lc) => (
                  <div key={lc} className={BAR[LIFECYCLE_RISK[lc]]} style={{ width: `${((d.lifecycle[lc] ?? 0) / lcTotal) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {LIFECYCLE_ORDER.filter((lc) => d.lifecycle[lc]).map((lc) => (
                  <li key={lc} className="flex items-center gap-2 text-sm">
                    <RiskDot level={LIFECYCLE_RISK[lc]} />
                    <Link href={`/parts?lifecycle=${lc}`} className="hover:underline">{LIFECYCLE_LABEL[lc]}</Link>
                    <span className="num ml-auto text-muted-foreground">{d.lifecycle[lc]}</span>
                  </li>
                ))}
              </ul>
            </div>
            {d.watch.length ? (
                <details className="group border-t">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">In active BoMs <span className="num text-xs font-normal text-muted-foreground">{Math.min(5, d.watch.length)}</span></summary>
                <ul className="divide-y border-t">
                  {d.watch.slice(0, 5).map((l) => (
                    <li key={l.id}>
                      <Link href={`/parts/${l.part!.id}`} className="group flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-muted/50">
                        <span className="min-w-0 flex-1">
                          <span className="num block truncate text-sm">{l.part!.mpn}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {l.revision.bom.name} · {l.refDes}
                          </span>
                        </span>
                        <LifecycleBadge lifecycle={l.part!.lifecycle} />
                        <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Section>
        </div>
      </div>

      <section aria-labelledby="learn" className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="learn" className="text-lg font-semibold tracking-tight">Know every part</h2>
          <Link href="/knowledge" className="text-xs text-muted-foreground hover:text-foreground">All knowledge</Link>
        </div>
        <KnowledgeEntrances lines />
      </section>
    </>
  );
}
