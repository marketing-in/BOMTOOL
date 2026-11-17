import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, Download, ListChecks, Printer, SlidersHorizontal, Table2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getDisplayCurrency } from "@/lib/prefs";
import { getBuild } from "@/server/build";
import { GROUP_LABEL, type CostGroup, type QtyQuote } from "@/lib/costing/quote";
import { STAGE_LABEL } from "@/lib/ops/route";
import { BuildHeader } from "@/components/build/build-header";
import { CostStack } from "@/components/build/cost-stack";
import { IssueButton, QuantitiesForm, RatesForm, TermsForm } from "@/components/build/quote-forms";
import { moneyIn, qtyLabel } from "@/components/build/format";
import { Fold } from "@/components/viz/fold";
import { SegBar } from "@/components/viz/seg-bar";
import { cn } from "@/lib/utils";


const GROUP_ORDER: CostGroup[] = ["board", "components", "box", "assembly", "test", "finish", "handling", "margin"];

export default async function QuoteSection({ id }: { id: string }) {
  const user = await requireUser();
  const [b, currency, issued] = await Promise.all([
    getBuild(id),
    getDisplayCurrency(),
    db.customerQuote.findMany({ where: { revisionId: id, status: "ISSUED" }, orderBy: { issuedAt: "desc" }, take: 20 }),
  ]);
  if (!b) notFound();
  const m = moneyIn(currency);
  const edit = can(user.role, "bom.write");
  const ref = b.quotes.find((q) => q.qty === b.refQty) ?? b.quotes[0];
  const unpriced = Math.max(0, ...b.quotes.map((q) => q.unpriced));
  const blocked = !can(user.role, "sourcing.buy") ? "Purchasing or an administrator issues quotes." : unpriced ? `${unpriced} line${unpriced === 1 ? "" : "s"} without a price.` : null;
  const terms = { currency: b.draft?.currency ?? "INR", validDays: b.draft?.validDays ?? 30, notes: b.draft?.notes ?? "" };
  const maxStep = Math.max(1, ...b.process.steps.map((s) => s.perBoard + s.perLot / b.refQty));
  // The process cost of one board, and how it splits over the stages of the route.
  const stepCost = (s: (typeof b.process.steps)[number]) => s.perBoard + s.perLot / b.refQty;
  const processTotal = b.process.steps.reduce((sum, s) => sum + stepCost(s), 0);
  const STAGE_INK = ["var(--cost-1)", "var(--cost-3)", "var(--cost-4)", "var(--cost-7)", "var(--cost-5)", "var(--cost-2)", "var(--cost-6)", "var(--cost-8)"];
  const stageSegs = [...new Set(b.process.steps.map((s) => s.stage))]
    .map((stage, i) => {
      const value = b.process.steps.filter((s) => s.stage === stage).reduce((sum, s) => sum + stepCost(s), 0);
      return { key: stage, label: STAGE_LABEL[stage], value, color: STAGE_INK[i % STAGE_INK.length], text: m.unit(value) };
    })
    .filter((s) => s.value > 0);
  const refQuote = ref;

  return (
    <>
      <BuildHeader b={b} current="quote" currency={currency} section />

      <section aria-label="Price per board" className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {b.quotes.map((q) => (
          <div key={q.qty} className={cn("relative bg-card px-5 py-4", q.qty === b.refQty && "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary")}>
            <div className="text-xs text-muted-foreground">{qtyLabel(q.qty)}</div>
            <div className="num mt-1 text-3xl font-semibold tracking-tight">{m.unit(q.unitPrice)}</div>
            <div className="text-xs text-muted-foreground">per board, ex-GST</div>
            <dl className="num mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="font-sans text-muted-foreground">Lot</dt>
              <dd className="text-right">{m.whole(q.lotPrice)}</dd>
              <dt className="font-sans text-muted-foreground">One-off (NRE)</dt>
              <dd className="text-right">{m.whole(q.nreTotal)}</dd>
              <dt className="font-sans text-muted-foreground">GST {b.rates.gstPct} %</dt>
              <dd className="text-right">{m.whole(q.gst)}</dd>
              <dt className="font-sans font-medium text-foreground">Total</dt>
              <dd className="text-right font-medium">{m.whole(q.total)}</dd>
            </dl>
            {q.unpriced ? <p className="mt-2 text-xs text-risk-red">{q.unpriced} line{q.unpriced === 1 ? "" : "s"} not priced</p> : null}
          </div>
        ))}
        <div className="bg-card px-5 py-4 text-sm">
          <div className="text-xs text-muted-foreground">Delivery</div>
          <div className="num mt-1 text-3xl font-semibold tracking-tight">~{Math.ceil(b.leadDays / 7)} wk</div>
          <div className="text-xs text-muted-foreground">after order: the longest of bare board, box and parts on order, plus a week on our lines</div>
          {b.leadDriver ? <div className="mt-2 text-xs">Longest: {b.leadDriver}</div> : null}
        </div>
      </section>

      <section aria-label="Quote settings" className="mt-4 space-y-3 rounded-lg border bg-card px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <QuantitiesForm revisionId={id} quantities={b.quantities} disabled={!edit} />
          </div>
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/boms/${id}/feasibility`} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted">
              <ClipboardCheck className="size-4" aria-hidden /> Can we build it?
            </Link>
            <Link href={`/boms/${id}/build/print`} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted">
              <Printer className="size-4" aria-hidden /> Preview
            </Link>
            <a href={`/boms/${id}/build/export`} download className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted">
              <Download className="size-4" aria-hidden /> Excel
            </a>
            <IssueButton revisionId={id} blocked={blocked} />
          </span>
        </div>
        <TermsForm revisionId={id} terms={terms} disabled={!edit} />
      </section>

      <div className="mt-6 space-y-3">
        <section aria-labelledby="split" className="rounded-lg border bg-card">
          <h2 id="split" className="border-b px-4 py-3 text-base font-medium">What one board costs, by quantity</h2>
          <div className="px-4 py-4">
            <CostStack quotes={b.quotes} format={(v) => m.unit(v)} />
          </div>
        </section>

        <Fold
          id="process"
          icon={ListChecks}
          title="Process — every step on our lines"
          note={`Per board at ${qtyLabel(b.refQty)}, set-up spread over the lot`}
          figure={m.unit(processTotal)}
          visual={<SegBar segs={stageSegs} label="Process cost by stage" legend={false} />}
        >
          <div className="px-4 py-3">
            <SegBar segs={stageSegs} label="Process cost by stage" thick />
          </div>
          <ol className="divide-y border-t">
            {b.process.steps.map((s) => {
              const v = s.perBoard + s.perLot / b.refQty;
              return (
                <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 px-4 py-2">
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2 text-sm">
                      <span className="truncate">{s.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{STAGE_LABEL[s.stage]}</span>
                    </span>
                    {s.note ? <span className="block truncate text-xs text-muted-foreground">{s.note}</span> : null}
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(v / maxStep) * 100}%` }} />
                    </span>
                  </span>
                  <span className="num text-right text-sm">{v > 0 ? m.unit(v) : "—"}</span>
                </li>
              );
            })}
          </ol>
        </Fold>

        <Fold id="breakdown" icon={Table2} title="Cost per board, line by line" note={b.quotes.map((q) => qtyLabel(q.qty)).join(" · ")} figure={refQuote ? m.unit(refQuote.unitPrice) : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-normal">Element</th>
                {b.quotes.map((q) => (
                  <th key={q.qty} className="px-4 py-2 text-right font-normal">{qtyLabel(q.qty)}</th>
                ))}
              </tr>
            </thead>
            {GROUP_ORDER.map((g) => {
              const keys = [...new Set(b.quotes.flatMap((q) => q.rows.filter((r) => r.group === g).map((r) => r.key)))];
              if (!keys.length) return null;
              return (
                <tbody key={g} className="divide-y border-t">
                  <tr className="bg-muted/30">
                    <th scope="rowgroup" className="px-4 py-1.5 text-left text-xs font-medium">
                      <span className="mr-2 inline-block size-2.5 rounded-[3px] align-middle" style={{ background: `var(--cost-${GROUP_ORDER.indexOf(g) + 1})` }} aria-hidden />
                      {GROUP_LABEL[g]}
                    </th>
                    {b.quotes.map((q) => (
                      <td key={q.qty} className="num px-4 py-1.5 text-right text-xs font-medium">{m.unit(q.byGroup[g])}</td>
                    ))}
                  </tr>
                  {keys.length > 1 || keys[0] !== g
                    ? keys.map((k) => (
                        <tr key={k}>
                          <td className="px-4 py-1.5 pl-9 text-xs text-muted-foreground">{b.quotes.flatMap((q) => q.rows).find((r) => r.key === k)?.label}</td>
                          {b.quotes.map((q) => (
                            <td key={q.qty} className="num px-4 py-1.5 text-right text-xs">{m.unit(q.rows.find((r) => r.key === k)?.perBoard ?? 0)}</td>
                          ))}
                        </tr>
                      ))
                    : null}
                </tbody>
              );
            })}
            <tbody className="border-t-2">
              <Row label="Price per board, ex-GST" quotes={b.quotes} pick={(q) => m.unit(q.unitPrice)} strong />
              <Row label={`Lot price (× quantity)`} quotes={b.quotes} pick={(q) => m.whole(q.lotPrice)} />
              <Row label="One-off costs (NRE)" quotes={b.quotes} pick={(q) => m.whole(q.nreTotal)} />
              <Row label={`GST ${b.rates.gstPct} %`} quotes={b.quotes} pick={(q) => m.whole(q.gst)} />
              <Row label="Total to the client" quotes={b.quotes} pick={(q) => m.whole(q.total)} strong />
            </tbody>
          </table>
        </div>
        {ref?.nre.length ? (
          <div className="border-t px-4 py-3">
            <h3 className="text-xs text-muted-foreground">One-off costs</h3>
            <ul className="mt-1.5 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {ref.nre.map((n) => (
                <li key={n.key} className="flex justify-between gap-3">
                  <span>{n.label}</span>
                  <span className="num">{m.whole(n.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        </Fold>

        <Fold icon={SlidersHorizontal} title="Rates for this quote" note="Line rate, labour, test, margin, NRE (plant defaults in src/data/costing.ts)">
          <div className="px-4 py-4">
            <RatesForm revisionId={id} rates={b.rates} disabled={!edit} />
          </div>
        </Fold>
      </div>

      <section aria-labelledby="issued" className="mt-6 rounded-lg border bg-card">
        <h2 id="issued" className="border-b px-4 py-3 text-base font-medium">Issued quotes</h2>
        {issued.length ? (
          <ul className="divide-y text-sm">
            {issued.map((q) => {
              const snap = q.snapshot as { quotes?: QtyQuote[] } | null;
              return (
                <li key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                  <Link href={`/boms/${id}/build/print?q=${q.id}`} className="num font-medium hover:underline">{q.number}</Link>
                  <span className="text-xs text-muted-foreground">{q.issuedAt?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · valid {q.validDays} days · {q.currency}</span>
                  <span className="num ml-auto text-xs">{(snap?.quotes ?? []).map((x) => `${x.qty.toLocaleString("en-IN")}: ${m.unit(x.unitPrice)}`).join(" · ")}</span>
                  <a href={`/boms/${id}/build/export?q=${q.id}`} download className="text-xs text-muted-foreground hover:text-foreground">Excel</a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">None yet. <em>Issue quote</em> freezes the prices above under a quote number.</p>
        )}
      </section>

    </>
  );
}

function Row({ label, quotes, pick, strong }: { label: string; quotes: QtyQuote[]; pick: (q: QtyQuote) => string; strong?: boolean }) {
  return (
    <tr className={strong ? "font-medium" : undefined}>
      <td className="px-4 py-2">{label}</td>
      {quotes.map((q) => (
        <td key={q.qty} className="num px-4 py-2 text-right">{pick(q)}</td>
      ))}
    </tr>
  );
}
