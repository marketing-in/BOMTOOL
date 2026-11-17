import Link from "next/link";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { SORT, SORT_KEYS, type Dir, type SortKey } from "@/lib/costing/rank";
import { cn } from "@/lib/utils";

const seg = "inline-flex h-8 items-center gap-1 rounded px-2.5 text-xs whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring";
const on = "bg-primary font-semibold text-primary-foreground";
const off = "text-muted-foreground hover:bg-muted hover:text-foreground";

/**
 * Order what is shown — the BoM's lines and each line's sources — by lead time, price, risk or stock, low to high
 * or high to low. The choice lives in the address, so it holds from line to line and in a shared link.
 */
export function OrderBy({ label, sort, dir, href, first = SORT.order.label }: { label: string; sort: SortKey; dir: Dir; href: (o: { sort: SortKey; dir?: Dir }) => string; first?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div role="group" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-md border bg-card p-0.5">
        {SORT_KEYS.map((k) => (
          <Link key={k} href={href({ sort: k })} scroll={false} aria-current={sort === k ? "true" : undefined} className={cn(seg, sort === k ? on : off)}>
            {k === "order" ? first : SORT[k].label}
          </Link>
        ))}
      </div>
      {sort !== "order" ? (
        <div role="group" aria-label="Direction" className="inline-flex gap-0.5 rounded-md border bg-card p-0.5">
          {(["asc", "desc"] as const).map((d) => {
            const Icon = d === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;
            return (
              <Link key={d} href={href({ sort, dir: d })} scroll={false} aria-current={dir === d ? "true" : undefined} title={`${SORT[sort].label}, ${SORT[sort][d]}`} className={cn(seg, dir === d ? on : off)}>
                <Icon className="size-3.5" aria-hidden />
                {d === "asc" ? "Low to high" : "High to low"}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
