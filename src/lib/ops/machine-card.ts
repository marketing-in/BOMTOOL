import { findModel, type FactSource } from "@/knowledge/machine-models";
import { kindOf, readSpecs, type MachineSpecs, type SpecSource } from "./machines";
import { packageReach, placerCaps, type PackageReach } from "./package-reach";

/**
 * Everything the Lines page shows about one machine: our own record first, then the model's profile
 * (src/knowledge/machine-models.ts). Each figure says where it came from. Pure.
 */

export type Figure = { value: string; label: string; source: "machine" | FactSource; note?: string };

export type MachineCard = {
  id: string;
  type: string;
  kind: string;
  short: string;
  vendor: string;
  model: string;
  position: number;
  color: string;
  year: number | null;
  specs: MachineSpecs;
  source: SpecSource | null;
  /** Year the model was introduced, from the maker. */
  launched: { value: number; note?: string } | null;
  oneLiner: string | null;
  big: Figure[];
  facts: Figure[];
  strengths: string[];
  limits: string[];
  reach: PackageReach[] | null;
  links: { label: string; url: string }[];
  confidence: "high" | "medium" | "low" | null;
};

/** One colour per kind of machine, the same everywhere a machine is drawn. None of them blue. */
export const KIND_COLOR: Record<string, string> = {
  LASER_MARKER: "#e2a400",
  STENCIL_PRINTER: "#c93a7c",
  SPI: "#7b3fb5",
  PICK_AND_PLACE: "#e0631a",
  REFLOW_OVEN: "#c4302b",
  AOI: "#0b7a5c",
  XRAY: "#4d5a1e",
  WAVE_SOLDER: "#8a5a2b",
  SELECTIVE_SOLDER: "#8a5a2b",
  CONFORMAL_COATER: "#a3237a",
  DEPANELER: "#6b7a12",
  ICT: "#0b7a5c",
  FLYING_PROBE: "#0b7a5c",
  FCT: "#0b7a5c",
  OTHER: "#8f8576",
};

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
const pair = (p: [number, number]) => `${p[0]}×${p[1]}`;

export function machineCard(m: { id: string; type: string; vendor: string; model: string; position: number; specs: unknown }): MachineCard {
  const { specs, source, extra } = readSpecs(m.specs);
  const model = findModel(m.vendor, m.model);
  const kind = kindOf(m.type).label;
  const big: Figure[] = [];
  let reach: PackageReach[] | null = null;

  if (m.type === "PICK_AND_PLACE") {
    const caps = placerCaps(m.specs, model);
    reach = packageReach(caps);
    if (caps.minChip) big.push({ value: caps.minChip, label: "smallest chip", source: caps.from.minChip ?? "machine" });
    if (caps.maxPartMm) big.push({ value: pair(caps.maxPartMm), label: "largest part, mm", source: caps.from.maxPartMm ?? "machine" });
    if (caps.maxPartHeightMm) big.push({ value: String(caps.maxPartHeightMm), label: "tallest part, mm", source: caps.from.maxPartHeightMm ?? "machine" });
    const actual = typeof extra.actualCph === "number" ? extra.actualCph : null;
    if (actual) big.push({ value: k(actual), label: "CPH measured here", source: "machine" });
    else if (specs.cph) big.push({ value: k(specs.cph), label: "CPH rated", source: "machine" });
  } else {
    if (specs.maxBoardMm) big.push({ value: pair(specs.maxBoardMm), label: "largest board, mm", source: "machine" });
    if (specs.zones) big.push({ value: String(specs.zones), label: "heating zones", source: "machine" });
    if (specs.technology) big.push({ value: specs.technology, label: "inspection", source: "machine" });
    if (specs.minThicknessMm && specs.maxThicknessMm) big.push({ value: `${specs.minThicknessMm}–${specs.maxThicknessMm}`, label: "board thickness, mm", source: "machine" });
    for (const f of model?.keyFacts ?? []) if (big.length < 4 && f.value.length <= 12) big.push({ value: f.value, label: f.label.toLowerCase(), source: f.source, note: f.note });
  }

  const shown = new Set(big.map((b) => b.label));
  const facts: Figure[] = (model?.keyFacts ?? []).filter((f) => !shown.has(f.label.toLowerCase())).map((f) => ({ value: f.value, label: f.label, source: f.source, note: f.note }));
  const p = model?.placement;
  if (p) {
    if (p.accuracyUm) facts.unshift({ value: `±${p.accuracyUm.value} µm`, label: "Accuracy", source: p.accuracyUm.source, note: p.accuracyNote ?? p.accuracyUm.note });
    if (p.feederSlots8mm) facts.unshift({ value: String(p.feederSlots8mm.value), label: "Feeder slots (8 mm)", source: p.feederSlots8mm.source });
    if (p.heads) facts.push({ value: p.heads.value, label: "Heads", source: p.heads.source });
    if (p.nozzles) facts.push({ value: p.nozzles.value, label: "Nozzles", source: p.nozzles.source });
  }
  if (model?.power) facts.push({ value: model.power, label: "Power", source: "maker" });
  if (model?.footprintMm) facts.push({ value: model.footprintMm, label: "Footprint, mm", source: "maker" });

  return {
    id: m.id,
    type: m.type,
    kind,
    short: m.type === "OTHER" ? "Conveyor" : kind,
    vendor: m.vendor,
    model: m.model,
    position: m.position,
    color: KIND_COLOR[m.type] ?? KIND_COLOR.OTHER,
    year: typeof extra.year === "number" ? extra.year : null,
    specs,
    source,
    launched: model?.launched ? { value: model.launched.value, note: model.launched.note } : null,
    oneLiner: model?.oneLiner ?? null,
    big: big.slice(0, 4),
    facts,
    strengths: model?.strengths ?? [],
    limits: model?.limits ?? [],
    reach,
    links: model?.links ?? [],
    confidence: model?.confidence ?? null,
  };
}
