/**
 * Which pads of a board belong together: one footprint per part, found from the copper alone. A fabrication set often
 * comes without a pick-and-place file; the pads still say where every part sits and what its land pattern is.
 *
 * Pads are never chained by nearness — neighbouring parts are often closer than a part's own pads. Patterns are looked
 * for instead, the surest first, and a pad belongs to one footprint:
 * - through-hole pads (one footprint for both sides; vias left open in the mask are told apart and left out): rows at
 *   a constant pitch, rows stacked into headers and DIPs, two rows far apart with nothing between them (a
 *   transformer), pairs, then lone pads;
 * - ball grids; rows of long thin pads at a constant pitch, put together into quads (four rows round one centre),
 *   duals (two facing rows) and a row with a tab (SOT-223, DPAK, TO-263), with the exposed pad inside them;
 * - two-terminal parts last: alike pads facing each other, paired so that as few pads as possible are left over and
 *   the way the rest of the board pairs the same pads is followed.
 * Where the pads alone leave it open — four alike pads that could be one part or two, pins of two sizes — the pads
 * stay apart unless the board itself or a silkscreen outline says otherwise.
 * Everything is in Gerber millimetres, Y up, and assumes parts at right angles to the board. Pure.
 */
import type { CopperPad, CopperPads } from "./copper-pads";
import { readCopper, type CopperRead } from "./placement-snap";

export type FootprintKind = "chip" | "sot" | "dual" | "quad" | "grid" | "two-pad" | "tht-row" | "tht-grid" | "tht-other" | "single" | "mount-hole" | "fiducial" | "other";

export type Footprint = {
  /** Stable for a board: the side and the rounded centre. */
  id: string;
  /** Through-hole footprints are given as "TOP"; the caller decides the side from the lettering. */
  side: "TOP" | "BOTTOM";
  /** Centre of the land pattern, Gerber mm. */
  x: number;
  y: number;
  /** Direction of the footprint's long axis / pin rows. */
  rotation: 0 | 90;
  pads: CopperPad[];
  /** What the pads read as, in the footprint's own frame. */
  read: CopperRead;
  kind: FootprintKind;
  tht: boolean;
  /** The pads' extent. */
  box: { x0: number; y0: number; x1: number; y1: number };
};

/** A closed silkscreen outline's box: pads inside one outline tend to be one part. A hint, never proof. */
export type OutlineHint = { x0: number; y0: number; x1: number; y1: number; edges?: number[] };

/**
 * Whether a point is enclosed by an outline: strictly inside its extent and, when its shape is known (`edges`, flat
 * x0, y0, x1, y1 per straight piece), with the line on all four sides of it. An L-shaped outline's notch has open
 * sides; lines drawn inside the outline do not change the answer, as they would for an even–odd count.
 */
export function enclosedBy(o: OutlineHint, x: number, y: number): boolean {
  if (x <= o.x0 || x >= o.x1 || y <= o.y0 || y >= o.y1) return false;
  const e = o.edges;
  if (!e?.length) return true;
  let sides = 0;
  for (let i = 0; i + 3 < e.length && sides !== 15; i += 4) {
    const [ax, ay, bx, by] = [e[i], e[i + 1], e[i + 2], e[i + 3]];
    if (ay > y !== by > y) sides |= ax + ((y - ay) / (by - ay)) * (bx - ax) > x ? 1 : 2;
    if (ax > x !== bx > x) sides |= ay + ((x - ax) / (bx - ax)) * (by - ay) > y ? 4 : 8;
  }
  return sides === 15;
}

type Axis = "x" | "y";
/** Pads found to be one part. `kind` is left to the copper's reading when the pattern does not settle it. */
type Group = { pads: CopperPad[]; rotation: 0 | 90; kind: FootprintKind | null };
type Row = { axis: Axis; pads: CopperPad[]; pitch: number };

const at = (p: CopperPad, a: Axis) => (a === "x" ? p.x : p.y);
const size = (p: CopperPad, a: Axis) => (a === "x" ? p.w : p.h);
const cross = (a: Axis): Axis => (a === "x" ? "y" : "x");
const turn = (a: Axis): 0 | 90 => (a === "x" ? 0 : 90);
const area = (p: CopperPad) => p.w * p.h;
const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;

/** Two pads share a line when their centres across it differ by no more than this, mm. */
const ON_LINE = 0.06;

const extent = (pads: CopperPad[]) => ({
  x0: Math.min(...pads.map((p) => p.x - p.w / 2)),
  y0: Math.min(...pads.map((p) => p.y - p.h / 2)),
  x1: Math.max(...pads.map((p) => p.x + p.w / 2)),
  y1: Math.max(...pads.map((p) => p.y + p.h / 2)),
});

/** "Which pads have their centre in this box", in constant time. */
function indexOf(pads: CopperPad[], cell = 4) {
  const g = new Map<string, CopperPad[]>();
  for (const p of pads) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    const l = g.get(k);
    if (l) l.push(p);
    else g.set(k, [p]);
  }
  return (x0: number, y0: number, x1: number, y1: number): CopperPad[] => {
    const out: CopperPad[] = [];
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
      for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++)
        for (const p of g.get(`${i},${j}`) ?? []) if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) out.push(p);
    return out;
  };
}

/**
 * For each pad, the nearest other pad of the list that `ok` allows and how far it is — looked for in a widening
 * box, so a board of thousands of pads costs each pad its neighbourhood, not the whole board.
 */
function nearestOf(pads: CopperPad[], ok: (p: CopperPad, q: CopperPad) => boolean = () => true): Map<CopperPad, { pad: CopperPad; d: number }> {
  const out = new Map<CopperPad, { pad: CopperPad; d: number }>();
  if (pads.length < 2) return out;
  const inBox = indexOf(pads);
  const box = extent(pads);
  const span = Math.max(box.x1 - box.x0, box.y1 - box.y0);
  for (const p of pads) {
    for (let r = 4; ; r *= 2) {
      let best: CopperPad | null = null;
      let bd = Infinity;
      for (const q of inBox(p.x - r, p.y - r, p.x + r, p.y + r)) {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (q !== p && d < bd && ok(p, q)) [best, bd] = [q, d];
      }
      // Anything nearer than the box's half side is the nearest there is; a box past the whole board has seen it all.
      const all = r > span;
      if (best && (bd <= r || all)) out.set(p, { pad: best, d: bd });
      if ((best && bd <= r) || all) break;
    }
  }
  return out;
}

/**
 * Rows of pads along `axis`: each pad is linked to the next pad ahead of it on its line, and a row is a stretch of
 * links at one constant spacing. A change of spacing ends a row — two SOIC-8 end to end are two rows of four, not one
 * of eight — and the pad at the change is offered to both rows. `reach` is how far ahead a pad looks; `link` says
 * whether two neighbours can belong together (the nearest pad ahead is the only candidate, so a pad of another kind
 * standing between two alike pads keeps them apart).
 */
