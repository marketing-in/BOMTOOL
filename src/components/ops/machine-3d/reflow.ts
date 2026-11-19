import { lookFrame } from "@/knowledge/machine-looks/types";
import type { Pt2 } from "./kit";
import type { RealBuilder } from "./types";

/**
 * Reflow ovens on our lines, drawn as the real machines. One builder per look key of
 * src/knowledge/machine-looks/reflow.ts. Both share an oven's anatomy — a base cabinet with doors, the conveyor band
 * with the tunnel openings in its ends, the long hood in sections, the control computer at the entry end and the
 * exhaust ducts on top — and differ as the real ones do: the Tronwin's hood is a flat slope in cream, the
 * Centurion's a rounded clamshell in white. Positions are mm from the entry end and from the floor.
 */
type Oven = {
  feet: number;
  /** Top of the cabinet = underside of the conveyor band; top of the band = underside of the hood. */
  baseTop: number;
  bandTop: number;
  /** Where the hood starts and ends along the line. */
  hood: [number, number];
  /** How far behind the front the hood's top edge is, and the radius of that edge (0: a flat slope). */
  slope: number;
  round: number;
  sections: number;
  doors: number;
  /** Height of the lower covers at the two ends, outside the hood. */
  endTop: number;
  stacks: number[];
  /** Small viewing windows along the hood's front. */
  windows?: number;
  letter: (o: { text: (s: string, x: number, y: number, w: number, h: number, opts: { color: string; italic?: boolean; weight?: number; onHood?: boolean; spacing?: number }) => void; badge: (x: number, y: number) => void }) => void;
};

