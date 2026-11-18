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
/** The plant's own handwritten line list (photographed 17 Nov 2026): which machine stands on each line. */
const LINE_NOTES = (name: string) => ({ by: "manual", at: "2026-11-17", confidence: "high", notes: `ThinkSemi plant notes, 17 Nov 2026: ${name}` }) as const;

/**
 * Our plant: three SMT lines, as the plant's line notes of 17 Nov 2026 list them, with figures from the machine
 * sheets. Line 1 is the layout in the Line 1 specification deck (laser marker, GD450, Magic-ray ICON SPI, M20 i-Pulse,
 * Tronwin oven, Magic-ray V5000 AOI); Line 2 the "SMT LINE 2" page of the machinery sheet (MPM, Koh Young SPI, two
 * YSM20R Z:LEX, Vitronics oven) plus the Magic-ray Cube+ AOI from the notes; Line 3 from the notes (Line 1's printer
 * and oven models, CKD SPI, YSM20R, Magic-ray V5300 AOI). The through-hole kit and the box-build line are not in the
 * plant (user, 17 Nov 2026). Figures the sheets do not give are left out, never guessed; `actualCph` is the rate the
 * sheet measured on our floor, used for running times instead of the rated speed.
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
      "Volume line: MPM Momentum II 100 fully automatic printer → Koh Young KY8030-2 3D SPI → two Yamaha YSM20R Z:LEX → Vitronics Soltec Centurion 820 reflow → Magic-ray Cube+ 3D AOI.",
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
      { type: "AOI", vendor: "Magic-ray", model: "Cube+", specs: { technology: "3D", maxBoardMm: [510, 510], minBoardMm: [60, 50], maxThicknessMm: 6, maxComponentHeightMm: 35, cameraMp: 12, msPerFov: 450, interface: "SMEMA", power: "220 V, 1-phase, 5 A", source: LINE_NOTES("AOI Magic-ray Cube+; figures from the Magic-ray Cube brochure") } },
    ],
  },
  {
    code: "L3",
    name: "SMT Line 3 — Yamaha YSM20R",
    type: "SMT",
    description:
      "Printer and oven of the Line 1 models (HTGD GD450, Tronwin TW-VP860N) → CKD VP-01G 3D SPI → Yamaha YSM20R → Magic-ray V5300 AOI, per the plant notes of 17 Nov 2026.",
    capability: { doubleSided: true },
    capacityCph: 95000,
    feederSlots: 128,
    shiftsPerDay: 2,
    machines: [
      { type: "STENCIL_PRINTER", vendor: "HTGD", model: "GD450 (semi-automatic)", specs: { maxBoardMm: [450, 350], minBoardMm: [50, 50], minThicknessMm: 0.4, maxThicknessMm: 6, cycleSec: [15, 20], printSpeedMmS: 200, clamping: "edge", loading: "manual", stencilFrameIn: "18–29", power: "220 V, 1-phase", source: LINE_NOTES("Printing: Line 1 machine specification") } },
      { type: "SPI", vendor: "CKD", model: "VP-01G", specs: { technology: "3D", maxBoardMm: [510, 510], minBoardMm: [50, 50], minThicknessMm: 0.3, maxThicknessMm: 5, inspectCm2PerSec: 94, resolutionUm: [10, 25], warpMm: 5, power: "1-phase 200–240 V", source: LINE_NOTES("SPI CKD; figures from the CKD VP-01G brochure") } },
      {
        type: "PICK_AND_PLACE",
        vendor: "Yamaha",
        model: "YSM20R",
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
          source: LINE_NOTES("Pick & place YSM20R; figures from the Yamaha YSM20R specification sheet, as Line 2"),
        },
      },
      { type: "REFLOW_OVEN", vendor: "Tronwin", model: "TW-VP860N", specs: { zones: 8, coolingZones: 2, maxBoardMm: [1000, 430], minBoardMm: [50, 50], heatedLengthMm: 2652, coolingLengthMm: "650–700", maxTempC: 350, accuracyC: 2, conveyor: "chain + mesh", speedMmMin: [50, 2000], widthAdjust: "manual", lubrication: "manual", rampUpMin: "20–25", exhaust: "dual", power: "440 V, 3-phase", source: LINE_NOTES("Reflow: Line 1 machine specification") } },
      { type: "AOI", vendor: "Magic-ray", model: "V5300", specs: { technology: "2D", doubleSided: true, maxBoardMm: [510, 510], minBoardMm: [50, 50], minThicknessMm: 0.6, maxThicknessMm: 6, cameraMp: 5, fovMm: [60, 49], msPerFov: 225, interface: "SMEMA", power: "220 V, 1-phase, 5 A", source: LINE_NOTES("AOI Magic-ray V5300; figures from the Magic-ray V5300 brochure") } },
    ],
  },
];
