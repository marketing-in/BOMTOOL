/**
 * The light / dark change, as motion: the switch's knob slides on a soft spring, and the new theme washes over the
 * page as a wave of light — a growing front with a rippled, liquid edge, a glowing band riding on it and two faint
 * echoes behind. Pure geometry and timing only (no DOM), shared by the page clip and the light layers so the two
 * always match; the DOM side is src/components/shell/theme-wave.ts.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Box = { left: number; top: number; width: number; height: number };

/** The wave, from the switch to the far corner: long enough to read as a wave, short enough not to keep anyone waiting. */
export const WAVE_MS = 850;
/** Points on the wave's outline: the same count in every frame, so the clip-path polygons interpolate. */
export const WAVE_POINTS = 128;
/** Clip-path keyframes over the wave (one about every 21 ms; the browser interpolates between them). */
export const WAVE_FRAMES = 40;
/** The knob's slide. */
export const KNOB_MS = 420;
/** For browsers without CSS linear() easing: a back-out curve with a small overshoot. */
export const KNOB_EASE_FALLBACK = "cubic-bezier(0.34, 1.56, 0.64, 1)";
/** Track colour and the sun / moon swap. */
export const FADE_MS = 360;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
/** 0 below `a`, 1 above `b`, a smooth S between. */
export function smoothstep(a: number, b: number, v: number): number {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
}

/** The centre of a box (an element's bounding rectangle). */
export function centreOf(box: Box): Point {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * The radius a circle centred on `p` needs to cover the whole viewport: the distance to the farthest corner,
 * rounded up so no hairline of the old theme is left at that corner. Works for points outside the viewport too.
 */
export function coverRadius(p: Point, viewport: Size): number {
  const dx = Math.max(Math.abs(p.x), Math.abs(viewport.width - p.x));
  const dy = Math.max(Math.abs(p.y), Math.abs(viewport.height - p.y));
  return Math.ceil(Math.hypot(dx, dy));
}

/** Where the wave starts when there is no element to start it from: the top-right corner, where the switch lives. */
export function fallbackOrigin(viewport: Size): Point {
  return { x: Math.max(0, viewport.width - 48), y: 32 };
}

/** Whether a choice ends up dark, given whether the system is set to dark. */
export function resolvesDark(choice: ThemeChoice, systemDark: boolean): boolean {
  return choice === "system" ? systemDark : choice === "dark";
}

/** One wave, sized to the window: the same proportions on a phone and a wide screen. */
export type WaveShape = {
  origin: Point;
  /** The radius that covers the viewport from the origin. */
  cover: number;
  /** Where the front ends: past the far corner by the glow's width, so the glow leaves the screen too. */
  end: number;
  /** The ripples' largest swing either side of the front, px. */
  amplitude: number;
  /** Width of the glowing band on the front, px. */
  band: number;
  /** Distance between the front and each echo behind it, px. */
  gap: number;
};

export function waveShape(origin: Point, viewport: Size): WaveShape {
  const diagonal = Math.hypot(viewport.width, viewport.height);
  const cover = coverRadius(origin, viewport);
  const band = Math.round(clamp(diagonal * 0.04, 40, 76));
  return {
    origin: { x: Math.round(origin.x * 10) / 10, y: Math.round(origin.y * 10) / 10 },
    cover,
    end: cover + band,
    amplitude: clamp(diagonal * 0.011, 7, 20),
    band,
    gap: Math.round(clamp(diagonal * 0.055, 44, 100)),
  };
}

/**
 * How far the front has travelled, 0 → 1: a gentle ease-out, quick off the switch and slowing as it nears the far
 * corner (which it passes at about 87 % of the time; the rest carries the glow off the screen). The area covered
 * (∝ radius²) grows at a fairly even pace, so the wave reads as one steady sweep.
 */
export function waveProgress(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 1.6);
}

/** The front's mean radius at time t (0 → 1 over the wave). */
export function frontRadius(shape: WaveShape, t: number): number {
  return shape.end * waveProgress(t);
}

/**
 * How strongly the edge ripples at time t: it builds up as the front leaves the switch and calms before the end
 * (the last frames are a plain circle past the corners), and never exceeds a fifth of the radius, so the front
 * stays a round blob while it is small.
 */
export function rippleAmplitude(shape: WaveShape, t: number): number {
  const envelope = smoothstep(0, 0.12, t) * (1 - smoothstep(0.6, 0.95, t));
  return Math.min(shape.amplitude * envelope, frontRadius(shape, t) * 0.2);
}

/** How bright the glowing band is at time t: up within the first few frames, fading out over the second half. */
export function glowStrength(t: number): number {
  return smoothstep(0, 0.06, t) * (1 - smoothstep(0.5, 1, t));
}

