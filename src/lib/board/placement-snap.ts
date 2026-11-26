/**
 * Puts every placed part on its own pads (Phase 44). A pick-and-place file gives each part a point and a rotation in
 * its CAD tool's frame; the board's copper says where the part really sits. Two things go wrong in practice:
 * - the whole file is offset from the Gerbers (a panel or a CAM re-export with its own zero);
 * - the point is the part's origin in the CAD library, often pin 1, not its centre (Allegro's SYM_X / SYM_Y).
 * `registerPlacements` finds the first, `snapPlacements` corrects the second: around each point, the centre its pads
 * are symmetric about, inside the land pattern its body calls for. Pure; everything in Gerber millimetres, Y up.
 */
import type { CopperPad, CopperPads } from "./copper-pads";

export type SnapBody = { kind: string; length: number; width: number; pins: number; pitch?: number | null };

export type SnapIn = {
  refDes: string;
  x: number;
  y: number;
  rotation: number;
  side: "TOP" | "BOTTOM";
  /** The package's body when known (from the MPN, the BoM's package or the footprint name). */
  body?: SnapBody | null;
  tht?: boolean;
  /** Not fitted: where two footprints are drawn over each other, the fitted part has the pads. */
  dnp?: boolean;
};

/** What the copper under a part is: pad count, extent and what land pattern that reads as. */
export type CopperRead = {
  pads: number;
  /** Extent of the pads, mm, along the part's length and across it. */
  length: number;
  width: number;
  /** Centre-to-centre spacing of neighbouring pads in a row, mm (null for one or two pads). */
  pitch: number | null;
  /** A pad in the middle bigger than the rest (exposed / thermal pad). */
  ep: boolean;
  tht: boolean;
  /**
   * "0402", "SOT-23", "SOIC-8 1.27 mm", "QFN-24 + EP 0.5 mm", "QFP-176 0.5 mm", "BGA-64 0.8 mm", "TO-263",
   * "2 pads 9.4 × 1.3 mm", "2×10 through-hole, 2.54 mm", "DIP-8 2.54 mm", "mounting hole", "6 pads" …
   */
  label: string;
  /** "chip" | "sot" | "dual" | "quad" | "grid" | "tht" | "other" */
  kind: "chip" | "sot" | "dual" | "quad" | "grid" | "tht" | "other";
};

export type Snapped = {
  refDes: string;
  x: number;
  y: number;
  rotation: number;
  /** pads: centred on its pads; kept: copper around it but no land pattern found, file position kept; off-copper: no pad near it. */
  how: "pads" | "kept" | "off-copper";
  /** How far it moved from the file's point (after the whole-file offset), mm. */
  moved: number;
  /** Turned 90° to lie along its pads. */
  turned: boolean;
  copper: CopperRead | null;
};

export type Registration = { dx: number; dy: number; checked: number; before: number; after: number };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const norm = (deg: number) => ((Math.round(deg * 1000) / 1000) % 360 + 360) % 360;

type Index = { near: (x: number, y: number, r: number) => CopperPad[]; all: CopperPad[] };

function index(pads: CopperPad[], cell = 2): Index {
  const g = new Map<string, CopperPad[]>();
  for (const p of pads) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    const l = g.get(k);
    if (l) l.push(p);
    else g.set(k, [p]);
  }
  return {
    all: pads,
    near(x, y, r) {
      const out: CopperPad[] = [];
      const n = Math.ceil(r / cell);
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let i = cx - n; i <= cx + n; i++)
        for (let j = cy - n; j <= cy + n; j++) for (const p of g.get(`${i},${j}`) ?? []) if (Math.hypot(p.x - x, p.y - y) <= r) out.push(p);
      return out;
    },
  };
}

/** The pads a part on this side solders to: its own side, and either side for a through-hole part. */
const sidePads = (ix: { top: Index; bottom: Index }, p: Pick<SnapIn, "side" | "tht">) => (p.side === "BOTTOM" ? ix.bottom : ix.top);

// ───────────────────────────── The whole file against the copper ─────────────────────────────

/** Parts with a pad within this of their point count as on copper when the file is lined up. */
const ON_COPPER = 1.5;

/**
 * The offset that puts the most placement points on copper: offsets between points and pads are voted on a 0.5 mm
 * grid, the best few are refined and counted. The offset is taken only when it puts clearly more parts on copper
 * than none (a file already in the Gerbers' frame is left as it is).
 */
