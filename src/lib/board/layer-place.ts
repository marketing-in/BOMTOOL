/**
 * Where a layer drawing sits on the board, in mm from the top-left of the board face. Each drawing has its own extent
 * (a drill file covers only its holes, and may be in inches), so stretching it over the board would shift it.
 * Only the start of the drawing is read — its viewBox and unit — so a caller can pass the first few hundred characters.
 */
export function layerPlace(svg: string, board: { width: number; height: number; origin?: { x: number; y: number } | null }): { x: number; y: number; w: number; h: number } {
  const full = { x: 0, y: 0, w: board.width, h: board.height };
  const head = svg.slice(0, 600);
  const vb = head.match(/viewBox="([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)"/);
  if (!vb || !board.origin) return full;
  // gerber-to-svg draws in thousandths of the file's unit, named on the width attribute.
  const k = (/\bwidth="[-\d.e]+in"/.test(head) ? 25.4 : 1) / 1000;
  const [x, y, w, h] = vb.slice(1).map((n) => Number(n) * k);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return full;
  // The drawing's frame is the Gerber's own, y up: its top edge is y + h, the board's is origin.y + height.
  return { x: x - board.origin.x, y: board.origin.y + board.height - (y + h), w, h };
}

export type LayerMeta = { key: string; type: string; side: string; index: number | null };

export type Sheet = {
  key: string;
  label: string;
  /** A few words beside the label: a thickness, a colour. */
  note: string | null;
  kind: "mask" | "copper" | "dielectric";
  /** The layer drawings laid on this sheet, each with the colour it is drawn in. */
  draw: { layer: string; color: string }[];
  /** "top" / "bottom": the finished face of the board is drawn on this sheet instead of single layers. */
  face: "top" | "bottom" | null;
  /** Drawn thickness in mm — exaggerated, so a 35 µm foil can be seen. */
  thick: number;
};

const COPPER = "c27c3e";

/**
 * The board pulled apart, top to bottom (Phase 27): solder mask with its silkscreen, each copper layer with the
 * laminate between them, the bottom mask. `layers` are the drawings on file; copper layers without one are still
 * there as plain sheets, from the layer count.
 */
export function buildSheets(input: { layerCount: number; thicknessMm: number; maskColor: string; finish: string; layers: LayerMeta[] }): Sheet[] {
  const { layers } = input;
  const find = (type: string, side: string) => layers.find((l) => l.type === type && l.side === side)?.key ?? null;
  const inner = layers.filter((l) => l.type === "copper" && l.side === "inner").sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const innerCount = Math.max(inner.length, Math.max(0, input.layerCount - 2));
  const total = innerCount + 2;
  const diel = (input.thicknessMm * 0.8) / Math.max(1, innerCount + 1);
  const mm = (v: number) => `${v >= 1 ? v.toFixed(1) : v.toFixed(2)} mm`;
  const copper = (key: string, label: string, layer: string | null): Sheet => ({ key, label, note: "35 µm foil", kind: "copper", draw: layer ? [{ layer, color: COPPER }] : [], face: null, thick: 0.35 });
  const out: Sheet[] = [];
  const maskTop = find("soldermask", "top");
  const silkTop = find("silkscreen", "top");
  out.push({ key: "mask-top", label: silkTop ? "Solder mask & silkscreen" : "Solder mask", note: `${input.maskColor}, ${input.finish} pads`, kind: "mask", draw: [...(maskTop ? [{ layer: maskTop, color: "d4af37" }] : []), ...(silkTop ? [{ layer: silkTop, color: "f5f5f5" }] : [])], face: "top", thick: 0.3 });
  out.push(copper("cu-top", `Top copper · L1`, find("copper", "top")));
  for (let k = 0; k < innerCount; k++) {
    // Outer pairs are bonded with prepreg; the middle of the stack is the core.
    const core = innerCount > 1 && k % 2 === 1;
    out.push({ key: `diel-${k}`, label: core ? "Core" : "Prepreg", note: mm(diel), kind: "dielectric", draw: [], face: null, thick: core ? 2.2 : 1.2 });
    out.push(copper(`cu-in-${k}`, `Inner copper · L${k + 2}`, inner[k]?.key ?? null));
  }
  out.push({ key: "diel-last", label: innerCount ? "Prepreg" : "Core", note: mm(diel), kind: "dielectric", draw: [], face: null, thick: innerCount ? 1.2 : 2.2 });
  out.push(copper("cu-bot", `Bottom copper · L${total}`, find("copper", "bottom")));
  const maskBot = find("soldermask", "bottom");
  out.push({ key: "mask-bot", label: "Bottom solder mask", note: input.maskColor, kind: "mask", draw: maskBot ? [{ layer: maskBot, color: "d4af37" }] : [], face: "bottom", thick: 0.3 });
  return out;
}
