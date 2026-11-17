import { Banknote, Clock, ListOrdered, ShieldCheck } from "lucide-react";
import type { Build } from "@/server/build";
import type { Band, OrderKey } from "@/lib/costing/strategy";
import { ChooseButton } from "@/components/build/choose-button";
import { Info } from "@/components/viz/info";
import { cn } from "@/lib/utils";

const ICON: Record<OrderKey, typeof Banknote> = { order: ListOrdered, price: Banknote, lead: Clock, risk: ShieldCheck };
const BAND: { key: Band; label: string; bar: string }[] = [
  { key: "ours", label: "our stores", bar: "bg-risk-green" },
  { key: "authorised", label: "authorised", bar: "bg-[var(--cost-1)]" },
  { key: "open", label: "partner / excess", bar: "bg-risk-amber" },
  { key: "broker", label: "broker", bar: "bg-risk-red" },
];

const weeks = (w: number) => (w <= 0 ? "On the shelf" : `${w} week${w === 1 ? "" : "s"}`);

/** A thin bar on a scale shared by the four cards, so cost and wait can be compared by eye. */
function Scale({ share, best, label }: { share: number; best: boolean; label: string }) {
  return (
    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-sm bg-muted" role="img" aria-label={label}>
      <span className={cn("block h-full", best ? "bg-risk-green" : "bg-primary/60")} style={{ width: `${Math.max(3, Math.min(100, share * 100))}%` }} />
    </span>
  );
}

/**
 * How to source the components (redrawn in Phase 25): four cards — the plant's own order, lowest price, shortest
 * lead time, lowest risk — each with its cost and its longest wait as bars on one scale and where the lines come
 * from as a strip. The reasoning is behind the ⓘ. Choosing one re-orders the sources of every line; a single line
 * can still be given a source by hand.
 */
export function SourcingChoice({ sourcing, revisionId, unit, canEdit }: { sourcing: Build["sourcing"]; revisionId: string; unit: (v: number | null | undefined) => string; canEdit: boolean }) {
  if (!sourcing.lines) return null;
  const base = sourcing.strategies.find((s) => s.key === "order")!;
  const maxCost = Math.max(0.01, ...sourcing.strategies.map((s) => s.perBoard));
  const minCost = Math.min(...sourcing.strategies.map((s) => s.perBoard));
  const maxWait = Math.max(1, ...sourcing.strategies.map((s) => s.leadWeeks));
  const minWait = Math.min(...sourcing.strategies.map((s) => s.leadWeeks));
  return (
    <section aria-labelledby="sourcing-choice" className="mb-6 overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-3">
        <h3 id="sourcing-choice" className="text-base font-semibold">How to source</h3>
        <Info label="About the four ways to source">
          <p>The four figures are worked out the same way from today&apos;s stock and landed prices, so they compare fairly; left-overs from minimum order quantities are not in them.</p>
          <p>Once you choose, the quote is recalculated in full on every step. Choosing for the whole BoM clears sources chosen by hand.</p>
          <p className="text-xs text-muted-foreground">Risk here is the risk of the source — our shelf, authorised with a certificate, partner stock, broker. The risk of each part itself is on its line below.</p>
        </Info>
        <span className="ml-auto text-xs text-muted-foreground">
          {sourcing.lines} lines · {sourcing.qty.toLocaleString("en-IN")} pcs · now <span className="num font-medium text-foreground">{unit(sourcing.perBoardNow)}</span> a board
          {sourcing.pinned ? ` · ${sourcing.pinned} by hand` : ""}
        </span>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        {sourcing.strategies.map((s) => {
          const Icon = ICON[s.key];
          const active = sourcing.active === s.key;
          const diff = s.perBoard - base.perBoard;
          const total = Math.max(1, s.mix.ours + s.mix.authorised + s.mix.open + s.mix.broker);
          const notes = [s.split ? `${s.split} line${s.split === 1 ? "" : "s"} from two or more sources` : null, s.short ? `${s.short} short everywhere` : null].filter(Boolean);
          const mix = BAND.filter((b) => s.mix[b.key]).map((b) => `${s.mix[b.key]} ${b.label}`).join(" · ") || "no lines sourced";
          return (
            <div key={s.key} className={cn("relative flex flex-col bg-card px-4 py-3.5", active && "bg-part-soft")}>
              <div className="flex items-center gap-2 pr-6">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold">{s.label}</h3>
              </div>
              <Info label={`About: ${s.label}`} align="end" className="absolute top-2 right-2 size-6">
                <p>{s.picks}</p>
                <p className="text-xs text-muted-foreground">{mix}</p>
                {notes.map((n) => <p key={n} className="text-xs text-muted-foreground">{n}</p>)}
                {s.slowest ? <p className="text-xs text-muted-foreground">Longest wait: {s.slowest.label} from {s.slowest.source}.</p> : null}
              </Info>
              <dl className="mt-3 space-y-3">
                <div>
                  <dt className="sr-only">Components a board</dt>
                  <dd className="flex items-baseline justify-between gap-2">
                    <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{unit(s.perBoard)}</span>
                    <span className={cn("truncate text-xs", s.key === "order" || Math.abs(diff) < 0.005 ? "text-muted-foreground" : diff < 0 ? "font-medium text-risk-green" : "text-risk-red")}>
                      {s.key === "order" ? "a board" : Math.abs(diff) < 0.005 ? "same" : `${diff < 0 ? "−" : "+"}${unit(Math.abs(diff))}`}
                    </span>
                  </dd>
                  <dd><Scale share={s.perBoard / maxCost} best={s.perBoard <= minCost + 0.005} label={`Components ${unit(s.perBoard)} a board`} /></dd>
                </div>
                <div>
                  <dt className="sr-only">Longest wait</dt>
                  <dd className="flex items-baseline justify-between gap-2">
                    <span className="text-lg leading-none font-semibold tracking-tight tabular-nums">{weeks(s.leadWeeks)}</span>
                    <span className="text-xs text-muted-foreground">longest wait</span>
                  </dd>
                  <dd><Scale share={s.leadWeeks / maxWait} best={s.leadWeeks <= minWait} label={`Longest wait ${weeks(s.leadWeeks)}`} /></dd>
                </div>
              </dl>
              <div className="mt-3 flex h-2 overflow-hidden rounded-sm bg-muted" role="img" aria-label={`Where the lines come from: ${mix}`} title={mix}>
                {BAND.map((b) => (s.mix[b.key] ? <span key={b.key} className={b.bar} style={{ width: `${(s.mix[b.key] / total) * 100}%` }} /> : null))}
              </div>
              <div className="mt-3 flex flex-1 items-end justify-end">
                {canEdit ? <ChooseButton act={{ kind: "strategy", revisionId, key: s.key }} chosen={active} label={s.key === "order" ? "Use our order" : `Use ${s.label.toLowerCase()}`} chosenLabel="In use" /> : active ? <span className="rounded-md bg-part-soft px-2 py-1 text-xs font-medium">In use</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground" aria-label="Where lines come from">
        {BAND.map((b) => (
          <li key={b.key} className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-[3px]", b.bar)} aria-hidden /> {b.label}</li>
        ))}
      </ul>
    </section>
  );
}
