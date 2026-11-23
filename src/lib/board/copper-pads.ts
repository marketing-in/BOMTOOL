/**
 * The pads of a board's outer copper, read back from the layer drawings kept at upload (gerber-to-svg output), with
 * their sizes: what a part is soldered to, so its placement can be checked and centred against them. Pure.
 *
 * A flash (`<use>` of an aperture) on a copper layer is a pad or a via. It counts as a pad when the solder mask is
 * open over it (a tented via is covered) and it is not a small round ring round a via-sized hole. Knock-outs drawn
 * inside `<mask>` (clear polarity) are not pads. Everything is in the Gerbers' own millimetres, Y up.
 */

export type CopperPad = {
  x: number;
  y: number;
  /** Extent along x and y, mm (the aperture's bounding box). */
  w: number;
  h: number;
  shape: "rect" | "round" | "poly";
  /** A plated hole goes through it (a through-hole pad), its diameter in mm; 0 for SMD. */
  hole: number;
};

export type CopperPads = { top: CopperPad[]; bottom: CopperPad[] };

type Flash = { x: number; y: number; w: number; h: number; shape: CopperPad["shape"] };
type Def = { cx: number; cy: number; w: number; h: number; shape: CopperPad["shape"] };

const NUM = String.raw`-?[\d.]+(?:e-?\d+)?`;
const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(String.raw`\s${name}="(${NUM})"`));
  return m ? Number(m[1]) : null;
};

/**
 * The points of an SVG path as gerber-to-svg writes it (absolute M / L / A / Z, pairs may follow a command without
 * repeating it), one list per sub-path. Arc end points are kept; radii and flags are skipped.
 */
export function pathPoints(d: string): [number, number][][] {
  const tokens = d.match(new RegExp(String.raw`[MLAHVZmlahvz]|${NUM}`, "g")) ?? [];
  const subs: [number, number][][] = [];
  let cur: [number, number][] = [];
  let cmd = "M";
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t.toUpperCase();
      i++;
      if (cmd === "Z") {
        if (cur.length) subs.push(cur);
        cur = [];
      }
      continue;
    }
    if (cmd === "M") {
      if (cur.length) subs.push(cur);
      cur = [[num(), num()]];
      cmd = "L";
    } else if (cmd === "L") cur.push([num(), num()]);
    else if (cmd === "A") {
      i += 5;
      cur.push([num(), num()]);
    } else if (cmd === "H") cur.push([num(), cur.at(-1)?.[1] ?? 0]);
    else if (cmd === "V") cur.push([cur.at(-1)?.[0] ?? 0, num()]);
    else i++;
  }
  if (cur.length) subs.push(cur);
  return subs.filter((sub) => sub.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
}

