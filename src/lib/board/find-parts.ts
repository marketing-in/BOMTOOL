/**
 * The components of a board from its fabrication files alone (Phase 14). circuitflow's reader takes the best the files
 * offer — the X3 component layer, a pick-and-place file, X2 pad designators — and otherwise guesses the parts from the
 * pads, drills and silkscreen. Pure: no Next.js, no database.
 */
import { buildGerberBoard, classifyPads, inferType, packageSize, TYPE_LABELS, type CfType } from "@/vendor/circuitflow/gerber-entry";
import { familyPitch, type BodySpec } from "./bodies";
import type { ColumnMapping } from "@/lib/bom/fields";

export type FoundSource = "component-layer" | "placement" | "pad-designators" | "guessed" | "none";

export type FoundPart = {
  ref: string;
  /** Gerber millimetres, Y up — the frame of a pick-and-place file, so it lines up with the artwork. */
  x: number;
  y: number;
  /** Degrees counter-clockwise. */
  rotation: number;
  side: "TOP" | "BOTTOM";
  package: string;
  kind: CfType;
  value: string | null;
  mpn: string | null;
  manufacturer: string | null;
  pads: number;
  tht: boolean;
  /** A two-pad SMD part the pads can't tell apart: resistor, capacitor, inductor, diode … */
  passive: boolean;
  /** Body from the pad spread, mm along x (w) and y (d) before rotation. */
  w: number;
  d: number;
};

export type FoundParts = { source: FoundSource; parts: FoundPart[]; notes: string[] };

export const SOURCE_LABEL: Record<FoundSource, string> = {
  "component-layer": "the component layer in the Gerbers",
  placement: "the pick-and-place file",
  "pad-designators": "the designators on the Gerber pads",
  guessed: "the pads, drills and silkscreen (guessed)",
  none: "nothing in these files",
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Common lead pitches; a measured pitch within 4 % of one is shown as it. */
const PITCHES = [0.3, 0.35, 0.4, 0.5, 0.65, 0.8, 1, 1.27, 1.5, 2, 2.5, 2.54, 3.5, 3.81, 5, 5.08, 7.5, 7.62, 10, 10.16, 15.24];
export function snapPitch(pkg: string): string {
  return pkg.replace(/(\d+(?:\.\d+)?)(\s?mm)/g, (all, n: string, unit: string) => {
    const v = Number(n);
    const hit = [...PITCHES].sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0];
    return Math.abs(hit - v) <= hit * 0.04 ? `${hit}${unit}` : all;
  });
}

/**
 * Reads the parts of one board. `files` are the Gerber and drill files; a pick-and-place file, when there is one,
 * gives designators, values and positions. Never throws: unreadable files come back as no parts and a note.
 */
export function findParts(files: { name: string; text: string }[], centroid?: { name: string; text: string } | null): FoundParts {
  let r: ReturnType<typeof buildGerberBoard>;
  try {
    r = buildGerberBoard(centroid ? [...files, centroid] : files, { name: "board" });
  } catch (e) {
    return { source: "none", parts: [], notes: [e instanceof Error ? e.message : "The files could not be read."] };
  }
  const s = r.summary;
  const source: FoundSource = s.fromComponentLayer
    ? "component-layer"
    : s.pnpAligned && s.pnp.length
      ? "placement"
      : s.attributed
        ? "pad-designators"
        : s.inferred
          ? "guessed"
          : "none";
  const parts: FoundPart[] = r.board.parts.map((p) => {
    const pads = p.pads ?? [];
    // Designators from X2 alone carry no package: name it from the pads, as the guesser does.
    const pkg = p.package || (pads.length ? classifyPads(pads.map((q) => ({ x: q.x, y: q.y, w: q.w, h: q.h, hole: q.hole ?? 0 }))).package : "");
    // Our bodies run their pin rows along x. Pads say which way an IC sits; a placement file's rotation is kept as given.
    const columns = new Set(pads.map((q) => Math.round(q.x * 4))).size;
    const rows = new Set(pads.map((q) => Math.round(q.y * 4))).size;
    const turn = source !== "placement" && source !== "component-layer" && pads.length > 2 && columns < rows;
    return {
      ref: p.ref,
      x: r3(p.x + r.origin.x),
      y: r3(r.origin.y - p.y),
      rotation: r3((p.rot + (turn ? 90 : 0)) % 360),
      side: p.side === "bottom" ? "BOTTOM" : "TOP",
      package: snapPitch(pkg),
      kind: p.type,
      value: p.value || null,
      mpn: p.mpn || null,
      manufacturer: null,
      pads: pads.length,
      tht: p.leads === "tht" || pads.some((q) => (q.hole ?? 0) > 0),
      passive: !!p.passive,
      w: turn ? p.d : p.w,
      d: turn ? p.w : p.d,
    };
  });
  // circuitflow's last warning restates what the source already says.
  const notes = r.warnings.filter((w) => !/^No component data in these files/.test(w));
  return { source, parts, notes };
}

