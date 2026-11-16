import type { PcbStack, StackLayer, StackLayerKind, StackVia } from "@/knowledge/explore/pcb";

/** Scene units per micrometre of thickness: a 1.6 mm board becomes ~10 units tall on a 40-unit board. */
export const Z_PER_UM = 0.006;
/** Explode gap between neighbouring layers at 100 %. */
export const EXPLODE_GAP = 2.4;

/** Thin layers are drawn at least this thick so they stay visible. */
const MIN_T: Record<StackLayerKind, number> = { silk: 0.1, mask: 0.14, copper: 0.24, prepreg: 0.5, core: 0.5 };

export type PlacedLayer = StackLayer & { z0: number; z1: number; copper: number | null };

export type StackLayout = {
  layers: PlacedLayer[];
  height: number;
  /** Copper layer number (1 = top) → its z range. */
  copper: Map<number, [number, number]>;
};

export function copperLayers(stack: PcbStack): number {
  return stack.layers.filter((l) => l.kind === "copper").length;
}

export function thicknessMm(stack: PcbStack): number {
  return stack.layers.reduce((s, l) => s + l.um, 0) / 1000;
}

/** Stacks the layers bottom-up, separated by `explode` × EXPLODE_GAP, centred on z = 0. */
export function layoutStack(stack: PcbStack, explode = 0): StackLayout {
  const gap = Math.max(0, Math.min(1, explode)) * EXPLODE_GAP;
  const total = copperLayers(stack);
  const placed: PlacedLayer[] = [];
  let z = 0;
  let copperNo = total;
  for (let i = stack.layers.length - 1; i >= 0; i--) {
    const l = stack.layers[i];
    const t = Math.max(MIN_T[l.kind], l.um * Z_PER_UM);
    placed.unshift({ ...l, z0: z, z1: z + t, copper: l.kind === "copper" ? copperNo-- : null });
    z += t + (i > 0 ? gap : 0);
  }
  const half = z / 2;
  const copper = new Map<number, [number, number]>();
  for (const p of placed) {
    p.z0 -= half;
    p.z1 -= half;
    if (p.copper !== null) copper.set(p.copper, [p.z0, p.z1]);
  }
  return { layers: placed, height: z, copper };
}

/** Bottom and top z of a via barrel: from the lower copper layer's bottom to the upper one's top. */
export function viaSpan(layout: StackLayout, via: StackVia): [number, number] {
  const a = layout.copper.get(via.from);
  const b = layout.copper.get(via.to);
  if (!a || !b) throw new Error(`Via ${via.kind} ${via.from}-${via.to} references a missing copper layer`);
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

/** Copper layers a via lands on (its pads). */
export function viaLayers(via: StackVia): number[] {
  const [lo, hi] = [Math.min(via.from, via.to), Math.max(via.from, via.to)];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}
