import type * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The kit every real machine of the Lines view is built with (scene units = metres). Typed after the
 * factory-3d-plant skill's kit and the helpers of src/vendor/circuitflow/factoryModels.js (signal tower, live
 * operator screen, e-stop, smoke), grown for real SMT machines: profiled covers, smoked glass, lettering, feeder
 * banks, the shared conveyor rails, and seal() which merges what does not move.
 *
 * The frame of a machine (see BuildInput / RealBuilt in ./types): x along the line, +x the way boards travel;
 * y up from the floor; z = 0 on the conveyor centreline, +z the operator's side.
 *
 * Faces: "front" = +z (operator), "back" = −z, "right" = +x (exit end), "left" = −x (entry end), "top", "bottom".
 * Every fitting takes the point ON the surface it is mounted on and a face, and is built outwards from there.
 *
 * Everything created through the kit is disposed with it. Node-safe: with no document, lettering and screens fall
 * back to flat colour and smoke to nothing, so builders run in the unit tests.
 */

type Three = typeof import("three");

export type Hex = string | number;
export type Axis = "x" | "y" | "z";
export type Face = "front" | "back" | "left" | "right" | "top" | "bottom";
/** A point of an outline; the optional third number rounds that corner with this radius. */
export type Pt2 = [number, number] | [number, number, number];
export type Pt3 = [number, number, number];
export type Finish = "satin" | "matte" | "gloss" | "metal";
export type LampColor = "green" | "amber" | "red" | "blue" | "white";

/** What a machine's screen shows: the same readout the generic models have. */
export type ScreenInfo = { name: string; state: string; board: string; cycle: string; done: string };
export type ScreenUi = { bg?: string; ink?: string; dim?: string; title?: string };
export type ScreenHandle = {
  group: T.Group;
  /** The lit face (its own material). */
  face: T.Mesh;
  draw: (info: ScreenInfo) => void;
  /** Hand the screen's 2D context to fn(g, W, H) to paint something else on it. */
  paint: (fn: (g: CanvasRenderingContext2D, W: number, H: number) => void) => void;
};

export type FaceOpts = { face?: Face; tilt?: number; spin?: number };
export type DecalOpts = FaceOpts & {
  /** Ink. Default "#1c1d1f". */
  color?: string;
  /** Background; null = transparent (lettering straight on the paint). Default null. */
  bg?: string | null;
  /** Font weight 100–900. Default 700. */
  weight?: number;
  italic?: boolean;
  /** CSS font family. Default K.FONT.sans. */
  font?: string;
  /** Letter spacing in em. Default 0. */
  spacing?: number;
  align?: "left" | "center" | "right";
  /** Padding as a share of the height. Default 0.08 (0.18 with a background). */
  pad?: number;
  /** Outline colour of the label (with a background). */
  border?: string;
  /** Corner radius as a share of the height (with a background). */
  radius?: number;
  /** Texture pixels per metre. Default 1600. */
  px?: number;
};

export type Stats = { drawCalls: number; triangles: number; box: T.Box3 };

/** The conveyor every machine shares, so a line of them reads as one. */
export const RAIL = { gap: 0.26, railH: 0.05, railT: 0.022, lip: 0.006, overhang: 0.04, openW: 0.42, openH: 0.1 } as const;

/** Per machine, after seal(). */
export const BUDGET = { drawCalls: 45, triangles: 120_000 } as const;

const FONT = {
  sans: '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif',
  heavy: '"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif',
  narrow: '"Arial Narrow", "Helvetica Neue", Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, Menlo, Consolas, "Liberation Mono", monospace',
  ui: 'system-ui, "Helvetica Neue", Arial, sans-serif',
} as const;

const LAMP: Record<LampColor, number> = { green: 0x35b46a, amber: 0xf0a51e, red: 0xe23a2e, blue: 0x2f7fd6, white: 0xf2f1ec };

const DEG = Math.PI / 180;

