"use client";

import { useEffect, useRef } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronLeft, LoaderCircle } from "lucide-react";
import { MORE, WORKFLOW, locate, stepState, type SectionKey, type StepState } from "@/lib/bom/workflow";
import { cn } from "@/lib/utils";

const DOT: Record<NonNullable<StepState>["state"], string> = {
  done: "bg-risk-green",
  attention: "bg-[var(--brand-accent)]",
  todo: "bg-muted-foreground/35",
};

/** A spinner on the link you just clicked, until its page arrives. */
function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle className="ml-auto size-3.5 shrink-0 animate-spin" aria-hidden /> : null;
}

function useWhere(id: string) {
  const pathname = usePathname();
  const base = `/boms/${id}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  return { base, ...locate(rest) };
}

/**
 * The steps of one BoM down the left side, the same on every one of its pages: BoM · Gerber · Footprint & mismatch ·
 * Components · Line possible · Bare board · Estimate & quote, numbered and joined by a rail, each with a mark for how
 * far it has got. On a narrow screen the same list runs across the top and scrolls sideways.
 */
export function BomStepRail({ id, name, states }: { id: string; name: string; states: Record<SectionKey, StepState> }) {
  const { base, step } = useWhere(id);
  const active = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [step?.key]);

  return (
    <nav aria-label={`Process for ${name}`} className="mb-6 min-w-0 print:hidden lg:sticky lg:top-28 lg:mb-0 lg:self-start">
      <ol className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5 [scrollbar-width:none] lg:flex-col lg:gap-0 lg:overflow-visible lg:p-2">
        {WORKFLOW.map((s, i) => {
          const on = step?.key === s.key;
          const st = stepState(s, states);
          const last = i === WORKFLOW.length - 1;
          return (
            <li key={s.key} className="relative shrink-0">
              {!last ? <span aria-hidden className="absolute top-10 bottom-0 left-[1.4rem] hidden w-px bg-border lg:block" /> : null}
              <Link
                ref={on ? active : undefined}
                href={`${base}${s.path}`}
                aria-current={on ? "step" : undefined}
                title={st?.note}
                className={cn(
                  "relative flex h-11 items-center gap-2.5 rounded-md px-2 text-sm whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring lg:my-0.5 lg:h-12",
                  on ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative z-10 grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold",
                    on ? "bg-primary-foreground/20 text-primary-foreground" : st?.state === "done" ? "bg-risk-green-soft text-risk-green" : "border bg-card text-muted-foreground",
                  )}
                >
                  {st?.state === "done" && !on ? <Check className="size-3.5" aria-hidden /> : s.n}
                  {st && st.state !== "done" ? <span aria-hidden className={cn("absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-card", DOT[st.state])} /> : null}
                </span>
                <span className="min-w-0 truncate">{s.label}</span>
                {st ? <span className="sr-only">: {st.note}</span> : null}
                <Pending />
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Above the page: back to all BoMs, this BoM's name, and its views — Analysis, Supply chain, 3D view. */
export function BomTopBar({ id, name }: { id: string; name: string }) {
  const { base, view } = useWhere(id);
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 print:hidden">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Link href="/boms" className="inline-flex shrink-0 items-center gap-1 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronLeft className="size-4" aria-hidden />
          All BoMs
        </Link>
        <span aria-hidden className="text-muted-foreground/50">/</span>
        <span className="truncate font-semibold" title={name}>
          {name}
        </span>
      </div>
      <nav aria-label="Views" className="inline-flex rounded-lg border bg-card p-1">
        {MORE.map((v) => {
          const on = view?.key === v.key;
          return (
            <Link
              key={v.key}
              href={`${base}${v.path}`}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {v.label}
              <Pending />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