export function registerPlacements(parts: SnapIn[], pads: CopperPads): Registration {
  const ix = { top: index(pads.top), bottom: index(pads.bottom) };
  const usable = parts.filter((p) => (p.side === "BOTTOM" ? pads.bottom : pads.top).length > 0);
  const count = (dx: number, dy: number) => usable.filter((p) => sidePads(ix, p).near(p.x + dx, p.y + dy, ON_COPPER).length > 0).length;
  const before = count(0, 0);
  const none = { dx: 0, dy: 0, checked: usable.length, before, after: before };
  if (usable.length < 3 || before === usable.length) return none;

  // Votes from an even sample of parts, small parts first (their point is close to a pad whatever the convention).
  const size = (p: SnapIn) => (p.body ? p.body.length * p.body.width : 9);
  const sample = [...usable].sort((a, b) => size(a) - size(b)).slice(0, Math.max(20, Math.ceil(usable.length * 0.3))).filter((_, i, a) => a.length <= 80 || i % Math.ceil(a.length / 80) === 0);
  const BIN = 0.5;
  const votes = new Map<string, number>();
  const vectors: [number, number][] = [];
  for (const p of sample)
    for (const q of (p.side === "BOTTOM" ? pads.bottom : pads.top)) {
      const vx = q.x - p.x, vy = q.y - p.y;
      vectors.push([vx, vy]);
      const k = `${Math.round(vx / BIN)},${Math.round(vy / BIN)}`;
      votes.set(k, (votes.get(k) ?? 0) + 1);
    }
  // The busiest bins, each refined to the median of the votes within 1 mm of it: points on pin 1 vote the offset
  // exactly, points at a centre vote half a pad either side of it — the median is the offset both ways.
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;
  const top = [...votes].sort((a, b) => b[1] - a[1]).slice(0, 10);
  let best = { dx: 0, dy: 0, n: before };
  for (const [k] of top) {
    const [bx, by] = k.split(",").map((v) => Number(v) * BIN);
    const close = vectors.filter(([x, y]) => Math.hypot(x - bx, y - by) <= 1);
    const [rx, ry] = close.length ? [med(close.map((v) => v[0])), med(close.map((v) => v[1]))] : [bx, by];
    for (const [dx, dy] of [[rx, ry], [bx, by]]) {
      const n = count(dx, dy);
      if (n > best.n) best = { dx, dy, n };
    }
  }
  const clearlyBetter = best.n >= before + Math.max(3, Math.ceil(usable.length * 0.15)) && best.n >= usable.length * 0.4;
  if (!clearlyBetter) return none;
  const fine = fineOffset(sample, ix, best.dx, best.dy);
  return { dx: r3(fine.dx), dy: r3(fine.dy), checked: usable.length, before, after: Math.max(best.n, count(fine.dx, fine.dy)) };
}

/**
 * The exact offset near a rough one. A file's points sit either on a pad (pin 1, a middle pad) or half-way between
 * two alike pads (a centre): around the rough offset, the shift that puts most points sharply on one of those wins.
 */
function fineOffset(sample: SnapIn[], ix: { top: Index; bottom: Index }, dx0: number, dy0: number): { dx: number; dy: number } {
  const refs = sample.map((p) => {
    const near = sidePads(ix, p).near(p.x + dx0, p.y + dy0, 3);
    const out = near.map((q) => [q.x - p.x, q.y - p.y] as [number, number]);
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++)
        if (samePad(near[i], near[j]) && Math.hypot(near[i].x - near[j].x, near[i].y - near[j].y) <= 2.6) out.push([(near[i].x + near[j].x) / 2 - p.x, (near[i].y + near[j].y) / 2 - p.y]);
    return out;
  });
  const SIGMA = 0.12;
  const score = (dx: number, dy: number) => {
    let s = 0;
    for (const list of refs) {
      let b = 0;
      for (const [rx, ry] of list) b = Math.max(b, Math.exp(-((rx - dx) ** 2 + (ry - dy) ** 2) / (2 * SIGMA * SIGMA)));
      s += b;
    }
    return s;
  };
  let best = { dx: dx0, dy: dy0, s: score(dx0, dy0) };
  for (let i = -24; i <= 24; i++)
    for (let j = -24; j <= 24; j++) {
      const dx = dx0 + i * 0.05, dy = dy0 + j * 0.05;
      const s = score(dx, dy);
      if (s > best.s) best = { dx, dy, s };
    }
  // Settle on the mean of the references that agree within a tenth of a millimetre.
  const close: [number, number][] = [];
  for (const list of refs) {
    const hit = list.filter(([rx, ry]) => Math.hypot(rx - best.dx, ry - best.dy) <= 0.1).sort((a, b) => Math.hypot(a[0] - best.dx, a[1] - best.dy) - Math.hypot(b[0] - best.dx, b[1] - best.dy))[0];
    if (hit) close.push(hit);
  }
  return close.length >= 3 ? { dx: close.reduce((a, v) => a + v[0], 0) / close.length, dy: close.reduce((a, v) => a + v[1], 0) / close.length } : { dx: best.dx, dy: best.dy };
}

// ───────────────────────────── One part onto its pads ─────────────────────────────

/** How far the land pattern reaches beyond the body, mm, along its length and across it, by kind of body. */
const LAND: Record<string, [number, number]> = {
  chip: [0.6, 0.15],
  molded: [1.2, 0.3],
  gullwing: [0.4, 2.8],
  quad: [2.8, 2.8],
  leadless: [0.6, 0.6],
  array: [0.3, 0.3],
  crystal: [0.5, 0.5],
  power: [1.5, 1.5],
  can: [1.2, 0.6],
  connector: [1.5, 1.5],
  module: [1, 1],
  generic: [1, 1],
};

