import type { Circuit } from "@/lib/schematic";
import { POWER_CIRCUITS } from "./power";
import { SIGNAL_CIRCUITS } from "./signal";
import { INTERFACE_CIRCUITS } from "./interface";

/** Typical application circuits, referenced by dictionary entries (DictEntry.circuit). */
export const CIRCUITS: Circuit[] = [...POWER_CIRCUITS, ...SIGNAL_CIRCUITS, ...INTERFACE_CIRCUITS];

export const CIRCUIT_SETS = [
  { key: "power", label: "Power", circuits: POWER_CIRCUITS },
  { key: "signal", label: "Signal, sensing & control", circuits: SIGNAL_CIRCUITS },
  { key: "interface", label: "Processors & interfaces", circuits: INTERFACE_CIRCUITS },
] as const;

const BY_ID = new Map(CIRCUITS.map((c) => [c.id, c]));

export function circuitById(id: string | undefined): Circuit | undefined {
  return id ? BY_ID.get(id) : undefined;
}
