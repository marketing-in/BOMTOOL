/**
 * How CAD and CAM tools name fabrication files (Phase 29). One table: the upload reads files with it
 * (src/lib/board/layers.ts) and the knowledge page shows it. To teach the tool a new name, add it here.
 *
 * Three places a file can say what it is, besides the Gerber X2 attribute:
 *   - its extension           board.GTL, board.cmp, board.smt
 *   - its name, no extension  tl, gtl, l2, ko — what CAM stations write when they re-export a job
 *   - a comment in its head   "G04 -- layer:tl*", "G04 Layer: TopLayer*"
 */
import type { LayerSide, LayerType } from "./layers";

export type CamLayer = { type: LayerType; side: LayerSide; label?: string };

const copper = (side: LayerSide): CamLayer => ({ type: "copper", side });
const mask = (side: LayerSide): CamLayer => ({ type: "soldermask", side });
const silk = (side: LayerSide): CamLayer => ({ type: "silkscreen", side });
const paste = (side: LayerSide): CamLayer => ({ type: "solderpaste", side });
const OUTLINE: CamLayer = { type: "outline", side: "all" };
const DRILL: CamLayer = { type: "drill", side: "all" };
const drawing = (label: string): CamLayer => ({ type: "drawing", side: "all", label });

export type CamGroup = {
  tool: string;
  /** Where the name is found. */
  where: "extension" | "name";
  note: string;
  names: Record<string, CamLayer>;
};

export const CAM_NAMES: CamGroup[] = [
  {
    tool: "Altium, Protel, EasyEDA",
    where: "extension",
    note: "G = Gerber, then T or B for the side, then the layer: L copper, S solder mask, O overlay (silkscreen), P paste. GKO and GM1 carry the outline.",
    names: {
      gtl: copper("top"), gbl: copper("bottom"), gts: mask("top"), gbs: mask("bottom"), gto: silk("top"), gbo: silk("bottom"),
      gtp: paste("top"), gbp: paste("bottom"), gko: OUTLINE, gm1: OUTLINE, gml: OUTLINE,
      gd1: drawing("Drill drawing"), gg1: drawing("Drill guide"), gpt: drawing("Pad master, top"), gpb: drawing("Pad master, bottom"),
    },
  },
  {
    tool: "Eagle",
    where: "extension",
    note: "The component side is the top, the solder side the bottom.",
    names: {
      cmp: copper("top"), sol: copper("bottom"), stc: mask("top"), sts: mask("bottom"), plc: silk("top"), pls: silk("bottom"),
      crc: paste("top"), crs: paste("bottom"), bor: OUTLINE, dim: OUTLINE, oln: OUTLINE, drd: DRILL,
    },
  },
  {
    tool: "OrCAD, PADS and CAM stations",
    where: "extension",
    note: "Three letters: the layer (SM mask, SS silkscreen, SP paste) and T or B for the side.",
    names: { top: copper("top"), bot: copper("bottom"), smt: mask("top"), smb: mask("bottom"), sst: silk("top"), ssb: silk("bottom"), spt: paste("top"), spb: paste("bottom"), out: OUTLINE },
  },
  {
    tool: "Drill files",
    where: "extension",
    note: "Excellon, whatever the extension. A .txt file counts only when it reads like a drill file.",
    names: { drl: DRILL, xln: DRILL, exc: DRILL, ncd: DRILL, tap: DRILL, txt: DRILL },
  },
  {
    tool: "CAM stations (re-exported jobs and panels)",
    where: "name",
    note: "A fabricator's CAM station names layers in two letters, often with no extension, and writes the name in a comment at the top of the file. The same names with a leading G are the Protel ones.",
    names: {
      tl: copper("top"), bl: copper("bottom"), ts: mask("top"), bs: mask("bottom"), to: silk("top"), bo: silk("bottom"),
      tp: paste("top"), bp: paste("bottom"), ko: OUTLINE, drl: DRILL,
      gtl: copper("top"), gbl: copper("bottom"), gts: mask("top"), gbs: mask("bottom"), gto: silk("top"), gbo: silk("bottom"),
      gtp: paste("top"), gbp: paste("bottom"), gko: OUTLINE, gm1: OUTLINE,
      comp: copper("top"), sold: copper("bottom"), top: copper("top"), bot: copper("bottom"), bottom: copper("bottom"),
      smt: mask("top"), smb: mask("bottom"), sst: silk("top"), ssb: silk("bottom"), spt: paste("top"), spb: paste("bottom"),
      rout: OUTLINE, route: OUTLINE, outline: OUTLINE, profile: OUTLINE, drill: DRILL, pth: DRILL, npth: DRILL,
      // Fabrication-only layers: read and named, kept out of the picture.
      sk: drawing("Via plugging"), plug: drawing("Via plugging"), vcut: drawing("V-score lines"), fab: drawing("Fabrication drawing"),
    },
  },
];

