/**
 * The customer quote for each board quantity: material (bare board, components, box), conversion (the process
 * route), material handling and margin per board; NRE once; GST on top. Pure — the server works out each input.
 */
import type { Rates } from "@/data/costing";
import type { RouteStage } from "@/lib/ops/route";
import type { NreItem, ProcessCost } from "./process";

export type QtyInputs = {
  qty: number;
  /** Bare board per board, landed INR; tooling once. Null = not chosen yet. */
  board: { unit: number; nre: number } | null;
  /** Components per board (what this build uses, at the prices for this quantity), MOQ / reel left-overs for the lot, lines with no price. */
  components: { perBoard: number; moqExcess: number; unpriced: number };
  /** Box per unit and its one-off costs. Null = board only. */
  box: { unit: number; nre: number; machiningPerUnit: number; machiningNre: number } | null;
};

export type CostGroup = "board" | "components" | "box" | "assembly" | "test" | "finish" | "handling" | "margin";

export const GROUP_LABEL: Record<CostGroup, string> = {
  board: "Bare board",
  components: "Components",
  box: "Box",
  assembly: "Assembly",
  test: "Test & programming",
  finish: "Box build & packing",
  handling: "Material handling",
  margin: "Margin",
};

const STAGE_GROUP: Record<RouteStage, CostGroup> = { fab: "assembly", prep: "assembly", smt: "assembly", tht: "assembly", post: "assembly", test: "test", box: "finish", ship: "finish" };

export type CostRow = { key: string; label: string; group: CostGroup; perBoard: number };

export type QtyQuote = {
  qty: number;
  rows: CostRow[];
  byGroup: Record<CostGroup, number>;
  material: number;
  conversion: number;
  /** Price per board, ex-GST. */
  unitPrice: number;
  /** unitPrice × qty. */
  lotPrice: number;
  nre: NreItem[];
  nreTotal: number;
  gst: number;
  /** Lot + NRE + GST. */
  total: number;
  /** Lines with no price at this quantity — the quote is short by their cost. */
  unpriced: number;
  /** Parts left over from MOQ / reel rounding for the whole lot, INR — bought whether or not the customer is charged. */
  moqExcessLot: number;
};

export function quoteForQty(input: QtyInputs, process: { steps: ProcessCost[]; nre: NreItem[] }, r: Rates): QtyQuote {
  const q = Math.max(1, input.qty);
  const rows: CostRow[] = [];
  if (input.board) rows.push({ key: "board", label: "Bare board", group: "board", perBoard: input.board.unit });
  rows.push({ key: "components", label: "Components", group: "components", perBoard: input.components.perBoard });
  if (r.chargeMoqExcess && input.components.moqExcess > 0) rows.push({ key: "moq", label: "MOQ / reel left-overs", group: "components", perBoard: input.components.moqExcess / q });
  if (input.box) {
    rows.push({ key: "box", label: "Box", group: "box", perBoard: input.box.unit });
    if (input.box.machiningPerUnit) rows.push({ key: "machining", label: "Connector cut-outs", group: "box", perBoard: input.box.machiningPerUnit });
  }
  const material = rows.reduce((s, x) => s + x.perBoard, 0);
  for (const s of process.steps) {
    const perBoard = s.perBoard + s.perLot / q;
    if (perBoard > 0) rows.push({ key: `p:${s.key}`, label: s.title, group: STAGE_GROUP[s.stage], perBoard });
  }
  const conversion = rows.reduce((s, x) => s + x.perBoard, 0) - material;
  const handling = (material * r.materialMarkupPct) / 100;
  rows.push({ key: "handling", label: `Material handling ${r.materialMarkupPct} %`, group: "handling", perBoard: handling });
  const margin = ((material + handling + conversion) * r.marginPct) / 100;
  rows.push({ key: "margin", label: `Margin ${r.marginPct} %`, group: "margin", perBoard: margin });

  const unitPrice = material + handling + conversion + margin;
  const nre: NreItem[] = [
    ...(input.board?.nre ? [{ key: "pcb-tooling", label: "PCB tooling", amount: input.board.nre }] : []),
    ...(input.box?.nre ? [{ key: "box-tooling", label: "Box tooling / programme", amount: input.box.nre }] : []),
    ...(input.box?.machiningNre ? [{ key: "box-cnc", label: "Cut-out programme and fixture", amount: input.box.machiningNre }] : []),
    ...process.nre,
  ];
  const nreTotal = nre.reduce((s, x) => s + x.amount, 0);
  const lotPrice = unitPrice * q;
  const gst = ((lotPrice + nreTotal) * r.gstPct) / 100;
  const byGroup = Object.fromEntries(Object.keys(GROUP_LABEL).map((g) => [g, rows.filter((x) => x.group === g).reduce((s, x) => s + x.perBoard, 0)])) as Record<CostGroup, number>;
  return { qty: q, rows, byGroup, material, conversion, unitPrice, lotPrice, nre, nreTotal, gst, total: lotPrice + nreTotal + gst, unpriced: input.components.unpriced, moqExcessLot: Math.max(0, input.components.moqExcess) };
}

/** 1, 2, 2.5, 5 × 10ⁿ — the quantities people actually ask for. */
export function niceQty(n: number): number {
  if (n <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  const step = m < 1.5 ? 1 : m < 2.25 ? 2 : m < 3.75 ? 2.5 : m < 7.5 ? 5 : 10;
  return Math.round(step * p);
}

/** The build quantity and two volume breaks above it. */
export function defaultQuantities(buildQty: number): number[] {
  const base = Math.max(1, Math.round(buildQty));
  return [...new Set([base, niceQty(base * 2), niceQty(base * 5)])].filter((x) => x >= base).sort((a, b) => a - b);
}

/** "100, 500 1k" → [100, 500, 1000]: up to four distinct positive quantities, ascending. */
export function parseQuantities(text: string): number[] {
  const nums = text
    .split(/[\s,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => (t.endsWith("k") ? Number(t.slice(0, -1)) * 1000 : Number(t)))
    .filter((x) => Number.isFinite(x) && x >= 1 && x <= 10_000_000)
    .map((x) => Math.round(x));
  return [...new Set(nums)].sort((a, b) => a - b).slice(0, 4);
}

/** Merges stored rates over the defaults, keeping only known numeric fields in sane ranges. */
export function readRates(stored: unknown, defaults: Rates): Rates {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<Record<string, unknown>>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  const out = { ...defaults, nre: { ...defaults.nre } } as Rates;
  for (const k of Object.keys(defaults) as (keyof Rates)[]) {
    if (k === "nre") continue;
    if (k === "chargeMoqExcess") out.chargeMoqExcess = typeof s.chargeMoqExcess === "boolean" ? s.chargeMoqExcess : defaults.chargeMoqExcess;
    else (out as Record<string, unknown>)[k] = num(s[k], defaults[k] as number);
  }
  const nre = (s.nre && typeof s.nre === "object" ? s.nre : {}) as Record<string, unknown>;
  for (const k of Object.keys(defaults.nre) as (keyof Rates["nre"])[]) out.nre[k] = num(nre[k], defaults.nre[k]);
  out.smtEfficiency = Math.min(1, Math.max(0.05, out.smtEfficiency));
  return out;
}
