"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { applyStrategy, chooseBoard, chooseBox, pinLine, saveFabQuote } from "@/app/(app)/boms/[id]/build/actions";
import { switchToAlternate } from "@/app/(app)/boms/actions";
import type { LinePin } from "@/server/bom-pipeline";
import type { BoxChoice } from "@/server/build";
import { cn } from "@/lib/utils";

export type Act =
  | { kind: "board"; revisionId: string; supplierId?: string; stockPartId?: string }
  | { kind: "board-auto"; revisionId: string }
  | { kind: "pin"; revisionId: string; lineId: string; pin: LinePin | null }
  | { kind: "box"; revisionId: string; choice: BoxChoice | null }
  | { kind: "strategy"; revisionId: string; key: "price" | "lead" | "risk" | "order" };

function run(act: Act) {
  switch (act.kind) {
    case "board":
      return chooseBoard(act.revisionId, { supplierId: act.supplierId, stockPartId: act.stockPartId });
    case "board-auto":
      return chooseBoard(act.revisionId, null);
    case "pin":
      return pinLine(act.revisionId, act.lineId, act.pin);
    case "box":
      return chooseBox(act.revisionId, act.choice);
    case "strategy":
      return applyStrategy(act.revisionId, act.key);
  }
}

/** Choose this option for the quote; the chosen one shows a tick. */
export function ChooseButton({ act, chosen, label = "Choose", chosenLabel = "Chosen", disabled }: { act: Act; chosen: boolean; label?: string; chosenLabel?: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  if (chosen)
    return (
      <span className="inline-flex h-8 items-center gap-1 rounded-md bg-primary/10 px-2.5 text-xs font-medium text-primary">
        <Check className="size-3.5" aria-hidden /> {chosenLabel}
      </span>
    );
  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const res = await run(act);
          if (res?.error) toast.error(res.error);
          else if (res?.message) toast.success(res.message);
        })
      }
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      {label}
    </button>
  );
}

/** Type in the fab's own quote for the chosen board; it replaces the estimate at every quantity. */
export function FabQuoteForm({ revisionId, supplierId, quoted }: { revisionId: string; supplierId: string; quoted: { unit: number; nre: number; leadDays: number | null } | null }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const field = "num h-9 w-full rounded-md border bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (!open)
    return (
      <span className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          {quoted ? "Change their quote" : "Enter their quote"}
        </button>
        {quoted ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => void toastResult(await saveFabQuote(revisionId, supplierId, null)))}
            className="text-xs text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Use the estimate
          </button>
        ) : null}
      </span>
    );
  return (
    <form
      className="grid w-full max-w-md grid-cols-3 gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const lead = String(f.get("lead") ?? "").trim();
        start(async () => {
          const res = await saveFabQuote(revisionId, supplierId, { unit: Number(f.get("unit")), nre: Number(f.get("nre") || 0), leadDays: lead ? Number(lead) : null });
          toastResult(res);
          if (!res?.error) setOpen(false);
        });
      }}
    >
      <label className="text-xs text-muted-foreground">
        ₹ per board, landed
        <input name="unit" type="number" step="0.01" min="0.01" required defaultValue={quoted?.unit} className={field} />
      </label>
      <label className="text-xs text-muted-foreground">
        Tooling ₹
        <input name="nre" type="number" step="1" min="0" defaultValue={quoted?.nre ?? 0} className={field} />
      </label>
      <label className="text-xs text-muted-foreground">
        Lead, days
        <input name="lead" type="number" step="1" min="0" max="365" defaultValue={quoted?.leadDays ?? undefined} className={field} />
      </label>
      <span className="col-span-3 flex gap-2">
        <button type="submit" disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Save quote
        </button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 items-center rounded-md border px-3 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
          Cancel
        </button>
      </span>
    </form>
  );
}

function toastResult(res: { error?: string; message?: string } | undefined) {
  if (res?.error) toast.error(res.error);
  else if (res?.message) toast.success(res.message);
}

/** Moves the BoM line onto this alternate (reversible from the BoM page: the original stays a candidate). */
export function UseAlternateButton({ lineId, altPartId, mpn }: { lineId: string; altPartId: string; mpn: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Use ${mpn} on this line`}
      onClick={() =>
        start(async () => {
          const res = await switchToAlternate(lineId, altPartId);
          if (res?.error) toast.error(res.error);
          else {
            toast.success(`Line moved to ${mpn}`);
            router.refresh();
          }
        })
      }
      className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      Use this
    </button>
  );
}