/** Inner copper by number: g2, gl2, gp1 (plane), l2, in1, inner2. Returns the layer number counted from the top. */
export function innerLayerIndex(token: string): number | null {
  const t = token.toLowerCase();
  const m = t.match(/^(?:g|gl|l|layer|lyr)(\d{1,2})$/) ?? t.match(/^g(\d{1,2})l$/);
  if (m) return Number(m[1]) >= 2 ? Number(m[1]) : null;
  const plane = t.match(/^gp(\d{1,2})$/);
  if (plane) return Number(plane[1]) + 1;
  const inr = t.match(/^(?:in|inr|inner|int)(\d{1,2})$/);
  return inr ? Number(inr[1]) + 1 : null;
}

/**
 * Names written out in words, as CAD exports and people name files: "Top Copper", "SOLDERMASK_BOTTOM",
 * "board-silkscreen-top", "Bottom Paste". Tested on the name with separators removed.
 */
export const CAM_WORDS: [RegExp, CamLayer][] = [
  [/edgecuts|boardoutline|outline|profile|keepout|boardshape|mechanical1$|mech1$|dimension/, OUTLINE],
  [/topsoldermask|soldermasktop|topmask|masktop|fmask|tsm$|smtop/, mask("top")],
  [/bottomsoldermask|soldermaskbot(tom)?|bot(tom)?mask|maskbot(tom)?|bmask|bsm$|smbot(tom)?/, mask("bottom")],
  [/topsilk(screen)?|silk(screen)?top|toplegend|legendtop|topoverlay|fsilks?(creen)?|tsk$|sstop/, silk("top")],
  [/bot(tom)?silk(screen)?|silk(screen)?bot(tom)?|bot(tom)?legend|legendbot(tom)?|bot(tom)?overlay|bsilks?(creen)?|bsk$|ssbot(tom)?/, silk("bottom")],
  [/toppaste(mask)?|paste(mask)?top|topcream|fpaste|sptop/, paste("top")],
  [/bot(tom)?paste(mask)?|paste(mask)?bot(tom)?|bot(tom)?cream|bpaste|spbot(tom)?/, paste("bottom")],
  [/topcopper|copper(layer)?top|toplayer|fcu$|^top$|layer1$|copperl1$/, copper("top")],
  [/bot(tom)?copper|copper(layer)?bot(tom)?|bot(tom)?layer|bcu$|^bot(tom)?$/, copper("bottom")],
  // Drawings before drills: a "drill drawing" is a picture of the holes, not the holes.
  [/viaplug|plugging|plughole/, drawing("Via plugging")],
  [/assembly|fabrication|fabdrawing|drilldrawing|drillmap|drillguide/, drawing("Drawing")],
  [/nonplated|npth|plated|drill(s|file|data)?$|^drill|excellon|throughhole/, DRILL],
];

/** A comment near the top of the file that names its layer, as CAM stations and some CAD tools write it. */
export const CAM_COMMENTS: RegExp[] = [
  /G04\s*-+\s*layer\s*:\s*([\w.\- ]+?)\s*\*/i, // "G04 -- layer:tl*"
  /G04\s+Layer\s*[:=]\s*([\w.\- ]+?)\s*\*/i, // "G04 Layer: TopLayer*"
  /G04\s+Layer_?Name\s*[:=]\s*([\w.\- ]+?)\s*\*/i,
  /^;\s*Layer\s*[:=]\s*([\w.\- ]+?)\s*$/im, // drill files
];

/** What a bare name ("tl", "GTL", "Top Copper", "l2") says, or null. */
export function layerFromWords(raw: string): (CamLayer & { index?: number }) | null {
  const token = raw.toLowerCase().trim();
  if (!token) return null;
  const compact = token.replace(/[\s_.\-]+/g, "");
  for (const g of CAM_NAMES) {
    if (g.where !== "name") continue;
    const hit = g.names[compact];
    if (hit) return hit;
  }
  const inner = innerLayerIndex(compact);
  if (inner) return { type: "copper", side: "inner", index: inner };
  for (const [re, layer] of CAM_WORDS) if (re.test(compact)) return layer;
  return null;
}

/** Extensions that only say "this is a Gerber": the layer is in the name or in a comment. */
export const GERBER_EXTENSIONS = new Set(["gbr", "ger", "gb", "gbx", "grb", "gerber", "pho", "art", "phd", "spl", "g"]);

/** What a file extension says, or null. */
export function layerFromExtension(ext: string): (CamLayer & { index?: number }) | null {
  const e = ext.toLowerCase();
  for (const g of CAM_NAMES) {
    if (g.where !== "extension") continue;
    const hit = g.names[e];
    if (hit) return hit;
  }
  const inner = e.match(/^g(\d{1,2})$/) ?? e.match(/^gl(\d{1,2})$/) ?? e.match(/^gp(\d)$/);
  return inner ? { type: "copper", side: "inner", index: Number(inner[1]) } : null;
}
