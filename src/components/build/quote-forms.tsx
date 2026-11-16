"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { issueQuote, saveQuantities, saveQuoteTerms, saveRates } from "@/app/(app)/boms/[id]/build/actions";
import { RATE_FIELDS, type Rates } from "@/data/costing";

const field = "num h-9 w-full rounded-md border bg-card px-2.5 text-sm outline-none transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring";
const primary = "inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground outline-none transition-[filter] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const outline = "inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function report(res: { error?: string; message?: string } | undefined) {
  if (res?.error) toast.error(res.error);
  else if (res?.message) toast.success(res.message);
}

export function QuantitiesForm({ revisionId, quantities, disabled }: { revisionId: string; quantities: number[]; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const text = String(new FormData(e.currentTarget).get("q") ?? "");
        start(async () => report(await saveQuantities(revisionId, text)));
      }}
    >
      <label className="min-w-56 flex-1 text-xs text-muted-foreground">
        Quantities to quote (up to four)
        <input name="q" defaultValue={quantities.join(", ")} disabled={disabled} className={field} placeholder="100, 500, 1k" />
      </label>
      <button type="submit" disabled={pending || disabled} className={outline}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Re-price
      </button>
    </form>
  );
}

export function TermsForm({ revisionId, terms, disabled }: { revisionId: string; terms: { currency: string; validDays: number; notes: string }; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-2 sm:grid-cols-[8rem_8rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => report(await saveQuoteTerms(revisionId, { currency: String(f.get("currency")), validDays: Number(f.get("validDays")), notes: String(f.get("notes") ?? "") })));
      }}
    >
      <label className="text-xs text-muted-foreground">
        Client currency
        <select name="currency" defaultValue={terms.currency} disabled={disabled} className={field}>
          <option>INR</option>
          <option>USD</option>
          <option>EUR</option>
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        Valid for, days
        <input name="validDays" type="number" min={1} max={365} defaultValue={terms.validDays} disabled={disabled} className={field} />
      </label>
      <label className="text-xs text-muted-foreground">
        Notes to the client
        <input name="notes" defaultValue={terms.notes} disabled={disabled} className={`${field} font-sans`} placeholder="e.g. Prices ex-works Chennai; payment 30 days" />
      </label>
      <button type="submit" disabled={pending || disabled} className={outline}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Save terms
      </button>
    </form>
  );
}

/** The plant rates for this quote: every number the conversion cost and margin use. */
export function RatesForm({ revisionId, rates, disabled }: { revisionId: string; rates: Rates; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const next: Partial<Rates> = Object.fromEntries(RATE_FIELDS.map((r) => [r.key, Number(f.get(r.key))]));
        next.chargeMoqExcess = f.get("chargeMoqExcess") === "on";
        next.nre = { stencilPerSide: Number(f.get("stencilPerSide")), programming: Number(f.get("programming")), testFixture: Number(f.get("testFixture")), firstArticle: Number(f.get("firstArticle")) };
        start(async () => report(await saveRates(revisionId, next)));
      }}
    >
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {RATE_FIELDS.map((r) => (
          <label key={r.key} className="text-xs text-muted-foreground">
            {r.label} <span className="opacity-70">({r.unit})</span>
            <input name={r.key} type="number" step="any" min={0} defaultValue={rates[r.key]} disabled={disabled} className={field} />
          </label>
        ))}
        {(
          [
            ["stencilPerSide", "Stencil, per side (₹)"],
            ["programming", "Placement + AOI programmes (₹)"],
            ["firstArticle", "First-article inspection (₹)"],
            ["testFixture", "Test fixture (₹, 0 = none)"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="text-xs text-muted-foreground">
            {label}
            <input name={k} type="number" step="any" min={0} defaultValue={rates.nre[k]} disabled={disabled} className={field} />
          </label>
        ))}
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input name="chargeMoqExcess" type="checkbox" defaultChecked={rates.chargeMoqExcess} disabled={disabled} className="size-4 accent-[var(--primary)]" />
          Charge MOQ / reel left-overs
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending || disabled} className={primary}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save rates
        </button>
        <button type="button" disabled={pending || disabled} onClick={() => start(async () => report(await saveRates(revisionId, null)))} className={outline}>
          Plant defaults
        </button>
      </div>
    </form>
  );
}

/** Issue: freeze the numbers, give it a CQ number and open the printable client quote. */
export function IssueButton({ revisionId, blocked }: { revisionId: string; blocked: string | null }) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || !!blocked}
        title={blocked ?? undefined}
        onClick={() => {
          if (!armed) return setArmed(true);
          start(async () => {
            const res = await issueQuote(revisionId);
            report(res);
            setArmed(false);
            if (res?.quoteId) router.push(`/boms/${revisionId}/build/print?q=${res.quoteId}`);
          });
        }}
        className={primary}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        {armed ? "Confirm — issue to the client" : "Issue quote"}
      </button>
      {blocked ? <span className="text-xs text-risk-amber">{blocked}</span> : armed ? <span className="text-xs text-muted-foreground">Freezes these prices under a quote number.</span> : null}
    </span>
  );
}
