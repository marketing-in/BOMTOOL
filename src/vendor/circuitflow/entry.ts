/**
 * Typed entry to the vendored circuitflow line (dense JS/JSX, not type-checked). Import from here, not from
 * the .jsx/.js files: explicit extensions keep webpack and Turbopack on the real modules.
 */
import type { ReactElement } from "react";
// @ts-ignore -- vendored JSX without types; typed below
import FactoryLineImpl from "./FactoryLine.jsx";
// @ts-ignore -- vendored JS without types; typed below
import { makePart as makePartImpl } from "./blueprint.js";

/** circuitflow blueprint part: millimetres, rotation in degrees, body w (x) × d (y) × h. */
export type CircuitflowPart = {
  ref: string;
  value: string;
  mpn: string;
  package: string;
  type: string;
  x: number;
  y: number;
  rot: number;
  side: "top" | "bottom";
  w: number;
  d: number;
  h: number;
  leads: string;
  shape: string;
  pads: unknown[] | null;
};

export type CircuitflowBoard = { id: string; name: string; source: string; width: number; height: number; layers: number; parts: CircuitflowPart[] };

export type RawPart = { ref: string; x?: number; y?: number; rot?: number; side?: "top" | "bottom"; package?: string; value?: string; mpn?: string; type?: string; w?: number; d?: number; h?: number; leads?: string };

export const makePart = makePartImpl as (raw: RawPart) => CircuitflowPart;

/** circuitflow's SMT line: machines on one conveyor, boards flowing on the planned schedule. */
export const FactoryLine = FactoryLineImpl as (props: { board: CircuitflowBoard; parts: CircuitflowPart[] }) => ReactElement;