// ───────────────────────────── Groups (one per BoM line) ─────────────────────────────

export type FoundGroup = {
  key: string;
  package: string;
  kind: CfType;
  passive: boolean;
  value: string | null;
  mpn: string | null;
  manufacturer: string | null;
  tht: boolean;
  refs: string[];
  top: number;
  bottom: number;
};

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Same MPN, else same value and package, else same package and kind: one BoM line each. */
export function groupFound(parts: FoundPart[]): FoundGroup[] {
  const groups = new Map<string, FoundGroup>();
  for (const p of parts) {
    const key = p.mpn ? `mpn:${p.mpn.toUpperCase()}` : p.value ? `val:${p.kind}:${p.value}:${p.package}` : `pkg:${p.passive ? "passive" : p.kind}:${p.tht ? "tht" : "smd"}:${p.package}`;
    const g = groups.get(key) ?? { key, package: p.package, kind: p.kind, passive: p.passive, value: p.value, mpn: p.mpn, manufacturer: p.manufacturer, tht: p.tht, refs: [], top: 0, bottom: 0 };
    g.refs.push(p.ref);
    if (p.side === "BOTTOM") g.bottom++;
    else g.top++;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, refs: g.refs.sort(natural) })).sort((a, b) => b.refs.length - a.refs.length || natural(a.package, b.package));
}

/** "P1–P44, U3, U7" from a sorted designator list: runs of consecutive numbers become ranges. */
export function compressRefs(refs: string[]): string {
  const out: string[] = [];
  let run: { prefix: string; from: number; to: number } | null = null;
  const flush = () => {
    if (run) out.push(run.from === run.to ? `${run.prefix}${run.from}` : `${run.prefix}${run.from}–${run.prefix}${run.to}`);
    run = null;
  };
  for (const r of refs) {
    const m = r.match(/^([A-Za-z_]+)(\d+)$/);
    if (!m) {
      flush();
      out.push(r);
      continue;
    }
    const n = Number(m[2]);
    if (run && run.prefix === m[1] && n === run.to + 1) run.to = n;
    else {
      flush();
      run = { prefix: m[1], from: n, to: n };
    }
  }
  flush();
  return out.join(", ");
}

/** What a group is, in words: the kind, or what a guessed two-pad part could be. */
export function kindLabel(g: Pick<FoundGroup, "kind" | "passive">): string {
  if (g.passive) return "Two-pad part — resistor, capacitor, inductor or diode";
  return g.kind === "other" ? "Component" : TYPE_LABELS[g.kind];
}

// ───────────────────────────── A BoM from the board ─────────────────────────────

/** Marks generated rows the guesser made, so the components step can say so (and never reads it as a value). */
export const GUESSED_MARK = "guessed from the Gerber pads";

export const FOUND_BOM_HEADER = ["Designator", "Qty", "Value", "MPN", "Manufacturer", "Package", "Description", "Kind"];
/** "Kind" stays unmapped: the matcher would read "Resistor 0603" as 603 Ω. */
export const FOUND_BOM_MAPPING: ColumnMapping = ["refDes", "qty", "value", "mpn", "manufacturer", "package", "description", null];

/** A placement file's value is often the part number ("STM32F407VGT6", "1N4148"), not a value ("10k", "4.7uF", "2k2"). */
export function looksLikeMpn(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (v.length < 4 || /\s/.test(v) || !/[a-z]/i.test(v) || !/\d/.test(v)) return false;
  return !/^\d+(\.\d+)?([pnuµm]?F|[pnuµm]?H|[kKMR]\d*|Ω|ohms?|V|W|%)?$/i.test(v) && !/^(DNP|DNF|NC|N\/?A|TBD)$/i.test(v);
}

