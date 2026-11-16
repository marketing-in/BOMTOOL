import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A folded section (Phase 25): the bar shows an icon, the title, the section's headline figure and, where there is
 * one, a small chart; the tables and the small print open on a tap. Nothing is hidden for good — only out of the way.
 */
export function Fold({
  id,
  icon: Icon,
  title,
  figure,
  note,
  visual,
  open,
  children,
  className,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  /** The one number that sums the section up. */
  figure?: React.ReactNode;
  /** A few words beside the figure. */
  note?: React.ReactNode;
  /** A small chart shown in the bar on wide screens. */
  visual?: React.ReactNode;
  open?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details id={id} open={open} className={cn("group scroll-mt-24 rounded-lg border bg-card", className)}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-2.5 outline-none select-none transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          {note ? <span className="block truncate text-xs text-muted-foreground">{note}</span> : null}
        </span>
        {visual ? <span className="hidden w-40 shrink-0 md:block lg:w-56">{visual}</span> : null}
        {figure ? <span className="num shrink-0 text-right text-base font-semibold">{figure}</span> : null}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t">{children}</div>
    </details>
  );
}
