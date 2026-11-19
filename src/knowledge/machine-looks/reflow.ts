import type { MachineLook } from "./types";

/**
 * Reflow ovens on our lines as the machines look on the floor. Facts only; the builders are in
 * src/components/ops/machine-3d/reflow.ts under the same keys.
 */
export const REFLOW_LOOKS: MachineLook[] = [
  {
    key: "tronwin-tw-vp860n",
    family: "reflow",
    types: ["REFLOW_OVEN"],
    match: "tronwin\\s+tw-?vp\\s*860",
    name: "Tronwin TW-VP860N",
    bodyMm: {
      l: 5000,
      d: 1400,
      h: 1450,
      source: "estimate",
      note: "Scaled off the plant's photo against the sheet's 2,652 mm heated length and 650–700 mm cooling length; the maker's outline was not on file. Confirm on the floor.",
    },
    railFromFrontMm: null,
    reachMm: { front: 0, back: 0, top: 560 },
    livery: { body: "#edebe0", hood: "#f0eee4", badge: "#1f3f8f", ink: "#1b2a6b" },
    features: ["cream body", "long hood in four sections, its front a flat slope", "TW-VP860N in navy italics on the hood", "round blue TRONWIN badge on the band", "four cabinet doors with black recessed handles", "control computer at the entry end", "two flexible exhaust ducts"],
    refs: [{ label: "LINE ONE ALL MACHINE SPECIFICATION DETAILS, slide 5: Tronwin TW-VP860N", source: "sheet" }],
  },
  {
    key: "vitronics-centurion-820",
    family: "reflow",
    types: ["REFLOW_OVEN"],
    match: "vitronics.*centurion",
    name: "Vitronics Soltec Centurion 820",
    bodyMm: {
      l: 5900,
      d: 1560,
      h: 1600,
      source: "estimate",
      note: "Scaled off the plant's photo against the sheet's 3,550 mm process length; the maker's outline was not on file. Confirm on the floor.",
    },
    railFromFrontMm: null,
    reachMm: { front: 0, back: 0, top: 560 },
    livery: { body: "#e9eae8", hood: "#f1f2f0", badge: "#2a3138", ink: "#2a3138" },
    features: ["white body", "long clamshell hood with a rounded front, in five sections", "a row of small viewing windows", "Vitronics Soltec and Centurion lettering on the hood", "six cabinet doors", "control computer at the entry end", "two exhaust ducts"],
    refs: [{ label: "MACHINERY DETAILS, page 7 (Line 2 machines) and pages 17–18 (reflow)", source: "sheet" }],
  },
];
