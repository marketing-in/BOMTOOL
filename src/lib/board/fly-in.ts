import type { MatchStatus } from "@/lib/board/footprint-match";
import { sweepOrder } from "@/lib/board/placement-film";

/**
 * The footprint check in 3D (BoM step 3): when the board comes into view every part flies in from above and lands on
 * its pads in a quick sweep (about 2–4 s whatever the part count), settles, and stays. Then each designator shows its
 * result: a match glows green for a moment, "check by eye" keeps an ochre outline, a mismatch blinks red, a part with
 * no BoM line leaves bare pads in a dotted red outline, and a BoM designator with no place waits in the feeder strip.
 *
 * Pure: the order, when each part sets off and lands, and how it looks at any moment t, so the settled board (or any
 * moment of the fly-in) can be drawn directly. The board studio (src/vendor/circuitflow/studio/Board.jsx) turns these
 * numbers into motion. Time in seconds; positions in the placement frame (mm, y up).
 */

/** What a result does on the 3D board. */
export type Treatment = "glow" | "outline" | "blink" | "bare" | "feeder";

export const TREATMENT: Record<MatchStatus, Treatment> = {
  match: "glow",
  check: "outline",
  mismatch: "blink",
  "not-in-bom": "bare",
  "not-on-board": "feeder",
};

/** A designator's result and where it sits (x and y null: no place on the board). */
export type FlyRef = { ref: string; status: MatchStatus; x: number | null; y: number | null; side: string | null };

export type FlyPart = {
  ref: string;
  status: MatchStatus;
  treatment: Treatment;
  bottom: boolean;
  /** When it sets off, touches its pads, and has settled (glow faded). */
  start: number;
  land: number;
  settle: number;
  /** A little drift in from the board's middle, as a share of the board's half width (dx) and half depth (dz). */
  from: { dx: number; dz: number };
};

export type FlyPlan = {
  parts: FlyPart[];
  /** By upper-case designator. */
  byRef: Record<string, FlyPart>;
  /** BoM designators with no place on the board, and when each turns red in the feeder strip. */
  feeder: { ref: string; at: number }[];
  duration: number;
};

/** Seconds from setting off to touching the pads; the soft settle after; how long a match glows. */
export const FLY = 0.7;
export const SETTLE = 0.32;
export const GLOW_RISE = 0.12;
export const GLOW_FADE = 0.6;
/** How much a part is pressed flat as it settles into the paste (share of its height). */
export const SQUASH = 0.16;
/** Degrees a part is still turned when high above its place. */
export const SPIN = 16;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;
const smooth = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * The fly-in for every placed designator: top side first, swept from the board's top-left corner, then the bottom.
 * The stagger tightens on big boards so the whole board settles in about 2–4 s.
 */
export function planFlyIn(refs: FlyRef[]): FlyPlan {
  const placed = refs.filter((r) => r.x !== null && r.y !== null && r.status !== "not-on-board") as (FlyRef & { x: number; y: number })[];
  // Y down for the sweep, so "top-left" is the corner the eye starts from.
  const items = placed.map((r) => ({ r, x: r.x, y: -r.y, bottom: (r.side ?? "").toUpperCase() === "BOTTOM" }));
  const xs = items.map((i) => i.x);
  const ys = items.map((i) => i.y);
  const cx = items.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const cy = items.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
  const hw = items.length ? Math.max(1, (Math.max(...xs) - Math.min(...xs)) / 2) : 1;
  const hh = items.length ? Math.max(1, (Math.max(...ys) - Math.min(...ys)) / 2) : 1;
  const order = sweepOrder(items);
  const n = order.length;
  const spread = clamp(0.9 + n * 0.006, 0.9, 2.4);
  const step = n > 1 ? spread / (n - 1) : 0;
  const parts: FlyPart[] = order.map((it, i) => {
    const treatment = TREATMENT[it.r.status];
    const start = r3(0.1 + i * step);
    const land = r3(start + FLY);
    const settle = r3(land + (treatment === "glow" ? Math.max(SETTLE, GLOW_RISE + GLOW_FADE) : SETTLE));
    return {
      ref: it.r.ref,
      status: it.r.status,
      treatment,
      bottom: it.bottom,
      start,
      land,
      settle,
      from: { dx: r3(clamp((it.x - cx) / hw, -1, 1) * 0.16), dz: r3(clamp((it.y - cy) / hh, -1, 1) * 0.1) },
    };
  });
  const landed = parts.length ? Math.max(...parts.map((p) => p.land)) : 0.2;
  const others = refs.filter((r) => r.status === "not-on-board" || r.x === null || r.y === null).map((r) => r.ref);
  const gap = others.length ? Math.min(0.08, 0.5 / others.length) : 0;
  const feeder = others.map((ref, k) => ({ ref, at: r3(landed + 0.1 + k * gap) }));
  const duration = r3(Math.max(0.2, ...parts.map((p) => p.settle), ...feeder.map((f) => f.at + 0.05)));
  const byRef: Record<string, FlyPart> = {};
  for (const p of parts) byRef[p.ref.toUpperCase()] = p;
  return { parts, byRef, feeder, duration };
}

