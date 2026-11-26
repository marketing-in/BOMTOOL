/**
 * Where every part of a board sits when no pick-and-place file came with it (Phase 45). The copper says where the
 * footprints are (`findFootprints`), the silkscreen prints each part's designator beside or inside its footprint
 * (`readSilk`), and the BoM says what each designator is. Tying the three together gives one placement per part:
 * the footprint's own centre, its side, the way it lies, and what the copper under it reads as.
 *
 * A label is tied to a footprint by nearness and by fit together. Rows of chips with their names between them leave
 * a single label two or three footprints to choose from, so all labels and footprints of a neighbourhood are settled
 * in one assignment, and what the BoM line says the part is (a 144-pin QFP, an 0805, a two-pin heatsink at 25.4 mm)
 * breaks the ties. A designator whose label was not read takes a footprint only when the count of what is left
 * allows no other reading; it never takes one a read label holds.
 *
 * Everything is in Gerber millimetres, Y up. Pure: no Next.js, no database.
 */
import { copperPads, type CopperPad } from "./copper-pads";
import { enclosedBy, findFootprints, type Footprint } from "./footprints";
import { readSilk, strokesFromSvg, type SilkLabel, type SilkOutline, type SilkStroke } from "./silk-read";
import { signature, signatureLabel } from "./footprint-match";
import { bodyForLine, THROUGH_HOLE_SHAPES, type BodySpec } from "./bodies";
import type { FoundPart, FoundParts } from "./find-parts";
import { inferType, type CfType } from "@/vendor/circuitflow/gerber-entry";
import { expandRefDes } from "@/lib/refdes";

// ───────────────────────────── What goes in and what comes out ─────────────────────────────

/** One BoM line, as far as placing needs it. */
export type PlaceLine = { refDes: string | null; mpn?: string | null; description?: string | null; pkg?: string | null; dnp?: boolean };

/**
 * A small drawn sign that says which way a part lies: the "+" of a capacitor, a pin-1 dot or star, a cut corner of
 * an outline, the notch in the end of an IC's outline, a diode symbol.
 * `dx`, `dy` (a unit vector): for a notch the way it bulges, which is into the part; for a cathode the way the diode
 * symbol points, from anode to cathode.
 */
export type SilkMark = { kind: "plus" | "dot" | "chamfer" | "notch" | "cathode"; x: number; y: number; dx?: number; dy?: number };

/** What one silkscreen drawing gives (`readSilk`, and `silkMarks` over its strokes). */
export type SilkSide = { labels: SilkLabel[]; outlines: SilkOutline[]; marks?: SilkMark[] };

export type PlaceInput = {
  footprints: Footprint[];
  top?: SilkSide | null;
  bottom?: SilkSide | null;
  /** The BoM's lines. None (or empty): the board is read on its own, every lettered footprint keeps its letters. */
  lines?: PlaceLine[] | null;
};

export type SilkPlacement = {
  refDes: string;
  /** The footprint's own centre. */
  x: number;
  y: number;
  /** Degrees counter-clockwise, the body's length along the footprint's long axis (pin rows, or the two pads). */
  rotation: number;
  side: "TOP" | "BOTTOM";
  /** What the copper reads as ("0805", "QFP-144 0.5 mm", "2×10 through-hole, 2.54 mm"). */
  copper: string;
  pads: number;
  /** Extent of the pads along the part and across it, mm. */
  length: number;
  width: number;
  tht: boolean;
  /** The smallest drilled hole of its leads, mm; null for a surface-mount part. */
  drill?: number | null;
  kind: Footprint["kind"];
  /**
   * label: its designator is printed at this footprint; fit: its label was not read, and this is the only footprint
   * left that can be it; unlettered: no designator at the footprint, the name is a running number (Gerbers only).
   */
  how: "label" | "fit" | "unlettered";
  /**
   * What settled which way round the part lies: pads (a tab, or rows of unequal length), copper (one pad shaped
   * unlike the others), silkscreen (a "+", a dot, cut corners), neighbour (a standing power part against its
   * heatsink). Null: nothing said so — the rotation is only the footprint's axis (0 or 90) and may be half a turn off.
   */
  turn: "pads" | "copper" | "silkscreen" | "neighbour" | null;
  /** 0 – 1: how sure the tie between designator and footprint is. */
  confidence: number;
  dnp: boolean;
  footprintId: string;
};

export type PlaceReport = {
  /** BoM designators with no footprint: the label was not read, or nothing near it can be the part. */
  missing: string[];
  /** Designators printed at a footprint that the BoM does not list. */
  extra: { refDes: string; x: number; y: number; side: "TOP" | "BOTTOM"; copper: string }[];
  /** Footprints nobody claimed (mounting holes, fiducials and lone pads left out). */
  unlettered: { id: string; x: number; y: number; side: "TOP" | "BOTTOM"; copper: string; kind: Footprint["kind"] }[];
  /** Placed parts whose BoM line and copper disagree. */
  mismatches: { refDes: string; bom: string; copper: string }[];
  /** Placed parts whose BoM line says nothing the land could be checked against: placed by their designator alone. */
  unchecked: string[];
};

export type PlaceResult = { placements: SilkPlacement[]; report: PlaceReport };

// ───────────────────────────── Geometry ─────────────────────────────

