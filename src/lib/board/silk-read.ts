/**
 * Reads a board's silkscreen: the lettering (reference designators, net names) and the part outlines drawn round it.
 * When a customer sends Gerbers and a BoM but no pick-and-place file, the silkscreen is the only thing that says which
 * footprint is "C21". Pure; everything in the Gerbers' own millimetres, Y up.
 */

import { SILK_GLYPHS } from "./silk-font";

export type SilkStroke = { pts: [number, number][]; width: number };

const NUM = String.raw`-?[\d.]+(?:e-?\d+)?`;

/** Points along an SVG arc (end-point form), one about every 15°, the end point last. */
function arcPoints(x0: number, y0: number, rx: number, ry: number, large: boolean, sweep: boolean, x1: number, y1: number): [number, number][] {
  const r = Math.max(Math.abs(rx), Math.abs(ry));
  const dx = (x0 - x1) / 2, dy = (y0 - y1) / 2;
  const half = Math.hypot(dx, dy);
  if (r <= 0 || half <= 0) return [[x1, y1]];
  const rr = Math.max(r, half);
  const off = Math.sqrt(Math.max(0, rr * rr - half * half)) * (large === sweep ? -1 : 1);
  const cx = (x0 + x1) / 2 + (off * dy) / half, cy = (y0 + y1) / 2 - (off * dx) / half;
  const a0 = Math.atan2(y0 - cy, x0 - cx);
  let da = Math.atan2(y1 - cy, x1 - cx) - a0;
  if (sweep && da < 0) da += 2 * Math.PI;
  if (!sweep && da > 0) da -= 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 12)));
  const out: [number, number][] = [];
  for (let i = 1; i < n; i++) out.push([cx + rr * Math.cos(a0 + (da * i) / n), cy + rr * Math.sin(a0 + (da * i) / n)]);
  out.push([x1, y1]);
  return out;
}

/**
 * Every stroked line of one layer drawing (gerber-to-svg output), one stroke per pen-down, arcs followed round.
 * Knock-outs inside the `<mask>` (the solder-mask openings a CAM tool clips the legend to) and filled shapes are
 * left out: lettering is drawn with a round pen.
 */
export function strokesFromSvg(svg: string | null | undefined): SilkStroke[] {
  if (!svg) return [];
  const unit = (/<svg[^>]*\swidth="[\d.]+in"/.test(svg.slice(0, 800)) ? 25.4 : 1) / 1000;
  const end = svg.indexOf("</defs>");
  const body = end >= 0 ? svg.slice(end) : svg;
  const out: SilkStroke[] = [];
  const token = new RegExp(String.raw`[MLAZmlaz]|${NUM}`, "g");
  for (const m of body.matchAll(/<path\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\sfill="none"/.test(tag)) continue;
    const width = Number(tag.match(new RegExp(String.raw`\sstroke-width="(${NUM})"`))?.[1] ?? 0) * unit;
    const d = tag.match(/\sd="([^"]*)"/)?.[1];
    if (!d || !(width > 0)) continue;
    const t = d.match(token) ?? [];
    let cur: [number, number][] = [];
    let cmd = "M";
    let i = 0;
    const flush = () => {
      if (cur.length && cur.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) out.push({ pts: cur, width });
      cur = [];
    };
    while (i < t.length) {
      const c = t[i];
      if (/^[A-Za-z]$/.test(c)) {
        cmd = c.toUpperCase();
        i++;
        if (cmd === "Z" && cur.length > 1) cur.push([cur[0][0], cur[0][1]]);
        continue;
      }
      if (cmd === "M") {
        flush();
        cur = [[Number(t[i]) * unit, Number(t[i + 1]) * unit]];
        i += 2;
        cmd = "L";
      } else if (cmd === "A") {
        const last = cur.at(-1);
        const [rx, ry, , large, sweep, x, y] = t.slice(i, i + 7).map(Number);
        i += 7;
        if (last) cur.push(...arcPoints(last[0], last[1], rx * unit, ry * unit, large === 1, sweep === 1, x * unit, y * unit));
      } else if (cmd === "L") {
        cur.push([Number(t[i]) * unit, Number(t[i + 1]) * unit]);
        i += 2;
      } else i++;
    }
    flush();
  }
  return out;
}

// ───────────────────────────── Strokes that touch: one drawn thing ─────────────────────────────

/** Strokes that touch each other: a letter, or a part's outline. */
type Comp = { strokes: SilkStroke[]; x0: number; y0: number; x1: number; y1: number; pen: number };

function segmentGap(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  const side = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  if (side(ax, ay, bx, by, cx, cy) !== side(ax, ay, bx, by, dx, dy) && side(cx, cy, dx, dy, ax, ay) !== side(cx, cy, dx, dy, bx, by)) return 0;
  return Math.min(pointToSegment(ax, ay, cx, cy, dx, dy), pointToSegment(bx, by, cx, cy, dx, dy), pointToSegment(cx, cy, ax, ay, bx, by), pointToSegment(dx, dy, ax, ay, bx, by));
}

function pointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const l = vx * vx + vy * vy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l)) : 0;
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
}

/** Two strokes belong together when their centre lines meet (a CAD font joins its strokes exactly), mm. */
const TOUCH = 0.02;

function components(strokes: SilkStroke[]): Comp[] {
  const parent = strokes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const grid = new Map<number, number[]>();
  const segs: number[] = [];
  strokes.forEach((s, si) => {
    for (let k = 0; k < Math.max(1, s.pts.length - 1); k++) {
      const a = s.pts[k], b = s.pts[Math.min(k + 1, s.pts.length - 1)];
      const id = segs.length / 5;
      segs.push(si, a[0], a[1], b[0], b[1]);
      const gx0 = Math.floor(Math.min(a[0], b[0]) - TOUCH), gx1 = Math.floor(Math.max(a[0], b[0]) + TOUCH);
      const gy0 = Math.floor(Math.min(a[1], b[1]) - TOUCH), gy1 = Math.floor(Math.max(a[1], b[1]) + TOUCH);
      for (let gx = gx0; gx <= gx1; gx++)
        for (let gy = gy0; gy <= gy1; gy++) {
          const key = gx * 100003 + gy;
          const l = grid.get(key);
          if (l) l.push(id);
          else grid.set(key, [id]);
        }
    }
  });
  for (const l of grid.values())
    for (let i = 0; i < l.length; i++)
      for (let j = i + 1; j < l.length; j++) {
        const p = l[i] * 5, q = l[j] * 5;
        const r1 = find(segs[p]), r2 = find(segs[q]);
        // One pen draws a whole letter: a line of another pen that crosses it (an outline) stays a thing of its own.
        if (r1 !== r2 && strokes[segs[p]].width === strokes[segs[q]].width && segmentGap(segs[p + 1], segs[p + 2], segs[p + 3], segs[p + 4], segs[q + 1], segs[q + 2], segs[q + 3], segs[q + 4]) <= TOUCH) parent[r1] = r2;
      }
  const by = new Map<number, Comp>();
  strokes.forEach((s, i) => {
    const r = find(i);
    let c = by.get(r);
    if (!c) by.set(r, (c = { strokes: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, pen: s.width }));
    c.strokes.push(s);
    for (const [x, y] of s.pts) {
      if (x < c.x0) c.x0 = x;
      if (y < c.y0) c.y0 = y;
      if (x > c.x1) c.x1 = x;
      if (y > c.y1) c.y1 = y;
    }
  });
  return [...by.values()];
}