/** Bounding box of the shapes in an SVG fragment, in drawing units. */
function bbox(fragment: string): { x0: number; y0: number; x1: number; y1: number; shape: CopperPad["shape"] } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let shape: CopperPad["shape"] | null = null;
  const take = (ax: number, ay: number, bx: number, by: number, s: CopperPad["shape"]) => {
    x0 = Math.min(x0, ax);
    y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx);
    y1 = Math.max(y1, by);
    shape = shape && shape !== s ? "poly" : s;
  };
  for (const tag of fragment.match(/<rect\b[^>]*>/g) ?? []) {
    const x = attr(tag, "x") ?? 0, y = attr(tag, "y") ?? 0, w = attr(tag, "width") ?? 0, h = attr(tag, "height") ?? 0;
    take(x, y, x + w, y + h, "rect");
  }
  for (const tag of fragment.match(/<circle\b[^>]*>/g) ?? []) {
    const cx = attr(tag, "cx") ?? 0, cy = attr(tag, "cy") ?? 0, r = attr(tag, "r") ?? 0;
    take(cx - r, cy - r, cx + r, cy + r, "round");
  }
  for (const tag of fragment.match(/<ellipse\b[^>]*>/g) ?? []) {
    const cx = attr(tag, "cx") ?? 0, cy = attr(tag, "cy") ?? 0, rx = attr(tag, "rx") ?? 0, ry = attr(tag, "ry") ?? 0;
    take(cx - rx, cy - ry, cx + rx, cy + ry, "round");
  }
  // Polygons (aperture macros such as rounded rectangles) and paths (obrounds): every coordinate pair counts.
  const pairs = (list: string, s: CopperPad["shape"]) => {
    const n = (list.match(new RegExp(NUM, "g")) ?? []).map(Number);
    for (let i = 0; i + 1 < n.length; i += 2) take(n[i], n[i + 1], n[i], n[i + 1], s);
  };
  for (const m of fragment.matchAll(/<polygon\b[^>]*\spoints="([^"]*)"/g)) pairs(m[1], "poly");
  // Paths (obrounds: a stroked line, or arcs): the stroke widens every point.
  for (const tag of fragment.match(/<path\b[^>]*>/g) ?? []) {
    const sw = attr(tag, "stroke-width") ?? 0;
    for (const sub of pathPoints(tag.match(/\sd="([^"]*)"/)?.[1] ?? "")) for (const [x, y] of sub) take(x - sw / 2, y - sw / 2, x + sw / 2, y + sw / 2, sw ? "round" : "poly");
  }
  return Number.isFinite(x0) && shape ? { x0, y0, x1, y1, shape } : null;
}

/** Every flash outside the `<defs>` of one layer drawing, in mm. */
export function flashesFromSvg(svg: string | null | undefined): Flash[] {
  if (!svg) return [];
  const head = svg.slice(0, 800);
  const unit = (/<svg[^>]*\swidth="[\d.]+in"/.test(head) ? 25.4 : 1) / 1000;
  const start = svg.indexOf("<defs>");
  const end = svg.indexOf("</defs>");
  const defsText = start >= 0 && end > start ? svg.slice(start, end) : "";
  const defs = new Map<string, Def>();
  // Masks (clear polarity) live in the defs too; their contents are not apertures.
  const defsNoMask = defsText.replace(/<mask\b[\s\S]*?<\/mask>/g, "");
  const addDef = (id: string, fragment: string) => {
    const b = bbox(fragment);
    if (b) defs.set(id, { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w: b.x1 - b.x0, h: b.y1 - b.y0, shape: b.shape });
  };
  for (const m of defsNoMask.matchAll(/<g\b[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)) addDef(m[1], m[2]);
  for (const m of defsNoMask.matchAll(/<(rect|circle|ellipse|polygon|path)\b[^>]*\sid="([^"]+)"[^>]*\/?>/g)) if (!defs.has(m[2])) addDef(m[2], m[0]);

  const body = end >= 0 ? svg.slice(end) : svg;
  const out: Flash[] = [];
  for (const tag of body.match(/<use\b[^>]*>/g) ?? []) {
    const id = tag.match(/href="#([^"]+)"/)?.[1];
    const d = id ? defs.get(id) : undefined;
    if (!d) continue;
    const x = (attr(tag, "x") ?? 0) + d.cx;
    const y = (attr(tag, "y") ?? 0) + d.cy;
    const w = d.w * unit, h = d.h * unit;
    // Zero-size draws and anything bigger than a large power pad are not part lands.
    if (w < 0.08 || h < 0.08 || w > 30 || h > 30) continue;
    out.push({ x: x * unit, y: y * unit, w, h, shape: d.shape });
  }
  // Regions: filled outlines with no stroke (pads drawn as polygons, but also copper pours). Each closed sub-path of
  // pad size is kept; the solder mask decides later which are pads.
  for (const tag of body.match(/<path\b[^>]*>/g) ?? []) {
    if (/\sfill="none"/.test(tag) || (attr(tag, "stroke-width") ?? 0) > 0) continue;
    for (const sub of pathPoints(tag.match(/\sd="([^"]*)"/)?.[1] ?? "")) {
      if (sub.length < 3) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [px, py] of sub) {
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
      }
      const w = (x1 - x0) * unit, h = (y1 - y0) * unit;
      if (w < 0.1 || h < 0.1 || w > 12 || h > 12) continue;
      out.push({ x: ((x0 + x1) / 2) * unit, y: ((y0 + y1) / 2) * unit, w, h, shape: "poly" });
    }
  }
  return out;
}

