import { describe, expect, it } from "vitest";
import {
  KNOB_EASE_FALLBACK,
  WAVE_FRAMES,
  WAVE_MS,
  WAVE_POINTS,
  centreOf,
  coverRadius,
  fadeKeyframes,
  fallbackOrigin,
  frontRadius,
  glowColours,
  glowStrength,
  lightKeyframes,
  lightLayers,
  polygonOf,
  resolvesDark,
  ringOutlines,
  ringPolygon,
  rippleAmplitude,
  rippleAt,
  springEasing,
  springPoints,
  waveKeyframes,
  waveOutline,
  waveProgress,
  waveShape,
} from "@/lib/theme-wave";

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };
const corners = (vp: { width: number; height: number }) => [
  [0, 0],
  [vp.width, 0],
  [0, vp.height],
  [vp.width, vp.height],
];
const dist = (a: [number, number], b: { x: number; y: number }) => Math.hypot(a[0] - b.x, a[1] - b.y);

describe("the radius that covers the screen", () => {
  it("reaches the farthest corner from where it starts", () => {
    // The switch near the top-right: the far corner is bottom-left.
    expect(coverRadius({ x: 1300, y: 30 }, desktop)).toBe(Math.ceil(Math.hypot(1300, 870)));
    // From the middle every corner is equally far.
    expect(coverRadius({ x: 720, y: 450 }, desktop)).toBe(Math.ceil(Math.hypot(720, 450)));
    // From a corner it is the diagonal.
    expect(coverRadius({ x: 0, y: 0 }, phone)).toBe(Math.ceil(Math.hypot(390, 844)));
  });

  it("covers every corner of the viewport, never less, from inside or outside it", () => {
    for (const [p, vp] of [
      [{ x: 12.5, y: 7.25 }, phone],
      [{ x: 389, y: 843 }, phone],
      [{ x: 1439.9, y: 0.1 }, desktop],
      [{ x: -50, y: -100 }, phone],
      [{ x: 500, y: 900 }, phone],
    ] as const) {
      const r = coverRadius(p, vp);
      for (const [cx, cy] of corners(vp)) expect(r).toBeGreaterThanOrEqual(Math.hypot(cx - p.x, cy - p.y));
      expect(Number.isInteger(r)).toBe(true);
    }
  });

  it("starts from the centre of the element it came from, or the top-right corner", () => {
    expect(centreOf({ left: 100, top: 20, width: 56, height: 32 })).toEqual({ x: 128, y: 36 });
    const corner = fallbackOrigin(desktop);
    expect(corner.x).toBeGreaterThan(desktop.width - 100);
    expect(corner.y).toBeLessThan(60);
    expect(fallbackOrigin({ width: 20, height: 20 }).x).toBe(0);
  });
});

