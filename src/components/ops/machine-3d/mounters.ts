import type * as THREE from "three";
import { placer, rig, type Rig } from "./parts";
import type { Kit, RealBuilder } from "./types";

/**
 * Pick and place on our lines, drawn as the real machines. One builder per look key of
 * src/knowledge/machine-looks/mounters.ts. Positions are mm from the left edge of the front and from the floor.
 */

/** A feeder cart standing in front of (dir 1) or behind (dir −1) a bay: side plates, two rows of reels, the bin, a push bar, castors. */
function cart(K: Kit, R: Rig, xc: number, w: number, zFace: number, dir: 1 | -1, o: { out: number; plate: THREE.Material; bin: THREE.Material; bar: THREE.Material; reels: THREE.Material[]; count: number; pitch: number; top: number }) {
  const { g, X, Y } = R;
  const x = X(xc), zc = zFace + (dir * o.out) / 2;
  for (const s of [-1, 1]) K.box(0.012, 0.56, o.out - 0.02, o.plate, x + (s * (w / 2 - 0.006)) / 1, Y(o.top) - 0.3, zc, g);
  K.reelRow(g, x, Y(o.top) - 0.1, zFace + dir * o.out * 0.45, { count: o.count, pitch: o.pitch, r: 0.095, colors: o.reels });
  K.reelRow(g, x, Y(o.top) - 0.33, zFace + dir * o.out * 0.68, { count: o.count, pitch: o.pitch, r: 0.095, colors: o.reels });
  K.box(w - 0.03, 0.2, o.out - 0.06, o.bin, x, 0.24, zc, g);
  K.box(w, 0.03, o.out - 0.02, o.plate, x, 0.12, zc, g);
  K.cyl(0.011, w, o.bar, x, Y(o.top) + 0.02, zFace + dir * (o.out - 0.015), g, "x", 10);
  for (const s of [-1, 1]) for (const k of [0.12, o.out - 0.08]) K.castor(g, x + s * (w / 2 - 0.05), zFace + dir * k, { h: 0.105, r: 0.035 });
}

/**
 * Yamaha YSM20R: an upright white block, deeper than wide. The front is a portal: a white pillar, a blue stripe,
 * the centre section, a blue stripe, the narrow control column. In the centre, bottom to top: two feeder carriages
 * under their banks of black feeders, a black flap with two grab handles, the grey strip with the Z:LEX badge, the
 * wide smoked window, and the pale cowl with the red YAMAHA badge. The monitor stands on the top at the right.
 */
