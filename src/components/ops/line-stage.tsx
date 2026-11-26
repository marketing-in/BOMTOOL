"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, ChevronDown, ExternalLink, Eye, EyeOff, Footprints, Pencil, Play, X } from "lucide-react";
import type { MachineCard } from "@/lib/ops/machine-card";
import type { PackageReach } from "@/lib/ops/package-reach";
import { MachineDialog, MachineOrderButtons } from "@/components/ops/line-editor";
import type { ViewMode } from "./line-3d";
import { findLook } from "@/knowledge/machine-looks";
import { processOf } from "@/knowledge/machine-process";
import { cn } from "@/lib/utils";
import { FullViewButton, useFullView } from "@/components/ui/full-view";

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
  yes: "bg-risk-green-soft text-risk-green",
  check: "bg-risk-amber-soft text-risk-amber ring-1 ring-inset ring-risk-amber/40",
  no: "border border-dashed text-muted-foreground/50",
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
export function LineStage({ machines, editable, running = false }: { machines: MachineCard[]; editable: boolean; running?: boolean }) {
  const [mode, setMode] = useState<ViewMode>("3d");
  const scene = useMemo(() => machines.map((x) => ({ id: x.id, type: x.type, vendor: x.vendor, short: x.short, model: x.model, color: x.color, position: x.position })), [machines]);
  const first = machines.find((m) => m.type === "PICK_AND_PLACE") ?? machines[0];
  const [sel, setSel] = useState<string | null>(first?.id ?? null);
  const [step, setStep] = useState(0);
  const [near, setNear] = useState<string | null>(null);
  const [inside, setInside] = useState(true);
  const fv = useFullView();
  const m = machines.find((x) => x.id === sel) ?? first;
  const process = useMemo(() => (m ? processOf(m.type, m.model) : null), [m]);
  const shares = useMemo(() => process?.steps.map((x) => x.share), [process]);
  if (!m || !process) return null;
  const idx = machines.findIndex((x) => x.id === m.id);
  const look = findLook(m.type, m.vendor, m.model);
  const at = machines.find((x) => x.id === near) ?? m;
  const VIEWS: { v: ViewMode; label: string; title: string }[] = [
    { v: "3d", label: "3D", title: "Turn the line in 3D" },
    { v: "2d", label: "2D", title: "Floor plan from above" },
    { v: "walk", label: "Walk", title: "Walk along the running line" },
  ];
  const go = (v: ViewMode) => {
    setStep(0);
    setNear(null);
    setMode(v);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0">
        <div ref={fv.ref} className={cn("relative overflow-hidden rounded-xl border bg-muted/60", mode === "walk" || mode === "machine" ? "h-[420px] sm:h-[540px]" : "h-[340px] sm:h-[440px]", fv.cls)}>
          <Line3D machines={scene} selected={m.id} onSelect={setSel} mode={mode} running={running} shares={shares} onStep={setStep} onNear={setNear} inside={inside} />
          <FullViewButton full={fv.full} toggle={fv.toggle} className="absolute top-3 right-3" />
          <div role="group" aria-label="View" className="absolute top-3 right-[3.75rem] inline-flex rounded-md border bg-card p-0.5 text-xs">
            {VIEWS.map(({ v, label, title }) => (
              <button
                key={v}
                type="button"
                onClick={() => go(v)}
                aria-pressed={mode === v}
                title={title}
                className={cn("inline-flex h-9 items-center gap-1.5 rounded px-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              >
                {v === "walk" ? <Footprints className="size-3.5" aria-hidden /> : null}
                {label}
              </button>
            ))}
          </div>

          {mode === "machine" ? (
            <>
              <button type="button" onClick={() => go("3d")} className="absolute top-3 left-3 inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-4" aria-hidden /> Whole line
              </button>
              <button
                type="button"
                onClick={() => setInside((v) => !v)}
                aria-pressed={inside}
                title={inside ? "Show the machine with its covers on" : "Fade the covers to see the process inside"}
                className={cn("absolute top-14 left-3 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", inside ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted")}
              >
                {inside ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />} See inside
              </button>
              <div className="absolute right-3 bottom-3 left-3 rounded-lg border bg-card/95 p-3 sm:left-auto sm:w-80" aria-live="polite">
                <p className="text-xs font-medium text-muted-foreground">
                  {m.position} · {m.vendor} {m.model}
                </p>
                <ol className="mt-2 space-y-1">
                  {process.steps.map((x, i) => (
                    <li key={x.title} className={cn("flex items-start gap-2 rounded-md px-2 py-1 text-sm", i === step ? "bg-foreground text-background" : "text-muted-foreground")}>
                      <span className="w-4 shrink-0 text-xs leading-5 font-semibold tabular-nums">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="font-semibold">{x.title}</span>
                        {i === step ? <span className="mt-0.5 block text-[13px] leading-snug opacity-90">{x.text}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : null}

          {mode === "walk" ? (
            <>
              <p className="pointer-events-none absolute top-3 left-3 rounded-md border bg-card/90 px-2.5 py-1.5 text-xs text-muted-foreground">Drag to look round · arrow keys, W A S D or the pad to walk · click a machine</p>
              <div className="absolute right-3 bottom-3 left-40 rounded-lg border bg-card/95 p-3 sm:left-auto sm:w-96" aria-live="polite">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="grid size-6 shrink-0 place-items-center rounded text-[11px] font-semibold text-white" style={{ background: at.color }}>
                    {at.position}
                  </span>
                  <span className="min-w-0 truncate">
                    {at.vendor} {at.model}
                  </span>
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{processOf(at.type, at.model).short}</p>
                <button type="button" onClick={() => { setSel(at.id); go("machine"); }} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                  <Play className="size-3.5" aria-hidden /> Show its process
                </button>
              </div>
            </>
          ) : null}
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
                    "flex h-9 items-center gap-2 rounded-md border py-1 pr-3 pl-1.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-foreground bg-foreground font-semibold text-background" : "bg-card hover:bg-muted",
                  )}
                >
                  <span className="grid size-6 place-items-center rounded text-[11px] font-semibold text-white" style={{ background: x.color }}>
                    {x.position}
                  </span>
                  {x.short}
                </button>
              </li>
            );
          })}
        </ol>

        <section className="mt-6" aria-labelledby="line-flow">
          <h3 id="line-flow" className="text-sm font-semibold">
            What happens on this line
          </h3>
          <ol className="mt-2 divide-y rounded-lg border bg-card">
            {machines.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => setSel(x.id)} className={cn("flex w-full items-start gap-3 px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", x.id === m.id && "bg-muted")}>
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-[10px] font-semibold text-white" style={{ background: x.color }}>
                    {x.position}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">{x.short}</span>
                    <span className="text-muted-foreground"> — {processOf(x.type, x.model).short}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside key={m.id} aria-live="polite" className="rounded-xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded text-xs font-semibold text-white" style={{ background: m.color }}>
            {m.position}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl leading-tight font-semibold tracking-tight">
              {m.vendor} {m.model}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {m.kind}
              {m.launched ? <span title={m.launched.note}> · since {m.launched.value}</span> : null}
              {m.year ? ` · ours from ${m.year}` : ""}
            </p>
          </div>
        </div>
        {m.oneLiner ? <p className="mt-4 text-sm leading-snug text-muted-foreground">{m.oneLiner}</p> : null}

        <section className="mt-4">
          {!m.oneLiner ? <p className="text-sm leading-snug text-muted-foreground">{process.what}</p> : null}
          <button
            type="button"
            onClick={() => go("machine")}
            aria-pressed={mode === "machine"}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-semibold text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Play className="size-4" aria-hidden /> Show this machine&apos;s process in 3D
          </button>
          {/* The walkthrough is there for whoever wants it; the panel leads with the machine, its action and its figures. */}
          <details className="group mt-3 rounded-lg border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              How it works
              <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-3 border-t px-3 py-3">
              {m.oneLiner ? <p className="text-sm leading-snug text-muted-foreground">{process.what}</p> : null}
              <ol className="space-y-1.5 text-sm">
                {process.steps.map((x, i) => (
                  <li key={x.title} className="flex gap-2.5">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold tabular-nums">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="font-medium">{x.title}.</span> <span className="text-muted-foreground">{x.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {look ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">How to recognise it:</span> {look.features.slice(0, 4).join(" · ")}.
                </p>
              ) : null}
            </div>
          </details>
        </section>

        {m.big.length ? (
          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
            {m.big.map((f) => (
              <div key={f.label} className="bg-card p-3.5">
                <dd className="text-2xl leading-none font-semibold tracking-tight tabular-nums" title={f.note}>
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
                <li key={p.id} title={`${p.label}: ${p.reason}`} className={cn("rounded-md px-1 pt-2 pb-1.5 text-center", REACH_CLS[p.reach])}>
                  <PkgGlyph id={p.id} />
                  <span className="mt-1 block truncate text-[11px] leading-tight font-medium">{short(p.label)}</span>
                  <span className="sr-only">{p.reach === "yes" ? "can place" : p.reach === "no" ? "cannot place" : "check first"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-risk-green-soft ring-1 ring-risk-green/40 ring-inset" /> yes</span>
              <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-risk-amber-soft ring-1 ring-risk-amber/50 ring-inset" /> check first</span>
              <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm border border-dashed" /> no</span>
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
                <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium text-foreground outline-none hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">
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
