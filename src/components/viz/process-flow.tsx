import Link from "next/link";
import { ChevronRight, CircleAlert, Hand, Package, ShieldHalf, TriangleAlert, Wrench } from "lucide-react";
import type { Level } from "@/lib/ops/machines";
import { STAGE_LABEL, type RouteStage } from "@/lib/ops/route";
import { cn } from "@/lib/utils";
import { stepIcon, stepShort } from "./step-icon";
import { Tip } from "./tip";

export type FlowNode = {
  key: string;
  title: string;
  stage: RouteStage;
  level: Level;
  how: "machine" | "bench" | "bought-in";
  /** "L1 · ASMPT DEK TQ" — where it can be done, the planned place first. */
  where: string[];
  /** What to know about this step: why it is amber or red, or its watch-out. */
  note?: string | null;
  masking?: { needed: boolean; what: string } | null;
  href?: string;
};

const TONE: Record<Level, string> = {
  green: "border-risk-green/50 bg-risk-green-soft text-risk-green",
  amber: "border-risk-amber bg-risk-amber-soft text-risk-amber",
  red: "border-risk-red bg-risk-red-soft text-risk-red",
};
const HOW = {
  machine: { word: "On a machine", icon: Wrench, shape: "rounded-full" },
  bench: { word: "By hand, at a bench", icon: Hand, shape: "rounded-full border-dashed" },
  "bought-in": { word: "Bought in", icon: Package, shape: "rounded-lg" },
} as const;
const LEVEL_WORD: Record<Level, string> = { green: "can be done", amber: "to check", red: "cannot be done" };

/**
 * The process as a chain of icons (Phase 25): one node per step, grouped by stage, in the order the board travels.
 * Colour says whether we can do the step, the outline how (machine, bench, bought in), a shield where a mask is
 * needed. A tap on a node opens where it is done and anything to watch.
 */
export function ProcessFlow({ nodes, className }: { nodes: FlowNode[]; className?: string }) {
  const stages = [...new Set(nodes.map((n) => n.stage))];
  const twoSided = nodes.some((n) => /-bottom$/.test(n.key));
  const number = new Map(nodes.map((n, i) => [n.key, i + 1]));
  return (
    <div className={className}>
      <ol className="flex flex-wrap items-stretch gap-y-3" aria-label="The process, step by step">
        {stages.map((stage, si) => {
          const list = nodes.filter((n) => n.stage === stage);
          return (
            <li key={stage} className="flex max-w-full min-w-0 items-center">
              <div className="h-full rounded-xl border bg-muted/40 px-1.5 pt-1.5 pb-2">
                <div className="mb-1.5 px-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{STAGE_LABEL[stage]}</div>
                <ol className="flex flex-wrap gap-y-2">
                  {list.map((n, i) => {
                    const Icon = stepIcon(n.key);
                    const how = HOW[n.how];
                    const short = stepShort(n.key, n.title, twoSided);
                    return (
                      <li key={n.key} className={cn("relative flex w-[4.25rem] flex-col items-center", i < list.length - 1 && "after:absolute after:top-[21px] after:left-[calc(50%+22px)] after:h-0.5 after:w-[24px] after:bg-border")}>
                        <Tip
                          label={`Step ${number.get(n.key)}, ${n.title}: ${LEVEL_WORD[n.level]}${n.masking?.needed ? ", masking needed" : ""}`}
                          className="rounded-full"
                          content={
                            <>
                              <div className="flex items-center gap-2 font-semibold">
                                <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium">{number.get(n.key)}</span>
                                {n.title}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <how.icon className="size-3.5" aria-hidden /> {how.word}
                              </div>
                              {n.where.length ? (
                                <ul className="space-y-0.5 text-xs">
                                  {n.where.slice(0, 4).map((w) => <li key={w} className="num">{w}</li>)}
                                  {n.where.length > 4 ? <li className="text-muted-foreground">and {n.where.length - 4} more</li> : null}
                                </ul>
                              ) : null}
                              {n.note && (n.level !== "green" || !n.where.length) ? <p className={cn("text-xs", n.level === "red" ? "text-risk-red" : n.level === "amber" ? "text-foreground" : "text-muted-foreground")}>{n.note}</p> : null}
                              {n.masking ? (
                                <p className="flex items-start gap-1.5 text-xs">
                                  <ShieldHalf className={cn("mt-0.5 size-3.5 shrink-0", n.masking.needed ? "text-risk-amber" : "text-risk-green")} aria-hidden />
                                  <span><span className="font-medium">{n.masking.needed ? "Masking" : "No masking"}</span> — {n.masking.what}</span>
                                </p>
                              ) : null}
                              {n.href ? <Link href={n.href} className="inline-block text-xs font-medium text-primary hover:underline">Open this step</Link> : null}
                            </>
                          }
                        >
                          <span className={cn("relative grid size-11 place-items-center border-2 transition-transform duration-150 hover:scale-105", how.shape, TONE[n.level])}>
                            <Icon className="size-5" aria-hidden />
                            {n.masking?.needed ? (
                              <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-risk-amber text-white ring-2 ring-card">
                                <ShieldHalf className="size-3" aria-hidden />
                              </span>
                            ) : null}
                            {n.level !== "green" ? (
                              <span className={cn("absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full text-white ring-2 ring-card", n.level === "red" ? "bg-risk-red" : "bg-risk-amber")}>
                                {n.level === "red" ? <CircleAlert className="size-3" aria-hidden /> : <TriangleAlert className="size-3" aria-hidden />}
                              </span>
                            ) : null}
                          </span>
                        </Tip>
                        <span className="mt-1 px-0.5 text-center text-[11px] leading-tight text-muted-foreground" aria-hidden>{short}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
              {si < stages.length - 1 ? <ChevronRight className="mx-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="How to read the picture">
        <li className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded-full border-2 border-risk-green/50 bg-risk-green-soft" aria-hidden /> machine</li>
        <li className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded-full border-2 border-dashed border-risk-green/60 bg-risk-green-soft" aria-hidden /> by hand</li>
        <li className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded-[4px] border-2 border-risk-green/50 bg-risk-green-soft" aria-hidden /> bought in</li>
        <li className="inline-flex items-center gap-1.5"><span className="grid size-4 place-items-center rounded-full bg-risk-amber text-white" aria-hidden><ShieldHalf className="size-2.5" /></span> masking</li>
        <li className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded-full border-2 border-risk-amber bg-risk-amber-soft" aria-hidden /> to check</li>
        <li className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded-full border-2 border-risk-red bg-risk-red-soft" aria-hidden /> cannot be done</li>
        <li className="ml-auto hidden sm:block">Tap a step for where it is done.</li>
      </ul>
    </div>
  );
}