// ───────────────────────────── Glyph shapes and how alike two are ─────────────────────────────

/**
 * A glyph on a unit square: v runs from the baseline (0) to the capital height (1), u across the glyph's own width
 * (so a wide and a narrow cut of the same font compare alike). `dt` is how far each point of a grid over the square
 * is from the glyph's lines: comparing a glyph with a template is then two table look-ups per point.
 */
type Shape = { u: Float32Array; v: Float32Array; dt: Float32Array };

/** The grid: 1/32 of the square apart, a margin round it, and the same either way up so a turned glyph reads off it too. */
const CELL = 0.03125;
const NU = 49, NV = 53;
const U0 = -0.25, V0 = -0.3125;
/** A glyph narrower than this share of its height (I, 1) is not stretched to the full square. */
const NARROW = 0.4;
/** A glyph's lines are compared at points this far apart along them. */
const STEP = 0.05;

function shapeOf(lines: [number, number][][]): Shape {
  const us: number[] = [], vs: number[] = [];
  for (const line of lines) {
    us.push(line[0][0]);
    vs.push(line[0][1]);
    let carry = 0;
    for (let k = 1; k < line.length; k++) {
      const [ax, ay] = line[k - 1], [bx, by] = line[k];
      const len = Math.hypot(bx - ax, by - ay);
      let at = STEP - carry;
      while (at <= len) {
        us.push(ax + ((bx - ax) * at) / len);
        vs.push(ay + ((by - ay) * at) / len);
        at += STEP;
      }
      carry = len - (at - STEP);
    }
    const end = line[line.length - 1];
    us.push(end[0]);
    vs.push(end[1]);
  }
  const dt = new Float32Array(NU * NV);
  for (let j = 0; j < NV; j++)
    for (let i = 0; i < NU; i++) {
      const pu = U0 + i * CELL, pv = V0 + j * CELL;
      let best = Infinity;
      for (const line of lines)
        for (let k = 0; k < Math.max(1, line.length - 1); k++) {
          const a = line[k], b = line[Math.min(k + 1, line.length - 1)];
          const d = pointToSegment(pu, pv, a[0], a[1], b[0], b[1]);
          if (d < best) best = d;
        }
      dt[j * NU + i] = best;
    }
  return { u: Float32Array.from(us), v: Float32Array.from(vs), dt };
}

/** Distance from (u, v) to the shape's lines, read off its grid. */
function distanceAt(dt: Float32Array, u: number, v: number): number {
  const fu = Math.max(0, Math.min(NU - 1.001, (u - U0) / CELL)), fv = Math.max(0, Math.min(NV - 1.001, (v - V0) / CELL));
  const i = Math.floor(fu), j = Math.floor(fv);
  const tu = fu - i, tv = fv - j;
  const o = j * NU + i;
  return (dt[o] * (1 - tu) + dt[o + 1] * tu) * (1 - tv) + (dt[o + NU] * (1 - tu) + dt[o + NU + 1] * tu) * tv;
}

/** Puts a glyph's lines on the unit square: `width` and `height` are the glyph's and the text line's, in the lines' units. */
function onSquare(lines: [number, number][][], cx: number, width: number, base: number, height: number): [number, number][][] {
  const wide = Math.max(width, NARROW * height);
  return lines.map((line) => line.map(([x, y]) => [(x - cx) / wide + 0.5, (y - base) / height] as [number, number]));
}

type Template = { ch: number; shape: Shape };

/** Marks are told by their place beside a word (`markAt`), never by their shape: a dash is any short line. */
const MARKS = new Set(["+", "-", "_", "."]);

const CHARS: string[] = [...new Set(SILK_GLYPHS.map((g) => g.ch))];

/** The fonts' shapes on the unit square, worked out once, the first time something is read. */
let templateCache: Template[] | null = null;
function templates(): Template[] {
  if (templateCache) return templateCache;
  templateCache = SILK_GLYPHS.map((g) => {
    const lines = g.d.split("|").map((line) => line.split(" ").map((p) => p.split(",").map(Number) as [number, number]));
    let x0 = Infinity, x1 = -Infinity;
    for (const line of lines) for (const [x] of line) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    }
    return { ch: CHARS.indexOf(g.ch), shape: shapeOf(onSquare(lines, (x0 + x1) / 2, x1 - x0, 0, 100)) };
  });
  return templateCache;
}

/**
 * How unlike each character a glyph is (0 = the same lines), the glyph read upright (`turned` false) or upside down,
 * and from the copper side (`mirrored`). Root mean square of the distances both ways, so a missing or an extra
 * stroke (F against E, P against R) counts for more than a slightly different curve.
 */
function unlikeness(g: Shape, turned: boolean, mirrored: boolean): Float32Array {
  const out = new Float32Array(CHARS.length).fill(Infinity);
  for (const t of templates()) {
    if (MARKS.has(CHARS[t.ch])) continue;
    const cost = between(g, t.shape, turned !== mirrored, turned);
    if (cost < out[t.ch]) out[t.ch] = cost;
  }
  return out;
}

function between(g: Shape, t: Shape, flipU: boolean, flipV: boolean): number {
  let a = 0;
  const n = g.u.length;
  for (let k = 0; k < n; k++) {
    const d = distanceAt(t.dt, flipU ? 1 - g.u[k] : g.u[k], flipV ? 1 - g.v[k] : g.v[k]);
    a += d * d;
  }
  let b = 0;
  const m = t.u.length;
  for (let k = 0; k < m; k++) {
    const d = distanceAt(g.dt, flipU ? 1 - t.u[k] : t.u[k], flipV ? 1 - t.v[k] : t.v[k]);
    b += d * d;
  }
  return Math.sqrt((a / n + b / m) / 2);
}