type Box = { x0: number; y0: number; x1: number; y1: number };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const boxGap = (a: Box, b: Box) => Math.hypot(Math.max(a.x0 - b.x1, b.x0 - a.x1, 0), Math.max(a.y0 - b.y1, b.y0 - a.y1, 0));
const grow = (b: Box, by: number): Box => ({ x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by });
const inside = (b: Box, x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/** A character of stroke lettering is about this much of its height wide, spacing included. */
const ADVANCE = 0.85;

/** The room a label takes on the board. */
function labelBox(l: SilkLabel): Box {
  const along = (l.text.length * l.height * ADVANCE) / 2;
  const across = l.height / 2;
  const [hx, hy] = l.rotation % 180 === 0 ? [along, across] : [across, along];
  return { x0: l.x - hx, y0: l.y - hy, x1: l.x + hx, y1: l.y + hy };
}

/** An outline is taken as a footprint's own when it reaches no further than this beyond the pads, mm. */
const OUTLINE_REACH = 12;

/** The smallest drawn outline that holds all of a footprint's pads: the part's body as the silkscreen shows it. */
function hullOf(f: Footprint, outlines: SilkOutline[]): Box | null {
  let best: Box | null = null;
  let bestArea = Infinity;
  for (const o of outlines) {
    if (o.x0 > f.box.x0 + 0.3 || o.y0 > f.box.y0 + 0.3 || o.x1 < f.box.x1 - 0.3 || o.y1 < f.box.y1 - 0.3) continue;
    if (f.box.x0 - o.x0 > OUTLINE_REACH || f.box.y0 - o.y0 > OUTLINE_REACH || o.x1 - f.box.x1 > OUTLINE_REACH || o.y1 - f.box.y1 > OUTLINE_REACH) continue;
    const area = (o.x1 - o.x0) * (o.y1 - o.y0);
    if (area < bestArea) [best, bestArea] = [{ x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1 }, area];
  }
  return best;
}

/** The body a BoM line describes, laid on a footprint: its length along the footprint's axis. */
function bodyBox(f: Footprint, body: BodySpec): Box {
  const [hx, hy] = f.rotation === 0 ? [body.length / 2, body.width / 2] : [body.width / 2, body.length / 2];
  return { x0: f.x - hx, y0: f.y - hy, x1: f.x + hx, y1: f.y + hy };
}

// ───────────────────────────── What a BoM line says the part is ─────────────────────────────

const CHIPS = ["01005", "0201", "0402", "0603", "0805", "1206", "1210", "1812", "2010", "2512"];
const CHIP_LENGTH: Record<string, number> = { "01005": 0.4, "0201": 0.6, "0402": 1, "0603": 1.6, "0805": 2, "1206": 3.2, "1210": 3.2, "1812": 4.5, "2010": 5, "2512": 6.3 };
const CHIP_WIDTH: Record<string, number> = { "01005": 0.2, "0201": 0.3, "0402": 0.5, "0603": 0.8, "0805": 1.25, "1206": 1.6, "1210": 2.5, "1812": 3.2, "2010": 2.5, "2512": 3.2 };

/** Named packages: how many pads their land has, and whether the leads go through the board. */
const NAMED_PADS: Record<string, { pins: number; tht: boolean; exact: boolean }> = {
  "SOT-23": { pins: 3, tht: false, exact: true },
  "SOT-23-5": { pins: 5, tht: false, exact: true },
  "SOT-23-6": { pins: 6, tht: false, exact: true },
  "SOT-323": { pins: 3, tht: false, exact: true },
  "SOT-223": { pins: 4, tht: false, exact: false },
  "SOT-89": { pins: 4, tht: false, exact: false },
  "SOD-123": { pins: 2, tht: false, exact: true },
  "SOD-323": { pins: 2, tht: false, exact: true },
  "SOD-882": { pins: 2, tht: false, exact: true },
  "TO-220": { pins: 3, tht: true, exact: false },
  "TO-92": { pins: 3, tht: true, exact: true },
  "TO-263": { pins: 4, tht: false, exact: false },
  "TO-252": { pins: 3, tht: false, exact: false },
  "DO-41": { pins: 2, tht: true, exact: true },
  SMA: { pins: 2, tht: false, exact: true },
  SMB: { pins: 2, tht: false, exact: true },
  SMC: { pins: 2, tht: false, exact: true },
  "HC-49": { pins: 2, tht: false, exact: false },
};

/**
 * Tab packages: the span over the lead tips and the tab, as a multiple of the body's width (SOT-223: 7.0 mm over a
 * 3.5 mm body; DPAK 9.9–10.4 over 6.1; D2PAK 15.3 over 9.15).
 */
const OVER_LEADS: Partial<Record<NonNullable<BodySpec["shape"]>, number>> = { sot223: 2, dpak: 1.65 };

/** Shapes that are soldered onto the surface whatever their kind says. */
const SURFACE_SHAPES = new Set<NonNullable<BodySpec["shape"]>>(["smdcan", "tantalum", "power-inductor", "hc49-smd", "sot223", "dpak", "fuse"]);
/** Kinds whose pin count is the number of pads on their land. */
const COUNTED_KINDS = new Set<BodySpec["kind"]>(["gullwing", "quad", "leadless", "array"]);
const COUNTED_SHAPES = new Set<NonNullable<BodySpec["shape"]>>(["header", "minifit", "kk-header", "box-header", "latch-header", "dip", "to92", "terminal"]);

type Want = {
  body: BodySpec | null;
  /** A chip size, for a two-terminal chip part. */
  chip: string | null;
  pins: number | null;
  /** The pin count is the pad count (an IC, a header), not a guide (a transformer's bobbin). */
  exact: boolean;
  tht: boolean | null;
  /** In words, for the report. */
  says: string;
};

function chipFromBody(b: BodySpec): string {
  return [...CHIPS].sort((p, q) => Math.abs(CHIP_LENGTH[p] - b.length) + Math.abs(CHIP_WIDTH[p] - b.width) - Math.abs(CHIP_LENGTH[q] - b.length) - Math.abs(CHIP_WIDTH[q] - b.width))[0];
}

/** What a line's part number, description and package say its land must look like. Null: nothing readable. */
function wantOf(line: PlaceLine, ref: string): Want | null {
  const body = bodyForLine({ mpn: line.mpn, description: line.description, pkg: line.pkg, refDes: ref });
  // The description before the footprint name, as the body is read: a library's footprint name is the designer's own.
  const sig = signature(line.description) ?? signature(line.pkg);
  if (body) {
    // A chip by size: the name says so, or the body is a plain chip. A fuse or a moulded part of chip shape is not.
    if (body.kind === "chip" && (sig?.kind === "chip" || !body.shape)) {
      const chip = sig?.kind === "chip" ? sig.size : chipFromBody(body);
      return { body, chip, pins: 2, exact: true, tht: false, says: chip };
    }
    const through = body.shape ? THROUGH_HOLE_SHAPES.has(body.shape) : false;
    const surface = (body.shape ? SURFACE_SHAPES.has(body.shape) : false) || (COUNTED_KINDS.has(body.kind) && !through) || body.kind === "molded" || body.kind === "chip";
    const exact = (COUNTED_KINDS.has(body.kind) || (body.shape ? COUNTED_SHAPES.has(body.shape) : false)) && body.pins >= 3;
    const name = sig && sig.kind !== "chip" ? signatureLabel(sig) : (body.shape ?? body.kind);
    return { body, chip: null, pins: body.pins > 0 ? body.pins : null, exact, tht: through ? true : surface ? false : null, says: body.pins > 2 && !/\d$/.test(name) ? `${name}, ${body.pins} pins` : name };
  }
  if (!sig) return null;
  if (sig.kind === "chip") return { body: null, chip: sig.size, pins: 2, exact: true, tht: false, says: sig.size };
  if (sig.kind === "leaded") return { body: null, chip: null, pins: sig.pins, exact: true, tht: sig.family === "DIP", says: signatureLabel(sig) };
  const named = NAMED_PADS[sig.name];
  return named ? { body: null, chip: null, pins: named.pins, exact: named.exact, tht: named.tht, says: sig.name } : null;
}

/** The leads a footprint has: the count in its name for an IC (an exposed pad is not a lead), else its pads. */
function leadsOf(f: Footprint): number {
  const m = f.kind === "dual" || f.kind === "quad" || f.kind === "grid" || f.tht ? f.read.label.match(/^(?:SOIC|TSSOP|DFN|QFN|QFP|BGA|DIP)-(\d+)/) : null;
  return m ? Number(m[1]) : f.pads.length;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** A land is a little longer than the body on it; far shorter or far longer and it is for another part. 0 fits, 1 does not. */
const sizeCost = (body: number, land: number) => clamp01((Math.abs(Math.log(land / body) - 0.2) - 0.3) / 0.5);
const pitchCost = (a: number | null | undefined, b: number | null | undefined) => (a && b ? clamp01((Math.abs(Math.log(a / b)) - 0.1) / 0.4) : 0);

/** What a designator's letters alone say the footprint should be: 0 the usual land for such a part … 1 an unlikely one; null: cannot be. */
function prefixFit(kind: CfType, ref: string, f: Footprint): number | null {
  const two = f.pads.length === 2;
  const ic = f.kind === "dual" || f.kind === "quad" || f.kind === "grid";
  if (/^(TP|TEST)\d/.test(ref)) return f.kind === "single" ? 0 : two || f.pads.length > 4 ? null : 0.9;
  // A lone pad is a test point; of lettered parts only a connector's own pad can stand alone.
  if (f.kind === "single") return kind === "connector" ? 0.9 : null;
  switch (kind) {
    case "resistor":
    case "capacitor":
    case "inductor":
    case "diode":
    case "led":
    case "fuse":
      if (f.kind === "quad" || f.kind === "grid") return null;
      return two ? 0 : f.kind === "sot" ? 0.4 : f.pads.length <= 8 ? 0.6 : 0.9;
    case "chip":
      return ic || f.kind === "sot" ? 0 : f.kind === "tht-grid" ? 0.2 : two ? 0.9 : 0.4;
    case "transistor":
      return f.kind === "sot" || (f.tht && f.pads.length === 3) ? 0 : f.kind === "dual" ? 0.2 : two ? 0.9 : 0.5;
    case "connector":
      return f.tht || f.kind === "other" ? 0 : f.kind === "dual" ? 0.3 : two ? 0.6 : 0.7;
    case "crystal":
      return f.kind === "two-pad" || (f.kind === "other" && f.pads.length === 4) || (f.tht && two) ? 0 : f.kind === "chip" ? 0.4 : 0.7;
    case "switch":
      return f.kind === "chip" ? 0.7 : 0.2;
    case "module":
      return two ? 0.8 : 0.1;
    default:
      return 0.3;
  }
}

/**
 * How well a footprint can be the part a line describes: 0 it is that land … 1 it hardly can be; null: it cannot
 * (a 144-pin part on two pads, a through-hole part on a surface land).
 */
function misfit(w: Want | null, kind: CfType, ref: string, f: Footprint): number | null {
  if (f.kind === "mount-hole" || f.kind === "fiducial") return null;
  if (!w) return prefixFit(kind, ref, f);
  if (w.tht !== null && w.tht !== f.tht) return null;
  if (f.pads.length === 1 && (w.pins ?? 2) >= 2) return null;
  const n = leadsOf(f);
  const long = Math.max(f.read.length, f.read.width);
  if (w.chip) {
    if (f.pads.length !== 2) return f.pads.length <= 4 ? 1 : null;
    if (f.kind !== "chip") return clamp01(0.3 + sizeCost(CHIP_LENGTH[w.chip], long));
    const d = Math.abs(CHIPS.indexOf(w.chip) - CHIPS.indexOf(f.read.label));
    return d === 0 ? 0 : d === 1 ? 0.5 : d === 2 ? 0.8 : 1;
  }
  if (w.pins === 2) {
    if (f.pads.length > 4) return null;
    const count = f.pads.length === 2 ? 0 : 0.6;
    // Through the board the pins say more than the body, which overhangs them; on the surface the land follows the body.
    const size = f.tht ? pitchCost(w.body?.pitch, f.read.pitch) : w.body ? sizeCost(w.body.length, long) : 0.2;
    return clamp01(count + size);
  }
  if (w.pins !== null && w.pins >= 3) {
    const off = Math.abs(n - w.pins);
    const pitch = f.tht ? pitchCost(w.body?.pitch, f.read.pitch) : 0;
    if (off === 0) return clamp01(pitch);
    // A tab or an exposed pad is a pad some names count and some do not.
    if (off === 1 && (f.kind === "sot" || f.read.ep || w.pins <= 4)) return clamp01(0.3 + pitch);
    if (w.exact) return null;
    const share = off / Math.max(n, w.pins);
    return share > 0.67 ? null : clamp01(0.3 + share + pitch);
  }
  return 0.3;
}

/**
 * A plain disagreement between a BoM line and the land its part was placed on, worth telling a person: another chip
 * size, another count of leads, a body that cannot sit on these pads. Stricter than `misfit`, which only ranks.
 */
function disagrees(w: Want, f: Footprint): boolean {
  const long = Math.max(f.read.length, f.read.width);
  // A row of leads and a tab is four pads whatever the package: a SOT-223, a DPAK and a D2PAK differ in how far it is
  // from the lead tips to the far edge of the tab. The land is a little longer than the part, never shorter and
  // never half as long again.
  const over = w.body?.shape ? OVER_LEADS[w.body.shape] : undefined;
  if (over && f.kind === "sot" && f.pads.length >= 3 && f.pads.some((p) => f.pads.every((q) => q === p || p.w * p.h > 2.5 * q.w * q.h))) {
    const fill = f.read.width / (w.body!.width * over);
    if (fill < 0.9 || fill > 1.45) return true;
  }
  if (w.chip) return f.kind === "chip" ? f.read.label !== w.chip : f.pads.length !== 2 || sizeCost(CHIP_LENGTH[w.chip], long) >= 1;
  if (w.pins === 2) return f.pads.length !== 2 || (!f.tht && !!w.body && sizeCost(w.body.length, long) >= 1);
  if (w.pins === null || w.pins < 3 || !w.exact) return false;
  const off = Math.abs(leadsOf(f) - w.pins);
  return off > 1 || (off === 1 && !(f.kind === "sot" || f.read.ep || w.pins <= 4));
}

// ───────────────────────────── One assignment per neighbourhood ─────────────────────────────

/** A label looks for its footprint no further than this from its own box, mm. */
const REACH = 6;
/** A full misfit weighs as much as this many millimetres between label and footprint. */
const FIT_WEIGHT = 2.5;
/** A tie whose nearness and misfit together cost more than this is not made. */
const MAX_COST = 6;
/** The centre-to-centre distance counts a little, to part labels that touch two footprints alike. */
const CENTRE_WEIGHT = 0.05;

/**
 * Minimum-cost assignment over the ties that are possible at all: `rows[i]` lists the columns row i can take and
 * what each costs (never negative); staying without a column costs `stay`. Returns each row's column, or -1.
 *
 * Shortest augmenting paths with potentials (Kuhn–Munkres on a sparse graph). A row's search spreads only through
 * the rows and columns it competes with, so time and memory follow the number of possible ties — a board of
 * thousands of alike chips, every label within reach of a dozen footprints, is no dense thousand-by-thousand table.
 */
export function assignSparse(rows: { col: number; cost: number }[][], columns: number, stay: number): number[] {
  const n = rows.length;
  // Column `columns + i` is row i's own way of staying without a footprint.
  const u = new Float64Array(n);
  const v = new Float64Array(columns + n);
  const rowOf = new Int32Array(columns + n).fill(-1);
  const colOf = new Int32Array(n).fill(-1);
  for (let start = 0; start < n; start++) {
    const dist = new Map<number, number>();
    const from = new Map<number, number>();
    const done: number[] = [];
    const closed = new Set<number>();
    // A binary heap of [distance, column]; stale entries are skipped when they come up.
    const heap: [number, number][] = [];
    const push = (d: number, col: number) => {
      heap.push([d, col]);
      for (let k = heap.length - 1; k > 0; ) {
        const up = (k - 1) >> 1;
        if (heap[up][0] <= heap[k][0]) break;
        [heap[up], heap[k]] = [heap[k], heap[up]];
        k = up;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let k = 0; ; ) {
          const [l, r] = [2 * k + 1, 2 * k + 2];
          let least = k;
          if (l < heap.length && heap[l][0] < heap[least][0]) least = l;
          if (r < heap.length && heap[r][0] < heap[least][0]) least = r;
          if (least === k) break;
          [heap[least], heap[k]] = [heap[k], heap[least]];
          k = least;
        }
      }
      return top;
    };
    const relax = (row: number, base: number) => {
      const offer = (col: number, cost: number) => {
        if (closed.has(col)) return;
        const d = base + cost - u[row] - v[col];
        if (d < (dist.get(col) ?? Infinity)) {
          dist.set(col, d);
          from.set(col, row);
          push(d, col);
        }
      };
      for (const e of rows[row]) offer(e.col, e.cost);
      offer(columns + row, stay);
    };
    relax(start, 0);
    let end = -1;
    let reach = 0;
    while (heap.length) {
      const [d, col] = pop();
      if (closed.has(col) || d > (dist.get(col) ?? Infinity)) continue;
      closed.add(col);
      done.push(col);
      if (rowOf[col] === -1) {
        [end, reach] = [col, d];
        break;
      }
      relax(rowOf[col], d);
    }
    // Every row can stay without a column, so a free column is always reached.
    for (const col of done) {
      const d = dist.get(col)!;
      if (rowOf[col] !== -1) u[rowOf[col]] += reach - d;
      v[col] -= reach - d;
    }
    u[start] += reach;
    for (let col = end; col !== -1; ) {
      const row = from.get(col)!;
      const before = colOf[row];
      rowOf[col] = row;
      colOf[row] = col;
      col = row === start ? -1 : before;
    }
  }
  return Array.from(colOf, (col) => (col < columns ? col : -1));
}

type Row = { label: SilkLabel; side: "TOP" | "BOTTOM"; ref: string; want: Want | null; kind: CfType; box: Box };
type Tie = { row: Row; f: Footprint; gap: number; fit: number; cost: number };

/** Footprints by where they are, for "which of them could a label here belong to". */
const NEAR_CELL = 8;
function cellsOf(b: Box, visit: (key: string) => void) {
  for (let i = Math.floor(b.x0 / NEAR_CELL); i <= Math.floor(b.x1 / NEAR_CELL); i++) for (let j = Math.floor(b.y0 / NEAR_CELL); j <= Math.floor(b.y1 / NEAR_CELL); j++) visit(`${i},${j}`);
}

/**
 * Ties labels to footprints: every label to at most one footprint and the other way round, so that nearness and
 * misfit, summed over each neighbourhood, are least.
 */
function tie(rows: Row[], footprints: Footprint[], hull: { TOP: (Box | null)[]; BOTTOM: (Box | null)[] }, taken: Set<Footprint>): Tie[] {
  // Each side's footprints, entered wherever a label could stand and still be within reach of their pads or their
  // drawn outline; and by their centres, for the body a BoM line describes, which is laid on the centre.
  const near = { TOP: new Map<string, number[]>(), BOTTOM: new Map<string, number[]>() };
  const centres = { TOP: new Map<string, number[]>(), BOTTOM: new Map<string, number[]>() };
  const enter = (m: Map<string, number[]>, key: string, j: number) => {
    const list = m.get(key);
    if (list) list.push(j);
    else m.set(key, [j]);
  };
  footprints.forEach((f, j) => {
    if (taken.has(f)) return;
    for (const side of ["TOP", "BOTTOM"] as const) {
      if (f.side !== side && !f.tht) continue;
      const own = hull[side][j];
      const room = own ? { x0: Math.min(f.box.x0, own.x0), y0: Math.min(f.box.y0, own.y0), x1: Math.max(f.box.x1, own.x1), y1: Math.max(f.box.y1, own.y1) } : f.box;
      cellsOf(grow(room, REACH), (key) => enter(near[side], key, j));
      enter(centres[side], `${Math.floor(f.x / NEAR_CELL)},${Math.floor(f.y / NEAR_CELL)}`, j);
    }
  });
  const edges: { col: number; cost: number; gap: number; fit: number }[][] = rows.map((r) => {
    const seen = new Set<number>();
    cellsOf(r.box, (key) => {
      for (const j of near[r.side].get(key) ?? []) seen.add(j);
    });
    const body = r.want?.body;
    if (body) {
      const half = Math.min(60, Math.max(body.length, body.width) / 2);
      cellsOf(grow(r.box, REACH + half), (key) => {
        for (const j of centres[r.side].get(key) ?? []) seen.add(j);
      });
    }
    const out: { col: number; cost: number; gap: number; fit: number }[] = [];
    // In the footprints' own order, so equal ties fall the same way on every run.
    for (const j of [...seen].sort((a, b) => a - b)) {
      const f = footprints[j];
      if (Math.abs(f.x - r.label.x) > 60 || Math.abs(f.y - r.label.y) > 60) continue;
      const boxes = [f.box, hull[r.side][j], body ? bodyBox(f, body) : null].filter((b): b is Box => !!b);
      const gap = Math.min(...boxes.map((b) => boxGap(r.box, b)));
      if (gap > REACH) continue;
      const fit = misfit(r.want, r.kind, r.ref, f);
      if (fit === null) continue;
      const cost = gap + CENTRE_WEIGHT * Math.hypot(f.x - r.label.x, f.y - r.label.y) + FIT_WEIGHT * fit;
      if (cost <= MAX_COST) out.push({ col: j, cost, gap, fit });
    }
    return out;
  });
  // Staying without a footprint is allowed, at more than any tie costs.
  const chosen = assignSparse(edges, footprints.length, MAX_COST + 1);
  const out: Tie[] = [];
  chosen.forEach((col, i) => {
    const e = col < 0 ? undefined : edges[i].find((x) => x.col === col);
    if (e) out.push({ row: rows[i], f: footprints[col], gap: e.gap, fit: e.fit, cost: e.cost });
  });
  return out;
}

// ───────────────────────────── Which way round ─────────────────────────────

/** Where things are on a body lying at rotation 0, x along its length: the conventions of the 3D models. */
const TAB = [0, -1] as const;
const FULL_ROW = [0, 1] as const;
const PIN_ONE = [-1, -1] as const;
const HEATSINK_FLAT = [0, 1] as const;
/** The end of a polarised two-pad body its "+" is at. */
const PLUS_END: Partial<Record<NonNullable<BodySpec["shape"]>, readonly [number, number]>> = { smdcan: [1, 0], tantalum: [-1, 0] };
/** The end of a diode's body its cathode band is at. */
const CATHODE_END = [-1, 0] as const;
/** The end of a two-row IC its outline's notch is at: the end pin 1 is at. */
const NOTCH_END = [-1, 0] as const;
/** The end of a pin row pin 1 is at. */
const ROW_START = [-1, 0] as const;
/**
 * Pin 1 of a standing power package (TO-220, TO-247, TO-126): seen from the moulded front the pins count from the
 * left, and the front faces away from the tab — so with the tab at the body's -y, pin 1 is at its +x end.
 */
const STANDING_PIN_ONE = [1, 0] as const;

/** A point of the body's own frame as an offset on the board, seen from the top: a bottom part is mirrored. */
function onBoard(side: "TOP" | "BOTTOM", deg: number, q: readonly [number, number]): [number, number] {
  const a = (deg * Math.PI) / 180;
  const x = q[0] * Math.cos(a) - q[1] * Math.sin(a);
  const y = q[0] * Math.sin(a) + q[1] * Math.cos(a);
  return [x, side === "BOTTOM" ? -y : y];
}

/** The rotation, of those allowed, that points a body direction the way a target lies from the centre. */
function turnTo(side: "TOP" | "BOTTOM", allowed: number[], q: readonly [number, number], tx: number, ty: number): number {
  const score = (deg: number) => {
    const [x, y] = onBoard(side, deg, q);
    return x * tx + y * ty;
  };
  return [...allowed].sort((a, b) => score(b) - score(a))[0];
}

const area = (p: CopperPad) => p.w * p.h;
const alike = (a: CopperPad, b: CopperPad) => a.shape === b.shape && Math.abs(a.w - b.w) < 0.05 && Math.abs(a.h - b.h) < 0.05;

type Turn = { rotation: number; by: SilkPlacement["turn"] };

/**
 * Which way round a part lies on its footprint. The footprint's axis gives 0 or 90; the copper and the silkscreen
 * say which of the two ways along it, when they say anything.
 */
function turnOf(f: Footprint, side: "TOP" | "BOTTOM", body: BodySpec | null, kind: CfType, marks: SilkMark[]): Turn {
  const base = f.rotation;
  const diode = (body?.kind === "molded" && !body.shape) || (!body && (kind === "diode" || kind === "led"));
  // A part standing on a row of two or three thick leads: a TO-220 by its line, or a transistor, a regulator or a
  // power diode by its letters when no line describes it.
  const standing = f.kind === "tht-row" && f.pads.length <= 3 && (body ? body.shape === "to220" : kind === "transistor" || kind === "diode" || kind === "chip");
  const both = [base, base + 180];
  const pads = [...f.pads].sort((a, b) => area(b) - area(a));
  const leads = pads.length >= 3 && area(pads[0]) > 2.5 * area(pads[1]) ? pads.slice(1) : pads;
  const mid = (list: CopperPad[]) => ({ x: list.reduce((s, p) => s + p.x, 0) / list.length, y: list.reduce((s, p) => s + p.y, 0) / list.length });

  // A tab off to one side of a row of leads: the body's back is at the tab.
  if (f.kind === "sot" && leads.length < pads.length) {
    const c = mid(leads);
    const [tx, ty] = [pads[0].x - c.x, pads[0].y - c.y];
    if (Math.hypot(tx, ty) > 0.5) return { rotation: turnTo(side, [0, 90, 180, 270], TAB, tx, ty), by: "pads" };
  }
  // Two rows of unequal length (SOT-23: two leads and one): the fuller row has its own side of the body.
  if ((f.kind === "sot" || f.kind === "dual") && leads.length === pads.length && pads.length >= 3 && pads.length % 2 === 1) {
    const across = (p: CopperPad) => (base === 0 ? p.y - f.y : p.x - f.x);
    const [up, down] = [pads.filter((p) => across(p) > 0.1), pads.filter((p) => across(p) < -0.1)];
    if (up.length !== down.length && up.length + down.length === pads.length) {
      const sign = up.length > down.length ? 1 : -1;
      const [tx, ty] = base === 0 ? [0, sign] : [sign, 0];
      return { rotation: turnTo(side, both, FULL_ROW, tx, ty), by: "pads" };
    }
  }

  const near = marks.filter((m) => inside(grow(f.box, 3.5), m.x, m.y));
  const nearestPad = (m: { x: number; y: number }, list: CopperPad[]) => {
    const d = (p: CopperPad) => Math.hypot(Math.max(Math.abs(p.x - m.x) - p.w / 2, 0), Math.max(Math.abs(p.y - m.y) - p.h / 2, 0));
    const sorted = [...list].sort((a, b) => d(a) - d(b));
    return { pad: sorted[0], gap: d(sorted[0]), next: sorted[1] ? d(sorted[1]) : Infinity };
  };

  if (pads.length === 2) {
    // A mark printed by one of the two pads, clearly nearer it than the other.
    const byOnePad = (what: SilkMark["kind"], reach: number) => near.filter((m) => m.kind === what).map((m) => nearestPad(m, pads)).filter((h) => h.gap <= reach && h.next - h.gap >= 1);
    const toward = (p: CopperPad, q: readonly [number, number], by: Turn["by"]): Turn => ({ rotation: turnTo(side, both, q, p.x - f.x, p.y - f.y), by });
    // Two pins, one square: pin 1 of a header or a wire-to-board connector.
    if (f.tht && (body ? body.kind === "connector" : kind === "connector") && (pads[0].shape === "rect") !== (pads[1].shape === "rect")) return toward(pads.find((p) => p.shape === "rect")!, ROW_START, "copper");
    if (standing) {
      const dots = byOnePad("dot", 1.5);
      return dots.length === 1 ? toward(dots[0].pad, STANDING_PIN_ONE, "silkscreen") : { rotation: base, by: null };
    }
    if (diode) {
      // The diode symbol drawn beside it (the marks handed in are this part's own), else a dot or a star at the
      // cathode pad: pin 1 of a diode is its cathode.
      const symbols = marks.filter((m) => m.kind === "cathode" && m.dx !== undefined && m.dy !== undefined && Math.abs(base === 0 ? m.dx : m.dy) > 0.9);
      const ways = new Set(symbols.map((m) => Math.sign(base === 0 ? m.dx! : m.dy!)));
      if (ways.size === 1) {
        const sign = [...ways][0];
        const [tx, ty] = base === 0 ? [sign, 0] : [0, sign];
        return { rotation: turnTo(side, both, CATHODE_END, tx, ty), by: "silkscreen" };
      }
      const dots = byOnePad("dot", 1.5);
      return dots.length === 1 ? toward(dots[0].pad, CATHODE_END, "silkscreen") : { rotation: base, by: null };
    }
    const end = body?.shape ? PLUS_END[body.shape] : undefined;
    if (!end) return { rotation: base, by: null };
    // The "+" printed by one pad; else the cut corners of the outline, which are at the "+" end of a can.
    const plus = byOnePad("plus", 3);
    if (plus.length === 1) return { rotation: turnTo(side, both, end, plus[0].pad.x - f.x, plus[0].pad.y - f.y), by: "silkscreen" };
    const along = (m: SilkMark) => (base === 0 ? m.x - f.x : m.y - f.y);
    const cuts = marks.filter((m) => m.kind === "chamfer" && inside(grow(bodyBox(f, body!), 0.6), m.x, m.y) && Math.abs(along(m)) > 1);
    if (cuts.length >= 2 && (cuts.every((m) => along(m) > 0) || cuts.every((m) => along(m) < 0))) {
      const sign = along(cuts[0]) > 0 ? 1 : -1;
      const [tx, ty] = base === 0 ? [sign, 0] : [0, sign];
      return { rotation: turnTo(side, both, end, tx, ty), by: "silkscreen" };
    }
    return { rotation: base, by: null };
  }
  if (leads.length < 3) return { rotation: base, by: null };

  // Pin 1: the one pad shaped unlike all the others (a square pad among round ones), else the pad a dot is printed at.
  const square = Math.abs(f.box.x1 - f.box.x0 - (f.box.y1 - f.box.y0)) < 0.3 && (f.kind === "quad" || f.kind === "grid" || f.kind === "tht-grid");
  const allowed = square ? [0, 90, 180, 270] : both;
  const toPad = (p: CopperPad, by: Turn["by"]): Turn => ({ rotation: turnTo(side, allowed, standing ? STANDING_PIN_ONE : PIN_ONE, p.x - f.x, p.y - f.y), by });
  const odd = leads.filter((p) => leads.filter((q) => alike(p, q)).length === 1);
  if (odd.length === 1 && leads.filter((q) => alike(q, leads.find((p) => p !== odd[0])!)).length === leads.length - 1) {
    const [dx, dy] = [odd[0].x - f.x, odd[0].y - f.y];
    // Only a pad at an end of the land can be pin 1.
    if (Math.abs(dx) > (f.box.x1 - f.box.x0) / 2 - odd[0].w - 0.3 || Math.abs(dy) > (f.box.y1 - f.box.y0) / 2 - odd[0].h - 0.3) return toPad(odd[0], "copper");
  }
  // An end of a row: no lead beyond it on any line of three or more it stands in.
  const corner = (p: CopperPad) => {
    const ends = (line: CopperPad[], at: (q: CopperPad) => number) => line.length < 3 || at(p) === Math.min(...line.map(at)) || at(p) === Math.max(...line.map(at));
    return ends(leads.filter((q) => Math.abs(q.y - p.y) < 0.1), (q) => q.x) && ends(leads.filter((q) => Math.abs(q.x - p.x) < 0.1), (q) => q.y);
  };
  const dots = near.filter((m) => m.kind === "dot").map((m) => nearestPad(m, leads)).filter((h) => h.gap <= 1.5 && corner(h.pad));
  const pins = [...new Set(dots.map((h) => h.pad))];
  if (pins.length === 1) return toPad(pins[0], "silkscreen");
  // The notch in one end of a two-row IC's outline: a half circle in the middle of the end pin 1 is at, bulging in.
  if (f.kind === "dual" || (f.tht && /^DIP-/.test(f.read.label))) {
    const [along, across] = base === 0 ? (["x", "y"] as const) : (["y", "x"] as const);
    const half = { x: (f.box.x1 - f.box.x0) / 2, y: (f.box.y1 - f.box.y0) / 2 };
    const ends = marks
      .filter((m) => m.kind === "notch" && m.dx !== undefined && m.dy !== undefined && inside(grow(f.box, 1.2), m.x, m.y))
      .filter((m) => Math.abs(m[across] - f[across]) <= 0.4 * half[across] && Math.abs(m[along] - f[along]) >= 0.6 * half[along])
      .filter((m) => (along === "x" ? m.dx! : m.dy!) * Math.sign(m[along] - f[along]) < -0.7)
      .map((m) => Math.sign(m[along] - f[along]));
    if (ends.length && ends.every((e) => e === ends[0])) {
      const [tx, ty] = along === "x" ? [ends[0], 0] : [0, ends[0]];
      return { rotation: turnTo(side, both, NOTCH_END, tx, ty), by: "silkscreen" };
    }
  }
  return { rotation: base, by: null };
}

/**
 * The small signs of a silkscreen drawing that say which way a part lies:
 * - a "+": two short lines crossing at their middles;
 * - a dot: a tiny closed ring, a pen touched down, or a star (three or more short lines crossing at one point);
 * - cut corners: a short diagonal between two straight runs of an outline;
 * - a notch: a half circle standing on a straight side of an outline, bulging into the part;
 * - a diode symbol: a triangle, drawn as its three sides or filled with a fan of lines, with a bar across its tip.
 * Lettering has diagonals, bowls and rings too (a "K" is a diode symbol without the triangle's base); the caller
 * leaves out what lies inside a read label.
 */
export function silkMarks(strokes: SilkStroke[]): SilkMark[] {
  const out: SilkMark[] = [];
  const bars: { x: number; y: number; len: number; flat: boolean }[] = [];
  const starred = stars(strokes, out);
  diodeSymbols(strokes, out);
  for (const s of strokes) {
    if (starred.has(s)) continue;
    const xs = s.pts.map((p) => p[0]);
    const ys = s.pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const [w, h] = [x1 - x0, y1 - y0];
    const first = s.pts[0];
    const last = s.pts[s.pts.length - 1];
    const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.05;
    if (w + s.width <= 0.9 && h + s.width <= 0.9 && (Math.max(w, h) < 0.05 || (closed && s.pts.length >= 8 && Math.abs(w - h) < 0.1))) {
      out.push({ kind: "dot", x: r3((x0 + x1) / 2), y: r3((y0 + y1) / 2) });
      continue;
    }
    if (s.pts.length === 2) {
      const len = Math.max(w, h);
      if (Math.min(w, h) < 0.03 && len >= 0.4 && len <= 3) bars.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, len, flat: w > h });
      continue;
    }
    // A half circle whose ends lie on one line along x or y: every point as far from the middle of that line as its
    // ends are.
    if (s.pts.length >= 7 && (Math.abs(first[0] - last[0]) < 0.05 || Math.abs(first[1] - last[1]) < 0.05)) {
      const [cx, cy] = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
      const r = Math.hypot(first[0] - last[0], first[1] - last[1]) / 2;
      const top = s.pts[s.pts.length >> 1];
      const bulge = Math.hypot(top[0] - cx, top[1] - cy);
      if (r >= 0.2 && r <= 1.6 && bulge >= 0.8 * r && s.pts.every((p) => Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r) <= 0.12 * r)) {
        out.push({ kind: "notch", x: r3(cx), y: r3(cy), dx: r3((top[0] - cx) / bulge), dy: r3((top[1] - cy) / bulge) });
        continue;
      }
    }
    for (let i = 1; i + 2 < s.pts.length; i++) {
      const [a, b, c, d] = [s.pts[i - 1], s.pts[i], s.pts[i + 1], s.pts[i + 2]];
      const [dx, dy] = [Math.abs(c[0] - b[0]), Math.abs(c[1] - b[1])];
      if (Math.min(dx, dy) < 0.3 || Math.max(dx, dy) > 2.5 || Math.abs(dx - dy) > 0.25 * Math.max(dx, dy)) continue;
      // Straight runs before and after it, at right angles to each other, each longer than the cut.
      const run = (p: [number, number], q: [number, number]) => (Math.abs(p[0] - q[0]) < 0.03 ? "y" : Math.abs(p[1] - q[1]) < 0.03 ? "x" : null);
      const [before, after] = [run(a, b), run(c, d)];
      if (before && after && before !== after && Math.hypot(a[0] - b[0], a[1] - b[1]) > dx && Math.hypot(c[0] - d[0], c[1] - d[1]) > dx) out.push({ kind: "chamfer", x: r3((b[0] + c[0]) / 2), y: r3((b[1] + c[1]) / 2) });
    }
  }
  // A "+": an upright bar crossing a flat one at their middles. The upright ones are kept by where they are, so a
  // drawing hatched with tens of thousands of short lines costs each flat line its own surroundings only.
  const CELL = 0.5;
  const upright = new Map<string, typeof bars>();
  for (const b of bars) {
    if (b.flat) continue;
    const k = `${Math.floor(b.x / CELL)},${Math.floor(b.y / CELL)}`;
    const list = upright.get(k);
    if (list) list.push(b);
    else upright.set(k, [b]);
  }
  for (const a of bars) {
    if (!a.flat) continue;
    // Bars are at most 3 mm long, so the other's middle is within 0.45 mm: this cell or one beside it.
    const [i, j] = [Math.floor(a.x / CELL), Math.floor(a.y / CELL)];
    let b: (typeof bars)[number] | undefined;
    for (let di = -1; di <= 1 && !b; di++) for (let dj = -1; dj <= 1 && !b; dj++) b = upright.get(`${i + di},${j + dj}`)?.find((q) => Math.abs(q.len - a.len) <= 0.4 * a.len && Math.hypot(q.x - a.x, q.y - a.y) <= 0.15 * a.len);
    if (b) out.push({ kind: "plus", x: r3((a.x + b.x) / 2), y: r3((a.y + b.y) / 2) });
  }
  return out;
}