/**
 * BoM rows for the parts found on a board. Rows without a value or MPN never name the kind in the description —
 * "Resistor" next to "0603" would match a 603 Ω part — the unmapped Kind column carries it instead.
 */
export function bomRowsFromFound(found: FoundParts): string[][] {
  const rows = groupFound(found.parts).map((g) => {
    const label = kindLabel(g);
    // No MPN column but a value that is one: the matcher gets it as the MPN.
    const mpn = g.mpn ?? (looksLikeMpn(g.value) ? g.value : null);
    const description = g.value
      ? `${label} ${g.value}`
      : found.source === "guessed"
        ? `${g.passive ? "Two-pad" : g.tht ? "Through-hole" : "SMD"} part, ${GUESSED_MARK} — value and part number are not in the files`
        : "Value and part number are not in the Gerbers";
    return [g.refs.join(", "), String(g.refs.length), g.value ?? "", mpn ?? "", g.manufacturer ?? "", g.package, description, label];
  });
  return [FOUND_BOM_HEADER, ...rows];
}

// ───────────────────────────── Helpers for lines and placements without a part ─────────────────────────────

/** Through-hole or SMD from a footprint name, when no part says so (null: can't tell). */
export function mountFromFootprint(footprint: string | null | undefined): "THT" | "SMD" | null {
  if (!footprint) return null;
  if (/\bSMD\b|_SMD|SMT\b/i.test(footprint)) return "SMD";
  if (/through.?hole|\bTHT\b|\bP?DIP-?\d|PinHeader|PinSocket|^Header \d+x\d+|Axial|Radial|\bTO-?(92|220|247|126)\b|\bDO-?(41|35|15)\b/i.test(footprint)) return "THT";
  return null;
}

/**
 * A 3D body for a footprint no catalogue package describes — what a board's Gerbers give before parts are chosen.
 * The kind (from the designator: K relay, J connector, D diode …) decides what a leaded footprint most likely is.
 */
export function bodyFromFootprint(footprint: string, kind: CfType = "other"): BodySpec {
  return refineFromName(footprint, bodyFromFootprintName(footprint, kind));
}

/**
 * What an EasyEDA / LCSC footprint name states outright, over the guess: "SOIC-8_L4.9-W3.9-P1.27-LS6.0-BL" is a
 * 4.9 × 3.9 mm body at 1.27 mm pitch; "CRYSTAL-SMD_4P-L3.2-W2.5" a 4-pin 3.2 × 2.5 mm crystal; "HDR-TH_4P-P2.54" a
 * 4-pin header; "SOT-23-3" three pins, not 23.
 */
function refineFromName(footprint: string, b: BodySpec): BodySpec {
  const f = footprint.toUpperCase();
  const out = { ...b };
  const sot = f.match(/^SOT-?23(?:-(\d))?(?![0-9])/);
  if (sot) out.pins = Number(sot[1] ?? 3);
  const family = f.match(/^(?:[A-Z]*QFP|[A-Z]*QFN|DFN|SON|[A-Z]*SOP|SOIC|SSOP|TSSOP|MSOP|BGA|LGA)-(\d{1,4})(?![0-9])/);
  if (family) out.pins = Number(family[1]);
  const pinsP = f.match(/(?:^|[_-])(\d{1,3})P(?:IN)?(?=[_-]|$)/);
  if (pinsP && !family && !sot) out.pins = Number(pinsP[1]);
  const lw = f.match(/[_-]L(\d+(?:\.\d+)?)-W(\d+(?:\.\d+)?)/);
  if (lw) {
    const [L, W] = [Number(lw[1]), Number(lw[2])];
    if (L > 0 && W > 0 && L < 120 && W < 120) {
      out.length = Math.max(L, W);
      out.width = Math.min(L, W);
    }
  }
  const pitch = f.match(/[_-]P(\d+(?:\.\d+)?)(?=[-_]|$)/);
  if (pitch && Number(pitch[1]) > 0.2 && Number(pitch[1]) < 10) out.pitch = Number(pitch[1]);
  if (/^(?:CRYSTAL|XTAL|OSC)/.test(f) && out.kind === "generic") {
    out.kind = "crystal";
    out.color = "#c9ccd2";
    out.height = Math.max(0.45, out.width * 0.35);
    if (!pinsP) out.pins = 4;
  }
  if (/^(?:HDR|HEADER|PINHEADER|PIN-?HDR)/.test(f) && (out.kind === "generic" || out.kind === "connector")) {
    out.kind = "connector";
    out.shape = "header";
    out.color = "#1c1c1f";
    out.length = Math.max(out.pins, 1) * out.pitch;
    out.width = out.pitch;
    out.height = out.pitch >= 2 ? 8.5 : 4.5;
  }
  return out;
}

