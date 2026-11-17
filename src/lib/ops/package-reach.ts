import { CHIP_ORDER, readSpecs } from "./machines";
import type { FactSource, MachineModel } from "@/knowledge/machine-models";

/**
 * What a placer can put down, package family by package family. Pure.
 *
 * Inputs come from the machine's own specs in the database first (the plant's figures), then the model profile
 * (src/knowledge/machine-models.ts). A limit nobody knows gives "check", never "yes".
 */

export type Reach = "yes" | "no" | "check";

/** Where a capability figure came from: our machine record, the plant sheet in the profile, or the maker. */
export type CapSource = "machine" | FactSource;

export type PlacerCaps = {
  minChip: string | null;
  maxPartMm: [number, number] | null;
  maxPartHeightMm: number | null;
  minPitchMm: number | null;
  minBallPitchMm: number | null;
  /** ± µm. */
  accuracyUm: number | null;
  from: Partial<Record<"minChip" | "maxPartMm" | "maxPartHeightMm" | "minPitchMm" | "minBallPitchMm" | "accuracyUm", CapSource>>;
};

type Pkg = {
  id: string;
  label: string;
  /** Chip code the placer must reach (imperial). */
  chip?: (typeof CHIP_ORDER)[number];
  /** A larger chip that still counts as partial reach ("0805/1206"). */
  chipAlt?: (typeof CHIP_ORDER)[number];
  /** Lead or ball pitch. */
  pitchMm?: number;
  balls?: boolean;
  /** Typical largest body in the family, length × width, and height. */
  bodyMm: [number, number];
  heightMm: number;
};

/** The ladder, small → large. Bodies are the large end of each family so a "yes" holds for the family. */
export const PACKAGE_LADDER: readonly Pkg[] = [
  { id: "01005", label: "01005", chip: "01005", bodyMm: [0.4, 0.2], heightMm: 0.15 },
  { id: "0201", label: "0201", chip: "0201", bodyMm: [0.6, 0.3], heightMm: 0.3 },
  { id: "0402", label: "0402", chip: "0402", bodyMm: [1.0, 0.5], heightMm: 0.35 },
  { id: "0603", label: "0603", chip: "0603", bodyMm: [1.6, 0.8], heightMm: 0.45 },
  { id: "0805-1206", label: "0805/1206", chip: "0805", chipAlt: "1206", bodyMm: [3.2, 1.6], heightMm: 0.7 },
  { id: "sot23-sod", label: "SOT-23/SOD", pitchMm: 0.95, bodyMm: [3.0, 2.6], heightMm: 1.2 },
  { id: "soic", label: "SOIC", pitchMm: 1.27, bodyMm: [12.8, 10.3], heightMm: 2.65 },
  { id: "tssop-ssop", label: "TSSOP/SSOP (0.65)", pitchMm: 0.65, bodyMm: [9.8, 8.2], heightMm: 2.0 },
  { id: "qfp-0.5", label: "QFP 0.5", pitchMm: 0.5, bodyMm: [22, 22], heightMm: 1.6 },
  { id: "qfp-0.4", label: "QFP 0.4", pitchMm: 0.4, bodyMm: [26, 26], heightMm: 1.6 },
  { id: "qfn-dfn", label: "QFN/DFN", pitchMm: 0.5, bodyMm: [9, 9], heightMm: 1.0 },
  { id: "bga-0.8", label: "BGA 0.8+", pitchMm: 0.8, balls: true, bodyMm: [27, 27], heightMm: 2.5 },
  { id: "bga-0.5", label: "BGA 0.5", pitchMm: 0.5, balls: true, bodyMm: [12, 12], heightMm: 1.4 },
  { id: "csp-0.4", label: "CSP/WLCSP 0.4", pitchMm: 0.4, balls: true, bodyMm: [5, 5], heightMm: 0.6 },
  { id: "bga-large", label: "Large BGA (>35 mm)", pitchMm: 1.0, balls: true, bodyMm: [45, 45], heightMm: 3.5 },
  { id: "tall", label: "Electrolytic / tall (>10 mm)", bodyMm: [10.3, 10.3], heightMm: 12 },
  { id: "odd-form", label: "Large connector / odd-form (>50 mm)", bodyMm: [60, 15], heightMm: 12 },
];

export type PackageReach = { id: string; label: string; reach: Reach; reason: string };

const chipIdx = (c: string) => (CHIP_ORDER as readonly string[]).indexOf(c);
const sorted = (p: [number, number]): [number, number] => (p[0] >= p[1] ? [p[0], p[1]] : [p[1], p[0]]);
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Capability for package reach: the machine's specs where present, the model profile otherwise. */
export function placerCaps(machineSpecs: unknown, model: MachineModel | null): PlacerCaps {
  const { specs, extra } = readSpecs(machineSpecs);
  const p = model?.placement;
  const from: PlacerCaps["from"] = {};
  const pick = <T>(key: keyof PlacerCaps["from"], own: T | undefined, fact: { value: T; source: FactSource } | null | undefined): T | null => {
    if (own !== undefined && own !== null) {
      from[key] = "machine";
      return own;
    }
    if (fact) {
      from[key] = fact.source;
      return fact.value;
    }
    return null;
  };
  const accMm = typeof extra.accuracyMm === "number" && extra.accuracyMm > 0 ? extra.accuracyMm : undefined;
  const ballPitch = typeof extra.minBallPitchMm === "number" && extra.minBallPitchMm > 0 ? extra.minBallPitchMm : undefined;
  const fact = <T>(f: { value: T; source: FactSource } | null | undefined) => f ?? null;
  const minChip = pick("minChip", specs.minChip, fact(p?.minChip));
  return {
    minChip: minChip && chipIdx(minChip) >= 0 ? minChip : null,
    maxPartMm: pick("maxPartMm", specs.maxComponentMm, fact(p?.maxPartMm)),
    maxPartHeightMm: pick("maxPartHeightMm", specs.maxComponentHeightMm, fact(p?.maxPartHeightMm)),
    minPitchMm: pick("minPitchMm", specs.minPitchMm, fact(p?.minPitchMm)),
    minBallPitchMm: pick("minBallPitchMm", ballPitch, fact(p?.minBallPitchMm)),
    accuracyUm: pick("accuracyUm", accMm !== undefined ? Math.round(accMm * 1000 * 10) / 10 : undefined, fact(p?.accuracyUm)),
    from,
  };
}

