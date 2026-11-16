/**
 * Everything a lot uses up besides the parts: paste, bar solder, flux, stencil wipes, coating, masks, bags and
 * labels — per board and for the lot. Quantities from the plant figures (src/data/assembly.ts). Pure.
 */
import { ASSEMBLY, type AssemblyConfig } from "@/data/assembly";
import type { AsmPart } from "./joints";

export type Consumable = { key: string; label: string; unit: string; perBoard: number; lot: number; /** INR for the lot, where a rate is on file. */ cost: number | null; note: string };

/** Parts that must be masked before conformal coating: anything that mates, moves or is probed. */
export function maskedParts(parts: AsmPart[]): AsmPart[] {
  return parts.filter((p) => p.cls === "connector" || p.cls === "relay" || /^(SW|S|TP|RV|VR|BZ|LS|MK|BT)\d/i.test(p.refDes));
}

export type ConsumablesInput = {
  qty: number;
  boardAreaCm2: number;
  paste: { perBoardG: number; issueG: number; cost: number; jars: number } | null;
  solder: { perBoardG: number; lotG: number; cost: number } | null;
  /** Wave or selective soldering on the route. */
  wave: boolean;
  /** SMT sides printed, and boards on one panel (a print is a panel). */
  sides: number;
  boardsPerPanel: number;
  coating: boolean;
  masked: number;
  boxed: boolean;
};

export function consumablesForLot(i: ConsumablesInput, cfg: AssemblyConfig = ASSEMBLY): Consumable[] {
  const qty = Math.max(1, i.qty);
  const c = cfg.consumables;
  const out: Consumable[] = [];
  if (i.paste && i.paste.issueG > 0)
    out.push({ key: "paste", label: "Solder paste", unit: "g", perBoard: i.paste.perBoardG, lot: i.paste.issueG, cost: i.paste.cost, note: `${i.paste.jars} × ${cfg.paste.jarG} g jar${i.paste.jars === 1 ? "" : "s"}; the lot figure includes wipes and what stays on the stencil` });
  if (i.solder && i.solder.lotG > 0) out.push({ key: "solder", label: "Bar solder", unit: "g", perBoard: i.solder.perBoardG, lot: i.solder.lotG, cost: i.solder.cost, note: `with ${cfg.solder.drossPct} % dross` });
  if (i.wave) {
    const ml = (i.boardAreaCm2 / 100) * c.waveFluxMlPerDm2;
    out.push({ key: "flux", label: "Flux", unit: "ml", perBoard: ml, lot: ml * qty, cost: null, note: `${c.waveFluxMlPerDm2} ml per dm² ahead of the wave` });
  }
  if (i.sides > 0) {
    const prints = Math.ceil(qty / Math.max(1, i.boardsPerPanel)) * i.sides;
    const wipes = Math.ceil(prints / c.printsPerWipe);
    out.push({ key: "wipes", label: "Under-stencil wipes", unit: "wipes", perBoard: wipes / qty, lot: wipes, cost: null, note: `${prints.toLocaleString("en-IN")} prints, one wipe every ${c.printsPerWipe}` });
  }
  if (i.coating) {
    const ml = i.boardAreaCm2 * 2 * c.coatMlPerCm2;
    out.push({ key: "coat", label: "Conformal coating", unit: "ml", perBoard: ml, lot: ml * qty, cost: null, note: "both sides, with overspray" });
    if (i.masked > 0) out.push({ key: "mask", label: "Masking caps / tape", unit: "pcs", perBoard: i.masked, lot: i.masked * qty, cost: null, note: "connectors, switches and test points masked before coating" });
  }
  out.push({ key: "bags", label: i.boxed ? "Cartons and labels" : "ESD bags and labels", unit: "pcs", perBoard: 1, lot: qty, cost: null, note: "one per unit" });
  return out;
}
