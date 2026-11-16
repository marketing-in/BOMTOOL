/**
 * Solder joints of one board, from its placed parts: how many the process has to make on each side and by which
 * method, and how many each inspection has to look at. Pure — no database, no Next.js.
 */
import type { BodyKind } from "@/lib/board/bodies";
import { ASSEMBLY, type AssemblyConfig } from "@/data/assembly";

export type Mount = "SMT" | "THT" | "PRESS_FIT";

/** Parts the plant counts double (src/data/assembly.ts). */
export type PartClass = "mosfet" | "relay" | "connector" | "inductor";

/**
 * What a designator is, as far as the pin and paste rules care. Goes by the dictionary kind and description first,
 * then by the designator letter and the body — a board read off Gerbers has nothing else.
 */
export function classifyPart(p: { refDes: string; kind: BodyKind; shape?: string; text?: string | null }): PartClass | null {
  const t = (p.text ?? "").toLowerCase();
  const ref = p.refDes.toUpperCase().match(/^[A-Z]+/)?.[0] ?? "";
  // A driver or protection device for one of these is an IC, not the part itself.
  const helper = /driver|protect|controller|\besd\b/.test(t);
  if ((/\brelay/.test(t) && !helper) || p.shape === "relay" || ref === "K" || ref === "RLY" || ref === "RL") return "relay";
  if (/mosfet|\bigbt\b/.test(t) && !helper) return "mosfet";
  if ((/inductor|\bchoke\b|transformer/.test(t) && !helper) || ref === "L") return "inductor";
  if (p.kind === "connector" || p.shape === "header" || p.shape === "terminal" || (/\bconnector|\bheader|terminal block|\bsocket/.test(t) && !helper) || ["J", "P", "CN", "CON"].includes(ref)) return "connector";
  return null;
}

/** One designator of the board. Do-not-populate parts are kept apart (src/lib/feasibility/parts.ts). */
export type AsmPart = {
  refDes: string;
  side: "TOP" | "BOTTOM";
  mount: Mount;
  kind: BodyKind;
  /** Package or footprint name: "0603", "QFN-32", "DIP-8". */
  pkg: string | null;
  pins: number;
  pitchMm: number;
  lengthMm: number;
  widthMm: number;
  cls?: PartClass | null;
};

/** How many times a part's pins count: 2 for the classes the plant counts double. */
export const pinFactor = (p: AsmPart, cfg: AssemblyConfig = ASSEMBLY) => (p.cls && (cfg.pins.doubleClasses as readonly string[]).includes(p.cls) ? cfg.pins.doubleFactor : 1);

const HIDDEN: BodyKind[] = ["leadless", "array"];

/** Joints under the body, where AOI cannot see. */
export const isHidden = (p: AsmPart) => p.mount === "SMT" && HIDDEN.includes(p.kind);

/** A QFN / SON has one more joint than it has pins: the exposed pad. */
const exposedPad = (p: AsmPart) => (p.mount === "SMT" && p.kind === "leadless" && p.pins >= 6 ? 1 : 0);

export function jointsOf(p: AsmPart): number {
  const pins = p.kind === "chip" || p.kind === "molded" ? 2 : Math.max(0, Math.round(p.pins));
  return pins + exposedPad(p);
}

export type SideCount = { placements: number; joints: number };

export type PackageRow = { pkg: string; mount: Mount; hidden: boolean; parts: number; jointsEach: number; joints: number; /** 2 when the plant counts these pins double. */ factor: number; refs: string[] };

/** Do-not-populate parts: classified and counted, but not placed. */
export type DnpCount = { parts: number; pins: number; weighted: number; refs: string[] };

export function countDnp(dnp: AsmPart[], cfg: AssemblyConfig = ASSEMBLY): DnpCount {
  return { parts: dnp.length, pins: dnp.reduce((s, p) => s + jointsOf(p), 0), weighted: dnp.reduce((s, p) => s + jointsOf(p) * pinFactor(p, cfg), 0), refs: dnp.map((p) => p.refDes) };
}

export type JointCount = {
  smt: { TOP: SideCount; BOTTOM: SideCount };
  tht: { parts: number; joints: number };
  pressFit: { parts: number; pins: number };
  hidden: { parts: number; joints: number };
  /** Everything soldered (press-fit pins are not). */
  total: number;
  /** The pin count as the plant counts it: MOSFET, relay, connector and inductor pins twice. Press-fit pins included. */
  weighted: number;
  /** The parts whose pins count double. */
  doubled: { parts: number; pins: number; byClass: Partial<Record<PartClass, number>> };
  placements: number;
  /** Finest lead pitch on a multi-lead SMT part, mm. */
  finestPitchMm: number | null;
  byPackage: PackageRow[];
  /** What each inspection step looks at on one board. */
  inspection: { spiDeposits: number; aoiJoints: number; xrayJoints: number; thtJoints: number; probeNets: number };
};

export function countJoints(parts: AsmPart[], cfg: AssemblyConfig = ASSEMBLY): JointCount {
  const smt = { TOP: { placements: 0, joints: 0 }, BOTTOM: { placements: 0, joints: 0 } };
  const tht = { parts: 0, joints: 0 };
  const pressFit = { parts: 0, pins: 0 };
  const hidden = { parts: 0, joints: 0 };
  const rows = new Map<string, PackageRow>();
  let finest: number | null = null;
  let weighted = 0;
  const doubled: JointCount["doubled"] = { parts: 0, pins: 0, byClass: {} };
  for (const p of parts) {
    const j = jointsOf(p);
    const factor = pinFactor(p, cfg);
    weighted += j * factor;
    if (factor > 1 && p.cls) {
      doubled.parts++;
      doubled.pins += j;
      doubled.byClass[p.cls] = (doubled.byClass[p.cls] ?? 0) + 1;
    }
    if (p.mount === "SMT") {
      smt[p.side].placements++;
      smt[p.side].joints += j;
      if (isHidden(p)) {
        hidden.parts++;
        hidden.joints += j;
      }
      if (j > 2 && p.pitchMm > 0 && (finest === null || p.pitchMm < finest)) finest = p.pitchMm;
    } else if (p.mount === "THT") {
      tht.parts++;
      tht.joints += j;
    } else {
      pressFit.parts++;
      pressFit.pins += j;
    }
    const name = p.pkg ?? `${p.kind}, ${j} pins`;
    const key = `${p.mount}:${name}:${j}:${factor}`;
    const row = rows.get(key) ?? { pkg: name, mount: p.mount, hidden: isHidden(p), parts: 0, jointsEach: j, joints: 0, factor, refs: [] };
    row.parts++;
    row.joints += j;
    row.refs.push(p.refDes);
    rows.set(key, row);
  }
  const smtJoints = smt.TOP.joints + smt.BOTTOM.joints;
  const total = smtJoints + tht.joints;
  return {
    smt,
    tht,
    pressFit,
    hidden,
    total,
    weighted,
    doubled,
    placements: smt.TOP.placements + smt.BOTTOM.placements,
    finestPitchMm: finest,
    byPackage: [...rows.values()].sort((a, b) => b.joints - a.joints || a.pkg.localeCompare(b.pkg)),
    inspection: {
      spiDeposits: smtJoints,
      aoiJoints: smtJoints - hidden.joints,
      xrayJoints: hidden.joints,
      thtJoints: tht.joints,
      probeNets: Math.round((total + pressFit.pins) / cfg.jointsPerNet),
    },
  };
}