describe("the wave's shape and timing", () => {
  const origin = { x: 1310, y: 28 };
  const shape = waveShape(origin, desktop);
  const small = waveShape({ x: 300, y: 28 }, phone);

  it("lasts long enough to read as a wave, short enough not to wait for", () => {
    expect(WAVE_MS).toBeGreaterThanOrEqual(700);
    expect(WAVE_MS).toBeLessThanOrEqual(900);
  });

  it("is sized to the window: a 40–80 px glowing band and a gentle ripple on a phone and a wide screen", () => {
    for (const s of [shape, small]) {
      expect(s.band).toBeGreaterThanOrEqual(40);
      expect(s.band).toBeLessThanOrEqual(80);
      expect(s.amplitude).toBeGreaterThanOrEqual(6);
      expect(s.amplitude).toBeLessThanOrEqual(20);
      expect(s.end).toBe(s.cover + s.band);
    }
    expect(shape.band).toBeGreaterThan(small.band);
  });

  it("travels out from the switch, ease-out, ending past the far corner", () => {
    expect(waveProgress(0)).toBe(0);
    expect(waveProgress(1)).toBe(1);
    let last = -1;
    for (let i = 0; i <= 50; i++) {
      const p = waveProgress(i / 50);
      expect(p).toBeGreaterThan(last);
      last = p;
    }
    // Quick off the switch, slowing at the end: well past a third by a fifth of the time.
    expect(waveProgress(0.2)).toBeGreaterThan(0.28);
    expect(waveProgress(0.8)).toBeGreaterThan(0.9);
    // Still on screen two thirds of the way through (so the light is seen crossing), past the far corner by 90 %.
    const shape = waveShape({ x: 1310, y: 28 }, desktop);
    expect(frontRadius(shape, 650 / WAVE_MS)).toBeLessThan(shape.cover - shape.amplitude);
    expect(frontRadius(shape, 0.9) - rippleAmplitude(shape, 0.9)).toBeGreaterThan(shape.cover);
    expect(frontRadius(shape, 1)).toBe(shape.end);
  });

  it("ripples only while it travels: a dot at the start, a plain circle at the end, never inside-out", () => {
    expect(rippleAmplitude(shape, 0)).toBe(0);
    expect(rippleAmplitude(shape, 1)).toBe(0);
    expect(rippleAmplitude(shape, 0.3)).toBeGreaterThan(shape.amplitude * 0.8);
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      expect(rippleAmplitude(shape, t)).toBeLessThanOrEqual(frontRadius(shape, t) * 0.2 + 1e-9);
    }
  });

  it("has a ripple within ±1 that drifts round the front over time", () => {
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < 720; i++) {
      const v = rippleAt((i / 720) * 2 * Math.PI, 0.4);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(-1);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi - lo).toBeGreaterThan(1);
    // Closed: the same at 0 and a full turn.
    expect(rippleAt(0, 0.4)).toBeCloseTo(rippleAt(2 * Math.PI, 0.4), 9);
    // Moving: the edge at one angle changes between frames.
    expect(Math.abs(rippleAt(1, 0.3) - rippleAt(1, 0.35))).toBeGreaterThan(0.05);
  });

  it("draws an outline with a fixed number of points round the origin, rippled about the front", () => {
    const t = 0.4;
    const outline = waveOutline(shape, t);
    expect(outline).toHaveLength(WAVE_POINTS);
    const r = frontRadius(shape, t);
    const a = rippleAmplitude(shape, t);
    const radii = outline.map((p) => dist(p, shape.origin));
    for (const d of radii) {
      expect(d).toBeGreaterThanOrEqual(r - a - 1e-6);
      expect(d).toBeLessThanOrEqual(r + a + 1e-6);
    }
    // Visibly rippled, not a circle.
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(a);
    // An echo sits behind the front; a shifted ring sits out from it.
    const echo = waveOutline(shape, t, { back: shape.gap }).map((p) => dist(p, shape.origin));
    expect(Math.max(...echo)).toBeLessThan(Math.max(...radii));
    expect(waveOutline(shape, 0)).toEqual(Array.from({ length: WAVE_POINTS }, () => [shape.origin.x, shape.origin.y]));
  });

  it("writes clip-path keyframes that all have the same point count, from nothing to the whole screen", () => {
    for (const [s, vp] of [
      [shape, desktop],
      [small, phone],
    ] as const) {
      const frames = waveKeyframes(s);
      expect(frames).toHaveLength(WAVE_FRAMES + 1);
      expect(frames[0].offset).toBe(0);
      expect(frames.at(-1)?.offset).toBe(1);
      for (const f of frames) {
        const clip = String(f.clipPath);
        expect(clip).toMatch(/^polygon\(/);
        expect(clip.split(",")).toHaveLength(WAVE_POINTS);
      }
      // Last frame: every point past the far corner, and the polygon's edges too (each corner inside it).
      const last = String(frames.at(-1)?.clipPath)
        .slice(8, -1)
        .split(", ")
        .map((pair) => pair.split(" ").map((v) => parseFloat(v)) as [number, number]);
      const minRadius = Math.min(...last.map((p) => dist(p, s.origin))) * Math.cos(Math.PI / WAVE_POINTS);
      for (const [cx, cy] of corners(vp)) expect(minRadius).toBeGreaterThan(Math.hypot(cx - s.origin.x, cy - s.origin.y));
    }
  });

  it("formats polygons to a tenth of a pixel", () => {
    expect(
      polygonOf([
        [1.234, 5.678],
        [10, -2.05],
      ]),
    ).toBe("polygon(1.2px 5.7px, 10px -2px)");
  });
});

