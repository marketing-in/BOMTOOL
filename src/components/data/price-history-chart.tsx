"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, type Currency } from "@/lib/currency";

export type PriceSeries = { supplier: string; points: { t: number; price: number }[] };

// Distinct, colour-blind-safe-ish hues that read in light and dark.
const COLORS = ["oklch(0.6 0.15 255)", "oklch(0.65 0.15 155)", "oklch(0.7 0.15 75)", "oklch(0.6 0.18 330)", "oklch(0.6 0.12 200)", "oklch(0.55 0.02 250)"];

export function PriceHistoryChart({ series, currency }: { series: PriceSeries[]; currency: Currency }) {
  const top = series.slice(0, 6);
  const times = [...new Set(top.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b);
  const data = times.map((t) => {
    const row: Record<string, number> = { t };
    for (const s of top) {
      const p = s.points.find((x) => x.t === t);
      if (p) row[s.supplier] = p.price;
    }
    return row;
  });
  if (!data.length) return <p className="text-sm text-muted-foreground">No price history yet.</p>;
  const day = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={day} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
          <YAxis width={64} tickFormatter={(v: number) => formatMoney(v, currency, { unit: true })} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" domain={["auto", "auto"]} />
          <Tooltip
            labelFormatter={(t) => day(Number(t))}
            formatter={(v) => formatMoney(Number(v), currency, { unit: true })}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
          {top.map((s, i) => (
            <Line key={s.supplier} dataKey={s.supplier} stroke={COLORS[i % COLORS.length]} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