function rowsAlong(pads: CopperPad[], axis: Axis, reach: (a: CopperPad) => number, link: (a: CopperPad, b: CopperPad, s: number) => boolean): Row[] {
  const inBox = indexOf(pads);
  const next = new Map<CopperPad, CopperPad>();
  const led = new Set<CopperPad>();
  for (const a of pads) {
    const r = reach(a);
    const ahead = (axis === "x" ? inBox(a.x + 0.02, a.y - ON_LINE, a.x + r, a.y + ON_LINE) : inBox(a.x - ON_LINE, a.y + 0.02, a.x + ON_LINE, a.y + r)).sort((p, q) => at(p, axis) - at(q, axis))[0];
    if (!ahead || led.has(ahead) || !link(a, ahead, at(ahead, axis) - at(a, axis))) continue;
    next.set(a, ahead);
    led.add(ahead);
  }
  const out: Row[] = [];
  for (const head of pads) {
    if (led.has(head) || !next.has(head)) continue;
    const line = [head];
    for (let p = next.get(head); p; p = next.get(p)) line.push(p);
    let i = 0;
    while (i < line.length - 1) {
      let j = i + 1;
      while (j < line.length - 1) {
        // Against the row's pitch so far; CAM output rounds pad positions, so one pitch reads a few hundredths either way.
        const pitch = (at(line[j], axis) - at(line[i], axis)) / (j - i);
        if (Math.abs(at(line[j + 1], axis) - at(line[j], axis) - pitch) > Math.max(0.06, pitch * 0.03)) break;
        j++;
      }
      out.push({ axis, pads: line.slice(i, j + 1), pitch: (at(line[j], axis) - at(line[i], axis)) / (j - i) });
      i = j;
    }
  }
  return out;
}

/** Hands each pad to the first run that wants it: runs in order, each keeping its longest stretch of free pads. */
function allot(ordered: Row[], taken: Set<CopperPad>): Row[] {
  const out: Row[] = [];
  for (const r of ordered) {
    let best: CopperPad[] = [];
    let cur: CopperPad[] = [];
    for (const p of r.pads) {
      if (taken.has(p)) cur = [];
      else {
        cur.push(p);
        if (cur.length > best.length) best = [...cur];
      }
    }
    if (best.length < 2) continue;
    for (const p of best) taken.add(p);
    out.push({ ...r, pads: best });
  }
  return out;
}

const rowLine = (r: Row) => mean(r.pads.map((p) => at(p, cross(r.axis))));
const rowMid = (r: Row) => (at(r.pads[0], r.axis) + at(r.pads[r.pads.length - 1], r.axis)) / 2;
const rowLen = (r: Row) => at(r.pads[r.pads.length - 1], r.axis) - at(r.pads[0], r.axis);

// ───────────────────────────── Through-hole ─────────────────────────────

/** The same lead: the same hole in about the same pad (pin 1 is often square where the rest are round). */
const sameLead = (a: CopperPad, b: CopperPad) => Math.abs(a.hole - b.hole) <= 0.06 && Math.abs(Math.max(a.w, a.h) - Math.max(b.w, b.h)) <= 0.12 * Math.max(a.w, a.h, b.w, b.h);

/** Lead pitches parts are made in, mm. */
const LEAD_PITCH = [1.27, 2, 2.5, 2.54, 3.5, 3.81, 3.96, 5, 5.08];
/** Row spacings of DIP packages, mm. */
const DIP_ROWS = [7.62, 10.16, 15.24, 22.86];

/**
 * Vias left open in the solder mask (power vias, stitching) look like small through-hole pads. Leads repeat at one
 * pitch with room for solder between them; vias sit wherever the routing put them. A kind of small ring whose pads
 * mostly do not repeat at one distance is the board's vias, and only the ones standing in a regular row are kept; so
 * is a ring that all but touches the next one (a via fence).
 */
function openVias(tht: CopperPad[]): Set<CopperPad> {
  const vias = new Set<CopperPad>();
  const classes = new Map<string, CopperPad[]>();
  for (const p of tht) {
    if (p.shape !== "round" || p.hole > 1 || Math.max(p.w, p.h) > 1.6) continue;
    const k = `${p.hole.toFixed(2)}:${Math.max(p.w, p.h).toFixed(2)}`;
    const l = classes.get(k);
    if (l) l.push(p);
    else classes.set(k, [p]);
  }
  for (const cls of classes.values()) {
    const near = nearestOf(cls);
    const nearest = cls.map((p) => near.get(p)?.d ?? Infinity);
    cls.forEach((p, i) => {
      if (nearest[i] < p.w + 0.05) vias.add(p);
    });
    if (cls.length < 6) continue;
    // The largest share of the pads whose nearest neighbour is at one distance (to 0.06 mm either way).
    const sorted = [...nearest].sort((a, b) => a - b);
    let most = 0;
    for (let i = 0, lo = 0, hi = 0; i < sorted.length; i++) {
      while (sorted[i] - sorted[lo] > 0.06) lo++;
      while (hi < sorted.length && sorted[hi] - sorted[i] <= 0.06) hi++;
      most = Math.max(most, hi - lo);
    }
    if (most / cls.length >= 0.6) continue;
    const regular = new Set<CopperPad>();
    for (const axis of ["x", "y"] as const)
      for (const r of rowsAlong(cls, axis, () => 5.5, () => true))
        if (r.pads.length >= 4 || (r.pads.length === 3 && LEAD_PITCH.some((v) => Math.abs(v - r.pitch) <= 0.05))) for (const p of r.pads) regular.add(p);
    for (const p of cls) if (!regular.has(p)) vias.add(p);
  }
  return vias;
}

/** The lead pads of the board, once each (a plated hole shows on both sides), without the open vias. */
function leadPads(pads: CopperPads): CopperPad[] {
  const top = pads.top.filter((p) => p.hole > 0);
  const onTop = indexOf(top);
  const all = [...top, ...pads.bottom.filter((p) => p.hole > 0 && !onTop(p.x - 0.15, p.y - 0.15, p.x + 0.15, p.y + 0.15).length)];
  const vias = openVias(all);
  return all.filter((p) => !vias.has(p));
}

/** A hole this big is for a screw or a peg, not a lead; such a pad is never grouped. */
const SCREW_HOLE = 3;

/** Three alike pins on one line at one spacing: a header, a DIP's side, a TO-220's leads. */
function evenRow(pads: CopperPad[]): boolean {
  for (const axis of ["x", "y"] as const) {
    const across = cross(axis);
    const lines = new Map<number, CopperPad[]>();
    for (const p of pads) {
      const k = Math.round(at(p, across) / 0.2);
      lines.set(k, [...(lines.get(k) ?? []), p]);
    }
    for (const line of lines.values()) {
      const l = line.sort((a, b) => at(a, axis) - at(b, axis));
      for (let i = 0; i + 2 < l.length; i++) {
        const [g1, g2] = [at(l[i + 1], axis) - at(l[i], axis), at(l[i + 2], axis) - at(l[i + 1], axis)];
        if (g1 > 0.5 && g1 <= 10.5 && Math.abs(g1 - g2) <= 0.06 * g1 && sameLead(l[i], l[i + 1]) && sameLead(l[i + 1], l[i + 2])) return true;
      }
    }
  }
  return false;
}

/**
 * Parts whose pins follow no row or grid (relays, transformers, odd connectors), told by the outline printed round
 * them: the smallest part-sized outline holding three or more pins, none of them in an even row, makes them one part
 * before any pins are paired — pins of neighbouring relays line up and would otherwise pair across the outlines.
 * An outline that holds an even row (a header, a DIP, a heatsink over its transistor) is left to the rows.
 */
function outlinedParts(leads: CopperPad[], hints: OutlineHint[]): { groups: Group[]; rest: CopperPad[] } {
  const claimed = new Set<CopperPad>();
  const groups: Group[] = [];
  const area = (h: OutlineHint) => (h.x1 - h.x0) * (h.y1 - h.y0);
  for (const h of [...hints].sort((a, b) => area(a) - area(b))) {
    const [w, d] = [h.x1 - h.x0, h.y1 - h.y0];
    if (w < 2 || d < 2 || w > 45 || d > 45) continue;
    const pads = leads.filter((p) => !claimed.has(p) && p.hole < SCREW_HOLE && enclosedBy(h, p.x, p.y));
    if (pads.length < 3 || pads.length > 24 || evenRow(pads)) continue;
    for (const p of pads) claimed.add(p);
    const box = extent(pads);
    groups.push({ pads, rotation: box.x1 - box.x0 >= box.y1 - box.y0 ? 0 : 90, kind: "tht-other" });
  }
  return { groups, rest: leads.filter((p) => !claimed.has(p)) };
}

