import type { LineType, MachineType } from "@prisma/client";

export type SeedMachine = { type: MachineType; vendor: string; model: string; specs?: Record<string, unknown> };

export type SeedLine = {
  code: string;
  name: string;
  type: LineType;
  description: string;
  capability: Record<string, unknown>;
  capacityCph?: number;
  feederSlots?: number;
  shiftsPerDay: number;
  machines: SeedMachine[];
};

/** Where the plant figures come from: ThinkSemi's own machine sheets (Downloads/MACHINE DETAILS, Nov 2026). */
const PLANT_DOC = { by: "manual", at: "2026-11-14", confidence: "high", notes: "ThinkSemi machine sheets: MACHINERY DETAILS.pdf and LINE 0NE ALL MACHINE SPECIFICATION DETAILS.pptx" } as const;
const BROCHURE = (name: string) => ({ ...PLANT_DOC, notes: `${PLANT_DOC.notes}; ${name}` });

/**
 * Our plant as the machine sheets describe it (Phase 33). Line 1 is the layout in the Line 1 specification deck
 * (13 Nov 2026: laser marker, GD450, Magic-ray SPI, M20 i-Pulse, Tronwin oven, Magic-ray AOI); Line 2 is the
 * "SMT LINE 2" page of the machinery sheet (MPM, Koh Young SPI, two YSM20R Z:LEX, Vitronics oven — no AOI on the
 * sheet). Figures the sheets do not give are left out, never guessed; `actualCph` is the rate the sheet measured on
 * our floor, used for running times instead of the rated speed.
 */