// ───────────────────────────── Lines of lettering ─────────────────────────────

/** Lettering is looked for along x (frame 0) and along y (frame 90: the board turned so that text reads along x). */
type Frame = 0 | 90;
type Box = { comp: Comp; x0: number; y0: number; x1: number; y1: number; mark?: boolean };
type Line = {
  frame: Frame;
  /** Left to right in the frame. */
  boxes: Box[];
  base: number;
  height: number;
  /** Small letters after a capital ("Pin"): lettering, but not what this reader reads. */
  lower?: boolean;
};

const inFrame = (f: Frame, x: number, y: number): [number, number] => (f === 0 ? [x, y] : [y, -x]);
const boxIn = (f: Frame, c: Comp): Box => (f === 0 ? { comp: c, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 } : { comp: c, x0: c.y0, y0: -c.x1, x1: c.y1, y1: -c.x0 });

/** Silkscreen lettering is 0.5 – 5 mm tall; anything else is not looked at as a glyph. */
const MIN_HEIGHT = 0.35, MAX_HEIGHT = 6;
/** Widest gap between two letters of one word, as a share of the letter height. */
const LETTER_GAP = 0.75;
const samePen = (a: Comp, b: Comp) => Math.abs(a.pen - b.pen) < 1e-6;

/**
 * Glyph-sized things standing on one baseline, the same height and pen, a letter space apart: one word each.
 * Marks (+ - . _) are too small to stand in that row; they join the word they sit beside, and bridge two words
 * they sit between ("3" "." "3V").
 */
function linesIn(frame: Frame, comps: Comp[]): Line[] {
  const boxes = comps.map((c) => boxIn(frame, c));
  const tall = boxes
    .filter((b) => {
      const h = b.y1 - b.y0;
      return h >= MIN_HEIGHT && h <= MAX_HEIGHT && b.x1 - b.x0 <= 1.4 * h;
    })
    .sort((a, b) => a.y0 - b.y0);
  const parent = tall.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let i = 0; i < tall.length; i++) {
    const a = tall[i];
    const h = a.y1 - a.y0;
    const tol = 0.08 * h + 0.02;
    for (let j = i + 1; j < tall.length && tall[j].y0 - a.y0 <= tol; j++) {
      const b = tall[j];
      if (!samePen(a.comp, b.comp) || Math.abs(b.y1 - b.y0 - h) > tol) continue;
      const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      if (gap >= -0.15 * h && gap <= LETTER_GAP * h) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Box[]>();
  tall.forEach((b, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(b);
    else groups.set(r, [b]);
  });
  const median = (v: number[]) => v.sort((p, q) => p - q)[v.length >> 1];
  const lines: Line[] = [...groups.values()].map((group) => {
    group.sort((p, q) => p.x0 - q.x0);
    const base = median(group.map((b) => b.y0));
    return { frame, boxes: group, base, height: median(group.map((b) => b.y1)) - base };
  });

  // Small letters: a clearly taller glyph of the same pen stands a letter space away, on exactly the same baseline
  // (a capital, a d) or hanging from exactly the same top line (a p). Exactly, because a small designator beside a
  // large one ("L3" next to "E1") is placed by hand and sits a little off.
  // Only glyphs whose foot or head is level with the line's can be that neighbour: they are looked up by height on
  // the board, not searched for among every glyph of the drawing.
  const byTop = [...tall].sort((p, q) => p.y1 - q.y1);
  const within = (sorted: Box[], at: (b: Box) => number, lo: number, hi: number): Box[] => {
    let [a, b] = [0, sorted.length];
    while (a < b) {
      const mid = (a + b) >> 1;
      if (at(sorted[mid]) < lo) a = mid + 1;
      else b = mid;
    }
    const out: Box[] = [];
    for (let k = a; k < sorted.length && at(sorted[k]) <= hi; k++) out.push(sorted[k]);
    return out;
  };
  for (const line of lines) {
    const first = line.boxes[0], last = line.boxes[line.boxes.length - 1];
    // "Level" is at most 3 % of a glyph twice the line's height.
    const reach = 0.06 * line.height + 0.01;
    const taller = (t: Box) => {
      const h = t.y1 - t.y0;
      const level = 0.03 * h + 0.01;
      if (h < 1.2 * line.height || h > 2 * line.height || !samePen(t.comp, first.comp)) return false;
      if (Math.abs(t.y0 - line.base) > level && Math.abs(t.y1 - line.base - line.height) > level) return false;
      const gap = Math.max(first.x0, t.x0) - Math.min(last.x1, t.x1);
      return gap >= -0.15 * h && gap <= LETTER_GAP * h;
    };
    line.lower = within(tall, (t) => t.y0, line.base - reach, line.base + reach).some(taller) || within(byTop, (t) => t.y1, line.base + line.height - reach, line.base + line.height + reach).some(taller);
  }

  // Marks: small, inside the band of a word, a letter space from it.
  const words = lines.filter((l) => l.boxes.length >= 2 && !l.lower);
  const letters = new Set(words.flatMap((l) => l.boxes.map((b) => b.comp)));
  const small = boxes.filter((b) => !letters.has(b.comp) && Math.max(b.x1 - b.x0, b.y1 - b.y0) <= MAX_HEIGHT);
  const joined = words.map((_, i) => i);
  const top = (i: number): number => {
    while (joined[i] !== i) i = joined[i] = joined[joined[i]];
    return i;
  };
  const marksOf = new Map<number, Box[]>();
  for (const m of small) {
    const beside: number[] = [];
    words.forEach((line, i) => {
      const h = line.height;
      if (m.y1 - m.y0 > 0.75 * h || m.x1 - m.x0 > 0.95 * h || !samePen(m.comp, line.boxes[0].comp)) return;
      if (m.y0 < line.base - 0.25 * h || m.y1 > line.base + 1.15 * h) return;
      const gap = Math.max(line.boxes[0].x0, m.x0) - Math.min(line.boxes[line.boxes.length - 1].x1, m.x1);
      if (gap <= LETTER_GAP * h) beside.push(i);
    });
    if (!beside.length || beside.length > 2) continue;
    if (beside.length === 2) {
      const a = words[beside[0]], b = words[beside[1]];
      if (Math.abs(a.base - b.base) > 0.08 * a.height + 0.02 || Math.abs(a.height - b.height) > 0.08 * a.height + 0.02) continue;
      joined[top(beside[0])] = top(beside[1]);
    }
    const list = marksOf.get(beside[0]);
    if (list) list.push({ ...m, mark: true });
    else marksOf.set(beside[0], [{ ...m, mark: true }]);
  }
  const merged = new Map<number, Line>();
  words.forEach((line, i) => {
    const r = top(i);
    const into = merged.get(r);
    if (!into) merged.set(r, { ...line, boxes: [...line.boxes, ...(marksOf.get(i) ?? [])] });
    else into.boxes.push(...line.boxes, ...(marksOf.get(i) ?? []));
  });
  for (const line of merged.values()) line.boxes.sort((p, q) => p.x0 - q.x0);
  return [...merged.values(), ...lines.filter((l) => l.boxes.length < 2 || l.lower)];
}

// ───────────────────────────── Reading a word ─────────────────────────────

const DESIGNATOR = /^[A-Z]{1,3}[0-9]{1,4}$/;

type Spelling = {
  text: string;
  /** What the strokes alone say, character by character. */
  raw: string;
  /** Mean unlikeness of the glyphs to the characters of `text`, and the worst one. */
  cost: number;
  worst: number;
  how: "lexicon" | "pattern" | "raw";
  /** What the two reading directions are compared by: the cost, less what the kind of word is worth. */
  rank: number;
};

/**
 * A spelling and the drawn things its characters are, in reading order. `fallbacks` are what else the row could
 * say, best first: other lexicon words, then the reading without a lexicon.
 */
type Reading = Spelling & { boxes: Box[]; fallbacks: Spelling[]; costs?: Float32Array[] };

/** A glyph may be read as a lexicon word's character when it is no more unlike it than this … */
const LEXICON_MAX = 0.1;
/**
 * … and not much further from it than from the character it looks most like: a glyph that matches a known font
 * exactly (a clear 5) is not bent into a 6 because the BoM has an R26; a glyph of an unknown font gets more room.
 */
const lexiconSlack = (best: number) => Math.max(0.012, Math.min(0.035, 0.7 * best));
/**
 * What being in the lexicon is worth when the two directions of a word are compared: enough to beat an equally good
 * reading that is not, never enough to beat a clearly better one (C60 upside down is not the BoM's O90).
 */
const LEXICON_BONUS = 0.012;

/**
 * What a kind of word costs, so that look-alikes (0 / O / D, 1 / I, 5 / S, 8 / B, 2 / Z) fall the way silkscreen
 * text is written: a designator (C10) before a plain word or number (BOARD, 100), before a value (3V3, 12V), before
 * a jumble (C1O, B0ARD). Small against the cost of a wrong character: it only settles what the strokes leave open.
 */
function kindCost(text: string): number {
  if (/^[A-Z]{1,2}[0-9]{1,4}$/.test(text)) return 0;
  const plain = text.replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]*$/.test(plain) || /^[0-9]*$/.test(plain)) return 0.01;
  let changes = 0;
  for (let i = 1; i < plain.length; i++) if (plain[i] <= "9" !== plain[i - 1] <= "9") changes++;
  return 0.02 + 0.015 * (changes - 1);
}

