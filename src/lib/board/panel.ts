/**
 * Panels (Phase 29). A fabricator builds boards in panels: the same board stepped out in rows and columns, held by
 * rails and break-off tabs. Gerbers of a panel draw every board, so the 3D view and the part reader would see the
 * product many times over. This finds the repeat in the outline layer, cuts one board out, and keeps the panel's
 * own figures (how many up, rails, tooling holes, how the boards break off). Pure.
 */
import { chainOutline, type CfShape } from "@/vendor/circuitflow/gerber-entry";
import type { Hole, Slot } from "./gerber-write";

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export type PanelGrid = {
  columns: number;
  rows: number;
  /** One per board, lower-left first, row by row. */
  windows: Box[];
  unit: { width: number; height: number };
  pitch: { x: number; y: number };
  /** How the repeat was found: the same outline many times, or one frame divided by score lines. */
  method: "outlines" | "score-lines";
};

export type Breakaway = "mouse-bites" | "v-score" | "tabs";

export type PanelFacts = {
  columns: number;
  rows: number;
  count: number;
  /** One board, mm. */
  unit: { width: number; height: number };
  pitch: { x: number; y: number };
  /** Space between neighbouring boards, mm (0 = they share an edge). */
  gap: { x: number; y: number };
  /** The whole panel, mm. */
  size: { width: number; height: number };
  /** Waste strips outside the block of boards, mm. */
  rails: { left: number; right: number; top: number; bottom: number };
  toolingHoles: number;
  fiducials: number;
  /** Small holes drilled through the break-off tabs. */
  mouseBites: number;
  breakaway: Breakaway;
};

export const BREAKAWAY_LABEL: Record<Breakaway, string> = {
  "mouse-bites": "Tabs with mouse bites",
  "v-score": "V-score",
  tabs: "Routed tabs",
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const snap = (v: number) => Math.round(v * 20) / 20;

export function boxOf(s: CfShape): Box {
  if (s.k === "circle" || s.k === "ring") return { minX: s.x - s.r, minY: s.y - s.r, maxX: s.x + s.r, maxY: s.y + s.r };
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const [x, y] of s.pts) {
    if (x < a) a = x;
    if (x > c) c = x;
    if (y < b) b = y;
    if (y > d) d = y;
  }
  return { minX: a, minY: b, maxX: c, maxY: d };
}

function extentOf(shapes: CfShape[]): Box | null {
  let out: Box | null = null;
  for (const s of shapes) {
    const b = boxOf(s);
    if (!Number.isFinite(b.minX)) continue;
    out = out ? { minX: Math.min(out.minX, b.minX), minY: Math.min(out.minY, b.minY), maxX: Math.max(out.maxX, b.maxX), maxY: Math.max(out.maxY, b.maxY) } : b;
  }
  return out;
}

/** Sorted values with near-equal ones merged. */
function distinct(values: number[], tol = 0.06): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

const evenlySpaced = (v: number[], tol = 0.08) => v.length < 3 || v.slice(2).every((x, i) => Math.abs(x - v[i + 1] - (v[1] - v[0])) <= tol);

const inside = (b: Box, x: number, y: number, tol = 0.02) => x >= b.minX - tol && x <= b.maxX + tol && y >= b.minY - tol && y <= b.maxY + tol;

function gridFrom(xs: number[], ys: number[], width: number, height: number, method: PanelGrid["method"]): PanelGrid {
  const windows: Box[] = [];
  for (const y of ys) for (const x of xs) windows.push({ minX: x, minY: y, maxX: x + width, maxY: y + height });
  return { columns: xs.length, rows: ys.length, windows, unit: { width: r2(width), height: r2(height) }, pitch: { x: r2(xs.length > 1 ? xs[1] - xs[0] : width), y: r2(ys.length > 1 ? ys[1] - ys[0] : height) }, method };
}

/**
 * The repeat in an outline layer, or null when it draws one board. Two ways a panel is drawn: every board's own
 * outline (tab-routed panels), or one frame with score lines across it (V-scored panels).
 */
