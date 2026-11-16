/**
 * What is inside a chip package, and inside the silicon itself — the content for the package
 * cut-away and die explorers. Geometry is generated in the components; the words live here.
 */

export type PackageElement =
  | "mold"
  | "leadframe"
  | "die"
  | "attach"
  | "wire"
  | "lead"
  | "epad"
  | "substrate"
  | "ball"
  | "bump"
  | "underfill"
  | "lid"
  | "tim"
  | "rdl";

export type ChipPackage = {
  key: "soic" | "qfn" | "bga" | "fcbga" | "wlcsp";
  label: string;
  summary: string;
  /** Elements present in this package, in the order the explorer lists them. */
  elements: PackageElement[];
  ems: string[];
  version: number;
};

export const ELEMENT_INFO: Record<PackageElement, { label: string; color: string; detail: string }> = {
  mold: {
    label: "Mould compound",
    color: "#1d1e22",
    detail: "Silica-filled epoxy that protects the die and wires. It absorbs moisture — the reason for MSL ratings, baking and dry packs.",
  },
  leadframe: {
    label: "Leadframe / die paddle",
    color: "#c88a4b",
    detail: "Stamped or etched copper alloy: the paddle carries the die, the leads carry the signals. Silver- or NiPdAu-plated where wires land.",
  },
  die: {
    label: "Silicon die",
    color: "#4a5a78",
    detail: "The chip itself, typically 0.1–0.4 mm thick. Bond pads around its edge connect to the outside world.",
  },
  attach: {
    label: "Die attach",
    color: "#c9ccd2",
    detail: "Silver-filled epoxy or solder that glues the die to the paddle and conducts heat away. Voids here create hot spots.",
  },
  wire: {
    label: "Bond wires",
    color: "#e2b850",
    detail: "Gold or copper wires, 18–50 µm, ball-bonded to the die pad and stitched to the lead. Mould flow or vibration can sweep them into each other.",
  },
  lead: {
    label: "Leads",
    color: "#d0d3d8",
    detail: "Plated matte tin over copper. Coplanarity matters: a lifted lead is an open joint that AOI must catch.",
  },
  epad: {
    label: "Exposed pad",
    color: "#c9ccd2",
    detail: "The paddle's underside, soldered to the PCB for heat and ground. Use a windowed stencil (~50–70 % paste) to limit voids and float.",
  },
  substrate: {
    label: "Substrate",
    color: "#2f5b3b",
    detail: "A tiny multilayer PCB (BT resin or ABF build-up) that fans the die connections out to the ball grid.",
  },
  ball: {
    label: "Solder balls",
    color: "#cfd3d8",
    detail: "SAC305 balls, 0.3–0.6 mm. They collapse in reflow to form the joints — hidden, so only X-ray can check bridges, voids and head-in-pillow.",
  },
  bump: {
    label: "Flip-chip bumps",
    color: "#d9dce0",
    detail: "Solder or copper-pillar bumps on the die's active face, 40–150 µm pitch, connecting the die directly to the substrate.",
  },
  underfill: {
    label: "Underfill",
    color: "#9fb4c9",
    detail: "Epoxy wicked under the die to share the stress between the silicon and the substrate, which expand at very different rates.",
  },
  lid: {
    label: "Lid / heat spreader",
    color: "#b8bcc4",
    detail: "Nickel-plated copper lid that spreads the heat to a heatsink and protects the die. Large FPGAs and CPUs have one.",
  },
  tim: {
    label: "Thermal interface",
    color: "#8f969f",
    detail: "Thermal paste or indium between die and lid. The weakest link in the heat path.",
  },
  rdl: {
    label: "Redistribution layer",
    color: "#c88a4b",
    detail: "Copper traces built on the die surface that route the pads out to a grid of balls — the package is the die itself.",
  },
};