/**
 * What a row of glyphs says, best first: the lexicon words its strokes support, then the reading without a lexicon
 * (always there, always last). `costs[i][k]` is how unlike glyph i is to character k.
 */
function readWord(costs: Float32Array[], lexicon: Map<number, string[]>): Spelling[] {
  const n = costs.length;
  const best = costs.map((c) => {
    let k = 0;
    for (let i = 1; i < c.length; i++) if (c[i] < c[k]) k = i;
    return k;
  });
  const raw = best.map((k) => CHARS[k]).join("");

  const fits: Spelling[] = [];
  for (const w of lexicon.get(n) ?? []) {
    let sum = 0, worst = 0, ok = true;
    for (let i = 0; i < n && ok; i++) {
      const k = CHARS.indexOf(w[i]);
      const c = k < 0 ? Infinity : costs[i][k];
      const least = costs[i][best[i]];
      if (c > LEXICON_MAX || c > least + lexiconSlack(least)) ok = false;
      sum += c;
      if (c > worst) worst = c;
    }
    if (ok) fits.push({ text: w, raw, cost: sum / n, worst, how: "lexicon", rank: sum / n - LEXICON_BONUS });
  }
  fits.sort((p, q) => p.cost - q.cost);

  // Without a lexicon: every way of swapping look-alikes that the kind of word could pay for; the cheapest wins.
  // How far a look-alike may be from the best character grows with how unsure the best is: a glyph that matches a
  // known font exactly is only swapped for a character drawn the same (O and 0).
  const options = costs.map((c, i) => {
    const least = c[best[i]];
    const reach = least + Math.min(0.036, Math.max(0.008, 0.5 * least));
    const list: number[] = [];
    if (n <= 8) for (let k = 0; k < c.length; k++) if (k !== best[i] && c[k] <= reach) list.push(k);
    return [best[i], ...list.sort((p, q) => c[p] - c[q]).slice(0, 3)];
  });
  let plain: Spelling = { text: raw, raw, cost: Infinity, worst: Infinity, how: "raw", rank: Infinity };
  const pick: number[] = [];
  const walk = (i: number, sum: number, worst: number) => {
    if (sum >= plain.rank * n) return;
    if (i === n) {
      const text = pick.map((k) => CHARS[k]).join("");
      const total = sum + kindCost(text);
      if (total < plain.rank * n) plain = { text, raw, cost: sum / n, worst, how: text === raw ? "raw" : "pattern", rank: total / n };
      return;
    }
    for (const k of options[i]) {
      pick[i] = k;
      walk(i + 1, sum + costs[i][k], Math.max(worst, costs[i][k]));
    }
  };
  walk(0, 0, 0);
  return [...fits, plain];
}

/** How a board writes its designators: prefix and number of digits ("R 3" for R016), with how many say so. */
export function designatorStyles(designators: Iterable<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of designators) {
    const m = t.match(/^([A-Z]{1,3})([0-9]{1,4})$/);
    if (m) out.set(`${m[1]} ${m[2].length}`, (out.get(`${m[1]} ${m[2].length}`) ?? 0) + 1);
  }
  return out;
}

