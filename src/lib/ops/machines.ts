import { countJoints, isHidden, type AsmPart } from "@/lib/feasibility/joints";
import type { LineCapability } from "./planning";

/**
 * Our lines machine by machine (Phase 19). Each machine carries its own limits in `Machine.specs`; a line's capability
 * is worked out from its machines, and a board is judged step by step against the machine that does each step.
 * Pure: the database and the AI live in src/server.
 */

export const CHIP_ORDER = ["01005", "0201", "0402", "0603", "0805", "1206", "1210", "2512"] as const;

export type Level = "green" | "amber" | "red";

export type Stage = "load" | "print" | "spi" | "place" | "reflow" | "aoi" | "xray" | "insert" | "tht-solder" | "press-fit" | "clean" | "mask" | "coat" | "depanel" | "test" | "inspect" | "box" | "ship" | "other";

export const STAGE_LABEL: Record<Stage, string> = {
  load: "Board handling",
  print: "Paste printing",
  spi: "Paste inspection",
  place: "Placement",
  reflow: "Reflow",
  aoi: "Optical inspection",
  xray: "X-ray",
  insert: "Through-hole insertion",
  "tht-solder": "Wave / selective solder",
  "press-fit": "Press-fit",
  clean: "Cleaning",
  mask: "Masking",
  coat: "Conformal coating",
  depanel: "Depaneling",
  test: "Electrical test",
  inspect: "Final inspection",
  box: "Box build",
  ship: "Dispatch",
  other: "Other",
};

export type SpecKey = "maxBoardMm" | "minBoardMm" | "minThicknessMm" | "maxThicknessMm" | "minChip" | "minPitchMm" | "maxComponentMm" | "maxComponentHeightMm" | "cph" | "feederSlots" | "zones" | "nitrogen" | "technology";

export type SpecField = { key: SpecKey; label: string; kind: "pair" | "number" | "chip" | "bool" | "choice"; unit?: string; choices?: readonly string[]; help: string };

export const SPEC_FIELDS: Record<SpecKey, SpecField> = {
  maxBoardMm: { key: "maxBoardMm", label: "Largest board", kind: "pair", unit: "mm", help: "Length × width the conveyor or table takes." },
  minBoardMm: { key: "minBoardMm", label: "Smallest board", kind: "pair", unit: "mm", help: "Below this the board needs a carrier or a panel." },
  minThicknessMm: { key: "minThicknessMm", label: "Thinnest board", kind: "number", unit: "mm", help: "Thinner boards need support or a carrier." },
  maxThicknessMm: { key: "maxThicknessMm", label: "Thickest board", kind: "number", unit: "mm", help: "Board thickness the clamps and conveyor take." },
  minChip: { key: "minChip", label: "Smallest chip", kind: "chip", help: "Smallest chip size it places reliably (imperial code)." },
  minPitchMm: { key: "minPitchMm", label: "Finest lead pitch", kind: "number", unit: "mm", help: "Finest pitch of a leaded or array part it places." },
  maxComponentMm: { key: "maxComponentMm", label: "Largest component", kind: "pair", unit: "mm", help: "Largest body the heads and vision handle." },
  maxComponentHeightMm: { key: "maxComponentHeightMm", label: "Tallest component", kind: "number", unit: "mm", help: "On a placer: the tallest part it places. Elsewhere: the clearance above the board." },
  cph: { key: "cph", label: "Speed", kind: "number", unit: "CPH", help: "Rated placements per hour." },
  feederSlots: { key: "feederSlots", label: "Feeder slots", kind: "number", help: "8 mm feeder positions." },
  zones: { key: "zones", label: "Heating zones", kind: "number", help: "Top/bottom heating zones." },
  nitrogen: { key: "nitrogen", label: "Nitrogen", kind: "bool", help: "Runs under a nitrogen atmosphere." },
  technology: { key: "technology", label: "Technology", kind: "choice", choices: ["2D", "3D", "2.5D", "CT"], help: "How it measures or images." },
};

type Kind = { label: string; stage: Stage; dict: string | null; fields: SpecKey[]; /** The board rides through it on the conveyor, so its board limits bind the whole line. */ conveyor: boolean };

const BOARD: SpecKey[] = ["maxBoardMm", "minBoardMm"];