/** The land pattern's extent along the part's own x (length) and y (width), mm. */
function landOf(body: SnapBody | null | undefined): [number, number] {
  if (!body || !(body.length > 0) || !(body.width > 0)) return [3.4, 3.4];
  const [a, b] = LAND[body.kind] ?? LAND.generic;
  return [body.length + a, body.width + b];
}

type Frame = { c: { x: number; y: number }; cos: number; sin: number };
/** A point in the part's frame (x along its length), seen from above. */
const local = (f: Frame, p: { x: number; y: number }) => {
  const dx = p.x - f.c.x, dy = p.y - f.c.y;
  return { u: dx * f.cos + dy * f.sin, v: -dx * f.sin + dy * f.cos };
};

const samePad = (a: CopperPad, b: CopperPad) => Math.abs(a.w - b.w) <= Math.max(a.w, b.w) * 0.25 + 0.03 && Math.abs(a.h - b.h) <= Math.max(a.h, b.h) * 0.25 + 0.03;

/**
 * How many of the pads in the window are symmetric about the centre (as a point, or as a mirror across either of the
 * part's axes — SOT-23 is only the last), and how many in the window are not. Best of the three symmetries.
 */
function symmetry(inside: CopperPad[], c: { x: number; y: number }, ang: number): { matched: CopperPad[]; stray: number } {
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const toBoard = (u: number, v: number) => ({ x: c.x + u * cos - v * sin, y: c.y + u * sin + v * cos });
  const f: Frame = { c, cos, sin };
  let best: CopperPad[] = [];
  for (const mirror of [(u: number, v: number) => [-u, -v], (u: number, v: number) => [-u, v], (u: number, v: number) => [u, -v]] as const) {
    const paired: CopperPad[] = [];
    const self: CopperPad[] = [];
    for (const q of inside) {
      const { u, v } = local(f, q);
      const [mu, mv] = mirror(u, v);
      const m = toBoard(mu, mv);
      const tol = 0.1 + 0.2 * Math.min(q.w, q.h);
      const partner = inside.find((p) => Math.hypot(p.x - m.x, p.y - m.y) <= tol && samePad(p, q));
      if (!partner) continue;
      if (partner === q) self.push(q);
      else paired.push(q);
    }
    // A pad that is its own mirror lies on the axis: SOT-23's third pin, an exposed pad, a SOT-223 tab. Any row of
    // pads is "symmetric" that way, so such pads only count beside real pairs, and two at most.
    if (!paired.length) continue;
    const matched = [...paired, ...self.slice(0, Math.min(2, paired.length))];
    if (matched.length > best.length) best = matched;
  }
  return { matched: best, stray: inside.length - best.length };
}

function insideWindow(pads: CopperPad[], c: { x: number; y: number }, ang: number, land: [number, number]): CopperPad[] {
  const f: Frame = { c, cos: Math.cos(ang), sin: Math.sin(ang) };
  const [hl, hw] = [land[0] / 2 + 0.1, land[1] / 2 + 0.1];
  return pads.filter((q) => {
    const { u, v } = local(f, q);
    return Math.abs(u) <= hl && Math.abs(v) <= hw;
  });
}

const bboxCentre = (pads: CopperPad[]) => {
  const x0 = Math.min(...pads.map((p) => p.x - p.w / 2)), x1 = Math.max(...pads.map((p) => p.x + p.w / 2));
  const y0 = Math.min(...pads.map((p) => p.y - p.h / 2)), y1 = Math.max(...pads.map((p) => p.y + p.h / 2));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
};

type Candidate = { c: { x: number; y: number }; turn: 0 | 90; matched: CopperPad[]; score: number; anchor: CopperPad | null };

/**
 * Which way, in the part's own frame (degrees from its x axis), the centre lies from a pin-1 point, per side; and
 * whether that side's rotations are read mirrored (many CAD tools write a bottom part as seen from below).
 */
export type PinSide = { dir: number; mirrored: boolean } | null;
export type PinPrior = { TOP: PinSide; BOTTOM: PinSide };

/** The pad the file's point sits on, if any: then the point is that pad (pin 1, or the middle pad), not the centre. */
const padUnder = (pads: CopperPad[], x: number, y: number) =>
  pads.filter((q) => Math.abs(q.x - x) <= q.w / 2 * 0.6 + 0.05 && Math.abs(q.y - y) <= q.h / 2 * 0.6 + 0.05).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0] ?? null;

/** Extent of the pad centres along the part's x and y. */
function spans(pads: CopperPad[], c: { x: number; y: number }, ang: number): [number, number] {
  const f: Frame = { c, cos: Math.cos(ang), sin: Math.sin(ang) };
  const pts = pads.map((q) => local(f, q));
  return [Math.max(...pts.map((q) => q.u)) - Math.min(...pts.map((q) => q.u)), Math.max(...pts.map((q) => q.v)) - Math.min(...pts.map((q) => q.v))];
}

