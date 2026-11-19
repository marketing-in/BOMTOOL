import type { MachineLook } from "./types";

/**
 * Stencil printers on our lines as the machines look on the floor. Facts only; the builders are in
 * src/components/ops/machine-3d/printers.ts under the same keys.
 */
export const PRINTERS_LOOKS: MachineLook[] = [
  {
    key: "htgd-gd450",
    family: "printers",
    types: ["STENCIL_PRINTER"],
    match: "htgd\\s+gd\\s*450",
    name: "HTGD GD450+",
    bodyMm: { l: 1140, d: 1450, h: 1480, source: "maker", note: "HTGD GD450+ specification (the plant photo shows GD450+ on the door)." },
    railFromFrontMm: 700,
    reachMm: { front: 300, back: 35, top: 220 },
    livery: { body: "#e8e7e0", shade: "#cfcdc6", window: "#2456d6", ink: "#1b2456", badge: "#1f3f8f", arm: "#b9bcbf" },
    features: ["plain upright white box", "blue-tinted window in the hood", "long steel bar handle under the window", "GD450+ PASTE PRINTER in navy on the door", "blue oval HTGD badge on the left pillar", "four buttons and the e-stop on the right column", "monitor on a swing arm"],
    refs: [
      { label: "LINE ONE ALL MACHINE SPECIFICATION DETAILS, slide 2 (screen printing)", source: "sheet" },
      { label: "MACHINERY DETAILS, page 6 (Line 1 machines) and pages 8–9 (printers)", source: "sheet" },
      { label: "HTGD GD450+ product page", source: "maker", url: "https://www.htgd.com.cn" },
    ],
  },
  {
    key: "mpm-momentum-ii-100",
    family: "printers",
    types: ["STENCIL_PRINTER"],
    match: "mpm\\s+momentum",
    name: "MPM Momentum II 100",
    bodyMm: { l: 1196, d: 1424, h: 1494, source: "maker", note: "ITW EAE MPM Momentum II 100 specification." },
    railFromFrontMm: 750,
    reachMm: { front: 400, back: 0, top: 430 },
    livery: { body: "#efeeec", frame: "#5e768a", window: "#dde3e6", ink: "#2f3b4c", arm: "#e6e6e4" },
    features: ["two stacked white blocks, square edges", "slate-blue frame round one big clear window", "double doors with the heavy MPM lettering", "e-stop on a yellow plate on the operator column", "four-colour signal tower: green, amber, blue, red", "monitor on a white swing arm"],
    refs: [
      { label: "MACHINERY DETAILS, page 7 (Line 2 machines) and pages 8–9 (printers)", source: "sheet" },
      { label: "MPM Momentum II 100 product page", source: "maker", url: "https://www.itweae.com" },
    ],
  },
];