type Pt = readonly [number, number];
const sameSpot = (a: Pt, b: Pt, tol = 0.03) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;

/**
 * Stars: three or more short single lines crossing at their middles, not all one way. Adds a dot at each and gives
 * back the strokes they are made of, which are then no part of a "+".
 */
function stars(strokes: SilkStroke[], out: SilkMark[]): Set<SilkStroke> {
  const CELL = 0.1;
  const at = new Map<string, { s: SilkStroke; x: number; y: number; way: number }[]>();
  for (const s of strokes) {
    if (s.pts.length !== 2) continue;
    const [a, b] = s.pts;
    const len = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (len < 0.2 || len > 0.9) continue;
    const [x, y] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // The line's direction as an angle in half a turn, in steps of 15 degrees.
    const way = Math.round((((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 180) / 15) % 12;
    const k = `${Math.round(x / CELL)},${Math.round(y / CELL)}`;
    const list = at.get(k);
    if (list) list.push({ s, x, y, way });
    else at.set(k, [{ s, x, y, way }]);
  }
  const used = new Set<SilkStroke>();
  for (const [key, list] of at) {
    const [i, j] = key.split(",").map(Number);
    for (const first of list) {
      if (used.has(first.s)) continue;
      const rays = [];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const q of at.get(`${i + di},${j + dj}`) ?? []) if (!used.has(q.s) && Math.hypot(q.x - first.x, q.y - first.y) <= 0.06) rays.push(q);
      if (rays.length < 3 || new Set(rays.map((q) => q.way)).size < 3) continue;
      for (const q of rays) used.add(q.s);
      out.push({ kind: "dot", x: r3(rays.reduce((n, q) => n + q.x, 0) / rays.length), y: r3(rays.reduce((n, q) => n + q.y, 0) / rays.length) });
    }
  }
  return used;
}

/**
 * Diode symbols: a triangle whose tip touches the middle of a bar. The triangle's base is a drawn line along x or
 * y; two or more lines run from the tip to the base (its two sides, or a fan that fills it); the bar crosses the
 * tip, parallel to the base and about as long. The symbol points from anode to cathode.
 */
function diodeSymbols(strokes: SilkStroke[], out: SilkMark[]) {
  // The straight pieces of short strokes: a symbol is drawn as single lines or as one short polyline.
  const segs: [Pt, Pt][] = [];
  for (const s of strokes) if (s.pts.length <= 5) for (let i = 1; i < s.pts.length; i++) if (Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]) >= 0.2) segs.push([s.pts[i - 1], s.pts[i]]);
  const CELL = 0.1;
  const key = (p: Pt) => `${Math.round(p[0] / CELL)},${Math.round(p[1] / CELL)}`;
  // Bars along x or y by their middle, and every piece by each of its ends.
  const bars = new Map<string, { mid: Pt; len: number; upright: boolean }[]>();
  const ends = new Map<string, { at: Pt; other: Pt }[]>();
  const enter = <T,>(m: Map<string, T[]>, k: string, v: T) => {
    const list = m.get(k);
    if (list) list.push(v);
    else m.set(k, [v]);
  };
  for (const [a, b] of segs) {
    const upright = Math.abs(a[0] - b[0]) < 0.03;
    if (upright || Math.abs(a[1] - b[1]) < 0.03) {
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      enter(bars, key(mid), { mid, len: Math.hypot(a[0] - b[0], a[1] - b[1]), upright });
    }
    enter(ends, key(a), { at: a, other: b });
    enter(ends, key(b), { at: b, other: a });
  }
  const around = <T,>(m: Map<string, T[]>, p: Pt): T[] => {
    const [i, j] = [Math.round(p[0] / CELL), Math.round(p[1] / CELL)];
    const found: T[] = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) found.push(...(m.get(`${i + di},${j + dj}`) ?? []));
    return found;
  };
  const seen = new Set<string>();
  for (const list of bars.values())
    for (const bar of list) {
      if (bar.len < 0.4 || bar.len > 3.5) continue;
      // Along the symbol (across the bar) and across it.
      const [u, v] = bar.upright ? ([0, 1] as const) : ([1, 0] as const);
      const tip = bar.mid;
      const rays = around(ends, tip).filter((e) => sameSpot(e.at, tip, 0.05) && Math.abs(e.other[u] - tip[u]) >= 0.3);
      for (const way of [-1, 1]) {
        const far = rays.filter((e) => Math.sign(e.other[u] - tip[u]) === way);
        if (far.length < 2) continue;
        const base = far[0].other[u];
        if (!far.every((e) => Math.abs(e.other[u] - base) <= 0.03)) continue;
        const span = far.map((e) => e.other[v]);
        const [lo, hi] = [Math.min(...span), Math.max(...span)];
        const wide = hi - lo;
        // The tip stands over the middle of the base, the bar is about as long as the base, and the base is drawn.
        if (wide < 0.4 || wide > 3.5 || Math.abs((lo + hi) / 2 - tip[v]) > 0.15 * wide || bar.len < 0.6 * wide || bar.len > 1.6 * wide) continue;
        const corner: Pt = u === 0 ? [base, lo] : [lo, base];
        const drawn = around(ends, corner).some((e) => sameSpot(e.at, corner, 0.05) && Math.abs(e.other[u] - base) <= 0.03 && Math.abs(e.other[v] - hi) <= 0.05);
        const id = `${r3(tip[0])},${r3(tip[1])}`;
        if (!drawn || seen.has(id)) continue;
        seen.add(id);
        out.push({ kind: "cathode", x: r3(tip[0]), y: r3(tip[1]), dx: u === 0 ? -way : 0, dy: u === 1 ? -way : 0 });
      }
    }
}

