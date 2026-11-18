import type { Currency } from "@/lib/currency";
import type { Build } from "@/server/build";
import { cn } from "@/lib/utils";
import { moneyIn, qtyLabel } from "./format";

export type StepKey = "board" | "parts" | "box" | "quote";

const STEP_TITLE: Record<StepKey, string> = {
  board: "Bare board",
  parts: "Components",
  box: "Box",
  quote: "Quote",
};

/**
 * The top of steps 4–7 (bare board, components, box, quote): which step this is, and what has been chosen so far with
 * what it adds per board. Moving between steps is the numbered strip and Back / Next — this is a summary, not a menu.
 */
export function BuildHeader({
  b,
  current,
  currency,
  section = false,
}: {
  b: Build;
  current: StepKey;
  currency: Currency;
  /** One section of a step page: a section heading, and the choices so far only above the quote. */ section?: boolean;
}) {
  const m = moneyIn(currency);
  const q = b.quotes.find((x) => x.qty === b.refQty) ?? b.quotes[0];
  const counted = b.lines.filter((l) => !l.dnp && !l.excluded);
  const priced = counted.filter((l) => l.cost.priced).length;
  const so = [
    {
      key: "board" as const,
      label: "Board",
      choice: b.board.chosenName ?? "no fab yet",
      note: b.board.chosen?.auto ? "cheapest that fits" : null,
      cost: q?.byGroup.board ?? null,
    },
    {
      key: "parts" as const,
      label: "Components",
      choice: `${priced} of ${counted.length} lines priced`,
      note: null,
      cost: q?.byGroup.components ?? null,
    },
    {
      key: "box" as const,
      label: "Box",
      choice: b.box.chosen ? b.box.chosen.spec.label : "board only",
      note: b.box.chosen && b.box.auto ? "from the project spec" : null,
      cost: q?.byGroup.box ?? null,
    },
  ];

  const summary = !section || current === "quote";
  return (
    <div className="mb-6">
      {section ? (
        // Components (5) and the bare board (6) are steps of their own and the box a page of its own: their titles already name them.
        current === "box" || current === "board" || current === "parts" ? null : (
          <h2 className="page-heading text-2xl leading-tight font-semibold tracking-tight">
            {STEP_TITLE[current]}
          </h2>
        )
      ) : (
        <h1 className="page-heading text-[2rem] leading-tight font-semibold tracking-tight">
          Build &amp; quote — {b.product?.name ?? b.title}
        </h1>
      )}
      {section ? null : (
        <p className="mt-2 text-sm text-muted-foreground">
          {STEP_TITLE[current]} · {b.product?.customer ? `${b.product.customer} · ` : ""}
          {b.quantities.map(qtyLabel).join(", ")}
        </p>
      )}
      {summary ? (
        <section
          aria-label="Your choices so far"
          className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 rounded-xl border bg-card p-5 text-sm"
        >
          {so.map((s) => (
            <div
              key={s.key}
              className={cn("min-w-0", s.key === current && "font-semibold")}
            >
              <div className="text-xs font-normal text-muted-foreground">
                {s.label}
                {s.cost !== null ? (
                  <span className="num"> · {m.unit(s.cost)}</span>
                ) : null}
              </div>
              <div className="max-w-[16rem] truncate" title={s.choice}>
                {s.choice}
                {s.note ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    ({s.note})
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          <div className="ml-auto text-right">
            <div className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
              {q ? m.unit(q.unitPrice) : "—"}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              {q ? `a board at ${qtyLabel(q.qty)}, ex-GST` : "Quote"}
            </div>
          </div>
        </section>
      ) : null}
      {summary && b.warnings.length ? (
        <ul className="mt-3 space-y-1 text-sm text-risk-amber">
          {b.warnings.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
