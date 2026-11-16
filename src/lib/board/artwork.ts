import type { BodySpec } from "./bodies";

/**
 * Board artwork for a board without Gerbers: per-pin pads from each body, escape traces to vias, 45° routes
 * between neighbouring parts, a via-stitched ground pour on the bottom, silkscreen outlines, pin-1 marks and
 * designators, fiducials, corner mounting holes and a spot for a barcode label. Not a real layout — a
 * deterministic, plausible one (same input → same board), so the 3D view reads like a real PCBA.
 * Coordinates: mm, board-centred, x right, y up (as ViewerPart). Pure: drawn by the viewer's texture code.
 */

export type ArtPart = { refDes: string; x: number; y: number; rotation: number; side: "TOP" | "BOTTOM"; body: BodySpec };
export type Pad = { x: number; y: number; w: number; h: number; rot: number; round?: boolean };
export type Trace = { pts: [number, number][]; width: number };
export type Via = { x: number; y: number; r: number; hole: number };
export type SilkRect = { x: number; y: number; w: number; h: number; rot: number };
export type SilkText = { x: number; y: number; text: string; size: number };
export type SideArt = { pads: Pad[]; traces: Trace[]; outlines: SilkRect[]; pin1: { x: number; y: number }[]; labels: SilkText[]; pour: boolean };
export type Artwork = {
  top: SideArt;
  bottom: SideArt;
  vias: Via[];
  holes: { x: number; y: number; r: number; ring: number }[];
  fiducials: { x: number; y: number }[];
  /** Where a barcode sticker fits on the top side, if anywhere. */
  label: { x: number; y: number; w: number; h: number } | null;
};

/** Mounting holes sit this far in from the corners; layouts keep clear of this band. */
export const HOLE_INSET = 3.4;
export const EDGE_KEEPOUT = 6.5;

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pads in the part's own frame (before rotation), plus the outward direction of each pin row. */
export function padsFor(b: BodySpec): (Pad & { out: [number, number] })[] {
  const L = Math.max(0.4, b.length);
  const W = Math.max(0.3, b.width);
  const out: (Pad & { out: [number, number] })[] = [];
  const two = () => [-1, 1].forEach((s) => out.push({ x: s * (L / 2 - L * 0.12), y: 0, w: Math.max(0.35, L * 0.36), h: W * 1.12, rot: 0, out: [s, 0] }));
  switch (b.kind) {
    case "chip":
    case "molded":
      two();
      break;
    case "can":
      [-1, 1].forEach((s) => out.push({ x: s * W * 0.38, y: 0, w: W * 0.28, h: W * 0.34, rot: 0, out: [s, 0] }));
      break;
    case "gullwing": {
      const n = Math.max(1, Math.ceil(b.pins / 2));
      const pitch = Math.min(b.pitch, (L * 0.95) / n);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * pitch;
        out.push({ x, y: -(W / 2 + 0.75), w: pitch * 0.55, h: 1.5, rot: 0, out: [0, -1] }, { x, y: W / 2 + 0.75, w: pitch * 0.55, h: 1.5, rot: 0, out: [0, 1] });
      }
      break;
    }
    case "quad": {
      const n = Math.max(1, Math.ceil(b.pins / 4));
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * b.pitch;
        out.push(
          { x: o, y: -(W / 2 + 0.9), w: b.pitch * 0.55, h: 1.6, rot: 0, out: [0, -1] },
          { x: o, y: W / 2 + 0.9, w: b.pitch * 0.55, h: 1.6, rot: 0, out: [0, 1] },
          { x: -(L / 2 + 0.9), y: o, w: 1.6, h: b.pitch * 0.55, rot: 0, out: [-1, 0] },
          { x: L / 2 + 0.9, y: o, w: 1.6, h: b.pitch * 0.55, rot: 0, out: [1, 0] },
        );
      }
      break;
    }
    case "leadless": {
      const n = Math.max(1, Math.ceil(b.pins / 4));
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * b.pitch;
        out.push(
          { x: o, y: -(W / 2 - 0.15), w: b.pitch * 0.5, h: 0.8, rot: 0, out: [0, -1] },
          { x: o, y: W / 2 - 0.15, w: b.pitch * 0.5, h: 0.8, rot: 0, out: [0, 1] },
          { x: -(L / 2 - 0.15), y: o, w: 0.8, h: b.pitch * 0.5, rot: 0, out: [-1, 0] },
          { x: L / 2 - 0.15, y: o, w: 0.8, h: b.pitch * 0.5, rot: 0, out: [1, 0] },
        );
      }
      out.push({ x: 0, y: 0, w: L * 0.55, h: W * 0.55, rot: 0, out: [0, 0] });
      break;
    }
    case "power":
      out.push({ x: 0, y: W * 0.15, w: L * 0.9, h: W * 0.8, rot: 0, out: [0, 1] });
      [-1, 1].forEach((s) => out.push({ x: s * L * 0.3, y: -(W / 2 + 1.6), w: 1.1, h: 2, rot: 0, out: [0, -1] }));
      break;
    case "connector":
    case "module": {
      const n = Math.max(2, Math.min(40, b.kind === "module" ? Math.ceil(b.pins / 2) : b.pins));
      const pitch = Math.min(b.pitch || 2.54, (L * 0.92) / n);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * pitch;
        out.push({ x, y: -(W / 2 - 0.4), w: pitch * 0.6, h: 1.4, rot: 0, out: [0, -1], round: b.kind === "connector" });
        if (b.kind === "module") out.push({ x, y: W / 2 - 0.4, w: pitch * 0.6, h: 1.4, rot: 0, out: [0, 1] });
      }
      break;
    }
    case "crystal":
      [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => out.push({ x: sx * L * 0.32, y: sy * W * 0.3, w: L * 0.3, h: W * 0.32, rot: 0, out: [sx, 0] })));
      break;
    case "array": {
      // BGA balls are under the body; show the dog-bone escape pads around it.
      const n = Math.max(2, Math.min(12, Math.round(Math.sqrt(b.pins))));
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * (L / n);
        out.push({ x: o, y: -(W / 2 + 0.7), w: 0.45, h: 0.45, rot: 0, out: [0, -1], round: true }, { x: o, y: W / 2 + 0.7, w: 0.45, h: 0.45, rot: 0, out: [0, 1], round: true });
      }
      break;
    }
    default:
      two();
  }
  return out;
}

