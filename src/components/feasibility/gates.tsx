import Link from "next/link";
import { ArrowRight, ChevronDown, CircleDot, Lock } from "lucide-react";
import type { GateState, Level } from "@/lib/feasibility/gates";
import { cn } from "@/lib/utils";
import { GateSign } from "./gate-sign";
import { when } from "./format";

const TONE: Record<Level, { text: string; dot: string }> = {
  green: { text: "text-risk-green", dot: "bg-risk-green" },
  amber: { text: "text-risk-amber", dot: "bg-risk-amber" },
  red: { text: "text-risk-red", dot: "bg-risk-red" },
};
const LEVEL_WORD: Record<Level, string> = { green: "OK", amber: "Watch", red: "Blocker" };

/**
 * The nine gates as one row (Phase 25): a numbered circle each — a lock when signed, filled when it is the one to
 * sign now, hollow while it waits — joined by a line that turns green as far as the review has got.
 */
export function GateStepper({ gates }: { gates: GateState[] }) {
  return (
    <ol className="flex rounded-lg border bg-card px-2 py-4 sm:px-4" aria-label="The nine gates, in order">
      {gates.map((g, i) => {
        const signed = g.status === "signed";
        const open = g.status === "open";
        return (
          <li
            key={g.key}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center",
              i > 0 && "before:absolute before:top-[17px] before:right-[calc(50%+18px)] before:left-[calc(-50%+18px)] before:h-0.5",
              i > 0 && (signed || open ? "before:bg-risk-green" : "before:bg-border"),
            )}
          >
            <a
              href={`#gate-${g.key}`}
              aria-label={`Gate ${g.n}, ${g.title}: ${signed ? "signed" : open ? `open, ${LEVEL_WORD[g.level].toLowerCase()}` : `waiting, ${LEVEL_WORD[g.level].toLowerCase()}`}`}
              aria-current={open ? "step" : undefined}
              className="group flex max-w-full flex-col items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "relative grid size-9 place-items-center rounded-full border-2 text-sm font-semibold transition-transform duration-150 group-hover:scale-105",
                  signed ? "border-risk-green bg-risk-green text-white" : open ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px] shadow-primary/20" : "border-border bg-card text-muted-foreground",
                )}
              >
                {signed ? <Lock className="size-4" aria-hidden /> : g.n}
                {!signed && g.level !== "green" ? <span className={cn("absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card", TONE[g.level].dot)} aria-hidden /> : null}
              </span>
              <span className={cn("hidden max-w-full px-1 text-center text-[11px] leading-tight sm:block", open ? "font-semibold text-foreground" : "text-muted-foreground")}>{g.title}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** One gate: a slim row that opens to its checks; the open gate shows them and the sign button straight away. */
export function Gate({ g, revisionId, qty, canSign, canWaive }: { g: GateState; revisionId: string; qty: number; canSign: boolean; canWaive: boolean }) {
  const tone = TONE[g.level];
  const s = g.signoff;
  // A signed gate shows what was signed, not what the product looks like today.
  const rows = s ? s.record.map((r, i) => ({ key: `${i}`, ...r, fix: undefined as { href: string; label: string } | undefined })) : g.checks;
  const reds = g.checks.filter((c) => c.level === "red");
  return (
    <li id={`gate-${g.key}`} className="scroll-mt-24">
      <details open={g.status === "open"} className={cn("group rounded-lg border bg-card", g.status === "open" && "border-primary/50 shadow-sm", g.status === "waiting" && "opacity-75")}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2 outline-none select-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-medium",
              g.status === "signed" ? "border-risk-green bg-risk-green text-white" : g.status === "open" ? "border-primary bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {g.status === "signed" ? <Lock className="size-3.5" aria-hidden /> : g.n}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {s ? (
              <>
                Signed · {s.byName}
                {g.changed ? <span className="ml-1 text-risk-amber">· product changed since</span> : null}
              </>
            ) : g.status === "open" ? (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <CircleDot className="size-3 text-primary" aria-hidden /> Check and sign
              </span>
            ) : (
              "Waiting"
            )}
          </span>
          {!s ? (
            <span className={cn("inline-flex w-16 shrink-0 items-center gap-1.5 text-xs", tone.text)}>
              <span className={cn("size-2 rounded-full", tone.dot)} aria-hidden />
              {LEVEL_WORD[g.level]}
            </span>
          ) : null}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t px-3 py-3 sm:pl-[3.25rem]">
          <p className="mb-2 text-xs text-muted-foreground">
            {g.what}
            {s ? ` · signed ${when(s.at)} · locked${s.waived.length ? ` · ${s.waived.length} waived` : ""}` : g.status === "waiting" ? " · opens when the gates before it are signed" : ""}
          </p>
          <ul className="space-y-2">
            {rows.map((c) => (
              <li key={c.key} className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-2.5 text-sm">
                <span className={cn("mt-1.5 size-2 rounded-full", TONE[c.level].dot)} aria-label={LEVEL_WORD[c.level]} />
                <span className="min-w-0">
                  <span className="font-medium">{c.label}</span> <span className="text-muted-foreground">— {c.detail}</span>
                  {c.fix && c.level !== "green" ? (
                    <Link href={c.fix.href} className="ml-2 inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
                      {c.fix.label} <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {s ? (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {s.note ? <p>Note: <span className="text-foreground">{s.note}</span></p> : null}
              {s.waived.map((w) => (
                <p key={w.check}>Waived “{w.label}”: <span className="text-foreground">{w.reason}</span></p>
              ))}
            </div>
          ) : g.status === "open" ? (
            <div className="mt-4 border-t pt-3">
              <GateSign revisionId={revisionId} qty={qty} gate={g.key} title={g.title} n={g.n} reds={reds.map((c) => ({ key: c.key, label: c.label }))} ambers={g.checks.filter((c) => c.level === "amber").length} canSign={canSign} canWaive={canWaive} />
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}