/** A grid of points for "is there one within r of here" in constant time. */
function grid<T extends { x: number; y: number }>(items: T[], cell = 2) {
  const g = new Map<string, T[]>();
  for (const it of items) {
    const k = `${Math.floor(it.x / cell)},${Math.floor(it.y / cell)}`;
    const l = g.get(k);
    if (l) l.push(it);
    else g.set(k, [it]);
  }
  return (x: number, y: number, r: number): T[] => {
    const out: T[] = [];
    const n = Math.ceil(r / cell);
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let i = cx - n; i <= cx + n; i++)
      for (let j = cy - n; j <= cy + n; j++) for (const it of g.get(`${i},${j}`) ?? []) if (Math.hypot(it.x - x, it.y - y) <= r) out.push(it);
    return out;
  };
}

/** Largest hole a via has; a plated hole bigger than this is a through-hole lead. */
const VIA_HOLE = 0.45;

/**
 * The pads of one side: copper flashes the mask opens over (when the mask layer has flashes at all), less via rings.
 * `holes` are the drill hits (diameter in mm).
 */
export function padsOfSide(copper: Flash[], mask: Flash[], holes: { x: number; y: number; d: number }[]): CopperPad[] {
  const maskNear = grid(mask);
  const holeNear = grid(holes.map((h) => ({ ...h })));
  const useMask = mask.length > 0;
  const out: CopperPad[] = [];
  for (const c of copper) {
    const hole = holeNear(c.x, c.y, 0.08).sort((a, b) => b.d - a.d)[0];
    const d = hole?.d ?? 0;
    // A small ring round a via-sized hole is a via, open or not.
    if (d > 0 && d <= VIA_HOLE && c.shape === "round" && Math.max(c.w, c.h) < 1.1) continue;
    if (useMask) {
      // Open when a mask opening sits over the pad's centre and is about its size or bigger.
      const open = maskNear(c.x, c.y, Math.max(c.w, c.h) / 2 + 0.1).some((m) => Math.abs(m.x - c.x) <= m.w / 2 && Math.abs(m.y - c.y) <= m.h / 2 && m.w >= c.w * 0.6 && m.h >= c.h * 0.6);
      if (!open) continue;
    }
    out.push({ x: c.x, y: c.y, w: c.w, h: c.h, shape: c.shape, hole: d > VIA_HOLE ? d : 0 });
  }
  // A pad drawn twice (a flash and a region on top of it) is one pad.
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = `${Math.round(p.x * 50)},${Math.round(p.y * 50)},${Math.round(p.w * 20)},${Math.round(p.h * 20)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Drill hits from the drill layer drawing: centre and diameter. */
export function holesFromSvg(svg: string | null | undefined): { x: number; y: number; d: number }[] {
  return flashesFromSvg(svg).map((f) => ({ x: f.x, y: f.y, d: Math.min(f.w, f.h) }));
}

type Layer = { type: string; side: string; svg: string };

/** Both outer sides' pads from a board's stored layer drawings. */
export function copperPads(layers: Layer[] | null | undefined): CopperPads {
  const find = (type: string, side: string) => layers?.find((l) => l.type === type && l.side === side)?.svg;
  const holes = (layers ?? []).filter((l) => l.type === "drill").flatMap((l) => holesFromSvg(l.svg));
  const side = (s: "top" | "bottom") => padsOfSide(flashesFromSvg(find("copper", s)), flashesFromSvg(find("soldermask", s)), holes);
  return { top: side("top"), bottom: side("bottom") };
}
