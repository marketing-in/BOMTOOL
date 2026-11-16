/**
 * The tilted view of a board (Phase 27): where a point of the board lands in a flat picture, which faces of a part
 * face the viewer, and how light each face is. Parallel projection — no perspective — so a part keeps its size
 * wherever it sits, and a flat drawing can be laid on any level with one SVG matrix.
 *
 * Board frame: x right, y up, z up, in mm, origin at the centre of the board's top face. Picture frame: x right,
 * y down. The board is turned (yaw) so its right and front edges face the viewer, and tipped (pitch) towards them.
 */
export type View = { cy: number; sy: number; sp: number; cp: number };

export function view(yawDeg: number, pitchDeg: number): View {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  return { cy: Math.cos(y), sy: Math.sin(y), sp: Math.sin(p), cp: Math.cos(p) };
}

/** A product-shot angle: the right edge turned towards the viewer, looked at from 42° above. */
export const VIEW = view(-28, 42);

/** How far a point of the board plane is from the viewer; larger is farther, so it is drawn first. */
export const depth = (x: number, y: number, v: View = VIEW) => x * v.sy + y * v.cy;

/** A board point in the picture. */
export function project(x: number, y: number, z: number, v: View = VIEW): [number, number] {
  return [x * v.cy - y * v.sy, -(depth(x, y, v) * v.sp + z * v.cp)];
}

/**
 * The SVG matrix that lays a flat drawing onto the level at height z. The drawing is in board-centred picture
 * coordinates: u right, v down (v = -y), mm.
 */
export function planeMatrix(z: number, v: View = VIEW): string {
  const n = (k: number) => Number(k.toFixed(5));
  return `matrix(${n(v.cy)} ${n(-v.sy * v.sp)} ${n(v.sy)} ${n(v.cy * v.sp)} 0 ${n(-z * v.cp)})`;
}

export type Pt = [number, number];

/** The corners of a part's footprint, counter-clockwise seen from above. */
export function corners(cx: number, cy: number, length: number, width: number, rotationDeg: number): Pt[] {
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return (
    [
      [-length / 2, -width / 2],
      [length / 2, -width / 2],
      [length / 2, width / 2],
      [-length / 2, width / 2],
    ] as Pt[]
  ).map(([lx, ly]) => [cx + lx * c - ly * s, cy + lx * s + ly * c]);
}

export type Wall = { a: Pt; b: Pt; /** 0 = faces away from the light, 1 = faces it. */ light: number };

/**
 * The upright faces of a footprint that the viewer can see, each with how much light it catches. `poly` runs
 * counter-clockwise seen from above; the light comes from the viewer's left.
 */
export function walls(poly: Pt[], v: View = VIEW): Wall[] {
  const out: Wall[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey) || 1;
    // Outward normal of a counter-clockwise edge.
    const nx = ey / len;
    const ny = -ex / len;
    // It faces the viewer when it points back along the line of sight.
    if (depth(nx, ny, v) >= -1e-9) continue;
    // The normal's sideways part in the picture: pointing left catches the light.
    const side = nx * v.cy - ny * v.sy;
    out.push({ a, b, light: Math.max(0, Math.min(1, 0.5 - side * 0.5)) });
  }
  return out;
}

/** A wall as a picture polygon between two heights. */
export function wallPoints(w: Wall, z0: number, z1: number, v: View = VIEW): string {
  return [project(w.a[0], w.a[1], z0, v), project(w.b[0], w.b[1], z0, v), project(w.b[0], w.b[1], z1, v), project(w.a[0], w.a[1], z1, v)].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

/** The picture's bounds for a board w × h with things on it from zMin up to zMax. */
export function bounds(w: number, h: number, zMin: number, zMax: number, v: View = VIEW): { x: number; y: number; w: number; h: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [-w / 2, w / 2])
    for (const y of [-h / 2, h / 2])
      for (const z of [zMin, zMax]) {
        const [px, py] = project(x, y, z, v);
        xs.push(px);
        ys.push(py);
      }
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

const hex = (c: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].split("").map((ch) => ch + ch).join("") : m[1];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};

/** A colour made lighter (k > 0, towards white) or darker (k < 0, towards black); k from -1 to 1. */
export function shade(color: string, k: number): string {
  const rgb = hex(color);
  if (!rgb) return color;
  const to = k >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(k));
  return `#${rgb.map((c) => Math.round(c + (to - c) * t).toString(16).padStart(2, "0")).join("")}`;
}
