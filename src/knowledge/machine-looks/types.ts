/**
 * How one real machine model looks on the floor: its published body, where the conveyor runs through it, what
 * sticks out of the body, its paint and what the 3D model shows. Pure data (no three.js, no React): the builders in
 * src/components/ops/machine-3d draw from it, the line layout stands machines side by side by it, and the tests hold
 * every builder to it.
 *
 * Truth rules (as in src/knowledge/machine-models.ts):
 * - `source: "sheet"`: the plant's own documents (the MACHINE DETAILS folder), named by document and page.
 * - `source: "maker"`: the maker's published figure or brochure. `"web"` (refs only): a dealer or a photo page.
 * - `source: "estimate"`: scaled off a photo. Say so in `note`.
 */

/** One file per family in this folder and in src/components/ops/machine-3d. */
export type LookFamily = "printers" | "spi" | "mounters" | "reflow" | "aoi" | "handling";

export const LOOK_FAMILIES: LookFamily[] = ["printers", "spi", "mounters", "reflow", "aoi", "handling"];

export type MachineLook = {
  /** Stable id, maker-model in kebab case: "yamaha-ysm20r". The builder is registered under it. */
  key: string;
  family: LookFamily;
  /** MachineType values this look may draw (prisma enum): ["PICK_AND_PLACE"]. */
  types: string[];
  /** Regex source, tested case-insensitively against `${vendor} ${model}`. The first match in MACHINE_LOOKS wins. */
  match: string;
  /** Maker and model as lettered on the machine: "Yamaha YSM20R". */
  name: string;
  /** The maker's published body: length along the line × depth front to back × height without the signal tower. */
  bodyMm: { l: number; d: number; h: number; source: "sheet" | "maker" | "estimate"; note?: string };
  /** Front face of the body → conveyor centreline. null = the body is centred on the conveyor. */
  railFromFrontMm: number | null;
  /** What sticks out of the body: feeder carts and monitor arm in front, carts and ducts behind, tower and stacks above. */
  reachMm: { front: number; back: number; top: number };
  /** Hex paints by role: body, trim, window, accent … The builder reads its colours from here. */
  livery: Record<string, string>;
  /** What the model shows, short: "two feeder carts in front", "smoked hood", "monitor on an arm, right". */
  features: string[];
  /** Where the facts came from. "sheet" = the plant's own documents, named by document and page, never by a path on a computer. */
  refs: { label: string; source: "sheet" | "maker" | "web"; url?: string }[];
};

/** Does this look draw that machine? The type must be one of the look's, and its regex must match "vendor model". */
export const lookMatches = (look: MachineLook, type: string, vendor: string, model: string): boolean => look.types.includes(type) && new RegExp(look.match, "i").test(`${vendor} ${model}`);

/** A look's box in scene units (metres), in the builder's frame: x along the line, y up from the floor, z = 0 on the conveyor centreline, +z the operator's side. */
export type LookFrame = {
  /** Body length, depth, height. */
  l: number;
  d: number;
  h: number;
  /** Front and back faces of the body. */
  zFront: number;
  zBack: number;
  /** Middle of the body, front to back. */
  zMid: number;
  /** The limits nothing may leave, at any animation phase: body + reach + the 0.05 m allowance. */
  box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
};

/** Slack round the body and its reach (m). */
export const LOOK_SLACK = 0.05;

export function lookFrame(look: MachineLook): LookFrame {
  const l = look.bodyMm.l / 1000;
  const d = look.bodyMm.d / 1000;
  const h = look.bodyMm.h / 1000;
  const zFront = (look.railFromFrontMm ?? look.bodyMm.d / 2) / 1000;
  const zBack = zFront - d;
  const r = look.reachMm;
  return {
    l,
    d,
    h,
    zFront,
    zBack,
    zMid: (zFront + zBack) / 2,
    box: { x0: -l / 2 - LOOK_SLACK, x1: l / 2 + LOOK_SLACK, y0: 0, y1: h + r.top / 1000 + LOOK_SLACK, z0: zBack - r.back / 1000 - LOOK_SLACK, z1: zFront + r.front / 1000 + LOOK_SLACK },
  };
}
