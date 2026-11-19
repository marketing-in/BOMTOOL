import { magicray } from "./magicray";
import type { RealBuilder } from "./types";

/**
 * AOI on our lines, drawn as the real machines: the three Magic-ray models. One builder per look key of
 * src/knowledge/machine-looks/aoi.ts. They share the family's body plan (./magicray) and differ as the real ones do:
 * the V5000 is the narrow one with the violet bar, the V5300 the deep one with the red bar and a door lever, the
 * Cube the wide one with grey pillars and its name down the door.
 */
export const AOI_BUILDERS: Record<string, RealBuilder> = {
  "magicray-v5000": magicray({
    feet: 116,
    block: [122, 813],
    pillarTop: 1535,
    setback: 38,
    doorTop: 819,
    flap: [155, 780, 920, 1086],
    bar: { y: [1138, 1159], proud: 33, mid: "#7b459c", cap: "#6d3d92" },
    screen: [225, 710, 1224, 1509],
    logo: { xc: 467, yc: 1005, w: 259, h: 55 },
    model: { text: "V5000", xc: 260, yc: 754, w: 165, h: 34, color: "#5f5d5c" },
    plate: [839, 908, 1263, 1441],
    mainSwitch: { xc: 874, yc: 1200, size: 60 },
    tower: { x: 192, z: 1254 },
  }),
  "magicray-v5300": magicray({
    feet: 119,
    block: [178, 870],
    pillarTop: 1565,
    setback: 39,
    doorTop: 840,
    doorPanel: [209, 841, 152, 807],
    flap: [209, 841, 935, 1106],
    bar: { y: [1160, 1181], proud: 34, mid: "#d0141e", cap: "#c41820" },
    screen: [274, 778, 1253, 1579],
    logo: { xc: 523, yc: 1021, w: 313, h: 64 },
    model: { text: "V5300", xc: 338, yc: 735, w: 179, h: 37, color: "#6a6766" },
    plate: [920, 994, 1210, 1405],
    mainSwitch: { xc: 90, yc: 1287, size: 75 },
    tower: { x: 269, z: 1359 },
    lever: { xc: 792, yc: 478 },
  }),
  "magicray-cube-plus": magicray({
    feet: 117,
    block: [173, 966],
    pillarTop: 1590,
    setback: 21,
    doorTop: 897,
    flap: [269, 870, 945, 1117],
    bar: { y: [1166, 1187], proud: 35, mid: "#7a4798", cap: "#612489" },
    bezel: [270, 870, 1244, 1620],
    screen: [335, 807, 1319, 1583],
    logo: { xc: 420, yc: 1278, w: 165, h: 33 },
    model: { text: "cube", xc: 759, yc: 1270, w: 102, h: 26, color: "#9fa1a5", thin: true },
    plate: [1007, 1099, 1278, 1483],
    mainSwitch: { xc: 1053, yc: 1215, size: 66 },
    tower: { x: 250, z: 1250 },
    pillar: "#d3d4d5",
    doorLines: { x: [485, 653], y: [170, 811], text: "3D Automated Optical Inspection" },
  }),
};
