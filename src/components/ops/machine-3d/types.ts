import type * as THREE from "three";
import type { MachineLook } from "@/knowledge/machine-looks/types";
import type { Kit, ScreenInfo } from "./kit";

/** What a builder is given. */
export type BuildInput = {
  look: MachineLook;
  /** Conveyor pass height: the top of the belts (LINE_LAYOUT.cy). */
  cy: number;
  vendor: string;
  /** As in our records, e.g. "YSM20R Z:LEX #2": vary by it where the real machines differ. */
  model: string;
};

/**
 * One real machine, built. The group's frame: x = 0 the middle of the body's length, +x the way boards travel;
 * y = 0 the floor; z = 0 the conveyor centreline, +z the operator's side. The body spans x ±l/2 and
 * z from zFront − d to zFront (lookFrame(look) gives these in metres).
 */
export type RealBuilt = {
  group: THREE.Group;
  /** Top of the body (m): the look's bodyMm.h. The signal tower and stacks stand above it. */
  height: number;
  /** [green, amber, red], each with its OWN emissive material; the caller sets emissiveIntensity. */
  lamps: THREE.Mesh[];
  /** The operator screen: the caller redraws it with the machine's live details. */
  screen: { draw: (info: ScreenInfo) => void };
  /**
   * Called every frame. t = running time in seconds (0 while the line is idle or the viewer prefers reduced
   * motion), busy = a board is being worked, clock = wall time (keeps running: vapour, a blinking lamp).
   * Cheap: set a few positions, rotations and emissive intensities; allocate nothing.
   */
  update: (t: number, busy: boolean, clock: number) => void;
};

/** A family file registers one of these per look key. Build with the kit only, then call K.seal(group, moving). */
export type RealBuilder = (K: Kit, input: BuildInput) => RealBuilt;

export type { Kit, ScreenInfo };