const rot = (x: number, y: number, deg: number): [number, number] => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

/** Octilinear route a → b: diagonal first, then straight. */
export function route45(a: [number, number], b: [number, number]): [number, number][] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.min(Math.abs(dx), Math.abs(dy));
  const mid: [number, number] = [a[0] + Math.sign(dx) * d, a[1] + Math.sign(dy) * d];
  return mid[0] === b[0] && mid[1] === b[1] ? [a, b] : [a, mid, b];
}

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function partBox(p: ArtPart, grow = 1): Box {
  const [hx, hy] = rot(p.body.length / 2 + grow, p.body.width / 2 + grow, 0);
  const r = ((p.rotation % 180) + 180) % 180;
  const [w, h] = r === 90 ? [hy, hx] : [hx, hy];
  return { x0: p.x - w, y0: p.y - h, x1: p.x + w, y1: p.y + h };
}

export function boardArtwork(parts: ArtPart[], board: { width: number; height: number }, seed: string): Artwork {
  const rand = rng(seed);
  const W2 = board.width / 2;
  const H2 = board.height / 2;
  const inside = (x: number, y: number, m = 1.2) => x > -W2 + m && x < W2 - m && y > -H2 + m && y < H2 - m;
  const side = (): SideArt => ({ pads: [], traces: [], outlines: [], pin1: [], labels: [], pour: false });
  const art: Artwork = { top: side(), bottom: side(), vias: [], holes: [], fiducials: [], label: null };
  art.bottom.pour = true;

  // Every pad in board coordinates, grouped by part, with its escape point.
  const placed = parts.map((p) => {
    const pads = padsFor(p.body).map((pad) => {
      const [x, y] = rot(pad.x, pad.y, p.rotation);
      const [ox, oy] = rot(pad.out[0], pad.out[1], p.rotation);
      const esc: [number, number] = [p.x + x + ox * 1.1, p.y + y + oy * 1.1];
      return { pad: { ...pad, x: p.x + x, y: p.y + y, rot: p.rotation }, esc, centre: [p.x + x, p.y + y] as [number, number], thermal: pad.out[0] === 0 && pad.out[1] === 0 };
    });
    return { p, pads };
  });

  const addVia = (x: number, y: number) => {
    if (inside(x, y, 1.5) && !art.vias.some((v) => Math.hypot(v.x - x, v.y - y) < 0.9)) art.vias.push({ x, y, r: 0.32, hole: 0.15 });
  };

  for (const { p, pads } of placed) {
    const s = p.side === "TOP" ? art.top : art.bottom;
    for (const x of pads) s.pads.push(x.pad);
    s.outlines.push({ x: p.x, y: p.y, w: p.body.length + 0.7, h: p.body.width + 0.7, rot: p.rotation });
    if (["gullwing", "quad", "leadless", "array", "module"].includes(p.body.kind)) {
      const [px, py] = rot(-(p.body.length / 2 + 0.6), p.body.width / 2 + 0.6, p.rotation);
      s.pin1.push({ x: p.x + px, y: p.y + py });
    }
    const [lx, ly] = rot(0, p.body.width / 2 + (["gullwing", "quad"].includes(p.body.kind) ? 2.4 : 1.1), p.rotation);
    if (inside(p.x + lx, p.y + ly, 1.5)) s.labels.push({ x: p.x + lx, y: p.y + ly, text: p.refDes, size: 0.85 });

    // Neighbours by distance, for plausible point-to-point routes.
    const near = placed
      .filter((o) => o.p !== p && o.p.side === p.side)
      .map((o) => ({ o, d: Math.hypot(o.p.x - p.x, o.p.y - p.y) }))
      .filter((x) => x.d < 22)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    for (const pad of pads) {
      if (pad.thermal) {
        // Thermal pad: a 3 × 3 via array to the ground pour.
        for (const dx of [-0.8, 0, 0.8]) for (const dy of [-0.8, 0, 0.8]) addVia(pad.centre[0] + dx, pad.centre[1] + dy);
        continue;
      }
      const roll = rand();
      const width = p.body.pins <= 3 && rand() < 0.25 ? 0.5 : 0.2;
      if (roll < 0.5 && near.length) {
        const target = near[Math.floor(rand() * near.length)].o;
        const tp = target.pads[Math.floor(rand() * target.pads.length)];
        if (!tp || tp.thermal) continue;
        s.traces.push({ pts: [pad.centre, pad.esc, ...route45(pad.esc, tp.esc).slice(1), tp.centre], width });
      } else if (roll < 0.85) {
        const [ex, ey] = pad.esc;
        const len = 0.4 + rand() * 1.2;
        const dir = [ex - pad.centre[0], ey - pad.centre[1]];
        const n = Math.hypot(dir[0], dir[1]) || 1;
        const vx = ex + (dir[0] / n) * len;
        const vy = ey + (dir[1] / n) * len;
        s.traces.push({ pts: [pad.centre, [vx, vy]], width });
        addVia(vx, vy);
      }
    }
  }

  // Bottom: short links between nearby vias, plus stitching vias along the edges into the ground pour.
  for (const v of art.vias.slice()) {
    if (rand() > 0.45) continue;
    const other = art.vias.filter((o) => o !== v).sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0];
    if (other && Math.hypot(other.x - v.x, other.y - v.y) < 14) art.bottom.traces.push({ pts: route45([v.x, v.y], [other.x, other.y]), width: 0.25 });
  }
  for (let x = -W2 + EDGE_KEEPOUT; x < W2 - EDGE_KEEPOUT; x += 4.5) {
    addVia(x, -H2 + 2.2);
    addVia(x, H2 - 2.2);
  }

  // Mounting holes in the corners, fiducials beside three of them.
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) art.holes.push({ x: sx * (W2 - HOLE_INSET), y: sy * (H2 - HOLE_INSET), r: 1.6, ring: 2.9 });
  art.fiducials.push({ x: -W2 + HOLE_INSET + 4.5, y: -H2 + 2 }, { x: W2 - HOLE_INSET - 4.5, y: -H2 + 2 }, { x: -W2 + HOLE_INSET + 4.5, y: H2 - 2 });

  // Barcode label: the first free 24 × 7 mm spot on top, scanning from the top right.
  const boxes = parts.filter((p) => p.side === "TOP").map((p) => partBox(p, 1.5));
  const LW = Math.min(24, board.width * 0.4);
  const LH = 7;
  search: for (let y = H2 - EDGE_KEEPOUT - LH / 2; y > -H2 + EDGE_KEEPOUT + LH / 2; y -= 1) {
    for (let x = W2 - EDGE_KEEPOUT - LW / 2; x > -W2 + EDGE_KEEPOUT + LW / 2; x -= 1) {
      const b = { x0: x - LW / 2, y0: y - LH / 2, x1: x + LW / 2, y1: y + LH / 2 };
      if (!boxes.some((o) => overlaps(o, b))) {
        art.label = { x, y, w: LW, h: LH };
        break search;
      }
    }
  }
  return art;
}

