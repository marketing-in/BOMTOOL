import { findLook, type MachineLook } from "@/knowledge/machine-looks";
import { AOI_BUILDERS } from "./aoi";
import { HANDLING_BUILDERS } from "./handling";
import { MOUNTERS_BUILDERS } from "./mounters";
import { PRINTERS_BUILDERS } from "./printers";
import { REFLOW_BUILDERS } from "./reflow";
import { SPI_BUILDERS } from "./spi";
import type { Kit, RealBuilder, RealBuilt } from "./types";

export type { BuildInput, Kit, RealBuilder, RealBuilt, ScreenInfo } from "./types";

/** Every real builder, by look key. */
export const REAL_BUILDERS: Record<string, RealBuilder> = { ...PRINTERS_BUILDERS, ...SPI_BUILDERS, ...MOUNTERS_BUILDERS, ...REFLOW_BUILDERS, ...AOI_BUILDERS, ...HANDLING_BUILDERS };

export type RealMachine = {
  look: MachineLook;
  builder: RealBuilder;
  /** Build this machine with the scene's kit at the line's pass height. */
  build: (K: Kit, cy: number) => RealBuilt;
};

/**
 * The real model of one of our machines: its look and how to build it. null when we have no look for it, or the
 * look's builder is not written yet: the line view then draws the generic model.
 */
export function realMachine(type: string, vendor: string, model: string): RealMachine | null {
  const look = findLook(type, vendor, model);
  const builder = look ? REAL_BUILDERS[look.key] : undefined;
  if (!look || !builder) return null;
  return { look, builder, build: (K, cy) => builder(K, { look, cy, vendor, model }) };
}
