import Link from "next/link";
import { notFound } from "next/navigation";
import type { Lifecycle } from "@prisma/client";
import { AlertTriangle, CheckCircle2, CircleHelp, OctagonAlert, XCircle } from "lucide-react";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoneyCompact, type Currency } from "@/lib/currency";
import { getDeepAnalysis } from "@/server/deep-analysis";
import { PageHeader } from "@/components/data/page-header";
import { LifecycleBadge, ScorePill } from "@/components/data/badges";
import { cn } from "@/lib/utils";

export const metadata = { title: "Deep analysis" };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** A thin part-to-whole bar: segments separated by a 2 px surface gap, rounded only at the ends. */
function StackedBar({ label, segments }: { label: string; segments: { key: string; value: number; className: string; name: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div role="img" aria-label={`${label}: ${segments.map((s) => `${s.name} ${s.value}`).join(", ")}`} className="flex h-3 w-full gap-0.5 overflow-hidden rounded-[4px] bg-muted">
      {total
        ? segments
            .filter((s) => s.value > 0)
            .map((s) => <div key={s.key} title={`${s.name}: ${s.value} (${pct(s.value, total)}%)`} className={s.className} style={{ width: `${(s.value / total) * 100}%` }} />)
        : null}
    </div>
  );
}

function Legend({ rows, total }: { rows: { key: string; name: string; value: number; swatch: React.ReactNode }[]; total: number }) {
  return (
    <ul className="mt-3 space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2">
          {r.swatch}
          <span className="min-w-0 flex-1">{r.name}</span>
          <span className="num text-xs text-muted-foreground">{pct(r.value, total)}%</span>
          <span className="num w-8 text-right">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

const swatch = (className: string) => <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", className)} />;

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currency = (await getDisplayCurrency()) as Currency;
  const res = await getDeepAnalysis(id, currency);
  if (!res) notFound();
  const { report: r, data, analysis } = res;
  const money = (v: number) => formatMoneyCompact(Math.round(v), currency);
  const buildQty = analysis.revision.buildQty;
  const VerdictIcon = r.verdict.level === "green" ? CheckCircle2 : r.verdict.level === "amber" ? AlertTriangle : OctagonAlert;
  const max = Math.max(1, ...r.pareto.map((p) => p.value));

  const tiles: { label: string; value: string; note?: string; tone?: string }[] = [
    { label: "Lines matched", value: `${r.matched} / ${r.counted}`, tone: r.matched < r.counted ? "text-risk-red" : undefined },
    { label: "From our stock", value: `${pct(r.coverage.ours, r.counted)}%`, note: "of lines covered in full" },
    { label: "Buyable now", value: `${pct(r.coverage.ours + r.coverage.partners + r.coverage.suppliers, r.counted)}%`, note: "from stock, partners or distributors" },
    { label: "High-risk lines", value: String(r.distribution.red), tone: r.distribution.red ? "text-risk-red" : undefined },
    { label: "Longest factory lead", value: r.longestLead ? `${r.longestLead.weeks} wk` : "—", note: r.longestLead?.label },
    { label: "Still to buy", value: money(r.toBuyTotal), note: "landed, at MOQ" },
  ];

  return (
    <>
      <PageHeader
        title={`Deep analysis${data.product ? ` — ${data.product.name}` : ""}`}
        eyebrow={<span className="num">{buildQty.toLocaleString("en-IN")} boards</span>}
      />

      <section
        aria-label="Verdict"
        className={cn(
          "mb-6 flex items-start gap-3 rounded-xl border p-5",
          r.verdict.level === "green" ? "border-risk-green/40 bg-risk-green-soft" : r.verdict.level === "amber" ? "border-risk-amber/40 bg-risk-amber-soft" : "border-risk-red/40 bg-risk-red-soft",
        )}
      >
        <VerdictIcon className={cn("mt-0.5 size-5 shrink-0", r.verdict.level === "green" ? "text-risk-green" : r.verdict.level === "amber" ? "text-risk-amber" : "text-risk-red")} aria-hidden />
        <div>
          <h2 className="text-xl leading-tight font-semibold tracking-tight">{r.verdict.title}</h2>
          <p className="text-sm text-muted-foreground">{r.verdict.detail}</p>
        </div>
      </section>

      <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="bg-card p-5" title={t.note}>
            <dd className={cn("text-2xl leading-none font-semibold tracking-tight tabular-nums", t.tone)}>{t.value}</dd>
            <dt className="mt-1.5 text-xs text-muted-foreground">{t.label}</dt>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="actions">
          <h2 id="actions" className="mb-3 text-lg font-semibold tracking-tight">What to do first</h2>
          {r.actions.length ? (
            <ol className="space-y-3">
              {r.actions.map((a, i) => (
                <li key={a.key} className="grid grid-cols-[1.75rem_1fr] gap-3 rounded-xl border bg-card p-4">
                  <span className={cn("num grid size-7 place-items-center rounded-md text-xs font-semibold", a.level === "red" ? "bg-risk-red-soft text-risk-red" : "bg-risk-amber-soft text-risk-amber")}>{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="font-medium">{a.title}</h3>
                      {a.value > 0 ? <span className="text-xs text-muted-foreground">{money(a.value)} to buy</span> : null}
                    </div>
                    <p className="mt-1 max-w-prose text-sm text-muted-foreground">{a.detail}</p>
                    {a.lines.length ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {a.lines.slice(0, 8).map((l) => (
                          <li key={l.lineId}>
                            {l.partId ? (
                              <Link href={`/parts/${l.partId}`} className="num inline-flex h-7 items-center rounded-md border px-2 text-xs transition-colors duration-150 hover:bg-part-soft">{l.label}</Link>
                            ) : (
                              <span className="num inline-flex h-7 items-center rounded-md border border-dashed px-2 text-xs">{l.label}</span>
                            )}
                          </li>
                        ))}
                        {a.lines.length > 8 ? <li className="inline-flex h-7 items-center px-1 text-xs text-muted-foreground">+{a.lines.length - 8} more</li> : null}
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Nothing to do.</p>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-4" aria-labelledby="risk-mix">
            <h2 id="risk-mix" className="mb-3 text-lg font-semibold tracking-tight">Risk across the BoM</h2>
            <StackedBar
              label="Lines by risk"
              segments={[
                { key: "green", name: "Low risk", value: r.distribution.green, className: "bg-risk-green" },
                { key: "amber", name: "Watch", value: r.distribution.amber, className: "bg-risk-amber" },
                { key: "red", name: "High risk", value: r.distribution.red, className: "bg-risk-red" },
                { key: "grey", name: "Not assessed", value: r.distribution.grey, className: "bg-risk-grey" },
              ]}
            />
            <Legend
              total={r.counted}
              rows={[
                { key: "green", name: "Low risk", value: r.distribution.green, swatch: <CheckCircle2 className="size-3.5 shrink-0 text-risk-green" aria-hidden /> },
                { key: "amber", name: "Watch", value: r.distribution.amber, swatch: <AlertTriangle className="size-3.5 shrink-0 text-risk-amber" aria-hidden /> },
                { key: "red", name: "High risk", value: r.distribution.red, swatch: <XCircle className="size-3.5 shrink-0 text-risk-red" aria-hidden /> },
                { key: "grey", name: "Not assessed (unmatched)", value: r.distribution.grey, swatch: <CircleHelp className="size-3.5 shrink-0 text-risk-grey" aria-hidden /> },
              ]}
            />
          </section>

          <section className="rounded-xl border bg-card p-4" aria-labelledby="coverage">
            <h2 id="coverage" className="mb-3 text-lg font-semibold tracking-tight">Where supply comes from</h2>
            <StackedBar
              label="Lines by source"
              segments={[
                { key: "ours", name: "Our stock", value: r.coverage.ours, className: "bg-cover-1" },
                { key: "partners", name: "Channel partners", value: r.coverage.partners, className: "bg-cover-2" },
                { key: "suppliers", name: "Distributors", value: r.coverage.suppliers, className: "bg-cover-3" },
                { key: "market", name: "Marketplace", value: r.coverage.market, className: "bg-cover-4" },
                { key: "none", name: "No source covers it", value: r.coverage.none, className: "bg-risk-red" },
                { key: "unmatched", name: "Unmatched", value: r.coverage.unmatched, className: "bg-risk-grey" },
              ]}
            />
            <Legend
              total={r.counted}
              rows={[
                { key: "ours", name: "1 · Our stock", value: r.coverage.ours, swatch: swatch("bg-cover-1") },
                { key: "partners", name: "2 · Channel partners", value: r.coverage.partners, swatch: swatch("bg-cover-2") },
                { key: "suppliers", name: "3 · Distributors", value: r.coverage.suppliers, swatch: swatch("bg-cover-3") },
                { key: "market", name: "4 · Marketplace", value: r.coverage.market, swatch: swatch("bg-cover-4") },
                { key: "none", name: "No source covers it", value: r.coverage.none, swatch: <XCircle className="size-3.5 shrink-0 text-risk-red" aria-hidden /> },
                { key: "unmatched", name: "Unmatched", value: r.coverage.unmatched, swatch: <CircleHelp className="size-3.5 shrink-0 text-risk-grey" aria-hidden /> },
              ]}
            />
          </section>

          <section className="rounded-xl border bg-card p-4" aria-labelledby="lifecycle">
            <h2 id="lifecycle" className="mb-3 text-lg font-semibold tracking-tight">Lifecycle</h2>
            <ul className="space-y-1.5 text-sm">
              {r.lifecycle.map((l) => (
                <li key={l.state} className="flex items-center justify-between gap-2">
                  <LifecycleBadge lifecycle={l.state as Lifecycle} />
                  <span className="num">{l.count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border bg-card p-4" aria-labelledby="compliance">
            <h2 id="compliance" className="mb-3 text-lg font-semibold tracking-tight">Compliance</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
              {(
                [
                  ["Not RoHS compliant", r.compliance.rohsIssues, "red"],
                  ["RoHS unknown", r.compliance.rohsUnknown, "amber"],
                  ["Contains REACH SVHC", r.compliance.svhc, "amber"],
                  ["REACH unknown", r.compliance.reachUnknown, "amber"],
                ] as const
              ).map(([k, v, tone]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className={cn("num text-right", v ? (tone === "red" ? "text-risk-red" : "text-risk-amber") : "")}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>

      <section className="mt-8" aria-labelledby="riskiest">
        <h2 id="riskiest" className="mb-3 text-lg font-semibold tracking-tight">Riskiest lines</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Part</th>
                <th className="px-4 py-2.5 font-medium">Risk</th>
                <th className="px-4 py-2.5 font-medium">Weakest point</th>
                <th className="px-4 py-2.5 font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {r.topRisks.map(({ line, factor }) => (
                <tr key={line.lineId} className="border-b align-top last:border-0">
                  <td className="px-4 py-3">
                    {line.partId ? <Link href={`/parts/${line.partId}`} className="num font-medium hover:underline">{line.mpn}</Link> : <span className="num">{line.mpn}</span>}
                    <div className="num text-xs text-muted-foreground">{line.refDes}</div>
                  </td>
                  <td className="px-4 py-3"><ScorePill score={line.risk?.score ?? null} label="Part risk" /></td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{factor.label}</div>
                    <div className="max-w-prose text-xs text-muted-foreground">{factor.reason}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{factor.action ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="money">
        <h2 id="money" className="text-lg font-semibold tracking-tight">Where the money goes</h2>
        <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
          Top {r.pareto.length} lines · {pct(r.pareto.at(-1)?.cumulative ?? 0, 1)}% of {money(r.spendTotal)}
        </p>
        <ol className="space-y-2 rounded-xl border bg-card p-4">
          {r.pareto.map((p) => (
            <li key={p.lineId} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,16rem)_1fr_6rem_4rem]">
              {p.partId ? (
                <Link href={`/parts/${p.partId}`} className="num truncate hover:underline" title={p.label}>{p.label}</Link>
              ) : (
                <span className="num truncate" title={p.label}>{p.label}</span>
              )}
              <div className="h-3">
                <div className="h-3 rounded-r-[3px] bg-primary/80" style={{ width: `${(p.value / max) * 100}%` }} title={`${p.label}: ${money(p.value)}`} />
              </div>
              <span className="num text-right">{money(p.value)}</span>
              <span className="num hidden text-right text-xs text-muted-foreground sm:block" title="Running share of the build's parts cost">{Math.round(p.cumulative * 100)}%</span>
            </li>
          ))}
        </ol>
      </section>

      {data.box || data.route.some((s) => s.watch) ? (
        <section className="mt-8 grid gap-4 md:grid-cols-2" aria-label="Box and process">
          {data.box && data.enclosure ? (
            <div className="rounded-xl border bg-card p-4">
              <h2 className="text-lg font-semibold tracking-tight">The finished product</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{data.enclosure.label}</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {data.box.kit
                  .filter((k) => k.status !== "in-bom" && k.status !== "supplied")
                  .map((k) => (
                    <li key={k.key} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-risk-amber" aria-hidden />
                      <span>
                        {k.label} <span className="text-xs text-muted-foreground">— {k.why}</span>
                      </span>
                    </li>
                  ))}
              </ul>
              <Link href={`/boms/${id}/viewer`} className="mt-3 inline-block text-xs text-muted-foreground hover:text-foreground">See it in the box →</Link>
            </div>
          ) : null}
          {data.route.some((s) => s.watch) ? (
            <div className="rounded-xl border bg-card p-4">
              <h2 className="text-lg font-semibold tracking-tight">On the line</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {data.route
                  .filter((s) => s.watch)
                  .map((s) => (
                    <li key={s.key}>
                      <Link href={`/boms/${id}/route#${s.key}`} className="font-medium hover:underline">{s.title}</Link>
                      <span className="text-xs text-muted-foreground"> — {s.watch}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

    </>
  );
}
