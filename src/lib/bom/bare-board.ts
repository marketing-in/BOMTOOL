/**
 * The bare board's own line in a customer BoM (Phase 29). Many BoMs end with a line such as
 *   "PCB, <name>, REV 3.0, FR4, Green Mask, White Legend, 2Layer, 1.6mmT, 35micron, ENIG, RoHS, 17 x 15 Sq.mm"
 * It is not a component: it is the fabrication spec of the board, written out in words. Pure.
 */

export type BoardSpecText = {
  layers?: number;
  thicknessMm?: number;
  copperOz?: number;
  finish?: string;
  mask?: string;
  silk?: string;
  sizeMm?: [number, number];
  material?: string;
  rohs?: boolean;
};

const STARTS_AS_BOARD = /^\s*(?:bare\s+)?(?:pcb|pwb|printed\s+(?:circuit|wiring)\s+board|bare\s+board|blank\s+pcb|raw\s+pcb)\b/i;
/** Things sold "for PCB" that are components, not the board. */
const A_COMPONENT = /\b(pcba|connector|header|terminal|socket|relay|antenna|switch|mount(ing)?|holder|standoff|spacer|jumper|clip|buzzer|transformer|fuse|pin|screw|support|stiffener|label|sticker)\b/i;
const A_SPEC_WORD = /\bFR-?4\b|\bCEM-?[13]\b|layers?\b|\bENIG\b|\bHASL\b|\bOSP\b|mask|legend|silk|micron|\boz\b|\d\s*mm|aluminium|aluminum|polyimide|rogers|\bTg\b/i;

/** Is this BoM line the bare board? It has no designator, starts as a board, and reads like a spec (or is just "PCB"). */
export function isBareBoardLine(text: string | null | undefined, refDes: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t || refDes?.trim()) return false;
  if (!STARTS_AS_BOARD.test(t) || A_COMPONENT.test(t)) return false;
  return A_SPEC_WORD.test(t) || t.split(/[\s,]+/).length <= 4;
}

const FINISHES: [RegExp, string][] = [
  [/\bENEPIG\b/i, "ENEPIG"],
  [/\bENIG\b|immersion\s+gold|\bIm(m)?\.?\s?Au\b/i, "ENIG"],
  [/lead[\s-]*free\s+HA(S)?L|\bLF[\s-]*HA(S)?L|HA(S)?L[\s-]*LF|\bPb[\s-]*free\s+HA(S)?L/i, "LF-HASL"],
  [/\bHA(S)?L\b/i, "HASL"],
  [/\bOSP\b/i, "OSP"],
  [/immersion\s+silver|\bIm(m)?\.?\s?Ag\b/i, "ImmAg"],
  [/immersion\s+tin|\bIm(m)?\.?\s?Sn\b/i, "ImmSn"],
  [/hard\s+gold|gold\s+finger/i, "Hard gold"],
];

const COLOURS = "green|black|blue|red|white|yellow|purple";
const THICKNESSES = [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.5, 1.6, 2, 2.4, 3.2];

/** Reads a board spec written in words. Only what the text says is returned. */
export function parseBoardSpec(text: string | null | undefined): BoardSpecText {
  const t = (text ?? "").replace(/µ|μ/g, "u");
  const out: BoardSpecText = {};

  const layers = t.match(/(\d{1,2})\s*-?\s*(?:layers?|lyr)\b/i) ?? t.match(/(?<![\w.])(\d{1,2})\s*L\b(?!\s*x)/);
  if (layers && Number(layers[1]) >= 1 && Number(layers[1]) <= 40) out.layers = Number(layers[1]);
  else if (/double[\s-]*sided?|two[\s-]*layer|\bD\/S\b/i.test(t)) out.layers = 2;
  else if (/single[\s-]*sided?|one[\s-]*layer|\bS\/S\b/i.test(t)) out.layers = 1;

  const size = t.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:sq\.?\s*)?mm/i) ?? t.match(/(\d+(?:\.\d+)?)\s*mm\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  if (size) out.sizeMm = [Number(size[1]), Number(size[2])];

  const thick = t.match(/(\d(?:\.\d+)?)\s*mm\s*(?:T\b|thk|thick)/i) ?? t.match(/(?:thk|thickness|thick)\s*[:=]?\s*(\d(?:\.\d+)?)\s*mm/i);
  if (thick) out.thicknessMm = Number(thick[1]);
  else {
    // A lone "1.6 mm" that is not part of the size.
    for (const m of t.matchAll(/(?<![\dx×*.]\s*)(\d(?:\.\d+)?)\s*mm\b(?!\s*[x×*])/gi)) {
      const v = Number(m[1]);
      if (THICKNESSES.includes(v) && !(out.sizeMm && (out.sizeMm[0] === v || out.sizeMm[1] === v))) {
        out.thicknessMm = v;
        break;
      }
    }
  }

  const micron = t.match(/(\d+(?:\.\d+)?)\s*(?:microns?|um)\b/i);
  const oz = t.match(/(\d+(?:\.\d+)?|\d\/\d)\s*oz\b/i);
  if (oz) out.copperOz = oz[1].includes("/") ? Number(oz[1].split("/")[0]) / Number(oz[1].split("/")[1]) : Number(oz[1]);
  else if (micron) out.copperOz = Math.round((Number(micron[1]) / 35) * 2) / 2;

  const finish = FINISHES.find(([re]) => re.test(t));
  if (finish) out.finish = finish[1];

  const mask = t.match(new RegExp(`\\b(${COLOURS})\\s+(?:solder\\s*)?(?:mask(?:ing)?|s/?m|resist)\\b`, "i"));
  if (mask) out.mask = mask[1].toLowerCase();
  const silk = t.match(new RegExp(`\\b(${COLOURS})\\s+(?:legend|silk(?:\\s*screen)?|ident|overlay|marking)\\b`, "i"));
  if (silk) out.silk = silk[1].toLowerCase();

  if (/\bFR-?4\b/i.test(t)) out.material = /high\s*tg|tg\s*1[57]\d/i.test(t) ? "FR-4 high Tg" : "FR-4";
  else if (/\bCEM-?([13])\b/i.test(t)) out.material = `CEM-${t.match(/\bCEM-?([13])\b/i)![1]}`;
  else if (/alumini?um|\bMCPCB\b|metal\s*core/i.test(t)) out.material = "Aluminium";
  else if (/polyimide|\bflex\b/i.test(t)) out.material = "Polyimide";
  else if (/rogers|\bRO\d{4}/i.test(t)) out.material = "Rogers";

  if (/\brohs\b/i.test(t)) out.rohs = true;
  return out;
}

/** "2 layers · 1.6 mm · 1 oz · ENIG · green mask · white legend · 17 × 15 mm" */
export function boardSpecLabel(s: BoardSpecText): string {
  return [
    s.layers ? `${s.layers} layer${s.layers === 1 ? "" : "s"}` : null,
    s.material ?? null,
    s.thicknessMm ? `${s.thicknessMm} mm` : null,
    s.copperOz ? `${s.copperOz} oz copper` : null,
    s.finish ?? null,
    s.mask ? `${s.mask} mask` : null,
    s.silk ? `${s.silk} legend` : null,
    s.sizeMm ? `${s.sizeMm[0]} × ${s.sizeMm[1]} mm` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
