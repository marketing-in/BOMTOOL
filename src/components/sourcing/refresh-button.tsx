"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshNow } from "@/app/(app)/sourcing/actions";
import { Button } from "@/components/ui/button";

type Scope = { partIds?: string[]; revisionId?: string; hot?: boolean; label?: string };
type Run = { status: string; stats?: { done?: number; parts?: number; events?: number; offersUpserted?: number; errors?: string[] } | null; error?: string | null };

/** Starts a background refresh and polls its JobRun until it finishes, then refreshes the page data. */
export function RefreshButton({ scope, label = "Refresh prices", variant = "outline" }: { scope: Scope; label?: string; variant?: "outline" | "default" | "ghost" }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    const poll = async () => {
      while (!stop) {
        await new Promise((r) => setTimeout(r, 1500));
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" }).catch(() => null);
        if (!res?.ok) continue;
        const run = (await res.json()) as Run;
        const s = run.stats ?? {};
        if (run.status === "RUNNING") {
          setProgress(s.parts ? `${s.done ?? 0}/${s.parts}` : "starting…");
          continue;
        }
        stop = true;
        setJobId(null);
        setProgress(null);
        if (run.status === "DONE") {
          const errs = s.errors?.length ? ` · ${s.errors.length} errors` : "";
          toast.success(`Refreshed ${s.parts ?? 0} parts · ${s.offersUpserted ?? 0} offers · ${s.events ?? 0} changes${errs}`);
        } else toast.error(`Refresh failed: ${run.error ?? "unknown error"}`);
        router.refresh();
      }
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [jobId, router]);

  const busy = pending || !!jobId;
  return (
    <Button
      variant={variant}
      className="h-auto min-h-10 whitespace-normal text-left"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const res = await refreshNow(scope);
          if (res?.error) toast.error(res.error);
          else if (res?.jobId) setJobId(res.jobId);
          else toast.info("Refresh queued for the background worker.");
        })
      }
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
      {busy ? `Refreshing${progress ? ` ${progress}` : "…"}` : label}
    </Button>
  );
}
