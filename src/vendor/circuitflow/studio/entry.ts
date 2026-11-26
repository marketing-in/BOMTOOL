/**
 * Typed entry to circuitflow's board studio (studio/Board.jsx: dense JS, not type-checked). Client only — it builds
 * a WebGL scene — so load the component that uses it with next/dynamic and ssr:false.
 */
import type { ReactElement, ReactNode } from "react";
import type { CircuitflowPart } from "../entry";
// @ts-ignore -- vendored JSX without types; typed below
import BoardImpl from "./Board.jsx";

/**
 * A circuitflow part on the studio board; `dnp` = not fitted, drawn as a dashed footprint only. `model` names the
 * body model outright (partModels.js) when the BoM line says what the part is, with its pin count, pitch (mm) and
 * body colour; `device` on a heatsink draws a TO-220 bolted to it; `channel` draws the heatsink as a web between
 * fins, for power parts that stand inside its depth.
 */
export type StudioPart = CircuitflowPart & { dnp?: boolean; model?: string; pins?: number; pitch?: number; color?: string; device?: boolean; channel?: boolean };

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

/** A part at one moment of the fly-in (see src/lib/board/fly-in.ts, which plans it). */
export type StudioMotion = {
  /** The body is there (false before its turn, and for bare pads). Bodies are never faded. */
  shown: boolean;
  /** 1 = set off (just above the top of the picture), 0 = on its pads. */
  lift: number;
  /** Drift still to go, as a share of the board's half width / half depth, and turn still to go (degrees). */
  dx: number;
  dz: number;
  spin: number;
  /** Pressed flat as it settles (share of its height). */
  squash: number;
  /** A match's green glow (0–1). */
  glow: number;
  /** How far the result's outline has come up (0–1). */
  mark: number;
};

/** The fly-in: plays once, when a third of the board is in view; with reduced motion the board is settled at once. */
export type StudioIntro = {
  /** Seconds until every part has settled. */
  duration: number;
  /** A part's state t seconds in (t = Infinity: settled); null for a designator that is not in the fly-in. */
  at: (ref: string, t: number) => StudioMotion | null;
  /** How strongly a blinking mark shows (0–1) at t seconds on the page clock. */
  blink: (t: number) => number;
  /** The same with reduced motion: steady. */
  steady: number;
};

/** A result laid on the board round one designator. Colours are CSS hex. */
export type StudioMark = {
  /** The outline's colour. */
  color: string;
  ring?: "solid" | "dotted";
  /** The outline blinks and the body takes `tint` with it. */
  blink?: boolean;
  /** No body: the part is bare pads. */
  empty?: boolean;
  /** As it lands, a soft patch and a ring of this colour come up on the board round it and fade; the body keeps its colour. */
  glow?: string;
  /** The body's colour while the outline blinks. */
  tint?: string;
  /** A faint wash of the outline colour inside it (0–1). */
  fill?: number;
};

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
  /** The footprint check's fly-in (absent: the parts are simply there, as always). */
  intro?: StudioIntro | null;
  /** Result outlines per designator (absent: none). */
  marks?: Record<string, StudioMark> | null;
  /** The fly-in started, or the board is settled (at once with reduced motion). */
  onIntro?: (phase: "start" | "end") => void;
  /** WebGL could not start (the studio falls back to its 2D drawing), or its context was lost (the host's own drawing should take over). */
  onFail?: () => void;
  /** On narrow stages (under 640 px) frame the board in the width the tool column leaves free, not under it (absent: centred on the whole stage). */
  clearTools?: boolean;
};

export const BoardStudio = BoardImpl as (props: BoardStudioProps) => ReactElement;