describe("the light on the wave", () => {
  it("rises at once and fades out as the wave finishes", () => {
    expect(glowStrength(0)).toBe(0);
    expect(glowStrength(0.1)).toBe(1);
    expect(glowStrength(0.45)).toBe(1);
    expect(glowStrength(0.75)).toBeGreaterThan(0.3);
    expect(glowStrength(0.75)).toBeLessThan(0.7);
    expect(glowStrength(1)).toBe(0);
  });

  it("is pale lamp light going dark and golden sunrise light going light, never blue", () => {
    for (const toDark of [true, false]) {
      const { halo, core } = glowColours(toDark);
      for (const [r, g, b] of [halo, core].map((c) => c.split(",").map(Number))) {
        expect(r).toBeGreaterThanOrEqual(g);
        expect(g).toBeGreaterThan(b);
      }
    }
    const lamp = glowColours(true).halo.split(",").map(Number);
    const sun = glowColours(false).halo.split(",").map(Number);
    // The sunrise is the deeper gold of the two.
    expect(sun[2]).toBeLessThan(lamp[2]);
  });

});

describe("the light layers riding the front", () => {
  const origin = { x: 1310, y: 28 };
  const shape = waveShape(origin, desktop);
  const radii = (pts: [number, number][]) => pts.map((p) => dist(p, shape.origin));
  /** The points of a polygon() / polygon(evenodd, …) string. */
  const points = (clip: unknown) =>
    String(clip)
      .replace(/^polygon\((evenodd, )?/, "")
      .slice(0, -1)
      .split(", ")
      .map((pair) => pair.split(" ").map((v) => parseFloat(v)) as [number, number]);

  it("draws a ring that keeps its width all the way round and ripples with the front", () => {
    const t = 0.4;
    const { outer, inner } = ringOutlines(shape, t, { back: 0, width: 20 });
    expect(outer).toHaveLength(WAVE_POINTS);
    expect(inner).toHaveLength(WAVE_POINTS);
    const front = waveOutline(shape, t);
    for (let i = 0; i < WAVE_POINTS; i++) {
      // Centred exactly on the front's outline, 10 px either side.
      expect(dist(outer[i], shape.origin) - dist(front[i], shape.origin)).toBeCloseTo(10, 6);
      expect(dist(front[i], shape.origin) - dist(inner[i], shape.origin)).toBeCloseTo(10, 6);
    }
    // Behind the front by `back`, and nothing at all before the front gets that far.
    const echo = ringOutlines(shape, t, { back: shape.gap, width: 6 });
    expect(Math.max(...radii(echo.outer))).toBeLessThan(Math.min(...radii(front)));
    const early = ringOutlines(shape, 0.01, { back: shape.gap * 2, width: 6 });
    for (const p of [...early.outer, ...early.inner]) expect(p).toEqual([shape.origin.x, shape.origin.y]);
    // At the very start the band is a small disc of light round the switch (its inner edge clamped at the origin).
    const start = ringOutlines(shape, 0.005, { back: 0, width: 40 });
    expect(Math.max(...radii(start.inner))).toBeLessThan(1e-9);
    expect(Math.min(...radii(start.outer))).toBeGreaterThan(0);
  });

  it("writes rings as one evenodd polygon with a fixed point count", () => {
    const ring = ringOutlines(shape, 0.5, { back: 0, width: 12 });
    const clip = ringPolygon([ring]);
    expect(clip).toMatch(/^polygon\(evenodd, /);
    expect(points(clip)).toHaveLength(2 * WAVE_POINTS + 2);
    const two = ringPolygon([ring, ringOutlines(shape, 0.5, { back: 80, width: 6 })]);
    expect(points(two)).toHaveLength(2 * (2 * WAVE_POINTS + 2));
    // The hops between the outlines run along the first point's ray (y unchanged), so they add no area.
    const pts = points(clip);
    expect(pts[WAVE_POINTS][1]).toBeCloseTo(pts[WAVE_POINTS + 1][1], 0);
  });

  it("has echoes behind, a soft band leaning to the dark side, and a thin crest on the edge, sized to the wave", () => {
    for (const toDark of [true, false]) {
      const [echo, glow, crest] = lightLayers(shape, toDark);
      expect([echo.name, glow.name, crest.name]).toEqual(["theme-wave-echo", "theme-wave-glow", "theme-wave-crest"]);
      expect(echo.rings.every((r) => r.back > 0)).toBe(true);
      expect(echo.rings[1].width).toBeLessThan(echo.rings[0].width);
      // Going dark the new, dark page is inside the front: the band leans in (behind); going light it leans out.
      expect(Math.sign(glow.rings[0].back)).toBe(toDark ? 1 : -1);
      expect(glow.rings[0].width).toBeLessThan(shape.band);
      expect(glow.filter).toMatch(/^blur\(\d+(\.\d)?px\)$/);
      expect(crest.rings).toEqual([{ back: 0, width: 2.5 }]);
      expect(crest.light).toBe("core");
      expect(crest.points).toBe(WAVE_POINTS);
      for (const l of [echo, glow, crest]) {
        expect(l.peak).toBeGreaterThan(0.5);
        expect(l.peak).toBeLessThanOrEqual(1);
      }
    }
  });

  it("animates each layer with the same point count in every frame, the crest exactly on the front", () => {
    for (const layer of lightLayers(shape, true)) {
      const frames = lightKeyframes(shape, layer);
      expect(frames).toHaveLength(WAVE_FRAMES + 1);
      const counts = new Set(frames.map((f) => points(f.clipPath).length));
      expect(counts.size).toBe(1);
      expect([...counts][0]).toBe(layer.rings.length * (2 * layer.points + 2));
    }
    // The crest's middle line is the page clip's own outline, frame for frame.
    const crest = lightLayers(shape, true)[2];
    const reveal = waveKeyframes(shape);
    const ring = lightKeyframes(shape, crest);
    for (const i of [8, 16, 24]) {
      const front = points(reveal[i].clipPath);
      const outer = points(ring[i].clipPath).slice(0, WAVE_POINTS);
      for (let k = 0; k < WAVE_POINTS; k += 9) expect(dist(outer[k], shape.origin) - dist(front[k], shape.origin)).toBeCloseTo(1.25, 0);
    }
  });

  it("fades the light in at once and out by the end, never above its peak", () => {
    const frames = fadeKeyframes(0.8);
    expect(frames).toHaveLength(WAVE_FRAMES + 1);
    expect(frames[0].opacity).toBe(0);
    expect(frames.at(-1)?.opacity).toBe(0);
    const values = frames.map((f) => Number(f.opacity));
    expect(Math.max(...values)).toBe(0.8);
    for (const v of values) expect(v).toBeLessThanOrEqual(0.8);
    expect(values[Math.round(WAVE_FRAMES * 0.3)]).toBe(0.8);
  });
});

describe("which theme a choice paints", () => {
  it("follows the system only for 'system'", () => {
    expect(resolvesDark("dark", false)).toBe(true);
    expect(resolvesDark("light", true)).toBe(false);
    expect(resolvesDark("system", true)).toBe(true);
    expect(resolvesDark("system", false)).toBe(false);
  });
});

describe("the knob's spring", () => {
  const points = springPoints();

  it("starts at rest, ends exactly on target", () => {
    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
    expect(points.length).toBeGreaterThan(16);
  });

  it("overshoots a little and settles — soft, not bouncy", () => {
    const peak = Math.max(...points);
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.1);
    // Settled to within 1 % (a quarter of a pixel on the switch) over the last fifth.
    for (const v of points.slice(Math.floor(points.length * 0.8))) expect(Math.abs(v - 1)).toBeLessThan(0.01);
    // Rises without wobbling backwards until it first reaches the target.
    const firstOver = points.findIndex((v) => v >= 1);
    for (let i = 1; i <= firstOver; i++) expect(points[i]).toBeGreaterThanOrEqual(points[i - 1]);
  });

  it("is written as a CSS linear() easing, with a cubic-bezier fallback", () => {
    expect(springEasing()).toMatch(/^linear\(0, [\d., ]+, 1\)$/);
    expect(KNOB_EASE_FALLBACK).toMatch(/^cubic-bezier\(/);
  });
});