/**
 * Three sine ripples with different lobe counts drifting round the front at different speeds and directions, so the
 * edge looks liquid rather than a regular gear. Whole lobe counts keep the outline closed; the sum is scaled to ±1.
 */
const RIPPLES = [
  { lobes: 7, weight: 1, drift: 1.3, phase: 0.4 },
  { lobes: 11, weight: 0.55, drift: -2.1, phase: 2.2 },
  { lobes: 17, weight: 0.3, drift: 3.4, phase: 4.6 },
] as const;
const RIPPLE_SUM = RIPPLES.reduce((s, r) => s + r.weight, 0);

/** The ripple at angle `theta` (radians) and time t, in −1 … 1. */
export function rippleAt(theta: number, t: number): number {
  let v = 0;
  for (const r of RIPPLES) v += r.weight * Math.sin(r.lobes * theta + r.drift * 2 * Math.PI * t + r.phase);
  return v / RIPPLE_SUM;
}

/**
 * The outline at time t as `points` [x, y] pairs round the origin. `back` draws a ring that far behind the front
 * (an echo), `lag` ripples it as the front was that long ago, `shift` moves the whole ring out (+) or in (−).
 */
export function waveOutline(shape: WaveShape, t: number, opts: { back?: number; lag?: number; shift?: number; points?: number } = {}): [number, number][] {
  const { back = 0, lag = 0, shift = 0, points = WAVE_POINTS } = opts;
  const radius = Math.max(0, frontRadius(shape, t) - back + shift);
  const swing = radius > 0 ? Math.min(rippleAmplitude(shape, t), radius * 0.2) : 0;
  const { x, y } = shape.origin;
  const out: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * 2 * Math.PI;
    const r = Math.max(0, radius + swing * rippleAt(theta, t - lag));
    out.push([x + r * Math.cos(theta), y + r * Math.sin(theta)]);
  }
  return out;
}

/** A CSS polygon() from an outline, to a tenth of a pixel. */
export function polygonOf(outline: [number, number][]): string {
  return `polygon(${outline.map(([x, y]) => `${Math.round(x * 10) / 10}px ${Math.round(y * 10) / 10}px`).join(", ")})`;
}

/**
 * Keyframes for ::view-transition-new(root): the new page revealed inside the rippled front, from nothing at the
 * origin to a circle past the far corner. Every frame has the same number of points; the easing is in the frames,
 * so the animation itself runs linear.
 */
export function waveKeyframes(shape: WaveShape, frames = WAVE_FRAMES): Keyframe[] {
  const out: Keyframe[] = [];
  for (let i = 0; i <= frames; i++) {
    const t = i / frames;
    out.push({ offset: t, clipPath: polygonOf(waveOutline(shape, t)) });
  }
  return out;
}

/**
 * The glow's colours: pale lamp light washing the page into dark, golden sunrise light washing it back to light.
 * Neither is blue: the app's interface has no blue in it.
 */
export function glowColours(toDark: boolean): { halo: string; core: string } {
  return toDark ? { halo: "255, 236, 206", core: "255, 251, 243" } : { halo: "255, 196, 92", core: "255, 240, 200" };
}

/**
 * A ring of light round the origin that ripples with the front: `back` px behind the front (negative: ahead of
 * it), `width` px wide, its ripples `lag` (share of the wave) behind the front's. Both edges take the same ripple,
 * so the ring keeps its width all the way round. A ring not out yet (or shrunk to nothing) collapses onto the origin.
 */
export type Ring = { back: number; width: number; lag?: number };

export function ringOutlines(shape: WaveShape, t: number, ring: Ring, points = WAVE_POINTS): { outer: [number, number][]; inner: [number, number][] } {
  const centre = frontRadius(shape, t) - ring.back;
  const half = ring.width / 2;
  // The same limit as the front's (a fifth of the radius), so a ring on the front ripples exactly as the front does.
  const swing = Math.min(rippleAmplitude(shape, t), Math.max(0, centre) * 0.2);
  const { x, y } = shape.origin;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * 2 * Math.PI;
    const r = centre + swing * rippleAt(theta, t - (ring.lag ?? 0));
    const out = Math.max(0, r + half);
    const inn = Math.min(out, Math.max(0, r - half));
    outer.push([x + out * Math.cos(theta), y + out * Math.sin(theta)]);
    inner.push([x + inn * Math.cos(theta), y + inn * Math.sin(theta)]);
  }
  return { outer, inner };
}

/**
 * Rings as one CSS polygon (evenodd): each ring is its outer outline, a hop in to the inner outline along the first
 * point's ray, the inner outline backwards, and back out. The hops run along one ray, there and back, so they add
 * nothing; every ring adds 2 × points + 2 points, the same in every frame, so the keyframes interpolate.
 */
