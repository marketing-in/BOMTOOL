/**
 * The SMT line for one board, station by station and side by side: what each machine does to this board, the numbers
 * it works to (paste, apertures, placements, profile, joints to inspect), how long a panel spends there and what to
 * watch. The slowest in-line station sets the takt. Pure — plant figures come from src/data/assembly.ts.
 */
import { ASSEMBLY, type AssemblyConfig } from "@/data/assembly";
import { isHidden, jointsOf, type AsmPart } from "./joints";
import { padsOf, type PasteSide } from "./paste";
import type { Panel } from "./panel";
import type { Level } from "./gates";

export type Station = {
  key: string;
  name: string;
  /** What the station does to this board. */
  what: string;
  /** Seconds one panel spends here; null where the station is not in the line's flow. */
  secPerPanel: number | null;
  /** In the line (sets the takt) or beside it. */
  inline: boolean;
  figures: { label: string; value: string }[];
  settings: string[];
  watch: string[];
  level: Level;
};

export type SmtSide = {
  side: "TOP" | "BOTTOM";
  /** 1 for the side built first. */
  pass: number;
  placements: number;
  stations: Station[];
  taktSec: number;
  bottleneck: string;
  panelsPerHour: number;
  boardsPerHour: number;
  /** Smallest stencil aperture area ratio on the side, and the part it belongs to. */
  areaRatio: { value: number; ref: string; pkg: string | null } | null;
};

export type SmtSheet = {
  sides: SmtSide[];
  panel: Panel;
  panels: number;
  /** Running hours for the lot at the takt, without set-up. */
  runHours: number;
  setupHours: number;
  boardsPerShift: number;
  pasteGPerBoard: number;
  pasteGPerPanel: number;
  line: string | null;
};

export type SmtLineInput = {
  qty: number;
  /** Fitted parts (no DNP). */
  parts: AsmPart[];
  /** Paste per side, as estimated or measured. */
  paste: PasteSide[];
  panel: Panel;
  /** Sides in build order, with the placement seconds per board the quote uses and the set-up per side. */
  passes: { side: "TOP" | "BOTTOM"; secondsPerBoard: number; setupHours: number }[];
  line: { code: string; name: string; capacityCph: number | null; feederSlots: number | null; hasSpi: boolean; hasAoi: boolean; hasXray: boolean } | null;
  feeders: { needed: number; slots: number | null; setups: number } | null;
  moistureSensitive: number;
  board: { layers: number; thicknessMm: number };
};

