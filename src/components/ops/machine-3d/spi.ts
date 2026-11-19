import { magicray } from "./magicray";
import { inspector, rig } from "./parts";
import type { RealBuilder } from "./types";

/**
 * Solder paste inspection on our lines, drawn as the real machines. One builder per look key of
 * src/knowledge/machine-looks/spi.ts. Positions are mm from the left edge of the front and from the floor.
 */

/**
 * Koh Young KY8030-2: a white box standing high on four chrome legs; a charcoal control strip down the left edge of
 * the front, a black window across the top with the model name on it, an aluminium grab rail under it, the maker's
 * name on the door, and a black monitor hanging on an arm at the upper right over a keyboard shelf.
 */
const kohYoung: RealBuilder = (K, input) => {
  const L = input.look.livery;
  const R = rig(K, input, { feet: 167, legs: true });
  const { g, F, X, Y, zf } = R;
  R.panel(0, 88, 157, 1627, K.paint(L.strip), 4);
  R.vline(900, 177, 1627);
  R.hline(177, 88, 900);
  R.panel(88, 900, 1042, 1082, K.paint(L.band), 1);
  K.rbox(0.812, 0.033, 0.03, 0.012, K.M.alu, X(494), Y(1098), zf + 0.015, g, "x");
  R.panel(147, 840, 1120, 1172, K.paint(L.perforated), 1);
  R.panel(147, 840, 1180, 1527, K.paint(L.window, { finish: "gloss" }), 2);
  R.text("KY8030-2", 257, 1501, 200, 32, { color: "#e6e6e3", weight: 700, spacing: 0.08 }, zf + 0.002);
  R.text("KOHYOUNG", 490, 978, 400, 36, { color: "#5a5858", weight: 600, spacing: 0.22 });
  // The control strip: e-stop, two pairs of push-buttons, the key switch, the main switch.
  const z = zf + 0.004;
  K.estop(g, X(44), Y(1479), z, { size: 0.074 });
  for (const y of [1398, 1199]) {
    K.button(g, X(24), Y(y), z, L.green, { r: 0.013, lit: 0.4 });
    K.button(g, X(64), Y(y), z, L.red, { r: 0.013 });
  }
  K.cyl(0.0125, 0.02, K.M.chrome, X(44), Y(1262), z + 0.01, g, "z", 14);
  K.mainSwitch(g, X(44), Y(1112), z, { size: 0.066 });
  // Monitor and keyboard shelf on the arm from the right column.
  R.panel(905, 995, 1025, 1103, K.paint(L.arm), 6);
  const screen = K.monitorArm(g, X(950), Y(1250), zf, { w: 0.5, h: 0.3, reach: 0.2, rise: 0.2, drop: 0.07, shift: -0.17, trayW: 0.46, trayD: 0.2, mat: K.paint(L.arm), ui: { title: "KY8030-2" } });
  for (const face of ["left", "right"] as const) K.louvre(g, face === "left" ? -F.l / 2 : F.l / 2, 0.5, F.zMid - 0.25, 0.36, 0.14, { face, slats: 6 });
  K.nameplate(g, ["KOH YOUNG", "KY8030-2 · 3D SPI", "220 V · 1 PH"], 0.12, 0.07, 0, 0.5, F.zBack, { face: "back" });
  const lamps = K.tower(g, X(120), R.y1, F.zBack + 0.16, { order: ["green", "amber", "red"], r: 0.028, segH: 0.07, pole: 0.1, colors: { amber: 0xf2c81f } });
  const works = inspector(K, R, input.cy, 0xb7d4ff);
  return R.done(lamps, screen, works.moving, works.work);
};

/**
 * CKD VP-01G: a compact white box sitting low, split at half height by a grey seam; rounded pilasters either side,
 * a black screen standing proud of the upper half on a silver neck, the "PUSH" keyboard flap under it, the green CKD
 * mark and the model name on the door, a black main switch, and a slim tower at the front left of the top.
 */
const ckd: RealBuilder = (K, input) => {
  const L = input.look.livery;
  const R = rig(K, input, { feet: 85, setback: 58 });
  const { g, F, X, Y, zf } = R;
  for (const x of [145, 802]) R.panel(x - 7, x + 8, 88, 1480, K.paint("#c9c8c5"), 1);
  R.panel(0, 938, 890, 902, K.paint(L.seam), 1);
  R.panel(20, 45, 888, 904, K.M.black, 3);
  R.panel(890, 915, 888, 904, K.M.black, 3);
  R.outline(150, 798, 922, 1096);
  R.text("PUSH", 474, 1104, 40, 9, { color: "#8a8a88", weight: 600, spacing: 0.1 });
  R.outline(147, 803, 88, 885);
  R.text("CKD", 210, 858, 70, 26, { color: L.logo, weight: 900 });
  R.text("VP-01G", 680, 857, 195, 28, { color: L.model, weight: 600, spacing: 0.1 });
  K.handle(g, X(185), Y(722), zf, { kind: "recess", len: 0.123, vertical: true });
  K.mainSwitch(g, X(668), Y(599), zf, { size: 0.107, color: "black" });
  K.estop(g, X(82), Y(1389), zf, { size: 0.058, box: false });
  K.warning(g, 0.045, X(82), Y(1227), zf, { kind: "caution" });
  R.panel(391, 541, 1098, 1123, K.M.zinc, 30);
  const screen = K.screen(g, X(467), Y(1292), zf + 0.03, { w: 0.529, h: 0.307, depth: 0.027, rim: 0.012, ui: { title: "VP-01G" } });
  for (const face of ["left", "right"] as const) K.louvre(g, face === "left" ? -F.l / 2 : F.l / 2, 0.4, F.zMid - 0.2, 0.34, 0.14, { face, slats: 6 });
  K.nameplate(g, ["CKD", "VP-01G · 3D SPI", "1 PH 200–240 V"], 0.12, 0.07, 0, 0.5, F.zBack, { face: "back" });
  const lamps = K.tower(g, X(96), R.y1, F.zFront - 0.162, { order: ["green", "amber", "red"], r: 0.02, segH: 0.032, pole: 0.2, colors: { green: 0x079c8a, amber: 0xee7d23, red: 0xb53331 } });
  const works = inspector(K, R, input.cy, 0xb7ffcf);
  return R.done(lamps, screen, works.moving, works.work);
};

export const SPI_BUILDERS: Record<string, RealBuilder> = {
  "magicray-icon": magicray({
    feet: 119,
    block: [131, 869],
    pillarTop: 1586,
    setback: 32,
    doorTop: 845,
    flap: [165, 833, 934, 1104],
    bar: { y: [1200, 1228], proud: 12, mid: "#9a73a8", cap: "#683486" },
    screen: [238, 760, 1278, 1596],
    logo: { xc: 500, yc: 1154, w: 298, h: 64 },
    model: { text: "icon", xc: 720, yc: 760, w: 151, h: 64, color: "#575655" },
    plate: [894, 970, 1320, 1500],
    mainSwitch: { xc: 932, yc: 1258, size: 65 },
    tower: { x: 196, z: 1190 },
    stripes: "#754697",
  }),
  "kohyoung-ky8030-2": kohYoung,
  "ckd-vp-01g": ckd,
};
