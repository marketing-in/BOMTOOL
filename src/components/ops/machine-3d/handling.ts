import { lookFrame } from "@/knowledge/machine-looks/types";
import { rig } from "./parts";
import type { RealBuilder } from "./types";

/**
 * Board handling on our lines, drawn as the real machines. One builder per look key of
 * src/knowledge/machine-looks/handling.ts; built with the kit only (./kit), sealed before it is returned.
 */

/**
 * Ecopmin link conveyor, 0.6 m: an aluminium-profile table on four levelling feet with sheet panels, two belt rails
 * (the front one fixed, the rear one on two lead screws turned together by the handwheel in front), the drive motor
 * on a hex shaft under the rails, a control box on the front and a board sensor at each end.
 */
const conveyor =
  (kind: "link" | "inspection" | "cooling"): RealBuilder =>
  (K, { look, cy }) => {
  const F = lookFrame(look);
  const g = K.group();
  const L = look.livery;
  const frame = K.paint(L.frame, { finish: "metal" });
  const panel = K.paint(L.panel);
  const boxPaint = K.paint(L.box);
  const trim = K.paint(L.belt, { finish: "matte" });
  const ink = L.trim;

  // The table: four legs on feet, a top and a bottom ring of profile, panels between them.
  const lx = F.l / 2 - 0.02, zf = F.zFront - 0.02, zb = F.zBack + 0.02, zc = (zf + zb) / 2, span = zf - zb - 0.04;
  const top = 0.83, low = 0.22;
  for (const sx of [-1, 1])
    for (const z of [zf, zb]) {
      K.foot(g, sx * lx, z, { h: 0.08 });
      K.extrusion(g, top - 0.02 - 0.08, sx * lx, (top - 0.02 + 0.08) / 2, z, { axis: "y", mat: frame });
    }
  for (const z of [zf, zb]) {
    K.extrusion(g, F.l, 0, top, z, { mat: frame });
    K.extrusion(g, F.l - 0.08, 0, low, z, { mat: frame });
  }
  for (const sx of [-1, 1]) {
    K.extrusion(g, span, sx * lx, top, zc, { axis: "z", mat: frame });
    K.extrusion(g, span, sx * lx, low, zc, { axis: "z", mat: frame });
  }
  const ph = top - 0.02 - (low + 0.02), py = (top - 0.02 + low + 0.02) / 2;
  K.box(F.l - 0.08, ph, 0.003, panel, 0, py, F.zFront - 0.008, g);
  K.box(F.l - 0.08, ph, 0.003, panel, 0, py, F.zBack + 0.008, g);
  for (const sx of [-1, 1]) K.box(0.003, ph, span, panel, sx * (F.l / 2 - 0.008), py, zc, g);
  K.box(F.l - 0.08, 0.003, span, panel, 0, low + 0.022, zc, g);
  const face = F.zFront - 0.0065;
  K.door(g, 0.12, py - 0.06, face, 0.24, ph - 0.2, { handle: "knob", lock: true });

  // The conveyor: the kit's rails over the whole length, the front rail on posts, the rear one on its carriages.
  const rails = K.conveyorRails(g, F.l, cy, { trim });
  const zr = rails.gap / 2 + K.RAIL.railT / 2, railBottom = cy + K.RAIL.lip - K.RAIL.railH, shaftY = top + 0.032;
  for (const sx of [-1, 1]) {
    K.box(0.05, 0.006, 0.07, K.M.zinc, sx * 0.245, top + 0.023, zf - 0.012, g);
    K.box(0.03, railBottom - (top + 0.026), 0.026, K.M.alu, sx * 0.245, (railBottom + top + 0.026) / 2, zr, g);
    // Lead screw and guide rod from the front beam to the rear beam, with their blocks.
    K.cyl(0.007, zf - zb + 0.01, K.M.steel, sx * 0.19, shaftY, zc, g, "z", 10);
    K.cyl(0.006, zf - zb + 0.01, K.M.chrome, sx * 0.15, shaftY, zc, g, "z", 10);
    for (const z of [zf - 0.01, zb + 0.01]) K.box(0.085, shaftY - top - 0.02 + 0.016, 0.02, K.M.alu, sx * 0.17, (shaftY + top + 0.02 + 0.016) / 2, z, g);
    K.box(0.085, railBottom - (shaftY - 0.016), 0.04, K.M.alu, sx * 0.17, (railBottom + shaftY - 0.016) / 2, -zr, g);
    K.cyl(0.016, 0.008, K.M.dark, sx * 0.19, shaftY, zb - 0.008, g, "z", 14);
  }
  // The belt that turns both screws together, and the handwheel on the right-hand one.
  K.box(0.38, 0.026, 0.004, K.M.rubber, 0, shaftY, zb - 0.008, g);
  const wz = F.zFront + 0.05;
  K.cyl(0.007, wz - zf, K.M.steel, 0.19, shaftY, (wz + zf) / 2, g, "z", 10);
  K.torus(0.042, 0.006, K.M.black, 0.19, shaftY, wz, g, "z", 24);
  K.cyl(0.014, 0.022, K.M.zinc, 0.19, shaftY, wz, g, "z", 12);
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) K.box(0.084, 0.008, 0.006, K.M.black, 0.19, shaftY, wz, g).rotation.z = a;
  K.cyl(0.008, 0.034, K.M.black, 0.19 + 0.042, shaftY, wz + 0.02, g, "z", 10);

  // Drive: a gear motor hung under the fixed rail, its hex shaft driving both belts.
  K.box(0.07, 0.005, 0.1, K.M.zinc, 0.1, railBottom - 0.0025, zr - 0.045, g);
  K.box(0.05, 0.06, 0.05, K.M.aluDark, 0.1, railBottom - 0.035, zr - 0.06, g);
  K.cyl(0.026, 0.1, K.M.dark, 0.1 - 0.075, railBottom - 0.035, zr - 0.06, g, "x", 16);
  K.cyl(0.027, 0.012, K.M.zinc, 0.1 - 0.13, railBottom - 0.035, zr - 0.06, g, "x", 16);
  K.cyl(0.006, rails.gap + 0.02, K.M.steel, 0.1, cy - 0.03, 0, g, "z", 6);
  for (const s of [-1, 1]) K.cyl(0.013, 0.012, K.M.dark, 0.1, cy - 0.03, s * (rails.gap / 2 - 0.006), g, "z", 12);

  // The cable to the moving rail in its chain, on a tray across the table.
  K.box(0.05, 0.003, zf - zb + 0.04, K.M.zinc, -0.08, top + 0.0215, zc, g);
  K.cableChain(g, [-0.08, top + 0.032, zr - 0.03], [-0.08, top + 0.032, -zr + 0.02]);

  // A board sensor over each end of the track, on a bracket from the rear rail.
  for (const sx of [-1, 1]) {
    const x = sx * (F.l / 2 - 0.05), railTop = cy + K.RAIL.lip + 0.003;
    K.box(0.014, 0.058, 0.003, K.M.zinc, x, railTop + 0.029, -zr - 0.0125, g);
    K.box(0.014, 0.003, 0.05, K.M.zinc, x, railTop + 0.0565, -zr + 0.011, g);
    K.sensor(g, x, railTop + 0.055, -zr + 0.03, { face: "bottom" });
  }

  // Control box on the front: e-stop, start and stop, speed knob, three pilot lamps.
  const bx = -0.1, by = 0.66, bz = F.zFront + 0.05;
  K.rbox(0.2, 0.13, 0.05, 0.008, boxPaint, bx, by, F.zFront + 0.025, g, "z");
  K.estop(g, bx - 0.065, by, bz, { size: 0.05, box: false });
  K.button(g, bx - 0.015, by + 0.03, bz, 0x2d9a5a, { lit: 0.7 });
  K.button(g, bx + 0.025, by + 0.03, bz, 0xd0281f);
  K.handle(g, bx + 0.005, by - 0.03, bz, { kind: "knob", mat: K.M.black });
  const lamps = K.pilots(g, bx + 0.07, by, bz, { vertical: true });
  K.decal(g, ["START", "STOP"], 0.07, 0.012, bx + 0.005, by + 0.055, bz, { color: ink, weight: 600, spacing: 0.08 });
  K.mainSwitch(g, bx, by - 0.2, face, { size: 0.06, color: "black" });

  // Lettering: the maker on the front, the rating plate on the exit end, the flow arrow and the pinch warning.
  K.decal(g, "ECOPMIN", 0.2, 0.036, 0.12, py + ph / 2 - 0.04, face, { color: ink, weight: 800, spacing: 0.06 });
  K.nameplate(g, ["ECOPMIN", `${kind.toUpperCase()} CONVEYOR ${(look.bodyMm.l / 1000).toFixed(1)} M`, "PCB 50–480 mm · SMEMA", "230 V AC · 1 PH"], 0.14, 0.07, F.l / 2 - 0.0065, py + 0.14, zc, { face: "right" });
  K.warning(g, 0.07, 0.07, top, F.zFront, { kind: "hand" });
  K.art(g, "flow-arrow", 0.09, 0.022, -0.2, top, F.zFront, (c, W, H) => {
    c.fillStyle = "#1f7a55";
    c.beginPath();
    c.moveTo(0, H * 0.32);
    c.lineTo(W * 0.72, H * 0.32);
    c.lineTo(W * 0.72, 0);
    c.lineTo(W, H / 2);
    c.lineTo(W * 0.72, H);
    c.lineTo(W * 0.72, H * 0.68);
    c.lineTo(0, H * 0.68);
    c.closePath();
    c.fill();
  });

  // The board riding through while the line runs.
  const board = K.pcb(g, { l: 0.16 });
  board.position.y = cy;
  board.visible = false;
  const reach = F.l / 2 + K.RAIL.overhang - 0.085;

  // What makes it an inspection or a cooling conveyor: a lamp bridge over the belt, or a bridge of fans.
  if (kind !== "link") {
    const by = top + 0.42, post = K.M.alu;
    for (const sx of [-1, 1]) for (const z of [zf, zb]) K.extrusion(g, by - top, sx * (F.l / 2 - 0.12), (by + top) / 2, z, { axis: "y", size: 0.03, mat: post });
    for (const sx of [-1, 1]) K.extrusion(g, zf - zb, sx * (F.l / 2 - 0.12), by, zc, { axis: "z", size: 0.03, mat: post });
    if (kind === "inspection") {
      K.box(F.l - 0.3, 0.03, 0.09, K.M.white, 0, by - 0.03, zr * 0.2, g);
      K.box(F.l - 0.34, 0.004, 0.07, K.lit(0xfff3dc, 1.1), 0, by - 0.047, zr * 0.2, g);
      K.decal(g, "INSPECTION", 0.16, 0.022, 0, by, zf + 0.015, { color: ink, weight: 700, spacing: 0.1 });
    } else {
      K.box(F.l - 0.24, 0.012, zf - zb, K.M.zinc, 0, by, zc, g);
      for (const sx of [-1, 1]) K.fan(g, sx * 0.2, by - 0.006, zr * 0.2, 0.085, { face: "bottom" });
      for (const sx of [-1, 1]) K.fan(g, sx * 0.2, by + 0.006, zr * 0.2, 0.085, { face: "top" });
      K.decal(g, "COOLING", 0.12, 0.022, 0, by, zf + 0.015, { color: ink, weight: 700, spacing: 0.1 });
    }
  }

  K.seal(g, [board]);
  return {
    group: g,
    height: F.h,
    lamps,
    screen: { draw() {} },
    cycle: (2 * reach) / 0.15,
    update(t, busy) {
      board.visible = busy;
      // 9 m/min on the sheet: 0.15 m/s.
      if (busy) board.position.x = -reach + ((t * 0.15) % (2 * reach));
    },
  };
};

