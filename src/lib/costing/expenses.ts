/**
 * What a quote costs us against what the customer pays: every expense of the lot (material bought, consumables,
 * each process step at the plant rates), the handling allowance and the margin on top, and what is left if material
 * prices move. Reads a finished quote (./quote.ts). Pure.
 */
import type { QtyQuote } from "./quote";

export type ExpenseKind = "material" | "consumable" | "process";

export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = {
  material: "Material we buy",
  consumable: "Consumables",
  process: "Work on our lines",
};

export type ExpenseLine = { key: string; label: string; kind: ExpenseKind; perBoard: number; lot: number; pctOfPrice: number };

/** An expense of the lot that the price per board does not carry. */
export type Uncharged = { key: string; label: string; lot: number };

export type Money = { material: number; consumables: number; process: number; spend: number; handling: number; margin: number; price: number };

export type ExpenseAnalysis = {
  qty: number;
  lines: ExpenseLine[];
  perBoard: Money;
  lot: Money;
  uncharged: Uncharged[];
  unchargedLot: number;
  /** Handling allowance + margin − uncharged expenses, for the lot. The allowance is meant for stores and scrap. */
  keptLot: number;
  keptPct: number;
  /** Margin alone as a share of the price (a 12 % mark-up is 10.7 % of the price). */
  marginPctOfPrice: number;
  materialPctOfPrice: number;
  /** One-off costs, passed to the customer at cost. */
  nre: number;
  /** What goes on the invoice before GST: lot + one-off. */
  invoice: number;
  gst: number;
  total: number;
  /** Paid to suppliers before the customer pays us: material, uncharged left-overs and one-off tooling. */
  cashOut: number;
  /** The same price with material costing more. */
  whatIf: { materialUpPct: number; keptLot: number; keptPct: number }[];
  /** Material price rise that uses up everything we keep, %. Null when there is no material. */
  breakEvenMaterialUpPct: number | null;
  unpriced: number;
};

const kindOf = (key: string): ExpenseKind => (key.startsWith("p:print-") ? "consumable" : key.startsWith("p:") ? "process" : "material");

export function analyseExpenses(q: QtyQuote, opts: { chargeMoqExcess: boolean; solderLot?: number } = { chargeMoqExcess: true }): ExpenseAnalysis {
  const qty = Math.max(1, q.qty);
  const price = q.unitPrice;
  const pct = (v: number) => (price > 0 ? (v / price) * 100 : 0);
  const lines: ExpenseLine[] = q.rows
    .filter((r) => r.group !== "handling" && r.group !== "margin")
    .map((r) => ({ key: r.key, label: r.label, kind: kindOf(r.key), perBoard: r.perBoard, lot: r.perBoard * qty, pctOfPrice: pct(r.perBoard) }));
  const sum = (k: ExpenseKind) => lines.filter((l) => l.kind === k).reduce((s, l) => s + l.perBoard, 0);
  const material = sum("material");
  const consumables = sum("consumable");
  const process = sum("process");
  const spend = material + consumables + process;
  const perBoard: Money = { material, consumables, process, spend, handling: q.byGroup.handling, margin: q.byGroup.margin, price };
  const lot = Object.fromEntries(Object.entries(perBoard).map(([k, v]) => [k, v * qty])) as Money;

  const uncharged: Uncharged[] = [
    ...(!opts.chargeMoqExcess && q.moqExcessLot > 0 ? [{ key: "moq", label: "MOQ / reel left-overs we keep", lot: q.moqExcessLot }] : []),
    ...(opts.solderLot && opts.solderLot > 0 ? [{ key: "solder", label: "Bar solder and dross (wave / selective)", lot: opts.solderLot }] : []),
  ];
  const unchargedLot = uncharged.reduce((s, u) => s + u.lot, 0);
  const keptLot = lot.handling + lot.margin - unchargedLot;
  const kept = (materialUpPct: number) => {
    const k = keptLot - (lot.material * materialUpPct) / 100;
    return { materialUpPct, keptLot: k, keptPct: lot.price > 0 ? (k / lot.price) * 100 : 0 };
  };
  return {
    qty,
    lines,
    perBoard,
    lot,
    uncharged,
    unchargedLot,
    keptLot,
    keptPct: lot.price > 0 ? (keptLot / lot.price) * 100 : 0,
    marginPctOfPrice: pct(perBoard.margin),
    materialPctOfPrice: pct(material),
    nre: q.nreTotal,
    invoice: q.lotPrice + q.nreTotal,
    gst: q.gst,
    total: q.total,
    cashOut: lot.material + unchargedLot + q.nreTotal,
    whatIf: [5, 10].map(kept),
    breakEvenMaterialUpPct: lot.material > 0 ? Math.max(0, (keptLot / lot.material) * 100) : null,
    unpriced: q.unpriced,
  };
}