export const MACHINE_KINDS: Record<string, Kind> = {
  BOARD_LOADER: { label: "Loader", stage: "load", dict: "conveyor-handling", fields: BOARD, conveyor: true },
  STENCIL_PRINTER: { label: "Stencil printer", stage: "print", dict: "stencil-printer", fields: [...BOARD, "minThicknessMm", "maxThicknessMm"], conveyor: true },
  SPI: { label: "SPI", stage: "spi", dict: "spi-machine", fields: [...BOARD, "technology"], conveyor: true },
  PICK_AND_PLACE: { label: "Pick & place", stage: "place", dict: "pick-and-place-machine", fields: ["minChip", "minPitchMm", "maxComponentMm", "maxComponentHeightMm", ...BOARD, "maxThicknessMm", "cph", "feederSlots"], conveyor: true },
  REFLOW_OVEN: { label: "Reflow oven", stage: "reflow", dict: "reflow-oven", fields: ["maxBoardMm", "maxComponentHeightMm", "zones", "nitrogen"], conveyor: true },
  AOI: { label: "AOI", stage: "aoi", dict: "aoi-machine", fields: [...BOARD, "maxComponentHeightMm", "technology"], conveyor: true },
  XRAY: { label: "X-ray", stage: "xray", dict: "x-ray-inspection", fields: ["maxBoardMm", "technology"], conveyor: false },
  WAVE_SOLDER: { label: "Wave solder", stage: "tht-solder", dict: "wave-soldering-machine", fields: ["maxBoardMm", "nitrogen"], conveyor: false },
  SELECTIVE_SOLDER: { label: "Selective solder", stage: "tht-solder", dict: "selective-soldering-machine", fields: ["maxBoardMm", "nitrogen"], conveyor: false },
  DEPANELER: { label: "Depaneler", stage: "depanel", dict: "depaneling-machine", fields: ["maxBoardMm"], conveyor: false },
  CONFORMAL_COATER: { label: "Conformal coater", stage: "coat", dict: "conformal-coating-machine", fields: ["maxBoardMm"], conveyor: false },
  ICT: { label: "ICT", stage: "test", dict: "ict-tester", fields: ["maxBoardMm"], conveyor: false },
  FLYING_PROBE: { label: "Flying probe", stage: "test", dict: "flying-probe-tester", fields: ["maxBoardMm"], conveyor: false },
  FCT: { label: "Functional test", stage: "test", dict: "functional-tester", fields: [], conveyor: false },
  WASHER: { label: "Washer", stage: "clean", dict: "pcb-cleaning-machine", fields: ["maxBoardMm"], conveyor: false },
  PRESS_FIT: { label: "Press-fit", stage: "press-fit", dict: "press-fit-machine", fields: ["maxBoardMm"], conveyor: false },
  SCREWDRIVER_STATION: { label: "Screwdriving", stage: "box", dict: null, fields: [], conveyor: false },
  PACKING: { label: "Packing", stage: "box", dict: null, fields: [], conveyor: false },
  MASKING_STATION: { label: "Masking bench", stage: "mask", dict: null, fields: ["maxBoardMm"], conveyor: false },
  INSPECTION_STATION: { label: "Final inspection", stage: "inspect", dict: null, fields: [], conveyor: false },
  PROGRAMMER: { label: "Programmer", stage: "test", dict: "functional-tester", fields: [], conveyor: false },
  BURN_IN: { label: "Burn-in chamber", stage: "test", dict: "burn-in-chamber", fields: ["maxBoardMm"], conveyor: false },
  // Inline at the head of an SMT line (our Line 1), so its board size and thickness bind the line.
  LASER_MARKER: { label: "Laser marker", stage: "box", dict: "laser-marking-machine", fields: [...BOARD, "minThicknessMm", "maxThicknessMm"], conveyor: true },
  DISPATCH: { label: "Dispatch", stage: "ship", dict: null, fields: [], conveyor: false },
  OTHER: { label: "Station", stage: "other", dict: null, fields: [], conveyor: false },
};

export const kindOf = (type: string): Kind => MACHINE_KINDS[type] ?? MACHINE_KINDS.OTHER;

// ── Reading and writing a machine's limits

export type MachineSpecs = Partial<{
  maxBoardMm: [number, number];
  minBoardMm: [number, number];
  minThicknessMm: number;
  maxThicknessMm: number;
  minChip: string;
  minPitchMm: number;
  maxComponentMm: [number, number];
  maxComponentHeightMm: number;
  cph: number;
  feederSlots: number;
  zones: number;
  nitrogen: boolean;
  technology: string;
}>;

/** Where a machine's limits came from. */
export type SpecSource = {
  by: "manual" | "claude" | "typical";
  at: string;
  confidence?: "high" | "medium" | "low";
  notes?: string;
  sources?: { title: string; url: string }[];
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : typeof v === "string" && Number(v) > 0 ? Number(v) : undefined);
const pair = (v: unknown): [number, number] | undefined => {
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const a = num(v[0]);
  const b = num(v[1]);
  return a && b ? [a, b] : undefined;
};
const chip = (v: unknown) => (typeof v === "string" && (CHIP_ORDER as readonly string[]).includes(v.trim()) ? v.trim() : undefined);

