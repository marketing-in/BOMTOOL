import Link from "next/link";
import { cn } from "@/lib/utils";

/** Segmented links between the views of one directory tab (?view=…). */
export function ViewTabs({ base, views, active }: { base: string; views: { key: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav aria-label="View" className="mb-5 inline-flex flex-wrap rounded-md border bg-muted p-0.5">
      {views.map((v, i) => (
        <Link
          key={v.key}
          href={i === 0 ? base : `${base}?view=${v.key}`}
          aria-current={active === v.key ? "page" : undefined}
          className={cn("rounded-[5px] px-3 py-1.5 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring", active === v.key ? "bg-card font-medium ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}
        >
          {v.label}
          {v.count !== undefined ? <span className="num ml-1.5 text-xs text-muted-foreground">{v.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
