import { makePart } from "@/vendor/circuitflow/entry";
import type { StudioBoard, StudioLook, StudioPart } from "@/vendor/circuitflow/studio/entry";
import { padsFor } from "@/lib/board/artwork";
import { SHAPE_MODEL, THROUGH_HOLE_SHAPES, type BodySpec } from "@/lib/board/bodies";
import { maskColor, mix } from "./textures";
import type { ViewerData, ViewerPart } from "./types";

const COPPER = "#c27c3e";
/** Through-hole bodies: their pads get drilled holes, so the studio draws pins and the solder fillets underneath. */
const isTht = (b: BodySpec) => (b.shape ? THROUGH_HOLE_SHAPES.has(b.shape) : false) || b.kind === "connector";

/**
 * The studio model a body asks for by name: its shape's own model, or leads on a plain gull-wing or quad package.
 * Null leaves the choice to the studio, which reads the package, value and designator as before.
 */
export function studioModel(b: BodySpec): string | null {
  // A header body that is not its own pin grid (a catalogue header with no package: 10 × 6 mm, two pins) would get
  // posts and lands that are not its pins: the studio's own header draws it on the pads its kind gives.
  if (b.shape === "header" && !onPinGrid(b)) return null;
  if (b.shape) return SHAPE_MODEL[b.shape] ?? null;
  return b.kind === "quad" ? "qfp" : b.kind === "gullwing" ? "gull" : null;
}

/** A header whose length and width are its columns and rows at its pitch, as the body table makes them. */
function onPinGrid(b: BodySpec): boolean {
  const pitch = b.pitch || 2.54;
  const [rows, cols] = [Math.round(b.width / pitch), Math.round(b.length / pitch)];
  return rows >= 1 && cols >= 1 && rows * cols === b.pins;
}

type Land = { x: number; y: number; d: number };

/**
 * Drilled lands for the through-hole shapes whose pins are not one row along the body: a pin grid under a header, two
 * rows under a Mini-Fit or a bobbin, the two solder pins of a heatsink. Null: the pads the body's kind gives.
 */
function drilledLands(b: BodySpec): Land[] | null {
  const pitch = b.pitch || 2.54;
  const grid = (cols: number, rows: number, dx: number, dy: number, d: number): Land[] =>
    Array.from({ length: cols * rows }, (_, i) => ({ x: ((i % cols) - (cols - 1) / 2) * dx, y: (Math.floor(i / cols) - (rows - 1) / 2) * dy, d }));
  switch (b.shape) {
    case "header": {
      if (!onPinGrid(b)) return null;
      const rows = Math.max(1, Math.round(b.width / pitch));
      return grid(Math.max(1, Math.round(b.pins / rows)), rows, pitch, pitch, pitch * 0.65);
    }
    case "box-header":
    case "latch-header":
      return grid(Math.max(1, Math.round(b.pins / 2)), 2, pitch, pitch, pitch * 0.65);
    case "minifit":
      // Mini-Fit pins: 4.2 mm along the row, the two rows 5.5 mm apart.
      return grid(Math.max(1, Math.round(b.pins / 2)), 2, pitch, 5.5, 2.8);
    case "kk-header":
      return grid(Math.max(1, b.pins), 1, pitch, 0, pitch * 0.65);
    case "transformer":
    case "ct-transformer": {
      const per = Math.max(1, Math.ceil(b.pins / 2));
      return grid(per, 2, Math.min(pitch, (b.length * 0.9) / per), Math.max(pitch, b.width - 3), 2.2);
    }
    case "heatsink":
      return grid(b.pins, 1, pitch, 0, 3.6);
    default:
      return null;
  }
}

/**
 * The app's footprint pads in circuitflow's frame. Our boards are y-up; circuitflow's are y-down. A top part keeps its
 * rotation and has its pads mirrored in y; a bottom part is seen through the board, so its rotation turns the other way
 * and its pads keep their y (see toCircuitflowBoard).
 */