/** A machine's limits from its stored JSON, ignoring anything malformed. Other keys (heads, modules…) stay in `extra`. */
export function readSpecs(raw: unknown): { specs: MachineSpecs; source: SpecSource | null; extra: Record<string, unknown> } {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const specs: MachineSpecs = {};
  const set = <K extends SpecKey>(k: K, v: MachineSpecs[K] | undefined) => {
    if (v !== undefined) specs[k] = v;
  };
  set("maxBoardMm", pair(o.maxBoardMm));
  set("minBoardMm", pair(o.minBoardMm));
  set("minThicknessMm", num(o.minThicknessMm));
  set("maxThicknessMm", num(o.maxThicknessMm));
  set("minChip", chip(o.minChip));
  set("minPitchMm", num(o.minPitchMm));
  set("maxComponentMm", pair(o.maxComponentMm));
  set("maxComponentHeightMm", num(o.maxComponentHeightMm));
  set("cph", num(o.cph));
  set("feederSlots", num(o.feederSlots ?? o.feeders));
  set("zones", num(o.zones));
  if (typeof o.nitrogen === "boolean") specs.nitrogen = o.nitrogen;
  if (typeof o.technology === "string" && o.technology.trim()) specs.technology = o.technology.trim().slice(0, 20);
  const s = o.source as SpecSource | undefined;
  const source = s && typeof s === "object" && ["manual", "claude", "typical"].includes(s.by) ? s : null;
  const known = new Set<string>([...Object.keys(SPEC_FIELDS), "feeders", "source"]);
  const extra = Object.fromEntries(Object.entries(o).filter(([k]) => !known.has(k)));
  return { specs, source, extra };
}

/** Limits as stored: only the fields this kind of machine has, plus where they came from and any other keys kept. */
export function writeSpecs(type: string, specs: MachineSpecs, source: SpecSource | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const fields = new Set(kindOf(type).fields);
  const kept = Object.fromEntries(Object.entries(specs).filter(([k, v]) => fields.has(k as SpecKey) && v !== undefined && v !== null));
  return { ...extra, ...kept, ...(source ? { source } : {}) };
}

/** How many of the limits that matter for this kind of machine are on file. */
export function specCoverage(type: string, specs: MachineSpecs): { have: number; of: number } {
  const fields = kindOf(type).fields;
  return { have: fields.filter((k) => specs[k] !== undefined).length, of: fields.length };
}

export const machineName = (m: { vendor: string; model: string }) => `${m.vendor} ${m.model}`.trim();

/** Limits as a lookup reports them: sizes as length × width objects, null where not found. */
export type LookupLimits = {
  maxBoardMm: { lengthMm: number; widthMm: number } | null;
  minBoardMm: { lengthMm: number; widthMm: number } | null;
  minThicknessMm: number | null;
  maxThicknessMm: number | null;
  minChip: string | null;
  minPitchMm: number | null;
  maxComponentMm: { lengthMm: number; widthMm: number } | null;
  maxComponentHeightMm: number | null;
  cph: number | null;
  feederSlots: number | null;
  zones: number | null;
  nitrogen: boolean | null;
  technology: string | null;
};

/** A lookup's limits in the shape stored on a machine, keeping only the fields that kind of machine has. */
export function specsFromLimits(type: string, l: LookupLimits): MachineSpecs {
  const fields = new Set<SpecKey>(kindOf(type).fields);
  const pair = (s: { lengthMm: number; widthMm: number } | null): [number, number] | undefined => (s ? [s.lengthMm, s.widthMm] : undefined);
  const all: MachineSpecs = {
    maxBoardMm: pair(l.maxBoardMm),
    minBoardMm: pair(l.minBoardMm),
    minThicknessMm: l.minThicknessMm ?? undefined,
    maxThicknessMm: l.maxThicknessMm ?? undefined,
    minChip: l.minChip ?? undefined,
    minPitchMm: l.minPitchMm ?? undefined,
    maxComponentMm: pair(l.maxComponentMm),
    maxComponentHeightMm: l.maxComponentHeightMm ?? undefined,
    cph: l.cph ?? undefined,
    feederSlots: l.feederSlots ?? undefined,
    zones: l.zones ?? undefined,
    nitrogen: l.nitrogen ?? undefined,
    technology: l.technology ?? undefined,
  };
  return Object.fromEntries(Object.entries(all).filter(([k, v]) => fields.has(k as SpecKey) && v !== undefined)) as MachineSpecs;
}

// ── A line's capability, from its machines

export type MachineIn = { type: string; vendor: string; model: string; position: number; specs: unknown };
export type LineIn = { id: string; code: string; name: string; type: string; active?: boolean; capability: unknown; machines: MachineIn[] };

export type EffectiveCapability = LineCapability & {
  maxComponentHeightMm?: number;
  nitrogenReflow?: boolean;
  ict?: boolean;
  flyingProbe?: boolean;
  /** The capability keys worked out from machines; the rest come from the line's own summary. */
  fromMachines: string[];
};

const sortedPair = (p: [number, number]): [number, number] => (p[0] >= p[1] ? p : [p[1], p[0]]);
const chipIndex = (c: string) => (CHIP_ORDER as readonly string[]).indexOf(c);

/**
 * What the line can do, worked out from its machines: the best placer sets the smallest chip and finest pitch, the
 * smallest conveyor machine sets the largest board, an X-ray on the line means BGAs, and so on. The line's own
 * summary fills only what no machine states.
 */