export const CHIP_PACKAGES: ChipPackage[] = [
  {
    key: "soic",
    label: "SOIC-8 (wire-bond)",
    summary: "Gull-wing leads on two sides, a leadframe inside: op-amps, regulators, drivers, memories.",
    elements: ["mold", "die", "attach", "wire", "leadframe", "lead"],
    ems: ["Easy to inspect and rework; AOI checks toe and heel fillets.", "Usually MSL 1–3 — check the label before exposure."],
    version: 1,
  },
  {
    key: "qfn",
    label: "QFN-32 (wire-bond)",
    summary: "No leads: pads on the underside edge plus a large exposed pad for heat. Small and cheap, harder to inspect.",
    elements: ["mold", "die", "attach", "wire", "leadframe", "epad"],
    ems: ["Side fillets are small; X-ray for voids under the exposed pad.", "Windowed paste on the exposed pad, or the part floats and the edge pads open."],
    version: 1,
  },
  {
    key: "bga",
    label: "BGA (wire-bond)",
    summary: "The die is wired to a substrate that spreads the connections over a ball grid underneath.",
    elements: ["mold", "die", "attach", "wire", "substrate", "ball"],
    ems: ["Joints are hidden: X-ray every first article and after any profile change.", "Warpage at reflow causes head-in-pillow — follow the MSL and profile rules."],
    version: 1,
  },
  {
    key: "fcbga",
    label: "Flip-chip BGA with lid",
    summary: "The die is flipped face-down onto the substrate on bumps — shortest connections, best for big, fast, hot chips.",
    elements: ["lid", "tim", "die", "bump", "underfill", "substrate", "ball"],
    ems: ["Heavy and large: check board support and warpage, use a profile with enough soak.", "Never press on the lid during rework or test-fixture loading."],
    version: 1,
  },
  {
    key: "wlcsp",
    label: "WLCSP (chip-scale)",
    summary: "No package at all: balls are placed directly on the die. As small as it gets — phones and wearables.",
    elements: ["die", "rdl", "ball"],
    ems: ["0.35–0.4 mm pitch needs type 4–5 paste and tight placement.", "Bare silicon edges chip easily — handle with care, often underfilled on the board."],
    version: 1,
  },
];

export function chipPackage(key: string | undefined): ChipPackage {
  return CHIP_PACKAGES.find((p) => p.key === key) ?? CHIP_PACKAGES[0];
}

// ───────────────────────────── Inside the silicon ─────────────────────────────

export type DieLayerKind = "substrate" | "well" | "isolation" | "gate" | "contact" | "metal" | "pad" | "passivation";

export type DieLayer = {
  key: string;
  kind: DieLayerKind;
  label: string;
  /** Wire pitch for metal layers, nm (illustrative for a ~28 nm node). */
  pitchNm?: number;
  detail: string;
};

/** Bottom to top: front-end (transistors) then back-end (wiring). */
export const DIE_LAYERS: DieLayer[] = [
  { key: "si", kind: "substrate", label: "Silicon substrate", detail: "Single-crystal silicon wafer, thinned to 100–400 µm. Everything happens in the top few micrometres." },
  { key: "wells", kind: "well", label: "N- and P-wells", detail: "Doped regions that hold the PMOS and NMOS transistors of CMOS logic." },
  { key: "sti", kind: "isolation", label: "Shallow trench isolation", detail: "Oxide-filled trenches that electrically separate neighbouring transistors." },
  { key: "gates", kind: "gate", label: "Transistor gates", detail: "Poly-silicon or metal gates over a nanometre-thin gate oxide. Gate oxide is what ESD destroys — hence wrist straps and ESD flooring." },
  { key: "contacts", kind: "contact", label: "Contacts", detail: "Tungsten plugs that connect the transistors to the first metal layer." },
  { key: "m1", kind: "metal", label: "M1 — local wiring", pitchNm: 90, detail: "Copper lines between neighbouring transistors, tightest pitch on the chip." },
  { key: "m2", kind: "metal", label: "M2", pitchNm: 90, detail: "Routed at right angles to M1; vias connect the layers." },
  { key: "m3", kind: "metal", label: "M3", pitchNm: 90, detail: "Local routing within a block." },
  { key: "m4", kind: "metal", label: "M4 — intermediate", pitchNm: 180, detail: "Wider lines connecting blocks." },
  { key: "m5", kind: "metal", label: "M5", pitchNm: 180, detail: "Intermediate routing." },
  { key: "m6", kind: "metal", label: "M6 — global / power", pitchNm: 800, detail: "Thick top copper for power grid and long buses: low resistance, carries the supply current." },
  { key: "pad", kind: "pad", label: "Aluminium bond pads", detail: "Thick aluminium pads where bond wires or bumps land. Too much bonding force cracks the layers underneath (cratering)." },
  { key: "pass", kind: "passivation", label: "Passivation", detail: "Silicon nitride / oxide sealing the die against moisture and ions; openings only over the pads." },
];
