import { AOI_LOOKS } from "./aoi";
import { HANDLING_LOOKS } from "./handling";
import { MOUNTERS_LOOKS } from "./mounters";
import { PRINTERS_LOOKS } from "./printers";
import { REFLOW_LOOKS } from "./reflow";
import { SPI_LOOKS } from "./spi";
import { lookMatches, type MachineLook } from "./types";

export { LOOK_FAMILIES, LOOK_SLACK, lookFrame, lookMatches } from "./types";
export type { LookFamily, LookFrame, MachineLook } from "./types";

/** Every real machine we can draw, in line order of the families. findLook takes the first that matches. */
export const MACHINE_LOOKS: MachineLook[] = [...PRINTERS_LOOKS, ...SPI_LOOKS, ...MOUNTERS_LOOKS, ...REFLOW_LOOKS, ...AOI_LOOKS, ...HANDLING_LOOKS];

/** The look of one of our machines, or null when we have no real model of it (the line view then draws the generic one). */
export function findLook(type: string, vendor: string, model: string): MachineLook | null {
  return MACHINE_LOOKS.find((look) => lookMatches(look, type, vendor, model)) ?? null;
}
