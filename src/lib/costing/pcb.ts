/**
 * Bare-board price estimate, the way a fab builds a quote: panel area × a base rate for the technology, finish,
 * copper, thickness and IPC class, falling with the area ordered; never below the fab's minimum lot; tooling once
 * per design. An ESTIMATE until the fab quotes — the quote step lets the real number replace it.
 */
import { PCB_COST } from "@/data/costing";
import { pcbTechnology } from "@/knowledge/pcb-technologies";
import { FINISHES, LAMINATES } from "@/knowledge/pcb-materials";
import { classifyPcb } from "@/lib/directory/recognise";
import { normaliseFinish } from "@/lib/supply-chain";

export type PcbFacts = {
  widthMm: number;
  heightMm: number;
  layers: number;
  thicknessMm: number;
  finish: string;
  copperOz?: number | null;
  material?: string | null;
  ipcClass?: 2 | 3;
};

/** A fab's price level against the base (1 = an Indian production fab), and its own lot and tooling habits. */
export type FabPricing = { factor: number; minLotFactor?: number; toolingFactor?: number };

export type PcbEstimate = {
  qty: number;
  /** INR per board, ex-works (before freight and duty). */
  unit: number;
  /** INR once per design. */
  tooling: number;
  /** True when the minimum lot charge, not the area, sets the price. */
  minLot: boolean;
  areaCm2: number;
  panelCm2: number;
  /** Panel area ordered, m². */
  m2: number;
  technology: string;
  factors: { technology: number; finish: number; copper: number; thickness: number; ipc: number; volume: number; fab: number };
};

const FINISH_SLUG: Record<string, string> = { HASL: "hasl", "HASL-LF": "lf-hasl", ENIG: "enig", ENEPIG: "enepig", OSP: "osp", IMAG: "imag", IMSN: "imsn" };

/** The PCB materials entry for a finish written any common way ("ENIG", "LF-HASL", "Immersion silver"). */
export const finishInfo = (finish: string) => FINISHES.find((x) => x.slug === FINISH_SLUG[normaliseFinish(finish)]) ?? null;

/** The laminate a board spec names: by family words first (polyimide, PTFE, aluminium …), else FR-4 by its Tg. */
export function laminateFor(material: string | null | undefined) {
  const m = material ?? "";
  const named = [
    [/rogers|ptfe|duroid/i, "ptfe"],
    [/ro4\d{3}|hydrocarbon/i, "hydrocarbon"],
    [/polyimide|flex/i, "polyimide"],
    [/alumin|mcpcb|ims/i, "ims-al"],
    [/halogen/i, "fr4-hf"],
    [/cem-?3/i, "cem3"],
    [/cem-?1/i, "cem1"],
  ] as const;
  const hit = named.find(([re]) => re.test(m));
  if (hit) return LAMINATES.find((l) => l.slug === hit[1]) ?? null;
  const tg = Number(/Tg\s*(\d{3})/i.exec(m)?.[1] ?? 135);
  return LAMINATES.find((l) => l.slug === (tg >= 165 ? "fr4-high" : tg >= 145 ? "fr4-mid" : "fr4-std")) ?? null;
}

/** Relative cost of a surface finish (lead-free HASL = 1), from the PCB materials seed data. */
export function finishFactor(finish: string): number {
  return 1 + ((finishInfo(finish)?.cost ?? 1) - 1) * PCB_COST.finishWeight;
}

/** Cost index of the board's technology (rigid 2-layer FR-4 = 1), with extra processes such as high-Tg on top. */
export function technologyFactor(b: Pick<PcbFacts, "layers" | "thicknessMm" | "copperOz" | "material" | "finish">): { slug: string; factor: number } {
  const t = classifyPcb({ layers: b.layers, thicknessMm: b.thicknessMm, copperOz: b.copperOz, material: b.material, finish: b.finish });
  let factor = pcbTechnology(t.primary)?.costIndex ?? 1;
  if (t.primary === "fr4-6l-plus" && b.layers > 6) factor *= 1 + PCB_COST.perTwoLayersAbove6 * ((b.layers - 6) / 2);
  // Heavy copper is priced by the copper factor; other extras (high-Tg …) add part of their index.
  for (const extra of t.also.filter((x) => x !== "heavy-copper")) factor *= 1 + ((pcbTechnology(extra)?.costIndex ?? 1) - 1) * PCB_COST.extraTechWeight;
  return { slug: t.primary, factor };
}

export function estimatePcb(b: PcbFacts, qty: number, fab: FabPricing = { factor: 1 }): PcbEstimate {
  const n = Math.max(1, Math.round(qty));
  const areaCm2 = (b.widthMm * b.heightMm) / 100;
  const border = PCB_COST.panelBorderMm;
  const panelCm2 = ((b.widthMm + border) * (b.heightMm + border)) / 100;
  const m2 = (panelCm2 * n) / 10_000;
  const tech = technologyFactor(b);
  const oz = Math.min(PCB_COST.copper.length - 1, Math.max(1, Math.round(b.copperOz ?? 1)));
  const factors = {
    technology: tech.factor,
    finish: finishFactor(b.finish),
    copper: PCB_COST.copper[oz],
    thickness: Math.abs(b.thicknessMm - 1.6) > 0.05 ? PCB_COST.offThickness : 1,
    ipc: b.ipcClass === 3 ? PCB_COST.ipcClass3 : 1,
    volume: (PCB_COST.volume.floor + PCB_COST.volume.extra * Math.exp(-m2 / PCB_COST.volume.m2)) * (1 - PCB_COST.volume.slope * Math.log10(Math.max(1, m2))),
    fab: fab.factor,
  };
  const byArea = panelCm2 * PCB_COST.baseInrPerCm2 * Object.values(factors).reduce((p, f) => p * f, 1);
  const lot = (PCB_COST.minLot.base + PCB_COST.minLot.perLayer * b.layers) * fab.factor * (fab.minLotFactor ?? 1);
  const unit = Math.max(byArea, lot / n);
  const tooling = (PCB_COST.tooling.base + PCB_COST.tooling.perLayer * b.layers) * Math.sqrt(tech.factor) * (fab.toolingFactor ?? 1);
  return { qty: n, unit: round2(unit), tooling: Math.round(tooling), minLot: lot / n > byArea, areaCm2: round2(areaCm2), panelCm2: round2(panelCm2), m2: Number(m2.toFixed(3)), technology: tech.slug, factors };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
