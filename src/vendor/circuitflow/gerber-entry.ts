/**
 * Typed entry to circuitflow's Gerber reader and part guesser (pure JS, no DOM, safe on the server). Kept apart from
 * entry.ts so server code never pulls in the 3D line.
 */
// @ts-ignore -- vendored JS without types; typed below
import { buildGerberBoard as buildImpl, parseGerber as parseGerberImpl, parseExcellon as parseExcellonImpl, identifyLayer as identifyLayerImpl, boundsOf as boundsOfImpl, chainOutline as chainOutlineImpl } from "./gerber.js";
// @ts-ignore -- vendored JS without types; typed below
import { classify as classifyImpl, rasterise as rasteriseImpl, blobs as blobsImpl } from "./gerberInfer.js";
// @ts-ignore -- vendored JS without types; typed below
import { inferType as inferTypeImpl, packageSize as packageSizeImpl, TYPE_LABELS as TYPE_LABELS_IMPL } from "./blueprint.js";

export type CfType = "chip" | "transistor" | "diode" | "led" | "capacitor" | "resistor" | "inductor" | "connector" | "crystal" | "switch" | "fuse" | "module" | "other";

/** A pad in the part's own frame (mm, rotated so rows run along the axes). */
export type CfPad = { x: number; y: number; w: number; h: number; rot?: number; shape?: string; hole?: number };

/** One component of a Gerber board: centred board coordinates (mm, Y down), rotation in degrees counter-clockwise. */
export type CfGerberPart = {
  ref: string;
  value: string;
  mpn: string;
  package: string;
  type: CfType;
  x: number;
  y: number;
  rot: number;
  side: "top" | "bottom";
  w: number;
  d: number;
  h: number;
  leads?: string;
  pads: CfPad[] | null;
  /** Found by the guesser: designator numbered here, no value or MPN. */
  inferred?: boolean;
  /** A two-pad SMD part the guesser can't tell apart (R, C, L, diode …). */
  passive?: boolean;
};

export type CfGerberResult = {
  board: { width: number; height: number; layers: number; parts: CfGerberPart[] };
  warnings: string[];
  summary: {
    components: number;
    /** Designators from X2 pad attributes on the copper layers. */
    attributed: number;
    fromComponentLayer: number;
    pnp: string[];
    pnpAligned: "pads" | "origin" | "centred" | null;
    inferred: number;
  };
  /** Outline centre in Gerber coordinates (the board frame's 0,0). */
  origin: { x: number; y: number };
};

export const buildGerberBoard = buildImpl as (files: { name: string; text: string }[], opts?: { name?: string }) => CfGerberResult;

/** Package and designator prefix from a group of pads (any frame, mm). */
export const classifyPads = classifyImpl as (group: { x: number; y: number; w: number; h: number; hole: number }[]) => { prefix: string; type: CfType; package: string; passive?: boolean };

/** Component family from designator, package and value. */
export const inferType = inferTypeImpl as (ref?: string, pkg?: string, value?: string) => CfType;

/** Nominal body [w, d, h, leads, shape] for a package or footprint name. */
export const packageSize = packageSizeImpl as (pkg?: string, type?: string) => [number, number, number, string, string];

export const TYPE_LABELS = TYPE_LABELS_IMPL as Record<CfType, string>;

// ── Lower-level pieces, for measuring a layer (src/lib/board/fab-measure.ts)

/** A drawn shape in Gerber millimetres; polarity "C" clears what is under it. */
export type CfObject = { k: "circle" | "ring" | "stroke" | "poly"; pol?: "D" | "C" };
/** The same shapes with their geometry (mm, Gerber frame, Y up), for code that moves or rewrites them. */
export type CfShape =
  | { k: "circle"; x: number; y: number; r: number; pol?: "D" | "C" }
  | { k: "ring"; x: number; y: number; r: number; w: number; pol?: "D" | "C" }
  | { k: "stroke"; pts: [number, number][]; w: number; pol?: "D" | "C" }
  | { k: "poly"; pts: [number, number][]; pol?: "D" | "C"; region?: boolean };
export type CfBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type CfRaster = { data: Uint8Array; w: number; h: number; ppm: number; x0: number; y0: number };

export const parseGerber = parseGerberImpl as (text: string, name?: string) => { objects: CfObject[]; warnings: string[] };
export const parseExcellon = parseExcellonImpl as (text: string, name?: string) => { hits: { x: number; y: number; d: number; plated: boolean }[]; slots: { x1: number; y1: number; x2: number; y2: number; d: number; plated: boolean }[]; plated: boolean; warnings: string[] };
/** Joins line segments into closed loops (largest first), tolerating small gaps between ends. */
export const chainOutline = chainOutlineImpl as (segments: [number, number][][], tolerance?: number) => [number, number][][];
export const identifyLayer = identifyLayerImpl as (name: string, text?: string) => { kind: "copper" | "mask" | "silk" | "paste" | "outline" | "component" | "drill" | "pnp" | "bom" | "unknown"; side: "top" | "bottom" | "inner" | "all"; plated?: boolean };
export const boundsOf = boundsOfImpl as (objects: CfObject[]) => CfBounds | null;
export const rasterise = rasteriseImpl as (objects: CfObject[], bounds: CfBounds, opts?: { ppm?: number; maxPixels?: number }) => CfRaster;
/** Connected filled areas of a raster, in millimetres. */
export const blobs = blobsImpl as (r: CfRaster, opts?: { minArea?: number; maxArea?: number }) => { x: number; y: number; w: number; h: number; area: number }[];
