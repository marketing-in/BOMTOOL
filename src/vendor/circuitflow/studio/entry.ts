/**
 * Typed entry to circuitflow's board studio (studio/Board.jsx: dense JS, not type-checked). Client only — it builds
 * a WebGL scene — so load the component that uses it with next/dynamic and ssr:false.
 */
import type { ReactElement, ReactNode } from "react";
import type { CircuitflowPart } from "../entry";
// @ts-ignore -- vendored JSX without types; typed below
import BoardImpl from "./Board.jsx";

/** A circuitflow part on the studio board; `dnp` = not fitted, drawn as a dashed footprint only. */
export type StudioPart = CircuitflowPart & { dnp?: boolean };

/** A picture the studio lays on the board: a URL, or a canvas the app already drew. */
export type StudioImage = string | HTMLCanvasElement;

/** Board colours, CSS hex. */
export type StudioLook = { mask: string; edge: string; trace: string; traceBottom: string; pad: string; silk: string; core: string };

/** Millimetres, centred on 0,0, Y down (circuitflow's frame). */
export type StudioBoard = {
  id: string;
  name: string;
  width: number;
  height: number;
  layers?: number;
  outline?: [number, number][] | null;
  holes?: [number, number][][];
  /** The finished faces from the Gerbers (top as seen from above, bottom as seen through the board from above). */
  surface?: { top: StudioImage | null; bottom: StudioImage | null } | null;
  /** Per-layer pictures for the layer split, keyed copper-top, mask-top, silk-top, … — asked for on the first split. */
  layerImages?: (() => Record<string, StudioImage>) | null;
  look?: Partial<StudioLook>;
};

export type StudioMode = "3D" | "2D";

export type BoardStudioProps = {
  board: StudioBoard;
  parts: StudioPart[];
  mode?: StudioMode;
  /** The picked part's designator. */
  selected?: string | null;
  /** Other designators on the picked part's BoM line. */
  related?: string[] | null;
  /** Body colour per designator (risk overlay). */
  tint?: Record<string, string> | null;
  /** Designators of the picked process step: outlined, the rest darkened. */
  focus?: string[] | null;
  /** Show the solder side. */
  bottom?: boolean;
  onSelect?: (part: StudioPart | null) => void;
  onHover?: (part: StudioPart | null) => void;
  /** The card beside the part under the cursor. */
  renderTip?: (part: StudioPart) => ReactNode;
  /** Full screen the host's stage instead of the studio alone. */
  onToggleFull?: () => void;
  full?: boolean;
};

export const BoardStudio = BoardImpl as (props: BoardStudioProps) => ReactElement;
