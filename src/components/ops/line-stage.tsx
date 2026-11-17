"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Check, ExternalLink, Pencil, X } from "lucide-react";
import type { MachineCard } from "@/lib/ops/machine-card";
import type { PackageReach } from "@/lib/ops/package-reach";
import { MachineDialog, MachineOrderButtons } from "@/components/ops/line-editor";
import { cn } from "@/lib/utils";

const Line3D = dynamic(() => import("./line-3d"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">Drawing the line…</div> });

/** A small footprint drawing for a package family, so the grid reads without its labels. */
function PkgGlyph({ id }: { id: string }) {
  const r = (x: number, y: number, w: number, h: number, key?: string) => <rect key={key ?? `${x}-${y}`} x={x} y={y} width={w} height={h} rx={0.6} />;
  let body: React.ReactNode;
  if (/^0\d|^01005/.test(id)) {
    const s = id === "01005" ? 2 : id === "0201" ? 3 : id === "0402" ? 4 : id === "0603" ? 5.5 : 7;
    body = [r(20 - s - 1, 14 - s, s, s * 2, "a"), r(21, 14 - s, s, s * 2, "b")];
  } else if (id.startsWith("sot")) body = [r(12, 6, 4, 6, "a"), r(24, 6, 4, 6, "b"), r(18, 17, 4, 6, "c")];
  else if (id === "soic" || id.startsWith("tssop")) {
    const n = id === "soic" ? 4 : 6;
    body = Array.from({ length: n }, (_, i) => [r(8 + (i * 24) / n, 4, 16 / n, 6, `t${i}`), r(8 + (i * 24) / n, 18, 16 / n, 6, `b${i}`)]);
  } else if (id.startsWith("qfp")) body = [r(11, 2, 18, 3, "t"), r(11, 23, 18, 3, "b"), r(5, 7, 3, 14, "l"), r(32, 7, 3, 14, "r")];
  else if (id.startsWith("qfn")) body = [r(11, 5, 18, 18, "p")];
  else if (id.startsWith("bga") || id.startsWith("csp")) {
    const n = id === "bga-large" ? 5 : id.startsWith("csp") ? 3 : 4;
    body = Array.from({ length: n * n }, (_, i) => <circle key={i} cx={20 - ((n - 1) * 5) / 2 + (i % n) * 5} cy={14 - ((n - 1) * 5) / 2 + Math.floor(i / n) * 5} r={1.6} />);
  } else if (id === "tall") body = [<ellipse key="e" cx={20} cy={14} rx={9} ry={9} />];
  else body = [r(3, 9, 34, 10, "o")];
  return (
    <svg viewBox="0 0 40 28" className="mx-auto h-7 w-10 fill-current" aria-hidden>
      {body}
    </svg>
  );
}

const REACH_CLS: Record<PackageReach["reach"], string> = {
  yes: "bg-risk-green text-white dark:text-background",
  check: "bg-risk-amber-soft text-risk-amber ring-1 ring-inset ring-risk-amber/40",
  no: "bg-muted text-muted-foreground/60",
};

const short = (label: string) => label.replace(/ \(.*\)$/, "").replace("CSP/WLCSP", "CSP").replace("Electrolytic / tall", "Tall").replace("Large connector / odd-form", "Odd-form");

/** Where a figure comes from, as a mark: filled = our machine sheet, hollow = the maker's data, to verify. */
function Src({ source }: { source: string }) {
  const ours = source !== "maker";
  return <span title={ours ? "From our machine sheet" : "Maker data — verify"} aria-label={ours ? "from our machine sheet" : "maker data, to verify"} className={cn("inline-block size-2 shrink-0 rounded-full", ours ? "bg-foreground" : "ring-[1.5px] ring-foreground/60 ring-inset")} />;
}

/**
 * One line as a picture: its machines in 3D in flow order, and beside it everything we know about the machine
 * you click — what it can place, its key figures, what it is good and bad at.
 */
export function LineStage({ machines, editable }: { machines: MachineCard[]; editable: boolean }) {
  const first = machines.find((m) => m.type === "PICK_AND_PLACE") ?? machines[0];
  const [sel, setSel] = useState<string | null>(first?.id ?? null);
  const m = machines.find((x) => x.id === sel) ?? first;
  if (!m) return null;
  const idx = machines.findIndex((x) => x.id === m.id);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0">
        <div className="h-[340px] overflow-hidden rounded-3xl bg-card sm:h-[420px]">
          <Line3D machines={machines.map((x) => ({ id: x.id, type: x.type, short: x.short, color: x.color, position: x.position }))} selected={m.id} onSelect={setSel} />
        </div>
        <ol className="mt-3 flex flex-wrap gap-2" aria-label="Machines in flow order">
          {machines.map((x) => {
            const on = x.id === m.id;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => setSel(x.id)}
                  aria-pressed={on}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full py-1 pr-3.5 pl-1 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "bg-foreground font-semibold text-background" : "bg-card hover:bg-muted",
                  )}
                >
                  <span className="grid size-8 place-items-center rounded-full text-xs font-bold text-white" style={{ background: x.color }}>
                    {x.position}
                  </span>
                  {x.short}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <aside key={m.id} aria-live="polite" className="machine-sheet rounded-3xl bg-card p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: m.color }}>
            {m.position}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-2xl leading-tight font-semibold tracking-tight">
              {m.vendor} {m.model}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {m.kind}
              {m.launched ? <span title={m.launched.note}> · since {m.launched.value}</span> : null}
              {m.year ? ` · ours from ${m.year}` : ""}
            </p>
          </div>
        </div>
        {m.oneLiner ? <p className="mt-4 text-[15px] leading-snug">{m.oneLiner}</p> : null}

        {m.big.length ? (
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
            {m.big.map((f) => (
              <div key={f.label}>
                <dd className="font-display text-3xl leading-none font-semibold tracking-tight" title={f.note}>
                  {f.value}
                </dd>
                <dt className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Src source={f.source} />
                  {f.label}
                </dt>
              </div>
            ))}
          </dl>
        ) : null}

        {m.reach ? (
          <section className="mt-6">
            <h4 className="text-sm font-semibold">What it can place</h4>
            <ul className="mt-2.5 grid grid-cols-4 gap-1.5">
              {m.reach.map((p) => (
                <li key={p.id} title={`${p.label}: ${p.reason}`} className={cn("rounded-xl px-1 pt-2 pb-1.5 text-center", REACH_CLS[p.reach])}>
                  <PkgGlyph id={p.id} />
                  <span className="mt-1 block truncate text-[11px] leading-tight font-medium">{short(p.label)}</span>
                  <span className="sr-only">{p.reach === "yes" ? "can place" : p.reach === "no" ? "cannot place" : "check first"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-risk-green" /> yes</span>
              <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-risk-amber-soft ring-1 ring-risk-amber/50 ring-inset" /> check first</span>
              <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-muted ring-1 ring-border ring-inset" /> no</span>
            </p>
          </section>
        ) : null}

        {m.strengths.length || m.limits.length ? (
          <ul className="mt-6 space-y-1.5 text-sm">
            {m.strengths.map((s) => (
              <li key={s} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-risk-green" aria-label="Good at" />
                {s}
              </li>
            ))}
            {m.limits.map((s) => (
              <li key={s} className="flex gap-2">
                <X className="mt-0.5 size-4 shrink-0 text-risk-red" aria-label="Watch out" />
                {s}
              </li>
            ))}
          </ul>
        ) : null}

        {m.facts.length ? (
          <details className="group mt-6 border-t pt-4">
            <summary className="flex list-none items-center justify-between text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              All figures <span className="text-xs font-normal text-muted-foreground group-open:hidden">{m.facts.length} more</span>
            </summary>
            <dl className="mt-3 space-y-2 text-sm">
              {m.facts.map((f) => (
                <div key={f.label} className="flex items-baseline gap-2">
                  <Src source={f.source} />
                  <dt className="w-36 shrink-0 text-muted-foreground">{f.label}</dt>
                  <dd className="min-w-0 font-medium" title={f.note}>{f.value}</dd>
                </div>
              ))}
            </dl>
            {m.links.length ? (
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {m.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-border hover:decoration-foreground">
                    {l.label} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ))}
              </p>
            ) : null}
          </details>
        ) : null}

        {!m.oneLiner && !m.big.length ? <p className="mt-5 text-sm text-muted-foreground">Nothing on file for this one yet.</p> : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Src source="sheet" /> our sheet</span>
          <span className="inline-flex items-center gap-1.5"><Src source="maker" /> maker data, verify</span>
          <span className="ml-auto flex items-center gap-1">
            {editable ? <MachineOrderButtons id={m.id} first={idx === 0} last={idx === machines.length - 1} label={`${m.vendor} ${m.model}`} /> : null}
            <MachineDialog
              machine={{ id: m.id, type: m.type, vendor: m.vendor, model: m.model, year: m.year, specs: m.specs, source: m.source }}
              editable={editable}
              trigger={
                <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-muted px-3.5 text-sm font-medium text-foreground outline-none hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">
                  <Pencil className="size-3.5" aria-hidden /> {editable ? "Edit limits" : "Limits"}
                </button>
              }
            />
          </span>
        </div>
      </aside>
    </div>
  );
}