const direction = (from: { x: number; y: number }, to: { x: number; y: number }, rotation: number, mirrored = false) => {
  const seen = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const deg = (mirrored ? 180 - seen : seen) - rotation;
  return ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
};

/** The best land pattern around one part's point, or null when there is none. */
function bestFit(p: SnapIn, pads: Index, prior: PinSide, taken?: Set<CopperPad>): Candidate | null {
  const land = landOf(p.body);
  const known = !!p.body && p.body.length > 0 && p.body.width > 0;
  // Footprints are drawn bigger than the nominal body more often than not: pads are gathered from a looser window,
  // stray pads are only counted inside the tight one.
  const loose: [number, number] = [land[0] * 1.35 + 0.4, land[1] * 1.35 + 0.4];
  const reach = Math.hypot(loose[0], loose[1]) / 2 + 0.4;
  const around = pads.near(p.x, p.y, reach + Math.max(...loose) / 2).filter((q) => !taken?.has(q));
  if (!around.length) return null;
  const anchor = padUnder(around, p.x, p.y);
  const nearest = [...around].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 48);
  // Where the centre could be. On a pad: that pad's own centre (a middle pad) or half-way to an alike pad (pin 1 and
  // its opposite). Off pads: the point, or half-way between any two alike pads near it.
  const centres: { x: number; y: number }[] = [];
  if (anchor) {
    centres.push({ x: anchor.x, y: anchor.y });
    for (const q of nearest) if (q !== anchor && samePad(anchor, q)) centres.push({ x: (anchor.x + q.x) / 2, y: (anchor.y + q.y) / 2 });
  } else {
    centres.push({ x: p.x, y: p.y });
    // One of each pair is among the pads nearest the point: the land pattern is round the point, not beyond it.
    for (let i = 0; i < Math.min(12, nearest.length); i++)
      for (let j = i + 1; j < nearest.length; j++) {
        const a = nearest[i], b = nearest[j];
        if (!samePad(a, b)) continue;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (Math.hypot(m.x - p.x, m.y - p.y) <= reach) centres.push(m);
      }
  }
  const square = Math.abs(land[0] - land[1]) < 0.15 * Math.max(land[0], land[1]);
  const scale = Math.max(0.5, Math.min(land[0], land[1]) / 2);
  const want = p.body?.pins && p.body.pins > 0 ? p.body.pins : null;
  const chip = known && (p.body!.kind === "chip" || p.body!.kind === "molded") && (want ?? 2) <= 2;
  let best: Candidate | null = null;
  const tryAt = (c0: { x: number; y: number }, turn: 0 | 90) => {
    const ang = ((p.rotation + turn) * Math.PI) / 180;
    // Settle: centre on the matched pads' box and look again from there.
    let c = c0;
    let matched: CopperPad[] = [];
    for (let k = 0; k < 4; k++) {
      matched = symmetry(insideWindow(around, c, ang, loose), c, ang).matched;
      if (!matched.length) return;
      const next = bboxCentre(matched);
      if (Math.hypot(next.x - c.x, next.y - c.y) < 0.005) break;
      c = next;
    }
    if (anchor && !matched.includes(anchor)) return;
    // From pin 1 the centre is up to half the part away; a point off the pads is meant to be the centre, so only a
    // small correction is believed.
    if (Math.hypot(c.x - p.x, c.y - p.y) > (anchor ? reach : Math.min(1.5, 0.35 * Math.max(...land)))) return;
    const stray = insideWindow(around, c, ang, land).filter((q) => !matched.includes(q)).length;
    const n = matched.length;
    let score = n - stray - (turn ? 0.6 : 0);
    // Off pads the file's point is meant to be the centre: stay near it. On a pad it is pin 1, half a part away.
    if (!anchor) score -= (0.35 * Math.hypot(c.x - p.x, c.y - p.y)) / scale;
    if (known) {
      const [su, sv] = spans(matched, c, ang);
      if (chip) {
        // Two pads as far apart as the body is long (a little less): an 0402's are about 1 mm apart.
        const expect = Math.max(0.45, p.body!.length * 0.95);
        score -= (4 * Math.abs(su - expect)) / expect + (sv > 0.3 ? 2 : 0);
      } else {
        const [eu, ev] = [Math.max(0.5, land[0] - 0.6), Math.max(0.5, land[1] - 0.6)];
        score -= 1.5 * (Math.min(1, Math.abs(su - eu) / eu) + Math.min(1, Math.abs(sv - ev) / ev));
      }
    }
    // The pin count the part has, give or take an exposed pad or mounting tabs; a chip has two pads, no more.
    if (want) score -= 0.25 * Math.max(0, Math.abs(n - want) - 2);
    if (chip) score -= Math.max(0, n - 2);
    // Which side of pin 1 the centre lies, as this board's clear cases show.
    if (anchor && prior && chip && direction(anchor, c, p.rotation, prior.mirrored) === prior.dir) score += 0.8;
    if (!best || score > best.score + 1e-9) best = { c, turn, matched, score, anchor };
  };
  for (const c of centres) {
    tryAt(c, 0);
    if (!square) tryAt(c, 90);
  }
  const b = best as Candidate | null;
  // A lone pad is only a land pattern for a one-pad part.
  if (!b || b.matched.length < Math.min(2, want ?? 2)) return null;
  return b;
}