export function findGrid(outline: CfShape[]): PanelGrid | null {
  const segments: [number, number][][] = [];
  for (const o of outline) {
    if (o.k === "stroke") for (let i = 1; i < o.pts.length; i++) segments.push([o.pts[i - 1], o.pts[i]]);
    else if (o.k === "poly" && o.region) segments.push([...o.pts, o.pts[0]]);
  }
  if (!segments.length) return null;
  const loops = chainOutline(segments).map((pts) => {
    const b = boxOf({ k: "poly", pts });
    return { ...b, w: b.maxX - b.minX, h: b.maxY - b.minY };
  });

  // 1 · The same outline, many times, on a regular grid.
  const groups = new Map<string, typeof loops>();
  for (const l of loops) {
    if (l.w < 3 || l.h < 3) continue;
    const key = `${snap(l.w)}x${snap(l.h)}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const repeated = [...groups.values()].filter((g) => g.length >= 2).sort((a, b) => b.length * b[0].w * b[0].h - a.length * a[0].w * a[0].h);
  for (const g of repeated) {
    const xs = distinct(g.map((l) => l.minX));
    const ys = distinct(g.map((l) => l.minY));
    if (xs.length * ys.length !== g.length || !evenlySpaced(xs) || !evenlySpaced(ys)) continue;
    // Boards cannot overlap: the pitch is at least the board.
    if ((xs.length > 1 && xs[1] - xs[0] < g[0].w - 0.06) || (ys.length > 1 && ys[1] - ys[0] < g[0].h - 0.06)) continue;
    return gridFrom(xs, ys, g[0].w, g[0].h, "outlines");
  }

  // 2 · One frame, cut by straight lines that run right across it.
  const frame = loops[0];
  if (!frame || frame.w < 6 || frame.h < 6) return null;
  const vertical: number[] = [];
  const horizontal: number[] = [];
  for (const [a, b] of segments) {
    const dx = Math.abs(a[0] - b[0]);
    const dy = Math.abs(a[1] - b[1]);
    if (dx < 0.01 && dy >= frame.h * 0.9 && a[0] > frame.minX + 0.5 && a[0] < frame.maxX - 0.5) vertical.push(a[0]);
    else if (dy < 0.01 && dx >= frame.w * 0.9 && a[1] > frame.minY + 0.5 && a[1] < frame.maxY - 0.5) horizontal.push(a[1]);
  }
  if (!vertical.length && !horizontal.length) return null;
  const cells = (cuts: number[]) => {
    const edges = distinct(cuts);
    const all = edges.slice(1).map((e, i) => ({ from: edges[i], size: e - edges[i] }));
    if (!all.length) return { unit: 0, starts: [] as number[] };
    // Narrow cells at the two ends are the frame's rails, not boards: leave them out first. (A single board in a
    // frame with 5 mm rails all round has four 5 × 5 mm corners; they are not a 2 × 2 panel of 5 mm boards.)
    const widest = Math.max(...all.map((c) => c.size));
    let sizes = all;
    while (sizes.length > 1 && sizes[0].size < widest * 0.4) sizes = sizes.slice(1);
    while (sizes.length > 1 && sizes[sizes.length - 1].size < widest * 0.4) sizes = sizes.slice(0, -1);
    // The board is the cell size seen most often; odd cells left at the ends are rails too.
    const tally = new Map<number, number>();
    for (const c of sizes) tally.set(snap(c.size), (tally.get(snap(c.size)) ?? 0) + 1);
    const unit = [...tally].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    return { unit, starts: sizes.filter((c) => snap(c.size) === unit).map((c) => c.from) };
  };
  const cx = cells([frame.minX, ...vertical, frame.maxX]);
  const cy = cells([frame.minY, ...horizontal, frame.maxY]);
  if (cx.starts.length * cy.starts.length < 2 || cx.unit < 3 || cy.unit < 3) return null;
  if (!evenlySpaced(cx.starts) || !evenlySpaced(cy.starts)) return null;
  return gridFrom(cx.starts, cy.starts, cx.unit, cy.unit, "score-lines");
}

/**
 * Is every window a copy of the same board? Counts the artwork in each: a real panel has the same number of shapes
 * in every board. Cut-outs in one board, or a board that happens to be divided by a line, do not.
 */
export function sameInEvery(grid: PanelGrid, artwork: CfShape[]): boolean {
  const counts = new Array<number>(grid.windows.length).fill(0);
  for (const s of artwork) {
    const b = boxOf(s);
    const x = (b.minX + b.maxX) / 2;
    const y = (b.minY + b.maxY) / 2;
    const i = grid.windows.findIndex((w) => inside(w, x, y, 0));
    if (i >= 0) counts[i]++;
  }
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  return min >= 1 && max - min <= Math.max(2, max * 0.03);
}

/** The shapes of one board, moved so its lower-left corner is 0,0. `margin` lets silkscreen overhang the edge. */
export function cutShapes(shapes: CfShape[], win: Box, margin = 1): CfShape[] {
  const out: CfShape[] = [];
  const dx = -win.minX;
  const dy = -win.minY;
  for (const s of shapes) {
    const b = boxOf(s);
    if (!inside(win, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2)) continue;
    if (b.minX < win.minX - margin || b.maxX > win.maxX + margin || b.minY < win.minY - margin || b.maxY > win.maxY + margin) continue;
    out.push(s.k === "circle" || s.k === "ring" ? { ...s, x: s.x + dx, y: s.y + dy } : { ...s, pts: s.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) });
  }
  return out;
}

/** A rectangle outline for a board whose own outline is not drawn on its own (score-line panels). */
export const rectangleOutline = (win: Box): CfShape => {
  const w = win.maxX - win.minX;
  const h = win.maxY - win.minY;
  return { k: "stroke", w: 0.1, pts: [[0, 0], [w, 0], [w, h], [0, h], [0, 0]] };
};

/**
 * The holes of one board. A drill size that mostly falls outside the boards (tooling holes in the rails, mouse
 * bites in the tabs) belongs to the panel, so even its few hits on a board's edge are left out.
 */
export function cutHoles(holes: Hole[], slots: Slot[], grid: PanelGrid, win: Box): { holes: Hole[]; slots: Slot[] } {
  const bySize = new Map<string, { total: number; onBoard: number }>();
  const onBoard = (h: Hole) => grid.windows.some((w) => inside({ minX: w.minX + h.d / 2, minY: w.minY + h.d / 2, maxX: w.maxX - h.d / 2, maxY: w.maxY - h.d / 2 }, h.x, h.y, 0.02));
  for (const h of holes) {
    const k = h.d.toFixed(3);
    const t = bySize.get(k) ?? { total: 0, onBoard: 0 };
    t.total++;
    if (onBoard(h)) t.onBoard++;
    bySize.set(k, t);
  }
  const panelOnly = new Set([...bySize].filter(([, t]) => t.onBoard < t.total / 2).map(([k]) => k));
  return {
    holes: holes.filter((h) => !panelOnly.has(h.d.toFixed(3)) && inside(win, h.x, h.y)).map((h) => ({ ...h, x: h.x - win.minX, y: h.y - win.minY })),
    slots: slots
      .filter((s) => inside(win, (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2))
      .map((s) => ({ ...s, x1: s.x1 - win.minX, y1: s.y1 - win.minY, x2: s.x2 - win.minX, y2: s.y2 - win.minY })),
  };
}

/** The panel's own figures, from its outline, its holes and its top copper. */
export function panelFacts(grid: PanelGrid, outline: CfShape[], holes: Hole[], copperTop: CfShape[] = []): PanelFacts {
  const block = grid.windows.reduce<Box>((a, w) => ({ minX: Math.min(a.minX, w.minX), minY: Math.min(a.minY, w.minY), maxX: Math.max(a.maxX, w.maxX), maxY: Math.max(a.maxY, w.maxY) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const extent = extentOf(outline) ?? block;
  const offBoard = holes.filter((h) => !grid.windows.some((w) => inside(w, h.x, h.y, 0)));
  const mouseBites = offBoard.filter((h) => h.d <= 1).length;
  const gap = { x: grid.columns > 1 ? Math.max(0, r2(grid.pitch.x - grid.unit.width)) : 0, y: grid.rows > 1 ? Math.max(0, r2(grid.pitch.y - grid.unit.height)) : 0 };
  const touching = (grid.columns === 1 || gap.x < 0.05) && (grid.rows === 1 || gap.y < 0.05);
  // Panel fiducials: bare round copper dots in the rails, with no hole through them.
  const fiducials = copperTop.filter((s) => {
    if (s.k !== "circle" || s.pol === "C" || s.r < 0.25 || s.r > 1.6) return false;
    if (grid.windows.some((w) => inside(w, s.x, s.y, 0))) return false;
    return !holes.some((h) => Math.hypot(h.x - s.x, h.y - s.y) < 0.2);
  }).length;
  // The strip outside the boards is a rail plus the routed gap next to it; a strip no wider than the gap is no rail.
  const rail = (margin: number, g: number) => Math.max(0, r2(g > 0.05 ? (margin > g + 0.5 ? margin - g : 0) : margin));
  return {
    columns: grid.columns,
    rows: grid.rows,
    count: grid.windows.length,
    unit: grid.unit,
    pitch: grid.pitch,
    gap,
    size: { width: r2(extent.maxX - extent.minX), height: r2(extent.maxY - extent.minY) },
    rails: { left: rail(block.minX - extent.minX, gap.x || gap.y), right: rail(extent.maxX - block.maxX, gap.x || gap.y), top: rail(extent.maxY - block.maxY, gap.y || gap.x), bottom: rail(block.minY - extent.minY, gap.y || gap.x) },
    toolingHoles: offBoard.filter((h) => h.d >= 1.5).length,
    fiducials,
    mouseBites,
    breakaway: mouseBites >= 4 ? "mouse-bites" : touching || grid.method === "score-lines" ? "v-score" : "tabs",
  };
}

/** "6 × 6 = 36 boards" */
export const panelLabel = (p: Pick<PanelFacts, "columns" | "rows" | "count">) => `${p.columns} × ${p.rows} = ${p.count} boards`;