export function effectiveCapability(line: Pick<LineIn, "type" | "capability" | "machines">): EffectiveCapability {
  const base = (line.capability && typeof line.capability === "object" ? line.capability : {}) as LineCapability & Record<string, unknown>;
  const ms = line.machines.map((m) => ({ type: m.type, kind: kindOf(m.type), specs: readSpecs(m.specs).specs }));
  const placers = ms.filter((m) => m.type === "PICK_AND_PLACE");
  const has = (t: string) => ms.some((m) => m.type === t);
  const out: EffectiveCapability = { ...base, fromMachines: [] };
  const take = <K extends keyof EffectiveCapability>(k: K, v: EffectiveCapability[K] | undefined) => {
    if (v === undefined) return;
    out[k] = v;
    out.fromMachines.push(k as string);
  };

  const chips = placers.map((m) => m.specs.minChip).filter((c): c is string => !!c).sort((a, b) => chipIndex(a) - chipIndex(b));
  take("minChip", chips[0]);
  const pitches = placers.map((m) => m.specs.minPitchMm).filter((x): x is number => !!x);
  take("minPitchMm", pitches.length ? Math.min(...pitches) : undefined);

  // A limit every conveyor machine imposes comes from the machines only when all of them state it: with one machine
  // unknown, the tightest known value could be looser than the truth. Then the line's summary stands, if it has one.
  const binding = (key: SpecKey, pick: (vals: [number, number][]) => [number, number]) => {
    const holders = ms.filter((m) => m.kind.conveyor && m.kind.fields.includes(key));
    const vals = holders.map((m) => m.specs[key] as [number, number] | undefined).filter((v): v is [number, number] => !!v).map(sortedPair);
    if (!vals.length) return undefined;
    if (vals.length < holders.length && base[key as keyof LineCapability] !== undefined) return undefined;
    return pick(vals);
  };
  take("maxBoardMm", binding("maxBoardMm", (v) => [Math.min(...v.map((b) => b[0])), Math.min(...v.map((b) => b[1]))]));
  take("minBoardMm", binding("minBoardMm", (v) => [Math.max(...v.map((b) => b[0])), Math.max(...v.map((b) => b[1]))]));

  // Tallest part: the most any placer handles, capped by the clearance of the machines it then rides through
  // (all of them stated, or the line's summary stands).
  const placeH = placers.map((m) => m.specs.maxComponentHeightMm).filter((x): x is number => !!x);
  const clearers = ms.filter((m) => m.type !== "PICK_AND_PLACE" && m.kind.conveyor && m.kind.fields.includes("maxComponentHeightMm"));
  const clearH = clearers.map((m) => m.specs.maxComponentHeightMm).filter((x): x is number => !!x);
  const partial = clearH.length < clearers.length && base.maxComponentHeightMm !== undefined;
  const heights = [...(placeH.length ? [Math.max(...placeH)] : []), ...clearH];
  take("maxComponentHeightMm", heights.length && !partial ? Math.min(...heights) : undefined);

  if (has("XRAY")) take("bga", true);
  if (ms.some((m) => m.type === "REFLOW_OVEN" && m.specs.nitrogen !== undefined)) take("nitrogenReflow", ms.some((m) => m.type === "REFLOW_OVEN" && m.specs.nitrogen === true));
  if (has("WAVE_SOLDER")) take("wave", true);
  if (has("SELECTIVE_SOLDER")) take("selective", true);
  if (has("PRESS_FIT")) take("pressFit", true);
  if (has("CONFORMAL_COATER")) take("conformalCoat", true);
  if (has("ICT")) take("ict", true);
  if (has("FLYING_PROBE")) take("flyingProbe", true);
  if (out.doubleSided === undefined && (line.type === "SMT" || line.type === "MIXED")) out.doubleSided = true;
  return out;
}

// ── A line's own summary, edited by hand

export type CapField = { key: keyof LineCapability | "nitrogenReflow" | "ict" | "flyingProbe"; label: string; kind: "chip" | "number" | "pair" | "bool"; unit?: string; roles: ("smt" | "tht" | "box")[] };

/** What the line form lets planning set for the whole line — used wherever a machine has no limit of its own on file. */
export const LINE_CAP_FIELDS: CapField[] = [
  { key: "minChip", label: "Smallest chip", kind: "chip", roles: ["smt"] },
  { key: "minPitchMm", label: "Finest pitch", kind: "number", unit: "mm", roles: ["smt"] },
  { key: "maxBoardMm", label: "Largest board", kind: "pair", unit: "mm", roles: ["smt", "tht"] },
  { key: "minBoardMm", label: "Smallest board", kind: "pair", unit: "mm", roles: ["smt"] },
  { key: "maxComponentHeightMm", label: "Tallest part", kind: "number", unit: "mm", roles: ["smt"] },
  { key: "doubleSided", label: "Double-sided reflow", kind: "bool", roles: ["smt"] },
  { key: "bga", label: "BGA / QFN with X-ray", kind: "bool", roles: ["smt"] },
  { key: "nitrogenReflow", label: "Nitrogen reflow", kind: "bool", roles: ["smt"] },
  { key: "wave", label: "Wave solder", kind: "bool", roles: ["tht"] },
  { key: "selective", label: "Selective solder", kind: "bool", roles: ["tht"] },
  { key: "pressFit", label: "Press-fit", kind: "bool", roles: ["tht"] },
  { key: "conformalCoat", label: "Conformal coating", kind: "bool", roles: ["tht"] },
  { key: "ict", label: "In-circuit test", kind: "bool", roles: ["tht"] },
  { key: "flyingProbe", label: "Flying probe", kind: "bool", roles: ["tht"] },
  { key: "harness", label: "Harness assembly", kind: "bool", roles: ["box"] },
];