// ───────────────────────────── Reading the copper ─────────────────────────────

/** IPC chip land patterns by pad centre spacing (mm) — the size a 2-pad footprint was drawn for. */
const CHIP_PITCH: [string, number, number][] = [
  ["01005", 0.3, 0.5],
  ["0201", 0.5, 0.8],
  ["0402", 0.8, 1.25],
  ["0603", 1.25, 1.8],
  ["0805", 1.8, 2.4],
  ["1206", 2.4, 3.6],
  ["1812", 3.6, 5.2],
  ["2512", 5.2, 7.5],
];

/** Body width of each chip size, mm: a chip's pads are about as wide as the chip. */
const CHIP_WIDTH: Record<string, number> = { "01005": 0.2, "0201": 0.3, "0402": 0.5, "0603": 0.8, "0805": 1.25, "1206": 1.6, "1210": 2.5, "1812": 3.2, "2010": 2.5, "2512": 3.2 };

/** Body length of each chip size, mm. */
const CHIP_LENGTH: Record<string, number> = { "01005": 0.4, "0201": 0.6, "0402": 1, "0603": 1.6, "0805": 2, "1206": 3.2, "1210": 3.2, "1812": 4.5, "2010": 5, "2512": 6.3 };

/** The usual distance between the centres of each chip size's two pads, mm. */
const CHIP_SPACING: [string, number][] = [["01005", 0.4], ["0201", 0.65], ["0402", 1], ["0603", 1.55], ["0805", 1.9], ["1206", 3], ["1210", 3], ["1812", 4.4], ["2010", 4.8], ["2512", 6.2]];

/** Row spacings of DIP packages, mm. */
const DIP_ROWS = [7.62, 10.16, 15.24, 22.86];

const PITCHES = [0.4, 0.5, 0.635, 0.65, 0.8, 0.95, 1, 1.27, 1.5, 2, 2.54];
const snapPitch = (v: number) => {
  const hit = [...PITCHES].sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0];
  return Math.abs(hit - v) <= hit * 0.05 ? hit : Math.round(v * 100) / 100;
};