/** EIA code printed on chip resistors: "103" for 10 kΩ, "4R7" for 4.7 Ω, "000" for a 0 Ω link. Null if unreadable. */
export function resistorCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /(\d+(?:[.,]\d+)?)\s*([rRkKmM]|Ω|ohms?)?\s*(\d+)?/.exec(value.replace(/\s*Ω\s*/g, "R"));
  if (!m) return null;
  // Lower-case m is milli (current-sense shunts: "10m", "10mΩ"); upper-case M is mega.
  const unit = m[2] === "m" ? "m" : (m[2] ?? "R").toUpperCase();
  const mult = unit === "K" ? 1e3 : unit === "M" ? 1e6 : unit === "m" ? 1e-3 : 1;
  // "4k7" style: the letter is the decimal point.
  const num = m[3] && !m[1].includes(".") ? Number(`${m[1]}.${m[3]}`) : Number(m[1].replace(",", "."));
  if (!Number.isFinite(num)) return null;
  const ohms = num * mult;
  if (ohms === 0) return "000";
  // Shunts: "R010" for 10 mΩ, "R100" for 0.1 Ω.
  if (ohms < 1) return `R${ohms.toFixed(3).slice(2)}`;
  if (ohms < 10) return String(Number(ohms.toFixed(1))).replace(".", "R").replace(/^(\d)$/, "$1R0");
  const exp = Math.floor(Math.log10(ohms)) - 1;
  const sig = Math.round(ohms / 10 ** exp);
  if (sig >= 100) return `${String(sig).slice(0, 2)}${exp + 1}`;
  return `${String(sig).padStart(2, "0")}${exp}`;
}
