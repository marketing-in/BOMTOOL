import { cn } from "@/lib/utils";

export type RingPart = { key: string; value: number; color: string; opacity?: number };

/**
 * A ring split into coloured parts with one figure in the middle (Phase 25). Plain SVG, drawn on the server; the
 * label says in words what the colours show, so nothing depends on seeing them.
 */
export function Ring({ parts, center, sub, label, className }: { parts: RingPart[]; center: string; sub?: string; label: string; className?: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  let at = 0;
  return (
    <svg viewBox="0 0 140 140" className={cn("size-32 shrink-0", className)} role="img" aria-label={label}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="14" />
      {total > 0
        ? parts
            .filter((p) => p.value > 0)
            .map((p) => {
              const len = (p.value / total) * c;
              // A hair of gap between parts, so two colours never touch.
              const el = <circle key={p.key} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="14" strokeDasharray={`${Math.max(0.5, len - 1.5)} ${c - Math.max(0.5, len - 1.5)}`} strokeDashoffset={-at} transform="rotate(-90 70 70)" opacity={p.opacity ?? 1} />;
              at += len;
              return el;
            })
        : null}
      <text x="70" y={sub ? 68 : 78} textAnchor="middle" className="fill-foreground text-[26px] font-bold">{center}</text>
      {sub ? <text x="70" y="86" textAnchor="middle" className="fill-muted-foreground text-[10px]">{sub}</text> : null}
    </svg>
  );
}
