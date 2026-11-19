import { gantry, rig, type Rig } from "./parts";
import type { Kit, RealBuilder } from "./types";

/**
 * Stencil printers on our lines, drawn as the real machines. One builder per look key of
 * src/knowledge/machine-looks/printers.ts. Positions are mm from the left edge of the front and from the floor.
 */

/** What is seen through a printer's window: the stencil in its frame over the board, and the print head on its beam. */
function printWorks(K: Kit, R: Rig, cy: number, o: { beam: string; head: string; y: number }) {
  const { g } = R;
  const fy = cy + 0.11, s = 0.66, bar = 0.035;
  for (const k of [-1, 1]) {
    K.box(s, 0.03, bar, K.M.alu, 0, fy, k * (s / 2 - bar / 2), g);
    K.box(bar, 0.03, s - bar * 2, K.M.alu, k * (s / 2 - bar / 2), fy, 0, g);
  }
  K.box(s - bar * 2, 0.002, s - bar * 2, K.M.chrome, 0, fy - 0.012, 0, g);
  const G = gantry(K, R, { y: o.y, span: R.F.l - 0.2, beam: K.paint(o.beam), head: K.paint(o.head), headW: 0.5, headH: 0.2 });
  K.box(0.44, 0.1, 0.006, K.M.steel, 0, -0.22, 0.09, G.head);
  return {
    moving: [G.beam],
    // The squeegee strokes front to back while a board is under the stencil.
    work: (t: number, inside: boolean) => {
      G.beam.position.z = inside ? 0.2 * Math.sin(t * 1.3) : -0.22;
    },
  };
}

/**
 * HTGD GD450+: a plain upright white box, a portal of two pillars with the hood and one door between them. A blue
 * tinted window in the hood with a long steel bar handle under it, the model name in navy on the door, the maker's
 * blue oval badge on the left pillar, a column of four buttons and the e-stop on the right, the monitor on a swing arm.
 */