/**
 * A row of glyphs spelt the way the board writes its designators (a style three or more of them share), when each
 * glyph may be that character by the lexicon's rule and the designator is not on the board already; the cheapest
 * such spelling. `costs` holds each glyph's unlikeness to every character, in reading order.
 */
export function spellByStyle(costs: Float32Array[], styles: Map<string, number>, taken: Set<string>): { text: string; cost: number; worst: number } | null {
  let best: { text: string; cost: number; worst: number } | null = null;
  for (const [style, count] of styles) {
    const [prefix, digits] = [style.split(" ")[0], Number(style.split(" ")[1])];
    if (count < 3 || prefix.length + digits !== costs.length) continue;
    let text = "", sum = 0, worst = 0, ok = true;
    for (let i = 0; i < costs.length && ok; i++) {
      const c = costs[i];
      let least = 0;
      for (let k = 1; k < c.length; k++) if (c[k] < c[least]) least = k;
      const ks = i < prefix.length ? [CHARS.indexOf(prefix[i])] : DIGITS;
      const k = ks.reduce((a, b) => (c[b] < c[a] ? b : a));
      if (k < 0 || !(c[k] <= LEXICON_MAX && c[k] <= c[least] + lexiconSlack(c[least]))) ok = false;
      text += CHARS[k];
      sum += c[k];
      worst = Math.max(worst, c[k]);
    }
    if (ok && !taken.has(text) && (!best || sum / costs.length < best.cost)) best = { text, cost: sum / costs.length, worst };
  }
  return best;
}

/** The characters' places among the glyph costs: the alphabet the templates know, and the digits in it. */
export const GLYPH_CHARS: readonly string[] = CHARS;
const DIGITS = [..."0123456789"].map((d) => CHARS.indexOf(d)).filter((k) => k >= 0);

export type SilkLabel = {
  /** As read, upper case ("C21", "U3", "+24V", "GND"). */
  text: string;
  /** Centre of the lettering, Gerber mm. */
  x: number;
  y: number;
  /**
   * The way the characters run, first to last, in degrees counter-clockwise seen from the top side. Bottom-side
   * lettering is given as the drawing shows it, from the top: a word read left to right on the bottom runs right to
   * left here (180).
   */
  rotation: 0 | 90 | 180 | 270;
  /** Character height, mm. */
  height: number;
  /** True for bottom-side lettering (drawn mirrored when seen from the top). */
  mirrored: boolean;
  /** 0 – 1: how closely the strokes match the characters. */
  confidence: number;
  /** Looks like a reference designator (letters then digits) or is in the lexicon. */
  designator: boolean;
};

/**
 * A part's drawn outline (box, circle, corner marks): its extent, whether the line closes on itself, whether it is a
 * circle. `edges` (x0, y0, x1, y1 of each straight piece, flat) is kept for a closed outline that is not a plain box
 * (an L-shaped relay, a box with a notch), so what lies in its extent but outside the line can be told apart.
 */
export type SilkOutline = { x0: number; y0: number; x1: number; y1: number; closed: boolean; round: boolean; strokes: number; edges?: number[] };

/** A word is taken as lettering when its glyphs are, on average, no more unlike their characters than this. */
const WORD_MAX = 0.075;
/** Readings this close in both directions (SOMI / IWOS, 69 / 96) are settled by the way the rest of the board reads. */
const EITHER_WAY = 0.004;

type Glyph = { shape: Shape; costs: (Float32Array | undefined)[] };
type Read = { line: Line; turned: boolean; reading: Reading; other: Reading };

/**
 * What a mark beside a word is, from where it sits in the word's band and how big it is (all as shares of the letter
 * height, the word upright): a dot on the baseline, a dash at half height, a line under the word, a cross. Shape
 * matching cannot tell a dash from an underscore; their place can. Null: not a mark, the word is read without it.
 */
function markAt(low: number, high: number, wide: number, cross: boolean): string | null {
  const tall = high - low, mid = (low + high) / 2;
  if (tall <= 0.3 && wide <= 0.3) return low <= 0.2 && low >= -0.15 ? "." : null;
  if (tall <= 0.12 && wide >= 0.2) return mid >= 0.3 && mid <= 0.7 ? "-" : mid <= 0.1 ? "_" : null;
  if (cross && tall >= 0.3 && wide >= 0.3 && Math.abs(tall - wide) <= 0.3 && mid >= 0.3 && mid <= 0.7) return "+";
  return null;
}

/** Two straight strokes, one along x and one along y: a plus sign whichever way the text runs. */
function isCross(c: Comp): boolean {
  if (c.strokes.length !== 2 || c.strokes.some((s) => s.pts.length !== 2)) return false;
  const along = c.strokes.map((s) => Math.abs(s.pts[1][0] - s.pts[0][0]) > Math.abs(s.pts[1][1] - s.pts[0][1]) * 8);
  const up = c.strokes.map((s) => Math.abs(s.pts[1][1] - s.pts[0][1]) > Math.abs(s.pts[1][0] - s.pts[0][0]) * 8);
  return (along[0] && up[1]) || (along[1] && up[0]);
}

/** A mark placed by `markAt` counts as this unlike its character: about what a letter of a known font does. */
const MARK_COST = 0.012;

/** The lexicon by word length: only words as long as the glyph row can be what it says. */
function byLength(words: string[] | undefined): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const w of new Set((words ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean))) {
    const l = out.get(w.length);
    if (l) l.push(w);
    else out.set(w.length, [w]);
  }
  return out;
}

