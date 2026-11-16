/**
 * Writes shapes back out as a plain RS-274X Gerber, and holes as an Excellon drill file (Phase 29). Used when the
 * upload has to change a file before the readers see it: one board cut out of a panel, or a drill file that came
 * as a Gerber. Millimetres, absolute coordinates, nothing a 1990s reader would not know. Pure.
 */
import type { CfShape } from "@/vendor/circuitflow/gerber-entry";

export type Hole = { x: number; y: number; d: number };
export type Slot = { x1: number; y1: number; x2: number; y2: number; d: number };

/** 4.6 format, leading zeros left out: 12.345 mm → "12345000". */
const co = (mm: number) => String(Math.round(mm * 1e6));
const size = (mm: number) => Math.max(0.001, mm).toFixed(4);

/** An axis-aligned rectangle given as four corners: its centre and size, else null. */
function asRect(pts: [number, number][]): { x: number; y: number; w: number; h: number } | null {
  if (pts.length !== 4) return null;
  const xs = [...new Set(pts.map((p) => Math.round(p[0] * 1e4)))];
  const ys = [...new Set(pts.map((p) => Math.round(p[1] * 1e4)))];
  if (xs.length !== 2 || ys.length !== 2) return null;
  const x0 = Math.min(...pts.map((p) => p[0]));
  const x1 = Math.max(...pts.map((p) => p[0]));
  const y0 = Math.min(...pts.map((p) => p[1]));
  const y1 = Math.max(...pts.map((p) => p[1]));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

/**
 * One Gerber layer from shapes, in the order given (a clear shape removes what was drawn before it). Round flashes
 * stay flashes and rectangular pads stay rectangular flashes, so a reader still sees them as pads.
 */
export function writeGerber(shapes: CfShape[], opts: { fileFunction?: string | null; comments?: string[] } = {}): string {
  const apertures = new Map<string, number>();
  const code = (def: string) => {
    let d = apertures.get(def);
    if (!d) {
      d = 10 + apertures.size;
      apertures.set(def, d);
    }
    return d;
  };
  const body: string[] = [];
  let pol: "D" | "C" = "D";
  let current = 0;
  const select = (def: string) => {
    const d = code(def);
    if (d !== current) {
      body.push(`D${d}*`);
      current = d;
    }
  };
  const polarity = (p: "D" | "C" | undefined) => {
    const want = p === "C" ? "C" : "D";
    if (want !== pol) {
      body.push(`%LP${want}*%`);
      pol = want;
    }
  };
  const line = (pts: [number, number][]) => {
    body.push(`X${co(pts[0][0])}Y${co(pts[0][1])}D02*`);
    for (const p of pts.slice(1)) body.push(`X${co(p[0])}Y${co(p[1])}D01*`);
  };

  for (const s of shapes) {
    if (s.k === "circle") {
      if (!(s.r > 0)) continue;
      polarity(s.pol);
      select(`C,${size(s.r * 2)}`);
      body.push(`X${co(s.x)}Y${co(s.y)}D03*`);
    } else if (s.k === "stroke") {
      if (s.pts.length < 2) continue;
      polarity(s.pol);
      select(`C,${size(s.w)}`);
      line(s.pts);
    } else if (s.k === "ring") {
      polarity(s.pol);
      select(`C,${size(s.w)}`);
      const pts: [number, number][] = [];
      for (let i = 0; i <= 48; i++) pts.push([s.x + s.r * Math.cos((i / 48) * 2 * Math.PI), s.y + s.r * Math.sin((i / 48) * 2 * Math.PI)]);
      line(pts);
    } else {
      if (s.pts.length < 3) continue;
      polarity(s.pol);
      const rect = s.region ? null : asRect(s.pts);
      if (rect && rect.w > 0 && rect.h > 0) {
        select(`R,${size(rect.w)}X${size(rect.h)}`);
        body.push(`X${co(rect.x)}Y${co(rect.y)}D03*`);
      } else {
        body.push("G36*");
        line([...s.pts, s.pts[0]]);
        body.push("G37*");
      }
    }
  }

  return [
    ...(opts.comments ?? []).map((c) => `G04 ${c.replace(/[*%]/g, " ")}*`),
    ...(opts.fileFunction ? [`%TF.FileFunction,${opts.fileFunction}*%`] : []),
    "%FSLAX46Y46*%",
    "%MOMM*%",
    ...[...apertures].map(([def, d]) => `%ADD${d}${def}*%`),
    "G01*",
    "%LPD*%",
    ...body,
    "M02*",
    "",
  ].join("\n");
}

/** One Excellon drill file: a tool per diameter, holes, then slots (G85). Millimetres with decimal points. */
export function writeExcellon(holes: Hole[], slots: Slot[] = [], opts: { plated?: boolean; comments?: string[] } = {}): string {
  const tools = new Map<string, number>();
  const tool = (d: number) => {
    const key = d.toFixed(3);
    let t = tools.get(key);
    if (!t) {
      t = tools.size + 1;
      tools.set(key, t);
    }
    return t;
  };
  for (const h of holes) tool(h.d);
  for (const s of slots) tool(s.d);
  const n = (v: number) => (Math.round(v * 1e4) / 1e4).toFixed(4);
  const body: string[] = [];
  for (const [key, t] of tools) {
    const mine = holes.filter((h) => h.d.toFixed(3) === key);
    const cuts = slots.filter((s) => s.d.toFixed(3) === key);
    if (!mine.length && !cuts.length) continue;
    body.push(`T${String(t).padStart(2, "0")}`);
    for (const h of mine) body.push(`X${n(h.x)}Y${n(h.y)}`);
    for (const s of cuts) body.push(`X${n(s.x1)}Y${n(s.y1)}G85X${n(s.x2)}Y${n(s.y2)}`);
  }
  return [
    "M48",
    ...(opts.comments ?? []).map((c) => `;${c}`),
    ...(opts.plated === false ? [";TYPE=NON_PLATED"] : []),
    "METRIC",
    ...[...tools].map(([key, t]) => `T${String(t).padStart(2, "0")}C${key}`),
    "%",
    ...body,
    "M30",
    "",
  ].join("\n");
}