function throughHole(all: CopperPad[], hints: OutlineHint[]): Group[] {
  const { groups: outlined, rest: leads } = outlinedParts(all, hints);
  if (!leads.length) return outlined;
  const inBox = indexOf(leads);
  // Rows: alike pads on one line at one pitch, nothing else between two neighbours.
  const link = (a: CopperPad, b: CopperPad, s: number) => sameLead(a, b) && a.hole < SCREW_HOLE && s <= 30 && s > 0.9 * Math.max(a.w, a.h);
  const found = (["x", "y"] as const).flatMap((axis) => rowsAlong(leads, axis, () => 30, link));
  // Two pads far apart are one part (a heatsink's pins, a big capacitor) only when each is the other's nearest alike pad.
  const alikeNear = nearestOf(leads, sameLead);
  const nearestAlike = (p: CopperPad) => alikeNear.get(p)?.pad;
  const usable = found.filter((r) => (r.pads.length >= 3 ? r.pitch <= 10.5 : r.pitch <= 8 || (nearestAlike(r.pads[0]) === r.pads[1] && nearestAlike(r.pads[1]) === r.pads[0])));
  // The tighter pitch has the pad (a 2 × 10 header is two rows of ten, not ten of two); a row of three or more counts
  // as tighter than a pair, so a pin spaced a little off its row does not break the row.
  const rank = (r: Row) => r.pitch / (r.pads.length >= 3 ? 1.5 : 1);
  const taken = new Set<CopperPad>();
  const rows = allot(usable.sort((a, b) => rank(a) - rank(b) || b.pads.length - a.pads.length), taken);

  // Rows into grids: the same row again at about its own pitch (2 × N headers, a 2 × 2 power header), or at a DIP's
  // row spacing with thin leads. Two TO-220s back to back are 7.6 mm apart too, but their leads are thick.
  const parent = rows.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const between = (a: Row, b: Row, margin: number) => {
    const across = cross(a.axis);
    const [lo, hi] = [Math.min(rowLine(a), rowLine(b)) + margin, Math.max(rowLine(a), rowLine(b)) - margin];
    const [s, e] = [Math.min(at(a.pads[0], a.axis), at(b.pads[0], b.axis)) - 0.3, Math.max(at(a.pads[a.pads.length - 1], a.axis), at(b.pads[b.pads.length - 1], b.axis)) + 0.3];
    return (a.axis === "x" ? inBox(s, lo, e, hi) : inBox(lo, s, hi, e)).filter((p) => at(p, across) > lo && at(p, across) < hi);
  };
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const [a, b] = [rows[i], rows[j]];
      if (a.axis !== b.axis || a.pads.length !== b.pads.length || !sameLead(a.pads[0], b.pads[0]) || Math.abs(a.pitch - b.pitch) > 0.06) continue;
      if (Math.abs(at(a.pads[0], a.axis) - at(b.pads[0], b.axis)) > 0.12) continue;
      const q = Math.abs(rowLine(a) - rowLine(b));
      const grid = q >= 0.6 * a.pitch && q <= 1.35 * a.pitch + 0.05;
      const dip = Math.abs(a.pitch - 2.54) <= 0.08 && a.pads[0].hole <= 1.1 && DIP_ROWS.some((v) => Math.abs(v - q) <= 0.2) && !between(a, b, 0.5).length;
      if (grid || dip) parent[root(i)] = root(j);
    }
  const stacks = new Map<number, Row[]>();
  rows.forEach((r, i) => stacks.set(root(i), [...(stacks.get(root(i)) ?? []), r]));
  const groups: Group[] = [];
  const single: Row[] = [];
  for (const stack of stacks.values()) {
    if (stack.length === 1) single.push(stack[0]);
    else {
      const columns = stack[0].pads.length;
      groups.push({ pads: stack.flatMap((r) => r.pads), rotation: turn(columns >= stack.length ? stack[0].axis : cross(stack[0].axis)), kind: "tht-grid" });
    }
  }
  // Two rows far apart facing each other with no lead between them: a transformer, a relay, a module on pin rows.
  const paired = new Set<Row>();
  const facing = (a: Row, b: Row) => {
    if (a.axis !== b.axis || !sameLead(a.pads[0], b.pads[0]) || Math.abs(a.pitch - b.pitch) > 0.06) return null;
    if (Math.max(a.pads.length, b.pads.length) < 4 || Math.abs(a.pads.length - b.pads.length) > 1) return null;
    const overlap = Math.min(at(a.pads[a.pads.length - 1], a.axis), at(b.pads[b.pads.length - 1], b.axis)) - Math.max(at(a.pads[0], a.axis), at(b.pads[0], b.axis));
    const q = Math.abs(rowLine(a) - rowLine(b));
    if (overlap < 0.7 * Math.min(rowLen(a), rowLen(b)) || q > 45 || q <= 1.35 * a.pitch + 0.05) return null;
    return between(a, b, 0.5).length ? null : q;
  };
  const partner = (a: Row) => single.filter((b) => b !== a && !paired.has(b) && facing(a, b) !== null).sort((x, y) => facing(a, x)! - facing(a, y)!)[0];
  const lone = leads.filter((p) => !taken.has(p));
  for (const a of single) {
    if (paired.has(a)) continue;
    const b = partner(a);
    if (!b || partner(b) !== a) continue;
    paired.add(a).add(b);
    // A pin of the same part spaced off the pitch (a keyed bobbin) stands on a row's line, inside the part.
    const box = extent([...a.pads, ...b.pads]);
    const extra = lone.filter((p) => !taken.has(p) && sameLead(p, a.pads[0]) && p.x >= box.x0 - 0.3 && p.x <= box.x1 + 0.3 && p.y >= box.y0 - 0.3 && p.y <= box.y1 + 0.3);
    for (const p of extra) taken.add(p);
    groups.push({ pads: [...a.pads, ...b.pads, ...extra], rotation: turn(a.axis), kind: "tht-other" });
  }
  // What is left may still be one odd part.
  const weak: Group[] = [];
  for (const r of single) {
    if (paired.has(r)) continue;
    if (r.pads.length >= 3) groups.push({ pads: r.pads, rotation: turn(r.axis), kind: "tht-row" });
    else weak.push({ pads: r.pads, rotation: turn(r.axis), kind: "tht-row" });
  }
  const free = lone.filter((p) => !taken.has(p));
  const used = new Set<CopperPad>();
  for (const p of free) {
    if (used.has(p) || p.hole >= SCREW_HOLE) continue;
    // A kind of pad the board has exactly twice, close together but not in line: one part's two pins.
    const alike = leads.filter((q) => q !== p && sameLead(p, q));
    const q = alike[0];
    if (alike.length === 1 && free.includes(q) && !used.has(q) && Math.hypot(p.x - q.x, p.y - q.y) <= 15) {
      used.add(p).add(q);
      weak.push({ pads: [p, q], rotation: turn(Math.abs(p.x - q.x) >= Math.abs(p.y - q.y) ? "x" : "y"), kind: "tht-other" });
    }
  }
  for (const p of free) if (!used.has(p)) weak.push({ pads: [p], rotation: 0, kind: p.hole >= 2.5 ? "mount-hole" : "single" });

  // A silkscreen outline round nothing but loose pins and pairs makes them one part (a transformer with pins of two
  // sizes). An outline that also holds a full row or grid (a heatsink over its transistor) is left alone.
  const sure = groups.flatMap((g) => g.pads);
  const inside = (h: OutlineHint, p: CopperPad) => (h.edges ? enclosedBy(h, p.x, p.y) : p.x >= h.x0 && p.x <= h.x1 && p.y >= h.y0 && p.y <= h.y1);
  const merged = new Set<Group>();
  for (const h of [...hints].sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))) {
    if (sure.some((p) => inside(h, p))) continue;
    const held = weak.filter((g) => !merged.has(g) && g.kind !== "mount-hole" && g.pads.every((p) => inside(h, p)));
    const n = held.reduce((s, g) => s + g.pads.length, 0);
    if (held.length < 2 || n > 8 || weak.some((g) => !held.includes(g) && g.pads.some((p) => inside(h, p)))) continue;
    for (const g of held) merged.add(g);
    const pads = held.flatMap((g) => g.pads);
    const box = extent(pads);
    groups.push({ pads, rotation: box.x1 - box.x0 >= box.y1 - box.y0 ? 0 : 90, kind: "tht-other" });
  }
  return [...outlined, ...groups, ...weak.filter((g) => !merged.has(g))];
}