const ysm20r: RealBuilder = (K, input) => {
  const L = input.look.livery;
  const zlex = /z\s*:?\s*lex/i.test(input.model);
  const R = rig(K, input, { feet: 115, window: { x0: 261, x1: 1181, y0: 115, y1: 1325, glass: false } });
  const { g, F, X, Y, zf } = R;
  const white = R.body, blue = K.paint(L.stripe), black = K.paint(L.flap, { finish: "matte" });

  // Centre section, top to bottom.
  R.panel(261, 1181, 1325, 1445, K.paint(L.cowl), 4);
  R.text("YAMAHA", 721, 1385, 150, 38, { color: L.badge, bg: "#ffffff", weight: 900, font: K.FONT.heavy, italic: true, radius: 0.1 }, zf + 0.004);
  K.box(0.92, 0.199, 0.005, K.glass(L.window, 0.6), X(721), Y(1225.5), zf - 0.008, g);
  R.panel(261, 1181, 1091, 1126, K.paint(L.strip), 6);
  if (zlex) R.text("Z:LEX", 721, 1108, 130, 28, { color: L.badge, weight: 900, italic: true, font: K.FONT.heavy }, zf + 0.006);
  R.panel(261, 1181, 1018, 1091, black, 10);
  for (const x of [430, 1010]) K.handle(g, X(x), Y(1055), zf + 0.01, { kind: "recess", len: 0.11 });
  for (const x of [236, 1181]) R.panel(x, x + 25, 115, 1445, blue, 3);

  // The bays: a dark wall behind, two banks of 32 feeders, a carriage under each.
  K.box(0.92, 0.9, 0.01, K.M.dark, X(721), Y(565), zf - 0.44, g);
  K.box(0.92, 0.012, 0.44, K.M.zinc, X(721), Y(1011), zf - 0.22, g);
  const carts = { out: 0.43, plate: white, bin: K.paint(L.bin), bar: K.M.dark, reels: [K.M.reelWhite, K.M.reelWhite, K.M.reelBlack], count: 30, pitch: 0.0142, top: 880 };
  for (const xc of [493, 949]) {
    K.feederBank(g, X(xc), Y(1005), zf - 0.38, { count: 32, pitch: 0.0135, len: 0.42, h: 0.1, reels: false, body: K.paint(L.feeder) });
    cart(K, R, xc, 0.445, zf, 1, carts);
    cart(K, R, xc, 0.445, F.zBack, -1, carts);
  }
  K.box(0.92, 0.07, 0.01, black, X(721), Y(1055), F.zBack - 0.005, g);

  // Left pillar: the nozzle station box and the clamp key. Right: the control column.
  R.hline(625, 0, 236);
  K.box(0.2, 0.11, 0.14, white, X(118), Y(905), zf + 0.07, g);
  K.box(0.16, 0.012, 0.1, K.M.steel, X(118), Y(966), zf + 0.07, g);
  K.cyl(0.0125, 0.02, K.M.black, X(137), Y(1126), zf + 0.01, g, "z", 14);
  R.hline(611, 1206, 1374);
  R.text("YSM20R", 1267, 1307, 88, 22, { color: L.ink, weight: 800 });
  K.rbox(0.115, 0.2, 0.03, 0.012, K.paint(L.box), X(1305), Y(1182), zf + 0.015, g, "z");
  const bz = zf + 0.03;
  K.button(g, X(1280), Y(1232), bz, "#2e8b57", { r: 0.012, lit: 0.5 });
  K.button(g, X(1330), Y(1232), bz, "#c8322c", { r: 0.012 });
  K.estop(g, X(1305), Y(1140), bz, { size: 0.058, box: false });
  K.louvre(g, X(1290), Y(990), zf, 0.105, 0.105, { slats: 7 });
  K.mainSwitch(g, X(1290), Y(480), zf, { size: 0.07, color: "black" });
  K.warning(g, 0.06, X(1290), Y(572), zf, { kind: "voltage" });

  // On top: the monitor at the right front, the tower at the left.
  K.cyl(0.02, 0.12, K.M.zinc, X(1230), F.h + 0.06, zf - 0.14, g, "y", 12);
  const screen = K.screen(g, X(1230), F.h + 0.26, zf - 0.14, { w: 0.34, h: 0.27, depth: 0.05, rim: 0.016, bezel: K.paint(L.monitor), ui: { title: zlex ? "YSM20R Z:LEX" : "YSM20R" } });
  const lamps = K.tower(g, X(118), F.h, F.zMid, { order: ["green", "amber", "red"], r: 0.03, segH: 0.06, pole: 0.12, poleMat: K.M.white });
  for (const face of ["left", "right"] as const) K.seam(g, face === "left" ? -F.l / 2 : F.l / 2, 0.611, F.zMid, F.d - 0.1, { face });
  K.nameplate(g, ["YAMAHA", zlex ? "YSM20R Z:LEX" : "YSM20R", "440 V · 3 PH"], 0.14, 0.08, F.l / 2, 0.45, F.zMid + 0.5, { face: "right" });

  // Behind the window: the beam and its head.
  const works = placer(K, R, input.cy, { x: X(721), zFeed: zf - 0.3, y: 1.23, head: K.paint("#d9dbdd") });
  return R.done(lamps, screen, works.moving, works.work);
};

/**
 * Yamaha M20 (i-PULSE): low, wide and square in plan. Four big rounded silver corner pillars, two open bays with
 * black feeder carts either side of a centre post, a black slotted band over the bays, and a cream hood standing
 * proud with a long dark window and the blue i-PULSE lettering. The top is periwinkle behind the hood; the white
 * monitor stands on the top at the right.
 */
