import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PackageOpen } from "lucide-react";
import { Info } from "@/components/viz/info";

/** A description short enough to read at a glance stays under the title; anything longer waits behind the ⓘ. */
const SHORT = 80;

/**
 * `level={2}`: the header of one section of a page that holds several (a BoM step's sections). The title carries the
 * page; a long `description` (or one that is not plain text) opens from the ⓘ beside it, so pages lead with their
 * content and not with paragraphs.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
  level = 1,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  const inline = typeof description === "string" && description.length <= SHORT;
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-5", level === 1 ? "mb-8" : "mb-6", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Heading className={cn("page-heading leading-tight font-semibold tracking-tight", level === 1 ? "" : "text-2xl")}>{title}</Heading>
          {description && !inline ? (
            <Info label={typeof title === "string" ? `About ${title}` : "About this page"} className="mt-1">
              <div className="text-muted-foreground">{description}</div>
            </Info>
          ) : null}
        </div>
        {eyebrow ? <div className="mt-2 text-xs text-muted-foreground">{eyebrow}</div> : null}
        {inline ? <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type StatTone = "plain" | "green" | "amber" | "red";
const STAT_TONE: Record<StatTone, { chip: string; value: string }> = {
  plain: { chip: "bg-primary/10 text-primary", value: "" },
  green: { chip: "bg-risk-green-soft text-risk-green", value: "text-risk-green" },
  amber: { chip: "bg-risk-amber-soft text-risk-amber", value: "text-risk-amber" },
  red: { chip: "bg-risk-red-soft text-risk-red", value: "text-risk-red" },
};

/**
 * One figure as a tile (redrawn in Phase 28 to match `Kpi`): an icon, the figure, what it is, and the small print
 * under it. `tone` colours the figure when it is a warning.
 */
export function Stat({ label, value, hint, icon: Icon, tone = "plain" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: StatTone }) {
  const t = STAT_TONE[tone];
  return (
    <div className="relative min-w-0 rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      </div>
      <div className={cn("num text-[1.75rem] leading-tight font-semibold tracking-tight", t.value)}>{value}</div>
      {hint ? <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/**
 * A section's heading on a page: the title, the ⓘ that holds what a reader may want explained, and whatever sits on
 * the right (a count, a filter, an action). Explanations live behind the ⓘ, not in paragraphs under the heading.
 */
export function SectionHeading({ id, title, info, children, className }: { id?: string; title: React.ReactNode; info?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {info ? (
          <Info label={typeof title === "string" ? `About ${title}` : "About this section"}>
            <div className="text-muted-foreground">{info}</div>
          </Info>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <PackageOpen className="mx-auto mb-4 size-10 text-muted-foreground" strokeWidth={1.25} aria-hidden />
      <div className="text-base font-medium">{title}</div>
      {children ? <div className="mx-auto mt-1 max-w-[50ch] text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}
