import {
  ArrowDownToLine,
  ArrowRightToLine,
  Binary,
  Boxes,
  CircuitBoard,
  ClipboardCheck,
  Cog,
  Droplet,
  Droplets,
  Flame,
  Gauge,
  Hand,
  Microchip,
  MonitorCheck,
  Package,
  Radiation,
  ScanEye,
  ScanLine,
  Scissors,
  ShieldHalf,
  ShieldOff,
  SprayCan,
  Stamp,
  Truck,
  Waves,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Stage } from "@/lib/ops/machines";

/** "print-top" → "print": the step without its board side. */
const base = (key: string) => key.replace(/-(top|bottom)$/, "");
const side = (key: string) => (/-top$/.test(key) ? "top" : /-bottom$/.test(key) ? "bottom" : null);

/** One icon and a name of a word or two for each step of the process route (Phase 25). */
const STEP: Record<string, { icon: LucideIcon; short: string }> = {
  fab: { icon: CircuitBoard, short: "Bare board" },
  kitting: { icon: Boxes, short: "Kitting" },
  print: { icon: Stamp, short: "Paste print" },
  spi: { icon: ScanLine, short: "Paste check" },
  place: { icon: Microchip, short: "Pick & place" },
  reflow: { icon: Flame, short: "Reflow" },
  aoi: { icon: ScanEye, short: "Optical check" },
  xray: { icon: Radiation, short: "X-ray" },
  insert: { icon: Hand, short: "Insertion" },
  wave: { icon: Waves, short: "Wave solder" },
  selective: { icon: Droplet, short: "Selective" },
  "mask-wave": { icon: ShieldHalf, short: "Mask" },
  "demask-wave": { icon: ShieldOff, short: "De-mask" },
  "press-fit": { icon: ArrowDownToLine, short: "Press-fit" },
  clean: { icon: Droplets, short: "Wash" },
  "mask-coat": { icon: ShieldHalf, short: "Mask" },
  coat: { icon: SprayCan, short: "Coating" },
  "demask-coat": { icon: ShieldOff, short: "De-mask" },
  depanel: { icon: Scissors, short: "Depanel" },
  ict: { icon: Zap, short: "In-circuit test" },
  "flying-probe": { icon: Zap, short: "Flying probe" },
  program: { icon: Binary, short: "Program" },
  fct: { icon: Gauge, short: "Function test" },
  assemble: { icon: Wrench, short: "Assembly" },
  "system-test": { icon: MonitorCheck, short: "System test" },
  inspect: { icon: ClipboardCheck, short: "Inspection" },
  pack: { icon: Package, short: "Packing" },
  dispatch: { icon: Truck, short: "Dispatch" },
};

export function stepIcon(key: string): LucideIcon {
  return STEP[base(key)]?.icon ?? Cog;
}

/** A name short enough to sit under an icon; the board side is added when the board is built on both. */
export function stepShort(key: string, fallback: string, twoSided = false): string {
  const s = STEP[base(key)]?.short ?? fallback;
  const on = side(key);
  return twoSided && on ? `${s} · ${on}` : s;
}

/** One icon for each station of a line (the stages a machine belongs to). */
const STAGE: Record<Stage, LucideIcon> = {
  load: ArrowRightToLine,
  print: Stamp,
  spi: ScanLine,
  place: Microchip,
  reflow: Flame,
  aoi: ScanEye,
  xray: Radiation,
  insert: Hand,
  "tht-solder": Waves,
  "press-fit": ArrowDownToLine,
  clean: Droplets,
  mask: ShieldHalf,
  coat: SprayCan,
  depanel: Scissors,
  test: Gauge,
  inspect: ClipboardCheck,
  box: Wrench,
  ship: Truck,
  other: Cog,
};

export function stageIcon(stage: Stage): LucideIcon {
  return STAGE[stage] ?? Cog;
}
