/**
 * PCB technologies — the bare-board families a product can be built on. Versioned seed data (Phase 12).
 * `needs` is what a fabricator must offer (src/lib/directory/pcb.ts matches it against Supplier.capabilities).
 */

export type PcbTechnology = {
  slug: string;
  name: string;
  /** One line: what it is. */
  summary: string;
  layers: [number, number];
  thicknessMm: [number, number];
  copperOz: [number, number];
  finishes: string[];
  minTraceMm: number;
  uses: string[];
  choose: string;
  dfm: string[];
  /** Relative bare-board cost, rigid 2-layer FR-4 = 1. */
  costIndex: number;
  leadDays: { proto: number; production: number };
  /** Special process a fab must list in capabilities.technologies (null = any rigid FR-4 shop). */
  needs: { minLayers: number; technology: string | null };
};

export const PCB_TECHNOLOGIES: PcbTechnology[] = [
  {
    slug: "fr4-2l",
    name: "Double-sided FR-4 (2 layers)",
    summary: "Glass-epoxy core with copper both sides, plated through-holes.",
    layers: [1, 2],
    thicknessMm: [0.8, 2.4],
    copperOz: [1, 2],
    finishes: ["HASL-LF", "ENIG", "OSP"],
    minTraceMm: 0.15,
    uses: ["Power supplies", "LED drivers", "Simple controllers", "Interface and relay boards"],
    choose: "Up to a few hundred parts at ≥ 0.5 mm pitch, no high-speed or RF lines.",
    dfm: ["Keep 0.15 mm trace/space for the cheapest panel price", "HASL is fine down to 0.65 mm pitch; finer needs ENIG", "Use a solid ground pour on the bottom"],
    costIndex: 1,
    leadDays: { proto: 4, production: 10 },
    needs: { minLayers: 2, technology: null },
  },
  {
    slug: "fr4-4l",
    name: "Multilayer FR-4 (4 layers)",
    summary: "Two signal layers outside, ground and power planes inside.",
    layers: [4, 4],
    thicknessMm: [0.8, 2.0],
    copperOz: [1, 2],
    finishes: ["ENIG", "HASL-LF", "OSP", "ImAg"],
    minTraceMm: 0.1,
    uses: ["MCU and gateway boards", "USB / Ethernet", "Mixed-signal sensors"],
    choose: "Any board with USB, Ethernet, fast clocks, QFN/fine-pitch parts or EMC requirements.",
    dfm: ["Stack-up: signal / GND / PWR / signal", "Controlled impedance (90 Ω USB, 100 Ω Ethernet) needs the fab's stack-up", "ENIG for flat QFN and BGA pads"],
    costIndex: 1.6,
    leadDays: { proto: 6, production: 12 },
    needs: { minLayers: 4, technology: null },
  },
  {
    slug: "fr4-6l-plus",
    name: "Multilayer FR-4 (6–12 layers)",
    summary: "More routing and plane layers for dense or high-speed designs.",
    layers: [6, 12],
    thicknessMm: [1.0, 2.4],
    copperOz: [0.5, 2],
    finishes: ["ENIG", "ImAg", "ENEPIG"],
    minTraceMm: 0.09,
    uses: ["Processor and FPGA boards", "Motor controllers with gate drivers", "Telecom"],
    choose: "BGAs, DDR memory, several power rails or many differential pairs.",
    dfm: ["Symmetric stack-up to avoid bow and twist", "Back-drill or blind vias for fast stubs", "Ask for an impedance coupon"],
    costIndex: 2.6,
    leadDays: { proto: 8, production: 15 },
    needs: { minLayers: 6, technology: null },
  },
  {
    slug: "hdi",
    name: "HDI (microvias, any-layer)",
    summary: "Laser-drilled microvias, stacked or staggered, for fine-pitch BGAs.",
    layers: [6, 16],
    thicknessMm: [0.4, 1.6],
    copperOz: [0.5, 1],
    finishes: ["ENIG", "ENEPIG", "ImAg"],
    minTraceMm: 0.075,
    uses: ["Wearables", "Handhelds", "0.4–0.5 mm pitch BGAs"],
    choose: "BGA pitch ≤ 0.65 mm, very small boards, via-in-pad.",
    dfm: ["Via-in-pad must be filled and capped", "Limit stacked microvia levels for yield", "Expect 1.5–3× the cost of through-hole multilayer"],
    costIndex: 4,
    leadDays: { proto: 10, production: 18 },
    needs: { minLayers: 6, technology: "hdi" },
  },
  {
    slug: "high-tg",
    name: "High-Tg FR-4 (Tg ≥ 170 °C)",
    summary: "FR-4 that stays stable through hot reflow, thermal cycling and hot environments.",
    layers: [2, 12],
    thicknessMm: [0.8, 3.2],
    copperOz: [1, 3],
    finishes: ["ENIG", "HASL-LF", "ImAg"],
    minTraceMm: 0.1,
    uses: ["Motor drives", "Automotive", "Industrial at 85–105 °C ambient", "Thick lead-free boards"],
    choose: "Ambient above ~85 °C, many reflow passes, thick multilayers.",
    dfm: ["Specify Tg and Td on the drawing", "Combine with 2 oz copper for power stages"],
    costIndex: 1.4,
    leadDays: { proto: 6, production: 14 },
    needs: { minLayers: 2, technology: "high-tg" },
  },
  {
    slug: "heavy-copper",
    name: "Heavy copper (3–10 oz)",
    summary: "Thick copper for high currents and heat spreading.",
    layers: [2, 6],
    thicknessMm: [1.6, 3.2],
    copperOz: [3, 10],
    finishes: ["HASL-LF", "ENIG"],
    minTraceMm: 0.3,
    uses: ["Battery management", "Motor power stages", "Power distribution"],
    choose: "Tens of amps on the board, or bus bars you want to remove.",
    dfm: ["Trace/space grows with copper weight (≥ 0.3 mm at 3 oz)", "Etch compensation on fine features", "Balanced copper on both sides"],
    costIndex: 2.2,
    leadDays: { proto: 8, production: 18 },
    needs: { minLayers: 2, technology: "heavy-copper" },
  },
  {
    slug: "mcpcb",
    name: "Aluminium metal-core (MCPCB)",
    summary: "Single copper layer on a thin dielectric bonded to an aluminium base.",
    layers: [1, 2],
    thicknessMm: [1.0, 2.0],
    copperOz: [1, 2],
    finishes: ["HASL-LF", "ENIG", "OSP"],
    minTraceMm: 0.2,
    uses: ["High-power LED modules", "Power resistor and MOSFET boards"],
    choose: "Most heat leaves through the board's back into a heatsink.",
    dfm: ["Single-sided SMD only; no plated through-holes", "Dielectric 1–3 W/m·K — state it", "V-score, don't route, to keep edges clean"],
    costIndex: 1.8,
    leadDays: { proto: 6, production: 14 },
    needs: { minLayers: 1, technology: "mcpcb" },
  },
  {
    slug: "flex",
    name: "Flexible (polyimide)",
    summary: "Copper on polyimide film that bends or folds in the product.",
    layers: [1, 4],
    thicknessMm: [0.1, 0.3],
    copperOz: [0.5, 1],
    finishes: ["ENIG", "OSP"],
    minTraceMm: 0.075,
    uses: ["Display and camera links", "Wearables", "Moving parts"],
    choose: "Replacing a cable or fitting a folded shape.",
    dfm: ["Stiffeners under connectors and parts", "Curved traces in bend areas, no vias there", "Rolled-annealed copper for dynamic flexing"],
    costIndex: 3,
    leadDays: { proto: 8, production: 16 },
    needs: { minLayers: 1, technology: "flex" },
  },
  {
    slug: "rigid-flex",
    name: "Rigid-flex",
    summary: "Rigid sections joined by flex layers in one laminated board.",
    layers: [4, 12],
    thicknessMm: [0.8, 2.0],
    copperOz: [0.5, 1],
    finishes: ["ENIG", "ImAg"],
    minTraceMm: 0.075,
    uses: ["Compact handhelds", "Aerospace and medical", "Folded multi-board products"],
    choose: "Several boards plus their connectors in a tight volume, where reliability beats cost.",
    dfm: ["Keep the flex region out of the plated-hole zone", "Fewer layers in the bend", "Panelise with the fab's guidance early"],
    costIndex: 6,
    leadDays: { proto: 14, production: 25 },
    needs: { minLayers: 4, technology: "rigid-flex" },
  },
  {
    slug: "rf-ptfe",
    name: "RF / microwave (PTFE or hydrocarbon hybrid)",
    summary: "Low-loss laminate (Rogers class) on the RF layers, FR-4 elsewhere.",
    layers: [2, 8],
    thicknessMm: [0.5, 1.6],
    copperOz: [0.5, 1],
    finishes: ["ENIG", "ImAg"],
    minTraceMm: 0.1,
    uses: ["Radar", "Antennas", "Above ~3 GHz transceivers"],
    choose: "Losses or Dk tolerance matter at your frequency.",
    dfm: ["State the laminate (Dk, Df, thickness)", "Hybrid stack-ups need the fab's press plan", "No HASL on RF lines"],
    costIndex: 4.5,
    leadDays: { proto: 12, production: 20 },
    needs: { minLayers: 2, technology: "rf-ptfe" },
  },
];

export const pcbTechnology = (slug: string) => PCB_TECHNOLOGIES.find((t) => t.slug === slug) ?? null;