export function createKit(THREE: Three) {
  const owned = new Set<{ dispose: () => void }>();
  const keep = <X extends { dispose: () => void }>(x: X): X => {
    owned.add(x);
    return x;
  };
  const drop = (x: { dispose: () => void }) => {
    owned.delete(x);
    x.dispose();
  };
  const hasDom = typeof document !== "undefined";

  // ── Materials ────────────────────────────────────────────────────────────────────────────────────────────────

  const hexOf = (c: Hex) => new THREE.Color(c as T.ColorRepresentation).getHex();
  const mats = new Map<string, T.MeshStandardMaterial>();
  const keyOf = (v: unknown): string => {
    if (v && typeof v === "object") {
      const o = v as { uuid?: string; isColor?: boolean; getHex?: () => number };
      if (o.isColor && o.getHex) return `#${o.getHex().toString(16)}`;
      return o.uuid ?? JSON.stringify(v);
    }
    return String(v);
  };
  /** A standard material, made once per kit for the same arguments. */
  const mat = (color: Hex, metalness = 0.2, roughness = 0.6, extra: T.MeshStandardMaterialParameters = {}): T.MeshStandardMaterial => {
    const key = `${hexOf(color)}|${metalness}|${roughness}|${Object.entries(extra)
      .map(([k, v]) => `${k}:${keyOf(v)}`)
      .sort()
      .join(",")}`;
    let m = mats.get(key);
    if (!m) {
      m = keep(new THREE.MeshStandardMaterial({ color: color as T.ColorRepresentation, metalness, roughness, ...extra }));
      mats.set(key, m);
    }
    return m;
  };
  /** A material of its own (never shared): for what update() changes — a lamp, a ring light, a heater glow. */
  const ownMat = (color: Hex, metalness = 0.2, roughness = 0.6, extra: T.MeshStandardMaterialParameters = {}): T.MeshStandardMaterial =>
    keep(new THREE.MeshStandardMaterial({ color: color as T.ColorRepresentation, metalness, roughness, ...extra }));
  const FINISH: Record<Finish, [number, number]> = { satin: [0.1, 0.55], matte: [0.05, 0.82], gloss: [0.15, 0.3], metal: [0.3, 0.42] };
  /** Painted sheet metal in a livery colour. finish: satin (powder coat, default), matte, gloss, metal (anodised or bare). */
  const paint = (hex: Hex, opts: { finish?: Finish; emissive?: Hex; glow?: number } = {}): T.MeshStandardMaterial => {
    const [m, r] = FINISH[opts.finish ?? "satin"];
    return mat(hex, m, r, opts.emissive !== undefined ? { emissive: opts.emissive as T.ColorRepresentation, emissiveIntensity: opts.glow ?? 0.5 } : {});
  };
  /** Smoked window: what is behind stays faintly visible. Casts no shadow. */
  const glass = (tint: Hex = "#1d2226", opacity = 0.5): T.MeshStandardMaterial => mat(tint, 0.1, 0.08, { transparent: true, opacity, depthWrite: false });
  /** Something that glows: an LED, a lit button, a hot slot. own = true gives a material update() may change. */
  const lit = (hex: Hex, intensity = 1, own = false): T.MeshStandardMaterial => {
    const base = new THREE.Color(hex as T.ColorRepresentation).multiplyScalar(0.45).getHex();
    const extra = { emissive: hex as T.ColorRepresentation, emissiveIntensity: intensity };
    return own ? ownMat(base, 0.1, 0.4, extra) : mat(base, 0.1, 0.4, extra);
  };

  /**
   * Shared palette: what is the same on every machine. Paint comes from the look's livery through paint().
   * Metals are kept light and only a little metallic: the scene has no environment to mirror, and a mirror of nothing is black.
   */
  const M = {
    steel: mat(0xb9bdc1, 0.35, 0.36),
    chrome: mat(0xe3e6e8, 0.45, 0.2),
    zinc: mat(0xa9aeb2, 0.3, 0.5),
    alu: mat(0xcdd1d4, 0.3, 0.42),
    aluDark: mat(0x3b3e42, 0.3, 0.45),
    dark: mat(0x2b2d30, 0.3, 0.6),
    black: mat(0x17181a, 0.2, 0.7),
    rubber: mat(0x1c1d1f, 0.02, 0.92),
    belt: mat(0x1c1d1f, 0.05, 0.9),
    void: mat(0x0b0c0d, 0, 1),
    seam: mat(0x3a3c3f, 0.1, 0.8),
    white: mat(0xf2f1ec, 0.05, 0.5),
    grey: mat(0xb9bbb8, 0.1, 0.6),
    yellow: mat(0xf2c21a, 0.1, 0.5),
    red: mat(0xd0281f, 0.15, 0.45),
    green: mat(0x2d9a5a, 0.1, 0.5),
    copper: mat(0xc27a3e, 0.4, 0.4),
    brass: mat(0xc9a35a, 0.45, 0.35),
    pcb: mat(0x1f6b45, 0.1, 0.55),
    screenBack: mat(0x1d1f22, 0.3, 0.5),
    reelWhite: mat(0xe9e8e3, 0.05, 0.5),
    reelBlack: mat(0x232427, 0.05, 0.6),
    reelClear: mat(0xcfd6d9, 0.1, 0.25, { transparent: true, opacity: 0.55, depthWrite: false }),
    tape: mat(0x8c8f93, 0.1, 0.6),
    hot: mat(0x301205, 0, 1, { emissive: 0xff6a2a, emissiveIntensity: 0.9 }),
  };

  // ── Placing ──────────────────────────────────────────────────────────────────────────────────────────────────

  const add = <O extends T.Object3D>(o: O, x: number, y: number, z: number, parent: T.Object3D): O => {
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const mesh = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D): T.Mesh => {
    const m = new THREE.Mesh(keep(geometry), material);
    m.castShadow = !material.transparent;
    m.receiveShadow = !material.transparent;
    return add(m, x, y, z, parent);
  };
  /** An empty group at a point: for what moves together. */
  const group = (parent?: T.Object3D, x = 0, y = 0, z = 0): T.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent?.add(g);
    return g;
  };
  /** Turn o so that its local +z is the face's outward normal, +x the viewer's right, +y up (on "top": away from the operator). tilt leans it back, spin turns it in its plane. */
  const orient = <O extends T.Object3D>(o: O, face: Face = "front", tilt = 0, spin = 0): O => {
    const yaw = face === "back" ? Math.PI : face === "right" ? Math.PI / 2 : face === "left" ? -Math.PI / 2 : 0;
    const pitch = face === "top" ? -Math.PI / 2 : face === "bottom" ? Math.PI / 2 : 0;
    o.rotation.order = "YXZ";
    o.rotation.set(pitch - tilt, yaw, spin);
    return o;
  };
  /** A group standing on a face at (x, y, z): build a fitting in it as if on the front (x right, y up, z out). */
  const on = (parent: T.Object3D, face: Face = "front", x = 0, y = 0, z = 0, tilt = 0, spin = 0): T.Group => orient(group(parent, x, y, z), face, tilt, spin);

  // ── Primitives ───────────────────────────────────────────────────────────────────────────────────────────────

  /** A slab, panel or beam, centred on (x, y, z). */
  const box = (w: number, h: number, d: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D): T.Mesh => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
  /** A cylinder along axis, centred. r is the radius at the + end, r0 at the − end (r0 ≠ r: a cone or a hopper; 0 = a point). */
  const cyl = (r: number, h: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D, axis: Axis = "y", seg = 20, r0 = r): T.Mesh => {
    const g = new THREE.CylinderGeometry(r, r0, h, seg);
    if (axis === "x") g.rotateZ(-Math.PI / 2);
    if (axis === "z") g.rotateX(Math.PI / 2);
    return mesh(g, material, x, y, z, parent);
  };
  const sphere = (r: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D, seg = 16): T.Mesh => mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2)), material, x, y, z, parent);
  /** A ring round axis: r to the middle of the tube. */
  const torus = (r: number, tube: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D, axis: Axis = "y", seg = 24): T.Mesh => {
    const g = new THREE.TorusGeometry(r, tube, 8, seg);
    if (axis === "y") g.rotateX(Math.PI / 2);
    if (axis === "x") g.rotateY(Math.PI / 2);
    return mesh(g, material, x, y, z, parent);
  };
  /** A hose, cable or tube through the points (in the parent's frame), rounded at the corners. */
  const pipe = (points: Pt3[], r: number, material: T.Material, parent: T.Object3D, seg = 8): T.Mesh => {
    const path = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      false,
      "catmullrom",
      0.1,
    );
    return mesh(new THREE.TubeGeometry(path, Math.max(8, points.length * 6), r, seg, false), material, 0, 0, 0, parent);
  };
  /** A flat rectangle on a face, centred on (x, y, z). Casts no shadow. */
  const plane = (w: number, h: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D, face: Face = "front", tilt = 0): T.Mesh => {
    const m = orient(mesh(new THREE.PlaneGeometry(w, h), material, x, y, z, parent), face, tilt);
    m.castShadow = false;
    return m;
  };

  // Outlines: round the corners that carry a radius, then extrude.
  const fillet = (outline: Pt2[], closed = true): { pts: [number, number][]; smooth: boolean[] } => {
    const n = outline.length;
    const pts: [number, number][] = [];
    const smooth: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const cur = outline[i], prev = outline[(i + n - 1) % n], next = outline[(i + 1) % n];
      const bx = cur[0], by = cur[1], r = cur.length === 3 && (closed || (i > 0 && i < n - 1)) ? cur[2] : 0;
      const ax = prev[0], ay = prev[1], cx = next[0], cy = next[1];
      const l1 = Math.hypot(ax - bx, ay - by);
      const l2 = Math.hypot(cx - bx, cy - by);
      if (r <= 0 || l1 < 1e-9 || l2 < 1e-9) {
        pts.push([bx, by]);
        smooth.push(false);
        continue;
      }
      const u1: [number, number] = [(ax - bx) / l1, (ay - by) / l1];
      const u2: [number, number] = [(cx - bx) / l2, (cy - by) / l2];
      const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
      if (theta > Math.PI - 1e-3 || theta < 1e-3) {
        pts.push([bx, by]);
        smooth.push(false);
        continue;
      }
      const half = theta / 2;
      // The radius may not eat more than half of either edge.
      const t = Math.min(r / Math.tan(half), l1 / 2, l2 / 2);
      const rr = t * Math.tan(half);
      const bl = Math.hypot(u1[0] + u2[0], u1[1] + u2[1]);
      const k = rr / Math.sin(half) / bl;
      const ox = bx + (u1[0] + u2[0]) * k;
      const oy = by + (u1[1] + u2[1]) * k;
      const a0 = Math.atan2(by + u1[1] * t - oy, bx + u1[0] * t - ox);
      let da = Math.atan2(by + u2[1] * t - oy, bx + u2[0] * t - ox) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const steps = Math.max(2, Math.ceil(Math.abs(da) / (15 * DEG)));
      for (let s = 0; s <= steps; s++) {
        const a = a0 + (da * s) / steps;
        pts.push([ox + Math.cos(a) * rr, oy + Math.sin(a) * rr]);
        smooth.push(true);
      }
    }
    return { pts, smooth };
  };
  /** Extrude a closed outline (a, b) from e0 to e1; map says which scene axis each of (a, b, e) is. */
  const extrude = (points: [number, number][], rounded: boolean[], e0: number, e1: number, map: (a: number, b: number, e: number) => Pt3): T.BufferGeometry => {
    let pts = points, smooth = rounded;
    // Drop repeated points, then make the outline counter-clockwise.
    const keepAt = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7;
    });
    smooth = smooth.filter((_, i) => keepAt[i]);
    pts = pts.filter((_, i) => keepAt[i]);
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const q = pts[(i + 1) % pts.length];
      area += pts[i][0] * q[1] - q[0] * pts[i][1];
    }
    if (area < 0) {
      pts = [...pts].reverse();
      smooth = [...smooth].reverse();
    }
    const n = pts.length;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const tri = (p: Pt3[], nn: Pt3[], t: [number, number][]) => {
      // Wind the triangle so that it faces along its normals.
      const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
      const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
      const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
      const order = gx * nn[0][0] + gy * nn[0][1] + gz * nn[0][2] >= 0 ? [0, 1, 2] : [0, 2, 1];
      for (const k of order) {
        pos.push(...p[k]);
        nor.push(...nn[k]);
        uv.push(...t[k]);
      }
    };
    const edgeN: [number, number][] = pts.map((p, i) => {
      const q = pts[(i + 1) % n];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      return [dy / len, -dx / len];
    });
    // A corner that turns less than 25° is part of a curve (an arc given point by point): shade it smooth too.
    const soft = pts.map((_, i) => {
      const a = edgeN[(i + n - 1) % n], b = edgeN[i];
      return smooth[i] || a[0] * b[0] + a[1] * b[1] > Math.cos(25 * DEG);
    });
    const at = (i: number, edge: number): Pt3 => {
      if (!soft[i]) return map(edgeN[edge][0], edgeN[edge][1], 0);
      const a = edgeN[(i + n - 1) % n], b = edgeN[i];
      const len = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
      return map((a[0] + b[0]) / len, (a[1] + b[1]) / len, 0);
    };
    let run = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const p = pts[i], q = pts[j];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const A = map(p[0], p[1], e0), B = map(q[0], q[1], e0), C = map(q[0], q[1], e1), D = map(p[0], p[1], e1);
      const ni = at(i, i), nj = at(j, i);
      tri([A, B, C], [ni, nj, nj], [[0, run], [0, run + len], [e1 - e0, run + len]]);
      tri([A, C, D], [ni, nj, ni], [[0, run], [e1 - e0, run + len], [e1 - e0, run]]);
      run += len;
    }
    const caps = THREE.ShapeUtils.triangulateShape(
      pts.map((p) => new THREE.Vector2(p[0], p[1])),
      [],
    );
    for (const [e, sign] of [[e0, -1], [e1, 1]] as const) {
      const nn = map(0, 0, sign);
      for (const f of caps) tri(f.map((k) => map(pts[k][0], pts[k][1], e)) as Pt3[], [nn, nn, nn], f.map((k) => [pts[k][0], pts[k][1]]) as [number, number][]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };
  const prism = (outline: Pt2[], e0: number, e1: number, map: (a: number, b: number, e: number) => Pt3): T.BufferGeometry => {
    const f = fillet(outline);
    return extrude(f.pts, f.smooth, e0, e1, map);
  };
  /**
   * A cover seen from the end: the outline [z, y, radius?] extruded along x over `length`, centred on x. The
   * outline's z and y are in the parent's frame (y and z shift it). Sloped and curved fronts, overhangs, hoods.
   */
  const profileX = (outline: Pt2[], length: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D): T.Mesh =>
    mesh(prism(outline, -length / 2, length / 2, (a, b, e) => [e, b, a]), material, x, y, z, parent);
  /** The same seen from the front: the outline [x, y, radius?] extruded along z over `length`, centred on z. */
  const profileZ = (outline: Pt2[], length: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D): T.Mesh =>
    mesh(prism(outline, -length / 2, length / 2, (a, b, e) => [a, b, e]), material, x, y, z, parent);
  /** A plan outline [x, z, radius?] extruded UP from y over `height` (y is its underside). */
  const profileY = (outline: Pt2[], height: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D): T.Mesh =>
    mesh(prism(outline, 0, height, (a, b, e) => [a, e, b]), material, x, y, z, parent);
  // A bent sheet: the open path and its offset by the thickness, closed into an outline.
  const sheetOutline = (path: Pt2[], t: number): { pts: [number, number][]; smooth: boolean[] } => {
    const f = fillet(path, false), n = f.pts.length;
    const inner: [number, number][] = f.pts.map((p, i) => {
      const a = f.pts[Math.max(0, i - 1)], b = f.pts[Math.min(n - 1, i + 1)];
      const n1 = i > 0 ? [-(p[1] - a[1]), p[0] - a[0]] : null, n2 = i < n - 1 ? [-(b[1] - p[1]), b[0] - p[0]] : null;
      const unit = (v: number[] | null) => (v ? [v[0] / (Math.hypot(v[0], v[1]) || 1), v[1] / (Math.hypot(v[0], v[1]) || 1)] : null);
      const u1 = unit(n1), u2 = unit(n2);
      const mx = (u1?.[0] ?? u2![0]) + (u2?.[0] ?? u1![0]), my = (u1?.[1] ?? u2![1]) + (u2?.[1] ?? u1![1]);
      const len = Math.hypot(mx, my) || 1;
      // Keep the thickness through a corner (a mitre), within reason.
      const cos = u1 && u2 ? Math.max(0.5, (mx / len) * u1[0] + (my / len) * u1[1]) : 1;
      return [p[0] + ((mx / len) * t) / cos, p[1] + ((my / len) * t) / cos];
    });
    return { pts: [...f.pts, ...inner.reverse()], smooth: [...f.smooth, ...[...f.smooth].reverse()] };
  };
  /**
   * A sheet bent along a path, seen from the end: the OPEN path [z, y, radius?] given thickness t and extruded along x
   * over `length`, centred on x. t > 0 thickens to the left of the way the path runs (for a path that goes front →
   * top → back, with z falling: inwards). Curved windows and covers, a lip, a tray, a bracket.
   */
  const bendX = (path: Pt2[], t: number, length: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D): T.Mesh => {
    const o = sheetOutline(path, t);
    return mesh(extrude(o.pts, o.smooth, -length / 2, length / 2, (a, b, e) => [e, b, a]), material, x, y, z, parent);
  };
  /** The same seen from the front: the open path [x, y, radius?], thickness t, extruded along z over `length`. */
  const bendZ = (path: Pt2[], t: number, length: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D): T.Mesh => {
    const o = sheetOutline(path, t);
    return mesh(extrude(o.pts, o.smooth, -length / 2, length / 2, (a, b, e) => [a, b, e]), material, x, y, z, parent);
  };
  /** A box whose four edges along `axis` are rounded with radius r (axis "y": rounded in plan; "x": a rounded cover seen from the end). Centred. */
  const rbox = (w: number, h: number, d: number, r: number, material: T.Material, x: number, y: number, z: number, parent: T.Object3D, axis: Axis = "y"): T.Mesh => {
    const rect = (a: number, b: number): Pt2[] => [[-a / 2, -b / 2, r], [a / 2, -b / 2, r], [a / 2, b / 2, r], [-a / 2, b / 2, r]];
    const g = axis === "y" ? prism(rect(w, d), -h / 2, h / 2, (a, b, e) => [a, e, b]) : axis === "x" ? prism(rect(d, h), -w / 2, w / 2, (a, b, e) => [e, b, a]) : prism(rect(w, h), -d / 2, d / 2, (a, b, e) => [a, b, e]);
    return mesh(g, material, x, y, z, parent);
  };
  /** Points along an arc round (ca, cb), from angle a0 to a1 in degrees (0° = +a, 90° = +b): for curved outlines. */
  const arc = (ca: number, cb: number, r: number, a0: number, a1: number, steps = 8): [number, number][] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = (a0 + ((a1 - a0) * i) / steps) * DEG;
      return [ca + Math.cos(a) * r, cb + Math.sin(a) * r] as [number, number];
    });
  /** A flat polygon on a face: points [u, v] in the face's own frame (u right, v up) round (x, y, z) on the surface. Stripes, wedges, arrows. */
  const poly = (points: [number, number][], material: T.Material, x: number, y: number, z: number, parent: T.Object3D, opts: FaceOpts = {}): T.Mesh => {
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
    const m = orient(mesh(new THREE.ShapeGeometry(shape), material, x, y, z, parent), opts.face, opts.tilt, opts.spin);
    m.castShadow = false;
    m.translateZ(0.0015);
    return m;
  };

  // ── Lettering: every label of a scene is drawn into one shared sheet, so labels cost one draw call ───────────

  const SHEET = 2048;
  type Sheet = { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: T.CanvasTexture; material: T.MeshStandardMaterial; x: number; y: number; row: number };
  const sheets: Sheet[] = [];
  const cells = new Map<string, { sheet: Sheet; x: number; y: number; w: number; h: number }>();
  const labelFallback = hasDom ? null : mat(0xd8d8d2, 0, 0.7);
  const newSheet = (): Sheet => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SHEET;
    const tex = keep(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const material = keep(new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02, depthWrite: false, metalness: 0, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    material.name = "lettering";
    const sheet = { canvas, g: canvas.getContext("2d")!, tex, material, x: 0, y: 0, row: 0 };
    sheets.push(sheet);
    return sheet;
  };
  const cell = (key: string, pw: number, ph: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void) => {
    const hit = cells.get(key);
    if (hit) return hit;
    const pad = 6;
    let sheet = sheets[sheets.length - 1] ?? newSheet();
    if (sheet.x + pw + pad > SHEET) {
      sheet.x = 0;
      sheet.y += sheet.row + pad;
      sheet.row = 0;
    }
    if (sheet.y + ph + pad > SHEET) sheet = newSheet();
    const c = { sheet, x: sheet.x, y: sheet.y, w: pw, h: ph };
    sheet.x += pw + pad;
    sheet.row = Math.max(sheet.row, ph);
    sheet.g.save();
    sheet.g.translate(c.x, c.y);
    sheet.g.beginPath();
    sheet.g.rect(0, 0, pw, ph);
    sheet.g.clip();
    draw(sheet.g, pw, ph);
    sheet.g.restore();
    sheet.tex.needsUpdate = true;
    cells.set(key, c);
    return c;
  };
  /**
   * Our own drawing on a face: draw(g, W, H) paints a W × H pixel canvas that lands on a w × h m rectangle centred
   * on (x, y, z) on the surface. `key` names the drawing: the same key is drawn once and reused. Logos, badges, dials.
   */
  const art = (parent: T.Object3D, key: string, w: number, h: number, x: number, y: number, z: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, opts: FaceOpts & { px?: number } = {}): T.Mesh => {
    const geometry = new THREE.PlaneGeometry(w, h);
    let material: T.Material = labelFallback ?? M.white;
    if (hasDom) {
      const scale = Math.min(1, 1024 / (Math.max(w, h) * (opts.px ?? 1600)));
      const pw = Math.max(16, Math.round(w * (opts.px ?? 1600) * scale));
      const ph = Math.max(16, Math.round(h * (opts.px ?? 1600) * scale));
      const c = cell(`${key}|${pw}x${ph}`, pw, ph, draw);
      const u0 = c.x / SHEET, u1 = (c.x + c.w) / SHEET, v1 = 1 - c.y / SHEET, v0 = 1 - (c.y + c.h) / SHEET;
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2));
      material = c.sheet.material;
    }
    const m = orient(mesh(geometry, material, x, y, z, parent), opts.face, opts.tilt, opts.spin);
    m.castShadow = false;
    m.receiveShadow = true;
    m.renderOrder = 2;
    m.translateZ(0.0015);
    return m;
  };
  const spaced = (g: CanvasRenderingContext2D, text: string, em: number, size: number) => (em ? [...text].reduce((s, ch) => s + g.measureText(ch).width + em * size, -em * size) : g.measureText(text).width);
  /**
   * Lettering on a face: the text (one string, or lines) fitted into a w × h m rectangle centred on (x, y, z) on the
   * surface, in the maker's colours. bg null = straight on the paint. Maker and model names, panel legends, labels.
   */
  const decal = (parent: T.Object3D, text: string | string[], w: number, h: number, x: number, y: number, z: number, opts: DecalOpts = {}): T.Mesh => {
    const lines = Array.isArray(text) ? text : [text];
    const { color = "#1c1d1f", bg = null, weight = 700, italic = false, font = FONT.sans, spacing = 0, align = "center", border, radius = 0 } = opts;
    const pad = opts.pad ?? (bg ? 0.18 : 0.08);
    const key = `t|${lines.join("\n")}|${color}|${bg}|${weight}|${italic}|${font}|${spacing}|${align}|${pad}|${border}|${radius}`;
    return art(
      parent,
      key,
      w,
      h,
      x,
      y,
      z,
      (g, W, H) => {
        if (bg) {
          g.fillStyle = bg;
          const r = radius * H;
          g.beginPath();
          g.roundRect(0, 0, W, H, r);
          g.fill();
          if (border) {
            g.strokeStyle = border;
            g.lineWidth = Math.max(2, H * 0.04);
            g.beginPath();
            g.roundRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth, Math.max(0, r - g.lineWidth / 2));
            g.stroke();
          }
        }
        const p = pad * H;
        const lineH = (H - 2 * p) / lines.length;
        const set = (size: number) => (g.font = `${italic ? "italic " : ""}${weight} ${size}px ${font}`);
        // The largest size at which every line fits the width and its share of the height.
        let size = lineH * 0.92;
        set(size);
        const widest = Math.max(...lines.map((l) => spaced(g, l, spacing, size)), 1);
        size = Math.min(size, (size * (W - 2 * p)) / widest);
        set(size);
        g.fillStyle = color;
        g.textBaseline = "middle";
        lines.forEach((l, i) => {
          const tw = spaced(g, l, spacing, size);
          let tx = align === "left" ? p : align === "right" ? W - p - tw : (W - tw) / 2;
          const ty = p + lineH * (i + 0.5) + size * 0.04;
          if (!spacing) {
            g.textAlign = "left";
            g.fillText(l, tx, ty);
            return;
          }
          for (const ch of l) {
            g.fillText(ch, tx, ty);
            tx += g.measureText(ch).width + spacing * size;
          }
        });
      },
      opts,
    );
  };
  /** A warning label (yellow triangle, black header): w wide, 0.45 w high. kind picks the symbol. */
  const warning = (parent: T.Object3D, w: number, x: number, y: number, z: number, opts: FaceOpts & { kind?: "caution" | "voltage" | "hot" | "laser" | "hand"; text?: string } = {}): T.Mesh => {
    const kind = opts.kind ?? "caution";
    const text = opts.text ?? (kind === "voltage" ? "DANGER" : kind === "hot" ? "HOT SURFACE" : kind === "laser" ? "LASER" : kind === "hand" ? "KEEP HANDS CLEAR" : "CAUTION");
    return art(
      parent,
      `warn|${kind}|${text}`,
      w,
      w * 0.45,
      x,
      y,
      z,
      (g, W, H) => {
        g.fillStyle = "#f4f3ee";
        g.fillRect(0, 0, W, H);
        g.strokeStyle = "#1c1d1f";
        g.lineWidth = Math.max(2, H * 0.03);
        g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
        // The triangle with its symbol.
        const s = H * 0.78, cx = H * 0.52, top = H * 0.12;
        g.fillStyle = "#f2c21a";
        g.beginPath();
        g.moveTo(cx, top);
        g.lineTo(cx + s / 2, top + s * 0.87);
        g.lineTo(cx - s / 2, top + s * 0.87);
        g.closePath();
        g.fill();
        g.lineJoin = "round";
        g.stroke();
        g.fillStyle = g.strokeStyle = "#1c1d1f";
        const my = top + s * 0.58;
        if (kind === "voltage") {
          g.beginPath();
          g.moveTo(cx + s * 0.06, my - s * 0.26);
          g.lineTo(cx - s * 0.1, my + s * 0.02);
          g.lineTo(cx + s * 0.01, my + s * 0.02);
          g.lineTo(cx - s * 0.06, my + s * 0.22);
          g.lineTo(cx + s * 0.12, my - s * 0.06);
          g.lineTo(cx + s * 0.01, my - s * 0.06);
          g.closePath();
          g.fill();
        } else if (kind === "hot") {
          g.lineWidth = s * 0.05;
          for (const dx of [-0.11, 0, 0.11]) {
            g.beginPath();
            g.moveTo(cx + dx * s, my + s * 0.08);
            g.bezierCurveTo(cx + (dx - 0.07) * s, my - s * 0.02, cx + (dx + 0.07) * s, my - s * 0.12, cx + dx * s, my - s * 0.22);
            g.stroke();
          }
          g.fillRect(cx - s * 0.2, my + s * 0.13, s * 0.4, s * 0.05);
        } else if (kind === "laser") {
          g.lineWidth = s * 0.03;
          for (let k = 0; k < 12; k++) {
            const a = (k * Math.PI) / 6, r1 = s * (k % 2 ? 0.12 : 0.2);
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * s * 0.05, my + Math.sin(a) * s * 0.05);
            g.lineTo(cx + Math.cos(a) * r1, my + Math.sin(a) * r1);
            g.stroke();
          }
          g.beginPath();
          g.arc(cx, my, s * 0.05, 0, Math.PI * 2);
          g.fill();
        } else if (kind === "hand") {
          g.fillRect(cx - s * 0.2, my - s * 0.2, s * 0.4, s * 0.07);
          g.fillRect(cx - s * 0.2, my + s * 0.13, s * 0.4, s * 0.07);
          g.beginPath();
          g.roundRect(cx - s * 0.1, my - s * 0.07, s * 0.2, s * 0.14, s * 0.04);
          g.fill();
        } else {
          g.fillRect(cx - s * 0.03, my - s * 0.24, s * 0.06, s * 0.3);
          g.beginPath();
          g.arc(cx, my + s * 0.17, s * 0.04, 0, Math.PI * 2);
          g.fill();
        }
        // Header band and the two lines of small print.
        const tx = H * 1.08;
        g.fillStyle = kind === "voltage" ? "#d0281f" : "#f2c21a";
        g.fillRect(tx, H * 0.12, W - tx - H * 0.1, H * 0.34);
        g.fillStyle = kind === "voltage" ? "#ffffff" : "#1c1d1f";
        g.textBaseline = "middle";
        let size = H * 0.26;
        g.font = `800 ${size}px ${FONT.sans}`;
        size = Math.min(size, (size * (W - tx - H * 0.2)) / Math.max(1, g.measureText(text).width));
        g.font = `800 ${size}px ${FONT.sans}`;
        g.fillText(text, tx + H * 0.05, H * 0.3);
        g.fillStyle = "#1c1d1f";
        for (const [yy, ww] of [[0.6, 1], [0.76, 0.7]]) g.fillRect(tx, H * yy, (W - tx - H * 0.1) * ww, H * 0.07);
      },
      opts,
    );
  };
  /** The maker's rating plate: a silver plate with rivets, first line bold (maker), the rest small (model, serial, power). */
  const nameplate = (parent: T.Object3D, lines: string[], w: number, h: number, x: number, y: number, z: number, opts: FaceOpts & { bg?: string; color?: string } = {}): T.Mesh =>
    art(
      parent,
      `plate|${lines.join("\n")}|${opts.bg}|${opts.color}`,
      w,
      h,
      x,
      y,
      z,
      (g, W, H) => {
        g.fillStyle = opts.bg ?? "#c9ccce";
        g.fillRect(0, 0, W, H);
        g.strokeStyle = g.fillStyle = opts.color ?? "#1c1d1f";
        g.lineWidth = Math.max(1.5, H * 0.02);
        g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
        for (const [rx, ry] of [[0.12, 0.12], [0.12, 0.88], [-0.12, 0.12], [-0.12, 0.88]]) {
          g.beginPath();
          g.arc(rx > 0 ? H * rx : W + H * rx, H * ry, H * 0.03, 0, Math.PI * 2);
          g.fill();
        }
        const rowH = (H * 0.72) / Math.max(1, lines.length + 0.5);
        g.textBaseline = "middle";
        lines.forEach((l, i) => {
          let size = rowH * (i ? 0.72 : 1.1);
          g.font = `${i ? 500 : 800} ${size}px ${i ? FONT.mono : FONT.sans}`;
          size = Math.min(size, (size * (W - H * 0.5)) / Math.max(1, g.measureText(l).width));
          g.font = `${i ? 500 : 800} ${size}px ${i ? FONT.mono : FONT.sans}`;
          g.fillText(l, H * 0.25, H * 0.14 + rowH * (i ? i + 1 : 0.6));
        });
      },
      opts,
    );

  // ── Fittings ─────────────────────────────────────────────────────────────────────────────────────────────────

  const lampMaterial = (c: LampColor) => {
    const lens = new THREE.Color(LAMP[c]).lerp(new THREE.Color(0x55575a), 0.55).getHex();
    return ownMat(lens, 0.1, 0.35, { emissive: LAMP[c], emissiveIntensity: 0 });
  };
  /**
   * Signal tower standing on (x, y, z): base, pole, the lamp segments (bottom to top in `order`) and a cap. Returns
   * [green, amber, red], each with its own material (emissiveIntensity 0): the caller lights them.
   * share: the lamps of another tower of the same machine, to light both together.
   */
  const tower = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    opts: { pole?: number; r?: number; segH?: number; order?: LampColor[]; colors?: Partial<Record<LampColor, number>>; cap?: boolean; share?: T.Mesh[]; poleMat?: T.Material } = {},
  ): T.Mesh[] => {
    const { pole = 0.22, r = 0.03, segH = 0.055, order = ["green", "amber", "red"], cap = true } = opts;
    const g = group(parent, x, y, z);
    cyl(r * 1.15, 0.03, M.dark, 0, 0.015, 0, g, "y", 16);
    if (pole > 0) cyl(r * 0.36, pole, opts.poleMat ?? M.steel, 0, 0.03 + pole / 2, 0, g, "y", 10);
    cyl(r * 1.02, 0.02, M.dark, 0, 0.04 + pole, 0, g, "y", 16);
    const by: Partial<Record<LampColor, T.Mesh>> = {};
    order.forEach((c, i) => {
      const shared = opts.share?.[c === "green" ? 0 : c === "amber" ? 1 : c === "red" ? 2 : -1];
      const material = (shared?.material as T.MeshStandardMaterial | undefined) ?? lampMaterial(c);
      if (opts.colors?.[c] !== undefined && !shared) material.emissive.setHex(opts.colors[c]!);
      by[c] = cyl(r, segH - 0.004, material, 0, 0.05 + pole + segH * (i + 0.5), 0, g, "y", 16);
    });
    if (cap) cyl(r * 1.03, 0.014, M.dark, 0, 0.05 + pole + segH * order.length + 0.007, 0, g, "y", 16);
    // A machine always reports three lamps: a colour the real tower lacks gets a hidden one.
    return (["green", "amber", "red"] as const).map((c) => {
      if (by[c]) return by[c]!;
      const hidden = cyl(0.001, 0.001, lampMaterial(c), 0, 0.03, 0, g, "y", 3);
      hidden.visible = false;
      return hidden;
    });
  };
  /** Three pilot lamps in a row on a face (for a machine with no tower): returns [green, amber, red] with their own materials. */
  const pilots = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { r?: number; pitch?: number; vertical?: boolean } = {}): T.Mesh[] => {
    const { r = 0.011, pitch = 0.034, vertical = false } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    return (["green", "amber", "red"] as const).map((c, i) => {
      const o = (i - 1) * pitch;
      cyl(r * 1.25, 0.004, M.chrome, vertical ? 0 : o, vertical ? -o : 0, 0.002, g, "z", 14);
      return cyl(r, 0.012, lampMaterial(c), vertical ? 0 : o, vertical ? -o : 0, 0.008, g, "z", 14);
    });
  };

  const drawScreen = (g: CanvasRenderingContext2D, W: number, H: number, info: ScreenInfo, ui: ScreenUi) => {
    const s = Math.min(W / 512, H / 330);
    const ink = ui.ink ?? "#ecebe5", dim = ui.dim ?? "#b9b7b0";
    g.fillStyle = ui.bg ?? "#16191b";
    g.fillRect(0, 0, W, H);
    const col = info.state === "Running" ? "#3fa66b" : info.state === "Check failed" ? "#d2453b" : "#d8a531";
    g.fillStyle = col;
    g.fillRect(0, 0, W, 14 * s);
    g.textBaseline = "top";
    g.textAlign = "left";
    g.fillStyle = ink;
    g.font = `600 ${46 * s}px ${FONT.ui}`;
    g.fillText(info.name, 24 * s, 34 * s, W - 48 * s);
    g.fillStyle = col;
    g.font = `600 ${34 * s}px ${FONT.ui}`;
    g.fillText(info.state, 24 * s, 98 * s);
    g.font = `500 ${30 * s}px ${FONT.mono}`;
    [["Board", info.board], ["Cycle", info.cycle], ["Done", info.done]].forEach(([k, v], i) => {
      g.fillStyle = dim;
      g.fillText(k, 24 * s, (160 + i * 52) * s);
      g.fillStyle = ink;
      g.fillText(String(v), 200 * s, (160 + i * 52) * s);
    });
    // A tall screen has room left under the readout: the maker's title and a board outline.
    if (H > 330 * s + 60) {
      const y0 = 330 * s + 10;
      g.strokeStyle = dim;
      g.lineWidth = 2;
      g.strokeRect(24 * s, y0, W - 48 * s, H - y0 - 24 * s);
      g.fillStyle = dim;
      g.font = `600 ${22 * s}px ${FONT.ui}`;
      if (ui.title) g.fillText(ui.title, 36 * s, y0 + 12 * s);
      g.fillStyle = col;
      for (let i = 0; i < 6; i++) g.fillRect(40 * s + i * ((W - 80 * s) / 6), H - 60 * s - ((i * 37) % 5) * 12 * s, (W - 80 * s) / 9, 20 * s + ((i * 37) % 5) * 12 * s);
    }
  };
  /**
   * A monitor: the centre of a w × h m display at (x, y, z) on the surface it is mounted on, facing out of `face`.
   * depth = how thick the housing stands off the surface (0 = flush in a panel: glass and bezel only). The glass
   * shows the live readout the generic models have (draw(info)); ui recolours it for a maker's HMI. like = another
   * screen of the same machine whose picture this one repeats (costs nothing extra).
   */
  const screen = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { w?: number; h?: number; depth?: number; bezel?: T.Material; rim?: number; ui?: ScreenUi; like?: ScreenHandle } = {}): ScreenHandle => {
    const { w = 0.34, h = 0.22, depth = 0.03, rim = 0.014, ui = {} } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    const bezel = opts.bezel ?? M.screenBack;
    if (depth > 0) box(w + rim * 2, h + rim * 2, depth, bezel, 0, 0, depth / 2, g);
    else for (const [bw, bh, bx, by] of [[w + rim * 2, rim, 0, h / 2 + rim / 2], [w + rim * 2, rim, 0, -h / 2 - rim / 2], [rim, h, -w / 2 - rim / 2, 0], [rim, h, w / 2 + rim / 2, 0]]) box(bw, bh, 0.006, bezel, bx, by, 0.003, g);
    const W = 512, H = Math.max(256, Math.min(1024, Math.round((512 * h) / w)));
    let material: T.Material, canvas: HTMLCanvasElement | null = null, tex: T.CanvasTexture | null = null;
    if (opts.like) material = opts.like.face.material as T.Material;
    else if (hasDom) {
      canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      tex = keep(new THREE.CanvasTexture(canvas));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      material = ownMat(0xffffff, 0, 0.4, { map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 });
    } else material = ownMat(0x16191b, 0.1, 0.3);
    const face = mesh(new THREE.PlaneGeometry(w, h), material, 0, 0, depth + 0.0012, g);
    face.castShadow = false;
    const paintFn: ScreenHandle["paint"] = (fn) => {
      if (opts.like) return opts.like.paint(fn);
      if (!canvas || !tex) return;
      fn(canvas.getContext("2d")!, W, H);
      tex.needsUpdate = true;
    };
    const handle: ScreenHandle = { group: g, face, paint: paintFn, draw: (info) => (opts.like ? opts.like.draw(info) : paintFn((c, cw, ch) => drawScreen(c, cw, ch, info, ui))) };
    if (!opts.like) handle.draw({ name: "", state: "Waiting", board: "—", cycle: "—", done: "—" });
    return handle;
  };
  /** A keyboard lying at (x, y, z) (its underside centre), keys up. yaw turns it. */
  const keyboard = (parent: T.Object3D, x: number, y: number, z: number, opts: { w?: number; d?: number; yaw?: number; mouse?: boolean } = {}): T.Group => {
    const { w = 0.36, d = 0.13, yaw = 0, mouse = true } = opts;
    const g = group(parent, x, y, z);
    g.rotation.y = yaw;
    box(w, 0.016, d, M.black, 0, 0.008, 0, g);
    box(w - 0.02, 0.006, d - 0.03, M.dark, 0, 0.018, -0.004, g);
    if (mouse) rbox(0.055, 0.026, 0.095, 0.02, M.black, w / 2 + 0.07, 0.013, 0.005, g, "y");
    return g;
  };
  /** A shelf standing out of a face with a keyboard and a mouse on it: (x, y, z) is the middle of its edge on the surface, y its top. */
  const keyboardTray = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { w?: number; d?: number; mat?: T.Material; mouse?: boolean; brackets?: boolean } = {}): T.Group => {
    const { w = 0.5, d = 0.2, mouse = true, brackets = true } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    const m = opts.mat ?? M.grey;
    box(w, 0.012, d, m, 0, -0.006, d / 2, g);
    if (brackets) for (const s of [-1, 1]) profileX([[0, -0.012], [d * 0.8, -0.012], [0, -0.012 - d * 0.5]], 0.006, m, s * (w / 2 - 0.02), 0, 0, g);
    keyboard(g, mouse ? -0.05 : 0, 0, d / 2, { w: Math.min(0.36, w - (mouse ? 0.16 : 0.04)), d: Math.min(0.13, d - 0.03), mouse });
    return g;
  };
  /**
   * A monitor on an arm with a keyboard tray, as most SMT machines carry. (x, y, z) = where the arm's bracket is
   * bolted on the surface. reach = surface → the monitor's glass; rise = bracket → the centre of the screen;
   * shift = the screen's sideways offset (viewer's right +); yaw turns the monitor and tray about the post.
   * With the tray it stands out reach + trayD − 0.03 m, without it reach + 0.01 m (`out` in the result).
   */
  const monitorArm = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    opts: FaceOpts & { w?: number; h?: number; reach?: number; rise?: number; shift?: number; yaw?: number; lean?: number; tray?: boolean; trayW?: number; trayD?: number; drop?: number; mat?: T.Material; ui?: ScreenUi; bezel?: T.Material } = {},
  ): ScreenHandle & { out: number } => {
    const { w = 0.42, h = 0.3, reach = 0.26, rise = 0.3, shift = 0, yaw = 0, lean = 0.08, tray = true, trayW = 0.5, trayD = 0.2, drop = 0.24 } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    const m = opts.mat ?? M.dark;
    const pz = Math.max(0.05, reach - 0.06);
    box(0.07, 0.11, 0.012, m, 0, 0, 0.006, g);
    // Two links with a joint between them, then the post the monitor and the tray hang on.
    const jx = shift * 0.5, jz = pz * 0.55;
    for (const [ax, az, bx, bz] of [[0, 0.012, jx, jz], [jx, jz, shift, pz]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const link = box(0.03, 0.05, len, m, (ax + bx) / 2, 0, (az + bz) / 2, g);
      link.rotation.y = Math.atan2(bx - ax, bz - az);
    }
    cyl(0.02, 0.06, M.zinc, jx, 0, jz, g, "y", 12);
    const lo = tray ? -drop - 0.02 : -0.03;
    cyl(0.017, rise - lo, M.zinc, shift, (rise + lo) / 2, pz, g, "y", 12);
    const head = group(g, shift, 0, pz);
    head.rotation.y = yaw;
    box(0.1, 0.1, 0.02, m, 0, rise, 0.027, head);
    const s = screen(head, 0, rise, 0.037, { w, h, depth: 0.022, tilt: lean, ui: opts.ui, bezel: opts.bezel });
    if (tray) {
      box(0.05, 0.03, 0.06, m, 0, -drop - 0.015, 0.03, head);
      const t = group(head, 0, -drop, 0.02);
      box(trayW, 0.012, trayD, m, 0, -0.006, trayD / 2, t);
      keyboard(t, -0.05, 0, trayD / 2, { w: Math.min(0.36, trayW - 0.16), d: Math.min(0.13, trayD - 0.03) });
    }
    return { ...s, group: g, out: tray ? reach + trayD - 0.03 : reach + 0.01 };
  };
  /** Emergency stop on a face: the red mushroom on its yellow box (box false: on a yellow ring plate). */
  const estop = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { size?: number; box?: boolean } = {}): T.Group => {
    const { size = 0.07 } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    if (opts.box ?? true) box(size, size, size * 0.5, M.yellow, 0, 0, size * 0.25, g);
    else cyl(size * 0.5, 0.004, M.yellow, 0, 0, 0.002, g, "z", 20);
    const z0 = (opts.box ?? true) ? size * 0.5 : 0.004;
    cyl(size * 0.2, size * 0.2, M.dark, 0, 0, z0 + size * 0.1, g, "z", 14);
    cyl(size * 0.36, size * 0.16, M.red, 0, 0, z0 + size * 0.28, g, "z", 18, size * 0.3);
    return g;
  };
  /** Rotary main switch on a face: red handle on a yellow plate (color "black": black handle on a grey plate). */
  const mainSwitch = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { size?: number; color?: "red" | "black"; turn?: number } = {}): T.Group => {
    const { size = 0.08, color = "red", turn = 0.6 } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    box(size, size, 0.006, color === "red" ? M.yellow : M.grey, 0, 0, 0.003, g);
    cyl(size * 0.36, 0.014, color === "red" ? M.red : M.black, 0, 0, 0.013, g, "z", 18);
    const bar = box(size * 0.2, size * 0.86, 0.022, color === "red" ? M.red : M.black, 0, 0, 0.03, g);
    bar.rotation.z = turn;
    return g;
  };
  /** A push button or pilot light on a face. lit > 0 makes it glow. Returns the cap. */
  const button = (parent: T.Object3D, x: number, y: number, z: number, color: Hex, opts: FaceOpts & { r?: number; lit?: number; ring?: boolean } = {}): T.Mesh => {
    const { r = 0.014, ring = true } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    if (ring) cyl(r * 1.3, 0.005, M.chrome, 0, 0, 0.0025, g, "z", 14);
    return cyl(r, 0.012, opts.lit ? lit(color, opts.lit) : mat(color, 0.1, 0.45), 0, 0, 0.009, g, "z", 14);
  };
  /** A round pressure gauge on a face. */
  const gauge = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { r?: number } = {}): T.Group => {
    const { r = 0.025 } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    cyl(r, 0.02, M.dark, 0, 0, 0.01, g, "z", 18);
    cyl(r * 0.86, 0.002, M.white, 0, 0, 0.021, g, "z", 18);
    box(r * 0.08, r * 0.8, 0.002, M.red, 0, 0, 0.023, g).rotation.z = -0.7;
    return g;
  };
  /**
   * A door or drawer pull on a face, centred on (x, y, z). kind: "bar" (a round bar on two standoffs), "bow" (a flat
   * D-pull), "recess" (a black flush pull, as on oven doors), "knob". vertical turns it upright.
   */
  const handle = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { len?: number; kind?: "bar" | "bow" | "recess" | "knob"; vertical?: boolean; mat?: T.Material; out?: number } = {}): T.Group => {
    const { len = 0.16, kind = "bar", vertical = false, out = 0.035 } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, (opts.spin ?? 0) + (vertical ? Math.PI / 2 : 0));
    const m = opts.mat ?? (kind === "recess" ? M.black : M.steel);
    if (kind === "bar") {
      for (const s of [-1, 1]) cyl(0.006, out, m, s * (len / 2 - 0.012), 0, out / 2, g, "z", 8);
      cyl(0.008, len, m, 0, 0, out, g, "x", 10);
    } else if (kind === "bow") {
      for (const s of [-1, 1]) box(0.012, 0.018, out, m, s * (len / 2 - 0.006), 0, out / 2, g);
      box(len, 0.018, 0.006, m, 0, 0, out, g);
    } else if (kind === "recess") {
      box(len, len * 0.3, 0.004, m, 0, 0, 0.002, g);
      box(len * 0.82, len * 0.1, 0.006, M.void, 0, len * 0.04, 0.003, g);
    } else cyl(0.014, 0.022, m, 0, 0, 0.011, g, "z", 12);
    return g;
  };
  /** A hinge on a face, its pin upright (vertical false: lying). */
  const hinge = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { h?: number; vertical?: boolean; mat?: T.Material } = {}): T.Group => {
    const { h = 0.06, vertical = true } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, (opts.spin ?? 0) + (vertical ? 0 : Math.PI / 2));
    const m = opts.mat ?? M.zinc;
    box(0.03, h, 0.003, m, 0, 0, 0.0015, g);
    cyl(0.006, h, m, 0, 0, 0.006, g, "y", 8);
    return g;
  };
  /** A quarter-turn lock on a face. */
  const lock = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { r?: number } = {}): T.Group => {
    const { r = 0.012 } = opts;
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    cyl(r, 0.006, M.chrome, 0, 0, 0.003, g, "z", 12);
    box(r * 1.2, r * 0.25, 0.002, M.black, 0, 0, 0.007, g);
    return g;
  };
  /** Levelling foot standing on the floor at (x, z): pad, stud and lock nut up to the underside of the body at y = h. */
  const foot = (parent: T.Object3D, x: number, z: number, opts: { h?: number; r?: number; mat?: T.Material } = {}): T.Group => {
    const { h = 0.08, r = 0.035 } = opts;
    const g = group(parent, x, 0, z);
    const m = opts.mat ?? M.steel;
    cyl(r, 0.012, m, 0, 0.006, 0, g, "y", 16);
    cyl(r * 0.3, 0.014, m, 0, 0.019, 0, g, "y", 12, r * 0.85);
    cyl(r * 0.24, h - 0.026, m, 0, 0.026 + (h - 0.026) / 2, 0, g, "y", 8);
    cyl(r * 0.5, 0.012, M.zinc, 0, h - 0.014, 0, g, "y", 6);
    return g;
  };
  /** Swivel castor on the floor at (x, z), its top plate at y = h under a cart. */
  const castor = (parent: T.Object3D, x: number, z: number, opts: { h?: number; r?: number; yaw?: number; brake?: boolean; mat?: T.Material } = {}): T.Group => {
    const { h = 0.1, r = 0.0375, yaw = 0, brake = false } = opts;
    const g = group(parent, x, 0, z);
    g.rotation.y = yaw;
    box(0.06, 0.006, 0.06, M.zinc, 0, h - 0.003, 0, g);
    cyl(0.012, h - 2 * r - 0.004, M.zinc, 0, (h + 2 * r) / 2 - 0.004, 0, g, "y", 8);
    for (const s of [-1, 1]) box(0.004, r * 1.5, r * 1.1, M.zinc, s * 0.018, r * 1.35, r * 0.25, g);
    cyl(r, 0.026, opts.mat ?? M.rubber, 0, r, r * 0.35, g, "x", 16);
    cyl(r * 0.45, 0.03, M.grey, 0, r, r * 0.35, g, "x", 10);
    if (brake) box(0.03, 0.006, 0.03, M.red, 0, r * 2.05, r * 1.25, g);
    return g;
  };
  /** A seam between two panels or round a door: a thin dark line on a face, `len` long, centred on (x, y, z). */
  const seam = (parent: T.Object3D, x: number, y: number, z: number, len: number, opts: FaceOpts & { vertical?: boolean; w?: number; mat?: T.Material } = {}): T.Mesh => {
    const { vertical = false, w = 0.004 } = opts;
    const m = plane(vertical ? w : len, vertical ? len : w, opts.mat ?? M.seam, x, y, z, parent, opts.face, opts.tilt);
    m.translateZ(0.001);
    return m;
  };
  /**
   * A door or a removable panel drawn on a face: its outline seam (w × h centred on (x, y, z)), a pull near one edge,
   * hinges on the other, a lock. handle "none" for a bolted panel.
   */
  const door = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    opts: FaceOpts & { handle?: "bar" | "bow" | "recess" | "knob" | "none"; handleSide?: -1 | 1; handleAt?: number; handleLen?: number; handleVertical?: boolean; hinges?: boolean; lock?: boolean; seamMat?: T.Material } = {},
  ): T.Group => {
    const { handleSide = 1, handleAt = 0, handleLen = 0.14, hinges = true } = opts;
    const kind = opts.handle ?? "recess";
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    for (const s of [-1, 1]) {
      seam(g, 0, (s * h) / 2, 0, w, { mat: opts.seamMat });
      seam(g, (s * w) / 2, 0, 0, h, { vertical: true, mat: opts.seamMat });
    }
    if (kind !== "none") handle(g, handleSide * (w / 2 - (opts.handleVertical ? 0.04 : handleLen / 2 + 0.03)), handleAt, 0, { kind, len: handleLen, vertical: opts.handleVertical });
    if (hinges) for (const s of [-1, 1]) hinge(g, -handleSide * (w / 2 - 0.004), s * (h / 2 - Math.min(0.12, h * 0.2)), 0, { h: Math.min(0.06, h * 0.2) });
    if (opts.lock) lock(g, handleSide * (w / 2 - 0.04), handleAt + Math.min(0.12, h * 0.25), 0);
    return g;
  };
  /** A louvred vent on a face: a dark opening w × h centred on (x, y, z) with slanted slats. */
  const louvre = (parent: T.Object3D, x: number, y: number, z: number, w: number, h: number, opts: FaceOpts & { slats?: number; mat?: T.Material; frame?: T.Material | null; depth?: number } = {}): T.Group => {
    const depth = opts.depth ?? 0.012;
    const n = opts.slats ?? Math.max(3, Math.round(h / 0.02));
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    const m = opts.mat ?? M.dark;
    plane(w, h, M.void, 0, 0, 0.001, g);
    for (let i = 0; i < n; i++) box(w - 0.006, 0.003, depth * 1.3, m, 0, -h / 2 + ((i + 0.5) * h) / n, depth * 0.5, g).rotation.x = 0.7;
    const f = opts.frame === undefined ? m : opts.frame;
    if (f) {
      for (const s of [-1, 1]) {
        box(w + 0.012, 0.008, depth, f, 0, s * (h / 2 + 0.002), depth / 2, g);
        box(0.008, h + 0.012, depth, f, s * (w / 2 + 0.002), 0, depth / 2, g);
      }
    }
    return g;
  };
  /** A round fan outlet with its wire guard on a face. */
  const fan = (parent: T.Object3D, x: number, y: number, z: number, r: number, opts: FaceOpts & { mat?: T.Material } = {}): T.Group => {
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    const m = opts.mat ?? M.zinc;
    cyl(r, 0.002, M.void, 0, 0, 0.001, g, "z", 24);
    cyl(r * 0.28, 0.012, M.dark, 0, 0, 0.006, g, "z", 12);
    for (const k of [0.45, 0.72, 1]) torus(r * k, 0.003, m, 0, 0, 0.012, g, "z", 24);
    for (const a of [0, Math.PI / 2]) box(r * 2, 0.005, 0.003, m, 0, 0, 0.013, g).rotation.z = a;
    return g;
  };
  /** Slotted cable trunking, `len` long along axis, centred on (x, y, z). */
  const duct = (parent: T.Object3D, x: number, y: number, z: number, len: number, opts: { axis?: Axis; w?: number; h?: number; mat?: T.Material } = {}): T.Group => {
    const { axis = "x", w = 0.06, h = 0.06 } = opts;
    const g = group(parent, x, y, z);
    if (axis === "y") g.rotation.z = Math.PI / 2;
    if (axis === "z") g.rotation.y = -Math.PI / 2;
    const m = opts.mat ?? M.grey;
    box(len, h, w, m, 0, 0, 0, g);
    box(len, 0.004, w + 0.004, M.white, 0, h / 2 + 0.002, 0, g);
    const n = Math.max(2, Math.floor(len / 0.025));
    for (let i = 0; i < n; i++) plane(0.006, h * 0.5, M.seam, -len / 2 + ((i + 0.5) * len) / n, -h * 0.08, w / 2 + 0.0008, g);
    return g;
  };
  /** An exhaust outlet standing on (x, y, z): a collar and a duct going up by h (flex: a corrugated hose, as to the plant's extraction). */
  const stack = (parent: T.Object3D, x: number, y: number, z: number, r: number, h: number, opts: { flex?: boolean; mat?: T.Material } = {}): T.Group => {
    const g = group(parent, x, y, z);
    const m = opts.mat ?? M.zinc;
    cyl(r + 0.02, 0.04, m, 0, 0.02, 0, g, "y", 20);
    cyl(r, h - 0.04, opts.flex === false ? m : M.alu, 0, 0.04 + (h - 0.04) / 2, 0, g, "y", 20);
    if (opts.flex !== false) for (let yy = 0.07; yy < h - 0.01; yy += 0.045) cyl(r + 0.006, 0.012, M.alu, 0, yy, 0, g, "y", 16);
    cyl(r * 0.92, 0.002, M.void, 0, h + 0.0012, 0, g, "y", 20);
    return g;
  };
  /** Air service unit on a face: filter-regulator with its bowl, knob and gauge, and the tube stubs. */
  const airUnit = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { size?: number } = {}): T.Group => {
    const s = opts.size ?? 1;
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    box(0.05 * s, 0.05 * s, 0.045 * s, M.alu, 0, 0, 0.0225 * s, g);
    cyl(0.018 * s, 0.035 * s, M.dark, 0, 0.042 * s, 0.0225 * s, g, "y", 12);
    cyl(0.02 * s, 0.07 * s, M.reelClear, 0, -0.06 * s, 0.0225 * s, g, "y", 12);
    cyl(0.021 * s, 0.012 * s, M.dark, 0, -0.1 * s, 0.0225 * s, g, "y", 12);
    gauge(g, 0, 0, 0.045 * s, { r: 0.017 * s });
    for (const k of [-1, 1]) cyl(0.006 * s, 0.05 * s, M.black, k * 0.05 * s, 0, 0.0225 * s, g, "x", 8);
    return g;
  };
  /** A photo-electric sensor: a small block with its lens looking along `face`, at (x, y, z). */
  const sensor = (parent: T.Object3D, x: number, y: number, z: number, opts: FaceOpts & { mat?: T.Material } = {}): T.Group => {
    const g = on(parent, opts.face, x, y, z, opts.tilt, opts.spin);
    box(0.012, 0.03, 0.02, opts.mat ?? M.dark, 0, 0, 0.01, g);
    cyl(0.004, 0.002, lit(0xe23a2e, 0.6), 0, 0.006, 0.021, g, "z", 8);
    return g;
  };
  /** A piece of aluminium profile (T-slot extrusion), `len` long along axis, centred on (x, y, z). */
  const extrusion = (parent: T.Object3D, len: number, x: number, y: number, z: number, opts: { axis?: Axis; size?: number; mat?: T.Material; slots?: boolean } = {}): T.Group => {
    const { axis = "x", size = 0.04, slots = true } = opts;
    const g = group(parent, x, y, z);
    if (axis === "y") g.rotation.z = Math.PI / 2;
    if (axis === "z") g.rotation.y = -Math.PI / 2;
    box(len, size, size, opts.mat ?? M.alu, 0, 0, 0, g);
    if (slots)
      for (const [fy, fz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const s = box(len - 0.002, fy ? 0.0012 : size * 0.2, fz ? 0.0012 : size * 0.2, M.seam, 0, (fy * size) / 2, (fz * size) / 2, g);
        s.castShadow = false;
      }
    return g;
  };
  /** An energy chain (drag chain) laid from a to b in the parent's frame: a row of links. */
  const cableChain = (parent: T.Object3D, a: Pt3, b: Pt3, opts: { w?: number; h?: number; mat?: T.Material } = {}): T.Group => {
    const { w = 0.035, h = 0.018 } = opts;
    const g = group(parent, a[0], a[1], a[2]);
    const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = v.length();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), v.normalize());
    const n = Math.max(1, Math.round(len / 0.024));
    const parts = Array.from({ length: n }, (_, i) => new THREE.BoxGeometry((len / n) * 0.82, h, w).translate((len * (i + 0.5)) / n, 0, 0));
    const merged = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    mesh(merged, opts.mat ?? M.black, 0, 0, 0, g);
    return g;
  };

  // ── The conveyor: the same rails and belts in every machine ──────────────────────────────────────────────────

  /**
   * The board transport through a machine: two rails with their belts, the belt tops at y = cy, centred on z = 0 and
   * on x, running the whole `length` plus `overhang` at each end so that neighbours meet. Call it with the body's
   * full length in every builder: the line then reads as one conveyor.
   */
  const conveyorRails = (
    parent: T.Object3D,
    length: number,
    cy: number,
    opts: { x?: number; gap?: number; overhang?: number; rail?: T.Material; belt?: T.Material; trim?: T.Material | null; pulleys?: boolean } = {},
  ): { group: T.Group; gap: number; x0: number; x1: number; y: number } => {
    const { x = 0, gap = RAIL.gap, overhang = RAIL.overhang, pulleys = true } = opts;
    const L = length + overhang * 2;
    const g = group(parent, x, 0, 0);
    g.userData.kit = "rails";
    g.userData.rails = { x0: x - L / 2, x1: x + L / 2, y: cy, gap };
    const rail = opts.rail ?? M.alu, belt = opts.belt ?? M.belt;
    for (const s of [-1, 1]) {
      box(L, RAIL.railH, RAIL.railT, rail, 0, cy + RAIL.lip - RAIL.railH / 2, s * (gap / 2 + RAIL.railT / 2), g);
      box(L, 0.012, 0.012, rail, 0, cy - 0.009, s * (gap / 2 - 0.006), g);
      box(L - 0.012, 0.003, 0.009, belt, 0, cy - 0.0015, s * (gap / 2 - 0.0055), g);
      if (opts.trim) box(L, 0.003, RAIL.railT, opts.trim, 0, cy + RAIL.lip + 0.0015, s * (gap / 2 + RAIL.railT / 2), g);
      if (pulleys) for (const e of [-1, 1]) cyl(0.012, 0.01, M.dark, e * (L / 2 - 0.014), cy - 0.014, s * (gap / 2 - 0.006), g, "z", 12);
    }
    return { group: g, gap, x0: x - L / 2, x1: x + L / 2, y: cy };
  };
  /**
   * The board opening drawn on a solid end face: a dark slot with a frame at pass height. side "left" = the entry end,
   * "right" = the exit; xFace = that face's x. For a hollow cover use endWall(), which leaves a real hole.
   */
  const opening = (parent: T.Object3D, side: "left" | "right", xFace: number, cy: number, opts: { w?: number; h?: number; z?: number; frame?: T.Material | null } = {}): T.Group => {
    const { w = RAIL.openW, h = RAIL.openH, z = 0 } = opts;
    const g = on(parent, side, xFace, cy - 0.035 + h / 2, z);
    plane(w, h, M.void, 0, 0, 0.0012, g);
    const f = opts.frame === undefined ? M.dark : opts.frame;
    if (f)
      for (const s of [-1, 1]) {
        box(w + 0.02, 0.01, 0.006, f, 0, s * (h / 2 + 0.005), 0.003, g);
        box(0.01, h, 0.006, f, s * (w / 2 + 0.005), 0, 0.003, g);
      }
    return g;
  };
  /**
   * An end wall of a cover with a real board opening in it: the wall's OUTER face at x, spanning zBack..zFront and
   * y0..y1, t thick, with a w × h hole at pass height round z. side "left" = the entry end, "right" = the exit.
   */
  const endWall = (
    parent: T.Object3D,
    side: "left" | "right",
    x: number,
    o: { zFront: number; zBack: number; y0: number; y1: number; cy: number; mat: T.Material; t?: number; w?: number; h?: number; z?: number; frame?: T.Material | null },
  ): T.Group => {
    const { t = 0.02, w = RAIL.openW, h = RAIL.openH, z = 0 } = o;
    const g = group(parent);
    const xc = side === "right" ? x - t / 2 : x + t / 2;
    const hy0 = Math.max(o.y0, o.cy - 0.035), hy1 = Math.min(o.y1, hy0 + h);
    const zc = (o.zFront + o.zBack) / 2, d = o.zFront - o.zBack;
    if (hy0 > o.y0) box(t, hy0 - o.y0, d, o.mat, xc, (hy0 + o.y0) / 2, zc, g);
    if (o.y1 > hy1) box(t, o.y1 - hy1, d, o.mat, xc, (o.y1 + hy1) / 2, zc, g);
    if (o.zFront > z + w / 2) box(t, hy1 - hy0, o.zFront - z - w / 2, o.mat, xc, (hy0 + hy1) / 2, (o.zFront + z + w / 2) / 2, g);
    if (z - w / 2 > o.zBack) box(t, hy1 - hy0, z - w / 2 - o.zBack, o.mat, xc, (hy0 + hy1) / 2, (o.zBack + z - w / 2) / 2, g);
    const f = o.frame === undefined ? M.dark : o.frame;
    if (f) {
      const out = side === "right" ? x + 0.002 : x - 0.002;
      for (const s of [-1, 1]) {
        box(0.004, 0.01, w + 0.02, f, out, s > 0 ? hy1 + 0.005 : hy0 - 0.005, z, g);
        box(0.004, hy1 - hy0, 0.01, f, out, (hy0 + hy1) / 2, z + s * (w / 2 + 0.005), g);
      }
    }
    return g;
  };
  /**
   * A hollow cover from panels, with real board openings in both end walls: spans x ±l/2, zBack..zFront, y0..y1.
   * faces: which panels to build (leave "front" out to glaze it yourself). open false = closed end walls.
   */
  const shell = (
    parent: T.Object3D,
    o: { l: number; zFront: number; zBack: number; y0: number; y1: number; cy: number; mat: T.Material; t?: number; faces?: Face[]; open?: boolean; openW?: number; openH?: number; x?: number },
  ): T.Group => {
    const { t = 0.02, faces = ["front", "back", "left", "right", "top"], open = true, x = 0 } = o;
    const g = group(parent, x, 0, 0);
    const d = o.zFront - o.zBack, zc = (o.zFront + o.zBack) / 2, hh = o.y1 - o.y0, yc = (o.y0 + o.y1) / 2;
    if (faces.includes("front")) box(o.l, hh, t, o.mat, 0, yc, o.zFront - t / 2, g);
    if (faces.includes("back")) box(o.l, hh, t, o.mat, 0, yc, o.zBack + t / 2, g);
    if (faces.includes("top")) box(o.l, t, d, o.mat, 0, o.y1 - t / 2, zc, g);
    if (faces.includes("bottom")) box(o.l, t, d, o.mat, 0, o.y0 + t / 2, zc, g);
    for (const side of ["left", "right"] as const) {
      if (!faces.includes(side)) continue;
      const xf = side === "right" ? o.l / 2 : -o.l / 2;
      if (open) endWall(g, side, xf, { zFront: o.zFront, zBack: o.zBack, y0: o.y0, y1: o.y1, cy: o.cy, mat: o.mat, t, w: o.openW, h: o.openH });
      else box(t, hh, d, o.mat, side === "right" ? xf - t / 2 : xf + t / 2, yc, zc, g);
    }
    return g;
  };
  /** A populated board to carry through the machine: a group whose origin is the middle of the board's underside. Put it at y = cy and move it in update(). */
  const pcb = (parent: T.Object3D, opts: { l?: number; w?: number; color?: Hex } = {}): T.Group => {
    const { l = 0.2, w = RAIL.gap - 0.012 } = opts;
    const g = group(parent);
    box(l, 0.0016, w, opts.color !== undefined ? mat(opts.color, 0.1, 0.55) : M.pcb, 0, 0.0008, 0, g);
    const parts: T.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const s = 0.012 + ((i * 7) % 4) * 0.006;
      parts.push(new THREE.BoxGeometry(s, 0.003 + (i % 3) * 0.002, s * (i % 2 ? 1 : 0.6)).translate((((i * 37) % 9) / 9 - 0.45) * l * 0.85, 0.0035, (((i * 53) % 7) / 7 - 0.42) * w * 0.8));
    }
    const merged = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    mesh(merged, M.black, 0, 0, 0, g);
    return g;
  };

  // ── Feeders and reels: a bank of any size in a handful of meshes ─────────────────────────────────────────────

  const bake = (parent: T.Object3D, material: T.Material, parts: T.BufferGeometry[]): T.Mesh | null => {
    if (!parts.length) return null;
    const merged = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return mesh(merged, material, 0, 0, 0, parent);
  };
  /**
   * A row of tape reels on a common axis along x, centred on (x, y, z). lean tips them (radians, about x). colors:
   * the reel materials, cycled. One mesh per colour however many reels.
   */
  const reelRow = (parent: T.Object3D, x: number, y: number, z: number, opts: { count: number; pitch?: number; r?: number; w?: number; lean?: number; colors?: T.Material[]; hub?: T.Material; fill?: (i: number) => boolean }): T.Group => {
    const { count, pitch = 0.017, r = 0.089, lean = 0 } = opts;
    const w = opts.w ?? Math.min(0.012, pitch * 0.62);
    const colors = opts.colors ?? [M.reelWhite, M.reelWhite, M.reelBlack];
    const g = group(parent, x, y, z);
    g.rotation.x = lean;
    const by = colors.map(() => [] as T.BufferGeometry[]);
    const hubs: T.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      if (opts.fill && !opts.fill(i)) continue;
      const px = (i - (count - 1) / 2) * pitch;
      by[(i * 7 + (i >> 2)) % colors.length].push(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2).translate(px, 0, 0));
      hubs.push(new THREE.CylinderGeometry(r * 0.3, r * 0.3, w + 0.002, 8).rotateZ(Math.PI / 2).translate(px, 0, 0));
    }
    by.forEach((parts, i) => bake(g, colors[i], parts));
    bake(g, opts.hub ?? M.dark, hubs);
    return g;
  };
  /**
   * A bank of tape feeders side by side along x. (x, y, z) = the middle of the bank at the PICK end, y the top of the
   * feeder bodies. They run out by `len` towards dir (+1 = the operator's side, −1 = the back); each carries its reel
   * hanging at the outer end (reels false: none, e.g. when the cart holds them in a rack: use reelRow). A handful of
   * meshes however many feeders. Returns the group, the bank's width and how far it stands out.
   */
  const feederBank = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    opts: { count: number; pitch?: number; len?: number; h?: number; dir?: 1 | -1; reels?: boolean; reelR?: number; drop?: number; body?: T.Material; cover?: T.Material; clip?: T.Material; colors?: T.Material[]; fill?: (i: number) => boolean },
  ): { group: T.Group; width: number; out: number } => {
    const { count, pitch = 0.017, len = 0.4, h = 0.085, dir = 1, reels = true, reelR = 0.089, drop = 0.13 } = opts;
    const g = group(parent, x, y, z);
    if (dir < 0) g.rotation.y = Math.PI;
    const bw = Math.max(0.006, pitch * 0.8);
    const bodies: T.BufferGeometry[] = [], covers: T.BufferGeometry[] = [], clips: T.BufferGeometry[] = [], arms: T.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      if (opts.fill && !opts.fill(i)) continue;
      const px = (i - (count - 1) / 2) * pitch;
      bodies.push(new THREE.BoxGeometry(bw, h, len).translate(px, -h / 2, len / 2));
      covers.push(new THREE.BoxGeometry(bw * 0.7, 0.004, len * 0.55).translate(px, 0.002, len * 0.32));
      clips.push(new THREE.BoxGeometry(bw, 0.03, 0.03).translate(px, 0.012, len - 0.015));
      if (reels) arms.push(new THREE.BoxGeometry(bw * 0.5, drop, 0.012).translate(px, -h - drop / 2 + 0.01, len - 0.02));
    }
    bake(g, opts.body ?? M.dark, [...bodies, ...arms]);
    bake(g, opts.cover ?? M.zinc, covers);
    bake(g, opts.clip ?? M.black, clips);
    if (reels) reelRow(g, 0, -h - drop, len + reelR * 0.35, { count, pitch, r: reelR, colors: opts.colors, fill: opts.fill });
    return { group: g, width: count * pitch, out: reels ? len + reelR * 1.35 : len };
  };

  // ── Smoke: one mesh per source, its puffs facing the camera ──────────────────────────────────────────────────

  let puff: T.CanvasTexture | null = null;
  /**
   * Soft puffs rising from (x, y, z), drifting and fading over their life. Returns update(clock, strength 0..1): call
   * it from the machine's update with the wall clock. One draw call. Vapour is not held to the machine's box, but keep
   * rise + grow under ~0.6 m. Nothing in node.
   */
  const smoke = (parent: T.Object3D, x: number, y: number, z: number, opts: { count?: number; life?: number; rise?: number; drift?: number; start?: number; grow?: number; opacity?: number; tint?: Hex } = {}): { update: (clock: number, strength?: number) => void } => {
    if (!hasDom) return { update() {} };
    const { count = 14, life = 3.5, rise = 0.45, drift = 0.12, start = 0.05, grow = 0.22, opacity = 0.4, tint = 0xe9e8e4 } = opts;
    if (!puff) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d")!;
      const r = g.createRadialGradient(64, 64, 2, 64, 64, 64);
      r.addColorStop(0, "rgba(255,255,255,.95)");
      r.addColorStop(0.45, "rgba(255,255,255,.45)");
      r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
      puff = keep(new THREE.CanvasTexture(c));
      puff.colorSpace = THREE.SRGBColorSpace;
    }
    const pos = new Float32Array(count * 12), col = new Float32Array(count * 16), uv = new Float32Array(count * 8), idx: number[] = [];
    const tc = new THREE.Color(tint as T.ColorRepresentation);
    for (let i = 0; i < count; i++) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      for (let k = 0; k < 4; k++) col.set([tc.r, tc.g, tc.b, 0], i * 16 + k * 4);
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(col, 4));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(idx);
    const m = new THREE.Mesh(geometry, keep(new THREE.MeshBasicMaterial({ map: puff, vertexColors: true, transparent: true, depthWrite: false })));
    m.position.set(x, y, z);
    m.frustumCulled = false;
    m.renderOrder = 5;
    m.userData.fx = true;
    m.raycast = () => {};
    parent.add(m);
    let now = 0, power = 0;
    const right = new THREE.Vector3(), up = new THREE.Vector3(), inv = new THREE.Matrix3(), world = new THREE.Matrix4();
    // Laid out when drawn: the puffs turn to whichever camera is rendering.
    m.onBeforeRender = (_r, _s, camera) => {
      inv.setFromMatrix4(world.copy(m.matrixWorld).invert());
      right.setFromMatrixColumn(camera.matrixWorld, 0).applyMatrix3(inv).normalize();
      up.setFromMatrixColumn(camera.matrixWorld, 1).applyMatrix3(inv).normalize();
      for (let i = 0; i < count; i++) {
        const seed = ((i * 7919) % 97) / 97;
        const a = (((now / life + i / count) % 1) + 1) % 1, e = 1 - (1 - a) * (1 - a);
        const cx = drift * e + Math.sin((now + seed * 9) * 1.3) * 0.03 * a, cy2 = rise * e, cz = (seed - 0.5) * 0.1 * a;
        const s = (start + grow * a) / 2, alpha = power * opacity * Math.min(1, a * 6) * (1 - a);
        for (let k = 0; k < 4; k++) {
          const sx = k === 0 || k === 3 ? -s : s, sy = k < 2 ? -s : s, o = i * 12 + k * 3;
          pos[o] = cx + right.x * sx + up.x * sy;
          pos[o + 1] = cy2 + right.y * sx + up.y * sy;
          pos[o + 2] = cz + right.z * sx + up.z * sy;
          col[i * 16 + k * 4 + 3] = alpha;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    };
    return {
      update: (clock, strength = 1) => {
        now = clock;
        power = strength;
        m.visible = strength > 0;
      },
    };
  };

  // ── Sealing: what does not move becomes one mesh per material ────────────────────────────────────────────────

  const isMesh = (o: T.Object3D): o is T.Mesh => (o as T.Mesh).isMesh === true && !(o as T.InstancedMesh).isInstancedMesh && !(o as T.SkinnedMesh).isSkinnedMesh;
  const tmpM = new THREE.Matrix4();
  /**
   * Call once, when the machine is built: seal(root, [every group or mesh that update() moves, shows or hides]).
   * The meshes that stay put are merged by material into one mesh each (inside root); each moving group is merged the
   * same way inside itself, so a head with twenty nozzles is still one or two draw calls. Lamps, screens and anything
   * with a material of its own stay as they are. After sealing, only move what you listed.
   */
  const seal = (root: T.Object3D, moving: T.Object3D[] = []): { drawCalls: number; triangles: number } => {
    root.updateMatrixWorld(true);
    const spent = new Set<T.BufferGeometry>();
    const frames = new Set<T.Object3D>([root, ...moving]);
    const buckets = new Map<T.Object3D, Map<string, T.Mesh[]>>();
    const walk = (o: T.Object3D, frame: T.Object3D, shown: boolean) => {
      const f = frames.has(o) ? o : frame;
      const vis = f === o ? true : shown && o.visible;
      if (o !== f && vis && isMesh(o) && !Array.isArray(o.material) && !o.userData.fx && !o.userData.keep) {
        const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
        const map = buckets.get(f) ?? buckets.set(f, new Map()).get(f)!;
        (map.get(key) ?? map.set(key, []).get(key)!).push(o);
      }
      for (const c of o.children) walk(c, f, vis);
    };
    walk(root, root, true);
    for (const [frame, map] of buckets) {
      const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
      for (const list of map.values()) {
        const first = list[0];
        if (list.length === 1) {
          // Alone in its material: keep the mesh (a lamp, a screen), straight under its frame.
          if (first.parent !== frame) frame.attach(first);
          continue;
        }
        const parts = list.map((m) => {
          const g = m.geometry.clone();
          for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
          if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          if (!g.attributes.normal) g.computeVertexNormals();
          if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
          g.clearGroups();
          tmpM.multiplyMatrices(inv, m.matrixWorld);
          g.applyMatrix4(tmpM);
          if (tmpM.determinant() < 0) {
            // A mirrored part: turn its triangles back to face out.
            const ix = g.index!;
            for (let i = 0; i < ix.count; i += 3) {
              const a = ix.getX(i);
              ix.setX(i, ix.getX(i + 2));
              ix.setX(i + 2, a);
            }
          }
          return g;
        });
        const merged = mergeGeometries(parts, false);
        parts.forEach((p) => p.dispose());
        if (!merged) continue;
        const out = new THREE.Mesh(keep(merged), first.material);
        out.castShadow = first.castShadow;
        out.receiveShadow = first.receiveShadow;
        out.renderOrder = first.renderOrder;
        out.name = `sealed:${(first.material as T.Material).name || (first.material as T.MeshStandardMaterial).color?.getHexString?.() || "mesh"}`;
        frame.add(out);
        for (const m of list) {
          m.parent?.remove(m);
          spent.add(m.geometry);
        }
      }
    }
    // The merged parts' own geometry is no longer needed, unless a mesh that stayed shares it.
    root.traverse((o) => {
      if ((o as T.Mesh).isMesh) spent.delete((o as T.Mesh).geometry);
    });
    for (const g of spent) if (owned.has(g)) drop(g);
    // Groups that held only merged meshes are empty now.
    const prune = (o: T.Object3D) => {
      for (const c of [...o.children]) {
        prune(c);
        if (!c.children.length && (c as T.Group).isGroup && !frames.has(c) && !c.userData.kit) o.remove(c);
      }
    };
    prune(root);
    // What is left of the still part never moves again: spare the renderer its matrix updates.
    root.updateMatrixWorld(true);
    const freeze = (o: T.Object3D) => {
      for (const c of o.children) {
        if (frames.has(c)) continue;
        c.updateMatrix();
        c.matrixAutoUpdate = false;
        freeze(c);
      }
    };
    freeze(root);
    const s = stats(root);
    return { drawCalls: s.drawCalls, triangles: s.triangles };
  };
  /** What a machine costs to draw, and its exact bounding box in the scene (vapour left out). */
  const stats = (root: T.Object3D): Stats => {
    root.updateMatrixWorld(true);
    let drawCalls = 0, triangles = 0;
    const b = new THREE.Box3(), v = new THREE.Vector3();
    const walk = (o: T.Object3D) => {
      if (!o.visible) return;
      const m = o as T.Mesh;
      if (m.isMesh || (o as T.Points).isPoints || (o as T.Line).isLine || (o as T.Sprite).isSprite) {
        drawCalls += Array.isArray(m.material) ? m.material.length : 1;
        const g = m.geometry as T.BufferGeometry | undefined;
        if (m.isMesh && g) {
          const n = (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
          triangles += n * ((o as T.InstancedMesh).isInstancedMesh ? (o as T.InstancedMesh).count : 1);
          const at = g.attributes.position;
          if (!o.userData.fx && at) for (let i = 0; i < at.count; i++) b.expandByPoint(v.fromBufferAttribute(at, i).applyMatrix4(o.matrixWorld));
        }
      }
      for (const c of o.children) walk(c);
    };
    walk(root);
    return { drawCalls, triangles: Math.round(triangles), box: b };
  };

  const dispose = () => {
    owned.forEach((x) => x.dispose());
    owned.clear();
    mats.clear();
    cells.clear();
    sheets.length = 0;
    puff = null;
  };

  return {
    THREE, RAIL, BUDGET, FONT, M,
    keep, mat, ownMat, paint, glass, lit,
    add, mesh, group, orient, on,
    box, rbox, cyl, sphere, torus, pipe, plane, poly, arc, profileX, profileY, profileZ, bendX, bendZ,
    art, decal, warning, nameplate,
    tower, pilots, screen, monitorArm, keyboard, keyboardTray, estop, mainSwitch, button, gauge,
    handle, hinge, lock, foot, castor, seam, door, louvre, fan, duct, stack, airUnit, sensor, extrusion, cableChain,
    conveyorRails, opening, endWall, shell, pcb,
    reelRow, feederBank, smoke,
    seal, stats, dispose,
  };
}

export type Kit = ReturnType<typeof createKit>;
