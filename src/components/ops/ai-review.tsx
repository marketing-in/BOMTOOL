"use client";

import { useState, useTransition } from "react";
import { Check, CircleAlert, Loader2, ShieldCheck, Sparkles, TriangleAlert, Truck, Wrench } from "lucide-react";
import type { Level } from "@/lib/ops/machines";
import type { ReviewResult } from "@/lib/assistant/process-review";
import { reviewProcessWithAi, type AiReviewState } from "@/app/(app)/boms/[id]/feasibility/review-ai";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TONE: Record<Level, { box: string; text: string }> = {
  green: { box: "border-risk-green/30 bg-risk-green-soft", text: "text-risk-green" },
  amber: { box: "border-risk-amber/40 bg-risk-amber-soft", text: "text-risk-amber" },
  red: { box: "border-risk-red/30 bg-risk-red-soft", text: "text-risk-red" },
};

function LevelIcon({ level, className }: { level: Level; className?: string }) {
  const Icon = level === "green" ? Check : level === "amber" ? TriangleAlert : CircleAlert;
  return <Icon className={cn("size-4 shrink-0", TONE[level].text, className)} aria-hidden />;
}

const VERDICT: Record<ReviewResult["verdict"], { word: string; level: Level }> = {
  ready: { word: "Ready to build", level: "green" },
  ready_with_changes: { word: "Buildable once the findings are handled", level: "amber" },
  not_ready: { word: "Not ready — a step cannot be done", level: "red" },
};

/** The AI's reading of the process, on demand: nothing is sent until the button is pressed. */
export function AiReview({ revisionId }: { revisionId: string }) {
  const [state, setState] = useState<AiReviewState | null>(null);
  const [pending, start] = useTransition();
  const r = state?.review;
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-part-soft text-primary"><Sparkles className="size-[18px]" aria-hidden /></span>
          <h3 className="text-base font-semibold" title="Order, masking, test and dispatch. Nothing is sent until you press.">AI process review</h3>
        </div>
        <Button className="h-10" disabled={pending} onClick={() => start(async () => setState(await reviewProcessWithAi(revisionId)))}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {pending ? "Reviewing…" : r ? "Review again" : "Review the process with AI"}
        </Button>
      </div>
      <div aria-live="polite">
        {state?.error ? <p role="alert" className="border-t px-4 py-3 text-sm text-destructive">{state.error}</p> : null}
        {r ? (
          <div className="space-y-4 border-t px-5 py-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold", TONE[VERDICT[r.verdict].level].box)}>
                <LevelIcon level={VERDICT[r.verdict].level} className="size-3.5" /> {VERDICT[r.verdict].word}
              </span>
              <span className={cn("rounded-md px-2 py-1 text-[11px] font-medium", state?.mode === "claude" ? "bg-risk-green-soft text-risk-green" : "bg-risk-amber-soft text-risk-amber")}>
                {state?.mode === "claude" ? "AI review" : "Simulated from the rule check"}
              </span>
            </div>
            {state?.mode === "mock" ? <p className="text-xs text-muted-foreground">{state.note ? `The live AI could not be used: ${state.note}` : "No AI key set (ANTHROPIC_API_KEY in .env)."}</p> : null}
            <p>{r.summary}</p>
            {r.findings.length ? (
              <ul className="divide-y border-y">
                {r.findings.map((f, i) => (
                  <li key={i} className="grid gap-1 py-2.5 md:grid-cols-[12rem_1fr]">
                    <div className="flex items-center gap-2 font-medium">
                      {f.level === "info" ? <Check className="size-4 text-muted-foreground" aria-hidden /> : <LevelIcon level={f.level} />}
                      {f.step}
                    </div>
                    <div>
                      <div>{f.issue}</div>
                      <div className="text-muted-foreground">→ {f.fix}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <dl className="grid gap-3 md:grid-cols-3">
              {(
                [
                  [ShieldCheck, "Masking", r.masking],
                  [Wrench, "Test", r.test],
                  [Truck, "Inspection, packing & dispatch", r.dispatch],
                ] as const
              ).map(([Icon, label, text]) => (
                <div key={label} className="md:border-l md:pl-4 md:first:border-l-0 md:first:pl-0">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Icon className="size-3.5" aria-hidden /> {label}</dt>
                  <dd className="mt-1">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