// ───────────────────────────── Surface-mount: grids, rows, quads, duals ─────────────────────────────

/** Ball grids: alike round (or square) pads on a square lattice, three or more rows and columns. */
function ballGrids(pads: CopperPad[], taken: Set<CopperPad>): Group[] {
  const out: Group[] = [];
  const classes = new Map<string, CopperPad[]>();
  for (const p of pads) {
    if (Math.abs(p.w - p.h) > 0.03 || p.w > 1.2) continue;
    const k = `${p.shape === "round" ? "o" : "s"}${p.w.toFixed(2)}`;
    classes.set(k, [...(classes.get(k) ?? []), p]);
  }
  for (const cls of classes.values()) {
    if (cls.length < 9) continue;
    const inBox = indexOf(cls, 2);
    const seen = new Set<CopperPad>();
    for (const start of cls) {
      if (seen.has(start)) continue;
      // The lattice pitch here: the nearest alike pad straight along x or y.
      const near = inBox(start.x - 2.2, start.y - 2.2, start.x + 2.2, start.y + 2.2).filter((q) => q !== start && (Math.abs(q.x - start.x) <= 0.03 || Math.abs(q.y - start.y) <= 0.03));
      const pitch = Math.min(...near.map((q) => Math.hypot(q.x - start.x, q.y - start.y)));
      if (!Number.isFinite(pitch) || pitch > 2.2 * start.w + 0.3) {
        seen.add(start);
        continue;
      }
      const comp: CopperPad[] = [];
      const todo = [start];
      seen.add(start);
      while (todo.length) {
        const p = todo.pop()!;
        comp.push(p);
        for (const q of inBox(p.x - pitch - 0.05, p.y - pitch - 0.05, p.x + pitch + 0.05, p.y + pitch + 0.05)) {
          if (seen.has(q)) continue;
          const [dx, dy] = [Math.abs(q.x - p.x), Math.abs(q.y - p.y)];
          if ((dy <= 0.03 && Math.abs(dx - pitch) <= 0.03) || (dx <= 0.03 && Math.abs(dy - pitch) <= 0.03)) {
            seen.add(q);
            todo.push(q);
          }
        }
      }
      const columns = new Set(comp.map((p) => Math.round(p.x / pitch))).size;
      const rowsN = new Set(comp.map((p) => Math.round(p.y / pitch))).size;
      if (comp.length < 9 || columns < 3 || rowsN < 3 || comp.length < columns * rowsN * 0.5) continue;
      for (const p of comp) taken.add(p);
      out.push({ pads: comp, rotation: columns >= rowsN ? 0 : 90, kind: "grid" });
    }
  }
  return out;
}

/** Leads of one IC side by side: the same width along the row, about the same length across it. */
const sameLeadPad = (a: CopperPad, b: CopperPad, axis: Axis) => Math.abs(size(a, axis) - size(b, axis)) <= 0.04 && Math.abs(size(a, cross(axis)) - size(b, cross(axis))) <= 0.3 * Math.max(size(a, cross(axis)), size(b, cross(axis)));

/** Rows of IC leads: pads longer across the row than along it, side by side at one tight pitch. */
function leadRows(pads: CopperPad[]): Row[] {
  const found: Row[] = [];
  for (const axis of ["x", "y"] as const) {
    const long = pads.filter((p) => size(p, cross(axis)) >= 1.2 * size(p, axis));
    const link = (a: CopperPad, b: CopperPad, s: number) => sameLeadPad(a, b, axis) && s - size(a, axis) >= 0.05;
    found.push(...rowsAlong(long, axis, (a) => Math.min(size(a, axis) + 1.5, 3.6 * size(a, axis)), link));
  }
  return allot(found.sort((a, b) => b.pads.length - a.pads.length), new Set());
}

/** Chips come in pairs of pads: an even row whose neighbours read as one chip may be chips end to end; an odd row cannot be. */
const chipChain = (r: Row) => r.pads.length % 2 === 0 && readCopper([r.pads[0], r.pads[1]])?.kind === "chip";

/** Narrower than any solder joint: a polarity mark or lettering in the copper, not a pad — unless it stands in a row. */
const sliver = (p: CopperPad) => Math.min(p.w, p.h) < 0.245;

/** How two alike pads sit to each other, the same wherever that part is used: the pad, which way it faces, how far. */
const pairKey = (a: CopperPad, axis: Axis) => {
  const [lo, hi] = [Math.min(a.w, a.h), Math.max(a.w, a.h)];
  return `${lo.toFixed(2)}x${hi.toFixed(2)}${hi - lo <= 0.03 ? "s" : size(a, axis) === lo ? "n" : "l"}`;
};
/** The pairings seen standing alone, by key and distance (to a tenth of a millimetre either way). */
type Seen = Set<string>;
const seenAs = (seen: Seen, key: string, d: number) => [-1, 0, 1].some((k) => seen.has(`${key}@${Math.round(d * 10) + k}`));

type Facing = { a: Row; b: Row; gap: number };

/**
 * Rows that face each other as the two sides of one part. Among rows stacked A B C D (two ICs side by side: B and C
 * are closer than A and B), the pairing that leaves no row over is taken; with a row over, the closer pair.
 */
