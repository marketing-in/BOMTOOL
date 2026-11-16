/**
 * Plant costing defaults for customer quotes (INR). INDICATIVE starting points, not our cost model: every quote
 * starts from these and the quote step edits them per quote. Set them from the plant's own figures.
 */

export type Rates = {
  /** SMT line cost per running hour: machines, two operators, nitrogen, power, consumables. */
  smtLinePerHour: number;
  /** Real placements per hour ÷ the line's rated cph on high-mix work (feeder changes, vision, tray parts). */
  smtEfficiency: number;
  /** A board never leaves the line faster than this (printer cycle, conveyor, reflow pitch), seconds. */
  smtMinCycleSec: number;
  /** Feeder loading, programme, first-article check — per side, per lot. */
  smtSetupHoursPerSide: number;
  kittingPerLot: number;
  /** Solder paste, SAC305 type 4, per kilogram. */
  pastePerKg: number;
  thtPerPart: number;
  pressFitPerPart: number;
  xrayPerBoard: number;
  cleanPerBoard: number;
  coatingPerBoard: number;
  depanelPerBoard: number;
  programPerBoard: number;
  testPerBoard: number;
  boxBuildMinutes: number;
  labourPerMinute: number;
  systemTestPerUnit: number;
  packingPerUnit: number;
  /** Material handling, stores and scrap, % of material. */
  materialMarkupPct: number;
  marginPct: number;
  gstPct: number;
  /** Charge the customer for parts left over from MOQ / reel rounding. */
  chargeMoqExcess: boolean;
  nre: { stencilPerSide: number; programming: number; testFixture: number; firstArticle: number };
};

export const DEFAULT_RATES: Rates = {
  smtLinePerHour: 3200,
  smtEfficiency: 0.35,
  smtMinCycleSec: 20,
  smtSetupHoursPerSide: 1.5,
  kittingPerLot: 1500,
  pastePerKg: 6500,
  thtPerPart: 2.5,
  pressFitPerPart: 4,
  xrayPerBoard: 12,
  cleanPerBoard: 6,
  coatingPerBoard: 25,
  depanelPerBoard: 3,
  programPerBoard: 8,
  testPerBoard: 30,
  boxBuildMinutes: 12,
  labourPerMinute: 5,
  systemTestPerUnit: 20,
  packingPerUnit: 18,
  materialMarkupPct: 5,
  marginPct: 12,
  gstPct: 18,
  chargeMoqExcess: true,
  nre: { stencilPerSide: 4500, programming: 3500, testFixture: 25000, firstArticle: 2500 },
};

/** What each rate means on the quote step, in the order it is shown. */
export const RATE_FIELDS: { key: Exclude<keyof Rates, "nre" | "chargeMoqExcess">; label: string; unit: string }[] = [
  { key: "smtLinePerHour", label: "SMT line rate", unit: "₹/h" },
  { key: "smtEfficiency", label: "SMT efficiency (of rated cph)", unit: "0–1" },
  { key: "smtMinCycleSec", label: "Shortest SMT cycle per board", unit: "s" },
  { key: "smtSetupHoursPerSide", label: "SMT set-up per side, per lot", unit: "h" },
  { key: "kittingPerLot", label: "Kitting per lot", unit: "₹" },
  { key: "pastePerKg", label: "Solder paste", unit: "₹/kg" },
  { key: "thtPerPart", label: "Through-hole, per part", unit: "₹" },
  { key: "pressFitPerPart", label: "Press-fit, per part", unit: "₹" },
  { key: "xrayPerBoard", label: "X-ray, per board", unit: "₹" },
  { key: "cleanPerBoard", label: "Cleaning, per board", unit: "₹" },
  { key: "coatingPerBoard", label: "Conformal coat, per board", unit: "₹" },
  { key: "depanelPerBoard", label: "Depanelling, per board", unit: "₹" },
  { key: "programPerBoard", label: "Programming, per board", unit: "₹" },
  { key: "testPerBoard", label: "Functional test, per board", unit: "₹" },
  { key: "boxBuildMinutes", label: "Box build, minutes per unit", unit: "min" },
  { key: "labourPerMinute", label: "Labour rate", unit: "₹/min" },
  { key: "systemTestPerUnit", label: "System test, per unit", unit: "₹" },
  { key: "packingPerUnit", label: "Packing, per unit", unit: "₹" },
  { key: "materialMarkupPct", label: "Material handling", unit: "%" },
  { key: "marginPct", label: "Margin", unit: "%" },
  { key: "gstPct", label: "GST", unit: "%" },
];

/**
 * Bare-board estimate (src/lib/costing/pcb.ts). Base: rigid 2-layer FR-4, lead-free HASL, 1.6 mm, 1 oz, IPC
 * class 2, at production volume from an Indian fab. Each fab's price level is `capabilities.pricing.factor`.
 */
export const PCB_COST = {
  baseInrPerCm2: 0.55,
  /** Routing gap and rails each board carries on the production panel, mm per edge. */
  panelBorderMm: 5,
  /** Quantity curve on the panel area ordered: (floor + extra · e^(−m² / m2)) × (1 − slope · log10 m²) — steep for prototypes, gentle past a square metre. */
  volume: { floor: 0.85, extra: 1.9, m2: 0.6, slope: 0.07 },
  /** Minimum order value per lot. */
  minLot: { base: 1500, perLayer: 400 },
  /** Photo-plotting, CAM and electrical-test set-up, once per design. */
  tooling: { base: 2000, perLayer: 650 },
  copper: [1, 1, 1.15, 1.35, 1.6] as const,
  ipcClass3: 1.2,
  /** Thickness other than 1.6 mm. */
  offThickness: 1.08,
  /** Share of the board price a finish's relative cost acts on (finish cost index from pcb-materials). */
  finishWeight: 0.25,
  /** How much of an extra process's cost index (high-Tg …) applies on top of the main technology. */
  extraTechWeight: 0.35,
  /** Each two layers above six. */
  perTwoLayersAbove6: 0.18,
  hsn: "85340000",
};

/**
 * A box made to fit, by maker style (src/lib/costing/box.ts): unit = (base + perCm2 × outer surface) × volume
 * factor; one-off NRE (drawings and CNC programme, or the injection tool for moulded).
 */
export const BOX_COST = {
  /** Board edge to inner wall, each side. */
  clearanceMm: 6,
  /** Above the tallest part, under the lid. */
  headroomMm: 5,
  standoffMm: 6,
  wallMm: { "sheet-metal": 1.5, diecast: 3, extruded: 2.5, moulded: 2.5 },
  unit: {
    "sheet-metal": { base: 260, perCm2: 0.55 },
    diecast: { base: 180, perCm2: 0.35 },
    extruded: { base: 300, perCm2: 0.6 },
    moulded: { base: 90, perCm2: 0.12 },
  },
  /** Sheet metal and extrusions need drawings and a CNC programme; die-casting a die, moulding an injection tool. */
  nre: { "sheet-metal": 6000, diecast: 600000, extruded: 7500, moulded: 350000 },
  volume: { floor: 0.8, extra: 0.6, qty: 300 },
  /** CNC for one connector opening, per unit; programme and fixture once. */
  cutout: { perUnit: 35, nre: 2500 },
  hsn: "76169990",
};
