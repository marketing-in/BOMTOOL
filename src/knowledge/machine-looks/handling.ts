import type { MachineLook } from "./types";

/**
 * Board handling on our lines as it looks on the floor: the link, inspection and cooling conveyors (and the cells that
 * only move or mark a board). Facts only: sizes, paint, what the model shows and where each fact came from. The
 * builders are in src/components/ops/machine-3d/handling.ts, under the same keys.
 */
export const HANDLING_LOOKS: MachineLook[] = [
  {
    key: "ecopmin-link-conveyor",
    family: "handling",
    types: ["OTHER"],
    match: "ecopmin\\s+0\\.6\\s*m\\s+link\\s+conveyor",
    name: "Ecopmin link conveyor 0.6 m",
    bodyMm: {
      l: 600,
      d: 700,
      h: 930,
      source: "estimate",
      note: "Length is the sheet's 0.6 m. Depth is a typical 0.6 m link conveyor frame (600 × 700 mm, listed 950 ± 30 mm tall) checked against the plant photo: rails for boards 50–480 mm wide. Height is the top of the rails at our 920 mm pass height.",
    },
    // The front rail is the fixed one; the rear rail travels on the width-adjust shafts.
    railFromFrontMm: 190,
    reachMm: { front: 90, back: 0, top: 70 },
    livery: { frame: "#c9cdd0", panel: "#e8e8e3", belt: "#1f7a55", trim: "#2b2d30", box: "#d9d9d4" },
    features: [
      "aluminium-profile frame on four levelling feet",
      "two belt rails, the rear one on width-adjust shafts with a handwheel in front",
      "drive motor under the fixed rail",
      "control box with start / stop buttons, pilot lamps and an e-stop",
      "board sensors at entry and exit, cable chain to the moving rail",
    ],
    refs: [
      { label: "LINE ONE ALL MACHINE SPECIFICATION DETAILS, slide 1: the link conveyor in the photo beside the laser marker", source: "sheet" },
      { label: "Line 1 machine list: Ecopmin 0.6 m link conveyor, boards 50–480 mm wide, SMEMA", source: "sheet" },
      { label: "Size reference, another maker's 0.6 m link conveyor (600 × 700 × 950 mm)", source: "web", url: "https://www.plantautomation-technology.com/products/smtvys/link-inspection-conveyor-sc-600" },
    ],
  },
  {
    key: "ecopmin-inspection-conveyor",
    family: "handling",
    types: ["OTHER"],
    match: "ecopmin\\s+1\\s*m\\s+link\\s+conveyor\\s*\\(inspection\\)",
    name: "Ecopmin inspection conveyor 1 m",
    bodyMm: { l: 1000, d: 700, h: 930, source: "estimate", note: "Length is the sheet's 1 m; depth and height as the 0.6 m link conveyor." },
    railFromFrontMm: 190,
    reachMm: { front: 90, back: 0, top: 480 },
    livery: { frame: "#c9cdd0", panel: "#e8e8e3", belt: "#1f7a55", trim: "#2b2d30", box: "#d9d9d4" },
    features: ["link conveyor with a lamp bridge over the belt for looking at the board before the oven"],
    refs: [{ label: "Line 1 machine list: Ecopmin 1 m link conveyor (inspection)", source: "sheet" }],
  },
  {
    key: "ecopmin-cooling-conveyor",
    family: "handling",
    types: ["OTHER"],
    match: "ecopmin\\s+1\\s*m\\s+cooling\\s+conveyor",
    name: "Ecopmin cooling conveyor 1 m",
    bodyMm: { l: 1000, d: 700, h: 930, source: "estimate", note: "Length is the sheet's 1 m; depth and height as the 0.6 m link conveyor." },
    railFromFrontMm: 190,
    reachMm: { front: 90, back: 0, top: 480 },
    livery: { frame: "#c9cdd0", panel: "#e8e8e3", belt: "#1f7a55", trim: "#2b2d30", box: "#d9d9d4" },
    features: ["link conveyor with a bridge of fans over the belt, after the oven"],
    refs: [{ label: "Line 1 machine list: Ecopmin 1 m cooling conveyor", source: "sheet" }],
  },
  {
    key: "famecs-lative-f20",
    family: "handling",
    types: ["LASER_MARKER"],
    match: "famecs\\s+lative",
    name: "Famecs Lative F20",
    bodyMm: { l: 800, d: 1250, h: 1650, source: "estimate", note: "Scaled off the plant's photo (slide 1); the maker's outline was not on file. Confirm on the floor." },
    railFromFrontMm: null,
    reachMm: { front: 340, back: 0, top: 420 },
    livery: { body: "#ededea", front: "#1b1c1e", window: "#0c0d0f" },
    features: ["tall cell with a black front in a white frame", "big dark window in the upper door", "Famecs in white, LATIVE-F20 in grey italics", "portrait monitor on an arm with the keyboard under it", "e-stop on the white column", "fume duct on the roof"],
    refs: [{ label: "LINE ONE ALL MACHINE SPECIFICATION DETAILS, slide 1: Famecs Lative F20", source: "sheet" }],
  },
];
