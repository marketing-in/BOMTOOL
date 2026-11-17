"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import { MORE, WORKFLOW, locate, stepState, type SectionKey, type StepState } from "@/lib/bom/workflow";
import { cn } from "@/lib/utils";

const DOT: Record<NonNullable<StepState>["state"], string> = {
  done: "bg-risk-green",
  attention: "bg-[var(--brand-accent)]",
  todo: "bg-muted-foreground/35",
};

/**
 * The menu of one BoM, the same on every one of its pages: a bordered workspace strip with where you are, then the five
 * steps in order — BoM, Gerbers & components · compare & mismatches · estimate & quote · box (optional) · route & SMT
 * line — numbered, each with a dot for how far it has got, and the other views after a divider. Scrolls sideways on a
 * narrow screen, keeping the current step in view.
 */
export function BomSectionNav({ id, name, states }: { id: string; name: string; states: Record<SectionKey, StepState> }) {
  const pathname = usePathname();
  const base = `/boms/${id}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const { step, view } = locate(rest);
  const active = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [step?.key, view?.key]);

  const tab = (on: boolean) =>
    cn(
      "inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
      on ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="mb-8 min-w-0 overflow-hidden rounded-xl border bg-card print:hidden">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b px-4 py-3 text-sm">
        <Link href="/boms" className="inline-flex shrink-0 items-center gap-1 rounded-sm text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronLeft className="size-4" aria-hidden />
          All BoMs
        </Link>
        <span aria-hidden className="text-muted-foreground/50">/</span>
        <span className="truncate text-sm font-semibold" title={name}>{name}</span>
      </div>
      <nav aria-label={`Process for ${name}`} className="overflow-x-auto p-2">
        <ol className="flex w-max items-center gap-1">
          {WORKFLOW.map((s) => {
            const on = step?.key === s.key;
            const st = stepState(s, states);
            return (
              <li key={s.key}>
                <Link ref={on ? active : undefined} href={`${base}${s.path}`} aria-current={on ? "step" : undefined} title={st?.note} className={tab(on)}>
                  <span
                    className={cn(
                      "relative grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
                      on ? "bg-primary-foreground/20 text-primary-foreground" : st?.state === "done" ? "bg-risk-green-soft text-risk-green" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {st?.state === "done" && !on ? <Check className="size-3.5" aria-hidden /> : s.n}
                    {st && st.state !== "done" ? <span aria-hidden className={cn("absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-card", DOT[st.state])} /> : null}
                  </span>
                  {s.label}
                  {s.optional ? <span className={cn("text-xs font-normal", on ? "text-primary-foreground/75" : "text-muted-foreground/80")}>optional</span> : null}
                  {st ? <span className="sr-only">: {st.note}</span> : null}
                </Link>
              </li>
            );
          })}
          <li aria-hidden className="mx-2 h-6 w-px bg-border" />
          {MORE.map((v) => {
            const on = view?.key === v.key;
            return (
              <li key={v.key}>
                <Link ref={on ? active : undefined} href={`${base}${v.path}`} aria-current={on ? "page" : undefined} className={cn(tab(on), "text-[13px]")}>
                  {v.label}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
