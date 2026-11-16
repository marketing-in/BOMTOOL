import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, CircleAlert, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDisplayCurrency } from "@/lib/prefs";
import { getReverse } from "@/server/reverse";
import type { Block } from "@/lib/reverse";
import { moneyIn } from "@/components/build/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reverse engineering" };

const COLUMNS: { key: Block["column"]; title: string; hint: string }[] = [
  { key: "in", title: "Comes in", hint: "Power, signals and measurements" },
  { key: "core", title: "The core", hint: "Supply rails, processor, memory, clock" },
  { key: "out", title: "Goes out", hint: "Radio, cables, loads, the user" },
];
const LEVEL = {
  green: { icon: Check, text: "text-risk-green" },
  amber: { icon: TriangleAlert, text: "text-risk-amber" },
  red: { icon: CircleAlert, text: "text-risk-red" },
} as const;
const CONFIDENCE = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" } as const;

const refs = (r: string[], max = 6) => (r.length <= max ? r.join(", ") : `${r.slice(0, max).join(", ")} +${r.length - max}`);

export default async function ReversePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [data, currency] = await Promise.all([getReverse(id), getDisplayCurrency()]);
  if (!data) notFound();
  const r = data.report;
  const m = moneyIn(currency);
  const support = r.blocks.filter((b) => b.column === "support");

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl leading-tight font-bold tracking-tight">Reverse engineering — {data.product?.name ?? data.title}</h1>
        <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">
          What this product is and how it works, read from its parts: every component sorted into the job it does, the interfaces and supply rails, the parts that define it, and what is still missing before it could be rebuilt.
        </p>
      </div>

      <section aria-label="What it is" className="rounded-lg border bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Most likely</div>
            <div className="mt-0.5 text-xl font-semibold tracking-tight">{r.identity.title}</div>
            <p className="mt-1 text-sm">{r.identity.summary}</p>
          </div>
          <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs", r.identity.confidence === "high" ? "border-risk-green/50 text-risk-green" : r.identity.confidence === "medium" ? "border-risk-amber/50 text-risk-amber" : "border-risk-red/50 text-risk-red")}>
            {CONFIDENCE[r.identity.confidence]}
          </span>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {r.identity.why.map((w) => (
            <li key={w} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
        {r.counts.guessed ? (
          <Link href={`/boms/${id}/build/parts`} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring">
            Choose the {r.counts.guessed.toLocaleString("en-IN")} parts <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
        {r.features.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {r.features.map((f) => (
              <li key={f.key} className="rounded-md border bg-muted/40 px-2 py-1 text-xs" title={f.refs.join(", ")}>
                {f.label} <span className="num text-muted-foreground">· {refs(f.refs, 3)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-label="Counts" className="mt-4 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Fitted parts" value={r.counts.fitted.toLocaleString("en-IN")} hint={`${r.counts.partNumbers} different part numbers${r.counts.dnp ? ` · ${r.counts.dnp} not populated` : ""}`} />
        <Tile label="Active parts" value={r.counts.active.toLocaleString("en-IN")} hint={`chips, transistors, sensors, modules · ${r.counts.passive} passives`} />
        <Tile label="Functional blocks" value={String(r.blocks.filter((b) => b.column !== "support").length)} hint={`${r.counts.recognised} of ${r.counts.fitted} parts given a job`} />
        <Tile label="Supply parts" value={String(r.rails.length)} hint={r.powerInputs.length ? `fed by: ${r.powerInputs.join(", ")}` : "input not identified"} />
      </section>

      <section aria-labelledby="blocks" className="mt-6">
        <div className="mb-3">
          <h2 id="blocks" className="text-base font-semibold tracking-tight">Block diagram</h2>
          <p className="text-sm text-muted-foreground">Signals run left to right. Built from the kinds of part on the board — not traced from the copper.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {COLUMNS.map((c, ci) => (
            <div key={c.key} className="relative rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{c.title}</h3>
                <span className="text-xs text-muted-foreground">{c.hint}</span>
              </div>
              <div className="space-y-2">
                {r.blocks.filter((b) => b.column === c.key).map((b) => (
                  <BlockCard key={b.key} b={b} unit={m.unit} />
                ))}
                {!r.blocks.some((b) => b.column === c.key) ? <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Nothing here on this board</p> : null}
              </div>
              {ci < COLUMNS.length - 1 ? <ArrowRight className="absolute top-1/2 -right-[1.05rem] z-10 hidden size-5 -translate-y-1/2 rounded-full border bg-card p-0.5 text-muted-foreground lg:block" aria-hidden /> : null}
            </div>
          ))}
        </div>
        {support.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {support.map((b) => (
              <div key={b.key} className="rounded-lg border bg-card px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{b.label}</span>
                  <span className="num text-xs text-muted-foreground">{b.parts} parts</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{b.does}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="mt-6 grid gap-6 2xl:grid-cols-2">
        <section aria-labelledby="key" className="rounded-lg border bg-card">
          <h2 id="key" className="border-b px-4 py-3 text-base font-medium">The parts that define the product</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-normal">Part</th>
                  <th className="px-4 py-2 font-normal">Job</th>
                  <th className="px-4 py-2 text-right font-normal">Pins</th>
                  <th className="px-4 py-2 text-right font-normal">Each</th>
                  <th className="px-4 py-2 font-normal">Plan B</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {r.keyParts.map((p) => (
                  <tr key={p.mpn}>
                    <td className="px-4 py-2">
                      <span className="num font-medium">{p.mpn}</span>
                      <span className="block text-xs text-muted-foreground">{p.manufacturer ?? "Maker not known"} · {refs(p.refs, 4)}</span>
                    </td>
                    <td className="px-4 py-2">
                      {p.block}
                      <span className="block max-w-[34ch] truncate text-xs text-muted-foreground" title={p.what}>{p.what}</span>
                    </td>
                    <td className="num px-4 py-2 text-right">{p.pins}</td>
                    <td className="num px-4 py-2 text-right">{m.unit(p.unit)}</td>
                    <td className="px-4 py-2 text-xs">
                      {p.alternates ? <span className="text-risk-green">{p.alternates} alternate{p.alternates === 1 ? "" : "s"}</span> : <span className="text-risk-amber">None on file</span>}
                      {p.lifecycle && p.lifecycle !== "ACTIVE" ? <span className="block text-risk-amber">{p.lifecycle.length <= 4 ? p.lifecycle : p.lifecycle.replace(/_/g, " ").toLowerCase()}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!r.keyParts.length ? <p className="px-4 py-3 text-sm text-muted-foreground">No active part has a part number yet.</p> : null}
        </section>

        <section aria-labelledby="power" className="rounded-lg border bg-card">
          <h2 id="power" className="border-b px-4 py-3 text-base font-medium">Power — from the input to the rails</h2>
          <div className="px-4 py-3 text-sm">
            <span className="text-muted-foreground">Input: </span>
            {r.powerInputs.length ? r.powerInputs.join(" · ") : "not identified from the connectors"}
          </div>
          {r.rails.length ? (
            <ul className="divide-y border-t">
              {r.rails.map((x) => (
                <li key={x.ref} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm">
                  <span>
                    <span className="num font-medium">{x.ref}</span> {x.type}
                    <span className="num block text-xs text-muted-foreground">{x.mpn ?? "No part number"}</span>
                  </span>
                  <span className="num text-sm">{x.volts.length ? x.volts.map((v) => `${v} V`).join(" · ") : <span className="text-muted-foreground">voltage not stated</span>}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t px-4 py-3 text-sm text-muted-foreground">No regulator or converter found: the board runs straight from its input.</p>
          )}
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">Voltages are the ones named in each part&apos;s description — its ratings and outputs — not measured rails.</p>
        </section>

        <section aria-labelledby="rebuild" className="rounded-lg border bg-card">
          <h2 id="rebuild" className="border-b px-4 py-3 text-base font-medium">What it takes to rebuild it</h2>
          <ul className="divide-y">
            {r.findings.map((f) => {
              const L = LEVEL[f.level];
              return (
                <li key={f.key} className="grid grid-cols-[1.1rem_minmax(0,1fr)] gap-x-2.5 px-4 py-2.5 text-sm">
                  <L.icon className={cn("mt-0.5 size-4", L.text)} aria-hidden />
                  <span>
                    <span className="font-medium">{f.title}</span>
                    <span className="block text-muted-foreground">{f.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="made" className="rounded-lg border bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
            <h2 id="made" className="text-base font-medium">How it is made</h2>
            <Link href={`/boms/${id}/feasibility`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Can we build it? <ArrowRight className="size-3" aria-hidden />
            </Link>
          </div>
          <p className="px-4 py-3 text-sm">{r.build.summary}</p>
          <ol className="grid gap-x-4 gap-y-1 border-t px-4 py-3 text-sm sm:grid-cols-2">
            {r.build.steps.map((s, i) => (
              <li key={`${i}-${s}`} className="flex gap-2">
                <span className="num w-5 shrink-0 text-right text-xs leading-5 text-muted-foreground">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-1 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function BlockCard({ b, unit }: { b: Block; unit: (v: number | null | undefined) => string }) {
  return (
    <details className="group rounded-md border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{b.label}</span>
          <span className="block truncate text-xs text-muted-foreground">{b.items.slice(0, 2).map((i) => i.mpn ?? i.what).join(" · ")}</span>
        </span>
        <span className="num shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">{b.parts}</span>
      </summary>
      <div className="border-t px-3 py-2">
        <p className="text-xs text-muted-foreground">{b.does}</p>
        <ul className="mt-2 space-y-1.5">
          {b.items.slice(0, 8).map((i) => (
            <li key={i.refs[0]} className="text-xs">
              <span className="num font-medium">{refs(i.refs, 5)}</span>
              {i.mpn ? <span className="num"> · {i.mpn}</span> : null}
              {i.unit !== null ? <span className="num text-muted-foreground"> · {unit(i.unit)}</span> : null}
              <span className="block text-muted-foreground">{i.what}</span>
            </li>
          ))}
        </ul>
        {b.items.length > 8 ? <p className="mt-1.5 text-xs text-muted-foreground">and {b.items.length - 8} more part numbers.</p> : null}
      </div>
    </details>
  );
}