const oven =
  (s: Oven): RealBuilder =>
  (K, { look, cy }) => {
    const F = lookFrame(look);
    const L = look.livery;
    const g = K.group();
    const body = K.paint(L.body), hoodPaint = K.paint(L.hood ?? L.body), seam = K.M.seam;
    const X = (mm: number) => -F.l / 2 + mm / 1000, Y = (mm: number) => mm / 1000;
    const zF = F.zFront, zB = F.zBack, y0 = Y(s.feet), yb = Y(s.baseTop), yt = Y(s.bandTop), h = F.h;

    // Feet and the cabinet, a little narrower than the band, with its doors.
    const n = Math.max(3, Math.round(F.l / 1.3));
    for (let i = 0; i < n; i++) for (const z of [zF - 0.12, zB + 0.12]) K.foot(g, -F.l / 2 + 0.25 + (i * (F.l - 0.5)) / (n - 1), z, { h: y0 });
    const cabL = F.l - 0.2, cabZ = zF - 0.05;
    K.box(cabL, yb - y0, F.d - 0.1, body, 0, (y0 + yb) / 2, 0, g);
    const dw = (cabL - 0.5) / s.doors;
    for (let i = 0; i < s.doors; i++) {
      const x = -cabL / 2 + 0.3 + dw * (i + 0.5);
      K.door(g, x, (y0 + yb) / 2, cabZ, dw - 0.01, yb - y0 - 0.06, { handle: "none", hinges: false });
      for (const k of [-1, 1]) K.handle(g, x + k * (dw / 2 - 0.12), yb - 0.1, cabZ, { kind: "recess", len: 0.09 });
    }
    K.louvre(g, cabL / 2 - 0.16, (y0 + yb) / 2, cabZ, 0.16, 0.26, { slats: 8 });

    // The conveyor band: hollow, with the tunnel openings in both ends and the rails through it.
    K.shell(g, { l: F.l, zFront: zF, zBack: zB, y0: yb, y1: yt, cy, mat: body, faces: ["front", "back", "left", "right", "top", "bottom"] });
    K.conveyorRails(g, F.l, cy);
    for (const sx of [-1, 1]) K.box(0.004, 0.05, 0.3, K.M.hot, sx * (F.l / 2 - 0.2), cy + 0.05, 0, g);
    // Inside the tunnel: eight heating zones above and below the chain, then the cooling fans.
    const z0x = X(s.hood[0] + 250), z1x = X(s.hood[1] - 250), heated = (z1x - z0x) * 0.78, zone = heated / 8;
    for (let i = 0; i < 8; i++)
      for (const dy of [0.085, -0.075]) K.box(zone * 0.82, 0.02, 0.34, K.M.hot, z0x + zone * (i + 0.5), cy + dy, 0, g);
    for (const k of [0.3, 0.72]) K.fan(g, z0x + heated + (z1x - z0x - heated) * k, cy + 0.09, 0, 0.09, { face: "bottom" });
    for (const x of [90, look.bodyMm.l - 90]) K.estop(g, X(x), yt, zF - 0.12, { face: "top", size: 0.06 });

    // The hood: one long cover whose front leans (or rolls) back to the top, cut into sections by seams.
    const [hx0, hx1] = s.hood;
    const outline: Pt2[] = [[zF - 0.02, yt], s.round ? [zF - 0.02, h, s.round] : [zF - s.slope, h, 0.03], [zB + 0.04, h, 0.03], [zB + 0.02, yt]];
    const hoodL = (hx1 - hx0) / 1000, hoodX = X((hx0 + hx1) / 2);
    K.profileX(outline, hoodL, hoodPaint, hoodX, 0, 0, g);
    for (let i = 1; i < s.sections; i++) K.profileX(outline, 0.006, seam, X(hx0) + (hoodL * i) / s.sections, 0, 0, g).scale.set(1, 1.002, 1.002);
    // Lower covers at the two ends.
    const ye = Y(s.endTop);
    if (hx0 > 0) K.box(hx0 / 1000, ye - yt, F.d - 0.04, body, X(hx0 / 2), (ye + yt) / 2, 0, g);
    if (hx1 < look.bodyMm.l) K.box((look.bodyMm.l - hx1) / 1000, ye - yt, F.d - 0.04, body, X((hx1 + look.bodyMm.l) / 2), (ye + yt) / 2, 0, g);
    const lean = s.round ? 0 : Math.atan2(s.slope - 0.02, h - yt);
    if (s.windows) {
      const dark = K.paint("#22262b", { finish: "gloss" });
      for (let i = 0; i < s.windows; i++) K.rbox(0.16, 0.07, 0.006, 0.02, dark, X(hx0) + (hoodL * (i + 0.5)) / s.windows, yt + 0.13, zF - 0.02 + 0.002, g, "z");
    }

    // Exhaust ducts and the status tower.
    for (const x of s.stacks) K.stack(g, X(x), h, zB + F.d * 0.3, 0.1, 0.45, { flex: true });
    const lamps = K.tower(g, X(hx0 + 120), h, zB + 0.2, { order: ["green", "amber", "red"], r: 0.03, segH: 0.06, pole: 0.2 });

    // The control computer at the entry end: monitor on a post, keyboard on its shelf.
    const mx = X(Math.max(260, hx0 / 2));
    K.box(0.09, 0.3, 0.07, body, mx, ye + 0.15, zF - 0.32, g);
    const screen = K.screen(g, mx, ye + 0.46, zF - 0.3, { w: 0.48, h: 0.3, depth: 0.035, rim: 0.014, ui: { title: look.name } });
    K.box(0.52, 0.02, 0.2, K.M.dark, mx, ye + 0.03, zF - 0.14, g);
    K.keyboard(g, mx - 0.03, ye + 0.04, zF - 0.14, { w: 0.36, d: 0.13, mouse: true });

    // Lettering.
    s.letter({
      text: (str, x, y, w, hh, o) => {
        if (o.onHood && !s.round) {
          const t = (Y(y) - yt) / (h - yt);
          K.decal(g, str, w / 1000, hh / 1000, X(x), Y(y), zF - 0.02 - t * (s.slope - 0.02), { color: o.color, italic: o.italic, weight: o.weight ?? 800, spacing: o.spacing, tilt: lean });
        } else K.decal(g, str, w / 1000, hh / 1000, X(x), Y(y), o.onHood ? zF - 0.02 : zF, { color: o.color, italic: o.italic, weight: o.weight ?? 800, spacing: o.spacing });
      },
      badge: (x, y) =>
        K.art(g, `${look.key}-badge`, 0.2, 0.1, X(x), Y(y), zF, (c, W, H) => {
          c.fillStyle = L.badge;
          c.beginPath();
          c.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = "#ffffff";
          c.lineWidth = Math.max(2, H * 0.04);
          c.beginPath();
          c.ellipse(W / 2, H / 2, W / 2 - H * 0.1, H / 2 - H * 0.1, 0, 0, Math.PI * 2);
          c.stroke();
          c.fillStyle = "#ffffff";
          c.font = `900 ${Math.round(H * 0.3)}px ${K.FONT.heavy}`;
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText(look.name.split(" ")[0].toUpperCase(), W / 2, H * 0.52, W * 0.74);
        }),
    });
    K.nameplate(g, [look.name.toUpperCase(), "8 + 8 ZONES · 440 V · 3 PH"], 0.2, 0.08, 0, yb - 0.2, zB + 0.05, { face: "back" });
    K.warning(g, 0.09, X(hx0 + 300), yt + 0.1, zF - (s.round ? 0.02 : 0.05), { kind: "hot", tilt: lean });

    // The board rides slowly through the whole tunnel.
    const board = K.pcb(g, { l: 0.2 });
    board.position.y = cy;
    board.visible = false;
    const reach = F.l / 2 - 0.06;
    K.seal(g, [board]);
    return {
      group: g,
      height: F.h,
      lamps,
      screen,
      cycle: (2 * reach) / 0.35,
      update(t, busy) {
        board.visible = busy;
        if (busy) board.position.x = -reach + ((t * 0.35) % (2 * reach));
      },
    };
  };

export const REFLOW_BUILDERS: Record<string, RealBuilder> = {
  "tronwin-tw-vp860n": oven({
    feet: 110,
    baseTop: 760,
    bandTop: 1010,
    hood: [640, 4840],
    slope: 0.36,
    round: 0,
    sections: 4,
    doors: 4,
    endTop: 1200,
    stacks: [1100, 4100],
    letter: ({ text, badge }) => {
      badge(420, 885);
      text("TW-VP860N", 4300, 1130, 420, 60, { color: "#1b2a6b", italic: true, weight: 900, onHood: true });
      text("TRONWIN", 4600, 1370, 150, 30, { color: "#c8102e", weight: 900, onHood: true });
      text("CE", 4500, 885, 70, 50, { color: "#1c1d1f", weight: 700 });
    },
  }),
  "vitronics-centurion-820": oven({
    feet: 120,
    baseTop: 800,
    bandTop: 1040,
    hood: [520, 5520],
    slope: 0.3,
    round: 0.3,
    sections: 5,
    doors: 6,
    endTop: 1240,
    stacks: [1400, 4700],
    windows: 10,
    letter: ({ text }) => {
      text("Vitronics Soltec", 1150, 1330, 520, 54, { color: "#2a3138", weight: 700, onHood: true });
      text("Centurion", 5000, 1330, 330, 50, { color: "#2a3138", italic: true, weight: 600, onHood: true });
      text("CE", 5600, 920, 60, 44, { color: "#1c1d1f", weight: 700 });
    },
  }),
};