const m20: RealBuilder = (K, input) => {
  const L = input.look.livery;
  const R = rig(K, input, { feet: 100, window: { x0: 320, x1: 1500, y0: 100, y1: 990, glass: false } });
  const { g, F, X, Y, zf } = R;
  const cream = R.body, silver = K.paint(L.pillar, { finish: "metal" }), black = K.paint(L.band, { finish: "matte" }), blue = L.ink;

  // Corner pillars, floor to top, a little proud of the body.
  for (const sx of [-1, 1]) for (const z of [zf - 0.135, F.zBack + 0.135]) K.rbox(0.115, 1.29, 0.28, 0.05, silver, sx * (F.l / 2 - 0.0575), 0.745, z, g, "y");
  // The hood: proud of the columns, with its window band and the handle under its lip.
  R.panel(115, 1635, 1136, 1420, cream, 30);
  R.panel(140, 1490, 1163, 1298, K.paint(L.window, { finish: "gloss" }), 32);
  K.handle(g, X(770), Y(1118), zf + 0.03, { kind: "bar", len: 0.32, out: 0.045 });
  R.text("i-PULSE", 770, 1340, 160, 28, { color: blue, weight: 900, font: K.FONT.heavy }, zf + 0.03);
  R.panel(690, 850, 1318, 1322, K.paint(blue), 31);
  K.decal(g, "M20", 0.19, 0.05, X(770), F.h, zf - 0.16, { face: "top", color: blue, weight: 900, italic: true, font: K.FONT.heavy });
  K.box(1.5, 0.006, F.d - 0.5, K.paint(L.top), 0, F.h + 0.003, (zf - 0.42 + F.zBack + 0.06) / 2, g);
  R.panel(320, 1500, 990, 1133, black, 4);
  K.louvre(g, X(910), Y(1062), zf + 0.004, 1.1, 0.1, { slats: 8, frame: null });

  // The bays: stainless back plates, the centre post with its e-stop, feeder banks and carts.
  K.box(0.13, 0.89, 0.32, cream, X(920), Y(545), zf - 0.16, g);
  K.box(0.13, 0.2, 0.06, cream, X(920), Y(860), zf + 0.03, g);
  K.estop(g, X(920), Y(852), zf + 0.06, { size: 0.07, box: false });
  const carts = { out: 0.41, plate: K.M.dark, bin: K.paint(L.bin), bar: K.paint("#c8cacb", { finish: "metal" }), reels: [K.M.reelBlack, K.M.reelBlack, K.M.reelWhite], count: 28, pitch: 0.0175, top: 760 };
  for (const xc of [587, 1242]) {
    K.box(0.53, 0.41, 0.01, K.paint(L.plate, { finish: "metal" }), X(xc), Y(605), zf - 0.25, g);
    K.box(0.53, 0.012, 0.3, K.M.zinc, X(xc), Y(965), zf - 0.15, g);
    K.feederBank(g, X(xc), Y(960), zf - 0.3, { count: 29, pitch: 0.0175, len: 0.34, h: 0.1, reels: false, body: K.paint(L.feeder) });
    cart(K, R, xc, 0.52, zf, 1, carts);
    cart(K, R, xc, 0.52, F.zBack, -1, { ...carts, out: 0.26 });
  }
  K.box(1.18, 0.143, 0.008, black, X(910), Y(1062), F.zBack - 0.004, g);

  // The control column: e-stop on a yellow plate, three buttons, main switch, pressure gauge.
  R.panel(1532, 1602, 1050, 1130, K.M.yellow, 2);
  K.estop(g, X(1567), Y(1090), zf + 0.002, { size: 0.06, box: false });
  const cols: [number, string][] = [[1010, "#1f7a4d"], [960, "#c8322c"], [910, "#e0a21e"]];
  for (const [y, c] of cols) K.button(g, X(1567), Y(y), zf, c, { r: 0.012, lit: c === "#1f7a4d" ? 0.5 : 0 });
  K.mainSwitch(g, X(1567), Y(790), zf, { size: 0.08, color: "black" });
  K.gauge(g, X(1567), Y(690), zf, { r: 0.03 });
  K.warning(g, 0.07, X(217), Y(250), zf, { kind: "caution" });

  // On top: the white monitor at the right front with its keyboard shelf, the tower at the left.
  K.cyl(0.022, 0.1, K.M.white, X(1585), F.h + 0.05, zf - 0.1, g, "y", 12);
  const screen = K.screen(g, X(1585), F.h + 0.24, zf - 0.1, { w: 0.3, h: 0.25, depth: 0.06, rim: 0.03, bezel: K.paint(L.monitor), ui: { title: "M20" } });
  K.box(0.36, 0.02, 0.24, K.paint(L.monitor), X(1560), Y(1245), zf + 0.15, g);
  K.keyboard(g, X(1560), Y(1255), zf + 0.15, { w: 0.3, d: 0.12, mouse: false });
  const lamps = K.tower(g, X(200), F.h, zf - 0.6, { order: ["green", "amber", "red"], r: 0.03, segH: 0.06, pole: 0.22, poleMat: K.M.white });
  K.nameplate(g, ["i-PULSE", "Model M20", "440 V · 3 PH"], 0.19, 0.075, F.l / 2, 0.4, F.zBack + 0.14, { face: "right" });
  // Under the hood: the beam and its head, between the feeders and the board.
  const works = placer(K, R, input.cy, { x: 0, zFeed: zf - 0.28, y: 1.2, head: K.paint("#d9dbdd") });
  return R.done(lamps, screen, works.moving, works.work);
};

export const MOUNTERS_BUILDERS: Record<string, RealBuilder> = {
  "yamaha-m20": m20,
  "yamaha-ysm20r": ysm20r,
};