export const rolesOfType = (type: string): ("smt" | "tht" | "box")[] => (type === "SMT" ? ["smt"] : type === "THT" ? ["tht"] : type === "MIXED" ? ["smt", "tht"] : type === "BOX_BUILD" ? ["box"] : []);

/**
 * The line's summary with the form's edits applied: a valid value replaces the old one, an empty one removes it, and
 * keys the form does not show (torque control, burn-in, hi-pot…) are kept as they were.
 */
export function mergeCapability(existing: unknown, edits: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {};
  for (const f of LINE_CAP_FIELDS) {
    if (!(f.key in edits)) continue;
    const v = edits[f.key];
    const ok =
      f.kind === "chip" ? chip(v) : f.kind === "number" ? num(v) : f.kind === "pair" ? pair(v) : typeof v === "boolean" ? v : undefined;
    if (ok === undefined) delete out[f.key];
    else out[f.key] = ok;
  }
  return out;
}

// ── What a board needs

export type BuildNeeds = {
  boardMm: [number, number] | null;
  thicknessMm: number | null;
  smt: { placements: number; sides: number; smallestChip: string | null; finestPitchMm: number | null; hidden: number; hasBga: boolean; tallestMm: number | null; largestMm: [number, number] | null };
  tht: { parts: number };
  pressFit: number;
  coating: boolean;
  ict: boolean;
  box: boolean;
};

const chipOf = (pkg: string | null) => (pkg ? (CHIP_ORDER.find((c) => new RegExp(`(^|[^0-9])${c}([^0-9]|$)`).test(pkg)) ?? null) : null);

/** The board's needs from its parts (heights where known) and its facts. */
export function buildNeeds(
  parts: (AsmPart & { heightMm?: number | null })[],
  board: { widthMm: number | null; heightMm: number | null; thicknessMm: number | null },
  flags: { coating?: boolean; ict?: boolean; box?: boolean } = {},
): BuildNeeds {
  const smt = parts.filter((p) => p.mount === "SMT");
  const joints = countJoints(parts);
  const chips = smt.filter((p) => p.kind === "chip").map((p) => chipOf(p.pkg)).filter((c): c is (typeof CHIP_ORDER)[number] => !!c).sort((a, b) => chipIndex(a) - chipIndex(b));
  const heights = smt.map((p) => p.heightMm).filter((h): h is number => typeof h === "number" && h > 0);
  const largest = smt.map((p) => sortedPair([p.lengthMm, p.widthMm])).sort((a, b) => b[0] * b[1] - a[0] * a[1])[0] ?? null;
  return {
    boardMm: board.widthMm && board.heightMm ? [board.widthMm, board.heightMm] : null,
    thicknessMm: board.thicknessMm ?? null,
    smt: {
      placements: smt.length,
      sides: (joints.smt.TOP.placements ? 1 : 0) + (joints.smt.BOTTOM.placements ? 1 : 0),
      smallestChip: chips[0] ?? null,
      finestPitchMm: joints.finestPitchMm,
      hidden: smt.filter(isHidden).length,
      hasBga: smt.some((p) => p.kind === "array"),
      tallestMm: heights.length ? Math.max(...heights) : null,
      largestMm: largest && largest[0] > 0 ? largest : null,
    },
    tht: { parts: joints.tht.parts },
    pressFit: joints.pressFit.parts,
    coating: !!flags.coating,
    ict: !!flags.ict,
    box: !!flags.box,
  };
}

// ── Judging a line, step by step

export type StepCheck = { stage: Stage; label: string; level: Level; machines: string[]; reasons: string[]; /** The step is not needed for a good build but is expected (SPI, AOI). */ recommended?: boolean };
export type LineRole = "smt" | "tht" | "box";
export type LineCheck = { lineId: string; code: string; name: string; type: string; roles: LineRole[]; level: Level | "na"; steps: StepCheck[]; summary: string };

const worst = (ls: Level[]): Level => (ls.includes("red") ? "red" : ls.includes("amber") ? "amber" : "green");
const fmtPair = (p: [number, number]) => `${p[0]}×${p[1]} mm`;
const fits = (board: [number, number], max: [number, number]) => {
  const [w, h] = sortedPair(board);
  const [mw, mh] = sortedPair(max);
  return w <= mw && h <= mh;
};
const atLeast = (board: [number, number], min: [number, number]) => {
  const [w, h] = sortedPair(board);
  const [mw, mh] = sortedPair(min);
  return w >= mw && h >= mh;
};

type Judged = { level: Level; reason: string | null };
type MachineView = { name: string; type: string; specs: MachineSpecs };

/**
 * One limit, judged against a machine's own spec, else the line's summary, else "not on file" (amber: we cannot
 * tell). `test` returns null when the need is met, or the reason it is not.
 */
