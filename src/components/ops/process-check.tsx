import { ArrowDownUp, Check, CircleAlert, Hand, ListChecks, Package, ShieldHalf, TriangleAlert, Wrench } from "lucide-react";
import type { Level } from "@/lib/ops/machines";
import type { ProcessCheck, ProcessStep } from "@/lib/ops/process-check";
import { STAGE_LABEL } from "@/lib/ops/route";
import { cn } from "@/lib/utils";
import { Fold } from "@/components/viz/fold";
import { Info } from "@/components/viz/info";
import { ProcessFlow, type FlowNode } from "@/components/viz/process-flow";
import { AiReview } from "./ai-review";

const TONE: Record<Level, { box: string; text: string }> = {
  green: { box: "border-risk-green/30 bg-risk-green-soft", text: "text-risk-green" },
  amber: { box: "border-risk-amber/40 bg-risk-amber-soft", text: "text-risk-amber" },
  red: { box: "border-risk-red/30 bg-risk-red-soft", text: "text-risk-red" },
};

function LevelIcon({ level, className }: { level: Level; className?: string }) {
  const Icon = level === "green" ? Check : level === "amber" ? TriangleAlert : CircleAlert;
  return <Icon className={cn("size-4 shrink-0", TONE[level].text, className)} aria-hidden />;
}

const HOW: Record<ProcessStep["how"], { icon: typeof Wrench; word: string }> = {
  machine: { icon: Wrench, word: "Machine" },
  bench: { icon: Hand, word: "Bench" },
  "bought-in": { icon: Package, word: "Bought in" },
};

function MaskBadge({ step }: { step: ProcessStep }) {
  if (!step.masking) return null;
  return (
    <span
      title={step.masking.what}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        step.masking.needed ? "border-[var(--risk-amber)]/40 bg-risk-amber-soft" : "border-risk-green/30 bg-risk-green-soft",
      )}
    >
      {step.masking.needed ? "Masking" : "No masking"}
    </span>
  );
}

/** A process check's steps as nodes of the process picture. */
export function flowNodes(check: ProcessCheck): FlowNode[] {
  return check.steps.map((s) => ({ key: s.key, title: s.title, stage: s.stage, level: s.level, how: s.how, where: s.machines, note: s.note, masking: s.masking }));
}

/**
 * The whole process on our plant (Phase 23, redrawn in Phase 25): the route from fab to dispatch as a chain of icons —
 * can we do each step, on a machine or by hand, with or without a mask — the order checked, the full list folded
 * underneath, and the AI's review on demand.
 */
export function ProcessCheckPanel({ check, revisionId }: { check: ProcessCheck; revisionId: string }) {
  const stages = [...new Set(check.steps.map((s) => s.stage))];
  const masked = check.steps.filter((s) => s.masking?.needed && /^mask-/.test(s.key)).length;
  const orderLevel: Level = check.order.some((o) => o.level === "red") ? "red" : check.order.length ? "amber" : "green";
  const machines = check.steps.filter((s) => s.how === "machine").length;
  return (
    <section id="process-check" aria-labelledby="process-check-title" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="process-check-title" className="text-base font-semibold tracking-tight">The whole process, step by step</h2>
        <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold", TONE[check.level].box)}>
          <LevelIcon level={check.level} className="size-3.5" /> {check.level === "red" ? "A step cannot be done" : `All ${check.steps.length} steps can be done`}
        </span>
        <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold", masked ? TONE.amber.box : "bg-card")}>
          <ShieldHalf className={cn("size-3.5", masked ? "text-risk-amber" : "text-muted-foreground")} aria-hidden /> {masked ? `${masked} masking step${masked === 1 ? "" : "s"}` : "No masking"}
        </span>
        <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold", orderLevel === "green" ? "bg-card" : TONE[orderLevel].box)}>
          <ArrowDownUp className={cn("size-3.5", orderLevel === "green" ? "text-risk-green" : TONE[orderLevel].text)} aria-hidden /> {check.order.length ? `${check.order.length} order point${check.order.length === 1 ? "" : "s"}` : "Order correct"}
        </span>
        <Info label="About the process check">
          <p>{check.summary}</p>
          <p className="text-xs text-muted-foreground">The order is checked against the rules of the trade: test before coating, masks on before and off after, inspection before packing, packing before dispatch.</p>
        </Info>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <ProcessFlow nodes={flowNodes(check)} />
      </div>

      {check.order.length ? (
        <ul className="space-y-1 rounded-lg border bg-card px-4 py-3 text-sm" aria-label="Order of the steps">
          {check.order.map((o) => (
            <li key={o.text} className="flex items-start gap-2">
              <LevelIcon level={o.level} className="mt-0.5" />
              {o.text}
            </li>
          ))}
        </ul>
      ) : null}

      <Fold icon={ListChecks} title="Every step, with its machine" note={`${machines} on machines · ${check.steps.length - machines} by hand or bought in`} figure={`${check.steps.length} steps`}>
        {stages.map((stage) => (
          <div key={stage}>
            <div className="border-b bg-muted/50 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{STAGE_LABEL[stage]}</div>
            <ol className="divide-y border-b last:border-b-0">
              {check.steps
                .filter((s) => s.stage === stage)
                .map((s) => {
                  const How = HOW[s.how].icon;
                  return (
                    <li key={s.key} className="grid gap-x-4 gap-y-1 px-4 py-2.5 text-sm md:grid-cols-[16rem_1fr]">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        <LevelIcon level={s.level} />
                        {s.title}
                        <MaskBadge step={s} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start gap-1.5 text-muted-foreground">
                          <How className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          <span className="sr-only">{HOW[s.how].word}: </span>
                          <span className={cn(s.level === "red" ? "text-risk-red" : s.level === "amber" ? "text-foreground" : undefined)}>{s.note}</span>
                        </div>
                        {s.masking ? <div className="mt-0.5 text-xs text-muted-foreground">{s.masking.needed ? "Masked: " : ""}{s.masking.what}</div> : null}
                      </div>
                    </li>
                  );
                })}
            </ol>
          </div>
        ))}
      </Fold>

      <AiReview revisionId={revisionId} />
    </section>
  );
}