function padsOf(p: ViewerPart) {
  const tht = isTht(p.body);
  const flip = p.side === "BOTTOM" ? 1 : -1;
  const lands = drilledLands(p.body);
  if (lands) return lands.map((q) => ({ x: q.x, y: q.y * flip, w: q.d, h: q.d, rot: 0, shape: "circle", hole: Math.max(0.6, q.d * 0.55) }));
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

type SinkPart = Pick<ViewerPart, "refDes" | "x" | "y" | "rotation" | "side" | "body" | "dnp">;

/**
 * How each heatsink of a board is drawn, by the power parts placed round it — the board studio and the box-build
 * view both ask, so the two agree:
 * - `device`: no standing power package is placed against it, so one is drawn bolted to its flat (it never stands bare);
 * - `channel`: power parts stand inside the heatsink's own depth (their legs a few mm from its pin line, on one
 *   side or both), so it is a channel with a web between them, not a block they would be buried in.
 */
export function heatsinkLooks(parts: SinkPart[]): Map<string, { device?: true; channel?: true }> {
  const standing = parts.filter((p) => p.body.shape === "to220" && !p.dnp);
  const out = new Map<string, { device?: true; channel?: true }>();
  for (const h of parts) {
    if (h.body.shape !== "heatsink") continue;
    const bare = !standing.some((q) => q.side === h.side && Math.hypot(q.x - h.x, q.y - h.y) <= Math.max(h.body.length, h.body.width) / 2 + 8);
    const channel = standing.some((q) => {
      const [along, across] = Math.round(h.rotation / 90) % 2 === 0 ? [Math.abs(q.x - h.x), Math.abs(q.y - h.y)] : [Math.abs(q.y - h.y), Math.abs(q.x - h.x)];
      return q.side === h.side && along < h.body.length / 2 && across < h.body.width / 2;
    });
    out.set(h.refDes, { ...(bare ? { device: true as const } : {}), ...(channel ? { channel: true as const } : {}) });
  }
  return out;
}

/**
 * The BoM's board as circuitflow's board and parts (src/vendor/circuitflow): millimetres, centred, y down, with each
 * placed part's rotation, side, package, value, MPN, body size, pads and through-hole leads — for the SMT line and the
 * board studio. `dnp` keeps not-fitted parts (flagged) for the studio, which draws them as a footprint only.
 */
export function toCircuitflowBoard(data: ViewerData, { dnp = false }: { dnp?: boolean } = {}): { board: StudioBoard & { source: string; layers: number; parts: StudioPart[] }; parts: StudioPart[] } {
  const sinks = heatsinkLooks(data.parts);
  const parts: StudioPart[] = data.parts
    .filter((p) => dnp || !p.dnp)
    .map((p) => {
      const bottom = p.side === "BOTTOM";
      const round = p.body.shape === "electrolytic" || p.body.shape === "smdcan" || (p.body.kind === "can" && !p.body.shape);
      const part = makePart({
        ref: p.refDes,
        x: p.x,
        y: -p.y,
        rot: bottom ? -p.rotation : p.rotation,
        side: bottom ? "bottom" : "top",
        package: p.pkg ?? "",
        value: p.value ?? "",
        // What is printed on the part: the customer's own part number (or a resistor's code), not a catalogue match.
        mpn: p.marking ?? p.mpn ?? "",
        w: p.body.length,
        d: p.body.width,
        h: p.body.height,
        ...(isTht(p.body) ? { leads: "tht" } : {}),
      });
      // The studio second-guesses capacitors from their value (a 10 µF chip becomes a can): a body we know wins.
      const model = studioModel(p.body) ?? (p.body.kind === "chip" && "body" in part ? "passive" : null);
      const named = model
        ? { model, pins: p.body.pins, pitch: p.body.pitch, color: p.body.color, shape: round ? "cyl" : "box", ...(p.body.height > 0 ? { h: p.body.height } : {}), ...(model === "heatsink" ? sinks.get(p.refDes) : {}) }
        : round
          ? { shape: "cyl" }
          : {};
      return { ...part, ...named, pads: padsOf(p), ...(p.dnp ? { dnp: true } : {}) };
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