// ───────────────────────────── The whole board ─────────────────────────────

const DESIGNATOR = /^([A-Z]{1,3})([0-9]{1,4})$/;
/**
 * Letters that start a reference designator. A board read on its own prints pin and net names too ("PB1", "CH3",
 * "INT1", "REV3"); only lettering that starts like a designator is taken as one.
 */
const PREFIXES = new Set(
  "A AE ANT AR B BT BZ C CN CON CP CR D DS DZ E F FB FL FID H HS IC J JP K L LED LD LS M MH MK MOD P PS Q R RN RT RV RY S SP SW T TB TH TP TR U VR X XP Y Z ZD".split(" "),
);

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
/** Footprints that are not parts on their own: a screw hole, a fiducial, a lone pad (a test point, an open via). */
const notAPart = (f: Footprint) => f.kind === "mount-hole" || f.kind === "fiducial" || f.kind === "single";

/** The running name of a footprint nobody lettered, by what it most likely holds — as a CAD tool would number it. */
/** Screw-terminal block pitches, mm. */
const TERMINAL_PITCH = [3.5, 3.81, 5, 5.08, 7.5, 7.62];

/**
 * A screw terminal block's land: one row of 2 – 12 leads at a terminal block's pitch, drilled 1.1 mm or more (pin
 * headers and small cans are drilled 0.8 – 1.0 mm). Whether the part is one is for its letters (or, unlettered, the
 * outline round it) to say. `copper` is the copper's reading ("1×2 through-hole, 5 mm").
 */
