/**
 * PCB stack-ups for the layer-by-layer explorer. Thicknesses are typical fab values (µm) for a
 * 1.6 mm board; the explorer exaggerates them vertically so thin layers stay visible.
 */

export type StackLayerKind = "silk" | "mask" | "copper" | "prepreg" | "core";

export type StackLayer = {
  key: string;
  kind: StackLayerKind;
  label: string;
  um: number;
  /** For copper: what the layer carries. */
  role?: "signal" | "plane" | "mixed";
  detail: string;
};

export type ViaKind = "through" | "blind" | "buried" | "micro";

/** A via spans copper layers `from`..`to` (1 = top). */
export type StackVia = { kind: ViaKind; from: number; to: number; drillMm: number };

export type PcbStack = {
  key: string;
  label: string;
  summary: string;
  /** Top to bottom. */
  layers: StackLayer[];
  vias: StackVia[];
  notes: string[];
  version: number;
};

export const VIA_INFO: Record<ViaKind, { label: string; detail: string }> = {
  through: {
    label: "Through via",
    detail: "Mechanically drilled through the whole board and plated. Cheapest and most common; takes space on every layer, even where it doesn't connect.",
  },
  blind: {
    label: "Blind via",
    detail: "Starts on an outer layer and stops inside the board. Frees routing space underneath; needs sequential lamination or controlled-depth drilling.",
  },
  buried: {
    label: "Buried via",
    detail: "Connects inner layers only — invisible from outside. Drilled and plated in the inner core before the outer layers are pressed on.",
  },
  micro: {
    label: "Microvia",
    detail: "Laser-drilled, ≤150 µm, one dielectric deep. The basis of HDI: lets BGAs at 0.5 mm pitch and below fan out. Copper-filled when stacked.",
  },
};

export type FinishKey = "enig" | "hasl" | "osp" | "imm-ag";

export const FINISHES: { key: FinishKey; label: string; color: string; detail: string }[] = [
  { key: "enig", label: "ENIG", color: "#d9b44a", detail: "Electroless nickel, immersion gold. Flat, solderable for a year, good for fine pitch and BGAs. Watch for black pad (brittle Ni-P) on poorly controlled lines." },
  { key: "hasl", label: "HASL (lead-free)", color: "#c9ccd1", detail: "Hot-air solder levelled. Cheap and robust, but uneven — not for fine-pitch or BGA boards." },
  { key: "osp", label: "OSP", color: "#c57b48", detail: "Organic solderability preservative on bare copper. Flat and cheap; short shelf life and only survives a limited number of reflow cycles." },
  { key: "imm-ag", label: "Immersion silver", color: "#e4e7eb", detail: "Flat and very solderable; tarnishes with sulphur — store sealed and assemble soon." },
];

const silk = (side: "top" | "bottom"): StackLayer => ({
  key: `silk-${side}`,
  kind: "silk",
  label: `Silkscreen (${side})`,
  um: 15,
  detail: "Epoxy ink: reference designators, outlines and polarity marks. Never on pads — ink on a pad stops solder wetting.",
});
const mask = (side: "top" | "bottom"): StackLayer => ({
  key: `mask-${side}`,
  kind: "mask",
  label: `Solder mask (${side})`,
  um: 20,
  detail: "Liquid photo-imageable epoxy. Openings expose the pads; the dams between fine-pitch pads stop solder bridges (needs ≥ 75–100 µm web).",
});
const cu = (n: number, total: number, role: StackLayer["role"], um: number, detail: string): StackLayer => ({
  key: `l${n}`,
  kind: "copper",
  label: `L${n} ${n === 1 ? "top" : n === total ? "bottom" : "inner"}`,
  um,
  role,
  detail,
});
const prepreg = (k: string, um: number): StackLayer => ({
  key: k,
  kind: "prepreg",
  label: "Prepreg",
  um,
  detail: "Glass cloth with partly cured resin; it melts and bonds the layers in the lamination press. Its thickness sets trace impedance to the next plane.",
});
const core = (k: string, um: number): StackLayer => ({
  key: k,
  kind: "core",
  label: "Core",
  um,
  detail: "Fully cured FR-4 laminate with copper on both sides, etched before lamination. Gives the board its stiffness.",
});

const OUTER = "Pads for the components and short fan-out traces; plated up to ~35–50 µm in the via plating step.";