const gd450: RealBuilder = (K, input) => {
  const L = input.look.livery;
  const R = rig(K, input, { feet: 125, window: { x0: 230, x1: 920, y0: 943, y1: 1453, tint: L.window, opacity: 0.42 } });
  const { g, F, X, Y, zf } = R;
  R.hline(870, 0, 1140);
  R.vline(205, 125, 1480);
  R.vline(945, 125, 1480);
  K.handle(g, X(575), Y(905), zf, { kind: "bar", len: 0.54, out: 0.045 });
  R.panel(923, 945, 445, 595, K.paint(L.shade), 1);
  R.text("GD450+", 400, 780, 300, 56, { color: L.ink, weight: 900, font: K.FONT.heavy });
  R.text("PASTE PRINTER", 362, 730, 225, 18, { color: L.ink, weight: 700, spacing: 0.08 });
  K.art(g, "htgd-badge", 0.13, 0.085, X(102), Y(1340), zf, (c, W, H) => {
    c.fillStyle = "#c9ccd0";
    c.beginPath();
    c.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = L.badge;
    c.beginPath();
    c.ellipse(W / 2, H / 2, W / 2 - 4, H / 2 - 4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffffff";
    c.font = `italic 900 ${Math.round(H * 0.44)}px ${K.FONT.heavy}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("HTGD", W / 2, H * 0.53, W * 0.78);
  });
  // The control column: four buttons, the e-stop, a cable port, the main switch.
  const cols: [number, string, number][] = [[1320, "#2fb45a", 0.6], [1258, "#e0a21e", 0], [1196, "#33363a", 0], [1134, "#d8322a", 0.4]];
  for (const [y, c, lit] of cols) K.button(g, X(1042), Y(y), zf, c, { r: 0.011, lit });
  K.estop(g, X(1042), Y(1035), zf, { size: 0.065, box: false });
  K.cyl(0.032, 0.006, K.M.white, X(1042), Y(830), zf + 0.003, g, "z", 18);
  K.mainSwitch(g, X(1042), Y(700), zf, { size: 0.07 });
  const screen = K.monitorArm(g, X(1090), Y(960), zf, { w: 0.42, h: 0.3, reach: 0.14, rise: 0.42, drop: 0.02, shift: -0.13, trayW: 0.4, trayD: 0.18, mat: K.paint(L.arm), ui: { title: "GD450+" } });
  for (const face of ["left", "right"] as const) K.louvre(g, face === "left" ? -F.l / 2 : F.l / 2, 0.45, F.zMid - 0.3, 0.4, 0.16, { face, slats: 6 });
  K.nameplate(g, ["HTGD", "GD450+ PASTE PRINTER", "220 V · 1 PH"], 0.12, 0.07, 0, 0.5, F.zBack, { face: "back" });
  const lamps = K.tower(g, X(1040), R.y1, zf - 0.3, { order: ["green", "amber", "red"], r: 0.028, segH: 0.05, pole: 0.02 });
  const works = printWorks(K, R, input.cy, { beam: "#1c1c1c", head: "#f2f2f2", y: 1.3 });
  return R.done(lamps, screen, works.moving, works.work);
};

/**
 * MPM Momentum II 100: two stacked white blocks, crisp and square. The whole front of the upper one is a slate-blue
 * frame round a big clear window; the cabinet below has double doors with the heavy MPM lettering, the operator
 * column at the right carries the e-stop on a yellow plate, a four-colour tower stands on the roof, and the monitor
 * swings on a white arm.
 */
const momentum: RealBuilder = (K, input) => {
  const L = input.look.livery;
  const R = rig(K, input, { feet: 100, window: { x0: 195, x1: 1020, y0: 904, y1: 1444, tint: L.window, opacity: 0.2 } });
  const { g, F, X, Y, zf } = R;
  const slate = K.paint(L.frame);
  R.panel(135, 195, 820, 1494, slate, 20);
  R.panel(1020, 1070, 820, 1494, slate, 20);
  R.panel(195, 1020, 820, 904, slate, 20);
  R.panel(195, 1020, 1444, 1494, slate, 20);
  K.box(0.935, 0.004, 0.5, slate, X(602.5), R.y1 + 0.002, zf - 0.25, g);
  R.panel(543, 663, 845, 875, K.paint("#465a6b"), 21);
  R.hline(820, 0, 1196);
  R.outline(205, 610, 100, 820);
  R.outline(610, 1005, 100, 820);
  for (const x of [530, 690]) K.handle(g, X(x), Y(463), zf, { kind: "recess", len: 0.114, vertical: true });
  R.text("MPM", 395, 718, 260, 80, { color: L.ink, weight: 900, font: K.FONT.heavy });
  R.text("Momentum II", 395, 659, 175, 22, { color: "#4a4f57", weight: 500 });
  R.text("CE", 1100, 720, 40, 30, { color: "#111111", weight: 700 });
  K.mainSwitch(g, X(1100), Y(600), zf, { size: 0.07, color: "black" });
  for (const y of [1290, 1230]) K.warning(g, 0.06, X(67), Y(y), zf, { kind: "caution" });
  K.button(g, X(1133), Y(1330), zf, "#f2f1ec", { r: 0.012 });
  K.button(g, X(1133), Y(1270), zf, "#176335", { r: 0.012, lit: 0.4 });
  K.button(g, X(1133), Y(1210), zf, "#1e1e1e", { r: 0.012 });
  R.panel(1098, 1168, 1085, 1180, K.M.yellow, 2);
  K.estop(g, X(1133), Y(1132), zf + 0.002, { size: 0.06, box: false });
  const screen = K.monitorArm(g, X(1150), Y(1250), zf, { w: 0.42, h: 0.32, reach: 0.2, rise: 0.25, drop: 0.12, shift: -0.17, trayW: 0.42, trayD: 0.2, mat: K.paint(L.arm), ui: { title: "Momentum II" } });
  for (const face of ["left", "right"] as const) K.louvre(g, face === "left" ? -F.l / 2 : F.l / 2, 0.42, F.zMid - 0.3, 0.4, 0.16, { face, slats: 6 });
  K.nameplate(g, ["MPM", "MOMENTUM II 100", "220 V · 1 PH"], 0.12, 0.07, 0, 0.5, F.zBack, { face: "back" });
  const lamps = K.tower(g, X(1100), R.y1, F.zBack + 0.2, { order: ["green", "amber", "blue", "red"], r: 0.03, segH: 0.06, pole: 0.12 });
  const works = printWorks(K, R, input.cy, { beam: "#2b2b2d", head: "#3a3c40", y: 1.32 });
  return R.done(lamps, screen, works.moving, works.work);
};

export const PRINTERS_BUILDERS: Record<string, RealBuilder> = {
  "htgd-gd450": gd450,
  "mpm-momentum-ii-100": momentum,
};
