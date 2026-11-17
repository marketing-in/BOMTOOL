import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, ChevronDown, ShieldHalf } from "lucide-react";
import { getDisplayCurrency } from "@/lib/prefs";
import { getViewerData } from "@/server/board-view";
import { processCheckFor } from "@/server/lines";
import type { Level } from "@/lib/ops/machines";
import { STAGE_LABEL, refList, type RouteStage } from "@/lib/ops/route";
import { PageHeader } from "@/components/data/page-header";
import { Figures } from "@/components/bom/figures";
import { ProcessFlow, type FlowNode } from "@/components/viz/process-flow";
import { stepIcon } from "@/components/viz/step-icon";
import { cn } from "@/lib/utils";


const NODE: Record<Level, string> = {
  green: "border-risk-green/50 bg-risk-green-soft text-risk-green",
  amber: "border-risk-amber bg-risk-amber-soft text-risk-amber",
  red: "border-risk-red bg-risk-red-soft text-risk-red",
};

/**
 * Step 5, section 2 — the process route (Phase 25: picture first): the route as a chain of icons, then one slim row per step that
 * opens to why this product needs it, its parts, its checks and its links. Steps with a watch-out are open already.
 */
export default async function RouteSection({ id }: { id: string }) {
  const [data, pc] = await Promise.all([getViewerData(id, await getDisplayCurrency()), processCheckFor(id).catch(() => null)]);
  if (!data) notFound();
  const steps = data.route;
  const checked = new Map((pc?.check.steps ?? []).map((s) => [s.key, s]));
  const lines = [...new Set(steps.map((s) => s.where?.line).filter((x): x is string => !!x))];
  const smtPasses = new Set(steps.filter((s) => s.stage === "smt").map((s) => s.side)).size;
  const watch = steps.filter((s) => s.watch);
  const stages = [...new Set(steps.map((s) => s.stage))] as RouteStage[];
  const number = new Map(steps.map((s, i) => [s.key, i + 1]));
  const levelOf = (key: string, hasWatch: boolean): Level => {
    const c = checked.get(key)?.level ?? "green";
    return c === "green" && hasWatch ? "amber" : c;
  };
  const nodes: FlowNode[] = steps.map((s) => {
    const c = checked.get(s.key);
    return {
      key: s.key,
      title: s.title,
      stage: s.stage,
      level: levelOf(s.key, !!s.watch),
      how: c?.how ?? (s.where ? "machine" : s.stage === "fab" ? "bought-in" : "bench"),
      where: c?.machines.length ? c.machines : s.where ? [`${s.where.line} · ${s.where.equipment ?? s.where.lineName}`] : [],
      note: s.watch ?? c?.note ?? null,
      masking: s.masking ?? null,
      href: `#${s.key}`,
    };
  });

  return (
    <>
      <PageHeader level={2} title={`Process route${data.product ? ` — ${data.product.name}` : ""}`} />

      <Figures
        className="mb-6"
        items={[
          { label: "Steps", value: steps.length },
          {
            label: "Lines, in order",
            value: lines.length ? (
              <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                {lines.map((l, i) => (
                  <span key={l} className="inline-flex items-center gap-1">
                    {i ? <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden /> : null}
                    <span className="rounded-md bg-primary px-1.5 py-1 text-sm leading-none font-semibold tracking-normal text-primary-foreground">{l}</span>
                  </span>
                ))}
              </span>
            ) : (
              "—"
            ),
          },
          { label: "SMT passes", value: smtPasses || "none", unit: smtPasses === 2 ? "both sides" : smtPasses === 1 ? "one side" : undefined },
          { label: "Watch-outs", value: watch.length, tone: watch.length ? "amber" : "green" },
        ]}
      />

      <div className="mb-8 rounded-xl border bg-card p-5">
        <ProcessFlow nodes={nodes} />
      </div>

      <div className="space-y-6">
        {stages.map((stage) => (
          <section key={stage} aria-labelledby={`stage-${stage}`}>
            <h3 id={`stage-${stage}`} className="mb-2 text-sm font-semibold text-muted-foreground">{STAGE_LABEL[stage]}</h3>
            <ol className="space-y-1.5">
              {steps
                .filter((s) => s.stage === stage)
                .map((s) => {
                  const Icon = stepIcon(s.key);
                  return (
                    <li key={s.key} id={s.key} className="scroll-mt-24 rounded-xl target:ring-2 target:ring-primary/50">
                      <details open={!!s.watch} className="group rounded-xl border bg-card">
                        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2 outline-none select-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                          <span className="num grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-medium">{number.get(s.key)}</span>
                          <span className={cn("grid size-9 shrink-0 place-items-center rounded-md border-2", NODE[levelOf(s.key, !!s.watch)])}>
                            <Icon className="size-[18px]" aria-hidden />
                          </span>
                          <h4 className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</h4>
                          {s.masking?.needed ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-risk-amber/40 bg-risk-amber-soft px-2 py-0.5 text-[11px] font-medium">
                              <ShieldHalf className="size-3 text-risk-amber" aria-hidden /> Masking
                            </span>
                          ) : null}
                          {s.where ? (
                            <span className="hidden max-w-[45%] shrink-0 truncate text-xs text-muted-foreground sm:block">
                              <span className="num font-medium text-foreground">{s.where.line}</span> · {s.where.equipment ?? s.where.lineName}
                            </span>
                          ) : null}
                          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
                        </summary>
                        <div className="space-y-2 border-t px-4 py-3 sm:pl-[5.5rem]">
                          <p className="max-w-prose text-sm">{s.why}</p>
                          {s.watch ? (
                            <p className="flex max-w-prose items-start gap-1.5 text-sm text-risk-amber">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {s.watch}
                            </p>
                          ) : null}
                          {s.masking ? (
                            <p className="flex max-w-prose items-start gap-1.5 text-xs text-muted-foreground">
                              <ShieldHalf className={cn("mt-0.5 size-3.5 shrink-0", s.masking.needed ? "text-risk-amber" : "text-risk-green")} aria-hidden />
                              <span><span className="font-medium text-foreground">{s.masking.needed ? "Masking" : "No masking"}</span> — {s.masking.what}</span>
                            </p>
                          ) : null}
                          {s.refs.length ? (
                            <p className="num text-xs text-muted-foreground" title={s.refs.join(", ")}>
                              {s.refs.length} part{s.refs.length === 1 ? "" : "s"}: {refList(s.refs, 16)}
                            </p>
                          ) : null}
                          {s.checks.length ? <p className="text-xs text-muted-foreground">Checks: {s.checks.join(" · ")}</p> : null}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                            {s.refs.length ? (
                              <Link href={`/boms/${id}/viewer?step=${s.key}`} className="font-medium hover:underline">Show in 3D →</Link>
                            ) : null}
                            {s.machine ? (
                              <Link href={`/knowledge/dictionary/${s.machine}`} className="text-muted-foreground hover:text-foreground">{s.machineName ?? "The machine"} →</Link>
                            ) : null}
                            {s.article ? (
                              <Link href={`/knowledge/${s.article}`} className="text-muted-foreground hover:text-foreground">{s.articleTitle ?? "How it works"} →</Link>
                            ) : null}
                          </div>
                        </div>
                      </details>
                    </li>
                  );
                })}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