export const PCB_STACKS: PcbStack[] = [
  {
    key: "2",
    label: "2-layer",
    summary: "One core, copper both sides: simple controllers, power boards, LED drivers.",
    layers: [
      silk("top"),
      mask("top"),
      cu(1, 2, "mixed", 35, `${OUTER} On two layers the return path is a ground pour shared with signals.`),
      core("core", 1500),
      cu(2, 2, "mixed", 35, "Mostly ground pour with the routes that didn't fit on top."),
      mask("bottom"),
      silk("bottom"),
    ],
    vias: [{ kind: "through", from: 1, to: 2, drillMm: 0.3 }],
    notes: ["No reference plane under most signals: keep edges slow and loops small for EMC.", "Cheapest to fabricate and to rework."],
    version: 1,
  },
  {
    key: "4",
    label: "4-layer",
    summary: "Signal / ground / power / signal — the default for anything with an MCU, USB or Ethernet.",
    layers: [
      silk("top"),
      mask("top"),
      cu(1, 4, "signal", 35, OUTER),
      prepreg("pp1", 200),
      cu(2, 4, "plane", 35, "Solid ground plane right under L1: the return path for every top-side signal and the reference for 50 Ω / 90 Ω impedance."),
      core("core", 1000),
      cu(3, 4, "plane", 35, "Power plane(s), split into islands for 3V3, 5V, 1V2…; plane-to-ground capacitance helps decoupling at high frequency."),
      prepreg("pp2", 200),
      cu(4, 4, "signal", 35, "Bottom signals and passives; references the power plane above (or a ground pour)."),
      mask("bottom"),
      silk("bottom"),
    ],
    vias: [{ kind: "through", from: 1, to: 4, drillMm: 0.3 }],
    notes: ["Keep the L1–L2 prepreg thin so traces couple tightly to ground.", "Never route a fast signal across a split in L2."],
    version: 1,
  },
  {
    key: "6",
    label: "6-layer",
    summary: "Two inner routing layers between planes: dense MCU/FPGA boards, DDR, multiple high-speed buses.",
    layers: [
      silk("top"),
      mask("top"),
      cu(1, 6, "signal", 35, OUTER),
      prepreg("pp1", 130),
      cu(2, 6, "plane", 35, "Ground plane — reference for L1 and L3."),
      core("c1", 360),
      cu(3, 6, "signal", 18, "Inner stripline routing: shielded between two planes, the quietest layer for clocks and fast buses."),
      prepreg("pp2", 360),
      cu(4, 6, "signal", 18, "Second inner routing layer, routed at right angles to L3 to limit crosstalk."),
      core("c2", 360),
      cu(5, 6, "plane", 35, "Power plane."),
      prepreg("pp3", 130),
      cu(6, 6, "signal", 35, "Bottom components and routing."),
      mask("bottom"),
      silk("bottom"),
    ],
    vias: [
      { kind: "through", from: 1, to: 6, drillMm: 0.25 },
      { kind: "buried", from: 3, to: 4, drillMm: 0.2 },
    ],
    notes: ["Buried vias add a lamination cycle — use only when the inner routing really needs them.", "Back-drill or use blind vias where a long via stub would ring at multi-gigabit rates."],
    version: 1,
  },
  {
    key: "8",
    label: "8-layer",
    summary: "Servers, gateways and large FPGAs: four routing layers, solid planes and room for many power rails.",
    layers: [
      silk("top"),
      mask("top"),
      cu(1, 8, "signal", 35, OUTER),
      prepreg("pp1", 100),
      cu(2, 8, "plane", 35, "Ground."),
      core("c1", 200),
      cu(3, 8, "signal", 18, "Stripline routing."),
      prepreg("pp2", 200),
      cu(4, 8, "plane", 35, "Power."),
      core("c2", 200),
      cu(5, 8, "plane", 35, "Ground."),
      prepreg("pp3", 200),
      cu(6, 8, "signal", 18, "Stripline routing."),
      core("c3", 200),
      cu(7, 8, "plane", 35, "Ground."),
      prepreg("pp4", 100),
      cu(8, 8, "signal", 35, "Bottom components and routing."),
      mask("bottom"),
      silk("bottom"),
    ],
    vias: [
      { kind: "through", from: 1, to: 8, drillMm: 0.25 },
      { kind: "blind", from: 1, to: 3, drillMm: 0.2 },
      { kind: "buried", from: 3, to: 6, drillMm: 0.2 },
    ],
    notes: ["Symmetric copper and dielectric around the centre keep the board flat through reflow.", "Thermal relief on planes for through-hole parts, or the wave can't heat the barrel."],
    version: 1,
  },
  {
    key: "hdi",
    label: "HDI 1+4+1",
    summary: "Phones, wearables and 0.4–0.5 mm BGAs: laser microvias on the outer layers over a 4-layer core.",
    layers: [
      silk("top"),
      mask("top"),
      cu(1, 6, "signal", 30, `${OUTER} Microvia pads can sit inside BGA pads (via-in-pad, copper-filled and planarised).`),
      prepreg("pp1", 75),
      cu(2, 6, "plane", 18, "Ground — reached from L1 through microvias."),
      core("c1", 400),
      cu(3, 6, "signal", 18, "Core routing."),
      prepreg("pp2", 400),
      cu(4, 6, "signal", 18, "Core routing."),
      core("c2", 400),
      cu(5, 6, "plane", 18, "Power."),
      prepreg("pp3", 75),
      cu(6, 6, "signal", 30, "Bottom components."),
      mask("bottom"),
      silk("bottom"),
    ],
    vias: [
      { kind: "micro", from: 1, to: 2, drillMm: 0.1 },
      { kind: "micro", from: 6, to: 5, drillMm: 0.1 },
      { kind: "buried", from: 2, to: 5, drillMm: 0.2 },
      { kind: "through", from: 1, to: 6, drillMm: 0.25 },
    ],
    notes: [
      "Each build-up layer is another lamination and laser cycle — cost rises quickly with 2+N+2 and stacked microvias.",
      "Via-in-pad must be filled and capped, or solder wicks into the via and leaves BGA joints starved.",
    ],
    version: 1,
  },
];

export function pcbStack(key: string | undefined): PcbStack {
  return PCB_STACKS.find((s) => s.key === key) ?? PCB_STACKS[1];
}