/** What a set of pads reads as, seen in the part's frame (`ang` radians, x along its length). */
export function readCopper(pads: CopperPad[], ang = 0): CopperRead | null {
  if (!pads.length) return null;
  const c = bboxCentre(pads);
  const f: Frame = { c, cos: Math.cos(ang), sin: Math.sin(ang) };
  const pts = pads.map((q) => ({ q, ...local(f, q) }));
  const ext = (k: "u" | "v") => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));
  // Pad extents across the frame: pad size added to the spread of centres.
  const padAlong = (q: CopperPad) => (Math.abs(Math.cos(ang)) > 0.7 ? q.w : q.h);
  const padAcross = (q: CopperPad) => (Math.abs(Math.cos(ang)) > 0.7 ? q.h : q.w);
  const length = r3(ext("u") + Math.max(...pads.map(padAlong)));
  const width = r3(ext("v") + Math.max(...pads.map(padAcross)));
  const tht = pads.some((q) => q.hole > 0);
  const area = (q: CopperPad) => q.w * q.h;
  const big = [...pads].sort((a, b) => area(b) - area(a));
  // An exposed pad: one pad in the middle, well over twice the area of the others.
  let ep = pads.length >= 5 && area(big[0]) > 2.5 * area(big[1]) && Math.hypot(big[0].x - c.x, big[0].y - c.y) < 0.4;
  let leads = ep ? pads.filter((q) => q !== big[0]) : pads;
  // An exposed pad drawn in pieces (windows in the paste, a region each, strips laid over it): the pads well inside
  // the ring of leads, about the middle, are all of it.
  if (pads.length >= 10) {
    const [hu, hv] = [ext("u") / 2, ext("v") / 2];
    const inner = pts.filter((p) => Math.abs(p.u) < hu - 0.5 && Math.abs(p.v) < hv - 0.5).map((p) => p.q);
    const inside = new Set(inner);
    const ring = pads.filter((q) => !inside.has(q));
    if (inner.length && ring.length >= 8 && inner.length * 2 <= ring.length) {
      const m = bboxCentre(inner);
      const pieces = inner.length >= 2 && inner.every((q) => !samePad(q, ring[0])) && Math.hypot(m.x - c.x, m.y - c.y) < 0.4;
      if (ep ? inner.includes(big[0]) : pieces) [ep, leads] = [true, ring];
    }
  }
  const n = leads.length;
  // Rows: pads sharing a line across the part (v for a dual row, both for a quad).
  // (Looked up, not searched: a ball grid has thousands of leads.)
  const isLead = new Set(leads);
  const lp = pts.filter((p) => isLead.has(p.q));
  const groups = (k: "u" | "v") => {
    const m = new Map<number, number[]>();
    for (const p of lp) {
      const key = Math.round(p[k] / 0.2);
      const other = k === "u" ? p.v : p.u;
      const list = m.get(key);
      if (list) list.push(other);
      else m.set(key, [other]);
    }
    return [...m.values()];
  };
  const spacing = (vals: number[]) => {
    const s = [...vals].sort((a, b) => a - b);
    const d = s.slice(1).map((v, i) => v - s[i]).filter((x) => x > 0.05);
    return d.length ? d.sort((a, b) => a - b)[Math.floor(d.length / 2)] : null;
  };
  const kindLabel = (kind: CopperRead["kind"], label: string, pitch: number | null): CopperRead => ({ pads: pads.length, length, width, pitch, ep, tht, label, kind });

  if (tht) {
    // A lone ring round a hole too big for a lead is for a screw.
    if (pads.length === 1) return kindLabel("tht", pads[0].hole >= 2.5 ? "mounting hole" : "1 through-hole pad", null);
    // Pins on a full lattice — a row, a header, a DIP — are named by it: rows × pins a row, and the pitch along a row.
    const steps = (k: "u" | "v") => {
      const s = [...new Set(pts.map((p) => Math.round(p[k] / 0.1)))].sort((a, b) => a - b).filter((x, i, a) => !i || x - a[i - 1] > 1).map((x) => x * 0.1);
      return { n: s.length, pitch: s.length > 1 ? (s[s.length - 1] - s[0]) / (s.length - 1) : null };
    };
    const [cols, rws] = [steps("u"), steps("v")];
    if (cols.n * rws.n === pads.length) {
      const [many, few] = cols.n >= rws.n ? [cols, rws] : [rws, cols];
      const p = many.pitch ? snapPitch(many.pitch) : null;
      if (few.n === 2 && many.n >= 2 && p === 2.54 && DIP_ROWS.some((v) => Math.abs(v - few.pitch!) <= 0.2)) return kindLabel("tht", `DIP-${pads.length} 2.54 mm`, p);
      return kindLabel("tht", `${few.n}×${many.n} through-hole${p ? `, ${p} mm` : ""}`, p);
    }
    const rows = groups("v").filter((g) => g.length >= 2);
    const pitch = rows.length ? spacing(rows.flat()) : null;
    const p = pitch ? snapPitch(pitch) : null;
    return kindLabel("tht", `${pads.length} through-hole pads${p ? `, ${p} mm` : ""}`, p);
  }
  if (pads.length === 1) return kindLabel("other", "1 pad", null);
  if (n === 2 && pads.length === 2) {
    const d = Math.hypot(pads[0].x - pads[1].x, pads[0].y - pads[1].y);
    // A wide pad (across the part) is the 1210 / 1812 / 2010 family rather than 1206 / 0805.
    const alongX = Math.abs(pads[0].x - pads[1].x) >= Math.abs(pads[0].y - pads[1].y);
    const across = Math.min(...pads.map((q) => (alongX ? q.h : q.w)));
    let size = CHIP_PITCH.find(([, lo, hi]) => d >= lo && d < hi)?.[0] ?? null;
    if (size === "1206" && across >= 2.2) size = "1210";
    if (size === "1812" && across < 2.6) size = "2010";
    // A chip cannot be longer than its land: pads drawn long and thin for an 0805 stand as far apart as a 1206's.
    const along = d + Math.min(...pads.map((q) => (alongX ? q.w : q.h)));
    if (size && along < 0.98 * CHIP_LENGTH[size]) {
      size = [...CHIP_SPACING].reverse().find(([nm]) => CHIP_LENGTH[nm] * 1.1 <= along && across >= 0.55 * CHIP_WIDTH[nm] && across <= 1.5 * CHIP_WIDTH[nm])?.[0] ?? null;
    }
    // Pads much narrower or wider than that chip are another kind of part (an aluminium can's long thin pads, a
    // power inductor's, a crystal's): named by the size of its land, which is what a body can be drawn from.
    const fits = (name: string) => across >= 0.55 * CHIP_WIDTH[name] && across <= 1.5 * CHIP_WIDTH[name];
    // Pads drawn close together (a dense 0805 land has its centres 1.6 mm apart) are told by their width as well.
    if (size && !fits(size)) {
      const off = (name: string, at: number) => Math.abs(Math.log(across / CHIP_WIDTH[name])) + Math.abs(Math.log(d / at));
      const [name, cost] = CHIP_SPACING.map(([nm, at]) => [nm, off(nm, at)] as const).sort((a, b) => a[1] - b[1])[0];
      size = cost <= 0.4 ? name : null;
    }
    if (size && fits(size)) return kindLabel("chip", size, null);
    const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
    return kindLabel("other", `2 pads ${one(Math.max(length, width))} × ${one(Math.min(length, width))} mm`, null);
  }
  // A row of alike leads and one big pad off to the side: SOT-223, DPAK, TO-263 — named by the tab's width.
  if (!ep && pads.length >= 3 && area(big[0]) > 2.5 * area(big[1])) {
    const tab = pts.find((p) => p.q === big[0])!;
    const leadPts = pts.filter((p) => p !== tab);
    const k: "u" | "v" | null = leadPts.every((p) => Math.abs(p.v - leadPts[0].v) <= 0.1) ? "u" : leadPts.every((p) => Math.abs(p.u - leadPts[0].u) <= 0.1) ? "v" : null;
    const o = k === "u" ? "v" : "u";
    if (k && leadPts.every((p) => samePad(p.q, leadPts[0].q)) && Math.abs(tab[o] - leadPts[0][o]) > 0.5) {
      const alongX = (k === "u") === Math.abs(Math.cos(ang)) > 0.7;
      const tabAlong = alongX ? tab.q.w : tab.q.h;
      const pitch = leadPts.length > 1 ? spacing(leadPts.map((p) => p[k])) : null;
      const p = pitch ? snapPitch(pitch) : null;
      const m = leadPts.length;
      const name =
        tabAlong >= 7.5 ? (m <= 3 ? "TO-263" : `TO-263-${m}`) : m === 2 && tabAlong >= 4.5 ? "DPAK" : m === 3 && p !== null && Math.abs(p - 2.3) <= 0.15 && tabAlong <= 4.6 ? "SOT-223" : m === 3 && p === 1.5 ? "SOT-89" : `${m} leads and a tab`;
      return kindLabel("sot", name, p);
    }
  }
  const rowsV = groups("v").filter((g) => g.length >= 2);
  const rowsU = groups("u").filter((g) => g.length >= 2);
  // SOT-23 family: 3, 5 or 6 pads in two rows at 0.95 mm (0.65 for SC-70).
  if ((n === 3 || n === 5 || n === 6) && !ep) {
    const pitch = spacing(lp.map((p) => p.u));
    const p = pitch ? snapPitch(pitch) : null;
    const two = new Set(lp.map((x) => Math.round(x.v / 0.3))).size === 2;
    if (two && (p === 0.95 || p === 0.65 || (n === 3 && p === 1.9))) {
      const name = n === 3 ? (p === 0.65 ? "SOT-323" : "SOT-23") : n === 5 ? (p === 0.65 ? "SOT-353" : "SOT-23-5") : p === 0.65 ? "SOT-363" : "SOT-23-6";
      return kindLabel("sot", name, p);
    }
  }
  const uniq = (k: "u" | "v") => new Set(lp.map((x) => Math.round(x[k] / 0.25))).size;
  // Four pads in a 2 × 2 block, far apart for their size: a crystal, oscillator or 4-pad SMD part, read by its size.
  if (n === 4 && !ep && uniq("u") === 2 && uniq("v") === 2) return kindLabel("other", `4-pad ${r3(length)} × ${r3(width)} mm`, null);
  const fmt = (fam: string, p: number | null) => `${fam}-${n}${ep ? " + EP" : ""}${p ? ` ${p} mm` : ""}`;
  // Dual row: every lead on one of two lines across the part.
  if (n >= 4 && uniq("v") === 2 && n % 2 === 0) {
    const pitch = spacing(lp.map((p) => p.u));
    const p = pitch ? snapPitch(pitch) : null;
    const fam = ep || (p !== null && p <= 0.65 && width < 4) ? (ep ? "DFN" : "TSSOP") : p === 1.27 ? "SOIC" : p !== null && p <= 0.65 ? "TSSOP" : "SOIC";
    return kindLabel("dual", fmt(fam, p), p);
  }
  // Quad: leads round all four sides, the middle empty or holding the exposed pad.
  const [halfU, halfV] = [ext("u") / 2, ext("v") / 2];
  const onEdge = lp.filter((x) => Math.abs(Math.abs(x.u) - halfU) < 0.3 || Math.abs(Math.abs(x.v) - halfV) < 0.3).length;
  if (n >= 8 && onEdge >= n * 0.9 && rowsU.length && rowsV.length) {
    const pitch = spacing(rowsV.flat().length > rowsU.flat().length ? lp.map((p) => p.u) : lp.map((p) => p.v));
    const p = pitch ? snapPitch(pitch) : null;
    // A QFP's pads are long and stand outside the body; a QFN's are short.
    const long = Math.max(...leads.map((q) => Math.max(q.w, q.h))) / Math.min(...leads.map((q) => Math.min(q.w, q.h)));
    return kindLabel("quad", fmt(long >= 3.5 && !ep ? "QFP" : "QFN", p), p);
  }
  // Grid: rows and columns both repeat (BGA / LGA).
  if (n >= 9 && uniq("u") >= 3 && uniq("v") >= 3 && lp.length >= uniq("u") * uniq("v") * 0.5) {
    const pitch = spacing(lp.map((p) => p.u));
    const p = pitch ? snapPitch(pitch) : null;
    return kindLabel("grid", `BGA-${n}${p ? ` ${p} mm` : ""}`, p);
  }
  return kindLabel("other", `${pads.length} pads`, null);
}