function facingRows(rows: Row[]): Facing[] {
  const fits = (a: Row, b: Row): number | null => {
    if (a.axis !== b.axis || !sameLeadPad(a.pads[0], b.pads[0], a.axis) || Math.abs(rowMid(a) - rowMid(b)) > 0.12) return null;
    const [na, nb] = [a.pads.length, b.pads.length];
    const same = na === nb && Math.abs(a.pitch - b.pitch) <= 0.03 * a.pitch + 0.02;
    // SOT-23-5: three leads one side, the outer two the other.
    const threeTwo = Math.min(na, nb) === 2 && Math.max(na, nb) === 3 && Math.abs(Math.max(a.pitch, b.pitch) - 2 * Math.min(a.pitch, b.pitch)) <= 0.06;
    if (!same && !threeTwo) return null;
    const long = Math.max(...a.pads.map((p) => size(p, cross(a.axis))));
    const d = Math.abs(rowLine(a) - rowLine(b));
    // A body lies between the rows: they are further apart than the leads are long, and not further than the part is.
    if (d - long < 0.6 * long || d > Math.max(8, 1.6 * Math.max(rowLen(a), rowLen(b)) + 6)) return null;
    return d;
  };
  const out: Facing[] = [];
  const up = new Map<Row, Row>();
  const down = new Map<Row, Row>();
  for (const a of rows) {
    let best: Row | null = null;
    let bd = Infinity;
    for (const b of rows) {
      if (b === a || rowLine(b) <= rowLine(a)) continue;
      const d = fits(a, b);
      if (d !== null && d < bd) [best, bd] = [b, d];
    }
    if (best) up.set(a, best);
  }
  for (const [a, b] of up) {
    const cur = down.get(b);
    if (!cur || rowLine(a) > rowLine(cur)) down.set(b, a);
  }
  for (const start of rows) {
    if (down.has(start) && up.get(down.get(start)!) === start) continue;
    const chain = [start];
    for (let r = start; up.has(r) && down.get(up.get(r)!) === r; r = up.get(r)!) chain.push(up.get(r)!);
    if (chain.length < 2) continue;
    // Most pairs, then least distance, along the chain.
    type Best = { n: number; cost: number; pairs: Facing[] };
    const best: Best[] = [{ n: 0, cost: 0, pairs: [] }, { n: 0, cost: 0, pairs: [] }];
    for (let i = 1; i < chain.length; i++) {
      const gap = rowLine(chain[i]) - rowLine(chain[i - 1]);
      const skip = best[i];
      const take = { n: best[i - 1].n + 1, cost: best[i - 1].cost + gap, pairs: [...best[i - 1].pairs, { a: chain[i - 1], b: chain[i], gap }] };
      best.push(take.n > skip.n || (take.n === skip.n && take.cost < skip.cost) ? take : skip);
    }
    out.push(...best[best.length - 1].pairs);
  }
  return out;
}

type Work = { groups: Group[]; pool: CopperPad[]; rows: Row[]; all: CopperPad[]; blockers: CopperPad[] };
type Draft = { smd: CopperPad[]; blockers: CopperPad[]; taken: Set<CopperPad>; groups: Group[]; rows: Row[]; alone: Edge[] };

/** One side's ball grids and rows of leads, and the two-pad parts that stand clear of any row. */
function draft(smd: CopperPad[], blockers: CopperPad[]): Draft {
  const taken = new Set<CopperPad>();
  const groups = ballGrids(smd, taken);
  const rows = leadRows(smd.filter((p) => !taken.has(p)));
  const inRow = new Set(rows.filter((r) => r.pads.length >= 3).flatMap((r) => r.pads));
  return { smd, blockers, taken, groups, rows, alone: pairEdges(smd.filter((p) => !taken.has(p) && !inRow.has(p)), smd, blockers, []) };
}

/**
 * The ICs of one side: quads, duals and tab parts from the rows of leads. What is left over goes to the two-pad
 * pairing. `seen` is what the board shows standing alone as two-pad parts: four diodes side by side make two rows of
 * four pads like a resistor array does, and are told from one by the same diode standing alone elsewhere.
 */
function assemble(d: Draft, seen: Seen): Work {
  const { smd, taken } = d;
  const groups = [...d.groups];
  // Chips end to end at an even spacing are not a row of leads when the board uses that chip on its own too.
  const rows = d.rows.filter((r) => !(chipChain(r) && seenAs(seen, pairKey(r.pads[0], r.axis), r.pitch)));
  const pairs = facingRows(rows).filter((f) => !seenAs(seen, pairKey(f.a.pads[0], cross(f.a.axis)), f.gap));
  const padsOf = (f: Facing) => [...f.a.pads, ...f.b.pads];
  const inBox = indexOf(smd);
  // Whatever copper lies inside a part's own ring of leads is under its body and no part of its own. It is the part's
  // exposed pad — in one piece or several — when it sits in the middle; anything else there (a pour showing through
  // one wide mask opening, a pin-1 mark) is left out.
  const withInside = (pads: CopperPad[], minArea: number) => {
    const box = extent(pads);
    const own = new Set(pads);
    const inside = inBox(box.x0 + 0.05, box.y0 + 0.05, box.x1 - 0.05, box.y1 - 0.05).filter((p) => !own.has(p) && !taken.has(p));
    for (const p of inside) taken.add(p);
    const solid = inside.filter((p) => !sliver(p)).sort((a, b) => area(b) - area(a));
    if (!solid.length || area(solid[0]) < minArea) return pads;
    const middle = (set: CopperPad[]) => {
      const e = extent(set);
      return Math.abs((e.x0 + e.x1) / 2 - (box.x0 + box.x1) / 2) <= 0.4 && Math.abs((e.y0 + e.y1) / 2 - (box.y0 + box.y1) / 2) <= 0.4;
    };
    const touching = solid.filter((p) => Math.abs(p.x - solid[0].x) < (p.w + solid[0].w) / 2 && Math.abs(p.y - solid[0].y) < (p.h + solid[0].h) / 2);
    const exposed = [solid, touching, [solid[0]]].find(middle);
    return exposed ? [...pads, ...exposed] : pads;
  };
  // Quads: a pair of rows along x and a pair along y round one centre, each pair outside the other's ends.
  const inQuad = new Set<Facing>();
  const xs = pairs.filter((f) => f.a.axis === "x");
  const ys = pairs.filter((f) => f.a.axis === "y");
  for (const h of xs)
    for (const v of ys) {
      if (inQuad.has(h) || inQuad.has(v) || (h.a.pads.length < 3 && v.a.pads.length < 3)) continue;
      const [hx, hy] = [rowMid(h.a), (rowLine(h.a) + rowLine(h.b)) / 2];
      const [vx, vy] = [(rowLine(v.a) + rowLine(v.b)) / 2, rowMid(v.a)];
      if (Math.abs(hx - vx) > 0.15 || Math.abs(hy - vy) > 0.15 || Math.abs(h.a.pitch - v.a.pitch) > 0.03 * h.a.pitch + 0.02) continue;
      const ring = rowLine(v.a) < at(h.a.pads[0], "x") && rowLine(v.b) > at(h.a.pads[h.a.pads.length - 1], "x") && rowLine(h.a) < at(v.a.pads[0], "y") && rowLine(h.b) > at(v.a.pads[v.a.pads.length - 1], "y");
      if (!ring) continue;
      inQuad.add(h).add(v);
      const leads = [...padsOf(h), ...padsOf(v)];
      for (const p of leads) taken.add(p);
      const box = extent(leads);
      groups.push({ pads: withInside(leads, 0), rotation: box.x1 - box.x0 >= box.y1 - box.y0 - 0.2 ? 0 : 90, kind: "quad" });
    }
  // Duals: the facing pairs with real rows that are not part of a quad. Two pads facing two pads are left to the pairing.
  const used = new Set<Row>([...inQuad].flatMap((f) => [f.a, f.b]));
  const duals = pairs.filter((f) => !inQuad.has(f) && Math.max(f.a.pads.length, f.b.pads.length) >= 3 && padsOf(f).every((p) => !taken.has(p)));
  for (const f of duals) for (const p of padsOf(f)) taken.add(p);
  for (const f of duals) {
    used.add(f.a).add(f.b);
    groups.push({ pads: withInside(padsOf(f), 2.5 * area(f.a.pads[0])), rotation: turn(f.a.axis), kind: "dual" });
  }
  // A row with one big pad facing its middle: SOT-223, DPAK, TO-263. A row left on its own that reads as chips end to
  // end is chips; any other is kept as a row (a flat-cable connector) unless its pads pair off across it.
  const orphans: Row[] = [];
  for (const r of rows) {
    if (used.has(r) || r.pads.length < 3 || r.pads.some((p) => taken.has(p))) continue;
    const tab = tabFor(r.pads, r.axis, smd, taken);
    if (tab) {
      for (const p of [...r.pads, tab]) taken.add(p);
      groups.push({ pads: [...r.pads, tab], rotation: turn(r.axis), kind: "sot" });
    } else if (!chipChain(r)) orphans.push(r);
  }
  return { groups, pool: smd.filter((p) => !taken.has(p)), rows: orphans, all: smd, blockers: d.blockers };
}

