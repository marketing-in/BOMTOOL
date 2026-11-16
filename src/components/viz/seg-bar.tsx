import { cn } from "@/lib/utils";

export type Seg = { key: string; label: string; value: number; color: string; text?: string };

/**
 * One stacked bar and its legend (Phase 25): the parts of a whole, each with its value in words beside its colour.
 */
export function SegBar({ segs, label, className, thick, legend = true }: { segs: Seg[]; label: string; className?: string; thick?: boolean; legend?: boolean }) {
  const shown = segs.filter((s) => s.value > 0);
  // Shares, not raw values: a bar of milligrams must fill its track like a bar of rupees does.
  const total = shown.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <figure className={className}>
      <div className={cn("flex gap-[2px] overflow-hidden rounded-full", thick ? "h-4" : "h-2.5")} role="img" aria-label={`${label}: ${shown.map((s) => `${s.label} ${s.text ?? s.value}`).join(", ")}`}>
        {shown.map((s) => (
          <span key={s.key} title={`${s.label}: ${s.text ?? s.value}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ flexGrow: (s.value / total) * 100, flexBasis: 0, minWidth: 3, background: s.color }} />
        ))}
        {!shown.length ? <span className="h-full flex-1 bg-muted" /> : null}
      </div>
      {legend && shown.length ? (
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {shown.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="num font-medium">{s.text ?? s.value.toLocaleString("en-IN")}</span>
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}
