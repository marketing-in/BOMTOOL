import type { ViewerData, ViewerPart } from "@/components/viewer/types";

/** The layer drawings the 3D board's faces are made from (src/components/viewer/textures.ts gerberFace) and split into. */
const FACE_LAYERS = new Set(["copper", "soldermask", "silkscreen"]);
const OUTER = new Set(["top", "bottom"]);

/** A part as the board studio draws it: where it sits, its body and pads, package, value and MPN, and whether it is fitted. */
function slim(p: ViewerPart): ViewerPart {
  return {
    refDes: p.refDes,
    x: p.x,
    y: p.y,
    rotation: p.rotation,
    side: p.side,
    body: p.body,
    pkg: p.pkg,
    value: p.value,
    mpn: p.mpn,
    dnp: p.dnp,
    lineId: null,
    lineNo: null,
    partId: null,
    marking: null,
    manufacturer: null,
    description: null,
    lifecycle: null,
    rohs: null,
    reach: null,
    scores: null,
    worst: null,
    required: 0,
    available: 0,
    shortfall: 0,
    bestUnit: null,
    landedUnit: null,
    alternates: [],
    imageUrl: null,
    datasheetUrl: null,
    kind: null,
    supply: null,
    risk: null,
  };
}

/**
 * The viewer data cut down to what the board studio draws, for a page that shows the board on its own (BoM step 3):
 * no pricing, risk, supply, route, box or fab measures, and only the layer drawings the 3D board uses — the outer
 * copper, mask and legend and the drills. Outline, paste and inner layers go, and so do the composite face drawings
 * when the copper layers are there to draw the faces from.
 */
export function forStudio(d: ViewerData): ViewerData {
  const layers = d.board.layers.filter((l) => l.type === "drill" || (FACE_LAYERS.has(l.type) && OUTER.has(l.side)));
  const copper = (side: string) => layers.some((l) => l.type === "copper" && l.side === side);
  return {
    ...d,
    board: { ...d.board, layers, top: copper("top") ? null : d.board.top, bottom: copper("bottom") ? null : d.board.bottom, fab: null },
    parts: d.parts.map(slim),
    product: d.product ? { ...d.product } : null,
    enclosure: null,
    box: null,
    route: [],
  };
}
