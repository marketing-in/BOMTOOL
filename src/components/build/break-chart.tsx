/**
 * Price breaks of each distributor offer as step lines on a log quantity axis, with this build's need marked.
 * The offer that is cheapest at the need is drawn in the accent and every line is named at its right end, so the
 * chart reads without a colour legend. The table beside it carries the same numbers.
 */
export function BreakChart({
  series,
  need,
  format,
}: {
  series: { key: string; label: string; breaks: { qty: number; price: number }[] }[];
  need: number;
  format: (v: number) => string;
}) {
  const valid = series.filter((s) => s.breaks.length);
  if (!valid.length) return <p className="text-sm text-muted-foreground">No distributor price breaks yet.</p>;
  const W = 520;
  const H = 200;
  const L = 56;
  const R = 150;
  const T = 12;
  const B = 28;
  const maxQ = Math.max(need * 2, ...valid.flatMap((s) => s.breaks.map((b) => b.qty)), 10);
  const lx = (q: number) => L + (Math.log10(Math.max(1, q)) / Math.log10(maxQ)) * (W - L - R);
  const prices = valid.flatMap((s) => s.breaks.map((b) => b.price));
  const top = Math.max(...prices) * 1.08;
  const y = (p: number) => T + (1 - p / top) * (H - T - B);
  const at = (s: (typeof valid)[number], q: number) => [...s.breaks].sort((a, b) => a.qty - b.qty).filter((b) => b.qty <= q).at(-1)?.price ?? s.breaks[0].price;
  const best = [...valid].sort((a, b) => at(a, need) - at(b, need))[0];
  const ticks = [1, 10, 100, 1000, 10000, 100000].filter((t) => t <= maxQ);
  // End labels must not sit on each other: keep 11 px between them, top to bottom.
  const ends = valid.map((s) => ({ key: s.key, y: y([...s.breaks].sort((a, b) => a.qty - b.qty).at(-1)!.price) + 3 })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 11);
  const labelY = new Map(ends.map((e) => [e.key, e.y]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Unit price by order quantity; ${best.label} is cheapest at ${need.toLocaleString("en-IN")} pcs`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} className="stroke-border" strokeWidth={0.6} />
          <text x={L - 6} y={y(top * f) + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 9 }}>
            {format(top * f)}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} x={lx(t)} y={H - 10} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>
          {t >= 1000 ? `${t / 1000}k` : t}
        </text>
      ))}
      <line x1={lx(need)} x2={lx(need)} y1={T} y2={H - B} className="stroke-foreground/50" strokeDasharray="3 3" strokeWidth={1} />
      <text x={lx(need) + 4} y={T + 8} className="fill-foreground" style={{ fontSize: 9 }}>
        need {need.toLocaleString("en-IN")}
      </text>
      {valid.map((s) => {
        const sorted = [...s.breaks].sort((a, b) => a.qty - b.qty);
        const pts: string[] = [];
        sorted.forEach((b, i) => {
          const x0 = lx(b.qty);
          const x1 = i + 1 < sorted.length ? lx(sorted[i + 1].qty) : W - R;
          pts.push(`${x0},${y(b.price)}`, `${x1},${y(b.price)}`);
        });
        const isBest = s.key === best.key;
        return (
          <g key={s.key}>
            <polyline points={pts.join(" ")} fill="none" className={isBest ? "stroke-primary" : "stroke-muted-foreground/60"} strokeWidth={isBest ? 2 : 1.25} />
            <text x={W - R + 6} y={labelY.get(s.key)} className={isBest ? "fill-foreground" : "fill-muted-foreground"} style={{ fontSize: 9, fontWeight: isBest ? 600 : 400 }}>
              {s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
