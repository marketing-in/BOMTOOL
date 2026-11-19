import type { MachineLook } from "./types";

/**
 * Pick and place on our lines as the machines look on the floor. Facts only; the builders are in
 * src/components/ops/machine-3d/mounters.ts under the same keys.
 */
export const MOUNTERS_LOOKS: MachineLook[] = [
  {
    key: "yamaha-m20",
    family: "mounters",
    types: ["PICK_AND_PLACE"],
    match: "m20\\s*\\(?i-?pulse|i-?pulse\\s*m20",
    name: "Yamaha M20 (i-PULSE)",
    bodyMm: { l: 1750, d: 1750, h: 1420, source: "maker", note: "i-PULSE M20 specification." },
    railFromFrontMm: 723,
    reachMm: { front: 430, back: 280, top: 500 },
    livery: { body: "#e7e4db", pillar: "#bfc1c0", top: "#a9b4e4", window: "#2e3233", band: "#1c1e1f", ink: "#2f40a0", feeder: "#222325", bin: "#1f2226", plate: "#b5b7b8", monitor: "#e9e9e4" },
    features: ["low, wide and square in plan", "four rounded silver corner pillars", "cream hood with a long dark window and blue i-PULSE lettering", "black slotted band over two open bays", "black feeder carts with their reels, front and back", "periwinkle top behind the hood", "white monitor on the top at the right"],
    refs: [
      { label: "LINE ONE ALL MACHINE SPECIFICATION DETAILS, slide 4: Yamaha M20 i-Pulse", source: "sheet" },
      { label: "MACHINERY DETAILS, pages 6 and 11–15 (pick and place)", source: "sheet" },
      { label: "Yamaha Motor, i-PULSE M20", source: "maker", url: "https://global.yamaha-motor.com/business/smt/" },
    ],
  },
  {
    key: "yamaha-ysm20r",
    family: "mounters",
    types: ["PICK_AND_PLACE"],
    match: "ysm\\s*20r",
    name: "Yamaha YSM20R",
    bodyMm: { l: 1374, d: 1857, h: 1445, source: "sheet", note: "YAMAHA YSM20R specification sheet: L 1,374 × W 1,857 × H 1,445 mm." },
    railFromFrontMm: 933,
    reachMm: { front: 440, back: 440, top: 420 },
    livery: { body: "#e3e3e1", cowl: "#e6e8ec", strip: "#cfd2d8", stripe: "#254e90", window: "#2b303a", flap: "#2a2b2d", badge: "#d8232f", ink: "#4a4d52", box: "#e9e8e1", feeder: "#1f2022", bin: "#3a3a3c", monitor: "#e7e7e4" },
    features: ["upright white block, deeper than wide", "two blue stripes framing the centre section", "pale cowl with the red YAMAHA badge", "wide smoked window over the grey Z:LEX strip", "black flap with two grab handles", "two banks of 32 black feeders over two carriages, front and back", "monitor on the top at the right, tower at the left"],
    refs: [
      { label: "YAMAHA YSM20R specification sheet", source: "sheet" },
      { label: "MACHINERY DETAILS, page 7 (Line 2 machines) and pages 11–12", source: "sheet" },
      { label: "Yamaha Motor, YSM20R", source: "maker", url: "https://global.yamaha-motor.com/business/smt/mounter/ysm20r/" },
    ],
  },
];