/** Reads every word of the lines both ways up and keeps the better; `mirrored` reads them from the copper side. */
function readLines(lines: Line[], mirrored: boolean, lexicon: Map<number, string[]>, cache: Map<string, Glyph>): Read[] {
  // A letter fills its own box: fonts differ in how far a 4 or a J reaches, so each glyph is measured on its own.
  const glyph = (frame: Frame, b: Box): Glyph => {
    const strokes = b.comp.strokes.map((s) => s.pts.map(([x, y]) => inFrame(frame, x, y)));
    const sq = onSquare(strokes, (b.x0 + b.x1) / 2, b.x1 - b.x0, b.y0, b.y1 - b.y0);
    const key = sq.map((l) => l.map(([u, v]) => `${Math.round(u * 48)},${Math.round(v * 48)}`).join(" ")).join("|");
    let hit = cache.get(key);
    if (!hit) cache.set(key, (hit = { shape: shapeOf(sq), costs: [] }));
    return hit;
  };
  const way = (turned: boolean) => (turned ? 1 : 0) + (mirrored ? 2 : 0);
  return lines.map((line) => {
    const both = [false, true].map((turned): Reading => {
      const costs: Float32Array[] = [];
      const boxes: Box[] = [];
      for (const b of line.boxes) {
        if (!b.mark) {
          const g = glyph(line.frame, b);
          costs.push((g.costs[way(turned)] ??= unlikeness(g.shape, turned, mirrored)));
          boxes.push(b);
          continue;
        }
        const low = (b.y0 - line.base) / line.height, high = (b.y1 - line.base) / line.height;
        const mark = turned ? markAt(1 - high, 1 - low, (b.x1 - b.x0) / line.height, isCross(b.comp)) : markAt(low, high, (b.x1 - b.x0) / line.height, isCross(b.comp));
        if (!mark) continue;
        costs.push(new Float32Array(CHARS.length).fill(Infinity).fill(MARK_COST, CHARS.indexOf(mark), CHARS.indexOf(mark) + 1));
        boxes.push(b);
      }
      // Upright text seen from the top runs left to right; turned or mirrored (not both) it runs right to left.
      if (turned !== mirrored) {
        costs.reverse();
        boxes.reverse();
      }
      const [first, ...fallbacks] = readWord(costs, lexicon);
      return { ...first, boxes, fallbacks, costs };
    });
    const turned = both[1].rank < both[0].rank;
    return { line, turned, reading: both[turned ? 1 : 0], other: both[turned ? 0 : 1] };
  });
}

// ───────────────────────────── Outlines ─────────────────────────────

/** Whether a drawn thing closes on itself (every stroke end meets another) and whether it is a circle. */
function outlineOf(c: Comp): SilkOutline {
  const ends = c.strokes.flatMap((s) => [s.pts[0], s.pts[s.pts.length - 1]]);
  const area = Math.min(c.x1 - c.x0, c.y1 - c.y0) > 3 * TOUCH;
  const closed = area && ends.every((e, i) => ends.some((o, k) => k !== i && Math.hypot(o[0] - e[0], o[1] - e[1]) <= TOUCH));
  // A circle: every point of the line (corners and the middles of its segments) is as far from the middle.
  const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
  let near = Infinity, far = 0, n = 0;
  const reach = (x: number, y: number) => {
    const r = Math.hypot(x - cx, y - cy);
    if (r < near) near = r;
    if (r > far) far = r;
    n++;
  };
  for (const s of c.strokes)
    for (let k = 0; k < s.pts.length; k++) {
      reach(s.pts[k][0], s.pts[k][1]);
      if (k) reach((s.pts[k][0] + s.pts[k - 1][0]) / 2, (s.pts[k][1] + s.pts[k - 1][1]) / 2);
    }
  const round = n >= 12 && area && (far - near) / far < 0.12;
  const out: SilkOutline = { x0: r3(c.x0), y0: r3(c.y0), x1: r3(c.x1), y1: r3(c.y1), closed, round, strokes: c.strokes.length };
  // Its shape, when a corner of the line stands well inside the extent: the box alone would take in what is outside.
  const margin = Math.max(0.5, 0.08 * Math.min(c.x1 - c.x0, c.y1 - c.y0));
  const notched = c.strokes.some((s) => s.pts.some(([x, y]) => x > c.x0 + margin && x < c.x1 - margin && y > c.y0 + margin && y < c.y1 - margin));
  const pieces = c.strokes.reduce((k, s) => k + s.pts.length - 1, 0);
  if (closed && !round && notched && pieces <= 600) out.edges = c.strokes.flatMap((s) => s.pts.slice(1).flatMap((p, i) => [r3(s.pts[i][0]), r3(s.pts[i][1]), r3(p[0]), r3(p[1])]));
  return out;
}

/** A corner mark: two straight arms at a right angle. `dx`, `dy` say which way the arms run from the corner. */
type Corner = { comp: Comp; x: number; y: number; dx: number; dy: number };

function cornerOf(c: Comp): Corner | null {
  const segs = c.strokes.flatMap((s) => s.pts.slice(1).map((p, i) => [s.pts[i], p] as const));
  if (segs.length !== 2) return null;
  const flat = segs.find(([a, b]) => Math.abs(a[1] - b[1]) <= TOUCH && Math.abs(a[0] - b[0]) > TOUCH);
  const up = segs.find(([a, b]) => Math.abs(a[0] - b[0]) <= TOUCH && Math.abs(a[1] - b[1]) > TOUCH);
  if (!flat || !up) return null;
  const x = up[0][0], y = flat[0][1];
  const far = (v: number, a: number, b: number) => (Math.abs(a - v) > Math.abs(b - v) ? a : b);
  // The arms must start at the corner, not cross there (a plus sign is no corner).
  if (Math.min(Math.abs(flat[0][0] - x), Math.abs(flat[1][0] - x)) > TOUCH || Math.min(Math.abs(up[0][1] - y), Math.abs(up[1][1] - y)) > TOUCH) return null;
  return { comp: c, x, y, dx: Math.sign(far(x, flat[0][0], flat[1][0]) - x), dy: Math.sign(far(y, up[0][1], up[1][1]) - y) };
}

/** Corner marks further apart than this are not one part's, mm. */
const FRAME_MAX = 60;

/**
 * Corner marks round one part (a QFN, a BGA) are three or four separate little angles; together they are one
 * outline. Groups the angles that sit on the corners of one rectangle, arms along its sides; the smallest
 * rectangle a mark fits wins.
 *
 * A board can carry thousands of such marks, all on one placement grid, so every pair of them looks like two
 * corners of some rectangle. Corners are found by position in a table, a lower corner is paired only with upper
 * corners within a part's size, and each lower corner offers one rectangle at a time, smallest first: time and
 * memory follow the number of marks near each other, not the square of all of them.
 */
