import type * as THREE from "three";
import { lookFrame } from "@/knowledge/machine-looks/types";
import type { DecalOpts } from "./kit";
import type { BuildInput, Kit, RealBuilt, ScreenInfo } from "./types";

/**
 * What every upright line machine shares, so each maker's file only says what is its own: the body standing on its
 * feet with the board openings in both ends, the conveyor through it, the board riding through, and placing things
 * on the front the way the makers' drawings give them: millimetres from the left edge and from the floor.
 */

/** A window in the front, in mm from the left edge / from the floor. */
export type Win = { x0: number; x1: number; y0: number; y1: number; tint?: string; opacity?: number; glass?: boolean };

export type RigOpts = {
  /** Height of the feet: the body's underside (mm). */
  feet: number;
  /** The front face stands this far behind the published front (mm): a proud block or a monitor makes up the rest. */
  setback?: number;
  /** Top of the body when lower than the published height (mm): a raised block makes up the rest. */
  top?: number;
  /** A hole in the front (glazed unless glass is false). */
  window?: Win;
  /** Body paint; default the look's `body`. */
  body?: string;
  /** Feet as long legs (a machine standing high). */
  legs?: boolean;
};

/** How long a board takes through one machine, and when it stands still inside (s). */
const CYCLE = 7;
const IN = 1.4;
const OUT = 5.6;

export function rig(K: Kit, { look, cy }: BuildInput, o: RigOpts) {
  const F = lookFrame(look);
  const g = K.group();
  const body = K.paint(o.body ?? look.livery.body);
  const X = (mm: number) => -F.l / 2 + mm / 1000;
  const Y = (mm: number) => mm / 1000;
  const zf = F.zFront - (o.setback ?? 0) / 1000;
  const y0 = Y(o.feet);
  const y1 = Y(o.top ?? look.bodyMm.h);
  const t = 0.02;

  for (const sx of [-1, 1])
    for (const z of [zf - 0.1, F.zBack + 0.1]) {
      if (o.legs) K.cyl(0.022, y0, K.M.chrome, sx * (F.l / 2 - 0.08), y0 / 2, z, g, "y", 12);
      K.foot(g, sx * (F.l / 2 - 0.08), z, { h: o.legs ? 0.03 : y0 });
    }
  K.shell(g, { l: F.l, zFront: zf, zBack: F.zBack, y0, y1, cy, mat: body, faces: ["back", "left", "right", "top", "bottom"] });
  const w = o.window;
  if (!w) K.box(F.l, y1 - y0, t, body, 0, (y0 + y1) / 2, zf - t / 2, g);
  else {
    const wx0 = X(w.x0), wx1 = X(w.x1), wy0 = Y(w.y0), wy1 = Y(w.y1);
    if (wx0 > -F.l / 2) K.box(wx0 + F.l / 2, y1 - y0, t, body, (wx0 - F.l / 2) / 2, (y0 + y1) / 2, zf - t / 2, g);
    if (wx1 < F.l / 2) K.box(F.l / 2 - wx1, y1 - y0, t, body, (wx1 + F.l / 2) / 2, (y0 + y1) / 2, zf - t / 2, g);
    if (wy0 > y0) K.box(wx1 - wx0, wy0 - y0, t, body, (wx0 + wx1) / 2, (y0 + wy0) / 2, zf - t / 2, g);
    if (wy1 < y1) K.box(wx1 - wx0, y1 - wy1, t, body, (wx0 + wx1) / 2, (wy1 + y1) / 2, zf - t / 2, g);
    if (w.glass !== false) K.box(wx1 - wx0, wy1 - wy0, 0.005, K.glass(w.tint ?? look.livery.window ?? "#1d2226", w.opacity ?? 0.55), (wx0 + wx1) / 2, (wy0 + wy1) / 2, zf - 0.008, g);
  }
  K.conveyorRails(g, F.l, cy);

  const board = K.pcb(g, { l: 0.18 });
  board.position.y = cy;
  board.visible = false;
  const reach = F.l / 2 - 0.05;

  /** A flat part on the front (or on the plane z): x0 … x1, ya … yb in mm, standing `proud` mm out. */
  const panel = (x0: number, x1: number, ya: number, yb: number, material: THREE.Material, proud = 3, z = zf) =>
    K.box((x1 - x0) / 1000, (yb - ya) / 1000, proud / 1000, material, X((x0 + x1) / 2), Y((ya + yb) / 2), z + proud / 2000, g);
  /** Lettering on the front: centred on (xc, yc) mm, w × h mm. */
  const text = (s: string | string[], xc: number, yc: number, wmm: number, hmm: number, opts: DecalOpts = {}, z = zf) => K.decal(g, s, wmm / 1000, hmm / 1000, X(xc), Y(yc), z, opts);
  /** A hairline seam across the front at height y, from x0 to x1 (mm). */
  const hline = (y: number, x0: number, x1: number, z = zf) => K.seam(g, X((x0 + x1) / 2), Y(y), z, (x1 - x0) / 1000);
  /** A hairline seam up the front at x, from ya to yb (mm). */
  const vline = (x: number, ya: number, yb: number, z = zf) => K.seam(g, X(x), Y((ya + yb) / 2), z, (yb - ya) / 1000, { vertical: true });
  /** The outline of a flush door or flap. */
  const outline = (x0: number, x1: number, ya: number, yb: number, z = zf) => {
    hline(ya, x0, x1, z);
    hline(yb, x0, x1, z);
    vline(x0, ya, yb, z);
    vline(x1, ya, yb, z);
  };

  /**
   * Seal the machine and hand it over. `work(t, inside, clock)` moves the machine's own parts: inside = a board is
   * standing in the machine being worked on. Everything in `moving` (and the board) keeps moving after sealing.
   */
  const done = (lamps: THREE.Mesh[], screen: { draw: (info: ScreenInfo) => void }, moving: THREE.Object3D[] = [], work?: (t: number, inside: boolean, clock: number) => void): RealBuilt => {
    K.seal(g, [board, ...moving]);
    return {
      group: g,
      height: F.h,
      lamps,
      screen,
      cycle: CYCLE,
      update(time, busy, clock) {
        const p = busy ? time % CYCLE : 0;
        board.visible = busy;
        if (busy) board.position.x = p < IN ? -reach + (reach * p) / IN : p < OUT ? 0 : (reach * (p - OUT)) / (CYCLE - OUT);
        work?.(time, busy && p >= IN && p < OUT, clock);
      },
    };
  };

  return { g, F, body, X, Y, zf, y0, y1, board, panel, text, hline, vline, outline, done };
}

export type Rig = ReturnType<typeof rig>;

/** An XY gantry under the hood: a beam across the machine that travels front to back, with a head that travels along it. */
export function gantry(K: Kit, R: Rig, o: { y: number; span: number; beam?: THREE.Material; head?: THREE.Material; headW?: number; headH?: number; z0?: number }) {
  const beam = K.group(R.g, 0, o.y, o.z0 ?? 0);
  K.box(o.span, 0.07, 0.08, o.beam ?? K.M.aluDark, 0, 0, 0, beam);
  const head = K.group(beam, 0, 0, 0);
  const hw = o.headW ?? 0.16, hh = o.headH ?? 0.16;
  K.box(hw, hh, 0.14, o.head ?? K.M.dark, 0, -hh / 2 + 0.02, 0.09, head);
  return { beam, head };
}
