import type { BodyKind } from "@/lib/board/bodies";
import { signature, type MatchStatus, type RefResult, type Signature } from "@/lib/board/footprint-match";

/**
 * The footprint check coming alive on the bare board: every part flies in from above, in a quick sweep across the
 * board, and lands on its pads. Pure: the board's geometry, the order, and how each part looks at any moment t, so the
 * settled board (or any moment of the fly-in) can be drawn directly. Units: mm, y down, origin at the board frame's
 * top-left; time in seconds.
 */

/** The body the BoM's part has, as the server reads it from the package data (see boardThumbFor). */
export type PartBody = { kind: BodyKind; l: number; w: number; pins: number; pitch: number; color: string; rot: number };

/** [cx, cy, width, height, round] in the part's own frame (length along x). */
export type Pad = [number, number, number, number, 0 | 1];
export type GeoKind = "chip" | "ic" | "leadless" | "array" | "tht" | "module" | "can";
export type Geo = { kind: GeoKind; l: number; w: number; pads: Pad[] };

export type FilmPart = {
  i: number;
  ref: string;
  status: MatchStatus;
  bottom: boolean;
  x: number;
  y: number;
  /** Clockwise degrees, as SVG rotates. */
  rot: number;
  /** The land pattern the board has. */
  pads: Geo;
  /** The part the BoM names, as it lands (for a mismatch, it does not fit the pads). */
  chip: Geo;
  color: string;
  /** Silkscreen designator when there is room for it (no Gerber drawing under the board). */
  label: { x: number; y: number } | null;
  /** When it sets off, when it touches the pads, when it has settled. */
  start: number;
  land: number;
  settle: number;
  /** Where it flies in from, relative to its place (mm). */
  from: { dx: number; dy: number };
};

export type Film = {
  w: number;
  h: number;
  /** Margin round the board inside the picture. */
  m: number;
  parts: FilmPart[];
  /** BoM designators with no place on the board, shown in the feeder strip, and when each turns red. */
  tray: { ref: string; at: number }[];
  duration: number;
  /** Silkscreen label size (mm); size marks and effects are never drawn below (mm). */
  font: number;
  mark: number;
};

const CHIP_MM: Record<string, [number, number]> = {
  "01005": [0.4, 0.2],
  "0201": [0.6, 0.3],
  "0402": [1.0, 0.5],
  "0603": [1.6, 0.8],
  "0805": [2.0, 1.25],
  "1206": [3.2, 1.6],
  "1210": [3.2, 2.5],
  "1812": [4.5, 3.2],
  "2010": [5.0, 2.5],
  "2512": [6.3, 3.2],
};

const r2 = (v: number) => Math.round(v * 1000) / 1000;
const pad = (cx: number, cy: number, w: number, h: number, round: 0 | 1 = 0): Pad => [r2(cx), r2(cy), r2(w), r2(h), round];

function chipGeo(L: number, W: number): Geo {
  const pl = Math.max(0.2, L * 0.42);
  return { kind: "chip", l: L, w: W, pads: [pad(-L / 2 + pl * 0.35, 0, pl, W * 1.12), pad(L / 2 - pl * 0.35, 0, pl, W * 1.12)] };
}

/** Pads in a row, centred on y, `n` of them `pitch` apart. */
function row(n: number, pitch: number, y: number, pw: number, ph: number, round: 0 | 1 = 0): Pad[] {
  return Array.from({ length: n }, (_, k) => pad((k - (n - 1) / 2) * pitch, y, pw, ph, round));
}

/** Two rows of pins along the long sides (SOIC, TSSOP, DIP, gull-wing). */
function dual(pins: number, pitch: number, bodyW: number, pw: number, ph: number, gap: number, kind: GeoKind = "ic", round: 0 | 1 = 0): Geo {
  const per = Math.max(1, Math.ceil(pins / 2));
  const l = per * pitch + 0.3;
  const y = bodyW / 2 + gap;
  return { kind, l, w: bodyW, pads: [...row(per, pitch, y, pw, ph, round), ...row(per, pitch, -y, pw, ph, round)] };
}

