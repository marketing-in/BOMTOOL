/**
 * A box made to fit the board, for any box type: its size from the board and its tallest part, and an estimate
 * of what a box maker charges for it (size-driven unit price, tooling or programme once). Plus the CNC work for
 * connector openings in any box. Estimates until the maker quotes.
 */
import { BOX_COST } from "@/data/costing";
import type { EnclosureSpec } from "@/lib/board/enclosures";

export type MakerStyle = keyof typeof BOX_COST.unit;

const LOOK: Record<MakerStyle, Pick<EnclosureSpec, "material" | "style" | "finish" | "cornerRadius" | "supplied"> & { name: string }> = {
  "sheet-metal": { name: "Sheet-metal box, powder coated", material: "steel", style: "sheet-metal", finish: "#3d4148", cornerRadius: 1, supplied: [] },
  diecast: { name: "Die-cast aluminium box", material: "aluminium", style: "diecast", finish: "#b9bdc3", cornerRadius: 5, supplied: [] },
  extruded: { name: "Extruded aluminium box", material: "aluminium", style: "extruded", finish: "#c7cbd1", cornerRadius: 3, supplied: [] },
  moulded: { name: "Moulded plastic box", material: "plastic", style: "moulded", finish: "#d9dadc", cornerRadius: 4, supplied: [] },
};

/** The smallest box of this style that holds the board with clearance, and its tallest top-side part under the lid. */
export function customBoxSpec(style: MakerStyle, board: { w: number; h: number; thickness: number }, tallestTopMm: number): EnclosureSpec {
  const wall = BOX_COST.wallMm[style];
  const lid = style === "sheet-metal" ? 1.5 : 3;
  const long = Math.max(board.w, board.h);
  const short = Math.min(board.w, board.h);
  const up = (x: number) => Math.ceil(x / 2) * 2;
  const length = up(long + 2 * BOX_COST.clearanceMm + 2 * wall);
  const width = up(short + 2 * BOX_COST.clearanceMm + 2 * wall);
  const height = up(wall + BOX_COST.standoffMm + board.thickness + Math.max(3, tallestTopMm) + BOX_COST.headroomMm + lid);
  const look = LOOK[style];
  return {
    mpn: `CUSTOM-${style.toUpperCase()}-${length}x${width}x${height}`,
    label: `${look.name}, made to fit — ${length} × ${width} × ${height} mm`,
    length,
    width,
    height,
    wall,
    lidHeight: lid,
    material: look.material,
    style: look.style,
    finish: look.finish,
    cornerRadius: look.cornerRadius,
    supplied: look.supplied,
  };
}

/** Outer surface of a box, cm². */
export const surfaceCm2 = (e: Pick<EnclosureSpec, "length" | "width" | "height">) => (2 * (e.length * e.width + e.length * e.height + e.width * e.height)) / 100;

export type BoxEstimate = { qty: number; unit: number; nre: number; volume: number };

export function estimateCustomBox(style: MakerStyle, spec: Pick<EnclosureSpec, "length" | "width" | "height">, qty: number, factor = 1): BoxEstimate {
  const n = Math.max(1, Math.round(qty));
  const u = BOX_COST.unit[style];
  const volume = BOX_COST.volume.floor + BOX_COST.volume.extra * Math.exp(-n / BOX_COST.volume.qty);
  return { qty: n, unit: Math.round((u.base + u.perCm2 * surfaceCm2(spec)) * volume * factor * 100) / 100, nre: Math.round(BOX_COST.nre[style] * factor), volume };
}

/** CNC openings for the connectors that meet a wall: per unit and once. */
export function machiningCost(cutouts: number) {
  return cutouts > 0 ? { perUnit: cutouts * BOX_COST.cutout.perUnit, nre: BOX_COST.cutout.nre } : { perUnit: 0, nre: 0 };
}