function bodyFromFootprintName(footprint: string, kind: CfType = "other"): BodySpec {
  const pitch = Number(footprint.match(/(\d+(?:\.\d+)?)\s?mm/)?.[1] ?? 1.27);
  const header = footprint.match(/^Header (\d+)x(\d+)/i);
  if (header) {
    const [rows, cols] = [Number(header[1]), Number(header[2])];
    return { kind: "connector", shape: "header", length: cols * pitch, width: rows * pitch, height: 8.5, color: "#1c1c1f", pins: rows * cols, pitch };
  }
  const berg = footprint.match(/(?:BERG|HEADER|PINHD|CONN)[^0-9]*(\d{1,3})[ _-]?PIN(?:S)?(?:[_ -](\d+)[_.](\d+)\s?MM)?/i);
  if (berg) {
    const n = Number(berg[1]);
    const p = berg[2] ? Number(`${berg[2]}.${berg[3]}`) : 2.54;
    return { kind: "connector", shape: "header", length: n * p, width: p, height: p < 2 ? 4.5 : 8.5, color: "#1c1c1f", pins: n, pitch: p };
  }
  const dip = footprint.match(/^P?DIP-?(\d+)/i);
  if (dip) return { kind: "gullwing", shape: "dip", length: (Number(dip[1]) / 2) * 2.54, width: 6.4, height: 3.6, color: "#1f1f22", pins: Number(dip[1]), pitch: 2.54 };
  // A relay's pads sit under a body far wider than their spread: the common sugar-cube power relay.
  if (kind === "switch" && /through-hole/i.test(footprint)) return { kind: "generic", shape: "relay", length: 19, width: 15.4, height: 15.2, color: "#2456a6", pins: 5, pitch: 2.54 };
  if (/TO-?220/i.test(footprint)) {
    // Three leads in a row are a TO-220 regulator (U) or a small TO-92 transistor (Q).
    return kind === "transistor"
      ? { kind: "power", shape: "to92", length: 4.6, width: 3.6, height: 6.6, color: "#1f1f22", pins: 3, pitch: 1.27 }
      : { kind: "power", shape: "to220", length: 10.2, width: 4.5, height: 15.5, color: "#1f1f22", pins: 3, pitch: 2.54 };
  }
  if (/^Radial/i.test(footprint)) {
    // Two leads through the board: which part depends on what the designator says it is.
    if (kind === "connector") {
      return pitch >= 3.3
        ? { kind: "connector", shape: "terminal", length: pitch * 2, width: 8, height: 10, color: "#2f8a43", pins: 2, pitch }
        : { kind: "connector", shape: "header", length: pitch * 2, width: 2.54, height: 8.5, color: "#1c1c1f", pins: 2, pitch };
    }
    if (kind === "diode" || kind === "led") {
      return pitch <= 3
        ? { kind: "can", shape: "led", length: 5, width: 5, height: 8.6, color: "#e23b2e", pins: 2, pitch }
        : { kind: "can", shape: "axial", length: Math.max(4, pitch * 0.55), width: 2.6, height: 2.6, color: "#1c1c1f", pins: 2, pitch };
    }
    if (kind === "crystal") return { kind: "crystal", shape: "hc49", length: 11.2, width: 4.7, height: 3.6, color: "#c9ccd2", pins: 2, pitch };
    if (kind === "resistor" || kind === "inductor" || kind === "fuse") return { kind: "can", shape: "axial", length: Math.max(4, pitch * 0.6), width: 2.4, height: 2.4, color: kind === "resistor" ? "#c8a878" : "#3b3b3b", pins: 2, pitch };
    const dia = Math.max(4, pitch * 2);
    return { kind: "can", shape: "electrolytic", length: dia, width: dia, height: dia * 1.3, color: "#1f3a6e", pins: 2, pitch };
  }
  if (/^Axial/i.test(footprint)) return { kind: "can", shape: "axial", length: Math.max(3, pitch * 0.6), width: 2.3, height: 2.3, color: kind === "resistor" ? "#c8a878" : "#3b3b3b", pins: 2, pitch };
  // A crystal or oscillator's library name usually carries its metric size: "CRY_HCR2016", "XTAL_3225".
  const metric = kind === "crystal" ? footprint.match(/(?:^|[^0-9])(1210|1612|2016|2520|3225|5032|7050)(?![0-9])/) : null;
  if (metric) {
    const [L, W] = [Number(metric[1].slice(0, 2)) / 10, Number(metric[1].slice(2)) / 10];
    return { kind: "crystal", length: L, width: W, height: Math.max(0.45, W * 0.35), color: "#c9ccd2", pins: 4, pitch: Math.round(L * 60) / 100 };
  }
  // Family and pad count run together ("LGA24", "QFN32", "SOIC8"): read them as "QFN-24". An LGA sits like a QFN.
  const run = footprint.match(/^(LGA|QFN|DFN|QFP|LQFP|TQFP|TSSOP|SSOP|MSOP|SOIC|SOP)[_ ]?(\d{1,3})(?![0-9.])/i);
  if (run) footprint = `${run[1].toUpperCase() === "LGA" ? "QFN" : run[1].toUpperCase()}-${run[2]}`;
  const [w, d, h, leads, shape] = packageSize(footprint.replace(/×/g, "x"), kind);
  // "SR_1PIN", "BERG_4PIN_1_27MM": a CAD library's own way of saying the pin count.
  const named = footprint.match(/(?:^|[^0-9])(\d{1,3})[ _-]?PINS?(?![A-Z])/i);
  // "-1" after a library name is a variant, not a pin count (SOIC-8 is).
  const dashed = footprint.match(/-(\d{1,3})\b/)?.[1];
  const pins = Number(named?.[1] ?? (dashed && Number(dashed) >= 2 ? dashed : null) ?? footprint.match(/(\d{1,3})-pad/)?.[1] ?? 2);
  const length = Math.max(w, d);
  const width = Math.min(w, d);
  const kindOf: BodySpec["kind"] = shape === "cyl" ? "can" : leads === "dual" ? "gullwing" : leads === "quad" ? "quad" : leads === "ends" ? "chip" : kind === "connector" ? "connector" : /QFN|DFN|SON/i.test(footprint) ? "leadless" : "generic";
  // Pin headers are black plastic; other connectors (USB, RJ45 shells, terminal blocks) read better light.
  const color = kindOf === "connector" && !/header/i.test(footprint) ? "#ececec" : kindOf === "can" ? "#1f3a6e" : kindOf === "chip" && kind === "capacitor" ? "#b89466" : "#1f1f22";
  // A footprint name rarely states its pitch; fine-pitch families don't use the 1.27 mm default.
  const fine = /mm/i.test(footprint) ? null : familyPitch(footprint);
  return { kind: kindOf, length, width, height: h, color, pins, pitch: fine ?? pitch };
}

