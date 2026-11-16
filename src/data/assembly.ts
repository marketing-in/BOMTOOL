/**
 * Plant figures for the feasibility study (src/lib/feasibility): solder paste and solder use, time per operation
 * and the working shift. INDICATIVE starting points — set them from the plant's own measurements.
 */
export const ASSEMBLY = {
  paste: {
    /** Wet paste, SAC305 type 4 at 88.5 % metal by weight, g/cm³. */
    densityGPerCm3: 4.2,
    /** Stencil aperture area ÷ pad area when only the pads are known. */
    apertureReduction: 0.9,
    /** Share of the aperture volume that lands on the pad. */
    transfer: 0.85,
    /** Under-stencil wipes and misprints, % of printed paste. */
    wipeLossPct: 8,
    /** Bead rolling on the stencil, scrapped at the end of each shift, grams per side. */
    beadGPerSidePerShift: 150,
    jarG: 500,
  },
  /**
   * Parts that take more than their pins suggest. Agreed with the plant (meeting of 11 Nov 2026): MOSFETs, relays,
   * connectors and inductors count double in the pin count; inductors and connectors take double the paste.
   */
  pins: { doubleFactor: 2, doubleClasses: ["mosfet", "relay", "connector", "inductor"] },
  heavyPaste: { factor: 2, classes: ["connector", "inductor"] },
  /**
   * Do-not-populate parts are not bought or placed, but the plant counts their pins and the paste their pads take
   * (decided 12 Nov 2026): the stencil prints those pads and the pin count is the board's, not the build's.
   */
  dnp: { inPinCount: true, inPaste: true },
  /** Production panel the boards are stepped onto: usable size, a rail on each long edge, routing gap between boards, mm. */
  panel: { maxWidthMm: 250, maxLengthMm: 330, railMm: 5, gapMm: 2 },
  consumables: {
    /** Spray flux ahead of the wave, ml per dm² of board. */
    waveFluxMlPerDm2: 1.2,
    /** One under-stencil wipe every so many prints. */
    printsPerWipe: 5,
    /** Conformal coat, wet, with overspray, ml per cm² of board side. */
    coatMlPerCm2: 0.012,
    /** Masking a connector or switch before coating, and taking the mask off. */
    maskSecPerPart: 15,
  },
  /** The SMT line, station by station (src/lib/feasibility/smt-line.ts). Seconds are per panel unless said. */
  smt: {
    loadSec: 8,
    /** Print stroke, separation and board change. */
    printSec: 22,
    /** SPI: board change plus scan time per deposit. */
    spiBaseSec: 8,
    spiSecPerDeposit: 0.008,
    /** Stencil aperture area ratio (opening area ÷ wall area) below which paste release is unreliable (IPC-7525). */
    minAreaRatio: 0.66,
    /** SPI volume window, % of nominal: everyday work and fine features. */
    spiVolumePct: { standard: [50, 150], fine: [60, 140] },
    /** Paste may sit on the stencil this long before it is scrapped, hours. */
    pasteStencilLifeH: 8,
    /** Reflow oven: heated length, conveyor speed and the gap kept between panels. */
    oven: { heatedLengthM: 3.6, conveyorMPerMin: 0.9, panelGapMm: 50 },
    /** Lead-free SAC305 profile the oven is set to reach, measured on the board. */
    profile: { rampCPerSec: [1, 3], soakC: [150, 200], soakSec: [60, 120], liquidusC: 217, talSec: [45, 90], peakC: [235, 250], coolCPerSec: [2, 4] },
    aoiBaseSec: 10,
    aoiSecPerJoint: 0.02,
    /** X-ray is off the line: per board, plus time per hidden joint. */
    xrayBaseSecPerBoard: 30,
    xraySecPerJoint: 0.1,
    /** Largest voiding accepted under a BGA ball, % of ball area (IPC-7095). */
    maxVoidPct: 25,
  },
  /** Stencil foil thickness by the finest feature on the side, µm. */
  stencilUm: { fine: 100, standard: 120, coarse: 150 },
  solder: {
    /** Wave or selective: grams of alloy in one through-hole joint (1.6 mm board). */
    gPerThtJoint: 0.015,
    /** Dross and pot top-up, % of the solder that ends up in joints. */
    drossPct: 30,
    barInrPerKg: 4200,
  },
  shift: {
    hours: 8,
    /** Breaks, hand-overs, minor stops. */
    productive: 0.85,
  },
  time: {
    thtInsertSecPerPart: 8,
    insertionBenches: 6,
    waveBoardsPerHour: 120,
    selectiveSecPerJoint: 3,
    pressFitSecPerPart: 20,
    cleanSecPerBoard: 20,
    coatSecPerBoard: 60,
    depanelSecPerBoard: 15,
    /** Flying probe moves, per net; never under a minute a board. */
    flyingProbeSecPerNet: 1.2,
    flyingProbeMinSec: 60,
    ictSecPerBoard: 30,
    programSecPerBoard: 45,
    fctSecPerBoard: 90,
    testStations: 2,
    boxOperators: 4,
    systemTestSecPerUnit: 120,
    packSecPerUnit: 45,
    packOperators: 2,
  },
  /** Solder joints per electrical net, to guess probe points without a netlist. */
  jointsPerNet: 3,
} as const;

export type AssemblyConfig = typeof ASSEMBLY;
