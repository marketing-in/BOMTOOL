import { makePart } from "@/vendor/circuitflow/entry";
import type { StudioBoard, StudioLook, StudioPart } from "@/vendor/circuitflow/studio/entry";
import { padsFor } from "@/lib/board/artwork";
import type { BodySpec } from "@/lib/board/bodies";
import { maskColor, mix } from "./textures";
import type { ViewerData, ViewerPart } from "./types";

const COPPER = "#c27c3e";
/** Through-hole bodies: their pads get drilled holes, so the studio draws pins and the solder fillets underneath. */
const THT_SHAPES = new Set(["dip", "to220", "to92", "header", "terminal", "axial", "hc49", "relay", "electrolytic"]);

const isTht = (b: BodySpec) => (b.shape ? THT_SHAPES.has(b.shape) : false) || b.kind === "connector";

/**
 * The app's footprint pads in circuitflow's frame. Our boards are y-up; circuitflow's are y-down. A top part keeps its
 * rotation and has its pads mirrored in y; a bottom part is seen through the board, so its rotation turns the other way
 * and its pads keep their y (see toCircuitflowBoard).
 */
function padsOf(p: ViewerPart) {
  const tht = isTht(p.body);
  const flip = p.side === "BOTTOM" ? 1 : -1;
  return padsFor(p.body).map((q) => ({
    x: q.x,
    y: q.y * flip,
    w: q.w,
    h: q.h,
    rot: q.rot,
    shape: q.round || tht ? "circle" : "rect",
    ...(tht ? { hole: Math.max(0.6, Math.min(q.w, q.h) * 0.55) } : {}),
  }));
}

/** Board colours from the project spec: mask, copper seen through it, the pad finish and the legend. */
export function studioLook(board: ViewerData["board"]): StudioLook {
  const mask = maskColor(board.maskColor);
  return {
    mask,
    edge: mix(mask, "#000000", 0.4),
    trace: mix(mask, COPPER, 0.34),
    traceBottom: mix(mask, COPPER, 0.24),
    pad: board.finish.toUpperCase().includes("HASL") ? "#cfd3d6" : "#d4b25a",
    silk: board.silkColor === "black" ? "#161616" : "#f4f4ee",
    core: "#c9b27a",
  };
}

/**
 * The BoM's board as circuitflow's board and parts (src/vendor/circuitflow): millimetres, centred, y down, with each
 * placed part's rotation, side, package, value, MPN, body size, pads and through-hole leads — for the SMT line and the
 * board studio. `dnp` keeps not-fitted parts (flagged) for the studio, which draws them as a footprint only.
 */
export function toCircuitflowBoard(data: ViewerData, { dnp = false }: { dnp?: boolean } = {}): { board: StudioBoard & { source: string; layers: number; parts: StudioPart[] }; parts: StudioPart[] } {
  const parts: StudioPart[] = data.parts
    .filter((p) => dnp || !p.dnp)
    .map((p) => {
      const bottom = p.side === "BOTTOM";
      const round = p.body.shape === "electrolytic" || (p.body.kind === "can" && !p.body.shape);
      const part = makePart({
        ref: p.refDes,
        x: p.x,
        y: -p.y,
        rot: bottom ? -p.rotation : p.rotation,
        side: bottom ? "bottom" : "top",
        package: p.pkg ?? "",
        value: p.value ?? "",
        mpn: p.mpn ?? "",
        w: p.body.length,
        d: p.body.width,
        h: p.body.height,
        ...(isTht(p.body) ? { leads: "tht" } : {}),
      });
      return { ...part, ...(round ? { shape: "cyl" } : {}), pads: padsOf(p), ...(p.dnp ? { dnp: true } : {}) };
    });
  const board = {
    id: `${data.revisionId ?? "quick"}:${data.title}:${data.board.width}x${data.board.height}`,
    name: data.title,
    source: "blueprint",
    width: data.board.width,
    height: data.board.height,
    layers: data.board.layerCount,
    look: studioLook(data.board),
    parts,
  };
  return { board, parts };
}