export function terminalLand(copper: string, drill: number | null | undefined): { ways: number; pitch: number } | null {
  const m = copper.match(/^1×(\d+) through-hole, (\d+(?:\.\d+)?) mm/);
  if (!m || drill == null || drill < 1.1 || drill >= 3) return null;
  const [ways, pitch] = [Number(m[1]), Number(m[2])];
  return ways >= 2 && ways <= 12 && TERMINAL_PITCH.some((v) => Math.abs(v - pitch) <= 0.06) ? { ways, pitch } : null;
}

/** The smallest drilled hole of a footprint's leads, mm (to 0.01); null when nothing is drilled. */
function drillOf(f: Footprint): number | null {
  const holes = f.pads.map((p) => p.hole).filter((h) => h > 0);
  return holes.length ? Math.round(Math.min(...holes) * 100) / 100 : null;
}

/** The letter an unlettered footprint is numbered under. `round`: a circle is drawn round it (a can, a coil). */
function runningPrefix(f: Footprint, round = false): string {
  if (f.tht && !round && terminalLand(f.read.label, drillOf(f))) return "J";
  if (f.tht) return f.pads.length === 2 ? (f.read.pitch && f.read.pitch >= 7 ? "R" : "C") : f.pads.length === 3 && f.kind === "tht-row" ? "Q" : /^DIP/.test(f.read.label) ? "U" : "J";
  if (f.pads.length === 2) return "P";
  if (f.kind === "sot") return f.pads.length === 3 ? "Q" : "U";
  if (f.kind === "dual" || f.kind === "quad" || f.kind === "grid") return "U";
  if (f.kind === "other" && f.pads.length === 4) return "Y";
  return f.kind === "other" ? "J" : "X";
}

