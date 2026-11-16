/**
 * Says what a fabrication file is. In order of trust: the Gerber X2 attribute, a KiCad name, the extension, the
 * file's own format (Excellon), a comment in its head that names the layer, and its bare name. The names live in
 * one table (cam-names.ts).
 */
import { CAM_COMMENTS, GERBER_EXTENSIONS, layerFromExtension, layerFromWords } from "./cam-names";

export type LayerType = "outline" | "copper" | "soldermask" | "silkscreen" | "solderpaste" | "drill" | "drawing" | "unknown";
export type LayerSide = "top" | "bottom" | "inner" | "all";
/** `label` names a layer the picture leaves out ("Via plugging", "Drill drawing"). */
export type LayerInfo = { type: LayerType; side: LayerSide; index?: number; label?: string };

const KICAD: [RegExp, LayerInfo][] = [
  [/F[._-]Cu/i, { type: "copper", side: "top" }],
  [/B[._-]Cu/i, { type: "copper", side: "bottom" }],
  [/In(\d+)[._-]Cu/i, { type: "copper", side: "inner" }],
  [/F[._-]Mask/i, { type: "soldermask", side: "top" }],
  [/B[._-]Mask/i, { type: "soldermask", side: "bottom" }],
  [/F[._-]Silk/i, { type: "silkscreen", side: "top" }],
  [/B[._-]Silk/i, { type: "silkscreen", side: "bottom" }],
  [/F[._-]Paste/i, { type: "solderpaste", side: "top" }],
  [/B[._-]Paste/i, { type: "solderpaste", side: "bottom" }],
  [/Edge[._-]Cuts/i, { type: "outline", side: "all" }],
];

/** RS-274X: a format statement, a unit or an aperture definition near the top. */
export const looksGerber = (text: string) => /%FS[LTD]?[AI]?X\d\dY\d\d|%MO(MM|IN)\*%|%ADD\d+[A-Za-z]/.test(text.slice(0, 6000));

/** Excellon: the M48 header, or tool definitions with a diameter, in a file that is not a Gerber. */
export const looksExcellon = (text: string) => {
  const head = text.slice(0, 4000);
  return !looksGerber(head) && (/^\s*M48\b/m.test(head) || (/^T\d+(?:[FS][\d.]+)*C[\d.]+/m.test(head) && /^(?:X[+-]?[\d.]+)?Y?[+-]?[\d.]+\s*$/m.test(text.slice(0, 20000))));
};

/** The X2 file function, from the attribute itself or from the comment form KiCad and others also write. */
function fromX2(head: string): LayerInfo | null {
  const x2 = head.match(/%TF\.FileFunction,([^*]+)\*%/) ?? head.match(/G04\s*#@!\s*TF\.FileFunction,([^*]+)\*/);
  if (!x2) return null;
  const f = x2[1].split(",").map((s) => s.trim());
  const side: LayerSide = /Top/i.test(x2[1]) ? "top" : /Bot/i.test(x2[1]) ? "bottom" : /Inr/i.test(x2[1]) ? "inner" : "all";
  const idx = f[1]?.match(/^L(\d+)$/)?.[1];
  if (f[0] === "Copper") return { type: "copper", side, index: idx ? Number(idx) : undefined };
  if (f[0] === "Soldermask") return { type: "soldermask", side };
  if (f[0] === "Legend") return { type: "silkscreen", side };
  if (f[0] === "Paste") return { type: "solderpaste", side };
  if (f[0] === "Profile") return { type: "outline", side: "all" };
  if (/^(Plated|NonPlated)$/.test(f[0])) return { type: "drill", side: "all" };
  return null;
}

/** The layer a comment at the top of the file names ("G04 -- layer:tl*"), as written. */
export function layerComment(content: string | undefined): string | null {
  const head = content?.slice(0, 4000) ?? "";
  for (const re of CAM_COMMENTS) {
    const m = head.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function classifyLayer(filename: string, content?: string): LayerInfo {
  const head = content?.slice(0, 4000) ?? "";
  const x2 = fromX2(head);
  if (x2) return x2;

  for (const [re, info] of KICAD) {
    const m = filename.match(re);
    if (m) return { ...info, index: info.side === "inner" ? Number(m[1]) + 1 : undefined };
  }

  const base = filename.split(/[\\/]/).pop() ?? filename;
  const ext = base.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const stem = ext ? base.slice(0, -(ext.length + 1)) : base;
  const excellon = content !== undefined && looksExcellon(content);

  if (ext) {
    const byExt = layerFromExtension(ext);
    // A .txt (or .drl) that is not a drill file is a note, not a layer.
    if (byExt && !(byExt.type === "drill" && ext === "txt" && content !== undefined && !excellon && !looksGerber(content))) return byExt;
  }
  if (excellon) return { type: "drill", side: "all" };

  // Only a Gerber can be named by a comment or by its name: given the content, it must be one; given only the
  // name, it must have no extension or a plain Gerber one ("readme.pdf" is not a layer).
  if (content !== undefined ? !looksGerber(content) : !!ext && !GERBER_EXTENSIONS.has(ext)) return { type: "unknown", side: "all" };
  const named = layerComment(content);
  const byComment = named ? layerFromWords(named) : null;
  if (byComment) return byComment;
  return layerFromWords(stem) ?? { type: "unknown", side: "all" };
}

/** The X2 file function for a layer we recognised, to write into a file that carries none. */
export function fileFunctionFor(info: LayerInfo, copperLayers = 2): string | null {
  const side = info.side === "top" ? "Top" : info.side === "bottom" ? "Bot" : null;
  switch (info.type) {
    case "copper":
      if (info.side === "top") return "Copper,L1,Top";
      if (info.side === "bottom") return `Copper,L${Math.max(2, copperLayers)},Bot`;
      return `Copper,L${info.index ?? 2},Inr`;
    case "soldermask":
      return side ? `Soldermask,${side}` : null;
    case "silkscreen":
      return side ? `Legend,${side}` : null;
    case "solderpaste":
      return side ? `Paste,${side}` : null;
    case "outline":
      return "Profile,NP";
    default:
      return null;
  }
}
