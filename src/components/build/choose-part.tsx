"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { chooseMarketPart, choosePart } from "@/app/(app)/boms/[id]/build/actions";
import { cn } from "@/lib/utils";

export type ChoiceRow = {
  partId: string;
  mpn: string;
  manufacturer: string;
  description: string | null;
  pkg: string | null;
  lifecycle: string;
  ours: number;
  distributors: number;
  /** Formatted best price at the line's need. */
  price: string | null;
  reason: string | null;
};

/** A part found at the distributors for the line's search; `partId` is set when it is already in our catalogue. */
export type MarketRow = {
  key: string;
  partId: string | null;
  mpn: string;
  manufacturer: string;
  description: string | null;
  lifecycle: string | null;
  stock: number;
  sellers: string;
  /** Formatted best in-stock price at the line's need. */
  price: string | null;
};

const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-IN"));

/**
 * Parts to choose for a line without one. Tick the designators the part is for — all of them by default; fewer
 * splits the line, and the rest wait for their own part.
 */
export function ChoosePart({
  revisionId,
  lineId,
  refs,
  sections,
  market,
  lineHref,
  canEdit,
}: {
  revisionId: string;
  lineId: string;
  refs: string[];
  sections: { title: string; note?: string; rows: ChoiceRow[] }[];
  /** Live distributor results for the search, when one was made. */
  market?: { query: string; note: string; rows: MarketRow[] } | null;
  /** The components step URL, ending in "line=" — the new line's id is appended after a split. */
  lineHref: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(refs));
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const all = picked.size === refs.length;
  const toggle = (r: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  const run = (id: string, act: (places: string[] | null) => ReturnType<typeof choosePart>) => {
    setBusy(id);
    start(async () => {
      try {
        const res = await act(all ? null : refs.filter((r) => picked.has(r)));
        if (res?.error) return void toast.error(res.error);
        if (res?.message) toast.success(res.message);
        if (res?.lineId && res.lineId !== lineId) router.push(`${lineHref}${res.lineId}`);
      } catch {
        toast.error("That did not go through — check the connection and try again.");
      } finally {
        setBusy(null);
      }
    });
  };
  const take = (partId: string) => run(partId, (places) => choosePart(revisionId, lineId, partId, places));
  const takeMarket = (row: MarketRow) =>
    row.partId ? take(row.partId) : run(row.key, (places) => chooseMarketPart(revisionId, lineId, market?.query ?? "", row.key, places));
  const useLabel = all || !refs.length ? "Use" : `Use for ${picked.size}`;
  const useClass =
    "inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium whitespace-nowrap outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

  return (
    <>
      {refs.length > 1 ? (
        <div className="border-b px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              The part is for <span className="num font-medium text-foreground">{picked.size}</span> of {refs.length} places — untick the ones that take another part
            </span>
            <button type="button" onClick={() => setPicked(all ? new Set() : new Set(refs))} className="text-xs text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
              {all ? "Clear" : "All"}
            </button>
          </div>
          <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto" role="group" aria-label="Designators">
            {refs.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={picked.has(r)}
                onClick={() => toggle(r)}
                className={cn(
                  "num h-7 rounded-md border px-2 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  picked.has(r) ? "border-primary/40 bg-primary/10 text-foreground" : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {sections.map((s) =>
        s.rows.length ? (
          <div key={s.title} className="border-b last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3 pb-1">
              <h4 className="text-xs font-medium">{s.title}</h4>
              {s.note ? <span className="text-xs text-muted-foreground">{s.note}</span> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Part</th>
                    <th>Package</th>
                    <th>Our stores</th>
                    <th>Distributors</th>
                    <th>Price</th>
                    <th>Choose</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {s.rows.map((c) => (
                    <tr key={c.partId}>
                      <td className="w-full max-w-0 px-4 py-2">
                        <span className="flex items-baseline gap-2">
                          <Link href={`/parts/${c.partId}`} className="num truncate font-medium hover:underline">{c.mpn}</Link>
                          <span className="truncate text-xs text-muted-foreground">{c.manufacturer}</span>
                          {c.lifecycle !== "ACTIVE" ? <span className="shrink-0 rounded bg-risk-amber-soft px-1.5 text-[11px] text-risk-amber">{c.lifecycle}</span> : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{c.reason ?? c.description ?? ""}</span>
                      </td>
                      <td className="num px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{c.pkg ?? "—"}</td>
                      <td className={cn("num px-3 py-2 text-right text-xs whitespace-nowrap", c.ours ? "text-risk-green" : "text-muted-foreground")}>{c.ours ? `${k(c.ours)} ours` : "—"}</td>
                      <td className="num px-3 py-2 text-right text-xs whitespace-nowrap text-muted-foreground">{c.distributors ? `${k(c.distributors)} at distributors` : "—"}</td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap">{c.price ?? <span className="text-xs text-muted-foreground">no price</span>}</td>
                      <td className="px-4 py-2 text-right">
                        {canEdit ? (
                          <button
                            type="button"
                            disabled={!picked.size && refs.length > 0 || busy !== null}
                            onClick={() => take(c.partId)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium whitespace-nowrap outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                          >
                            {busy === c.partId ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                            {all || !refs.length ? "Use" : `Use for ${picked.size}`}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null,
      )}
      {market ? (
        <div className="border-b">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3 pb-1">
            <h4 className="text-xs font-medium">At the distributors for “{market.query}”</h4>
            <span className="text-xs text-muted-foreground">{market.note}</span>
          </div>
          {market.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Part</th>
                    <th>Stock</th>
                    <th>Price</th>
                    <th>Choose</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {market.rows.map((r) => (
                    <tr key={r.key}>
                      <td className="w-full max-w-0 px-4 py-2">
                        <span className="flex items-baseline gap-2">
                          <span className="num truncate font-medium">{r.mpn}</span>
                          <span className="truncate text-xs text-muted-foreground">{r.manufacturer}</span>
                          {r.lifecycle && r.lifecycle !== "ACTIVE" ? <span className="shrink-0 rounded bg-risk-amber-soft px-1.5 text-[11px] text-risk-amber">{r.lifecycle}</span> : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{r.description ?? ""}</span>
                      </td>
                      <td className={cn("num px-3 py-2 text-right text-xs whitespace-nowrap", r.stock ? "text-risk-green" : "text-muted-foreground")}>
                        {r.stock ? `${k(r.stock)} in stock` : "no stock"}
                        <span className="block text-[11px] text-muted-foreground">{r.sellers}</span>
                      </td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap">{r.price ?? <span className="text-xs text-muted-foreground">no price</span>}</td>
                      <td className="px-4 py-2 text-right">
                        {canEdit ? (
                          <button type="button" disabled={(!picked.size && refs.length > 0) || busy !== null} onClick={() => takeMarket(r)} className={useClass}>
                            {busy === (r.partId ?? r.key) ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                            {useLabel}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 pb-3 text-sm text-muted-foreground">Nothing found — try the value with the package (10k 1210), or the part number.</p>
          )}
        </div>
      ) : null}
    </>
  );
}