function judge<T>(own: T | undefined, line: T | undefined, test: (limit: T) => string | null, missing: string): Judged {
  if (own !== undefined) {
    const r = test(own);
    return { level: r ? "red" : "green", reason: r };
  }
  if (line !== undefined) {
    const r = test(line);
    return { level: r ? "red" : "green", reason: r ? `${r} (line summary)` : null };
  }
  return { level: "amber", reason: missing };
}

function boardChecks(m: MachineView, needs: BuildNeeds, cap: EffectiveCapability, opts: { entry?: boolean; lineWide?: boolean } = {}): Judged[] {
  const out: Judged[] = [];
  const f = new Set(kindOf(m.type).fields);
  // The line's board size speaks for a conveyor machine, and for every machine of a through-hole line (whose summary
  // is about those machines). An offline X-ray on an SMT line is not covered by it.
  const lineMax = kindOf(m.type).conveyor || opts.lineWide ? cap.maxBoardMm : undefined;
  if (needs.boardMm && f.has("maxBoardMm")) out.push(judge(m.specs.maxBoardMm, lineMax,(lim) => (fits(needs.boardMm!, lim) ? null : `board ${fmtPair(needs.boardMm!)} is larger than ${m.name}'s ${fmtPair(lim)}`), `${m.name}: largest board not on file`));
  // Too small is one point for the whole line (a panel or a carrier away, not a stop), so it is made once, where the
  // board enters: at the printer, or the first machine of a line without one.
  if (needs.boardMm && opts.entry && (m.specs.minBoardMm || cap.minBoardMm)) {
    const lim = cap.minBoardMm ?? m.specs.minBoardMm!;
    if (!atLeast(needs.boardMm, lim)) out.push({ level: "amber", reason: `board ${fmtPair(needs.boardMm)} is under the ${fmtPair(lim)} the line's machines take — run it in a panel or on a carrier` });
  }
  if (needs.thicknessMm && m.specs.maxThicknessMm && needs.thicknessMm > m.specs.maxThicknessMm) out.push({ level: "red", reason: `board ${needs.thicknessMm} mm thick, ${m.name} takes up to ${m.specs.maxThicknessMm} mm` });
  if (needs.thicknessMm && m.specs.minThicknessMm && needs.thicknessMm < m.specs.minThicknessMm) out.push({ level: "amber", reason: `board ${needs.thicknessMm} mm thick, ${m.name} wants at least ${m.specs.minThicknessMm} mm — use a support or carrier` });
  return out;
}

function placeChecks(placers: MachineView[], needs: BuildNeeds, cap: EffectiveCapability): Judged[] {
  const s = needs.smt;
  const best = <T>(vals: (T | undefined)[], cmp: (a: T, b: T) => number) => vals.filter((v): v is T => v !== undefined).sort(cmp)[0];
  const chipOwn = best(placers.map((p) => p.specs.minChip), (a, b) => chipIndex(a) - chipIndex(b));
  const pitchOwn = best(placers.map((p) => p.specs.minPitchMm), (a, b) => a - b);
  const sizeOwn = best(placers.map((p) => p.specs.maxComponentMm), (a, b) => sortedPair(b)[0] * sortedPair(b)[1] - sortedPair(a)[0] * sortedPair(a)[1]);
  const heightOwn = best(placers.map((p) => p.specs.maxComponentHeightMm), (a, b) => b - a);
  const out: Judged[] = [];
  if (s.smallestChip) out.push(judge(chipOwn, cap.minChip, (lim) => (chipIndex(s.smallestChip!) < chipIndex(lim) ? `${s.smallestChip} chips are smaller than the ${lim} the placers take` : null), "smallest chip the placers take is not on file"));
  if (s.finestPitchMm) out.push(judge(pitchOwn, cap.minPitchMm, (lim) => (s.finestPitchMm! < lim - 1e-9 ? `${s.finestPitchMm} mm pitch is finer than the placers' ${lim} mm` : null), "finest pitch the placers take is not on file"));
  if (s.largestMm && sizeOwn) out.push(judge(sizeOwn, undefined, (lim) => (fits(s.largestMm!, lim) ? null : `largest part ${fmtPair(s.largestMm!)} is bigger than the placers' ${fmtPair(lim)} — place it by hand`), ""));
  if (s.tallestMm && (heightOwn || cap.maxComponentHeightMm)) out.push(judge(heightOwn, cap.maxComponentHeightMm, (lim) => (s.tallestMm! > lim ? `tallest part ${s.tallestMm} mm is above the ${lim} mm the placers handle` : null), ""));
  return out;
}

function stepFrom(stage: Stage, machines: MachineView[], judged: Judged[], opts: { recommended?: boolean } = {}): StepCheck {
  const level = worst(judged.map((j) => j.level));
  return { stage, label: STAGE_LABEL[stage], level, machines: machines.map((m) => m.name), reasons: [...new Set(judged.map((j) => j.reason).filter((r): r is string => !!r))], ...(opts.recommended ? { recommended: true } : {}) };
}