/**
 * The big pad that faces the middle of a row of leads (running along `axis`), if there is one. These are power
 * packages: leads at least half a millimetre wide, the body between leads and tab.
 */
function tabFor(leads: CopperPad[], axis: Axis, pads: CopperPad[], taken: Set<CopperPad>): CopperPad | null {
  const across = cross(axis);
  const mid = (at(leads[0], axis) + at(leads[leads.length - 1], axis)) / 2;
  const span = Math.abs(at(leads[leads.length - 1], axis) - at(leads[0], axis)) + size(leads[0], axis);
  const line = mean(leads.map((p) => at(p, across)));
  const long = Math.max(...leads.map((p) => size(p, across)));
  if (size(leads[0], axis) < 0.45) return null;
  let best: CopperPad | null = null;
  let bg = Infinity;
  for (const t of pads) {
    if (taken.has(t) || leads.includes(t) || area(t) < 2.5 * area(leads[0])) continue;
    if (Math.abs(at(t, axis) - mid) > 0.25 || size(t, axis) < 0.45 * span) continue;
    const gap = Math.abs(at(t, across) - line) - size(t, across) / 2 - long / 2;
    if (gap >= 0.35 * span && gap <= 7 && gap < bg) [best, bg] = [t, gap];
  }
  return best;
}

// ───────────────────────────── Surface-mount: two-terminal parts ─────────────────────────────

/** The same pad the same way up: the two pads of one two-terminal part. */
const samePad = (a: CopperPad, b: CopperPad) => Math.abs(a.w - b.w) <= 0.03 && Math.abs(a.h - b.h) <= 0.03;

type Edge = { a: CopperPad; b: CopperPad; axis: Axis; d: number; key: string };
type Tile = { pads: CopperPad[]; rotation: 0 | 90; kind: FootprintKind | null; score: number };

/**
 * Pairs of alike pads that could be one two-terminal part: on one line, facing each other across a gap no wider than
 * a part's body, nothing between them. A pad may have several (its own partner, and the pad of the part beside it).
 * `all` and `blockers` are everything that can stand in the way; leads of one of `rows` are not each other's partners.
 */
function pairEdges(from: CopperPad[], all: CopperPad[], blockers: CopperPad[], rows: Row[]): Edge[] {
  const pool = new Set(from);
  const inBox = indexOf([...all, ...blockers]);
  const rowOf = new Map<CopperPad, Row>();
  for (const r of rows) for (const p of r.pads) rowOf.set(p, r);
  const touches = (a: CopperPad, b: CopperPad) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
  const out: Edge[] = [];
  // Circles are test points and marks, not a part's terminals.
  for (const a of from.filter((p) => !(p.shape === "round" && Math.abs(p.w - p.h) <= 0.03)))
    for (const axis of ["x", "y"] as const) {
      const across = cross(axis);
      const reach = size(a, axis) + 1.7 * Math.max(a.w, a.h) + 0.3;
      const half = size(a, across) / 2;
      const ahead = (axis === "x" ? inBox(a.x + 0.05, a.y - half - 3, a.x + reach, a.y + half + 3) : inBox(a.x - half - 3, a.y + 0.05, a.x + half + 3, a.y + reach))
        // In the way: overlapping the pad's width, and not copper of the pad's own land (footprints drawn over each other).
        .filter((p) => p !== a && Math.abs(at(p, across) - at(a, across)) < (size(p, across) + size(a, across)) / 2 - 0.05 && !touches(p, a))
        .sort((p, q) => at(p, axis) - at(q, axis));
      const b = ahead.find((p) => pool.has(p) && samePad(a, p) && Math.abs(at(p, across) - at(a, across)) <= ON_LINE);
      if (!b || ahead.some((p) => p !== b && at(p, axis) < at(b, axis) && !touches(p, b))) continue;
      const d = at(b, axis) - at(a, axis);
      if (d - size(a, axis) < 0.08) continue;
      const row = rowOf.get(a);
      if (row && row.axis === axis && rowOf.get(b) === row) continue;
      out.push({ a, b, axis, d, key: pairKey(a, axis) });
    }
  return out;
}

/**
 * How well the rest of the board backs a pairing. A part's own two pads are the same distance apart wherever the part
 * is used, and each pad has one such partner; the distance to the part beside it varies, and a pad in a row of parts
 * has a neighbour either side. The score of a pairing is the number of pads with exactly one partner at that distance,
 * less those with two — counted at the very same distance first (two 0402s 1.04 mm apart are not the 1.07 mm of every
 * other 0402 on the board), then at about that distance, for lands put down with rounded positions.
 */
function support(edges: Edge[]): Map<Edge, number> {
  const byKey = new Map<string, Edge[]>();
  for (const e of edges) {
    const list = byKey.get(e.key);
    if (list) list.push(e);
    else byKey.set(e.key, [e]);
  }
  // The score of every pairing of one kind, at distances within `within` of its own. The pairings are in order of
  // distance, so the ones that count for a pairing are a window that slides along them: each enters and leaves once,
  // however many of them there are (a board of thousands of alike chips has them all at one distance).
  const backed = (sorted: Edge[], within: number): number[] => {
    const count = new Map<CopperPad, number>();
    const worth = (c: number) => (c === 0 ? 0 : c === 1 ? 1 : -1);
    let n = 0;
    const bump = (p: CopperPad, by: number) => {
      const c = count.get(p) ?? 0;
      n += worth(c + by) - worth(c);
      count.set(p, c + by);
    };
    const out: number[] = [];
    let [lo, hi] = [0, 0];
    for (const e of sorted) {
      for (; hi < sorted.length && sorted[hi].d - e.d <= within; hi++) for (const p of [sorted[hi].a, sorted[hi].b]) bump(p, 1);
      for (; e.d - sorted[lo].d > within; lo++) for (const p of [sorted[lo].a, sorted[lo].b]) bump(p, -1);
      out.push(n);
    }
    return out;
  };
  const out = new Map<Edge, number>();
  for (const list of byKey.values()) {
    const sorted = [...list].sort((a, b) => a.d - b.d);
    const [exact, about] = [backed(sorted, 0.015), backed(sorted, 0.06)];
    sorted.forEach((e, i) => out.set(e, exact[i] * 1000 + about[i]));
  }
  return out;
}

/** The smallest outline round a pad, and how many of the side's pads it holds. */
function owners(pads: CopperPad[], hints: OutlineHint[]): Map<CopperPad, { hint: OutlineHint; holds: number }> {
  const out = new Map<CopperPad, { hint: OutlineHint; holds: number }>();
  if (!hints.length) return out;
  const inBox = indexOf(pads);
  const sorted = [...hints].sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0));
  for (const hint of sorted) {
    const held = inBox(hint.x0, hint.y0, hint.x1, hint.y1).filter((p) => !hint.edges || enclosedBy(hint, p.x, p.y));
    for (const p of held) if (!out.has(p)) out.set(p, { hint, holds: held.length });
  }
  return out;
}

/** What an outline drawn round exactly these pads adds to a pairing's score: more than any backing from the board. */
const OUTLINED = 1e12;