type Check = { reach: Reach; reason: string };

function chipCheck(pkg: Pkg, c: PlacerCaps): Check | null {
  if (!pkg.chip) return null;
  if (!c.minChip) return { reach: "check", reason: "Smallest chip not on file" };
  if (chipIdx(c.minChip) <= chipIdx(pkg.chip)) return null;
  if (pkg.chipAlt && chipIdx(c.minChip) <= chipIdx(pkg.chipAlt)) return { reach: "check", reason: `Places ${pkg.chipAlt}, not ${pkg.chip}` };
  return { reach: "no", reason: `Smallest chip is ${c.minChip}` };
}

/**
 * Pitch: an explicit finest pitch decides. Without one, coarse pitch (≥ 0.8 mm) is fine for any placer known to do
 * 0603 chips or ±100 µm; 0.5–0.65 mm needs ±50 µm or better; finer than 0.5 mm needs a stated pitch.
 */
function pitchCheck(pkg: Pkg, c: PlacerCaps): Check | null {
  if (pkg.pitchMm === undefined) return null;
  const stated = pkg.balls ? (c.minBallPitchMm ?? c.minPitchMm) : c.minPitchMm;
  if (stated !== null) return pkg.pitchMm + 1e-9 >= stated ? null : { reach: "no", reason: `Finest pitch is ${fmt(stated)} mm` };
  const acc = c.accuracyUm;
  if (pkg.pitchMm >= 0.8) {
    if ((c.minChip && chipIdx(c.minChip) <= chipIdx("0603")) || (acc !== null && acc <= 100)) return null;
    return { reach: "check", reason: "Pitch and accuracy not on file" };
  }
  if (pkg.pitchMm >= 0.5) {
    if (acc === null) return { reach: "check", reason: "Finest pitch not on file" };
    return acc <= 50 ? null : { reach: "check", reason: `±${fmt(acc)} µm is marginal at ${fmt(pkg.pitchMm)} mm` };
  }
  return { reach: "check", reason: "Finest pitch not on file: trial first" };
}

function sizeCheck(pkg: Pkg, c: PlacerCaps): Check | null {
  if (!c.maxPartMm) return { reach: "check", reason: "Largest part not on file" };
  const [L, W] = sorted(c.maxPartMm);
  const [l, w] = sorted(pkg.bodyMm);
  return l <= L && w <= W ? null : { reach: "no", reason: `Largest part ${fmt(L)} × ${fmt(W)} mm` };
}

function heightCheck(pkg: Pkg, c: PlacerCaps): Check | null {
  if (c.maxPartHeightMm === null) return { reach: "check", reason: "Tallest part not on file" };
  return pkg.heightMm <= c.maxPartHeightMm ? null : { reach: "no", reason: `Tallest part ${fmt(c.maxPartHeightMm)} mm` };
}

function why(pkg: Pkg, c: PlacerCaps): string {
  if (pkg.chip) return `Down to ${c.minChip}`;
  if (pkg.id === "tall") return `Up to ${fmt(c.maxPartHeightMm ?? 0)} mm tall`;
  if (pkg.id === "odd-form" || pkg.id === "bga-large") {
    const [L, W] = sorted(c.maxPartMm ?? [0, 0]);
    return `Within ${fmt(L)} × ${fmt(W)} mm; large nozzle or tray`;
  }
  const stated = pkg.balls ? (c.minBallPitchMm ?? c.minPitchMm) : c.minPitchMm;
  if (stated !== null) return `Pitch to ${fmt(stated)} mm`;
  if (c.accuracyUm !== null) return `±${fmt(c.accuracyUm)} µm covers ${fmt(pkg.pitchMm ?? 0)} mm pitch`;
  return "Within chip and size limits";
}

/** Reach for one package: the worst of chip, pitch, size and height ("no" beats "check" beats "yes"). */
export function reachFor(pkg: Pkg, caps: PlacerCaps): PackageReach {
  const checks = [chipCheck(pkg, caps), pitchCheck(pkg, caps), sizeCheck(pkg, caps), heightCheck(pkg, caps)].filter((x): x is Check => x !== null);
  const no = checks.find((x) => x.reach === "no");
  const chk = checks.find((x) => x.reach === "check");
  const hit = no ?? chk;
  return { id: pkg.id, label: pkg.label, reach: hit ? hit.reach : "yes", reason: hit ? hit.reason : why(pkg, caps) };
}

/** The whole ladder for a placer. */
export function packageReach(caps: PlacerCaps): PackageReach[] {
  return PACKAGE_LADDER.map((p) => reachFor(p, caps));
}