// ───────────────────────────── The whole board ─────────────────────────────

/**
 * Lines the file up with the copper, then puts each part on its pads. A part whose land pattern lies across its
 * rotation (the CAD tool's zero differs from ours) is turned to its pads.
 */
export function snapPlacements(parts: SnapIn[], pads: CopperPads): { registration: Registration; prior: PinPrior; parts: Snapped[] } {
  const registration = registerPlacements(parts, pads);
  const ix = { top: index(pads.top), bottom: index(pads.bottom) };
  const shifted = parts.map((p0) => ({ ...p0, x: p0.x + registration.dx, y: p0.y + registration.dy }));
  // First pass without a prior: the two-pad parts that leave no doubt say which way pin 2 lies from pin 1, read
  // plain and read mirrored; the reading that agrees with itself is the side's.
  const seen: Record<"TOP" | "BOTTOM", { anchor: { x: number; y: number }; c: { x: number; y: number }; rotation: number }[]> = { TOP: [], BOTTOM: [] };
  for (const p of shifted) {
    if (!p.body || p.body.pins > 2 || !(p.body.kind === "chip" || p.body.kind === "molded")) continue;
    const fit = bestFit(p, sidePads(ix, p), null);
    if (fit?.anchor && fit.matched.length === 2) seen[p.side].push({ anchor: fit.anchor, c: fit.c, rotation: p.rotation });
  }
  const lead = (list: (typeof seen)["TOP"]): PinSide => {
    if (list.length < 3) return null;
    let best: PinSide = null;
    let share = 0;
    for (const mirrored of [false, true]) {
      const m = new Map<number, number>();
      for (const e of list) {
        const d = direction(e.anchor, e.c, e.rotation, mirrored);
        m.set(d, (m.get(d) ?? 0) + 1);
      }
      const [dir, n] = [...m].sort((a, b) => b[1] - a[1])[0];
      if (n / list.length > share) {
        share = n / list.length;
        best = { dir, mirrored };
      }
    }
    return share >= 0.6 ? best : null;
  };
  const prior: PinPrior = { TOP: lead(seen.TOP), BOTTOM: lead(seen.BOTTOM) };

  // Smallest land patterns first: a chip's fit is tight and sure, and its pads are then no longer free for a larger
  // part whose window reaches over them (an IC and its decoupling capacitors). Parts not fitted go last, so where two
  // footprints are drawn over each other the fitted one has the pads. A pad belongs to one part.
  const taken = new Set<CopperPad>();
  const keep = (p: SnapIn, how: Snapped["how"]): Snapped => ({ refDes: p.refDes, x: r3(p.x), y: r3(p.y), rotation: norm(p.rotation), how, moved: 0, turned: false, copper: null });
  const area = (p: SnapIn) => {
    const [a, b] = landOf(p.body);
    return (p.dnp ? 1e6 : 0) + a * b;
  };
  const order = shifted.map((p, i) => ({ p, i })).sort((a, b) => area(a.p) - area(b.p));
  const out: Snapped[] = new Array(shifted.length);
  for (const { p, i } of order) {
    const own = sidePads(ix, p);
    const reach = Math.max(0.5, Math.hypot(...landOf(p.body)) / 2);
    if (!own.near(p.x, p.y, Math.max(1.5, reach + 0.6)).length) {
      out[i] = keep(p, "off-copper");
      continue;
    }
    // A one-pin part (test point, battery contact, solder ring) is its pad: the one under the point or right by it.
    if (p.body?.pins === 1) {
      const q = own.near(p.x, p.y, 1).filter((x) => !taken.has(x)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (!q) {
        out[i] = keep(p, "kept");
        continue;
      }
      taken.add(q);
      out[i] = { refDes: p.refDes, x: r3(q.x), y: r3(q.y), rotation: norm(p.rotation), how: "pads", moved: r3(Math.hypot(q.x - p.x, q.y - p.y)), turned: false, copper: readCopper([q]) };
      continue;
    }
    const fit = bestFit(p, own, prior[p.side], taken);
    if (!fit) {
      out[i] = keep(p, "kept");
      continue;
    }
    for (const q of fit.matched) taken.add(q);
    const rotation = norm(p.rotation + fit.turn);
    out[i] = {
      refDes: p.refDes,
      x: r3(fit.c.x),
      y: r3(fit.c.y),
      rotation,
      how: "pads",
      moved: r3(Math.hypot(fit.c.x - p.x, fit.c.y - p.y)),
      turned: fit.turn !== 0,
      copper: readCopper(fit.matched, (rotation * Math.PI) / 180),
    };
  }
  return { registration, prior, parts: out };
}
