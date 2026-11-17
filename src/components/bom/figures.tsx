import { cn } from "@/lib/utils";

export type Figure = {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: "green" | "amber" | "red";
  /** The small print, shown on hover. */
  title?: string;
  /** A few words after the label, in the figure's colour. */
  note?: React.ReactNode;
};

const TONE = { green: "text-risk-green", amber: "text-risk-amber", red: "text-risk-red" } as const;

/** A section's biggest figures in one row, without boxes: the number, and under it what it is. */
export function Figures({ items, className, label }: { items: (Figure | null | false | undefined)[]; className?: string; label?: string }) {
  const shown = items.filter((f): f is Figure => !!f);
  if (!shown.length) return null;
  return (
    <dl aria-label={label} className={cn("flex flex-wrap gap-x-10 gap-y-5", className)}>
      {shown.map((f) => (
        <div key={f.label} title={f.title} className="min-w-0">
          <dd className={cn("text-3xl leading-none font-semibold tracking-tight tabular-nums", f.tone && TONE[f.tone])}>
            {f.value}
            {f.unit ? <span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">{f.unit}</span> : null}
          </dd>
          <dt className="mt-1.5 text-xs text-muted-foreground">
            {f.label}
            {f.note ? <span className={cn("ml-1.5 font-medium", f.tone ? TONE[f.tone] : "text-foreground")}>{f.note}</span> : null}
          </dt>
        </div>
      ))}
    </dl>
  );
}

/** The class of a quiet fold's summary line: a label that opens secondary detail. */
export const FOLD_SUMMARY =
  "flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold outline-none select-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden";
