import { GROUP_LABEL, type CostGroup, type QtyQuote } from "@/lib/costing/quote";

const ORDER: CostGroup[] = ["board", "components", "box", "assembly", "test", "finish", "handling", "margin"];

/**
 * What makes up the price of one board, at each quoted quantity: one stacked bar per quantity on a shared scale,
 * the groups in a fixed order and colour, each segment titled with its value. The legend carries the values at the
 * first quantity; the table below the chart carries all of them.
 */
export function CostStack({ quotes, format }: { quotes: QtyQuote[]; format: (inr: number) => string }) {
  const max = Math.max(1, ...quotes.map((q) => q.unitPrice));
  const groups = ORDER.filter((g) => quotes.some((q) => q.byGroup[g] > 0));
  const first = quotes[0];
  return (
    <figure>
      <ul className="space-y-3">
        {quotes.map((q) => (
          <li key={q.qty} className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-3 text-sm">
            <span className="num text-xs text-muted-foreground">{q.qty.toLocaleString("en-IN")} pcs</span>
            <span className="flex h-6 gap-[2px] overflow-hidden" style={{ width: `${(q.unitPrice / max) * 100}%` }} role="img" aria-label={`${q.qty} pcs: ${groups.map((g) => `${GROUP_LABEL[g]} ${format(q.byGroup[g])}`).join(", ")}`}>
              {groups.map((g) =>
                q.byGroup[g] > 0 ? (
                  <span
                    key={g}
                    title={`${GROUP_LABEL[g]}: ${format(q.byGroup[g])} (${Math.round((q.byGroup[g] / q.unitPrice) * 100)} %)`}
                    className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                    style={{ flexGrow: q.byGroup[g], flexBasis: 0, background: `var(--cost-${ORDER.indexOf(g) + 1})`, minWidth: 2 }}
                  />
                ) : null,
              )}
            </span>
            <span className="num text-right font-medium">{format(q.unitPrice)}</span>
          </li>
        ))}
      </ul>
      {first ? (
        <figcaption className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          {groups.map((g) => (
            <span key={g} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: `var(--cost-${ORDER.indexOf(g) + 1})` }} aria-hidden />
              <span>{GROUP_LABEL[g]}</span>
              <span className="num text-muted-foreground">{format(first.byGroup[g])} · {Math.round((first.byGroup[g] / first.unitPrice) * 100)} %</span>
            </span>
          ))}
          <span className="text-muted-foreground">(per board at {first.qty.toLocaleString("en-IN")} pcs)</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