/**
 * Famecs Lative F20 inline laser marker: a tall cell with a black front in a white frame. A big dark window in the
 * upper door with a long pull under it, the maker's name in white at the top left and LATIVE-F20 in grey italics low
 * on the door, a white column at the right carrying the e-stop, a portrait monitor on an arm with the keyboard under
 * it, and the fume duct on the roof.
 */
const lative: RealBuilder = (K, input) => {
  const L = input.look.livery;
  const R = rig(K, input, { feet: 150, window: { x0: 110, x1: 590, y0: 950, y1: 1500, tint: L.window, opacity: 0.72 } });
  const { g, F, X, Y, zf } = R;
  const black = K.paint(L.front, { finish: "matte" });
  R.panel(30, 640, 1500, 1640, black, 4);
  R.panel(30, 640, 870, 950, black, 4);
  R.panel(30, 110, 950, 1500, black, 4);
  R.panel(590, 640, 950, 1500, black, 4);
  R.panel(30, 640, 150, 862, black, 4);
  R.panel(240, 500, 902, 922, K.paint("#3a3c40"), 12);
  const z = zf + 0.004;
  R.text("Famecs", 100, 1602, 100, 26, { color: "#f2f2f0", weight: 700 }, z);
  R.text("LATIVE-F20", 545, 330, 160, 24, { color: "#9a9c9f", weight: 800, italic: true }, z);
  for (const x of [80, 150]) K.warning(g, 0.055, X(x), Y(1545), z, { kind: x === 80 ? "laser" : "voltage" });
  K.warning(g, 0.05, X(580), Y(400), z, { kind: "caution" });
  for (const y of [250, 190]) K.button(g, X(190), Y(y), z, "#b9bdc1", { r: 0.014 });
  K.estop(g, X(720), Y(1560), zf, { size: 0.07 });
  K.mainSwitch(g, X(720), Y(700), zf, { size: 0.07 });
  const screen = K.monitorArm(g, X(720), Y(1150), zf, { w: 0.3, h: 0.5, reach: 0.16, rise: 0.2, drop: 0.3, shift: -0.04, trayW: 0.3, trayD: 0.18, ui: { title: "Lative F20" } });
  // Inside: the marking head on its beam, with the beam spot while a board is marked.
  const beam = K.group(g, 0, 1.36, 0);
  K.box(0.6, 0.07, 0.08, K.M.aluDark, 0, 0, 0, beam);
  const head = K.group(beam);
  K.box(0.14, 0.2, 0.3, K.M.dark, 0, -0.06, 0, head);
  K.cyl(0.03, 0.06, K.M.black, 0, -0.19, 0, head, "y", 14);
  const spot = K.cyl(0.004, 0.24, K.lit(0x35ff7a, 1.6, true), 0, -0.34, 0, head, "y", 6);
  K.stack(g, X(300), R.y1, F.zBack + 0.3, 0.07, 0.3, { flex: true });
  for (const face of ["left", "right"] as const) K.louvre(g, face === "left" ? -F.l / 2 : F.l / 2, 0.5, F.zMid - 0.2, 0.34, 0.14, { face, slats: 6 });
  K.nameplate(g, ["FAMECS", "LATIVE-F20 LASER MARKER", "30 W · 230 V · 1 PH"], 0.14, 0.07, 0, 0.5, F.zBack, { face: "back" });
  const lamps = K.tower(g, X(720), R.y1, zf - 0.12, { order: ["green", "amber", "red"], r: 0.03, segH: 0.06, pole: 0.1 });
  return R.done(lamps, screen, [beam], (t, inside) => {
    spot.visible = inside;
    head.position.x = inside ? 0.06 * Math.sin(t * 4) : 0;
    beam.position.z = inside ? 0.05 * Math.sin(t * 2.6) : 0;
  });
};

export const HANDLING_BUILDERS: Record<string, RealBuilder> = {
  "famecs-lative-f20": lative,
  "ecopmin-link-conveyor": conveyor("link"),
  "ecopmin-inspection-conveyor": conveyor("inspection"),
  "ecopmin-cooling-conveyor": conveyor("cooling"),
};