/**
 * One placement per part, from the footprints, the silkscreen of both sides and (when there is one) the BoM.
 * With a BoM, its designators are placed and everything else is reported. Without one, every lettered footprint
 * keeps its letters and the rest are numbered by kind.
 */
export function placeFromSilk(input: PlaceInput): PlaceResult {
  const footprints = input.footprints;
  const sides = { TOP: input.top ?? { labels: [], outlines: [] }, BOTTOM: input.bottom ?? { labels: [], outlines: [] } };
  const hull = {
    TOP: footprints.map((f) => (f.side === "TOP" ? hullOf(f, sides.TOP.outlines) : null)),
    BOTTOM: footprints.map((f) => (f.side === "BOTTOM" || f.tht ? hullOf(f, sides.BOTTOM.outlines) : null)),
  };

  // The BoM by designator. A designator listed twice keeps its first line.
  const lineOf = new Map<string, PlaceLine>();
  for (const l of input.lines ?? []) for (const ref of expandRefDes(l.refDes)) if (!lineOf.has(ref)) lineOf.set(ref, l);
  const withBom = lineOf.size > 0;
  const wants = new Map<PlaceLine, Want | null>();
  const wantFor = (ref: string) => {
    const line = lineOf.get(ref);
    if (!line) return null;
    if (!wants.has(line)) wants.set(line, wantOf(line, ref));
    return wants.get(line) ?? null;
  };
  const kindFor = (ref: string) => {
    const line = lineOf.get(ref);
    return inferType(ref, line?.pkg ?? "", line?.description ?? "");
  };

  const rowsOf = (keep: (text: string) => boolean, kind: (ref: string) => CfType = kindFor): Row[] =>
    (["TOP", "BOTTOM"] as const).flatMap((side) =>
      sides[side].labels.filter((l) => l.designator && keep(l.text)).map((label) => ({ label, side, ref: label.text, want: wantFor(label.text), kind: kind(label.text), box: labelBox(label) })),
    );
  const startsLikeOne = (text: string) => PREFIXES.has(text.match(DESIGNATOR)?.[1] ?? "");

  // A designator printed twice (once by the part, once in a table or a pin list) is the part where it ties best.
  const best = (ties: Tie[]) => {
    const byRef = new Map<string, Tie>();
    for (const t of ties) {
      const had = byRef.get(t.row.ref);
      if (!had || t.cost < had.cost) byRef.set(t.row.ref, t);
    }
    return [...byRef.values()];
  };
  const taken = new Set<Footprint>();
  const own = best(tie(rowsOf((t) => (withBom ? lineOf.has(t) : startsLikeOne(t))), footprints, hull, taken));
  for (const t of own) taken.add(t.f);
  // Then what else is lettered, on the footprints still free. With a BoM these are designators it does not list.
  // Without one they are letters no designator usually starts with ("RC13"): they name a footprint that is left for
  // them, and never make a part of a lone pad — most such lettering is pin and net names.
  const others = best(tie(rowsOf((t) => !lineOf.has(t) && (withBom ? startsLikeOne(t) : !startsLikeOne(t)), withBom ? kindFor : () => "other"), footprints, hull, taken));
  for (const t of others) taken.add(t.f);

  const labelBoxes = { TOP: sides.TOP.labels.map((l) => grow(labelBox(l), 0.2)), BOTTOM: sides.BOTTOM.labels.map((l) => grow(labelBox(l), 0.2)) };
  const marksOf = (side: "TOP" | "BOTTOM") => (sides[side].marks ?? []).filter((m) => !labelBoxes[side].some((b) => inside(b, m.x, m.y)));
  const marks = { TOP: marksOf("TOP"), BOTTOM: marksOf("BOTTOM") };

  // The body a designator's part has: what its BoM line describes; on a board read alone, what its letters and its
  // land say between them (a C on two long thin pads is an aluminium can, and has a "+").
  const bodyAt = (ref: string, f: Footprint) => (withBom ? (wantFor(ref)?.body ?? null) : bodyOnLand(ref, { label: f.read.label, length: f.read.length, width: f.read.width, pads: f.pads.length, drill: drillOf(f) }));
  // A diode symbol is drawn beside its diode, often in the gap to the next part: it is the nearest diode's, and
  // nobody's when two are about as near.
  const owner = new Map<SilkMark, Footprint>();
  for (const side of ["TOP", "BOTTOM"] as const) {
    const diodes = [...own, ...others].filter((t) => (t.f.tht ? t.row.side : t.f.side) === side && t.f.pads.length === 2).filter((t) => {
      const body = bodyAt(t.row.ref, t.f);
      return body ? body.kind === "molded" && !body.shape : ["diode", "led"].includes(kindFor(t.row.ref));
    });
    for (const m of marks[side]) {
      if (m.kind !== "cathode") continue;
      const point = { x0: m.x, y0: m.y, x1: m.x, y1: m.y };
      // On the line through the diode's two pads, within 3 mm of them.
      const by = diodes
        .filter((t) => Math.abs(t.f.rotation === 0 ? m.y - t.f.y : m.x - t.f.x) <= (t.f.rotation === 0 ? t.f.box.y1 - t.f.box.y0 : t.f.box.x1 - t.f.box.x0) / 2 + 0.6)
        .map((t) => ({ f: t.f, gap: boxGap(point, t.f.box) }))
        .filter((c) => c.gap <= 3)
        .sort((a, b) => a.gap - b.gap);
      if (by.length && (by.length === 1 || by[1].gap - by[0].gap >= 0.5)) owner.set(m, by[0].f);
    }
  }

  const bodies = new Map<SilkPlacement, BodySpec | null>();
  const place = (ref: string, f: Footprint, side: "TOP" | "BOTTOM", how: SilkPlacement["how"], confidence: number): SilkPlacement => {
    const body = bodyAt(ref, f);
    const turn = turnOf(f, side, body, kindFor(ref), marks[side].filter((m) => m.kind !== "cathode" || owner.get(m) === f));
    const p: SilkPlacement = {
      refDes: ref,
      x: f.x,
      y: f.y,
      rotation: ((turn.rotation % 360) + 360) % 360,
      side,
      copper: f.read.label,
      pads: f.pads.length,
      length: f.read.length,
      width: f.read.width,
      tht: f.tht,
      drill: f.tht ? drillOf(f) : null,
      kind: f.kind,
      how,
      turn: turn.by,
      confidence: Math.round(clamp01(confidence) * 100) / 100,
      dnp: lineOf.get(ref)?.dnp ?? false,
      footprintId: f.id,
    };
    bodies.set(p, body);
    return p;
  };
  const sure = (t: Tie) => t.row.label.confidence * (1 - 0.4 * t.fit) * (1 - 0.4 * Math.min(1, t.gap / REACH));
  // A board read on its own: a lettered lone pad is a test point, not a part to buy and place.
  const placements = (withBom ? own : [...own, ...others].filter((t) => !notAPart(t.f))).map((t) => place(t.row.ref, t.f, t.f.tht ? t.row.side : t.f.side, "label", sure(t)));

  const report: PlaceReport = { missing: [], extra: [], unlettered: [], mismatches: [], unchecked: [] };
  if (withBom) {
    // Designators whose label was not read. One takes a footprint only when the footprints still free that fit its
    // line are exactly as many as the line still needs and no other line could want them: then it does not matter
    // which of the line's designators goes where — they are the same part.
    const placed = new Set(placements.map((p) => p.refDes));
    const open = new Map<PlaceLine, string[]>();
    for (const [ref, line] of lineOf) if (!placed.has(ref)) open.set(line, [...(open.get(line) ?? []), ref]);
    const free = footprints.filter((f) => !taken.has(f) && !notAPart(f));
    const fitting = new Map<PlaceLine, Footprint[]>();
    for (const [line, refs] of open) {
      const want = wantFor(refs[0]);
      fitting.set(line, want ? free.filter((f) => (misfit(want, "other", refs[0], f) ?? 1) <= 0.25) : []);
    }
    const claims = new Map<Footprint, number>();
    for (const list of fitting.values()) for (const f of list) claims.set(f, (claims.get(f) ?? 0) + 1);
    for (const [line, refs] of open) {
      const list = fitting.get(line) ?? [];
      if (list.length !== refs.length || list.some((f) => claims.get(f) !== 1)) continue;
      [...refs].sort(natural).forEach((ref, i) => {
        placements.push(place(ref, list[i], list[i].side, "fit", 0.4));
        taken.add(list[i]);
        placed.add(ref);
      });
    }
    report.missing = [...lineOf.keys()].filter((ref) => !placed.has(ref)).sort(natural);
    report.extra = others.map((t) => ({ refDes: t.row.ref, x: t.f.x, y: t.f.y, side: t.f.tht ? t.row.side : t.f.side, copper: t.f.read.label })).sort((a, b) => natural(a.refDes, b.refDes));
    const byId = new Map(footprints.map((f) => [f.id, f]));
    for (const p of placements) {
      const want = wantFor(p.refDes);
      const f = byId.get(p.footprintId)!;
      if (!want) report.unchecked.push(p.refDes);
      else if (disagrees(want, f)) report.mismatches.push({ refDes: p.refDes, bom: want.says, copper: p.copper });
    }
    report.mismatches.sort((a, b) => natural(a.refDes, b.refDes));
    report.unchecked.sort(natural);
  }
  const left = footprints.filter((f) => !taken.has(f) && !notAPart(f));
  report.unlettered = left.map((f) => ({ id: f.id, x: f.x, y: f.y, side: f.side, copper: f.read.label, kind: f.kind }));
  if (!withBom) {
    // Numbered top-left to bottom-right, after the highest number the silkscreen already uses for the prefix.
    const next = new Map<string, number>();
    for (const p of placements) {
      const m = p.refDes.match(DESIGNATOR);
      if (m) next.set(m[1], Math.max(next.get(m[1]) ?? 0, Number(m[2])));
    }
    for (const f of [...left].sort((a, b) => (a.side === b.side ? b.y - a.y || a.x - b.x : a.side === "TOP" ? -1 : 1))) {
      const round = [...sides.TOP.outlines, ...sides.BOTTOM.outlines].some((o) => o.round && o.x1 - o.x0 <= 40 && enclosedBy(o, f.x, f.y));
      const prefix = runningPrefix(f, round);
      const n = (next.get(prefix) ?? 0) + 1;
      next.set(prefix, n);
      placements.push(place(`${prefix}${n}`, f, f.side, "unlettered", 0.3));
    }
  }

  // A standing power part turns its tab to the heatsink it is bolted to, and the heatsink its flat to the part.
  const standing = placements.filter((p) => bodies.get(p)?.shape === "to220");
  const sinks = placements.filter((p) => bodies.get(p)?.shape === "heatsink");
  const nearest = (p: SilkPlacement, list: SilkPlacement[]) => {
    // Across the part's own row of pins: that is where a tab or a flat faces.
    const off = (q: SilkPlacement) => (p.rotation % 180 === 0 ? [Math.abs(q.x - p.x), q.y - p.y] : [Math.abs(q.y - p.y), q.x - p.x]);
    const reach = (q: SilkPlacement) => Math.max(bodies.get(q)!.length, bodies.get(p)!.length) / 2 + 2;
    return list.filter((q) => q.side === p.side && off(q)[0] <= reach(q) && Math.abs(off(q)[1]) <= 12 && Math.abs(off(q)[1]) > 0.5).sort((a, b) => Math.abs(off(a)[1]) - Math.abs(off(b)[1]))[0];
  };
  const face = (p: SilkPlacement, q: SilkPlacement, dir: readonly [number, number]) => {
    const [tx, ty] = p.rotation % 180 === 0 ? [0, q.y - p.y] : [q.x - p.x, 0];
    const base = p.rotation % 180;
    p.rotation = turnTo(p.side, [base, base + 180], dir, tx, ty);
    p.turn = "neighbour";
  };
  for (const p of standing) {
    const sink = nearest(p, sinks);
    if (sink) face(p, sink, TAB);
  }
  for (const p of sinks) {
    const part = nearest(p, standing);
    if (part) face(p, part, HEATSINK_FLAT);
  }

  placements.sort((a, b) => natural(a.refDes, b.refDes));
  return { placements, report };
}