/** A rotation worked out from pad positions lands a few degrees off square; parts sit at right angles. */
export const squareUp = (deg: number) => {
  const near = Math.round(deg / 90) * 90;
  return Math.abs(deg - near) <= 8 ? ((near % 360) + 360) % 360 : deg;
};

const CHIP_SIZE = /^(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)\b/;

export type LineKind = CfType | "passive";

/**
 * What kind of part a BoM line needs, from its designators and package: R → resistor, U → IC … A guessed two-pad
 * line, or a chip-size footprint with no telling designator, is "passive".
 */
export function kindForLine(refDes: string | null, pkg: string | null, value: string | null, description: string | null): LineKind | null {
  const first = (refDes ?? "").split(/[,\s]+/).find(Boolean) ?? "";
  if (description?.includes(GUESSED_MARK)) {
    if (/^Two-pad/i.test(description)) return "passive";
    const prefix = first.replace(/\d.*$/, "").toUpperCase();
    return ({ U: "chip", Q: "transistor", J: "connector", R: "resistor", C: "capacitor" } as Record<string, CfType>)[prefix] ?? null;
  }
  const t = inferType(first, pkg ?? "", value ?? "");
  if (t !== "other") return t;
  return CHIP_SIZE.test(pkg ?? "") ? "passive" : null;
}

