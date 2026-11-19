import type { Kit, RealBuilder } from "./types";
import { rig } from "./parts";

/**
 * The Magic-ray inspection family (ICON, V5000, V5300, Cube): one body plan, told apart by size, the colour of the
 * bar under the screen, the model's lettering and a few fittings. A white centre block stands proud of two lower
 * pillars; the screen is built into its top, the keyboard hides behind a flap, a coloured bar runs between them.
 * All positions are mm from the left edge of the front and from the floor, as the maker's drawings give them.
 */
type Box = [x0: number, x1: number, y0: number, y1: number];
export type MagicRay = {
  feet: number;
  /** Centre block, left and right edge. */
  block: [number, number];
  /** Top of the pillars and how far their face stands behind the block's. */
  pillarTop: number;
  setback: number;
  doorTop: number;
  flap: Box;
  /** Bar under the screen: y0, y1, how proud, centre and end-cap colours. */
  bar: { y: [number, number]; proud: number; mid: string; cap: string };
  screen: Box;
  /** A pale plate round the screen (Cube). */
  bezel?: Box;
  logo: { xc: number; yc: number; w: number; h: number };
  model: { text: string; xc: number; yc: number; w: number; h: number; color: string; thin?: boolean };
  plate: Box;
  /** Main switch: centre and size; on which pillar. */
  mainSwitch: { xc: number; yc: number; size: number };
  /** Signal tower on the top: x from the left, z from the front (mm). */
  tower: { x: number; z: number };
  pillar?: string;
  /** Violet corner stripes on the pillars (ICON). */
  stripes?: string;
  /** A lever handle on the door (V5300). */
  lever?: { xc: number; yc: number };
  /** Two grey lines down the door with the machine's name between them (Cube). */
  doorLines?: { x: [number, number]; y: [number, number]; text: string };
  doorPanel?: Box;
};

/** The maker's mark as we draw it: heavy slanted MAGIC and "ray" in a violet box. */
export function magicrayLogo(K: Kit, parent: Parameters<Kit["art"]>[0], w: number, h: number, x: number, y: number, z: number, face: "front" | "left" = "front") {
  return K.art(
    parent,
    "magicray-logo",
    w,
    h,
    x,
    y,
    z,
    (c, W, H) => {
      c.save();
      c.transform(1, 0, -0.2, 1, H * 0.2, 0);
      c.fillStyle = "#141210";
      c.font = `900 ${Math.round(H * 0.86)}px ${K.FONT.heavy}`;
      c.textBaseline = "middle";
      c.textAlign = "left";
      c.fillText("MAGIC", 0, H * 0.54, W * 0.62);
      c.fillStyle = "#733b93";
      c.beginPath();
      c.roundRect(W * 0.64, H * 0.08, W * 0.3, H * 0.84, H * 0.16);
      c.fill();
      c.fillStyle = "#ffffff";
      c.font = `700 ${Math.round(H * 0.7)}px ${K.FONT.sans}`;
      c.textAlign = "center";
      c.fillText("ray", W * 0.79, H * 0.5, W * 0.26);
      c.restore();
    },
    { face },
  );
}

