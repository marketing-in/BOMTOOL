/**
 * Our machines model by model: what each one can place, inspect, solder or cut, when the model came out, and the
 * figures that decide whether a job fits. Generic "what a reflow oven is" lives in src/knowledge/dictionary/machines.ts;
 * this file is per model.
 *
 * Truth rules:
 * - `source: "sheet"`: the figure is in our own machine documents (prisma/seed-data/factory.ts, or the sheets and
 *   brochures in the plant's MACHINE DETAILS folder). The sheet wins wherever it gives a figure.
 * - `source: "maker"`: the maker's published spec (or a dealer quoting it). Verify before quoting a customer.
 * - `null`: not known. Never a guess.
 *
 * Pure data and small pure helpers: no React, no database.
 */

export type FactSource = "sheet" | "maker";

/** One figure and where it came from. `null` = not known. */
export type Fact<T> = { value: T; source: FactSource; note?: string } | null;

/** MACHINE_KINDS keys (src/lib/ops/machines.ts) used by the models below. */
export type ModelKind =
  | "LASER_MARKER"
  | "STENCIL_PRINTER"
  | "SPI"
  | "PICK_AND_PLACE"
  | "REFLOW_OVEN"
  | "AOI"
  | "WAVE_SOLDER"
  | "CONFORMAL_COATER"
  | "DEPANELER"
  | "SCREWDRIVER_STATION"
  | "OTHER";

export type PlacementProfile = {
  /** Smallest chip, imperial code from CHIP_ORDER. */
  minChip: Fact<string>;
  /** Largest part body, length × width. */
  maxPartMm: Fact<[number, number]>;
  maxPartHeightMm: Fact<number>;
  /** Finest lead pitch of a leaded part. */
  minPitchMm: Fact<number>;
  minBallPitchMm?: Fact<number>;
  /** Placement accuracy, ± µm. */
  accuracyUm: Fact<number>;
  accuracyNote?: string;
  heads: Fact<string>;
  nozzles: Fact<string>;
  feederSlots8mm: Fact<number>;
  ratedCph: Fact<number>;
  ipcCph?: Fact<number>;
  trays?: Fact<string>;
};

export type BoardLimits = {
  maxMm: Fact<[number, number]>;
  minMm: Fact<[number, number]>;
  thicknessMm: Fact<[number, number]>;
};

export type KeyFact = { label: string; value: string; source: FactSource; note?: string };

export type MachineModel = {
  /** Kebab slug, e.g. "yamaha-m20-i-pulse". */
  id: string;
  /** Lowercase substrings matched against `${vendor} ${model}` after `normName` (punctuation → spaces). */
  match: string[];
  maker: string;
  model: string;
  kind: ModelKind;
  family?: string;
  /** Year introduced; era or the evidence in the note. */
  launched: Fact<number>;
  /** ≤ 14 words: what this model is good at. */
  oneLiner: string;
  /** Placers only. */
  placement?: PlacementProfile;
  board: BoardLimits;
  /** 3–8 short, decision-relevant figures. */
  keyFacts: KeyFact[];
  /** ≤ 3, ≤ 10 words each. */
  strengths: string[];
  /** ≤ 3, ≤ 10 words each: what it can not do / watch-outs. */
  limits: string[];
  power?: string;
  air?: string;
  footprintMm?: string;
  weightKg?: number;
  links?: { label: string; url: string }[];
  /** Installed in a line today (false: earlier kit, kit no longer in the plant (17 Nov 2026), or a brochure candidate). */
  installed: boolean;
  confidence: "high" | "medium" | "low";
  version: 1;
};

/** Date this set of profiles was last reviewed. */
export const MACHINE_MODELS_VERSION = "2026-11-17";

const sheet = <T>(value: T, note?: string): Fact<T> => (note ? { value, source: "sheet", note } : { value, source: "sheet" });
const maker = <T>(value: T, note?: string): Fact<T> => (note ? { value, source: "maker", note } : { value, source: "maker" });
const kf = (label: string, value: string, source: FactSource, note?: string): KeyFact => (note ? { label, value, source, note } : { label, value, source });
const NO_BOARD: BoardLimits = { maxMm: null, minMm: null, thicknessMm: null };