/** Pins on all four sides: outside the body (QFP, PLCC) or under its edge with a centre pad (QFN). */
function quad(pins: number, pitch: number, side: number, inset: number, pw: number, ph: number, kind: GeoKind): Geo {
  const per = Math.max(1, Math.ceil(pins / 4));
  const o = side / 2 + inset;
  const pads: Pad[] = [...row(per, pitch, o, pw, ph), ...row(per, pitch, -o, pw, ph)];
  for (let k = 0; k < per; k++) {
    const c = (k - (per - 1) / 2) * pitch;
    pads.push(pad(o, c, ph, pw), pad(-o, c, ph, pw));
  }
  if (kind === "leadless") pads.push(pad(0, 0, side * 0.55, side * 0.55));
  return { kind, l: side, w: side, pads };
}

function grid(pins: number, side?: number): Geo {
  const g = Math.max(2, Math.min(14, Math.round(Math.sqrt(Math.max(4, pins)))));
  const s = side && side > 1 ? side : g * 0.8 + 0.8;
  const pitch = (s - 0.8) / g;
  const pads: Pad[] = [];
  for (let a = 0; a < g; a++) for (let b = 0; b < g; b++) pads.push(pad((a - (g - 1) / 2) * pitch, (b - (g - 1) / 2) * pitch, pitch * 0.5, pitch * 0.5, 1));
  return { kind: "array", l: s, w: s, pads };
}

const NAMED: Record<string, () => Geo> = {
  "SOT-23": () => ({ kind: "ic", l: 2.9, w: 1.3, pads: [pad(-0.95, 1.1, 0.6, 0.8), pad(0.95, 1.1, 0.6, 0.8), pad(0, -1.1, 0.6, 0.8)] }),
  "SOT-23-5": () => ({ kind: "ic", l: 2.9, w: 1.6, pads: [...row(3, 0.95, 1.3, 0.55, 0.9), pad(-0.95, -1.3, 0.55, 0.9), pad(0.95, -1.3, 0.55, 0.9)] }),
  "SOT-23-6": () => ({ kind: "ic", l: 2.9, w: 1.6, pads: [...row(3, 0.95, 1.3, 0.55, 0.9), ...row(3, 0.95, -1.3, 0.55, 0.9)] }),
  "SOT-323": () => ({ kind: "ic", l: 2.0, w: 1.25, pads: [pad(-0.65, 0.95, 0.45, 0.6), pad(0.65, 0.95, 0.45, 0.6), pad(0, -0.95, 0.45, 0.6)] }),
  "SOT-223": () => ({ kind: "ic", l: 6.5, w: 3.5, pads: [...row(3, 2.3, 3.15, 0.95, 1.5), pad(0, -3.15, 3.25, 1.5)] }),
  "SOT-89": () => ({ kind: "ic", l: 4.5, w: 2.5, pads: [...row(3, 1.5, 1.95, 0.6, 1.1), pad(0, -1.5, 1.8, 1.4)] }),
  "SOD-123": () => ({ kind: "ic", l: 2.7, w: 1.6, pads: [pad(-1.85, 0, 0.9, 1.2), pad(1.85, 0, 0.9, 1.2)] }),
  "SOD-323": () => ({ kind: "ic", l: 1.7, w: 1.25, pads: [pad(-1.25, 0, 0.6, 0.6), pad(1.25, 0, 0.6, 0.6)] }),
  "SOD-882": () => chipGeo(1.0, 0.6),
  "TO-220": () => ({ kind: "tht", l: 10.2, w: 4.5, pads: row(3, 2.54, 0, 1.8, 1.8, 1) }),
  "TO-263": () => ({ kind: "ic", l: 10.2, w: 9.0, pads: [pad(0, -1.6, 10.8, 9.0), pad(-2.54, 6.4, 1.1, 3.0), pad(2.54, 6.4, 1.1, 3.0)] }),
  "TO-252": () => ({ kind: "ic", l: 6.6, w: 6.1, pads: [pad(0, -1.0, 6.0, 5.8), pad(-2.28, 4.2, 1.0, 2.0), pad(2.28, 4.2, 1.0, 2.0)] }),
  "TO-92": () => ({ kind: "tht", l: 4.8, w: 3.8, pads: row(3, 1.27, 0, 1.0, 1.0, 1) }),
  "DO-41": () => ({ kind: "tht", l: 5.2, w: 2.7, pads: [pad(-5.08, 0, 1.8, 1.8, 1), pad(5.08, 0, 1.8, 1.8, 1)] }),
  SMA: () => ({ kind: "ic", l: 4.3, w: 2.6, pads: [pad(-2.0, 0, 1.5, 1.7), pad(2.0, 0, 1.5, 1.7)] }),
  SMB: () => ({ kind: "ic", l: 4.6, w: 3.6, pads: [pad(-2.15, 0, 1.6, 2.2), pad(2.15, 0, 1.6, 2.2)] }),
  SMC: () => ({ kind: "ic", l: 7.0, w: 6.0, pads: [pad(-3.4, 0, 2.0, 3.2), pad(3.4, 0, 2.0, 3.2)] }),
  "HC-49": () => ({ kind: "can", l: 11.0, w: 4.7, pads: [pad(-2.44, 0, 1.5, 1.5, 1), pad(2.44, 0, 1.5, 1.5, 1)] }),
};