/** The candidate parts among the leftover pads of one side: pairs, SOT-23 triangles and four-pad blocks. */
function tiles(w: Work, edges: Edge[], score: Map<Edge, number>, chipKeys: Set<string>, hints: OutlineHint[]): Tile[] {
  const out: Tile[] = [];
  const own = owners(w.all, hints);
  const degree = new Map<CopperPad, number>();
  for (const e of edges) for (const p of [e.a, e.b]) degree.set(p, (degree.get(p) ?? 0) + 1);
  for (const e of edges) {
    const [oa, ob] = [own.get(e.a), own.get(e.b)];
    // Each pad in its own two-pad outline: two parts side by side, whatever the distances say.
    if (oa && ob && oa.hint !== ob.hint && oa.holds === 2 && ob.holds === 2) continue;
    const outlined = oa && ob && oa.hint === ob.hint && oa.holds === 2;
    // Two wide pads close together, too wide for a chip that short: two leads of some larger part (a switch, a
    // connector), not a part of their own.
    const [along, wide2] = [size(e.a, e.axis), size(e.a, cross(e.axis))];
    if (!outlined && wide2 >= 1.2 * along && e.d - along < 0.8 * wide2 && readCopper([e.a, e.b])?.kind !== "chip") continue;
    // Chip pads are usually wider across the part than along it; a last word only.
    const wide = size(e.a, cross(e.axis)) >= size(e.a, e.axis);
    out.push({ pads: [e.a, e.b], rotation: turn(e.axis), kind: null, score: (outlined ? OUTLINED : 0) + (score.get(e) ?? 0) * 1000 + (wide ? 100 : 0) - e.d });
  }
  const pool = new Set(w.pool);
  const inBox = indexOf(w.all);
  // SOT-23: two alike pads on a line and a third opposite, exactly between them.
  for (const a of w.pool)
    for (const axis of ["x", "y"] as const) {
      const across = cross(axis);
      const near = axis === "x" ? inBox(a.x + 1.1, a.y - ON_LINE, a.x + 2.1, a.y + ON_LINE) : inBox(a.x - ON_LINE, a.y + 1.1, a.x + ON_LINE, a.y + 2.1);
      for (const b of near) {
        if (!pool.has(b) || !samePad(a, b) || at(b, axis) - at(a, axis) - size(a, axis) < 0.25) continue;
        const mid = (at(a, axis) + at(b, axis)) / 2;
        const third = (axis === "x" ? inBox(mid - 0.08, a.y - 3.3, mid + 0.08, a.y + 3.3) : inBox(a.x - 3.3, mid - 0.08, a.x + 3.3, mid + 0.08)).filter((c) => pool.has(c) && samePad(a, c) && Math.abs(at(c, across) - at(a, across)) >= Math.max(1.4, size(a, across) + 0.2));
        for (const c of third) {
          const box = extent([a, b, c]);
          if (inBox(box.x0, box.y0, box.x1, box.y1).length === 3) out.push({ pads: [a, b, c], rotation: turn(axis), kind: "sot", score: 0 });
        }
      }
    }
  // Four alike pads in a tight block that pair with nothing else: one four-pad part (a crystal, an oscillator) —
  // unless the board uses the same pads at the same spacing as two-pad parts elsewhere, or outlines say otherwise.
  const right = new Map<CopperPad, Edge>();
  const above = new Map<CopperPad, Edge>();
  for (const e of edges) (e.axis === "x" ? right : above).set(e.a, e);
  for (const a of w.pool) {
    const [ab, ac] = [right.get(a), above.get(a)];
    if (!ab || !ac) continue;
    const [cd, bd] = [right.get(ac.b), above.get(ab.b)];
    if (!cd || !bd || cd.b !== bd.b) continue;
    const pads = [a, ab.b, ac.b, cd.b];
    const o = pads.map((p) => own.get(p));
    const outlined = !!o[0] && o.every((x) => x?.hint === o[0]!.hint) && o[0].holds === 4;
    const split = o.some((x) => x && x.holds === 2);
    const tight = ab.d - a.w <= 1.5 * a.w && ac.d - a.h <= 1.5 * a.h;
    const alone = pads.every((p) => degree.get(p) === 2);
    if (split || !(outlined || (tight && alone && !chipKeys.has(ab.key) && !chipKeys.has(ac.key)))) continue;
    out.push({ pads, rotation: ab.d >= ac.d ? 0 : 90, kind: "other", score: outlined ? OUTLINED : 0 });
  }
  return out;
}

/**
 * Pairings a board shows outside tight four-pad blocks: a pad class and spacing used as a two-pad part somewhere, so a
 * block of four of them is two such parts side by side.
 */
function chipEvidence(edges: Edge[]): Set<string> {
  const degree = new Map<CopperPad, number>();
  for (const e of edges) for (const p of [e.a, e.b]) degree.set(p, (degree.get(p) ?? 0) + 1);
  const out = new Set<string>();
  // A pair on its own, or in a longer row of parts: not a block of exactly four.
  for (const e of edges) if (degree.get(e.a) !== 2 || degree.get(e.b) !== 2) out.add(e.key);
  return out;
}

/**
 * Chooses tiles so that no pad is in two: fewest pads left over, then fewest parts (a SOT-23 over a pair and a stray
 * pad), then the best-backed pairings. Exact for a cluster of up to 30 pads; larger clusters are first cut down by
 * taking the pairings both pads rate best.
 */
function cover(all: Tile[]): Tile[] {
  const chosen: Tile[] = [];
  const solve = (list: Tile[], depth: number) => {
    // Clusters: pads joined by any tile.
    const parent = new Map<CopperPad, CopperPad>();
    const root = (p: CopperPad): CopperPad => {
      const q = parent.get(p) ?? p;
      if (q === p) return p;
      const r = root(q);
      parent.set(p, r);
      return r;
    };
    for (const t of list) for (const p of t.pads) parent.set(root(p), root(t.pads[0]));
    const clusters = new Map<CopperPad, Tile[]>();
    for (const t of list) clusters.set(root(t.pads[0]), [...(clusters.get(root(t.pads[0])) ?? []), t]);
    for (const ts of clusters.values()) {
      const pads = [...new Set(ts.flatMap((t) => t.pads))].sort((a, b) => a.x - b.x || a.y - b.y);
      const exact = pads.length <= 30 ? exactCover(pads, ts) : null;
      if (exact) {
        chosen.push(...exact);
        continue;
      }
      // Too big to search: take the pairings both pads rate best and look again at what is left; when the pads agree
      // on none, the best-backed pairings first.
      const best = new Map<CopperPad, Tile>();
      for (const t of ts) for (const p of t.pads) if (!best.has(p) || t.score > best.get(p)!.score) best.set(p, t);
      const agreed = depth < 8 ? ts.filter((t) => t.pads.every((p) => best.get(p) === t)) : [];
      const gone = new Set<CopperPad>();
      for (const t of agreed.length ? agreed : [...ts].sort((x, y) => y.score - x.score)) {
        if (t.pads.some((p) => gone.has(p))) continue;
        chosen.push(t);
        for (const p of t.pads) gone.add(p);
      }
      if (agreed.length) solve(ts.filter((t) => t.pads.every((p) => !gone.has(p))), depth + 1);
    }
  };
  solve(all, 0);
  return chosen;
}