/** How a part looks at a moment of the fly-in. */
export type FlyFx = {
  /** The body is there (false before its turn, and always for a part with no BoM line). */
  shown: boolean;
  /** 1 = at the top of its flight, 0 = on its pads. Never below them. */
  lift: number;
  /** Drift (share of the board's half width / half depth) and turn (degrees) still to go. */
  dx: number;
  dz: number;
  spin: number;
  /** Pressed flat as it settles: 0 = at rest. */
  squash: number;
  /** Green glow after a match lands (0–1). */
  glow: number;
  /** How far the result's outline has come up (0–1). */
  mark: number;
};

/** Where every part ends: on its pads, still. Outlines stay for the results that keep one. */
export function finalFx(p: Pick<FlyPart, "treatment">): FlyFx {
  const keep = p.treatment === "outline" || p.treatment === "blink" || p.treatment === "bare";
  return { shown: p.treatment !== "bare", lift: 0, dx: 0, dz: 0, spin: 0, squash: 0, glow: 0, mark: keep ? 1 : 0 };
}

const BEFORE: FlyFx = { shown: false, lift: 1, dx: 0, dz: 0, spin: 0, squash: 0, glow: 0, mark: 0 };

export function flyAt(p: FlyPart, t: number): FlyFx {
  if (t >= p.settle) return finalFx(p);
  if (t < p.start) return { ...BEFORE, dx: p.from.dx, dz: p.from.dz, spin: SPIN };
  // Nothing to place: its outline simply comes up when its turn comes.
  if (p.treatment === "bare") return { ...finalFx(p), mark: smooth(p.start + FLY * 0.5, p.land, t) };
  const k = clamp((t - p.start) / FLY, 0, 1);
  const lift = 1 - easeOut(k);
  const after = t - p.land;
  const u = clamp(after / SETTLE, 0, 1);
  const squash = after < 0 || u >= 1 ? 0 : Math.sin(u * Math.PI) * (1 - u) * SQUASH;
  const glow = p.treatment !== "glow" || after < 0 ? 0 : after < GLOW_RISE ? after / GLOW_RISE : Math.max(0, 1 - (after - GLOW_RISE) / GLOW_FADE);
  const keep = p.treatment === "outline" || p.treatment === "blink";
  return {
    shown: true,
    lift: r3(lift),
    dx: r3(p.from.dx * lift),
    dz: r3(p.from.dz * lift),
    spin: r3(SPIN * lift),
    squash: r3(squash),
    glow: r3(glow),
    mark: keep ? smooth(p.land, p.land + SETTLE, t) : 0,
  };
}

/**
 * The 3D board draws a placement linked to a DNP line as a dashed footprint. A designator the check judged (it is also
 * on a fitted line, so it has a result) is fitted there: it gets its body, its result and its flight, as in the 2D film.
 * `judged`: upper-case designators with a result.
 */
export function fittedForCheck<P extends { ref: string; dnp?: boolean }>(parts: P[], judged: ReadonlySet<string>): P[] {
  return parts.map((p) => (p.dnp && judged.has(p.ref.toUpperCase()) ? { ...p, dnp: false } : p));
}

/** A calm 1 Hz blink for mismatches: 1 = full red, down to 0 and back, on the page's clock (seconds). */
export const blinkAt = (t: number) => 0.5 + 0.5 * Math.cos(2 * Math.PI * t);

/** With reduced motion a mismatch is steady red. */
export const BLINK_STEADY = 1;

/** What the studio lays on one designator (see StudioMark in src/vendor/circuitflow/studio/entry.ts). */
export type FlyMark = {
  /** The outline's colour. */
  color: string;
  ring?: "solid" | "dotted";
  blink?: boolean;
  /** No body: bare pads only. */
  empty?: boolean;
  /** A match's glow as it lands: a soft patch and a ring on the board round it (the body keeps its own colour). */
  glow?: string;
  /** The body's colour while a mismatch blinks. */
  tint?: string;
  /** A faint wash of the outline's colour inside it (0–1). */
  fill?: number;
};

export type MarkColors = { green: string; red: string; tint: string; ochre: string };

/**
 * A colour made deep and saturated at the same hue: a body lit by the studio's lights and tinted with the red token as
 * it is (a light, soft red) reads brown, so the tint keeps the token's hue and drops its softness. CSS hex in and out.
 */
export function deepen(hex: string, sat = 0.82, light = 0.44): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const [r, g, b] = [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  // HSL back to RGB at the new saturation and lightness.
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [a, bb, cc] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const o = light - c / 2;
  return "#" + [a, bb, cc].map((k) => Math.round((k + o) * 255).toString(16).padStart(2, "0")).join("");
}

export function markFor(status: MatchStatus, c: MarkColors): FlyMark | null {
  switch (TREATMENT[status]) {
    case "glow":
      return { color: c.green, glow: c.green };
    case "outline":
      return { color: c.ochre, ring: "solid" };
    case "blink":
      return { color: c.red, ring: "solid", blink: true, tint: c.tint };
    case "bare":
      return { color: c.red, ring: "dotted", empty: true, fill: 0.14 };
    default:
      return null;
  }
}
