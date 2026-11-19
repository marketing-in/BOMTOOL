import { findLook, lookFrame, type MachineLook } from "@/knowledge/machine-looks";
import { LINE_LAYOUT, MACHINE_SIZE } from "@/vendor/circuitflow/factoryModels.js";

/**
 * A line laid out left to right for the Lines view, in scene units (metres). Pure: no three.js, no DOM.
 *
 * - A machine we have a real look of stands at its real body length, side by side with the next real machine with
 *   the small gap they have on the floor. A sheet conveyor with a real look is a machine like the others.
 * - Everything else keeps the generic footprints and rules: the circuitflow widths, a short link conveyor between
 *   two inline machines that touch, a wide gap round stand-alone machines, and a sheet conveyor drawn as a link.
 */

export type LayoutMachine = { id: string; type: string; vendor: string; model: string };

/** Which circuitflow model draws a kind of machine we have no real look of, and its footprint. */
export type GenericSpec = { id: string; w: number; d: number; inline: boolean };

/** Between two real machines standing in line (m). */
export const REAL_GAP = 0.08;
/** Round a stand-alone generic machine (m). */
export const GENERIC_GAP = 0.9;
/** The short link drawn between two inline machines when one of them is generic (m). */
export const GENERIC_LINK = 0.5;

const W = LINE_LAYOUT.width as Record<string, number>;
const S = MACHINE_SIZE as Record<string, { w: number; d: number }>;
const LINE_D = LINE_LAYOUT.depth as number;

/**
 * Kinds circuitflow has no model of borrow the nearest one: a laser marker is a hooded head over the conveyor like
 * an SPI, a coater or a router a gantry like a selective or flying-probe cell, a bench or a box-build station the
 * ICT fixture.
 */
export const GENERIC_KIND: Record<string, GenericSpec> = {
  BOARD_LOADER: { id: "loader", w: W.loader, d: LINE_D, inline: true },
  LASER_MARKER: { id: "spi", w: 1.3, d: LINE_D, inline: true },
  STENCIL_PRINTER: { id: "printer", w: W.printer, d: LINE_D, inline: true },
  SPI: { id: "spi", w: W.spi, d: LINE_D, inline: true },
  PICK_AND_PLACE: { id: "pnp", w: W.pnp, d: LINE_D, inline: true },
  REFLOW_OVEN: { id: "reflow", w: W.reflow, d: LINE_D, inline: true },
  AOI: { id: "aoi", w: W.aoi, d: LINE_D, inline: true },
  XRAY: { id: "xray", w: W.xray, d: LINE_D, inline: false },
  WAVE_SOLDER: { id: "wave", ...S.wave, inline: false },
  SELECTIVE_SOLDER: { id: "selective", ...S.selective, inline: false },
  CONFORMAL_COATER: { id: "selective", ...S.selective, inline: false },
  DEPANELER: { id: "probe", ...S.probe, inline: false },
  ICT: { id: "ict", ...S.ict, inline: false },
  FLYING_PROBE: { id: "probe", ...S.probe, inline: false },
};
export const GENERIC_BENCH: GenericSpec = { id: "ict", ...S.ict, inline: false };

export const genericSpec = (type: string): GenericSpec => GENERIC_KIND[type] ?? GENERIC_BENCH;

/** A link, inspection or cooling conveyor as the machine sheet lists it. */
export const isSheetConveyor = (m: { type: string; model: string }): boolean => m.type === "OTHER" && /conveyor/i.test(m.model);

/** x = the middle of the body along the line; w = its length; z0 … z1 = its body from back to front (z = 0 is the conveyor). */
export type LineItem<M extends LayoutMachine = LayoutMachine> =
  | { kind: "real"; m: M; look: MachineLook; x: number; w: number; d: number; z0: number; z1: number }
  | { kind: "generic"; m: M; spec: GenericSpec; x: number; w: number; d: number; z0: number; z1: number }
  | { kind: "link"; m: M | null; x0: number; x1: number };

export type LineLayout<M extends LayoutMachine = LayoutMachine> = { items: LineItem<M>[]; length: number };

/**
 * Lay the machines out in the order given. lookOf says which machines have a real model (default: every look in
 * src/knowledge/machine-looks; the view passes "a look whose builder exists").
 */
export function layoutLine<M extends LayoutMachine>(machines: M[], lookOf: (m: M) => MachineLook | null = (m) => findLook(m.type, m.vendor, m.model)): LineLayout<M> {
  let x = 0;
  const items: LineItem<M>[] = [];
  // Does the board ride out of the last thing placed on a conveyor?
  let prevInline = false;
  for (const m of machines) {
    const look = lookOf(m);
    const last = items[items.length - 1];
    if (look) {
      const f = lookFrame(look);
      if (last?.kind === "real") x += REAL_GAP;
      else if (last?.kind === "generic") {
        if (last.spec.inline) {
          items.push({ kind: "link", m: null, x0: x, x1: x + GENERIC_LINK });
          x += GENERIC_LINK;
        } else x += GENERIC_GAP;
      }
      items.push({ kind: "real", m, look, x: x + f.l / 2, w: f.l, d: f.d, z0: f.zBack, z1: f.zFront });
      x += f.l;
      prevInline = true;
      continue;
    }
    if (isSheetConveyor(m)) {
      const len = /0\.6/.test(m.model) ? 0.8 : 1.2;
      items.push({ kind: "link", m, x0: x, x1: x + len });
      x += len;
      prevInline = true;
      continue;
    }
    const spec = genericSpec(m.type);
    if (last) {
      const afterMachine = last.kind !== "link";
      if (spec.inline && prevInline && afterMachine) {
        items.push({ kind: "link", m: null, x0: x, x1: x + GENERIC_LINK });
        x += GENERIC_LINK;
      } else if (afterMachine || !spec.inline) x += GENERIC_GAP;
    }
    items.push({ kind: "generic", m, spec, x: x + spec.w / 2, w: spec.w, d: spec.d, z0: -spec.d / 2, z1: spec.d / 2 });
    x += spec.w;
    prevInline = spec.inline;
  }
  return { items, length: x };
}

/** The span of an item along the line. */
export const itemSpan = (it: LineItem): [number, number] => (it.kind === "link" ? [it.x0, it.x1] : [it.x - it.w / 2, it.x + it.w / 2]);