function missingStep(stage: Stage, level: Level, reason: string, recommended = false): StepCheck {
  return { stage, label: STAGE_LABEL[stage], level, machines: [], reasons: [reason], ...(recommended ? { recommended: true } : {}) };
}

/** Machine types somewhere in the plant, for steps a line may hand to an offline machine (X-ray). */
export type PlantMachines = Set<string>;

/** Every step this board needs on this line, judged by the machine that does it. */
export function checkLine(line: LineIn, needs: BuildNeeds, plant: PlantMachines): LineCheck {
  const cap = effectiveCapability(line);
  const views: MachineView[] = [...line.machines].sort((a, b) => a.position - b.position).map((m) => ({ name: machineName(m), type: m.type, specs: readSpecs(m.specs).specs }));
  const of = (...types: string[]) => views.filter((v) => types.includes(v.type));
  const roles: LineRole[] = [];
  const steps: StepCheck[] = [];
  const smtLine = line.type === "SMT" || line.type === "MIXED";
  const thtLine = line.type === "THT" || line.type === "MIXED";

  if (smtLine && needs.smt.placements) {
    roles.push("smt");
    // An inline laser marker (our Line 1) takes every board first, so its size and thickness limits bind the line.
    const markers = of("LASER_MARKER");
    if (markers.length) steps.push({ ...stepFrom("load", markers, markers.flatMap((m) => boardChecks(m, needs, cap))), label: "Laser marking" });
    const printers = of("STENCIL_PRINTER");
    steps.push(printers.length ? stepFrom("print", printers, printers.flatMap((m, i) => boardChecks(m, needs, cap, { entry: i === 0 }))) : missingStep("print", "red", "no stencil printer on this line"));
    const spi = of("SPI");
    steps.push(spi.length ? stepFrom("spi", spi, spi.flatMap((m) => boardChecks(m, needs, cap)), { recommended: true }) : missingStep("spi", "amber", "no SPI — paste is only checked at AOI", true));
    const placers = of("PICK_AND_PLACE");
    steps.push(placers.length ? stepFrom("place", placers, [...placeChecks(placers, needs, cap), ...placers.flatMap((m) => boardChecks(m, needs, cap))]) : missingStep("place", "red", "no pick-and-place machine on this line"));
    const ovens = of("REFLOW_OVEN");
    const oven: Judged[] = ovens.flatMap((m) => [
      ...boardChecks(m, needs, cap),
      ...(needs.smt.tallestMm && m.specs.maxComponentHeightMm && needs.smt.tallestMm > m.specs.maxComponentHeightMm ? [{ level: "red" as Level, reason: `tallest part ${needs.smt.tallestMm} mm will not clear ${m.name}'s ${m.specs.maxComponentHeightMm} mm` }] : []),
    ]);
    if (needs.smt.sides === 2 && cap.doubleSided === false) oven.push({ level: "red", reason: "the board has parts on both sides and this line does not do double-sided reflow" });
    steps.push(ovens.length ? stepFrom("reflow", ovens, oven) : missingStep("reflow", "red", "no reflow oven on this line"));
    const aoi = of("AOI");
    steps.push(aoi.length ? stepFrom("aoi", aoi, aoi.flatMap((m) => boardChecks(m, needs, cap)), { recommended: true }) : missingStep("aoi", "amber", "no AOI — joints are inspected by eye", true));
    if (needs.smt.hidden || needs.smt.hasBga) {
      const xray = of("XRAY");
      const what = `${needs.smt.hidden} part${needs.smt.hidden === 1 ? " has" : "s have"} joints under the body`;
      // No X-ray anywhere: BGAs cannot be built blind; bottom-terminated parts (QFN, DFN…) are, with AOI on the
      // visible fillet and a sectioned or outsourced sample.
      const noXray = needs.smt.hasBga
        ? missingStep("xray", "red", `${what}, BGAs among them, and there is no X-ray in the plant — outsource X-ray or add one`)
        : missingStep("xray", "amber", `${what} and there is no X-ray in the plant — AOI on the visible fillet plus an outsourced X-ray or cross-section of the first boards`);
      steps.push(xray.length ? stepFrom("xray", xray, xray.flatMap((m) => boardChecks(m, needs, cap))) : plant.has("XRAY") ? missingStep("xray", "amber", `${what}: X-ray them on another line's machine`) : noXray);
    }
  }

  if (thtLine && (needs.tht.parts || needs.pressFit || needs.coating || needs.ict)) {
    roles.push("tht");
    const tht = { lineWide: line.type === "THT" };
    if (needs.tht.parts) {
      const solder = of("WAVE_SOLDER", "SELECTIVE_SOLDER");
      steps.push(solder.length ? stepFrom("tht-solder", solder, solder.flatMap((m) => boardChecks(m, needs, cap, tht))) :cap.wave || cap.selective ? stepFrom("tht-solder", [], []) : missingStep("tht-solder", "amber", `${needs.tht.parts} through-hole part${needs.tht.parts === 1 ? "" : "s"} and no wave or selective machine — hand soldering only`));
    }
    if (needs.pressFit) {
      const press = of("PRESS_FIT");
      steps.push(press.length || cap.pressFit ? stepFrom("press-fit", press, press.flatMap((m) => boardChecks(m, needs, cap, tht))) :missingStep("press-fit", "red", `${needs.pressFit} press-fit part${needs.pressFit === 1 ? "" : "s"} and no press on this line`));
    }
    if (needs.coating) {
      const coat = of("CONFORMAL_COATER");
      steps.push(coat.length || cap.conformalCoat ? stepFrom("coat", coat, coat.flatMap((m) => boardChecks(m, needs, cap, tht))) :missingStep("coat", "red", "the board is coated and there is no coater on this line"));
    }
    if (needs.ict) {
      const test = of("ICT", "FLYING_PROBE");
      steps.push(test.length || cap.ict || cap.flyingProbe ? stepFrom("test", test, test.flatMap((m) => boardChecks(m, needs, cap, tht))) :missingStep("test", "amber", "no ICT or flying probe on this line"));
    }
  }

  if (line.type === "BOX_BUILD" && needs.box) {
    roles.push("box");
    const box = views.filter((v) => kindOf(v.type).stage === "box" || v.type === "FCT" || v.type === "OTHER");
    steps.push(box.length ? stepFrom("box", box, []) : missingStep("box", "amber", "no stations on file for this line"));
  }

  if (!roles.length) return { lineId: line.id, code: line.code, name: line.name, type: line.type, roles, level: "na", steps, summary: "Not needed for this board." };
  const level = worst(steps.map((s) => s.level));
  const reds = steps.filter((s) => s.level === "red");
  const ambers = steps.filter((s) => s.level === "amber");
  const summary =
    level === "red"
      ? `Cannot build it: ${reds.flatMap((s) => s.reasons).slice(0, 2).join("; ")}.`
      : level === "amber"
        ? `Can build it, with ${ambers.length === 1 ? "one thing" : `${ambers.length} things`} to check: ${ambers.flatMap((s) => s.reasons).slice(0, 2).join("; ")}.`
        : `Every step fits${views.length ? "" : " (no machines on file)"}.`;
  return { lineId: line.id, code: line.code, name: line.name, type: line.type, roles, level, steps, summary };
}

