"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { WORKFLOW, locate, neighbours } from "@/lib/bom/workflow";

/** Back and Next at the foot of every step, so a BoM is taken through its process one step at a time. */
export function WorkflowFooter({ id, matchBlocked = false }: { id: string; /** The footprints do not match: going on from step 4 is possible, but not the main action. */ matchBlocked?: boolean }) {
  const pathname = usePathname();
  const base = `/boms/${id}`;
  const { step } = locate(pathname.startsWith(base) ? pathname.slice(base.length) : "");
  if (!step) return null;
  const { prev, next } = neighbours(step);
  const held = matchBlocked && step.key === "footprint";
  const link = "inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <nav aria-label="Process steps" className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-5 print:hidden">
      {prev ? (
        <Link href={`${base}${prev.path}`} className={`${link} border bg-card hover:bg-part-soft`}>
          <ArrowLeft className="size-4" aria-hidden /> {prev.n}. {prev.label}
        </Link>
      ) : (
        <span />
      )}
      <span className="order-first w-full text-center text-xs text-muted-foreground sm:order-none sm:w-auto">
        Step {step.n} of {WORKFLOW.length}
      </span>
      {next && held ? (
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-risk-red">Fix the footprints first</span>
          <Link href={`${base}${next.path}`} className={`${link} border bg-card hover:bg-muted`}>
            Continue anyway: {next.n}. {next.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </span>
      ) : next ? (
        <Link href={`${base}${next.path}`} className={`${link} bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80`}>
          Next: {next.n}. {next.label}
          {next.optional ? " (optional)" : ""} <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className="text-sm text-muted-foreground">Last step</span>
      )}
    </nav>
  );
}
