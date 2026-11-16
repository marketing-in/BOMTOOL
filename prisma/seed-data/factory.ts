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

export const LINES: SeedLine[] = [
  {
    code: "L1",
    name: "SMT Line 1 — High-mix / fine-pitch",
    type: "SMT",
    description: "NPI and high-mix builds. Fine-pitch, 0201, BGA/QFN with X-ray verification. Double-sided reflow.",
    capability: { minChip: "0201", minPitchMm: 0.35, bga: true, maxBoardMm: [510, 460], minBoardMm: [50, 50], doubleSided: true, maxComponentHeightMm: 25, nitrogenReflow: true },
    capacityCph: 78000,
    feederSlots: 120,
    shiftsPerDay: 2,
    machines: [
      // Limits per machine (Phase 19): the line's capability above is what they add up to.
      { type: "BOARD_LOADER", vendor: "Nutek", model: "NTM-410", specs: { magazine: "L-size", maxBoardMm: [530, 460], minBoardMm: [50, 50] } },
      { type: "STENCIL_PRINTER", vendor: "ASMPT", model: "DEK TQ", specs: { alignment: "±12.5 µm @ 6σ", maxBoardMm: [600, 510], minBoardMm: [50, 40], minThicknessMm: 0.2, maxThicknessMm: 6 } },
      { type: "SPI", vendor: "Koh Young", model: "KY8030-3", specs: { technology: "3D", maxBoardMm: [510, 460], minBoardMm: [50, 50] } },
      { type: "PICK_AND_PLACE", vendor: "ASMPT", model: "SIPLACE TX2i (chip shooter)", specs: { heads: 2, cph: 52000, minChip: "0201", minPitchMm: 0.4, maxComponentMm: [8.2, 8.2], maxComponentHeightMm: 4, maxBoardMm: [510, 460] } },
      { type: "PICK_AND_PLACE", vendor: "ASMPT", model: "SIPLACE SX2 (fine-pitch)", specs: { heads: 2, cph: 26000, minChip: "0402", minPitchMm: 0.35, maxComponentMm: [200, 125], maxComponentHeightMm: 25, maxBoardMm: [560, 510] } },
      { type: "REFLOW_OVEN", vendor: "Heller", model: "1913 MK5", specs: { zones: 13, coolingZones: 3, nitrogen: true, maxBoardMm: [560, 510], maxComponentHeightMm: 30 } },
      { type: "AOI", vendor: "Koh Young", model: "Zenith Alpha", specs: { technology: "3D", maxBoardMm: [510, 510], maxComponentHeightMm: 30 } },
      { type: "XRAY", vendor: "Nordson", model: "Quadra 7", specs: { mode: "2.5D / CT", technology: "CT", maxBoardMm: [508, 444] } },
    ],
  },
  {
    code: "L2",
    name: "SMT Line 2 — High-volume",
    type: "SMT",
    description: "Repeat production. Modular placement for high CPH, inline AOI. Single and double-sided.",
    capability: { minChip: "0402", minPitchMm: 0.4, bga: true, maxBoardMm: [460, 400], minBoardMm: [50, 50], doubleSided: true, maxComponentHeightMm: 15, nitrogenReflow: false },
    capacityCph: 135000,
    feederSlots: 160,
    shiftsPerDay: 3,
    machines: [
      { type: "BOARD_LOADER", vendor: "Nutek", model: "NTM-410", specs: { maxBoardMm: [530, 460], minBoardMm: [50, 50] } },
      { type: "STENCIL_PRINTER", vendor: "EKRA", model: "SERIO 4000", specs: { maxBoardMm: [550, 460], minBoardMm: [50, 50], minThicknessMm: 0.4, maxThicknessMm: 6 } },
      { type: "SPI", vendor: "MIRTEC", model: "MS-11e", specs: { technology: "3D", maxBoardMm: [500, 400], minBoardMm: [50, 50] } },
      { type: "PICK_AND_PLACE", vendor: "Fuji", model: "NXT III M3 x 8", specs: { modules: 8, cph: 112000, minChip: "0402", minPitchMm: 0.5, maxComponentMm: [7.5, 7.5], maxComponentHeightMm: 6.5, maxBoardMm: [534, 510] } },
      { type: "PICK_AND_PLACE", vendor: "Fuji", model: "NXT III M6 x 2", specs: { modules: 2, cph: 23000, minChip: "0402", minPitchMm: 0.4, maxComponentMm: [74, 74], maxComponentHeightMm: 15, maxBoardMm: [534, 510] } },
      { type: "REFLOW_OVEN", vendor: "Rehm", model: "VisionXP+ 1100", specs: { zones: 11, vacuum: false, nitrogen: false, maxBoardMm: [650, 460], maxComponentHeightMm: 35 } },
      { type: "AOI", vendor: "Saki", model: "3Di-LS2", specs: { technology: "3D", maxBoardMm: [460, 400], maxComponentHeightMm: 40 } },
    ],
  },
  {
    code: "L3",
    name: "Line 3 — THT, selective & coating",
    type: "THT",
    description: "Manual insertion, wave and selective soldering, press-fit, conformal coating and ICT/flying probe.",
    capability: { wave: true, selective: true, pressFit: true, conformalCoat: true, maxBoardMm: [508, 457], ict: true, flyingProbe: true },
    shiftsPerDay: 2,
    machines: [
      { type: "OTHER", vendor: "In-house", model: "Manual insertion benches x 6", specs: { stations: 6 } },
      { type: "WAVE_SOLDER", vendor: "Ersa", model: "POWERFLOW e N2", specs: { nitrogen: true, leadFree: true } },
      { type: "SELECTIVE_SOLDER", vendor: "Ersa", model: "VERSAFLOW 4/55", specs: { nozzles: 2 } },
      { type: "PRESS_FIT", vendor: "Tox Pressotechnik", model: "Press-fit cell 20 kN" },
      { type: "AOI", vendor: "Viscom", model: "S3088 THT" },
      { type: "WASHER", vendor: "Zestron/PBT", model: "SuperSWASH" },
      { type: "CONFORMAL_COATER", vendor: "PVA", model: "Delta 8", specs: { materials: ["acrylic", "silicone", "urethane"] } },
      { type: "FLYING_PROBE", vendor: "Takaya", model: "APT-1600FD" },
      { type: "ICT", vendor: "Keysight", model: "i3070 Series 5" },
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
