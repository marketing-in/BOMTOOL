/**
 * Makes an uploaded fabrication set readable by everything downstream (Phase 29):
 *   1. a drill file written as a Gerber becomes Excellon;
 *   2. a panel is reduced to one board, moved to 0,0, and its figures are kept;
 *   3. every layer we recognised by name or comment is stamped with the standard X2 file function, so the drawing
 *      and the part reader — two separate readers — cannot disagree about what a file is.
 * Never throws: a set it cannot improve goes through as it came, with a note. Pure.
 */
import { parseExcellon, parseGerber, type CfShape } from "@/vendor/circuitflow/gerber-entry";
import { classifyLayer, fileFunctionFor, looksExcellon, looksGerber, type LayerInfo } from "./layers";
import { writeExcellon, writeGerber, type Hole, type Slot } from "./gerber-write";
import { cutHoles, cutShapes, findGrid, panelFacts, rectangleOutline, sameInEvery, type PanelFacts } from "./panel";

export type BoardFile = { name: string; text: string };
export type NormalisedSet = { gerbers: BoardFile[]; panel: PanelFacts | null; notes: string[] };

const shapesOf = (f: BoardFile) => parseGerber(f.text, f.name).objects as unknown as CfShape[];

/** Holes and slots from a drill file in either format, in millimetres. */
function drillOf(f: BoardFile): { holes: Hole[]; slots: Slot[]; plated: boolean; wasGerber: boolean } | null {
  if (looksGerber(f.text)) {
    const shapes = shapesOf(f);
    const holes: Hole[] = [];
    const slots: Slot[] = [];
    for (const s of shapes) {
      if (s.pol === "C") continue;
      if (s.k === "circle") holes.push({ x: s.x, y: s.y, d: Math.round(s.r * 2000) / 1000 });
      else if (s.k === "stroke") for (let i = 1; i < s.pts.length; i++) slots.push({ x1: s.pts[i - 1][0], y1: s.pts[i - 1][1], x2: s.pts[i][0], y2: s.pts[i][1], d: Math.round(s.w * 1000) / 1000 });
    }
    // A drawing of the holes (symbols, a table) is strokes, not flashes: not a drill file.
    if (!holes.length || slots.length > holes.length * 2 + 20) return null;
    return { holes, slots, plated: !/npth|non.?plated/i.test(f.name), wasGerber: true };
  }
  if (!looksExcellon(f.text) && !/^\s*T\d+/m.test(f.text)) return null;
  const d = parseExcellon(f.text, f.name);
  return { holes: d.hits.map((h) => ({ x: h.x, y: h.y, d: h.d })), slots: d.slots.map((s) => ({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, d: s.d })), plated: d.plated, wasGerber: false };
}

const hasFileFunction = (text: string) => /TF\.FileFunction,/.test(text.slice(0, 4000));

export function normaliseBoardSet(files: BoardFile[]): NormalisedSet {
  const notes: string[] = [];
  const infos = files.map((f) => classifyLayer(f.name, f.text));
  const copperLayers = infos.filter((i) => i.type === "copper").length;
  let out = files.map((f) => ({ ...f }));
  let panel: PanelFacts | null = null;

  // Drill data, read once: needed both to rewrite a Gerber-format drill and to cut a panel.
  const drills = new Map<number, NonNullable<ReturnType<typeof drillOf>>>();
  infos.forEach((info, i) => {
    if (info.type !== "drill") return;
    try {
      const d = drillOf(files[i]);
      if (d) drills.set(i, d);
    } catch {
      // unreadable: left as it came
    }
  });

  try {
    const outlineAt = infos.findIndex((i) => i.type === "outline");
    const outline = outlineAt >= 0 && looksGerber(files[outlineAt].text) ? shapesOf(files[outlineAt]) : null;
    const grid = outline ? findGrid(outline) : null;
    if (grid && outline) {
      // Parse the artwork only now: most uploads are one board and stop above.
      const shapes = new Map<number, CfShape[]>();
      infos.forEach((info, i) => {
        if (i === outlineAt) shapes.set(i, outline);
        else if (info.type !== "drill" && info.type !== "unknown" && looksGerber(files[i].text)) shapes.set(i, shapesOf(files[i]));
      });
      const artworkAt = ["copper", "soldermask", "silkscreen"].map((t) => infos.findIndex((i, k) => i.type === t && shapes.has(k))).find((k) => k >= 0);
      const isPanel = artworkAt === undefined ? false : sameInEvery(grid, shapes.get(artworkAt)!);
      if (isPanel) {
        const win = grid.windows[0];
        const allHoles = [...drills.values()].flatMap((d) => d.holes);
        const topAt = infos.findIndex((i, k) => i.type === "copper" && i.side === "top" && shapes.has(k));
        panel = panelFacts(grid, outline, allHoles, topAt >= 0 ? shapes.get(topAt)! : []);
        out = out.map((f, i) => {
          const info = infos[i];
          const drill = drills.get(i);
          if (drill) {
            const cut = cutHoles(drill.holes, drill.slots, grid, win);
            return { name: f.name, text: writeExcellon(cut.holes, cut.slots, { plated: drill.plated, comments: ["One board of the panel"] }) };
          }
          const s = shapes.get(i);
          if (!s) return f;
          let cut = cutShapes(s, win, info.type === "outline" ? 0.3 : 1);
          if (info.type === "outline" && !cut.some((c) => c.k === "stroke" || (c.k === "poly" && c.region))) cut = [rectangleOutline(win)];
          return { name: f.name, text: writeGerber(cut, { fileFunction: fileFunctionFor(info, copperLayers), comments: ["One board of the panel"] }) };
        });
        notes.push(`These Gerbers are a panel of ${panel.count} boards (${panel.columns} × ${panel.rows}). One board is shown.`);
        drills.clear();
      }
    }
  } catch (e) {
    notes.push(`The files were checked for a panel but could not be cut to one board (${e instanceof Error ? e.message : "unknown error"}).`);
    out = files.map((f) => ({ ...f }));
    panel = null;
  }

  // A drill file that is still a Gerber (no panel, or the cut failed): rewrite it as Excellon.
  for (const [i, d] of drills) {
    if (!d.wasGerber) continue;
    out[i] = { name: out[i].name, text: writeExcellon(d.holes, d.slots, { plated: d.plated, comments: ["Rewritten from a drill file that came as a Gerber"] }) };
    notes.push(`${out[i].name}: the drill file came as a Gerber and was read as holes.`);
  }

  // Stamp what we recognised, so both readers agree.
  out = out.map((f, i) => {
    const fn = fileFunctionFor(infos[i], copperLayers);
    if (!fn || hasFileFunction(f.text) || !looksGerber(f.text)) return f;
    return { name: f.name, text: `%TF.FileFunction,${fn}*%\n${f.text}` };
  });
  return { gerbers: out, panel, notes };
}

/** What a file is after normalising — the same answer the upload used. */
export const layerOf = (f: BoardFile): LayerInfo => classifyLayer(f.name, f.text);
