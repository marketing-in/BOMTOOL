/**
 * Do the placements fit the Gerbers? The footprint check compares the BoM with the pick-and-place list; this compares
 * the pick-and-place list with the copper itself. A placement that lies outside the board, or has no copper pad within
 * reach of where it sits, cannot be built as drawn — and when most of them are like that the Gerbers belong to
 * another board (or the placement file to another revision, panel or origin). Pure.
 *
 * Everything is in the Gerbers' own millimetres: the placements as the CAD tool wrote them, the board box and the pad
 * flashes as they were read off the copper layers.
 */

export type FitPoint = { x: number; y: number };
export type FitBox = { x: number; y: number; w: number; h: number };
export type FitPlacement = {
  refDes: string;
  x: number;
  y: number;
  side: string;
  /** How far from the placement point its own pads can be, mm: about half its body's diagonal plus a margin. */
  reach: number;
  /** A part whose leads go through the board: its pads are on both copper layers. */
  tht?: boolean;
};
export type FitPads = { top: FitPoint[]; bottom: FitPoint[] };

export type BoardFit = {
  level: "green" | "amber" | "red";
  /** Placements looked at. */
  checked: number;
  /** Placements outside the board's outline (beyond a 1 mm margin). */
  outside: string[];
  /** Placements on the board with no copper pad on their side within reach. */
  offPad: string[];
  /** Most placements miss the board: the Gerbers and the placements are not the same board (or not the same frame). */
  foreign: boolean;
  /** Whether pad positions were available; without them only the outline is checked. */
  padsChecked: boolean;
  /** One line for the screen. */
  note: string;
  /** Designator (upper case) → why it does not fit, for the footprint check to show. */
  why: Record<string, string>;
};

const MARGIN = 1;
const n = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-IN")} ${k === 1 ? one : many}`;
const mm = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("en-IN");

/**
 * The pad flashes of one copper layer as drawn by gerber-to-svg (the layer drawings kept with the board): every
 * `<use … x="…" y="…">` is a flashed pad at the Gerber coordinates × 1000, in the layer's units (the root's width says
 * mm or in). Regions and tracks are not pads and are left out.
 */
export function padsFromLayerSvg(svg: string | null | undefined): FitPoint[] {
  if (!svg) return [];
  const head = svg.slice(0, 600);
  const width = head.match(/<svg[^>]*\swidth="[\d.]+(mm|in)"/);
  const unit = width?.[1] === "in" ? 25.4 : 1;
  const out: FitPoint[] = [];
  const re = /<use\b[^>]*?\sx="(-?[\d.]+(?:e-?\d+)?)"[^>]*?\sy="(-?[\d.]+(?:e-?\d+)?)"/g;
  for (let m = re.exec(svg); m; m = re.exec(svg)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x: (x / 1000) * unit, y: (y / 1000) * unit });
  }
  return out;
}

/** The nearest pad's distance, by a coarse grid so a board with thousands of pads stays quick. */
function nearest(pads: FitPoint[]) {
  const CELL = 5;
  const grid = new Map<string, FitPoint[]>();
  for (const p of pads) {
    const k = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`;
    const list = grid.get(k);
    if (list) list.push(p);
    else grid.set(k, [p]);
  }
  return (x: number, y: number, reach: number): number => {
    const r = Math.ceil(reach / CELL);
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    let best = Infinity;
    for (let i = cx - r; i <= cx + r; i++)
      for (let j = cy - r; j <= cy + r; j++)
        for (const p of grid.get(`${i},${j}`) ?? []) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
    return best;
  };
}

/**
 * How well the placements fit the board. Red when more than a third of them miss it (then every miss is a mismatch
 * and the Gerbers are called out as another board's), amber when a few miss (each a mismatch of its own), green when
 * every placement sits on the board and on copper.
 */
export function placementFit({ placements, box, pads }: { placements: FitPlacement[]; box: FitBox | null; pads: FitPads | null }): BoardFit {
  const outside: string[] = [];
  const offPad: string[] = [];
  const why: Record<string, string> = {};
  const padsChecked = !!pads && pads.top.length + pads.bottom.length > 0;
  const near = padsChecked ? { top: nearest(pads!.top), bottom: nearest(pads!.bottom) } : null;
  const hasSide = { top: (pads?.top.length ?? 0) > 0, bottom: (pads?.bottom.length ?? 0) > 0 };
  for (const p of placements) {
    const ref = p.refDes.toUpperCase();
    if (box && (p.x < box.x - MARGIN || p.x > box.x + box.w + MARGIN || p.y < box.y - MARGIN || p.y > box.y + box.h + MARGIN)) {
      outside.push(p.refDes);
      why[ref] = `placed at ${mm(p.x)}, ${mm(p.y)} mm, outside the Gerber board (${mm(box.x)}–${mm(box.x + box.w)} × ${mm(box.y)}–${mm(box.y + box.h)} mm)`;
      continue;
    }
    if (!near) continue;
    const bottom = p.side.toUpperCase() === "BOTTOM";
    // A layer with no flashes at all (pads drawn as regions) says nothing either way.
    const own = bottom ? hasSide.bottom : hasSide.top;
    const other = bottom ? hasSide.top : hasSide.bottom;
    if (!own && !(p.tht && other)) continue;
    const reach = Math.max(1.5, p.reach);
    const d = Math.min(own ? (bottom ? near.bottom : near.top)(p.x, p.y, reach) : Infinity, p.tht && other ? (bottom ? near.top : near.bottom)(p.x, p.y, reach) : Infinity);
    if (d > reach) {
      offPad.push(p.refDes);
      why[ref] = `no copper pad on the ${bottom ? "bottom" : "top"} of the Gerbers where it is placed (${mm(p.x)}, ${mm(p.y)} mm)`;
    }
  }
  const checked = placements.length;
  const missed = outside.length + offPad.length;
  const foreign = checked >= 3 && missed / checked > 1 / 3;
  if (foreign) {
    const reason = outside.length >= offPad.length ? "lie outside the Gerber board" : "have no copper pad under them";
    // On a foreign board every designator says so, plainly: the cause is the files, not the part.
    for (const k of Object.keys(why)) why[k] = `the Gerbers do not fit the placements: ${why[k]}`;
    return {
      level: "red",
      checked,
      outside,
      offPad,
      foreign,
      padsChecked,
      note: `${n(missed, "placement")} of ${checked.toLocaleString("en-IN")} ${reason} — are these the Gerbers (or the pick-and-place file) of another board?`,
      why,
    };
  }
  if (missed)
    return {
      level: "amber",
      checked,
      outside,
      offPad,
      foreign,
      padsChecked,
      note: `${n(missed, "placement")} ${missed === 1 ? "does" : "do"} not sit on the Gerbers: ${[...outside, ...offPad].slice(0, 8).join(", ")}${missed > 8 ? " …" : ""}`,
      why,
    };
  return { level: "green", checked, outside, offPad, foreign, padsChecked, note: padsChecked ? `All ${n(checked, "placement")} sit on the board's pads` : `All ${n(checked, "placement")} lie on the board`, why };
}