export const LINES: SeedLine[] = [
  {
    code: "L1",
    name: "SMT Line 1 — Yamaha M20 i-Pulse",
    type: "SMT",
    description:
      "High-mix line: Famecs laser marker → HTGD GD450 semi-automatic printer → Magic-ray ICON 3D SPI → Yamaha M20 i-Pulse → Tronwin TW-VP860N reflow → Magic-ray V5000 2D AOI, on Ecopmin link conveyors. The laser marker takes 0.5–2.0 mm boards.",
    capability: { doubleSided: true },
    capacityCph: 30000,
    feederSlots: 144,
    shiftsPerDay: 2,
    machines: [
      { type: "LASER_MARKER", vendor: "Famecs", model: "Lative F20", specs: { maxBoardMm: [430, 330], minBoardMm: [70, 70], minThicknessMm: 0.5, maxThicknessMm: 2, laserW: 30, marks: "QR / dot matrix", widthAdjust: "automatic", interface: "SMEMA", air: "5–6 bar", power: "230 V AC, 1-phase", source: PLANT_DOC } },
      { type: "STENCIL_PRINTER", vendor: "HTGD", model: "GD450 (semi-automatic)", specs: { maxBoardMm: [450, 350], minBoardMm: [50, 50], minThicknessMm: 0.4, maxThicknessMm: 6, cycleSec: [15, 20], printSpeedMmS: 200, clamping: "edge", loading: "manual", stencilFrameIn: "18–29", power: "220 V, 1-phase", source: PLANT_DOC } },
      { type: "OTHER", vendor: "Ecopmin", model: "0.6 m link conveyor", specs: { conveyorWidthMm: [50, 480], cycleSec: 6, speedMMin: 9, segments: 1, interface: "SMEMA", note: "Position in the line from the plant photos — confirm on the floor.", source: PLANT_DOC } },
      { type: "SPI", vendor: "Magic-ray", model: "ICON", specs: { technology: "3D", maxBoardMm: [510, 510], minBoardMm: [50, 50], minThicknessMm: 0.4, maxThicknessMm: 5, cameraMp: 4, heightAccuracyUm: 1, maxInspectionMm: [10, 10], inspectCm2PerSec: [22, 56], power: "220 V, 1-phase", source: PLANT_DOC } },
      {
        type: "PICK_AND_PLACE",
        vendor: "Yamaha",
        model: "M20 i-Pulse",
        specs: {
          minChip: "0201",
          maxComponentMm: [120, 90],
          maxComponentHeightMm: 25,
          maxBoardMm: [540, 350],
          minBoardMm: [50, 30],
          minThicknessMm: 0.4,
          maxThicknessMm: 4.8,
          cph: 30000,
          actualCph: 8500,
          actualCphRange: [7000, 10000],
          feederSlots: 144,
          heads: 6,
          theta: 2,
          accuracyMm: 0.025,
          trays: 2,
          sticks: 7,
          feederRange: "8–56 mm, F3 electric",
          feederStation: "fixed",
          nozzleSlots: 24,
          camera: "single 2 MP",
          nozzles: { "51": 3, "52": 4, "62": 4, "53": 5, "54": 2, "55": 5, "56": 2, "5": 1, "18": 1, "20": 1, "72": 2, "73": 1 },
          power: "440 V, 3-phase",
          source: PLANT_DOC,
        },
      },
      { type: "OTHER", vendor: "Ecopmin", model: "1 m link conveyor (inspection)", specs: { conveyorWidthMm: [50, 480], cycleSec: 6, speedMMin: 9, segments: 2, interface: "SMEMA", note: "Position in the line from the plant photos — confirm on the floor.", source: PLANT_DOC } },
      { type: "REFLOW_OVEN", vendor: "Tronwin", model: "TW-VP860N", specs: { zones: 8, coolingZones: 2, maxBoardMm: [1000, 430], minBoardMm: [50, 50], heatedLengthMm: 2652, coolingLengthMm: "650–700", maxTempC: 350, accuracyC: 2, conveyor: "chain + mesh", speedMmMin: [50, 2000], widthAdjust: "manual", lubrication: "manual", rampUpMin: "20–25", exhaust: "dual", power: "440 V, 3-phase", source: PLANT_DOC } },
      { type: "OTHER", vendor: "Ecopmin", model: "1 m cooling conveyor", specs: { conveyorWidthMm: [50, 480], cycleSec: 12, speedMMin: 9, segments: 2, interface: "SMEMA", note: "After the oven, from the plant photos — confirm on the floor.", source: PLANT_DOC } },
      { type: "AOI", vendor: "Magic-ray", model: "V5000", specs: { technology: "2D", maxBoardMm: [610, 510], minBoardMm: [60, 50], minThicknessMm: 0.6, maxThicknessMm: 6, cameraMp: 5, lighting: "RGBW 4-colour LED", fovMm: [60, 49], msPerFov: 225, interface: "Ethernet / SMEMA", power: "220 V, 1-phase, 5 A", source: BROCHURE("FOV and speed from the Magic-ray V5300 brochure (same family)") } },
    ],
  },
  {
    code: "L2",
    name: "SMT Line 2 — 2 × Yamaha YSM20R Z:LEX",
    type: "SMT",
    description:
      "Volume line: MPM Momentum II 100 fully automatic printer → Koh Young KY8030-2 3D SPI → two Yamaha YSM20R Z:LEX → Vitronics Soltec Centurion 820 reflow. The machinery sheet shows no AOI on this line.",
    capability: { doubleSided: true },
    capacityCph: 190000,
    feederSlots: 256,
    shiftsPerDay: 3,
    machines: [
      { type: "STENCIL_PRINTER", vendor: "MPM", model: "Momentum II 100", specs: { maxBoardMm: [610, 508], minBoardMm: [50, 50], minThicknessMm: 0.2, maxThicknessMm: 5, cycleSec: 11, printSpeedMmS: 304, clamping: "top", loading: "automatic", stencilFrameIn: "29", power: "220 V, 1-phase", source: PLANT_DOC } },
      { type: "SPI", vendor: "Koh Young", model: "KY8030-2", specs: { technology: "3D", maxBoardMm: [510, 510], minBoardMm: [50, 50], minThicknessMm: 0.4, maxThicknessMm: 5, cameraMp: 4, heightAccuracyUm: 1, maxInspectionMm: [10, 10], inspectCm2PerSec: [22, 56], power: "220 V, 1-phase", source: PLANT_DOC } },
      ...[1, 2].map((n) => ({
        type: "PICK_AND_PLACE" as const,
        vendor: "Yamaha",
        model: `YSM20R Z:LEX #${n}`,
        specs: {
          minChip: "0201",
          maxComponentMm: [100, 55],
          maxComponentHeightMm: 28,
          maxBoardMm: [810, 490],
          minBoardMm: [50, 30],
          minThicknessMm: 0.4,
          maxThicknessMm: 5,
          cph: 95000,
          actualCph: 66000,
          feederSlots: 128,
          heads: "HM 10-nozzle × 3 + FM 5-nozzle × 1",
          accuracyMm: 0.035,
          heightByHead: { HM: 15, FM: 28 },
          trays: "cATS10, 10 types",
          feederStation: "movable: 11 feeder trolleys + 1 cATS10",
          camera: "multi-view flying camera + single main camera",
          nozzles: { "301A": 20, "302A": 30, "303A": 15, "304A": 7, "306A": 4, "307A": 4 },
          air: "0.45 MPa",
          dimensionsMm: [1374, 1857, 1445],
          weightKg: 2050,
          power: "3-phase 200–416 V",
          source: BROCHURE("Yamaha YSM20R specification sheet"),
        },
      })),
      { type: "REFLOW_OVEN", vendor: "Vitronics Soltec", model: "Centurion 820", specs: { zones: 8, coolingZones: 4, maxBoardMm: [1000, 450], minBoardMm: [50, 50], heatedLengthMm: 3550, maxTempC: 300, accuracyC: 1, conveyor: "chain + mesh", speedMMin: 2, widthAdjust: "automatic", lubrication: "automatic", rampUpMin: "20–25", exhaust: "dual", power: "440 V, 3-phase", source: PLANT_DOC } },
    ],
  },
  {
    code: "L3",
    name: "Line 3 — THT, coating & depaneling",
    type: "THT",
    description: "Hand insertion, EMST Stallion wave (lead-free and leaded pots, normal + jet wave), Janome selective conformal coating robot and Janome router depaneler.",
    capability: { wave: true, selective: false, pressFit: false, conformalCoat: true, ict: false, flyingProbe: false },
    shiftsPerDay: 2,
    machines: [
      { type: "OTHER", vendor: "In-house", model: "Manual insertion benches", specs: { note: "Not on the machine sheets: hand insertion before the wave." } },
      { type: "WAVE_SOLDER", vendor: "EMST", model: "Stallion FC-PLC-JW", specs: { conveyor: "finger", controller: "PLC + PID", pots: "2 × 220 kg (RoHS and non-RoHS)", waves: "normal + jet (SMD)", power: "415 V, 3-phase", source: PLANT_DOC } },
      { type: "CONFORMAL_COATER", vendor: "Janome", model: "JR3403 + SVC-300 spray valve", specs: { axes: 3, selective: true, patterns: "rectangle, circle, zig-zag", power: "220 V, 1-phase", source: PLANT_DOC } },
      { type: "DEPANELER", vendor: "Janome", model: "JR3403 router", specs: { bitMm: 0.8, speedMmS: [700, 900], repeatabilityMm: 0.008, programs: 1000, cutPoints: 32000, debrisCollector: true, power: "220 V, 1-phase", source: PLANT_DOC } },
    ],
  },
  {
    code: "L4",
    name: "Line 4 — Box-build & system test",
    type: "BOX_BUILD",
    description: "Harness assembly, mechanical integration, programming, functional test, burn-in, hi-pot and packing.",
    capability: { harness: true, torqueControlled: true, burnInRack: true, hipot: true, maxUnitKg: 25 },
    shiftsPerDay: 2,
    machines: [
      { type: "DEPANELER", vendor: "LPKF", model: "CuttingMaster 2000 (laser)" },
      { type: "OTHER", vendor: "Schleuniger", model: "CrimpCenter 36 S (harness)" },
      { type: "SCREWDRIVER_STATION", vendor: "Desoutter", model: "CVI3 EC stations x 4", specs: { stations: 4 } },
      { type: "FCT", vendor: "In-house", model: "FCT fixtures + programming (J-Link/ST-Link)" },
      { type: "OTHER", vendor: "In-house", model: "Burn-in rack 48 slots @ 55 °C" },
      { type: "OTHER", vendor: "Chroma", model: "19032 hi-pot / safety tester" },
      { type: "PACKING", vendor: "In-house", model: "ESD packing & labelling" },
    ],
  },
];
