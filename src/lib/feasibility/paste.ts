/**
 * Solder paste for one board and for a lot. Paste = stencil aperture area × foil thickness × transfer × density.
 * The aperture area is measured from the Gerber paste layer when there is one (src/lib/board/fab-measure.ts);
 * otherwise each package's land pattern gives it. Pure.
 */
import { ASSEMBLY, type AssemblyConfig } from "@/data/assembly";
import type { AsmPart } from "./joints";
import type { PanelFacts } from "@/lib/board/panel";

export type MeasuredSide = { apertures: number; areaMm2: number; source: "paste-layer" | "mask-openings" };

/** What was measured off the fabrication files at upload. */
export type FabMeasure = {
  paste: { top: MeasuredSide | null; bottom: MeasuredSide | null };
  holes: { plated: number; component: number; vias: number; nonPlated: number } | null;
  /** Set when the uploaded Gerbers were a panel; the measures above are then of one board. */
  panel?: PanelFacts | null;
};

export type PasteSource = MeasuredSide["source"] | "packages";

export const PASTE_SOURCE_LABEL: Record<PasteSource, string> = {
  "paste-layer": "measured from the Gerber paste layer",
  "mask-openings": "measured from the solder-mask openings",
  packages: "estimated from the packages' land patterns",
};

/** Paste per terminal of a chip part, mm² of pad. */
const CHIP_PAD: Record<string, number> = { "01005": 0.04, "0201": 0.09, "0402": 0.28, "0603": 0.68, "0805": 1.3, "1206": 1.87, "1210": 2.86, "1812": 4.6, "2010": 3.1, "2512": 4.6 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Pads that take paste on one SMT part: how many, and their total area in mm². */
export function padsOf(p: AsmPart): { apertures: number; areaMm2: number } {
  if (p.mount !== "SMT") return { apertures: 0, areaMm2: 0 };
  const L = p.lengthMm || 2;
  const W = p.widthMm || 1.2;
  const pitch = p.pitchMm > 0 ? p.pitchMm : 1.27;
  const pins = Math.max(0, Math.round(p.pins));
  const chip = p.pkg ? Object.keys(CHIP_PAD).find((k) => new RegExp(`(^|[^0-9])${k}([^0-9]|$)`).test(p.pkg!)) : undefined;
  switch (p.kind) {
    case "chip":
      return { apertures: 2, areaMm2: 2 * (chip ? CHIP_PAD[chip] : clamp(0.3 * L * 0.9 * W, 0.04, 6)) };
    case "molded":
    case "crystal":
    case "can":
      return { apertures: Math.max(2, pins), areaMm2: Math.max(2, pins) * clamp(0.28 * L * 0.8 * W, 0.2, 12) };
    case "gullwing":
    case "quad": {
      const lead = clamp(0.55 * pitch, 0.2, 0.7) * (pitch >= 1 ? 1.55 : pitch >= 0.65 ? 1.3 : 1.1);
      return { apertures: pins, areaMm2: pins * lead };
    }
    case "leadless": {
      const lead = clamp(0.5 * pitch, 0.18, 0.45) * 0.8;
      // The exposed pad is printed as window panes: about 60 % of a pad a third of the body.
      const ep = pins >= 6 ? 0.36 * L * W * 0.6 : 0;
      return { apertures: pins + (ep ? 1 : 0), areaMm2: pins * lead + ep };
    }
    case "array":
      return { apertures: pins, areaMm2: pins * Math.PI * (0.25 * pitch) ** 2 };
    case "power":
      return { apertures: Math.max(2, pins), areaMm2: 0.45 * L * W + Math.max(1, pins - 1) * 1.6 };
    case "connector":
    case "module":
      return { apertures: pins, areaMm2: pins * clamp(0.5 * pitch, 0.2, 1.2) * 1.4 };
    default:
      return { apertures: pins, areaMm2: pins * 1.0 };
  }
}

/** How much paste a part takes against its plain land pattern: double for the classes the plant prints heavy. */
export const pasteFactor = (p: AsmPart, cfg: AssemblyConfig = ASSEMBLY) => (p.cls && (cfg.heavyPaste.classes as readonly string[]).includes(p.cls) ? cfg.heavyPaste.factor : 1);

/** Foil thickness for a side: the finest feature decides, µm. */
export function stencilFor(parts: AsmPart[], cfg: AssemblyConfig = ASSEMBLY): number {
  const smt = parts.filter((p) => p.mount === "SMT");
  const pitchOf = (kinds: AsmPart["kind"][]) => Math.min(Infinity, ...smt.filter((p) => kinds.includes(p.kind) && p.pins > 2 && p.pitchMm > 0).map((p) => p.pitchMm));
  const lead = pitchOf(["gullwing", "quad", "leadless", "connector", "module"]);
  const ball = pitchOf(["array"]);
  const chip = (names: string[]) => smt.some((p) => p.kind === "chip" && !!p.pkg && names.some((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(p.pkg!)));
  if (lead <= 0.4 || ball <= 0.5 || chip(["01005", "0201"])) return cfg.stencilUm.fine;
  if (lead <= 0.5 || ball < Infinity || chip(["0402"])) return cfg.stencilUm.standard;
  return cfg.stencilUm.coarse;
}

export type PasteSide = {
  side: "TOP" | "BOTTOM";
  placements: number;
  /** Do-not-populate parts whose pads are printed on this side (counted in the paste, not placed). */
  dnpParts: number;
  /** Parts printed with double paste (inductors, connectors) and the grams that adds. */
  heavyParts: number;
  heavyExtraG: number;
  apertures: number;
  areaMm2: number;
  stencilUm: number;
  volumeMm3: number;
  grams: number;
  source: PasteSource;
};

export type PasteEstimate = { sides: PasteSide[]; gramsPerBoard: number; source: PasteSource | null };

const RANK: PasteSource[] = ["paste-layer", "mask-openings", "packages"];

export function estimatePaste(parts: AsmPart[], measured: FabMeasure | null, cfg: AssemblyConfig = ASSEMBLY, dnp: AsmPart[] = []): PasteEstimate {
  const sides: PasteSide[] = [];
  for (const side of ["TOP", "BOTTOM"] as const) {
    const placed = parts.filter((p) => p.side === side && p.mount === "SMT");
    // The stencil prints the pads of do-not-populate parts too. A measured paste layer already has them in its area.
    const unplaced = cfg.dnp.inPaste ? dnp.filter((p) => p.side === side && p.mount === "SMT") : [];
    const here = [...placed, ...unplaced];
    const m = measured?.paste[side === "TOP" ? "top" : "bottom"] ?? null;
    if (!here.length && !(m && m.apertures > 0)) continue;
    const fromParts = here.map(padsOf).reduce((s, x) => ({ apertures: s.apertures + x.apertures, areaMm2: s.areaMm2 + x.areaMm2 }), { apertures: 0, areaMm2: 0 });
    // Heavy parts take their pad area again in paste: a share of the side, whether the area was measured or estimated.
    const heavy = here.filter((p) => pasteFactor(p, cfg) > 1);
    const heavyArea = heavy.reduce((s, p) => s + padsOf(p).areaMm2 * (pasteFactor(p, cfg) - 1), 0);
    const boost = fromParts.areaMm2 > 0 ? heavyArea / fromParts.areaMm2 : 0;
    const useMeasured = !!m && m.apertures > 0;
    const source: PasteSource = useMeasured ? m!.source : "packages";
    const area = useMeasured ? m!.areaMm2 : fromParts.areaMm2;
    const stencilUm = stencilFor(here, cfg);
    // The paste layer already is the aperture; pads and mask openings are a little larger than it.
    const aperture = area * (source === "paste-layer" ? 1 : cfg.paste.apertureReduction);
    const plain = aperture * (stencilUm / 1000) * cfg.paste.transfer;
    const volume = plain * (1 + boost);
    sides.push({
      side,
      placements: placed.length,
      dnpParts: unplaced.length,
      heavyParts: heavy.length,
      heavyExtraG: (plain * boost * cfg.paste.densityGPerCm3) / 1000,
      apertures: useMeasured ? m!.apertures : fromParts.apertures,
      areaMm2: Math.round(aperture * 10) / 10,
      stencilUm,
      volumeMm3: Math.round(volume * 100) / 100,
      grams: (volume * cfg.paste.densityGPerCm3) / 1000,
      source,
    });
  }
  const worst = sides.map((s) => s.source).sort((a, b) => RANK.indexOf(b) - RANK.indexOf(a))[0] ?? null;
  return { sides, gramsPerBoard: sides.reduce((s, x) => s + x.grams, 0), source: worst };
}

export type PastePackageRow = { pkg: string; parts: number; apertures: number; gramsEach: number; grams: number; sharePct: number; refs: string[] };

/**
 * Where the paste of one board goes, package by package. Each side's paste is shared out by the parts' pad area, so
 * the rows add up to the board's figure whether that was measured from the Gerbers or estimated.
 */
export function pasteByPackage(parts: AsmPart[], est: PasteEstimate): PastePackageRow[] {
  const rows = new Map<string, PastePackageRow>();
  for (const side of est.sides) {
    const here = parts.filter((p) => p.side === side.side && p.mount === "SMT").map((p) => ({ p, pads: { apertures: padsOf(p).apertures, areaMm2: padsOf(p).areaMm2 * pasteFactor(p) } }));
    const area = here.reduce((s, x) => s + x.pads.areaMm2, 0);
    if (area <= 0) continue;
    for (const { p, pads } of here) {
      const name = p.pkg ?? `${p.kind}, ${Math.max(2, Math.round(p.pins))} pins`;
      const row = rows.get(name) ?? { pkg: name, parts: 0, apertures: 0, gramsEach: 0, grams: 0, sharePct: 0, refs: [] };
      row.parts++;
      row.apertures += pads.apertures;
      row.grams += (side.grams * pads.areaMm2) / area;
      row.refs.push(p.refDes);
      rows.set(name, row);
    }
  }
  const total = [...rows.values()].reduce((s, r) => s + r.grams, 0);
  return [...rows.values()]
    .map((r) => ({ ...r, gramsEach: r.grams / r.parts, sharePct: total > 0 ? (r.grams / total) * 100 : 0 }))
    .sort((a, b) => b.grams - a.grams || a.pkg.localeCompare(b.pkg));
}

/** Paste the pads of do-not-populate parts would take if the stencil prints them — it usually does. Estimated from the packages. */
export function dnpPasteGrams(dnp: AsmPart[], cfg: AssemblyConfig = ASSEMBLY): number {
  const smt = dnp.filter((p) => p.mount === "SMT");
  if (!smt.length) return 0;
  const area = smt.reduce((s, p) => s + padsOf(p).areaMm2, 0) * cfg.paste.apertureReduction;
  return (area * (stencilFor(smt, cfg) / 1000) * cfg.paste.transfer * cfg.paste.densityGPerCm3) / 1000;
}

export type PasteLot = { printedG: number; wipeG: number; beadG: number; issueG: number; jars: number; cost: number; costPerBoard: number };

/** Paste to issue for a lot: what is printed, what the wipes take and the bead left on each stencil every shift. */
export function pasteForLot(est: PasteEstimate, qty: number, smtShifts: number, inrPerKg: number, cfg: AssemblyConfig = ASSEMBLY): PasteLot {
  const printedG = est.gramsPerBoard * qty;
  const wipeG = (printedG * cfg.paste.wipeLossPct) / 100;
  const beadG = est.sides.length * cfg.paste.beadGPerSidePerShift * Math.max(1, Math.ceil(smtShifts));
  const issueG = est.sides.length ? printedG + wipeG + beadG : 0;
  const cost = (issueG / 1000) * inrPerKg;
  return { printedG, wipeG, beadG: est.sides.length ? beadG : 0, issueG, jars: Math.ceil(issueG / cfg.paste.jarG), cost, costPerBoard: qty > 0 ? cost / qty : 0 };
}

/** Bar solder for wave or selective soldering of a lot, grams and INR. */
export function solderForLot(thtJoints: number, qty: number, cfg: AssemblyConfig = ASSEMBLY) {
  const perBoardG = thtJoints * cfg.solder.gPerThtJoint;
  const lotG = perBoardG * qty * (1 + cfg.solder.drossPct / 100);
  return { perBoardG, lotG, cost: (lotG / 1000) * cfg.solder.barInrPerKg };
}

/** Paste cost the quote carries on a printing step: per board with wipe loss, and one stencil load a lot. */
export function pasteCostForSide(grams: number, inrPerKg: number, cfg: AssemblyConfig = ASSEMBLY) {
  return { perBoard: ((grams * (1 + cfg.paste.wipeLossPct / 100)) / 1000) * inrPerKg, perLot: (cfg.paste.beadGPerSidePerShift / 1000) * inrPerKg };
}
