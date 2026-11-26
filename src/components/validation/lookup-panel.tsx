"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { lookUpParts } from "@/app/(app)/validation/actions";
import { cn } from "@/lib/utils";

export type LookupView = {
  pending: number;
  live: string[];
  run: { status: string; lines: number; found: number; notFound: number; errors: number; by: Record<string, number>; missing: string[]; simulated: boolean; error: string | null } | null;
};

/**
 * The BoM's part numbers looked up at the distributors (Phase 47): what the last look-up found, the part numbers no
 * distributor knows, and a button for the lines still waiting. While a look-up runs, the page refreshes itself.
 */
export function LookupPanel({ revisionId, view, canRun }: { revisionId: string; view: LookupView; canRun: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const running = view.run?.status === "RUNNING";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [running, router]);

  const run = view.run;
  const by = run ? Object.entries(run.by).sort((a, b) => b[1] - a[1]) : [];
  return (
    <div className="space-y-3 rounded-xl border bg-card px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Distributor look-up</div>
          <p className="text-xs text-muted-foreground">{view.live.length ? `Live: ${view.live.join(", ")}` : "No distributor keys set: simulated market only"}</p>
        </div>
        {canRun && view.pending > 0 && !running ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await lookUpParts(revisionId);
                setNote(r.error ?? r.message ?? null);
                router.refresh();
              })
            }
            className="inline-flex h-10 items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            {view.live.length ? `Look up ${view.pending} part number${view.pending === 1 ? "" : "s"}` : `Search the simulated market`}
          </button>
        ) : null}
      </div>

      {running ? (
        <p className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden />
          Looking up {run!.lines} part number{run!.lines === 1 ? "" : "s"}: {run!.found} found so far
          {run!.notFound ? `, ${run!.notFound} not found` : ""}.
        </p>
      ) : run ? (
        <div className="space-y-2 text-sm">
          <p>
            <span className={cn("font-medium", run.found ? "text-risk-green" : "text-muted-foreground")}>{run.found} found</span>
            {by.length ? <span className="text-muted-foreground"> ({by.map(([k, n]) => `${k} ${n}`).join(", ")})</span> : null}
            {run.notFound ? (
              <>
                {" · "}
                <span className={cn("font-medium", run.simulated ? "text-muted-foreground" : "text-risk-amber")}>
                  {run.simulated ? `${run.notFound} not in the simulated market (live keys needed)` : `${run.notFound} no distributor lists`}
                </span>
              </>
            ) : null}
            {run.errors ? <span className="text-muted-foreground"> · {run.errors} failed, retried next time</span> : null}
            {view.pending ? <span className="text-muted-foreground"> · {view.pending} still to look up</span> : null}
          </p>
          {run.missing.length && !run.simulated ? (
            <p className="text-xs text-muted-foreground">
              Not found: <span className="num text-foreground">{run.missing.slice(0, 24).join(", ")}</span>
              {run.missing.length > 24 ? ` and ${run.missing.length - 24} more` : ""}
            </p>
          ) : null}
          {run.error ? <p className="text-xs text-risk-red">{run.error}</p> : null}
        </div>
      ) : view.pending ? (
        <p className="text-sm text-muted-foreground">{view.pending} not in our catalogue yet</p>
      ) : (
        <p className="text-sm text-muted-foreground">All in our catalogue</p>
      )}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