type Layer = { type: string; side: string; svg: string };

/**
 * The same from a board's stored layer drawings (outer copper, solder mask, drill and silkscreen of both sides):
 * reads the silkscreen with the BoM's designators as what it is expected to say, finds the footprints with the
 * drawn outlines as hints, and places.
 */
export function placeFromLayers(layers: Layer[] | null | undefined, lines?: PlaceLine[] | null): PlaceResult & { footprints: number; labels: number } {
  const svg = (side: string) => layers?.find((l) => l.type === "silkscreen" && l.side === side)?.svg;
  const lexicon = [...new Set((lines ?? []).flatMap((l) => expandRefDes(l.refDes)))];
  const read = (side: "top" | "bottom"): SilkSide => {
    const drawing = svg(side);
    if (!drawing) return { labels: [], outlines: [], marks: [] };
    return { ...readSilk(drawing, { lexicon, mirrored: side === "bottom" }), marks: silkMarks(strokesFromSvg(drawing)) };
  };
  const [top, bottom] = [read("top"), read("bottom")];
  // A part's outline holds at most its own designator; a frame round a group of parts holds several.
  const partOutlines = (s: SilkSide) =>
    s.outlines.filter((o) => s.labels.filter((l) => l.designator && enclosedBy(o, l.x, l.y)).length <= 1);
  const footprints = findFootprints(copperPads(layers), { outlines: { top: partOutlines(top), bottom: partOutlines(bottom) } });
  return { ...placeFromSilk({ footprints, top, bottom, lines }), footprints: footprints.length, labels: [...top.labels, ...bottom.labels].filter((l) => l.designator).length };
}

