import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Info } from "./info";

type Tone = "green" | "amber" | "red" | "plain";

const TONE: Record<Tone, { chip: string; value: string }> = {
  plain: { chip: "bg-primary/10 text-primary", value: "" },
  green: { chip: "bg-risk-green-soft text-risk-green", value: "text-risk-green" },
  amber: { chip: "bg-risk-amber-soft text-risk-amber", value: "text-risk-amber" },
  red: { chip: "bg-risk-red-soft text-risk-red", value: "text-risk-red" },
};

/**
 * One figure as a tile (Phase 25): an icon, the number, a label of a few words. The small print goes behind the ⓘ
 * in the corner, so the number keeps the width.
 */
export function Kpi({ icon: Icon, label, value, unit, tone = "plain", note, info, className }: { icon: LucideIcon; label: string; value: React.ReactNode; unit?: string; tone?: Tone; /** A few words under the label that carry the tile's colour (e.g. "6 under 24 h"). */ note?: React.ReactNode; info?: React.ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <div className={cn("relative min-w-0 rounded-xl border bg-card p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <div className={cn("num text-[1.75rem] leading-tight font-semibold tracking-tight", t.value)}>
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span> : null}
      </div>
      {note ? <div className={cn("mt-2 text-xs font-medium", t.value)}>{note}</div> : null}
      {info ? <Info label={`About: ${label}`} align="end" className="absolute right-2 bottom-2 size-6">{info}</Info> : null}
    </div>
  );
}