function cornerFrames(comps: Comp[]): { outlines: SilkOutline[]; used: Set<Comp> } {
  const corners = comps.map(cornerOf).filter((c): c is Corner => !!c);
  const CELL = 0.1;
  const key = (i: number, j: number, dx: number, dy: number) => `${i},${j},${dx},${dy}`;
  const table = new Map<string, Corner[]>();
  for (const c of corners) {
    const k = key(Math.round(c.x / CELL), Math.round(c.y / CELL), c.dx, c.dy);
    const list = table.get(k);
    if (list) list.push(c);
    else table.set(k, [c]);
  }
  const at = (x: number, y: number, dx: number, dy: number): Corner | undefined => {
    const [i, j] = [Math.round(x / CELL), Math.round(y / CELL)];
    for (let a = i - 1; a <= i + 1; a++)
      for (let b = j - 1; b <= j + 1; b++) for (const c of table.get(key(a, b, dx, dy)) ?? []) if (Math.abs(c.x - x) <= 0.05 && Math.abs(c.y - y) <= 0.05) return c;
    return undefined;
  };
  // Upper corners by where they are, to find the ones across a part from a lower corner.
  const GRID = 10;
  const upper = new Map<string, Corner[]>();
  for (const c of corners) {
    if (c.dy !== -1) continue;
    const k = `${Math.floor(c.x / GRID)},${Math.floor(c.y / GRID)}`;
    const list = upper.get(k);
    if (list) list.push(c);
    else upper.set(k, [c]);
  }
  type Frame = { from: Corner; members: Corner[]; area: number };
  const used = new Set<Comp>();
  // The upper corners across from a lower one, nearest rectangle first; `next` walks them as they are needed.
  const across = new Map<Corner, { list: Corner[]; i: number }>();
  const next = (a: Corner): Frame | null => {
    let state = across.get(a);
    if (!state) {
      const list: Corner[] = [];
      const [x0, x1] = a.dx > 0 ? [a.x, a.x + FRAME_MAX] : [a.x - FRAME_MAX, a.x];
      for (let i = Math.floor(x0 / GRID); i <= Math.floor(x1 / GRID); i++)
        for (let j = Math.floor(a.y / GRID); j <= Math.floor((a.y + FRAME_MAX) / GRID); j++)
          for (const b of upper.get(`${i},${j}`) ?? []) {
            // a is a lower corner, b the upper corner across the rectangle from it.
            if (a.dx !== -b.dx || (b.x - a.x) * a.dx <= 0.3 || b.y - a.y <= 0.3 || Math.abs(b.x - a.x) > FRAME_MAX || b.y - a.y > FRAME_MAX || !samePen(a.comp, b.comp)) continue;
            list.push(b);
          }
      const area = (b: Corner) => Math.abs(b.x - a.x) * (b.y - a.y);
      state = { list: list.sort((p, q) => area(p) - area(q)), i: 0 };
      across.set(a, state);
    }
    while (state.i < state.list.length) {
      const b = state.list[state.i++];
      const members = [a, b, at(b.x, a.y, b.dx, 1), at(a.x, b.y, a.dx, -1)].filter((c): c is Corner => !!c && samePen(c.comp, a.comp));
      if (members.length >= 3) return { from: a, members, area: Math.abs(b.x - a.x) * (b.y - a.y) };
    }
    return null;
  };
  // Smallest rectangle first over the whole drawing. A rectangle that lost a corner to a smaller one gives way to
  // the next its lower corner fits, which is no smaller, so the order holds.
  const queue: Frame[] = [];
  const offer = (f: Frame | null) => {
    if (!f) return;
    let [lo, hi] = [0, queue.length];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (queue[mid].area > f.area) lo = mid + 1;
      else hi = mid;
    }
    queue.splice(lo, 0, f);
  };
  for (const a of corners) if (a.dy === 1) offer(next(a));
  const outlines: SilkOutline[] = [];
  while (queue.length) {
    const f = queue.pop()!;
    if (f.members.some((m) => used.has(m.comp))) {
      if (!used.has(f.from.comp)) offer(next(f.from));
      continue;
    }
    for (const m of f.members) used.add(m.comp);
    const xs = f.members.map((m) => m.x), ys = f.members.map((m) => m.y);
    outlines.push({ x0: r3(Math.min(...xs)), y0: r3(Math.min(...ys)), x1: r3(Math.max(...xs)), y1: r3(Math.max(...ys)), closed: false, round: false, strokes: f.members.reduce((n, m) => n + m.comp.strokes.length, 0) });
  }
  return { outlines, used };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ───────────────────────────── The whole drawing ─────────────────────────────

/** The smallest drawn thing that can be a part's outline, mm (its longer side): an 0201's bracket is about this. */
const OUTLINE_MIN = 0.8;
/** Below this a reading is noise (two brackets that look like "II"), not a label worth passing on. */
const CONFIDENCE_MIN = 0.3;

/**
 * Two designators printed end to end ("R293FB14") come out as one row of glyphs. They are two labels when the
 * lexicon knows every part, or when the letter space where one ends and the next begins is clearly the widest of the
 * row (a net name such as "I2C4" is spaced evenly and stays whole).
 */
function splitDesignators(r: Reading, known: Set<string>): Reading[] {
  const parts = r.text.match(/[A-Z]{1,3}[0-9]{1,4}/g) ?? [];
  if (parts.length < 2 || parts.join("") !== r.text || known.has(r.text)) return [r];
  const gaps = r.boxes.slice(1).map((b, i) => Math.max(b.x0, r.boxes[i].x0) - Math.min(b.x1, r.boxes[i].x1));
  const cuts: number[] = [];
  for (let at = 0, k = 0; k < parts.length - 1; k++) cuts.push((at += parts[k].length));
  const within = Math.max(...gaps.filter((_, i) => !cuts.includes(i + 1)));
  if (!parts.every((p) => known.has(p)) && !cuts.every((c) => gaps[c - 1] >= 1.25 * within)) return [r];
  let at = 0;
  return parts.map((text) => ({ ...r, text, raw: text, boxes: r.boxes.slice(at, (at += text.length)) }));
}

/**
 * The lettering and the part outlines of one silkscreen drawing. `lexicon` is what the board is expected to say
 * (the BoM's designators): a word the strokes support is read as its lexicon spelling. `mirrored` says the drawing is
 * a bottom side seen from the top; left out, it is found from which way the lettering reads better.
 */