export function ringPolygon(rings: { outer: [number, number][]; inner: [number, number][] }[]): string {
  const pts: [number, number][] = [];
  for (const { outer, inner } of rings) pts.push(...outer, outer[0], inner[0], ...inner.slice(1).reverse(), inner[0]);
  return polygonOf(pts).replace("polygon(", "polygon(evenodd, ");
}

/**
 * The light on the wave, as layers above the page. Each is a full-screen sheet of light (`light`: the halo or the
 * core colour) cut down to its rings by an animated clip-path, softened by a CSS filter and faded with the wave.
 * Clip, fade and the page's own reveal are all web animations on one clock, run by the compositor, so the light stays
 * on the front even when the page is busy.
 */
export type LightLayer = {
  /** Its view-transition-name (src/app/globals.css styles each one). */
  name: "theme-wave-echo" | "theme-wave-glow" | "theme-wave-crest";
  rings: Ring[];
  light: "halo" | "core";
  /** CSS filter on the layer: what turns a hard-edged ring into a soft band of light. */
  filter: string;
  /** Opacity at full strength (it follows glowStrength over the wave). */
  peak: number;
  /** Points per ring outline: the crest and the band use the front's own count, so they sit exactly on it. */
  points: number;
};

const px = (v: number) => `${Math.round(v * 10) / 10}px`;

/**
 * The three layers, sized from the wave (a 40–80 px band): two faint echoes following behind, the glowing band, and
 * a thin bright crest exactly on the edge. The band leans to the dark side of the edge, where the light shows: inside
 * the front going dark (the new page is dark), outside it going light (the old page is dark).
 */
export function lightLayers(shape: WaveShape, toDark: boolean): LightLayer[] {
  const { band, gap } = shape;
  const lean = toDark ? 1 : -1;
  return [
    {
      name: "theme-wave-echo",
      rings: [
        { back: gap, width: band * 0.12, lag: 0.05 },
        { back: gap * 2, width: band * 0.07, lag: 0.1 },
      ],
      light: "halo",
      filter: `blur(${px(band * 0.06)})`,
      peak: 0.6,
      points: Math.round(WAVE_POINTS * 0.75),
    },
    {
      name: "theme-wave-glow",
      rings: [{ back: lean * band * 0.14, width: band * 0.38 }],
      light: "halo",
      filter: `blur(${px(band * 0.16)})`,
      peak: 0.95,
      points: WAVE_POINTS,
    },
    {
      name: "theme-wave-crest",
      rings: [{ back: 0, width: 2.5 }],
      light: "core",
      filter: `drop-shadow(0 0 ${px(band * 0.09)} rgb(var(--theme-wave-core)))`,
      peak: 0.95,
      points: WAVE_POINTS,
    },
  ];
}

/** Clip-path keyframes for one light layer: its rings round the front, frame by frame, like waveKeyframes. */
export function lightKeyframes(shape: WaveShape, layer: LightLayer, frames = WAVE_FRAMES): Keyframe[] {
  const out: Keyframe[] = [];
  for (let i = 0; i <= frames; i++) {
    const t = i / frames;
    out.push({ offset: t, clipPath: ringPolygon(layer.rings.map((r) => ringOutlines(shape, t, r, layer.points))) });
  }
  return out;
}

/** Opacity keyframes for a light layer: up within the first frames, fading out over the second half of the wave. */
export function fadeKeyframes(peak: number, frames = WAVE_FRAMES): Keyframe[] {
  const out: Keyframe[] = [];
  for (let i = 0; i <= frames; i++) {
    const t = i / frames;
    out.push({ offset: t, opacity: Math.round(peak * glowStrength(t) * 1000) / 1000 });
  }
  return out;
}

/**
 * A damped spring sampled as a CSS linear() easing, so the knob overshoots a hair and settles instead of stopping
 * dead. `damping` is the damping ratio (below 1 overshoots; 0.68 gives about 5 %, a pixel on the switch); `decay` is
 * how far the spring has settled by the end (e^-decay of its swing is left — at 5.5 well under a pixel).
 */
export function springPoints(damping = 0.68, decay = 5.5, samples = 32): number[] {
  const z = Math.min(Math.max(damping, 0.05), 0.95);
  const w0 = decay / z;
  const wd = w0 * Math.sqrt(1 - z * z);
  const out: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const v = 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
    out.push(i === samples ? 1 : Math.round(v * 10000) / 10000);
  }
  return out;
}

export function springEasing(damping?: number, decay?: number, samples?: number): string {
  return `linear(${springPoints(damping, decay, samples).join(", ")})`;
}