export const MACHINE_MODELS: MachineModel[] = [
  // ── Line 1
  {
    id: "famecs-lative-f20",
    match: ["famecs lative f20", "lative f20"],
    maker: "Famecs",
    model: "Lative F20",
    kind: "LASER_MARKER",
    launched: null,
    oneLiner: "Inline PCB laser marker for QR and dot-matrix traceability codes.",
    board: { maxMm: sheet([430, 330]), minMm: sheet([70, 70]), thicknessMm: sheet([0.5, 2]) },
    keyFacts: [
      kf("Laser power", "30 W", "sheet"),
      kf("Marks", "QR / dot matrix", "sheet"),
      kf("Board thickness", "0.5–2.0 mm", "sheet"),
      kf("Width change", "Automatic", "sheet"),
      kf("Interface", "SMEMA, inline", "sheet"),
    ],
    strengths: ["Codes every board before paste printing", "Automatic width change between jobs"],
    limits: ["Boards over 2.0 mm thick will not pass", "Laser type and wavelength not on sheet", "Smallest board 70 × 70 mm"],
    power: "230 V AC, 1-phase",
    air: "5–6 bar",
    installed: true,
    confidence: "low",
    version: 1,
  },
  {
    id: "htgd-gd450",
    match: ["htgd gd450", "gd450"],
    maker: "HTGD",
    model: "GD450 (semi-automatic)",
    kind: "STENCIL_PRINTER",
    launched: null,
    oneLiner: "Semi-automatic stencil printer for short runs and prototypes.",
    board: { maxMm: sheet([450, 350]), minMm: sheet([50, 50]), thicknessMm: sheet([0.4, 6]) },
    keyFacts: [
      kf("Cycle", "15–20 s", "sheet"),
      kf("Print speed", "≤ 200 mm/s", "sheet"),
      kf("Stencil frames", "18–29 in", "sheet"),
      kf("Clamping", "Edge", "sheet"),
      kf("Loading", "Manual", "sheet"),
    ],
    strengths: ["Takes thick boards up to 6 mm", "Quick setup for small lots"],
    limits: ["Manual loading caps line speed", "No published print accuracy", "Cycle twice the MPM's 11 s"],
    power: "220 V, 1-phase",
    installed: true,
    confidence: "low",
    version: 1,
  },
  {
    id: "ecopmin-conveyor",
    match: ["ecopmin"],
    maker: "Ecopmin",
    model: "Link and cooling conveyors (0.6 m / 1 m)",
    kind: "OTHER",
    launched: null,
    oneLiner: "SMEMA link, inspection and cooling conveyors between Line 1 machines.",
    board: { maxMm: null, minMm: null, thicknessMm: null },
    keyFacts: [
      kf("Board width", "50–480 mm", "sheet"),
      kf("Speed", "9 m/min", "sheet"),
      kf("Cycle", "< 6 s link, 12 s cooling", "sheet"),
      kf("Interface", "SMEMA", "sheet"),
      kf("Controller", "PLC", "sheet"),
    ],
    strengths: ["Inspection stop with magnifier on 1 m unit", "Fan cooling with temperature monitor"],
    limits: ["Boards over 480 mm wide will not pass"],
    power: "220 V, 1-phase",
    installed: true,
    confidence: "medium",
    version: 1,
  },
  {
    id: "magic-ray-icon",
    match: ["magic ray icon", "magicray icon"],
    maker: "Magic-ray",
    model: "ICON",
    kind: "SPI",
    family: "Magic-ray ICON 3D SPI (ICON+ single lane, ICON-D+ dual lane)",
    launched: null,
    oneLiner: "3D solder paste inspection straight after the printer.",
    board: { maxMm: sheet([510, 510]), minMm: sheet([50, 50]), thicknessMm: sheet([0.4, 5]) },
    keyFacts: [
      kf("Technology", "3D", "sheet"),
      kf("Camera", "4 MP", "sheet", "Maker (dealer) lists 12 MP"),
      kf("Height accuracy", "1 µm", "sheet", "Maker (dealer) lists 0.37 µm height resolution"),
      kf("Speed", "22–56 cm²/s", "sheet", "Maker (dealer) lists 400–450 ms per FOV"),
      kf("Largest feature", "10 × 10 mm", "sheet"),
      kf("GR&R", "≤ 10 %", "maker", "Dealer data"),
    ],
    strengths: ["Measures paste volume, not just area", "Catches print faults before placement"],
    limits: ["Sheet figures copy the Koh Young slide", "Largest feature 10 × 10 mm"],
    power: "220 V, 1-phase",
    footprintMm: "1000 × 1620 × 1360",
    installed: true,
    confidence: "low",
    version: 1,
  },
  {
    id: "yamaha-m20-i-pulse",
    match: ["m20 i pulse", "i pulse m20", "ipulse m20", "m20 ipulse"],
    maker: "Yamaha (i-Pulse)",
    model: "M20 i-Pulse",
    kind: "PICK_AND_PLACE",
    family: "Yamaha i-Pulse M-series modular mounters",
    launched: maker(2017, "US launch at IPC APEX, Feb 2017; sold earlier in Asia under i-Pulse"),
    oneLiner: "Flexible mounter for odd-form, tall and large parts on high-mix boards.",
    placement: {
      minChip: sheet("0201", "Our nozzle kit has no P050; the maker range reaches 01005"),
      maxPartMm: sheet([120, 90]),
      maxPartHeightMm: sheet(25, "Maker table gives 30 mm"),
      minPitchMm: null,
      accuracyUm: sheet(25, "IC figure; maker chip accuracy ±40 µm (3σ)"),
      accuracyNote: "±25 µm ICs, ±40 µm chips (3σ, maker)",
      heads: sheet("6 heads + 2 theta"),
      nozzles: sheet("24 slots: 51–56, 62 chip; 72/73 MELF; 5, 18, 20 large"),
      feederSlots8mm: sheet(144),
      ratedCph: sheet(30000),
      ipcCph: maker(23000, "IPC 9850, 6 heads + 2 theta"),
      trays: sheet("2 tray + 7 stick"),
    },
    board: { maxMm: sheet([540, 350], "Maker: up to 1,480 mm long with buffer option"), minMm: sheet([50, 30]), thicknessMm: sheet([0.4, 4.8]) },
    keyFacts: [
      kf("Measured speed", "7,000–10,000 CPH", "sheet"),
      kf("Rated speed", "30,000 CPH", "sheet"),
      kf("Feeders", "144 × 8 mm, F3 electric 8–56 mm", "sheet"),
      kf("Camera", "Single 2 MP", "sheet"),
      kf("Feeder bank", "Fixed", "sheet"),
      kf("Placement force", "5–60 N (force control option)", "maker"),
    ],
    strengths: ["Large parts up to 120 × 90 mm", "Tall parts up to 25 mm", "Wide 8–56 mm feeder range"],
    limits: ["No 01005 nozzle in our kit", "Measured speed about a third of rated", "Fixed feeder bank: slow changeovers"],
    power: "440 V, 3-phase",
    installed: true,
    confidence: "medium",
    version: 1,
  },
  {
    id: "tronwin-tw-vp860n",
    match: ["tronwin tw vp860n", "tw vp860n", "vp860n"],
    maker: "Tronwin",
    model: "TW-VP860N",
    kind: "REFLOW_OVEN",
    launched: null,
    oneLiner: "Eight-zone convection reflow oven for Line 1.",
    board: { maxMm: sheet([1000, 430], "Sheet gives width 50–430 mm"), minMm: sheet([50, 50]), thicknessMm: null },
    keyFacts: [
      kf("Heating zones", "8 top + 8 bottom", "sheet"),
      kf("Cooling zones", "2", "sheet"),
      kf("Heated length", "2,652 mm", "sheet"),
      kf("Max temperature", "350 °C, ±2 °C", "sheet"),
      kf("Conveyor", "Chain + mesh, 50–2,000 mm/min", "sheet"),
      kf("Warm-up", "20–25 min", "sheet"),
    ],
    strengths: ["350 °C headroom for lead-free", "Mesh belt for odd boards", "Dual exhaust"],
    limits: ["No built-in profiler: use a logger", "Manual width and lubrication", "Nitrogen not on sheet"],
    power: "440 V, 3-phase",
    installed: true,
    confidence: "low",
    version: 1,
  },
  {
    id: "magic-ray-v5000",
    match: ["magic ray v5000", "magicray v5000"],
    maker: "Magic-ray",
    model: "V5000",
    kind: "AOI",
    family: "Magic-ray V-series 2D AOI",
    launched: null,
    oneLiner: "2D post-reflow AOI for presence, polarity, bridges and fillets.",
    board: { maxMm: sheet([610, 510]), minMm: sheet([60, 50]), thicknessMm: sheet([0.6, 6]) },
    keyFacts: [
      kf("Technology", "2D", "sheet"),
      kf("Camera", "5 MP", "sheet"),
      kf("Lighting", "RGBW 4-colour LED", "sheet"),
      kf("Field of view", "60 × 49 mm", "sheet", "From the V5300 brochure (same family)"),
      kf("Speed", "225 ms per FOV", "sheet", "From the V5300 brochure (same family)"),
      kf("Interface", "Ethernet / SMEMA", "sheet"),
    ],
    strengths: ["Finds missing, wrong, reversed and tombstoned parts", "Catches bridges and IC lead bends"],
    limits: ["2D only: no true height or coplanarity", "Cannot see joints under BGA/QFN", "FOV and speed borrowed from V5300"],
    power: "220 V, 1-phase, 5 A",
    installed: true,
    confidence: "low",
    version: 1,
  },

  // ── Line 2
  {
    id: "mpm-momentum-ii-100",
    match: ["mpm momentum ii 100", "momentum ii 100", "momentum 2 100"],
    maker: "MPM (ITW EAE)",
    model: "Momentum II 100",
    kind: "STENCIL_PRINTER",
    family: "MPM Momentum II stencil printers",
    launched: maker(2020, "Momentum II BTB and 100 launched April 2020"),
    oneLiner: "Fully automatic stencil printer for volume SMT.",
    board: { maxMm: sheet([610, 508], "Maker: 609.6 × 508 mm"), minMm: sheet([50, 50], "Maker: 50.8 × 50.8 mm"), thicknessMm: sheet([0.2, 5]) },
    keyFacts: [
      kf("Cycle", "11 s", "sheet"),
      kf("Print speed", "≤ 304 mm/s", "sheet"),
      kf("Wet print accuracy", "±20 µm @ 6σ, Cpk 2.0", "maker", "Dealer-quoted; verify"),
      kf("Stencil frame", "29 in", "sheet"),
      kf("Clamping", "Top", "sheet", "Momentum II range offers EdgeLoc side clamping"),
      kf("Loading", "Automatic", "sheet"),
    ],
    strengths: ["Automatic load, align and print", "Thin boards down to 0.2 mm", "Large boards up to 610 × 508 mm"],
    limits: ["29-inch frames only", "Top clamps need clear board edges"],
    power: "220 V, 1-phase",
    installed: true,
    confidence: "medium",
    version: 1,
  },
  {
    id: "koh-young-ky8030-2",
    match: ["koh young ky8030 2", "kohyoung ky8030 2", "ky8030 2"],
    maker: "Koh Young",
    model: "KY8030-2",
    kind: "SPI",
    family: "Koh Young KY8030 true-3D SPI",
    launched: null,
    oneLiner: "Proven true-3D paste inspection with shadow-free dual projection.",
    board: { maxMm: sheet([510, 510]), minMm: sheet([50, 50]), thicknessMm: sheet([0.4, 5]) },
    keyFacts: [
      kf("Technology", "3D dual-projection moiré", "maker"),
      kf("Camera", "4 MP", "sheet"),
      kf("Height accuracy", "1 µm", "sheet"),
      kf("Speed", "22–56 cm²/s", "sheet"),
      kf("Largest feature", "10 × 10 mm", "sheet"),
    ],
    strengths: ["Dual projection removes shadow errors", "Maker's best-selling SPI: data widely trusted"],
    limits: ["Older model; KY8030-3 succeeds it", "Largest feature 10 × 10 mm"],
    power: "220 V, 1-phase",
    links: [{ label: "Koh Young KY8030-2", url: "https://kohyoung.com/en/?p=3401" }],
    installed: true,
    confidence: "medium",
    version: 1,
  },
  {
    id: "yamaha-ysm20r",
    match: ["yamaha ysm20r", "ysm20r"],
    maker: "Yamaha",
    model: "YSM20R Z:LEX",
    kind: "PICK_AND_PLACE",
    family: "Yamaha Z:LEX high-efficiency modular mounters",
    launched: maker(2018, "Announced Jan 2018, on sale Apr 2018; YSM20 was 2014"),
    oneLiner: "High-speed all-round mounter; the volume workhorse of Lines 2 and 3.",
    placement: {
      minChip: sheet("0201", "HM head reaches metric 0201 (01005) on request; our nozzles start at 301A"),
      maxPartMm: sheet([100, 55], "Yamaha W55 × L100; machinery sheet says 55 × 55"),
      maxPartHeightMm: sheet(28, "FM head; HM heads 15 mm"),
      minPitchMm: null,
      accuracyUm: sheet(35, "±35 µm (±25 µm) Cpk ≥ 1.0; machinery sheet quotes 25 µm"),
      accuracyNote: "±35 µm Cpk ≥ 1.0 (±25 µm 3σ), Yamaha",
      heads: sheet("HM 10-nozzle × 3 + FM 5-nozzle × 1"),
      nozzles: sheet("301A–307A; 307A for 32–45 mm parts"),
      feederSlots8mm: sheet(128),
      ratedCph: sheet(95000, "Machinery sheet says 96,000"),
      trays: sheet("cATS10, 10 types"),
    },
    board: { maxMm: sheet([810, 490]), minMm: sheet([50, 30], "Yamaha spec: L50 × W50"), thicknessMm: sheet([0.4, 5]) },
    keyFacts: [
      kf("Measured speed", "66,000 CPH", "sheet"),
      kf("Rated speed", "95,000 CPH", "sheet"),
      kf("Feeders", "128 × 8 mm on 11 trolleys", "sheet"),
      kf("Trays", "cATS10, 10 types", "sheet"),
      kf("Vision", "Multi-view flying + single main camera", "sheet"),
      kf("Tall parts", "≥ 6.5 mm need multi camera", "maker"),
    ],
    strengths: ["Fastest placer we own: 95k CPH", "Long boards up to 810 mm", "Trolley feeders: fast changeover"],
    limits: ["HM heads: parts 15 mm tall max", "Large odd-form only on the one FM head", "No 01005 nozzles in our kit"],
    power: "3-phase 200–416 V",
    air: "0.45 MPa",
    footprintMm: "1374 × 1857 × 1445",
    weightKg: 2050,
    links: [{ label: "Yamaha YSM20R launch", url: "https://global.yamaha-motor.com/news/2018/0111/ysm20r.html" }],
    installed: true,
    confidence: "high",
    version: 1,
  },
  {
    id: "vitronics-soltec-centurion-820",
    match: ["vitronics soltec centurion 820", "centurion 820"],
    maker: "Vitronics Soltec (ITW EAE)",
    model: "Centurion 820",
    kind: "REFLOW_OVEN",
    family: "Vitronics Soltec Centurion convection reflow",
    launched: maker(2015, "Centurion debuted Oct 2015; Centurion+ in 2023"),
    oneLiner: "Tightly controlled 8-zone convection reflow for volume lines.",
    board: { maxMm: sheet([1000, 450], "Sheet gives width 50–450 mm"), minMm: sheet([50, 50]), thicknessMm: null },
    keyFacts: [
      kf("Heating zones", "8 top + 8 bottom", "sheet"),
      kf("Cooling zones", "2 top + 2 bottom", "sheet"),
      kf("Process length", "3,550 mm", "sheet", "Sheet calls it overall process length"),
      kf("Max temperature", "300 °C, ±1 °C", "sheet"),
      kf("Conveyor", "Chain + mesh, 2 m/min", "sheet"),
      kf("Nitrogen", "Maker option", "maker", "Not stated for our unit"),
    ],
    strengths: ["Tight ±1 °C zone control", "Automatic width and lubrication", "Warm-up in 20–25 min"],
    limits: ["Sheet max 300 °C", "No built-in profiler", "Nitrogen fit not confirmed"],
    power: "440 V, 3-phase",
    installed: true,
    confidence: "medium",
    version: 1,
  },

  // ── Line 3
  {
    id: "emst-stallion-fc-plc-jw",
    match: ["emst stallion", "stallion fc plc jw"],
    maker: "EMS Technologies (EMST)",
    model: "Stallion FC-PLC-JW",
    kind: "WAVE_SOLDER",
    family: "EMST Stallion wave soldering",
    launched: null,
    oneLiner: "Dual-pot wave: leaded and lead-free, normal plus jet wave.",
    board: NO_BOARD,
    keyFacts: [
      kf("Solder pots", "2 × 220 kg (RoHS + non-RoHS)", "sheet"),
      kf("Waves", "Normal (THT) + jet (SMD)", "sheet"),
      kf("Conveyor", "Finger", "sheet"),
      kf("Control", "PLC + PID", "sheet"),
    ],
    strengths: ["Separate leaded and lead-free pots", "Jet wave solders bottom-side SMD", "Finger conveyor: no pallets needed"],
    limits: ["Fluxer and preheat not on sheet", "Board width range not on sheet", "Nitrogen not listed"],
    power: "415 V, 3-phase",
    installed: false,
    confidence: "low",
    version: 1,
  },
  {
    id: "janome-jr3403-coater",
    match: ["janome jr3403 svc", "jr3403 svc 300", "svc 300"],
    maker: "Janome",
    model: "JR3403 + SVC-300 spray valve",
    kind: "CONFORMAL_COATER",
    family: "Janome JR3000 desktop robots",
    launched: null,
    oneLiner: "Bench robot for selective conformal coating with a spray valve.",
    board: { maxMm: maker([400, 400], "Robot XY stroke; verify against the catalogue"), minMm: null, thicknessMm: null },
    keyFacts: [
      kf("Axes", "3", "sheet"),
      kf("Valve", "SVC-300 spray controller", "sheet"),
      kf("Patterns", "Rectangle, circle, zig-zag", "sheet"),
      kf("Work area", "400 × 400 mm, Z 150 mm", "maker", "Dealer data; verify"),
      kf("Speed", "≤ 900 mm/s XY", "maker"),
    ],
    strengths: ["Selective coating cuts masking work", "Programmable spray paths"],
    limits: ["3 axes: no tilt for side walls", "Bench batch work, not inline", "No cure or UV inspection"],
    power: "220 V, 1-phase",
    installed: false,
    confidence: "medium",
    version: 1,
  },
  {
    id: "janome-jr3403-router",
    match: ["janome jr3403 router", "jr3403 router"],
    maker: "Janome",
    model: "JR3403 router",
    kind: "DEPANELER",
    family: "Janome JR3000 desktop robots",
    launched: null,
    oneLiner: "Bench router robot for low-stress depaneling of tab-routed panels.",
    board: { maxMm: maker([400, 400], "Robot XY stroke; verify against the catalogue"), minMm: null, thicknessMm: null },
    keyFacts: [
      kf("Router bit", "0.8 mm", "sheet"),
      kf("Cut speed", "700–900 mm/s", "sheet"),
      kf("Repeatability", "±0.008 mm", "sheet", "Maker lists ±0.007 mm for JR3400 robots"),
      kf("Programs", "1,000 / 32,000 points", "sheet"),
      kf("Dust", "Automatic debris collector", "sheet"),
    ],
    strengths: ["Low-stress cuts beside fragile parts", "Cuts curves and angles, not just lines"],
    limits: ["Route channels must be ≥ 0.8 mm", "Router dust: keep parts off edges", "Manual panel loading"],
    power: "220 V, 1-phase",
    installed: false,
    confidence: "medium",
    version: 1,
  },

  // ── Line 4
  {
    id: "lpkf-cuttingmaster-2000",
    match: ["lpkf cuttingmaster 2000", "cuttingmaster 2000"],
    maker: "LPKF",
    model: "CuttingMaster 2000 (laser)",
    kind: "DEPANELER",
    family: "LPKF CuttingMaster laser depaneling",
    launched: maker(2020, "Launched Jan 2020"),
    oneLiner: "Stress-free laser depaneling for tight contours, flex and rigid-flex.",
    board: { maxMm: maker([350, 350], "Manual P version; Ci version 350 × 250 mm"), minMm: null, thicknessMm: null },
    keyFacts: [
      kf("Work area", "350 × 350 mm", "maker"),
      kf("Laser", "UV 355 nm or green 532 nm, 22–40 W", "maker", "Our source and power not on file"),
      kf("Positioning", "±25 µm", "maker"),
      kf("Beam", "≈ 20 µm focus", "maker"),
      kf("Z clearance", "11 mm", "maker"),
    ],
    strengths: ["No mechanical stress on the board", "Near-zero kerf: parts close to edge", "Cuts flex and rigid-flex"],
    limits: ["Slow on thick FR-4", "Check edge carbonisation for high voltage", "Our laser option not on file"],
    links: [{ label: "LPKF CuttingMaster 2000", url: "https://www.lpkfusa.com/products-technologies/electronics-manufacturing/products/lpkf-cuttingmaster-2000" }],
    installed: false,
    confidence: "medium",
    version: 1,
  },
  {
    id: "schleuniger-crimpcenter-36-s",
    match: ["schleuniger crimpcenter 36 s", "crimpcenter 36 s", "crimpcenter 36"],
    maker: "Schleuniger",
    model: "CrimpCenter 36 S",
    kind: "OTHER",
    family: "Schleuniger CrimpCenter wire processing",
    launched: null,
    oneLiner: "Automatic cut, strip and crimp for wire harness leads.",
    board: NO_BOARD,
    keyFacts: [
      kf("Wire size", "0.13–6 mm² (26–10 AWG)", "maker", "Below 0.22 or above 4 mm² needs a sample test"),
      kf("Max wire OD", "4.7 mm", "maker"),
      kf("Process", "Cut, strip, crimp both ends", "maker"),
    ],
    strengths: ["Double-ended leads in one pass", "Repeatable lengths and strip lengths"],
    limits: ["Wires over 6 mm² need other kit", "Each terminal needs its own applicator"],
    links: [{ label: "Schleuniger CrimpCenter 36 S", url: "https://www.schleuniger.com/products/p/crimpcenter-36-s/" }],
    installed: false,
    confidence: "medium",
    version: 1,
  },
  {
    id: "desoutter-cvi3",
    match: ["desoutter cvi3", "cvi3"],
    maker: "Desoutter",
    model: "CVI3 EC stations",
    kind: "SCREWDRIVER_STATION",
    family: "Desoutter CVI3 tightening controllers",
    launched: null,
    oneLiner: "Torque-controlled electric screwdriving with a logged result per screw.",
    board: NO_BOARD,
    keyFacts: [
      kf("Stations", "4", "sheet"),
      kf("Control", "Torque + angle, per-screw result", "maker"),
      kf("Tools", "EC electric screwdrivers", "sheet", "Exact tool models not on file"),
    ],
    strengths: ["Torque and angle recorded per screw", "Sequences stop missed screws"],
    limits: ["Torque range depends on tool fitted", "Tool models not on file"],
    installed: false,
    confidence: "low",
    version: 1,
  },
  {
    id: "chroma-19032",
    match: ["chroma 19032"],
    maker: "Chroma",
    model: "19032",
    kind: "OTHER",
    family: "Chroma electrical safety analyzers",
    launched: null,
    oneLiner: "Five-in-one safety tester: hipot, insulation, ground bond, leakage.",
    board: NO_BOARD,
    keyFacts: [
      kf("AC hipot", "0.05–5 kV", "maker"),
      kf("DC hipot", "≤ 6 kV", "maker"),
      kf("Insulation", "0.1 MΩ–50 GΩ", "maker"),
      kf("Ground bond", "40 A", "maker", "Dealer data; verify"),
    ],
    strengths: ["Hipot, IR and ground bond in one box", "Flashover and open/short checks"],
    limits: ["AC hipot tops out at 5 kV", "Safety test only, not functional"],
    links: [{ label: "Chroma 19032", url: "https://www.chromausa.com/product/electrical-safety-analyzer-19032/" }],
    installed: false,
    confidence: "medium",
    version: 1,
  },

  // ── Not in a line today: earlier Line 1 kit and brochure candidates
  {
    id: "emst-konark-710ec",
    match: ["konark 710"],
    maker: "EMS Technologies (EMST)",
    model: "Konark 710EC",
    kind: "REFLOW_OVEN",
    family: "EMST Konark reflow",
    launched: null,
    oneLiner: "Seven-zone reflow oven from the earlier Line 1 kit.",
    board: NO_BOARD,
    keyFacts: [
      kf("Heating zones", "7 top + 7 bottom", "sheet"),
      kf("Cooling", "1 top zone with fan", "sheet"),
      kf("Process length", "2,415 mm", "sheet"),
      kf("Max temperature", "300 °C, ±1 °C", "sheet"),
      kf("Board width", "50–400 mm", "sheet"),
      kf("Profiler", "Built-in thermocouple", "sheet"),
    ],
    strengths: ["Built-in thermocouple profiler", "Automatic lubrication"],
    limits: ["Only one cooling zone", "Slow 30–40 min warm-up", "Boards up to 400 mm wide"],
    power: "440 V, 3-phase",
    installed: false,
    confidence: "low",
    version: 1,
  },
  {
    id: "omron-vt-rns-ii-pt",
    match: ["vt rns ii", "vt rns2", "rns ii pt"],
    maker: "Omron",
    model: "VT-RNS II-pt",
    kind: "AOI",
    family: "Omron VT-RNS colour-highlight AOI",
    launched: null,
    oneLiner: "Bench 2D colour-highlight AOI from the earlier Line 1 kit.",
    board: { maxMm: maker([330, 250], "Dealer listing for a PT-M3 unit; verify"), minMm: null, thicknessMm: null },
    keyFacts: [
      kf("Technology", "2D, RGB colour highlight", "sheet"),
      kf("Camera", "1.5 MP", "sheet"),
      kf("Use", "Off-line bench / repair station", "sheet"),
      kf("Resolution", "10–20 µm by lens", "maker", "Dealer data"),
    ],
    strengths: ["Colour highlight shows fillet shape well", "Good at fine-pitch IC shorts"],
    limits: ["2D only: no height", "Bench unit, not inline", "Old platform: spares risk"],
    power: "220 V, 1-phase",
    installed: false,
    confidence: "low",
    version: 1,
  },
  {
    id: "ckd-vp-01g",
    match: ["ckd vp 01g", "vp 01g"],
    maker: "CKD",
    model: "VP-01G",
    kind: "SPI",
    family: "CKD VP 3D SPI (sold with Omron in Europe)",
    launched: null,
    oneLiner: "3D SPI with switchable resolution and strong warpage handling.",
    board: { maxMm: sheet([510, 510], "CKD brochure"), minMm: sheet([50, 50], "CKD brochure"), thicknessMm: sheet([0.3, 5], "CKD brochure") },
    keyFacts: [
      kf("Technology", "3D phase shift + 2D ring light", "sheet", "CKD brochure"),
      kf("Resolution", "25 / 20 / 15 / 10 µm", "sheet", "CKD brochure"),
      kf("Speed", "≤ 94 cm²/s at 25 µm", "sheet", "CKD brochure"),
      kf("Paste height", "≤ 400 µm (600 µm option)", "sheet", "CKD brochure"),
      kf("Warpage", "±5 mm", "sheet", "CKD brochure"),
      kf("GR&R", "≤ 10 %", "sheet", "CKD brochure"),
    ],
    strengths: ["One machine for fine and coarse pitch", "Tracks ±5 mm board warpage", "Closed loop to printer"],
    limits: ["Top clearance only 5 mm", "Boards up to 5 kg"],
    power: "1-phase 200–240 V, 1 kVA",
    air: "0.3–0.4 MPa",
    footprintMm: "938 × 1191 × 1480",
    weightKg: 600,
    installed: true,
    confidence: "high",
    version: 1,
  },
  {
    id: "magic-ray-v5300",
    match: ["magic ray v5300", "magicray v5300"],
    maker: "Magic-ray",
    model: "V5300",
    kind: "AOI",
    family: "Magic-ray V-series 2D AOI",
    launched: null,
    oneLiner: "Double-sided 2D AOI: top and bottom in one pass.",
    board: { maxMm: sheet([510, 510], "Brochure; V5300XL 650 × 610 mm"), minMm: sheet([50, 50], "Brochure"), thicknessMm: sheet([0.6, 6], "Brochure") },
    keyFacts: [
      kf("Technology", "2D, double-sided", "sheet", "Magic-ray brochure 2023"),
      kf("Camera", "5 MP or 12 MP, telecentric", "sheet", "Magic-ray brochure 2023"),
      kf("Field of view", "60 × 49 mm (5 MP)", "sheet", "Magic-ray brochure 2023"),
      kf("Speed", "200–250 ms per FOV", "sheet", "Magic-ray brochure 2023"),
      kf("Smallest part", "03015 chip, 0.3 mm pitch", "sheet", "Magic-ray brochure 2023"),
      kf("Clearance", "Top 25–85 mm, bottom 25–80 mm", "sheet", "Magic-ray brochure 2023"),
    ],
    strengths: ["Inspects both sides at once", "Checks wave-soldered THT joints", "Tall top clearance up to 85 mm"],
    limits: ["2D: no true height measurement", "Cannot see joints under BGA/QFN"],
    power: "220 V, 1-phase, 5 A",
    air: "0.4–0.6 MPa",
    footprintMm: "1045 × 1470 × 1600",
    weightKg: 900,
    installed: true,
    confidence: "high",
    version: 1,
  },
  {
    id: "magic-ray-cube",
    match: ["magic ray cube", "magicray cube"],
    maker: "Magic-ray",
    model: "Cube",
    kind: "AOI",
    family: "Magic-ray Cube 3D AOI (Cube+, Cube-D+)",
    launched: null,
    oneLiner: "Inline 3D AOI measuring lift, coplanarity and tall parts.",
    board: { maxMm: sheet([510, 510], "Brochure, Cube+"), minMm: sheet([60, 50], "Brochure: 50 × 60 mm"), thicknessMm: null },
    keyFacts: [
      kf("Technology", "3D, 4-way projection", "sheet", "Magic-ray brochure 2024"),
      kf("Camera", "12 MP, 15/12/10 µm", "sheet", "Magic-ray brochure 2024"),
      kf("Height range", "35 mm", "sheet", "Magic-ray brochure 2024"),
      kf("Speed", "450 ms per FOV", "sheet", "Magic-ray brochure 2024"),
      kf("Smallest part", "03015 chip, 0.3 mm pitch", "sheet", "Magic-ray brochure 2024"),
      kf("Board", "≤ 6 mm thick, ≤ 3 kg, ±3 mm warp", "sheet", "Magic-ray brochure 2024"),
    ],
    strengths: ["True 3D: lift, coplanarity, tombstone", "Measures parts up to 35 mm tall", "Pre- or post-reflow"],
    limits: ["Slower: 450 ms per FOV", "Boards up to 3 kg", "Cannot see joints under BGA/QFN"],
    power: "220 V, 1-phase, 5 A",
    air: "0.4–0.6 MPa",
    footprintMm: "1140 × 1360 × 1620",
    weightKg: 1100,
    installed: true,
    confidence: "high",
    version: 1,
  },
  {
    id: "stericox-uldc1428-6",
    match: ["stericox uldc1428", "uldc1428"],
    maker: "Stericox",
    model: "ULDC1428-6 dry cabinet",
    kind: "OTHER",
    launched: null,
    oneLiner: "1,428-litre dry cabinet for moisture-sensitive parts.",
    board: NO_BOARD,
    keyFacts: [
      kf("Volume", "1,428 L", "sheet"),
      kf("Humidity", "1–60 % RH, set", "sheet"),
      kf("Display", "±3 % RH, ±1 °C", "sheet"),
    ],
    strengths: ["Holds RH below 20 % for MSL parts"],
    limits: ["Not a bake oven: no MSL reset"],
    power: "220 V, 1-phase",
    installed: false,
    confidence: "medium",
    version: 1,
  },
  {
    id: "stericox-stxlr220s",
    match: ["stericox stxlr220s", "stxlr220s"],
    maker: "Stericox",
    model: "STXLR220S lab refrigerator",
    kind: "OTHER",
    launched: null,
    oneLiner: "220-litre 2–8 °C fridge for solder paste storage.",
    board: NO_BOARD,
    keyFacts: [
      kf("Volume", "220 L", "sheet"),
      kf("Temperature", "2–8 °C, 0.1 °C resolution", "sheet"),
      kf("Sensor", "PT100", "sheet"),
    ],
    strengths: ["Keeps paste in its 2–8 °C window"],
    limits: ["Paste needs hours to warm before use"],
    power: "220 V, 1-phase",
    installed: false,
    confidence: "medium",
    version: 1,
  },
];

/** Lowercase, punctuation to single spaces: "Magic-ray" → "magic ray", "Z:LEX #1" → "z lex 1". */
export const normName = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();

/** The model profile for a machine row, or null (in-house benches, unknown kit). Longest matching needle wins. */
export function findModel(vendor: string, model: string): MachineModel | null {
  const hay = ` ${normName(`${vendor} ${model}`)} `;
  let best: MachineModel | null = null;
  let bestLen = 0;
  for (const m of MACHINE_MODELS) {
    for (const needle of m.match) {
      const n = normName(needle);
      if (n && hay.includes(n) && n.length > bestLen) {
        best = m;
        bestLen = n.length;
      }
    }
  }
  return best;
}

/** A fact's value, or null. */
export const factValue = <T>(f: Fact<T> | undefined): T | null => (f ? f.value : null);