const n0 = (v: number) => Math.round(v).toLocaleString("en-IN");
const r1 = (v: number) => (Math.round(v * 10) / 10).toString();
const g = (v: number) => (v >= 1 ? `${v.toFixed(2)} g` : `${(v * 1000).toFixed(0)} mg`);
const range = (r: readonly number[], unit: string) => `${r[0]}–${r[1]} ${unit}`;
const CHIP = (p: AsmPart, names: string[]) => p.kind === "chip" && !!p.pkg && names.some((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(p.pkg!));

/** Area ratio of a part's typical aperture: opening area ÷ aperture wall area. Leads are long slots, the rest near square. */
export function apertureAreaRatio(p: AsmPart, stencilUm: number, cfg: AssemblyConfig = ASSEMBLY): number | null {
  const pads = padsOf(p);
  if (!pads.apertures || !pads.areaMm2) return null;
  const area = (pads.areaMm2 / pads.apertures) * cfg.paste.apertureReduction;
  const t = stencilUm / 1000;
  const leaded = p.kind === "gullwing" || p.kind === "quad" || p.kind === "leadless" || p.kind === "connector" || p.kind === "module";
  if (p.kind === "array") {
    const d = Math.sqrt((4 * area) / Math.PI);
    return d / (4 * t);
  }
  const w = leaded && p.pitchMm > 0 ? Math.min(Math.sqrt(area), 0.5 * p.pitchMm) : Math.sqrt(area);
  const l = area / w;
  return (w * l) / (2 * (w + l) * t);
}

export function smtLineSheet(input: SmtLineInput, cfg: AssemblyConfig = ASSEMBLY): SmtSheet {
  const s = cfg.smt;
  const qty = Math.max(1, Math.round(input.qty));
  const boards = input.panel.boards;
  const panels = Math.ceil(qty / boards);
  const hoursPerShift = cfg.shift.hours * cfg.shift.productive;
  const twoSided = input.passes.length > 1;

  const sides: SmtSide[] = input.passes.map((pass, i) => {
    const here = input.parts.filter((p) => p.mount === "SMT" && p.side === pass.side);
    const paste = input.paste.find((x) => x.side === pass.side) ?? null;
    const stencilUm = paste?.stencilUm ?? cfg.stencilUm.standard;
    const joints = here.reduce((a, p) => a + jointsOf(p), 0);
    const hidden = here.filter(isHidden);
    const hiddenJoints = hidden.reduce((a, p) => a + jointsOf(p), 0);
    const deposits = paste?.apertures ?? joints;
    const pitches = here.filter((p) => jointsOf(p) > 2 && p.pitchMm > 0).map((p) => p.pitchMm);
    const finest = pitches.length ? Math.min(...pitches) : null;
    const tiny = here.filter((p) => CHIP(p, ["01005", "0201"]));
    const bga = here.filter((p) => p.kind === "array");
    const fine = (finest !== null && finest <= 0.5) || tiny.length > 0 || bga.length > 0;
    const heavy = here.filter((p) => Math.max(p.lengthMm, p.widthMm) >= 12 || p.kind === "can" || p.kind === "module" || p.kind === "power");

    // The aperture hardest to print on this side.
    let areaRatio: SmtSide["areaRatio"] = null;
    for (const p of here) {
      const ar = apertureAreaRatio(p, stencilUm, cfg);
      if (ar !== null && (!areaRatio || ar < areaRatio.value)) areaRatio = { value: Math.round(ar * 100) / 100, ref: p.refDes, pkg: p.pkg };
    }
    const tightRelease = !!areaRatio && areaRatio.value < s.minAreaRatio;

    const stations: Station[] = [];
    const first = i === 0;

    stations.push({
      key: "load",
      name: first ? "Loader and laser mark" : "Flip and reload",
      what: first ? "Bare panels come out of the magazine; each gets its 2D code so every later station logs against it." : `The panel is turned over with the ${input.passes[0].side.toLowerCase()} side already soldered and goes round the line again.`,
      secPerPanel: s.loadSec,
      inline: true,
      figures: [
        { label: "Panel", value: `${input.panel.cols} × ${input.panel.rows} = ${boards} board${boards === 1 ? "" : "s"}, ${input.panel.lengthMm} × ${input.panel.widthMm} mm` },
        { label: "Panels in the lot", value: n0(panels) },
      ],
      settings: ["Conveyor width set to the panel, rails clear of parts", first ? "Bake the boards if they have been out of the bag over a week" : "Support pins moved clear of the parts now underneath"],
      watch: [],
      level: "green",
    });

    const vol = fine ? s.spiVolumePct.fine : s.spiVolumePct.standard;
    stations.push({
      key: "print",
      name: "Solder paste printer",
      what: `Paste is printed through a ${stencilUm} µm laser-cut stencil onto ${n0(deposits)} pads of each board.`,
      secPerPanel: s.printSec,
      inline: true,
      figures: [
        { label: "Paste a board", value: paste ? g(paste.grams) : "—" },
        { label: "Paste a panel", value: paste ? g(paste.grams * boards) : "—" },
        { label: "Apertures a panel", value: n0(deposits * boards) },
        { label: "Stencil", value: `${stencilUm} µm${paste?.heavyParts ? `, double paste on ${paste.heavyParts} part${paste.heavyParts === 1 ? "" : "s"}` : ""}` },
        { label: "Smallest area ratio", value: areaRatio ? `${areaRatio.value.toFixed(2)} at ${areaRatio.ref}${areaRatio.pkg ? ` (${areaRatio.pkg})` : ""}` : "—" },
      ],
      settings: [
        `Squeegee ${fine ? "25–40" : "30–60"} mm/s, metal blade at 60°`,
        `Separation ${fine ? "0.5–1" : "1–3"} mm/s`,
        `Under-stencil wipe every ${fine ? Math.max(2, Math.round(cfg.consumables.printsPerWipe / 2)) : cfg.consumables.printsPerWipe} prints`,
        `Paste on the stencil no longer than ${s.pasteStencilLifeH} h; SAC305 type ${tiny.length || (finest !== null && finest <= 0.4) ? "5" : "4"}`,
      ],
      watch: [
        ...(tightRelease ? [`Area ratio ${areaRatio!.value.toFixed(2)} is under ${s.minAreaRatio}: paste will not release cleanly at ${areaRatio!.ref}. Use a thinner or stepped-down foil, or a nano-coated stencil.`] : []),
        ...(paste?.source === "packages" ? ["Paste figures are estimated from the packages — the Gerber paste layer would give the real apertures."] : []),
      ],
      level: tightRelease ? "amber" : "green",
    });

    stations.push({
      key: "spi",
      name: "3D paste inspection (SPI)",
      what: `Every deposit is measured before a part goes down — ${n0(deposits * boards)} on a panel.`,
      secPerPanel: s.spiBaseSec + deposits * boards * s.spiSecPerDeposit,
      inline: true,
      figures: [
        { label: "Deposits a board", value: n0(deposits) },
        { label: "Deposits in the lot", value: n0(deposits * qty) },
        { label: "Volume window", value: range(vol, "%") },
      ],
      settings: ["Height and area as well as volume", "Offset under a quarter of the pad", "A failed panel is washed and reprinted, never touched up"],
      watch: input.line && !input.line.hasSpi ? ["This line has no SPI on file: print quality is only seen after reflow."] : [],
      level: input.line && !input.line.hasSpi ? "amber" : "green",
    });

    const placeSec = pass.secondsPerBoard * boards;
    stations.push({
      key: "place",
      name: "Pick and place",
      what: `${n0(here.length)} parts are placed on each board, ${n0(here.length * boards)} on a panel.`,
      secPerPanel: placeSec,
      inline: true,
      figures: [
        { label: "Placements a board", value: n0(here.length) },
        { label: "Placements in the lot", value: n0(here.length * qty) },
        { label: "Feeders", value: input.feeders ? `${input.feeders.needed}${input.feeders.slots ? ` of ${input.feeders.slots} slots` : ""}${input.feeders.setups > 1 ? `, ${input.feeders.setups} set-ups` : ""}` : "—" },
        { label: "Finest pitch", value: finest !== null ? `${finest} mm` : "—" },
        { label: "Rated speed", value: input.line?.capacityCph ? `${n0(input.line.capacityCph)} cph` : "—" },
      ],
      settings: [
        "Feeders verified by barcode against the kit",
        fine ? "Fine-pitch and BGA parts from the flexible head with upward vision" : "Chip shooter for passives, flexible head for ICs",
        `Set-up ${pass.setupHours} h a lot; first article checked before the run`,
      ],
      watch: [
        ...(tiny.length ? [`${tiny.length} parts of 0201 size or smaller: nozzle and feeder condition decide the yield.`] : []),
        ...(input.feeders && input.feeders.setups > 1 ? [`${input.feeders.needed} feeders do not fit one set-up: the panel passes the machine ${input.feeders.setups} times.`] : []),
        ...(input.moistureSensitive ? [`${input.moistureSensitive} moisture-sensitive parts: floor life runs from bag opening.`] : []),
      ],
      level: (input.feeders && input.feeders.setups > 1) || tiny.length ? "amber" : "green",
    });

    const oven = s.oven;
    const speedMmPerSec = (oven.conveyorMPerMin * 1000) / 60;
    const p = s.profile;
    const hanging = !first && twoSided ? input.parts.filter((x) => x.mount === "SMT" && x.side === input.passes[0].side && (x.kind === "can" || x.kind === "module" || x.kind === "power" || Math.max(x.lengthMm, x.widthMm) >= 15)) : [];
    stations.push({
      key: "reflow",
      name: "Reflow oven",
      what: `The panel rides through the oven in about ${r1((oven.heatedLengthM * 1000) / speedMmPerSec / 60)} min; the paste melts at ${p.liquidusC} °C and the joints form.`,
      secPerPanel: (input.panel.lengthMm + oven.panelGapMm) / speedMmPerSec,
      inline: true,
      figures: [
        { label: "Peak on the board", value: range(p.peakC, "°C") },
        { label: `Time above ${p.liquidusC} °C`, value: range(p.talSec, "s") },
        { label: "Soak", value: `${range(p.soakC, "°C")} for ${range(p.soakSec, "s")}` },
        { label: "Ramp up / cool", value: `${range(p.rampCPerSec, "°C/s")} / ${range(p.coolCPerSec, "°C/s")}` },
        { label: "Conveyor", value: `${oven.conveyorMPerMin} m/min` },
      ],
      settings: [
        "Profile measured with thermocouples on the heaviest and the smallest part",
        bga.length || (finest !== null && finest <= 0.4) ? "Nitrogen recommended for the BGA / LGA and fine-pitch joints" : "Air atmosphere is enough for this board",
        input.board.layers >= 6 || input.board.thicknessMm > 1.6 ? `A ${input.board.layers}-layer, ${input.board.thicknessMm} mm board heats slowly: longer soak, check the BGA centre` : "Standard soak for a board of this mass",
      ],
      watch: [
        ...(hanging.length ? [`${hanging.length} heavy part${hanging.length === 1 ? "" : "s"} on the first side (${hanging.slice(0, 4).map((x) => x.refDes).join(", ")}) hang upside down now: glue them or check they hold by surface tension.`] : []),
        ...(heavy.length && tiny.length ? ["Large and very small parts on one side: the profile is a compromise between cold joints and overheating."] : []),
      ],
      level: hanging.length ? "amber" : "green",
    });

    stations.push({
      key: "aoi",
      name: "Optical inspection (AOI)",
      what: `Cameras check presence, polarity, offset and the fillet of ${n0(joints - hiddenJoints)} visible joints a board.`,
      secPerPanel: s.aoiBaseSec + (joints - hiddenJoints) * boards * s.aoiSecPerJoint,
      inline: true,
      figures: [
        { label: "Visible joints a board", value: n0(joints - hiddenJoints) },
        { label: "Visible joints in the lot", value: n0((joints - hiddenJoints) * qty) },
        { label: "Not visible to AOI", value: hiddenJoints ? `${n0(hiddenJoints)} joints under ${n0(hidden.length)} part${hidden.length === 1 ? "" : "s"}` : "None" },
      ],
      settings: ["Programme taught on the first good board", "Tombstones, bridges, lifted leads, wrong or reversed parts", "Defects go to the repair station with the panel's code"],
      watch: input.line && !input.line.hasAoi ? ["This line has no AOI on file: joints would be inspected by eye."] : [],
      level: input.line && !input.line.hasAoi ? "amber" : "green",
    });

    if (hidden.length)
      stations.push({
        key: "xray",
        name: "X-ray",
        what: `${n0(hidden.length)} part${hidden.length === 1 ? " is" : "s are"} soldered under the body (${hidden.slice(0, 4).map((x) => x.refDes).join(", ")}${hidden.length > 4 ? ` +${hidden.length - 4}` : ""}): only X-ray sees those joints.`,
        secPerPanel: (s.xrayBaseSecPerBoard + hiddenJoints * s.xraySecPerJoint) * boards,
        inline: false,
        figures: [
          { label: "Hidden joints a board", value: n0(hiddenJoints) },
          { label: "Hidden joints in the lot", value: n0(hiddenJoints * qty) },
          { label: "Voiding accepted", value: `up to ${s.maxVoidPct} % of a ball` },
        ],
        settings: ["Bridges, opens, head-in-pillow and voiding", "Off the line, so it does not slow the takt", "Every board on a first lot; sampling once the process is proven"],
        watch: input.line && !input.line.hasXray ? ["No X-ray on this line: the boards go to another line or outside."] : [],
        level: input.line && !input.line.hasXray ? "amber" : "green",
      });

    const inline = stations.filter((x) => x.inline && x.secPerPanel !== null);
    const slowest = inline.reduce((a, b) => (b.secPerPanel! > a.secPerPanel! ? b : a));
    const taktSec = slowest.secPerPanel!;
    return {
      side: pass.side,
      pass: i + 1,
      placements: here.length,
      stations,
      taktSec,
      bottleneck: slowest.name,
      panelsPerHour: 3600 / taktSec,
      boardsPerHour: (3600 / taktSec) * boards,
      areaRatio,
    };
  });

  const runHours = sides.reduce((a, x) => a + (panels * x.taktSec) / 3600, 0);
  const setupHours = input.passes.reduce((a, x) => a + x.setupHours, 0);
  // A finished board has been round once per side.
  const secPerBoardAllSides = sides.reduce((a, x) => a + x.taktSec / boards, 0);
  const pasteGPerBoard = input.paste.reduce((a, x) => a + x.grams, 0);
  return {
    sides,
    panel: input.panel,
    panels,
    runHours,
    setupHours,
    boardsPerShift: secPerBoardAllSides > 0 ? Math.floor((hoursPerShift * 3600) / secPerBoardAllSides) : 0,
    pasteGPerBoard,
    pasteGPerPanel: pasteGPerBoard * boards,
    line: input.line ? `${input.line.code} (${input.line.name})` : null,
  };
}
