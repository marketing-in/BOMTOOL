import type { BodyKind } from "@/lib/board/bodies";
import { signature, type MatchStatus, type RefResult, type Signature } from "@/lib/board/footprint-match";

/**
 * The footprint check as a short film: a placement head visits every designator on the board and drops its part on
 * the pads — or, when the BoM's package does not fit the board's footprint, the part bursts above the pads. Pure:
 * the board's geometry, the order, and where everything is at any moment t, so any frame can be drawn (or skipped to)
 * without playing the ones before it. Units: mm, y down, origin at the board frame's top-left; time in seconds.
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
  /** The part the BoM sends: what the head carries and drops (for a mismatch, it does not fit). */
  chip: Geo;
  color: string;
  /** Silkscreen designator when there is room for it (no Gerber drawing under the board). */
  label: { x: number; y: number } | null;
  /** Slot start; when the head arrives and lets go; when the part has finished its own animation. */
  start: number;
  arrive: number;
  settle: number;
  /** Mismatch: how long it hovers before it bursts. */
  hover: number;
};

export type Film = {
  w: number;
  h: number;
  /** Margin round the board inside the picture. */
  m: number;
  parts: FilmPart[];
  /** BoM designators with no place on the board, shown in the feeder strip, and when each is called. */
  tray: { ref: string; at: number }[];
  intro: number;
  bodyEnd: number;
  duration: number;
  /** Head size (mm), label size (mm), most the camera zooms in. */
  head: number;
  font: number;
  zoom: number;
  park: { x: number; y: number };
  drop: number;
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
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Each result's share of the head's travel time, relative to a plain match. */
const WEIGHT: Record<MatchStatus, number> = { match: 1, check: 1.3, mismatch: 1.6, "not-in-bom": 1.3, "not-on-board": 0 };
/** Seconds a problem holds the head after it lets go: a mismatch hovers, bursts, and the head waits for the debris. */
const EXTRA: Record<MatchStatus, number> = { match: 0, check: 0.2, mismatch: 0.9, "not-in-bom": 0.3, "not-on-board": 0 };

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

/** Top side first, then the bottom; each in bands across the board, alternating direction like a machine's path. */
export function placementOrder<T extends { x: number; y: number; bottom: boolean }>(parts: T[], h: number): T[] {
  const out: T[] = [];
  for (const side of [false, true]) {
    const list = parts.filter((p) => p.bottom === side);
    if (!list.length) continue;
    const bands = Math.max(1, Math.round(Math.sqrt(list.length) * 0.8));
    const bh = h / bands;
    const by = new Map<number, T[]>();
    for (const p of list) {
      const k = clamp(Math.floor(p.y / bh), 0, bands - 1);
      by.set(k, [...(by.get(k) ?? []), p]);
    }
    let flip = false;
    for (let k = 0; k < bands; k++) {
      const band = by.get(k);
      if (!band) continue;
      band.sort((a, b) => (flip ? b.x - a.x : a.x - b.x));
      out.push(...band);
      flip = !flip;
    }
  }
  return out;
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
  const order = placementOrder(raw, h);

  // Time: a fixed-length film whatever the part count. Every part gets a share of the travel; a problem also holds
  // the head a moment longer (a mismatch until it has burst), squeezed if there are many problems.
  const intro = 0.55;
  const weights = order.map((p) => WEIGHT[p.status]);
  const W = weights.reduce((s, v) => s + v, 0) || 1;
  const body = clamp(W * 0.42, 4.6, 9.2);
  const extras = order.map((p) => EXTRA[p.status]);
  const E = extras.reduce((s, v) => s + v, 0);
  const es = E ? Math.min(1, (body * 0.45) / E) : 1;
  const u = (body - E * es) / W;
  const drop = clamp(u * 0.9, 0.2, 0.34);
  let at = intro;
  const parts: FilmPart[] = order.map((p, i) => {
    const travel = u * weights[i];
    const start = at;
    at += travel + extras[i] * es;
    const arrive = start + travel * 0.6;
    const hover = p.status === "mismatch" ? Math.max(0.16, 0.38 * es) : 0;
    const settle = arrive + (p.status === "mismatch" ? hover + 0.95 : p.status === "check" ? drop + 1.1 : p.status === "not-in-bom" ? 0.45 : drop + 0.75);
    return { i, ...p, label: null, start, arrive, settle, hover };
  });
  const bodyEnd = at;
  const others = refs.filter((r) => r.x === null || r.y === null).map((r) => r.ref);
  const step = others.length ? Math.min(0.12, 0.9 / others.length) : 0;
  const tray = others.map((ref, k) => ({ ref, at: bodyEnd + 0.15 + k * step }));
  const duration = Math.max(bodyEnd + 1.1, (tray.at(-1)?.at ?? 0) + 0.6, ...parts.map((p) => p.settle + 0.1));

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

  const sizes = parts.map((p) => Math.max(p.pads.l, p.pads.w)).sort((a, b) => a - b);
  const typical = sizes[Math.floor(sizes.length / 2)] ?? 2;
  const head = clamp(size / 13, 1.6, 9);
  const zoom = parts.length <= 3 ? 1 : clamp(size / (typical * 9), 1.25, 2);
  const m = r2(Math.max(w, h) * 0.07);
  return { w, h, m, parts, tray, intro, bodyEnd, duration, head, font, zoom, park: { x: w + m * 0.4, y: -m * 0.4 }, drop };
}

export type Head = { x: number; y: number; opacity: number; carrying: number; press: number; part: number };

/** Where the head is at time t, what it carries, and which part it is working on. */
export function headAt(f: Film, t: number): Head {
  const ps = f.parts;
  const fade = smooth(0, f.intro, t) * (1 - smooth(f.duration - 0.55, f.duration - 0.05, t));
  if (!ps.length) return { ...f.park, opacity: 0, carrying: -1, press: 0, part: -1 };
  if (t >= f.bodyEnd) {
    const last = ps[ps.length - 1];
    const k = easeInOut(clamp((t - f.bodyEnd) / 0.8, 0, 1));
    return { x: last.x + (f.park.x - last.x) * k, y: last.y + (f.park.y - last.y) * k, opacity: fade, carrying: -1, press: 0, part: -1 };
  }
  // The slot t falls in (binary search on start times).
  let lo = 0;
  let hi = ps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ps[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  const p = ps[lo];
  if (t < p.start) return { ...f.park, opacity: fade, carrying: -1, press: 0, part: -1 };
  const from = lo ? ps[lo - 1] : f.park;
  const k = easeInOut(clamp((t - p.start) / (p.arrive - p.start), 0, 1));
  const press = Math.max(0, 1 - Math.abs(t - p.arrive) / 0.14);
  return { x: from.x + (p.x - from.x) * k, y: from.y + (p.y - from.y) * k, opacity: fade, carrying: t < p.arrive && p.status !== "not-in-bom" ? lo : -1, press, part: lo };
}

/** The camera: the whole board at rest; while the film runs, a gentle zoom that trails the head, and a jolt on each burst. */
export function cameraAt(f: Film, t: number): { cx: number; cy: number; z: number } {
  const env = smooth(f.intro, f.intro + 1.0, t) * (1 - smooth(f.bodyEnd - 0.2, f.bodyEnd + 0.8, t));
  const z = 1 + (f.zoom - 1) * env;
  let sx = 0;
  let sy = 0;
  for (let k = 0; k < 6; k++) {
    const hd = headAt(f, Math.max(0, t - k * 0.1));
    sx += hd.x;
    sy += hd.y;
  }
  const W = f.w + 2 * f.m;
  const H = f.h + 2 * f.m;
  let cx = f.w / 2 + (sx / 6 - f.w / 2) * env;
  let cy = f.h / 2 + (sy / 6 - f.h / 2) * env;
  const hw = W / 2 / z;
  const hh = H / 2 / z;
  cx = clamp(cx, -f.m + hw, f.w + f.m - hw);
  cy = clamp(cy, -f.m + hh, f.h + f.m - hh);
  for (const p of f.parts) {
    if (p.status !== "mismatch" || t < p.arrive) continue;
    const d = t - (p.arrive + p.hover);
    if (d < 0 || d > 0.35) continue;
    const a = (1 - d / 0.35) * Math.min(f.w, f.h) * 0.006;
    cx += Math.sin(d * 90) * a;
    cy += Math.cos(d * 70) * a;
  }
  return { cx, cy, z };
}

/** What a part looks like at time t: "before" (empty pads), "after" (its final look) or the in-between values. */
export type PartFx = {
  /** Opacity of the placed body. */
  chip: number;
  /** 1 = held at the nozzle, 0 = on the pads. */
  lift: number;
  scale: number;
  wobble: number;
  /** Green confirm glow and tick. */
  glow: number;
  tick: number;
  /** Amber check ring: opacity and spread. */
  ring: number;
  ringS: number;
  /** Mismatch burst progress 0..1, or -1. */
  burst: number;
  /** The final mark: green hairline, red dashed outline with ✕, dashed empty pads. */
  mark: number;
};

export const FINAL: Record<MatchStatus, PartFx> = {
  match: { chip: 1, lift: 0, scale: 1, wobble: 0, glow: 0, tick: 0, ring: 0, ringS: 1, burst: -1, mark: 1 },
  check: { chip: 1, lift: 0, scale: 1, wobble: 0, glow: 0, tick: 0, ring: 1, ringS: 1, burst: -1, mark: 0 },
  mismatch: { chip: 0, lift: 0, scale: 1, wobble: 0, glow: 0, tick: 0, ring: 0, ringS: 1, burst: -1, mark: 1 },
  "not-in-bom": { chip: 0, lift: 0, scale: 1, wobble: 0, glow: 0, tick: 0, ring: 0, ringS: 1, burst: -1, mark: 1 },
  "not-on-board": { chip: 0, lift: 0, scale: 1, wobble: 0, glow: 0, tick: 0, ring: 0, ringS: 1, burst: -1, mark: 0 },
};

/** Lifted parts look bigger: they are nearer the camera. */
export const LIFT_SCALE = 0.18;

export function fxAt(f: Film, p: FilmPart, t: number): PartFx | "before" | "after" {
  if (t < p.arrive) return "before";
  if (t >= p.settle) return "after";
  const tau = t - p.arrive;
  const D = f.drop;
  if (p.status === "mismatch") {
    if (tau < p.hover) {
      // Held above the pads, it does not go down: a shiver while the machine refuses it.
      const k = tau / p.hover;
      return { ...FINAL.mismatch, chip: 1, lift: 1 - 0.25 * Math.sin(k * Math.PI), scale: 1, wobble: Math.sin(tau * 55) * 5 * k, mark: 0 };
    }
    const b = clamp((tau - p.hover) / 0.6, 0, 1);
    return { ...FINAL.mismatch, burst: b < 1 ? b : -1, mark: smooth(p.hover + 0.15, p.hover + 0.45, tau) };
  }
  if (p.status === "not-in-bom") return { ...FINAL["not-in-bom"], mark: smooth(0, 0.35, tau) };
  // Drop: falls from the nozzle, a little squash, settles.
  const k = clamp(tau / D, 0, 1);
  const fall = 1 - Math.pow(1 - k, 3);
  const settle = k < 1 ? 0 : Math.sin(clamp((tau - D) / 0.16, 0, 1) * Math.PI) * 0.03;
  const base = { chip: 1, lift: 1 - fall, scale: 1 - settle, wobble: 0, burst: -1 };
  if (p.status === "check") {
    const r = tau - D * 0.7;
    const pulse = r < 0 ? 0 : (r % 0.5) / 0.5;
    const pulsing = r >= 0 && r < 1.0;
    return { ...FINAL.check, ...base, ring: r < 0 ? 0 : pulsing ? 1 - pulse * 0.8 : 1, ringS: pulsing ? 1 + pulse * 0.9 : 1 };
  }
  const g = tau - D * 0.6;
  return { ...FINAL.match, ...base, glow: g < 0 ? 0 : Math.max(0, 1 - g / 0.7), tick: g < 0 ? 0 : g < 0.12 ? g / 0.12 : Math.max(0, 1 - (g - 0.35) / 0.3), mark: smooth(D, D + 0.5, tau) };
}

/** How many parts the head has dealt with by t. */
export function doneBy(f: Film, t: number): number {
  // Arrivals are in order: the first part not yet reached, by binary search.
  let lo = 0;
  let hi = f.parts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (f.parts[mid].arrive <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

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
