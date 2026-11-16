"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_LABEL } from "@/lib/ops/route";
import type { ViewerRouteStep } from "./types";

/** The manufacturing route as a clickable list: picking a step lights up the parts it handles. */
export function RoutePanel({ steps, active, onPick, revisionId }: { steps: ViewerRouteStep[]; active: string | null; onPick: (key: string | null) => void; revisionId: string | null }) {
  if (!steps.length) return null;
  return (
    <section className="rounded-lg border bg-card p-4" aria-labelledby="route-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="route-title" className="text-sm font-medium">Process route</h2>
        {revisionId ? (
          <Link href={`/boms/${revisionId}/route`} className="text-xs text-muted-foreground hover:text-foreground">Full route →</Link>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{steps.length} steps, bare board to packed product. Pick one to light up the parts it handles.</p>
      <ol className="mt-2">
        {steps.map((s, i) => {
          const open = active === s.key;
          return (
            <li key={s.key}>
              {i === 0 || steps[i - 1].stage !== s.stage ? <div className="mt-3 mb-1 text-[11px] font-medium text-muted-foreground">{STAGE_LABEL[s.stage]}</div> : null}
              <button
                type="button"
                aria-expanded={open}
                onClick={() => onPick(open ? null : s.key)}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  open ? "bg-muted font-medium" : "hover:bg-muted/60",
                )}
              >
                <span className="num w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                {s.watch ? <AlertTriangle className="size-3.5 shrink-0 text-risk-amber" aria-label="Has a watch-out" /> : null}
                {s.refs.length ? <span className="num shrink-0 text-xs text-muted-foreground">{s.refs.length}</span> : null}
              </button>
              {open ? (
                <div className="space-y-1.5 pt-1 pr-1 pb-3 pl-9 text-xs">
                  <p>{s.why}</p>
                  {s.watch ? <p className="text-risk-amber">{s.watch}</p> : null}
                  {s.where ? (
                    <p className="text-muted-foreground">
                      <span className="num font-medium text-foreground">{s.where.line}</span> · {s.where.equipment ?? s.where.lineName}
                    </p>
                  ) : null}
                  {s.checks.length ? (
                    <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {s.checks.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                    {s.machine ? (
                      <Link href={`/knowledge/dictionary/${s.machine}`} className="text-muted-foreground hover:text-foreground">{s.machineName ?? "The machine"} →</Link>
                    ) : null}
                    {s.article ? (
                      <Link href={`/knowledge/${s.article}`} className="text-muted-foreground hover:text-foreground">{s.articleTitle ?? "How it works"} →</Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
