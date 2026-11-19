import type { MachineLook } from "./types";

/**
 * AOI on our lines as the machines look on the floor. Facts only; the builders are in
 * src/components/ops/machine-3d/aoi.ts under the same keys.
 */
const FAMILY = ["white centre block proud of two lower pillars", "screen built into the top of the block", "keyboard behind a flap", "MAGICray lettering, e-stop and buttons on the right pillar", "signal tower at the rear left of the top"];

export const AOI_LOOKS: MachineLook[] = [
  {
    key: "magicray-v5000",
    family: "aoi",
    types: ["AOI"],
    match: "magic-?ray\\s+v5000",
    name: "Magic-ray V5000",
    bodyMm: { l: 935, d: 1360, h: 1570, source: "maker", note: "Maker's outline drawing of the V5000 series." },
    railFromFrontMm: 665,
    reachMm: { front: 60, back: 33, top: 345 },
    livery: { body: "#f1f1f2", monitor: "#edecee", plate: "#f5f5f5", bar: "#7b459c", amber: "#f6a51e", green: "#1fa060" },
    features: [...FAMILY, "violet bar under the screen", "V5000 on the door"],
    refs: [
      { label: "LINE ONE ALL MACHINE SPECIFICATION DETAILS, slide 6: the V5000 on Line 1", source: "sheet" },
      { label: "Magic-ray V5000 series product page", source: "maker", url: "https://www.magic-ray.com" },
    ],
  },
  {
    key: "magicray-v5300",
    family: "aoi",
    types: ["AOI"],
    match: "magic-?ray\\s+v5300",
    name: "Magic-ray V5300",
    bodyMm: { l: 1045, d: 1470, h: 1600, source: "sheet", note: "AOI Magic-ray V5300 brochure, dimension drawing." },
    railFromFrontMm: 697,
    reachMm: { front: 60, back: 34, top: 345 },
    livery: { body: "#f1f1f2", monitor: "#edecee", plate: "#f5f5f5", bar: "#d0141e", amber: "#f6a51e", green: "#1fa060" },
    features: [...FAMILY, "red bar under the screen", "framed door with a chrome lever", "main switch on the left pillar", "deeper than its neighbours: it inspects both sides"],
    refs: [{ label: "AOI Magic-ray V5300 brochure, pages 1–4", source: "sheet" }],
  },
  {
    key: "magicray-cube-plus",
    family: "aoi",
    types: ["AOI"],
    match: "magic-?ray\\s+cube",
    name: "Magic-ray Cube+",
    bodyMm: { l: 1140, d: 1360, h: 1620, source: "sheet", note: "Magic-ray Cube brochure, dimension drawing." },
    railFromFrontMm: 603,
    reachMm: { front: 60, back: 13, top: 345 },
    livery: { body: "#fafafa", pillar: "#d3d4d5", pillarEdge: "#b5b6b7", bezel: "#ededee", monitor: "#ededee", plate: "#e9e9ea", bar: "#7a4798", amber: "#e88a2e", green: "#2a9a5e" },
    features: [...FAMILY, "light-grey pillars", "pale plate round a flush screen", "violet bar", "\"3D Automated Optical Inspection\" down the door between two grey lines", "\"cube\" under the screen"],
    refs: [{ label: "Magic-ray Cube brochure, pages 1–4", source: "sheet" }],
  },
];