// ── The plant's answer

export type PlantCheck = { level: Level; summary: string; use: Partial<Record<LineRole, string>>; lines: LineCheck[]; needs: BuildNeeds };

const ROLE_WORD: Record<LineRole, string> = { smt: "the surface-mount side", tht: "through-hole, coating and test", box: "box build" };
const rank = (l: Level | "na") => (l === "green" ? 0 : l === "amber" ? 1 : l === "red" ? 2 : 3);

/**
 * Which lines to use: for each role the board needs, the best line that can do it (green before amber). A role
 * no line can do makes the plant red. `prefer` is the line the process route planned for each job: it wins a tie
 * between lines that fit equally well, so the machine check and the route name the same line.
 */
export function checkPlant(lines: LineIn[], needs: BuildNeeds, prefer: Partial<Record<LineRole, string>> = {}): PlantCheck {
  const active = lines.filter((l) => l.active !== false);
  const plant: PlantMachines = new Set(active.flatMap((l) => l.machines.map((m) => m.type)));
  const checks = active.map((l) => checkLine(l, needs, plant));
  const wanted: LineRole[] = [...(needs.smt.placements ? (["smt"] as const) : []), ...(needs.tht.parts || needs.pressFit || needs.coating || needs.ict ? (["tht"] as const) : []), ...(needs.box ? (["box"] as const) : [])];
  const use: Partial<Record<LineRole, string>> = {};
  const gaps: string[] = [];
  const watch: string[] = [];
  for (const role of wanted) {
    const cands = checks.filter((c) => c.roles.includes(role)).sort((a, b) => rank(a.level) - rank(b.level) || Number(b.code === prefer[role]) - Number(a.code === prefer[role]));
    const best = cands[0];
    if (!best) {
      gaps.push(role === "smt" ? "no SMT line on file" : role === "tht" ? "no through-hole line on file" : "no box-build line on file");
      continue;
    }
    if (best.level === "red") {
      gaps.push(`no line can do ${ROLE_WORD[role]} — ${best.code}: ${best.steps.filter((s) => s.level === "red").flatMap((s) => s.reasons)[0] ?? "a step does not fit"}`);
      continue;
    }
    use[role] = best.code;
    if (best.level === "amber") watch.push(`${best.code}: ${best.steps.filter((s) => s.level === "amber").flatMap((s) => s.reasons)[0]}`);
  }
  const level: Level = gaps.length ? "red" : watch.length ? "amber" : "green";
  const plan = (Object.entries(use) as [LineRole, string][]).map(([r, c]) => `${c} for ${ROLE_WORD[r]}`);
  const summary = !wanted.length
    ? "Nothing to assemble yet — the BoM has no placed parts."
    : level === "red"
      ? `Our machines cannot build it as it stands: ${gaps.join("; ")}.`
      : `Our machines can build it: ${plan.join(", ")}.${watch.length ? ` To check: ${watch.join("; ")}.` : ""}`;
  return { level, summary, use, lines: checks, needs };
}
