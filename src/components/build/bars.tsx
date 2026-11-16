import { cn } from "@/lib/utils";

/**
 * Horizontal bars for comparing one number across options (price per board by fab or box). Plain HTML: each bar
 * carries its value as text, so nothing depends on colour or hover.
 */
export function CompareBars({
  rows,
  format,
  caption,
}: {
  rows: { key: string; label: string; value: number | null; note?: string; tone?: "chosen" | "fits" | "muted" }[];
  format: (v: number) => string;
  caption: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,12rem)_1fr] items-center gap-3 text-xs sm:grid-cols-[minmax(0,16rem)_1fr]">
            <span className={cn("truncate", r.tone === "muted" && "text-muted-foreground")} title={r.label}>
              {r.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="relative h-3 flex-1 overflow-hidden rounded-sm bg-muted/60">
                {r.value !== null ? (
                  <span
                    className={cn("absolute inset-y-0 left-0 rounded-sm", r.tone === "chosen" ? "bg-primary" : r.tone === "muted" ? "bg-muted-foreground/30" : "bg-primary/45")}
                    style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
                  />
                ) : null}
              </span>
              <span className="num w-24 shrink-0 text-right">{r.value === null ? "—" : format(r.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