export function readSilk(svg: string | null | undefined, opts?: { lexicon?: string[]; mirrored?: boolean }): { labels: SilkLabel[]; outlines: SilkOutline[] } {
  const comps = components(strokesFromSvg(svg));
  const lexicon = byLength(opts?.lexicon);
  const known = new Set([...lexicon.values()].flat());
  const all = [...linesIn(0, comps), ...linesIn(90, comps)];
  const words = all.filter((l) => l.boxes.length >= 2 && !l.lower);
  const cache = new Map<string, Glyph>();

  let mirrored = opts?.mirrored ?? false;
  let reads = readLines(words, mirrored, lexicon, cache);
  if (opts?.mirrored === undefined) {
    const flipped = readLines(words, true, lexicon, cache);
    const sum = (list: Read[]) => list.reduce((n, r) => n + Math.min(r.reading.cost, WORD_MAX), 0);
    if (sum(flipped) < sum(reads) - 1e-9) {
      mirrored = true;
      reads = flipped;
    }
  }

  // Lettering has more to it than a row of bare lines: two bars of an outline are not "II".
  const lettering = (r: Read) => r.reading.cost <= WORD_MAX && r.reading.boxes.some((b) => !b.mark && b.comp.strokes.reduce((n, k) => n + k.pts.length - 1, 0) >= 2);
  // A glyph can stand in a row along x and in one along y; the better reading has it.
  const taken = new Set<Comp>();
  const kept: Read[] = [];
  for (const r of reads.filter(lettering).sort((a, b) => a.reading.rank - b.reading.rank)) {
    if (r.line.boxes.some((b) => taken.has(b.comp))) continue;
    for (const b of r.line.boxes) taken.add(b.comp);
    kept.push(r);
  }

  // Words that read as well either way up go the way most of the board's lettering along that axis goes.
  const sure = (r: Read) => r.other.rank - r.reading.rank > EITHER_WAY;
  const votes = new Map<string, number>();
  for (const r of kept) if (sure(r)) votes.set(`${r.line.frame}${r.turned}`, (votes.get(`${r.line.frame}${r.turned}`) ?? 0) + 1);
  const settled = new Set<Read>();
  for (const r of kept) {
    if (sure(r)) continue;
    settled.add(r);
    const turned = (votes.get(`${r.line.frame}true`) ?? 0) > (votes.get(`${r.line.frame}false`) ?? 0);
    if (turned !== r.turned) [r.turned, r.reading, r.other] = [turned, r.other, r.reading];
  }

  // A BoM names each designator once. Where two rows read as the same lexicon word, the better one has it; the other
  // takes the next lexicon word its strokes support and nobody has (an 8 an unknown font draws like a 6), or keeps
  // the word when the strokes alone say it too (the board prints it twice), or falls back to its own reading.
  const places = new Map<string, Read[]>();
  for (const r of kept) if (r.reading.how === "lexicon") places.set(r.reading.text, [...(places.get(r.reading.text) ?? []), r]);
  for (const list of places.values())
    for (const r of list.sort((p, q) => p.reading.cost - q.reading.cost).slice(1)) {
      const next = r.reading.fallbacks.find((f) => f.how !== "lexicon" || !places.has(f.text));
      if (!next || (next.how !== "lexicon" && r.reading.raw === r.reading.text)) continue;
      r.reading = { ...next, boxes: r.reading.boxes, fallbacks: [] };
      if (next.how === "lexicon") places.set(next.text, [r]);
    }

  // The board's own way of writing designators settles look-alikes the strokes leave open, as a BoM would: on a board
  // of R016, R051 and R066, a row read ROOS is R005 when each of its glyphs may be that character (the lexicon's rule)
  // and no other row says R005.
  const said = new Set(kept.map((r) => r.reading.text).filter((t) => DESIGNATOR.test(t) || known.has(t)));
  const styles = designatorStyles(said);
  for (const r of kept) {
    const { text, costs } = r.reading;
    if (!costs || costs.length !== text.length || DESIGNATOR.test(text) || known.has(text)) continue;
    const best = spellByStyle(costs, styles, said);
    if (!best) continue;
    said.add(best.text);
    r.reading = { ...best, raw: r.reading.raw, how: "lexicon", rank: best.cost - LEXICON_BONUS, boxes: r.reading.boxes, fallbacks: [], costs };
  }

  const labels: SilkLabel[] = [];
  const doubtful = new Set<Comp>();
  for (const r of kept) {
    const { cost, worst, how, raw, text } = r.reading;
    // 1 at a match with a known font (which still costs about 0.01: the grid is not exact), 0 where a word stops
    // being taken as lettering; less when the lexicon or the rest of the board had to decide what the strokes left open.
    const fit = Math.max(0, Math.min(1, 1.1 - (cost + worst) / 2 / 0.08));
    const confidence = Math.round(fit * (how === "lexicon" && raw !== text ? 0.9 : 1) * (settled.has(r) ? 0.85 : 1) * 100) / 100;
    // A shaky reading that is no designator may as well be two brackets of an outline: they stay outlines too.
    if (confidence < CONFIDENCE_MIN || (confidence < 0.75 && !DESIGNATOR.test(text) && !known.has(text))) for (const b of r.line.boxes) doubtful.add(b.comp);
    if (confidence < CONFIDENCE_MIN) continue;
    // A short line that happens to lie beside a designator (a polarity bar, the end of an outline) is not part of it.
    let whole = r.reading;
    const core = text.replace(/^[-_.+]+|[-_.+]+$/g, "");
    if (core !== text && (DESIGNATOR.test(core) || known.has(core))) {
      const from = text.indexOf(core);
      for (const b of [...whole.boxes.slice(0, from), ...whole.boxes.slice(from + core.length)]) doubtful.add(b.comp);
      whole = { ...whole, text: core, boxes: whole.boxes.slice(from, from + core.length) };
    }
    for (const part of splitDesignators(whole, known)) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const { comp } of part.boxes) {
        x0 = Math.min(x0, comp.x0);
        y0 = Math.min(y0, comp.y0);
        x1 = Math.max(x1, comp.x1);
        y1 = Math.max(y1, comp.y1);
      }
      labels.push({
        text: part.text,
        x: r3((x0 + x1) / 2),
        y: r3((y0 + y1) / 2),
        rotation: ((r.line.frame + (r.turned !== mirrored ? 180 : 0)) % 360) as SilkLabel["rotation"],
        height: r3(r.line.height),
        mirrored,
        confidence,
        designator: DESIGNATOR.test(part.text) || known.has(part.text),
      });
    }
  }

  // Everything else that is big enough is an outline: the two brackets of a chip stand in a row like letters do,
  // so a row that did not read counts. Small letters are lettering, read or not.
  const text = new Set<Comp>();
  for (const c of taken) if (!doubtful.has(c)) text.add(c);
  for (const l of all) if (l.lower) for (const b of l.boxes) text.add(b.comp);
  const free = comps.filter((c) => !text.has(c));
  const frames = cornerFrames(free);
  const outlines = [...frames.outlines, ...free.filter((c) => !frames.used.has(c) && Math.max(c.x1 - c.x0, c.y1 - c.y0) >= OUTLINE_MIN).map(outlineOf)];
  return { labels, outlines };
}