/** A footprint or package name read as land pattern and body (null when the name says nothing we can draw). */
export function geoFromSignature(s: Signature | null): Geo | null {
  if (!s) return null;
  if (s.kind === "chip") {
    const mm = CHIP_MM[s.size];
    return mm ? chipGeo(mm[0], mm[1]) : null;
  }
  if (s.kind === "named") return NAMED[s.name]?.() ?? null;
  const n = Math.max(2, Math.min(s.pins, 400));
  switch (s.family) {
    case "SOIC":
      return dual(n, 1.27, 3.9, 0.6, 1.5, 0.95);
    case "TSSOP":
      return dual(n, 0.65, 4.4, 0.4, 1.3, 0.85);
    case "DIP":
      return dual(n, 2.54, 6.4, 1.6, 1.6, 0.6, "tht", 1);
    case "QFN": {
      const per = Math.ceil(n / 4);
      return quad(n, 0.5, Math.max(2, per * 0.5 + 1), -0.3, 0.25, 0.7, "leadless");
    }
    case "QFP": {
      const per = Math.ceil(n / 4);
      return quad(n, 0.5, per * 0.5 + 1.5, 0.8, 0.28, 1.4, "ic");
    }
    case "PLCC": {
      const per = Math.ceil(n / 4);
      return quad(n, 1.27, per * 1.27 + 2, -0.2, 0.6, 1.9, "ic");
    }
    case "BGA":
      return grid(n);
    default:
      return null;
  }
}

/** The land pattern a body implies, when the name could not be read (modules, connectors, odd parts). */
export function geoFromBody(b: PartBody | null | undefined): Geo | null {
  if (!b || !(b.l > 0.2) || !(b.w > 0.2)) return null;
  const { l, w } = b;
  const pins = Math.max(2, Math.min(b.pins || 2, 200));
  switch (b.kind) {
    case "chip":
      return chipGeo(l, w);
    case "gullwing": {
      const per = Math.ceil(pins / 2);
      const pitch = Math.min(b.pitch || 1.27, (l - 0.2) / per);
      return { ...dual(pins, pitch, w, pitch * 0.55, Math.min(1.5, w * 0.35), Math.min(0.9, w * 0.2), b.pitch >= 2.5 ? "tht" : "ic", b.pitch >= 2.5 ? 1 : 0), l };
    }
    case "quad":
      return { ...quad(pins, Math.min(b.pitch || 0.5, (l - 0.6) / Math.ceil(pins / 4)), l, 0.7, 0.28, 1.3, "ic"), w };
    case "leadless":
      return { ...quad(pins, Math.min(b.pitch || 0.5, (l - 0.4) / Math.ceil(pins / 4)), l, -0.3, 0.25, 0.6, "leadless"), w };
    case "array":
      return grid(pins, l);
    case "module": {
      const per = Math.max(3, Math.min(24, Math.floor(l / 1.27)));
      const pitch = (l * 0.85) / per;
      return { kind: "module", l, w, pads: [...row(per, pitch, w / 2, pitch * 0.55, 1.2), ...row(per, pitch, -w / 2, pitch * 0.55, 1.2)] };
    }
    case "connector": {
      const n = Math.max(2, Math.min(pins, 40));
      const pitch = Math.min(b.pitch || 2.54, (l * 0.9) / n);
      return { kind: "tht", l, w, pads: row(n, pitch, 0, pitch * 0.6, pitch * 0.6, 1) };
    }
    case "power":
      return { kind: "tht", l, w, pads: row(3, Math.min(2.54, l / 3.5), 0, 1.6, 1.6, 1) };
    default:
      return { kind: b.kind === "can" || b.kind === "crystal" ? "can" : "ic", l, w, pads: [pad(-l * 0.38, 0, l * 0.24, w * 0.6), pad(l * 0.38, 0, l * 0.24, w * 0.6)] };
  }
}

