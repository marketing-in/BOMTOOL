"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { restartReview, signGate } from "@/app/(app)/boms/[id]/feasibility/actions";

const field = "w-full rounded-md border bg-card px-2.5 py-2 text-sm outline-none transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring";
const primary = "inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-[filter] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const outline = "inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** Sign-off for the one open gate. Signing locks it: there is no edit and no undo. */
export function GateSign({
  revisionId,
  qty,
  gate,
  title,
  n,
  reds,
  ambers,
  canSign,
  canWaive,
}: {
  revisionId: string;
  qty: number;
  gate: string;
  title: string;
  n: number;
  reds: { key: string; label: string }[];
  ambers: number;
  canSign: boolean;
  canWaive: boolean;
}) {
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  if (!canSign) return <p className="text-xs text-muted-foreground">Your role cannot sign.</p>;
  const blocked = reds.length > 0 && !canWaive;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const waivers = Object.fromEntries(reds.map((r) => [r.key, String(f.get(`w:${r.key}`) ?? "")]));
        start(async () => {
          const res = await signGate(revisionId, qty, gate, String(f.get("note") ?? ""), waivers);
          if (res.error) toast.error(res.error);
          else toast.success(res.message ?? "Signed");
          setSure(false);
        });
      }}
    >
      {reds.length ? (
        <div className="space-y-2 rounded-md border border-risk-red/40 bg-risk-red-soft/40 px-3 py-2.5 dark:bg-risk-red/10">
          <p className="text-xs font-medium text-risk-red">
            {reds.length} red check{reds.length === 1 ? "" : "s"} block this gate.{" "}
            <span className="font-normal text-foreground">{canWaive ? "Clear them, or waive each with a reason." : "Clear them, or ask Quality to waive them."}</span>
          </p>
          {canWaive
            ? reds.map((r) => (
                <label key={r.key} className="block text-xs text-muted-foreground">
                  Why “{r.label}” is accepted
                  <input name={`w:${r.key}`} required minLength={10} maxLength={500} className={field} placeholder="e.g. customer supplies the part; confirmed by e-mail on …" />
                </label>
              ))
            : null}
        </div>
      ) : null}
      <label className="block text-xs text-muted-foreground">
        Note{ambers ? ` — how the ${ambers} amber point${ambers === 1 ? " is" : "s are"} handled` : ""}
        <textarea name="note" rows={2} maxLength={1000} className={field} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="size-4 accent-[var(--primary)]" disabled={blocked} />
          Checked. Signing locks gate {n} for good.
        </label>
        <button type="submit" disabled={pending || !sure || blocked} className={primary}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Lock className="size-4" aria-hidden />}
          Sign {title}
        </button>
      </div>
    </form>
  );
}

/** Administrator only: close the review as superseded and begin again at gate 1. */
export function RestartReview({ revisionId }: { revisionId: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className={outline} onClick={() => setOpen(true)}>
        <RotateCcw className="size-4" aria-hidden /> Start a new review
      </button>
    );
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
        start(async () => {
          const res = await restartReview(revisionId, reason);
          if (res.error) toast.error(res.error);
          else {
            toast.success(res.message ?? "New review started");
            setOpen(false);
          }
        });
      }}
    >
      <label className="min-w-64 flex-1 text-xs text-muted-foreground">
        Why a new review is needed
        <input name="reason" required minLength={10} maxLength={500} className={field} autoFocus />
      </label>
      <button type="submit" disabled={pending} className={outline}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
        Supersede and restart
      </button>
      <button type="button" className={outline} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