export const magicray =
  (s: MagicRay): RealBuilder =>
  (K, input) => {
    const { look } = input;
    const L = look.livery;
    const R = rig(K, input, { feet: s.feet, setback: s.setback, top: s.pillarTop, body: s.pillar ?? L.body });
    const { g, F, X, Y } = R;
    const white = K.paint(L.body);
    const front = F.zFront;
    const [bx0, bx1] = s.block;
    const bw = (bx1 - bx0) / 1000, bxc = X((bx0 + bx1) / 2);

    // The centre block: proud of the pillars and a step taller, right through to the back.
    K.box(bw, R.y1 - R.y0, s.setback / 1000, white, bxc, (R.y0 + R.y1) / 2, front - s.setback / 2000, g);
    K.box(bw, F.h - R.y1, F.d, white, bxc, (F.h + R.y1) / 2, F.zMid, g);
    for (const x of s.block) K.box(0.008, R.y1 - R.y0, 0.004, K.paint("#9d9d9d"), X(x), (R.y0 + R.y1) / 2, R.zf + 0.002, g);
    if (s.stripes) {
      const violet = K.paint(s.stripes, { finish: "gloss" });
      for (const x of [8, look.bodyMm.l - 66]) R.panel(x, x + 58, s.feet + 60, s.pillarTop - 40, violet, 2);
    }
    if (s.pillar) {
      const edge = K.paint(L.pillarEdge ?? "#b5b6b7");
      for (const x of [0, bx0 - 12, bx1, look.bodyMm.l - 12]) R.panel(x, x + 12, s.feet, s.pillarTop, edge, 1.5);
    }

    // Door, keyboard flap, the bar, the screen.
    R.hline(s.doorTop, bx0, bx1, front);
    if (s.doorPanel) R.outline(...s.doorPanel, front);
    R.outline(...s.flap, front);
    K.handle(g, X((s.flap[0] + s.flap[1]) / 2), Y(s.flap[3] - 14), front, { kind: "recess", len: 0.085 });
    const mid = K.paint(s.bar.mid, { finish: "gloss" }), cap = K.paint(s.bar.cap, { finish: "gloss" });
    const capW = (bx1 - bx0) * 0.15;
    R.panel(bx0 + capW, bx1 - capW, s.bar.y[0], s.bar.y[1], mid, s.bar.proud, front);
    R.panel(bx0, bx0 + capW, s.bar.y[0], s.bar.y[1], cap, s.bar.proud, front);
    R.panel(bx1 - capW, bx1, s.bar.y[0], s.bar.y[1], cap, s.bar.proud, front);
    if (s.bezel) R.panel(...s.bezel, K.paint(L.bezel ?? "#ededee"), 5, front);
    const [sx0, sx1, sy0, sy1] = s.screen;
    const screen = K.screen(g, X((sx0 + sx1) / 2), Y((sy0 + sy1) / 2), front + (s.bezel ? 0.005 : 0), {
      w: (sx1 - sx0) / 1000 - 0.03,
      h: (sy1 - sy0) / 1000 - 0.03,
      depth: 0.024,
      rim: 0.015,
      bezel: K.paint(L.monitor ?? "#e9e8ea"),
      ui: { title: look.name },
    });

    // Lettering.
    magicrayLogo(K, g, s.logo.w / 1000, s.logo.h / 1000, X(s.logo.xc), Y(s.logo.yc), front + (s.bezel ? 0.005 : 0));
    magicrayLogo(K, g, 0.34, 0.068, -F.l / 2, F.h - 0.14, F.zFront - 0.3, "left");
    R.text(s.model.text, s.model.xc, s.model.yc, s.model.w, s.model.h, { color: s.model.color, weight: s.model.thin ? 300 : 500, spacing: 0.12, font: K.FONT.sans }, front + (s.bezel && s.model.yc > s.bar.y[1] ? 0.005 : 0));
    if (s.doorLines) {
      const grey = K.paint("#898989");
      for (const x of s.doorLines.x) R.panel(x - 5.5, x + 5.5, s.doorLines.y[0], s.doorLines.y[1], grey, 1, front);
      const len = (s.doorLines.y[1] - s.doorLines.y[0]) / 1000;
      K.decal(g, s.doorLines.text, len - 0.02, 0.045, X((s.doorLines.x[0] + s.doorLines.x[1]) / 2), Y((s.doorLines.y[0] + s.doorLines.y[1]) / 2), front, { color: "#b4b4b6", weight: 300, spin: -Math.PI / 2 });
    }
    if (s.lever) {
      R.panel(s.lever.xc - 12, s.lever.xc + 12, s.lever.yc - 54, s.lever.yc + 54, K.M.chrome, 4, front);
      K.handle(g, X(s.lever.xc), Y(s.lever.yc), front + 0.004, { kind: "bar", len: 0.1, vertical: true, out: 0.03 });
    }

    // The operator's plate on the right pillar: e-stop, amber and green buttons; the main switch.
    const [px0, px1, py0, py1] = s.plate;
    const pxc = (px0 + px1) / 2, ph = py1 - py0;
    R.panel(px0, px1, py0, py1, K.paint(L.plate ?? "#f3f3f3"), 3);
    K.estop(g, X(pxc), Y(py1 - ph * 0.22), R.zf + 0.003, { size: 0.062, box: false });
    K.button(g, X(pxc), Y(py0 + ph * 0.44), R.zf + 0.003, L.amber ?? "#f6a51e", { r: 0.013 });
    K.button(g, X(pxc), Y(py0 + ph * 0.18), R.zf + 0.003, L.green ?? "#1fa060", { r: 0.013, lit: 0.5 });
    K.mainSwitch(g, X(s.mainSwitch.xc), Y(s.mainSwitch.yc), R.zf, { size: s.mainSwitch.size / 1000 });

    // Vents low on both sides, the type plate, the tower at the rear left of the top.
    for (const face of ["left", "right"] as const) K.louvre(g, face === "left" ? -F.l / 2 : F.l / 2, 0.42, F.zMid - 0.2, 0.4, 0.16, { face, slats: 6 });
    K.nameplate(g, ["MAGICray", look.name.replace(/^Magic-ray\s*/i, ""), "220 V · 1 PH · 5 A"], 0.12, 0.07, F.l / 2, 0.6, F.zBack + 0.25, { face: "right" });
    const lamps = K.tower(g, X(s.tower.x), s.tower.x > bx0 && s.tower.x < bx1 ? F.h : R.y1, F.zFront - s.tower.z / 1000, { order: ["green", "amber", "red"], r: 0.03, segH: 0.075, pole: 0.09 });

    return R.done(lamps, screen);
  };