/** Half extents of a geometry's pads and body together, in its own frame. */
export function extent(g: Geo): { hx: number; hy: number } {
  let hx = g.l / 2;
  let hy = g.w / 2;
  for (const [cx, cy, pw, ph] of g.pads) {
    hx = Math.max(hx, Math.abs(cx) + pw / 2);
    hy = Math.max(hy, Math.abs(cy) + ph / 2);
  }
  return { hx, hy };
}

/** The same, turned by `rot` degrees, as an axis-aligned box half size. */
function turned(g: Geo, rot: number) {
  const { hx, hy } = extent(g);
  const a = (rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { hx: hx * c + hy * s, hy: hx * s + hy * c };
}

/** Bodies that would read as blue (an electrolytic sleeve, a relay) are drawn neutral: the app has no blue. */
export function bodyColor(color: string | null | undefined, kind: GeoKind, ref: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color ?? "");
  if (m) {
    const v = parseInt(m[1], 16);
    const r = v >> 16;
    const g = (v >> 8) & 255;
    const b = v & 255;
    return b > r + 16 && b >= g ? "#2c2c2f" : `#${m[1]}`;
  }
  const p = ref.replace(/\d.*$/, "").toUpperCase();
  if (kind === "chip") return p === "C" ? "#b89466" : p === "L" || p === "FB" ? "#3a3a3a" : p.startsWith("LED") || p === "D" ? "#e8e6da" : "#2a2a2a";
  if (kind === "module" || kind === "can") return "#c9ccd2";
  return "#1f1f22";
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/** Seconds from setting off to touching the pads, and the soft settle after. */
export const FLY = 0.62;
export const SETTLE = 0.3;

/** Where the board sits in the placements' frame: the Gerber drawing's box when every part is inside it, else the board, else the parts. */
export function filmFrame(refs: RefResult[], board: { widthMm: number; heightMm: number } | null, artBox: { x: number; y: number; w: number; h: number } | null) {
  const pts = refs.filter((r) => r.x !== null && r.y !== null) as (RefResult & { x: number; y: number })[];
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const real = !!artBox && minX >= artBox.x - 1 && minY >= artBox.y - 1 && maxX <= artBox.x + artBox.w + 1 && maxY <= artBox.y + artBox.h + 1;
  const inside = !!board && minX >= -1 && minY >= -1 && maxX <= board.widthMm + 1 && maxY <= board.heightMm + 1;
  const edge = 4;
  if (real && artBox) return { x0: artBox.x, y0: artBox.y, w: artBox.w, h: artBox.h, real: true };
  if (inside && board) return { x0: 0, y0: 0, w: board.widthMm, h: board.heightMm, real: false };
  return { x0: minX - edge, y0: minY - edge, w: maxX - minX + edge * 2, h: maxY - minY + edge * 2, real: false };
}

/** A sweep across the board: by distance from its top-left corner, top side first, then the bottom. */
export function sweepOrder<T extends { x: number; y: number; bottom: boolean }>(parts: T[]): T[] {
  return [...parts].sort((a, b) => Number(a.bottom) - Number(b.bottom) || a.x + a.y - (b.x + b.y) || a.x - b.x);
}

export type FilmInput = {
  refs: RefResult[];
  frame: { x0: number; y0: number; w: number; h: number };
  bodies?: Record<string, PartBody>;
  /** True when the Gerber drawing (with its own pads and silkscreen) lies under the parts. */
  art: boolean;
};

export function buildFilm({ refs, frame, bodies = {}, art }: FilmInput): Film {
  const { x0, y0, w, h } = frame;
  const size = Math.min(w, h);
  const placed = refs.filter((r) => r.x !== null && r.y !== null);
  const raw = placed.map((r) => {
    const body = bodies[r.ref.toUpperCase()];
    const sigPads = geoFromSignature(signature(r.footprint));
    const fromBody = geoFromBody(body);
    const pads = sigPads ?? fromBody ?? chipGeo(1.6, 0.8);
    const chip = r.status === "mismatch" ? (geoFromSignature(signature(r.bomPkg)) ?? { ...pads, l: pads.l * 1.5, w: pads.w * 1.3 }) : sigPads && fromBody && pads.kind !== "chip" ? { ...pads, l: Math.max(pads.l, fromBody.l * 0.9), w: Math.max(pads.w, fromBody.w * 0.9) } : pads;
    return {
      ref: r.ref,
      status: r.status,
      bottom: r.side === "BOTTOM",
      x: (r.x as number) - x0,
      y: h - ((r.y as number) - y0),
      rot: -(body?.rot ?? 0),
      pads,
      chip,
      color: bodyColor(body?.color, chip.kind, r.ref),
    };
  });
  const order = sweepOrder(raw);

  // Time: the whole board settles in about 2–4 s whatever the part count — big boards get a tighter stagger.
  const n = order.length;
  const spread = clamp(0.8 + n * 0.006, 0.8, 2.4);
  const step = n > 1 ? spread / (n - 1) : 0;
  const lift = size * 0.22;
  const parts: FilmPart[] = order.map((p, i) => {
    const start = 0.1 + i * step;
    const land = start + FLY;
    // From above and a little out from the board's middle, so the parts drift in towards it.
    const out = clamp((p.x - w / 2) / (w / 2), -1, 1);
    return { i, ...p, label: null, start, land, settle: land + SETTLE + (p.status === "match" ? 0.55 : 0.25), from: { dx: r2(out * lift * 0.35), dy: r2(-lift) } };
  });
  const landed = parts.length ? Math.max(...parts.map((p) => p.land)) : 0.2;
  const others = refs.filter((r) => r.x === null || r.y === null).map((r) => r.ref);
  const tstep = others.length ? Math.min(0.08, 0.5 / others.length) : 0;
  const tray = others.map((ref, k) => ({ ref, at: r2(landed + 0.1 + k * tstep) }));
  const duration = Math.max(0.2, ...parts.map((p) => p.settle), ...tray.map((t) => t.at + 0.05));

  // Silkscreen designators beside their parts, where they clear every other part and label (only on a bare drawing).
  const font = clamp(size / 60, 0.5, 1.3);
  if (!art) {
    const boxes = parts.map((p) => {
      const t = turned(p.pads, p.rot);
      return { x0: p.x - t.hx, x1: p.x + t.hx, y0: p.y - t.hy, y1: p.y + t.hy };
    });
    const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const hit = (a: (typeof taken)[number], b: (typeof taken)[number]) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    for (const p of parts) {
      if (p.bottom) continue;
      const bx = boxes[p.i];
      const tw = p.ref.length * font * 0.62;
      const th = font;
      const gap = font * 0.3;
      const spots = [
        { x: p.x, y: bx.y0 - gap - th / 2 },
        { x: p.x, y: bx.y1 + gap + th / 2 },
        { x: bx.x1 + gap + tw / 2, y: p.y },
        { x: bx.x0 - gap - tw / 2, y: p.y },
      ];
      for (const s of spots) {
        const b = { x0: s.x - tw / 2, x1: s.x + tw / 2, y0: s.y - th / 2, y1: s.y + th / 2 };
        if (b.x0 < 0.3 || b.y0 < 0.3 || b.x1 > w - 0.3 || b.y1 > h - 0.3) continue;
        if (boxes.some((o, k) => k !== p.i && !parts[k].bottom && hit(o, b)) || taken.some((o) => hit(o, b))) continue;
        taken.push(b);
        p.label = { x: r2(s.x), y: r2(s.y) };
        break;
      }
    }
  }

  const m = r2(Math.max(w, h) * 0.05);
  return { w, h, m, parts, tray, duration, font, mark: clamp(size / 70, 0.35, 1.4) };
}

/** How a part looks at time t: "before" (bare pads), "after" (settled) or in flight. */
export type PartFx = {
  /** Opacity of the body. */
  chip: number;
  /** 1 = high above the board, 0 = on its pads. */
  lift: number;
  /** Offset while flying (mm) and a little spin (degrees). */
  dx: number;
  dy: number;
  spin: number;
  /** Landing squash: 1 = at rest. */
  scale: number;
  /** Brief green glow after a matching part lands. */
  glow: number;
  /** The result's mark: green hairline, red outline (blinking, drawn by the page), ochre outline, dotted outline. */
  mark: number;
};

export const FINAL: Record<MatchStatus, PartFx> = {
  match: { chip: 1, lift: 0, dx: 0, dy: 0, spin: 0, scale: 1, glow: 0, mark: 1 },
  check: { chip: 1, lift: 0, dx: 0, dy: 0, spin: 0, scale: 1, glow: 0, mark: 1 },
  mismatch: { chip: 1, lift: 0, dx: 0, dy: 0, spin: 0, scale: 1, glow: 0, mark: 1 },
  "not-in-bom": { chip: 0, lift: 0, dx: 0, dy: 0, spin: 0, scale: 1, glow: 0, mark: 1 },
  "not-on-board": { chip: 0, lift: 0, dx: 0, dy: 0, spin: 0, scale: 1, glow: 0, mark: 0 },
};
export const BEFORE: PartFx = { chip: 0, lift: 1, dx: 0, dy: 0, spin: 0, scale: 1, glow: 0, mark: 0 };

/** Lifted parts look bigger: they are nearer the eye. */
export const LIFT_SCALE = 0.7;

export function fxAt(p: FilmPart, t: number): PartFx | "before" | "after" {
  if (t < p.start) return "before";
  if (t >= p.settle) return "after";
  // Nothing to place: its outline simply appears when its turn comes.
  if (p.status === "not-in-bom") return { ...FINAL["not-in-bom"], mark: smooth(p.start + FLY * 0.5, p.land, t) };
  const k = clamp((t - p.start) / FLY, 0, 1);
  const e = easeOut(k);
  const lift = 1 - e;
  const after = t - p.land;
  const squash = after < 0 ? 0 : Math.sin(clamp(after / SETTLE, 0, 1) * Math.PI) * 0.06 * (1 - after / SETTLE);
  return {
    chip: smooth(0, 0.3, k),
    lift,
    dx: p.from.dx * lift,
    dy: p.from.dy * lift,
    spin: -14 * lift,
    scale: 1 - squash,
    glow: p.status === "match" && after >= 0 ? Math.max(0, 1 - after / 0.7) : 0,
    mark: smooth(p.land, p.land + SETTLE, t),
  };
}

/** Whether every part has settled by t. */
export const settled = (f: Film, t: number) => t >= f.duration;

/** SVG path of a geometry's pads. */
export function padsPath(g: Geo): string {
  return g.pads
    .map(([cx, cy, pw, ph, round]) => {
      const x = r2(cx - pw / 2);
      const y = r2(cy - ph / 2);
      if (round) {
        const r = r2(Math.min(pw, ph) / 2);
        return `M${r2(cx - r)} ${r2(cy)}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0z`;
      }
      return `M${x} ${y}h${r2(pw)}v${r2(ph)}h${r2(-pw)}z`;
    })
    .join("");
}