// ───────────────────────────── As parts found on a board (quick looks) ─────────────────────────────

/** A footprint's name the way the rest of the app reads footprints: headers and leaded parts by their usual names. */
function foundPackage(p: SilkPlacement, kind: CfType): string {
  if (!p.tht) return p.copper;
  const terminal = kind === "connector" ? terminalLand(p.copper, p.drill) : null;
  if (terminal) return `${terminal.ways}-way terminal block, ${terminal.pitch} mm`;
  const pitch = p.copper.match(/, (\d+(?:\.\d+)?) mm/)?.[1];
  const grid = p.copper.match(/^(\d+)×(\d+) through-hole/);
  if (!grid) return /^DIP/.test(p.copper) ? p.copper : `${p.pads}-pin through-hole${pitch ? `, ${pitch} mm` : ""}`;
  const [rows, cols] = [Number(grid[1]), Number(grid[2])];
  // Two leads: a radial can or an axial part when the letters say so; anything else is named by its pins.
  if (rows === 1 && cols === 2 && pitch && Number(pitch) <= 12.7) {
    if (kind === "resistor" || kind === "diode" || kind === "inductor" || kind === "fuse") return `Axial, ${pitch} mm lead pitch`;
    if (kind === "capacitor") return `Radial, ${pitch} mm lead pitch`;
  }
  if (rows === 1 && cols === 2 && kind !== "connector") return `2-pin through-hole${pitch ? `, ${pitch} mm` : ""}`;
  if (rows === 1 && cols === 3 && kind === "transistor") return "TO-92 / TO-220 (3 leads)";
  return `Header ${rows}x${cols}${pitch ? `, ${pitch} mm` : ""}`;
}

/** Standard aluminium can diameters, mm. */
const CAN_DIAMETERS = [4, 5, 6.3, 8, 10, 12.5, 16, 18];

/**
 * What a lettered part on a land no package name fits most likely is, in the words a BoM line would use, so the
 * body table (src/knowledge/part-bodies.ts) can draw it: a capacitor on two long thin pads is an SMD aluminium can,
 * an inductor on two large pads a shielded power inductor, a crystal on two long pads an HC-49 lying flat.
 * Null: the land's name says enough, or nothing can be said.
 */
export function landWords(f: Pick<FoundPart, "kind" | "package" | "pads" | "tht" | "w" | "d"> & { drill?: number | null }): { description: string; pkg: string } | null {
  if (f.tht) {
    // A connector on a screw terminal's land (named so by the quick look, or read off the copper with its drills).
    if (f.kind !== "connector") return null;
    const named = f.package.match(/^(\d+)-way terminal block, (\d+(?:\.\d+)?) mm$/);
    const t = named ? { ways: Number(named[1]), pitch: Number(named[2]) } : terminalLand(f.package, f.drill);
    return t ? { description: `TERMINAL BLOCK ${t.ways} POS ${t.pitch}MM`, pkg: "" } : null;
  }
  if (f.pads !== 2 || !/^2 pads /.test(f.package)) return null;
  const long = Math.max(f.w, f.d);
  if (f.kind === "capacitor" && long >= 5) {
    // The pads reach past the base on both sides: the can is about 0.7 of the land.
    const dia = [...CAN_DIAMETERS].reverse().find((d) => d <= long * 0.72) ?? 4;
    return { description: "CAP ALUM SMD", pkg: `DIA ${dia}` };
  }
  if (f.kind === "inductor" && long >= 4) {
    const side = Math.round(long * 9) / 10;
    return { description: `INDUCTOR POWER SMD ${side}X${side}`, pkg: "" };
  }
  if (f.kind === "crystal" && long >= 9) return { description: "CRYSTAL HC-49 SMD", pkg: "" };
  return null;
}

/**
 * The same for a placement stored with what its pads are, when its BoM line says nothing a body could be read from
 * (a BoM made from a quick look: "value and part number are not in the Gerbers"). The quick look draws a C on two
 * long thin pads as a can; the BoM made from it must not turn the can into a chip. Null: nothing can be said.
 */
export function bodyOnLand(refDes: string, copper: { label: string; length: number | null; width: number | null; pads: number | null; drill?: number | null }): BodySpec | null {
  const land = landWords({ kind: inferType(refDes, "", ""), package: copper.label, pads: copper.pads ?? 0, tht: /through-hole|^DIP-/.test(copper.label), w: copper.length ?? 0, d: copper.width ?? 0, drill: copper.drill });
  return land ? bodyForLine({ refDes, description: land.description, pkg: land.pkg }) : null;
}

/** Placements of a board read on its own, as the parts the quick look and the "components from the Gerbers" BoM use. */
export function foundFromSilk(res: PlaceResult): FoundParts {
  const parts: FoundPart[] = res.placements.map((p) => {
    const lettered = p.how !== "unlettered";
    const twoPad = !p.tht && p.pads === 2;
    const byShape: CfType = p.tht ? (p.pads === 2 ? (/^J/.test(p.refDes) ? "connector" : /^R/.test(p.refDes) ? "resistor" : "capacitor") : /^J/.test(p.refDes) && terminalLand(p.copper, p.drill) ? "connector" : /^DIP/.test(p.copper) ? "chip" : p.pads === 3 && p.kind === "tht-row" ? "transistor" : "connector") : p.kind === "dual" || p.kind === "quad" || p.kind === "grid" ? "chip" : p.kind === "sot" ? (p.pads === 3 ? "transistor" : "chip") : p.kind === "other" ? (p.pads === 4 ? "crystal" : "connector") : "other";
    const kind = lettered ? inferType(p.refDes, p.copper, "") : byShape;
    return {
      ref: p.refDes,
      x: p.x,
      y: p.y,
      rotation: p.rotation,
      side: p.side,
      package: foundPackage(p, kind),
      kind,
      value: null,
      mpn: null,
      manufacturer: null,
      pads: p.pads,
      tht: p.tht,
      passive: !lettered && twoPad,
      // In the part's own frame: the viewer turns the body by the rotation.
      w: p.length,
      d: p.width,
    };
  });
  const lettered = res.placements.filter((p) => p.how !== "unlettered").length;
  const notes = parts.length ? [lettered ? `${lettered} of ${parts.length} parts carry the designator printed beside them; the rest are numbered by kind.` : "No designators could be read off the silkscreen; the parts are numbered by kind."] : [];
  return { source: !parts.length ? "none" : lettered ? "silkscreen" : "guessed", parts, notes, reader: "silk" };
}