/** The parts a kind covers, for "Fits 0603 · resistors, capacitors …". */
export const KIND_PLURAL: Record<LineKind, string> = {
  resistor: "resistors",
  capacitor: "capacitors",
  inductor: "inductors and ferrite beads",
  diode: "diodes",
  led: "LEDs",
  transistor: "transistors",
  chip: "integrated circuits",
  connector: "connectors",
  crystal: "crystals and oscillators",
  switch: "switches and relays",
  fuse: "fuses and protection",
  module: "modules",
  passive: "resistors, capacitors, inductors and diodes",
  other: "parts",
};

/** Catalogue categories that can sit on a line of this kind. */
export const KIND_CATEGORIES: Record<LineKind, string[]> = {
  resistor: ["resistor-chip", "resistor-current-sense", "resistor-network", "potentiometer", "ptc-ntc"],
  capacitor: ["mlcc", "tantalum-cap", "aluminium-cap", "polymer-cap", "film-cap", "supercap"],
  inductor: ["inductor", "ferrite-bead"],
  diode: ["diode", "wide-bandgap"],
  led: ["led"],
  transistor: ["mosfet", "bjt", "igbt", "wide-bandgap"],
  chip: ["mcu", "mpu-soc", "fpga-cpld", "memory", "power-ic", "op-amp", "data-converter", "interface-ic", "rf-wireless", "sensor", "logic-ic", "optocoupler", "semiconductors"],
  connector: ["connector-header", "connector-wtb", "connector-btb", "connector-usb", "connector-rj45", "connector-m12", "connector-dsub", "terminal-block", "connector-fpc"],
  crystal: ["crystal", "oscillator"],
  switch: ["switch", "relay"],
  fuse: ["fuse", "ptc-ntc", "varistor"],
  module: ["rf-wireless", "mpu-soc", "sensor"],
  passive: ["resistor-chip", "resistor-current-sense", "mlcc", "tantalum-cap", "polymer-cap", "inductor", "ferrite-bead", "diode", "led"],
  other: [],
};

/**
 * How to find catalogue packages for a footprint: exact names ("0603", "SOT-23"), or a family and pin count
 * ("QFP-64, 0.5 mm" → any QFP with 64 pins, e.g. LQFP-64).
 */
export function packageHint(footprint: string | null): { names: string[]; family: string | null; pins: number | null } {
  const f = (footprint ?? "").toUpperCase();
  const chip = f.match(/(?:^|[^0-9])(0201|0402|0603|0805|1206|1210|2512)(?![0-9])/);
  if (chip) return { names: [chip[1], ...NAMED_PACKAGES.filter(([re]) => re.test(f)).map(([, name]) => name)], family: null, pins: null };
  const fam = f.match(/\b(SOIC|TSSOP|SSOP|QFN|QFP|DIP)-(\d{1,3})\b/);
  if (fam) {
    const family = fam[1] === "TSSOP" || fam[1] === "SSOP" ? "TSSOP" : fam[1];
    return { names: [`${fam[1]}-${fam[2]}`], family, pins: Number(fam[2]) };
  }
  const names = NAMED_PACKAGES.filter(([re]) => re.test(f)).map(([, name]) => name);
  return { names, family: null, pins: null };
}

/** Footprint wording → our package names (a guessed "1210/SMA" may be either). */
const NAMED_PACKAGES: [RegExp, string][] = [
  [/SOT-?23-?5\b/, "SOT-23-5"],
  [/SOT-?23-?6\b/, "SOT-23-6"],
  [/SOT-?23(?!-?\d)/, "SOT-23"],
  [/SOT-?223/, "SOT-223"],
  [/SOD-?123/, "SOD-123"],
  [/SOD-?882/, "SOD-882"],
  [/TO-?220/, "TO-220"],
  [/TO-?263|D2PAK|\bDPAK/, "TO-263 (D2PAK)"],
  [/DO-?41/, "DO-41"],
  [/\bSMA\b|DO-?214AC/, "SMA (DO-214AC)"],
  [/\bSMB\b|DO-?214AA/, "SMB (DO-214AA)"],
  [/\bSMC\b|DO-?214AB/, "SMC (DO-214AB)"],
];