/** The best cover of a small cluster, or null when the search grows too large. */
function exactCover(pads: CopperPad[], ts: Tile[]): Tile[] | null {
  const bit = new Map(pads.map((p, i) => [p, 1 << i]));
  const masks = ts.map((t) => t.pads.reduce((m, p) => m | bit.get(p)!, 0));
  // A tile is tried when its lowest pad is the lowest pad still free.
  const byLowest: number[][] = pads.map(() => []);
  masks.forEach((m, i) => byLowest[31 - Math.clz32(m & -m)].push(i));
  type Res = { left: number; parts: number; score: number; pick: number };
  const memo = new Map<number, Res>();
  const better = (a: Res, b: Res) => a.left < b.left || (a.left === b.left && (a.parts < b.parts || (a.parts === b.parts && a.score > b.score)));
  const go = (free: number): Res | null => {
    if (!free) return { left: 0, parts: 0, score: 0, pick: -1 };
    const hit = memo.get(free);
    if (hit) return hit;
    if (memo.size > 60000) return null;
    const low = free & -free;
    const rest = go(free & ~low);
    if (!rest) return null;
    let best: Res = { left: rest.left + 1, parts: rest.parts, score: rest.score, pick: -1 };
    for (const i of byLowest[31 - Math.clz32(low)]) {
      if ((masks[i] & free) !== masks[i]) continue;
      const r = go(free & ~masks[i]);
      if (!r) return null;
      const cand = { left: r.left, parts: r.parts + 1, score: r.score + ts[i].score, pick: i };
      if (better(cand, best)) best = cand;
    }
    memo.set(free, best);
    return best;
  };
  let free = (1 << pads.length) - 1;
  if (!go(free)) return null;
  const out: Tile[] = [];
  while (free) {
    const r = go(free)!;
    if (r.pick < 0) free &= ~(free & -free);
    else {
      out.push(ts[r.pick]);
      free &= ~masks[r.pick];
    }
  }
  return out;
}

/** The two-terminal parts, SOT-23s and four-pad parts of one side, then the rows and lone pads nothing claimed. */
function pairUp(w: Work, edges: Edge[], score: Map<Edge, number>, chipKeys: Set<string>, hints: OutlineHint[]): Group[] {
  const groups: Group[] = [];
  const taken = new Set<CopperPad>();
  for (const t of cover(tiles(w, edges, score, chipKeys, hints))) {
    for (const p of t.pads) taken.add(p);
    groups.push({ pads: t.pads, rotation: t.rotation, kind: t.kind });
  }
  // DPAK: two leads side by side and the tab facing the middle between them.
  for (const g of groups) {
    if (g.pads.length !== 2 || g.kind) continue;
    const axis: Axis = g.rotation ? "y" : "x";
    if (size(g.pads[0], cross(axis)) < 1.2 * size(g.pads[0], axis)) continue;
    const leads = [...g.pads].sort((a, b) => at(a, axis) - at(b, axis));
    // Far apart for their width, unlike a chip's two pads, and a tab about as wide as the two together.
    if (at(leads[1], axis) - at(leads[0], axis) < 2.5 * size(leads[0], axis)) continue;
    const tab = tabFor(leads, axis, w.pool, taken);
    if (!tab || area(tab) < 4 * area(leads[0]) || size(tab, axis) < 0.8 * (at(leads[1], axis) - at(leads[0], axis))) continue;
    taken.add(tab);
    g.pads = [...g.pads, tab];
    g.kind = "sot";
  }
  // A row of leads with no row facing it: a flat-cable connector, a single-row header.
  for (const r of w.rows) {
    const rest = allot([r], taken)[0];
    if (rest && rest.pads.length >= 3) groups.push({ pads: rest.pads, rotation: turn(r.axis), kind: "other" });
  }
  // Lone pads. A board has a handful of fiducials: small round pads standing clear of everything. Dozens of alike
  // lone round pads are test points.
  const inBox = indexOf([...w.all, ...w.blockers]);
  const lone = w.pool.filter((p) => !taken.has(p) && !sliver(p));
  const clear = (p: CopperPad) => {
    const r = p.w;
    return inBox(p.x - 3 * r - 6, p.y - 3 * r - 6, p.x + 3 * r + 6, p.y + 3 * r + 6).every((q) => q === p || Math.max(Math.abs(q.x - p.x) - q.w / 2, Math.abs(q.y - p.y) - q.h / 2) >= r);
  };
  const marks = lone.filter((p) => p.shape === "round" && Math.abs(p.w - p.h) <= 0.03 && p.w >= 0.5 && p.w <= 2 && clear(p));
  const alike = (p: CopperPad) => marks.filter((q) => Math.abs(q.w - p.w) <= 0.02).length;
  const fiducials = new Set(marks.filter((p) => alike(p) <= 6));
  for (const p of lone) groups.push({ pads: [p], rotation: 0, kind: fiducials.has(p) ? "fiducial" : "single" });
  return groups;
}

// ───────────────────────────── The whole board ─────────────────────────────

function footprint(g: Group, side: "TOP" | "BOTTOM", ids: Set<string>): Footprint {
  const box = extent(g.pads);
  const read = readCopper(g.pads, g.rotation ? Math.PI / 2 : 0)!;
  const kind: FootprintKind = g.kind === "dual" && read.kind === "sot" ? "sot" : (g.kind ?? (read.kind === "chip" ? "chip" : "two-pad"));
  const [x, y] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  // Two footprints drawn over each other (a part and its alternative) share a centre: the pad count tells them apart.
  const first = `${side}:${x.toFixed(2)}:${y.toFixed(2)}`;
  const id = ids.has(first) ? `${first}:${g.pads.length}` : first;
  ids.add(id);
  return {
    id,
    side,
    x: r3(x),
    y: r3(y),
    rotation: g.rotation,
    pads: g.pads,
    read,
    kind,
    tht: g.pads.some((p) => p.hole > 0),
    box: { x0: r3(box.x0), y0: r3(box.y0), x1: r3(box.x1), y1: r3(box.y1) },
  };
}

/**
 * The footprints of a board from the pads of its two outer copper layers. Silkscreen outlines, when the caller has
 * them, settle what the pads leave open: which two of four alike pads are one part, and which loose pins are one.
 */
export function findFootprints(pads: CopperPads, opts?: { outlines?: { top?: OutlineHint[]; bottom?: OutlineHint[] } }): Footprint[] {
  const leads = leadPads(pads);
  const ids = new Set<string>();
  const out: Footprint[] = throughHole(leads, [...(opts?.outlines?.top ?? []), ...(opts?.outlines?.bottom ?? [])]).map((g) => footprint(g, "TOP", ids));
  const sides = [
    { side: "TOP" as const, draft: draft(pads.top.filter((p) => p.hole <= 0), leads), hints: opts?.outlines?.top ?? [] },
    { side: "BOTTOM" as const, draft: draft(pads.bottom.filter((p) => p.hole <= 0), leads), hints: opts?.outlines?.bottom ?? [] },
  ];
  // Both sides are read before anything is decided: an 0805 standing alone on the bottom says what a row of the
  // same pads on the top is, and how they pair.
  const seen: Seen = new Set(sides.flatMap((s) => s.draft.alone.map((e) => `${e.key}@${Math.round(e.d * 10)}`)));
  const work = sides.map((s) => assemble(s.draft, seen));
  const edges = work.map((w) => pairEdges(w.pool, w.all, w.blockers, w.rows));
  const score = support(edges.flat());
  const chipKeys = chipEvidence(edges.flat());
  sides.forEach((s, i) => {
    for (const g of [...work[i].groups, ...pairUp(work[i], edges[i], score, chipKeys, s.hints)]) out.push(footprint(g, s.side, ids));
  });
  return out.sort((a, b) => (a.side === b.side ? a.x - b.x || a.y - b.y : a.side === "TOP" ? -1 : 1));
}
