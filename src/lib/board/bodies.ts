/**
 * Describes a component's 3D body from package data, independent of the renderer.
 * Units: mm. x = length (along pin rows), y = width, z = height above the board.
 */
import { PART_BODIES, type BodyLine } from "@/knowledge/part-bodies";

export type BodyKind = "chip" | "molded" | "gullwing" | "leadless" | "quad" | "array" | "power" | "can" | "module" | "crystal" | "connector" | "generic";

/**
 * What the part looks like, where the kind alone would draw the wrong thing: a relay is not a black block, a screw
 * terminal is not a capacitor can. Only the 3D renderer reads it; pads, routes and box cut-outs go by `kind`.
 */
export type BodyShape =
  | "relay"
  | "terminal"
  | "header"
  | "dip"
  | "led"
  | "to220"
  | "to92"
  | "hc49"
  | "electrolytic"
  | "axial"
  // Read from a BoM line's own words (bodyForLine, src/knowledge/part-bodies.ts).
  | "smdcan"
  | "tantalum"
  | "power-inductor"
  | "heatsink"
  | "transformer"
  | "ct-transformer"
  | "minifit"
  | "kk-header"
  | "box-header"
  | "latch-header"
  | "hc49-smd"
  | "sot223"
  | "dpak"
  | "fuse";

/** Shapes whose leads go through the board: their pads are drilled, and they are soldered after reflow. */
export const THROUGH_HOLE_SHAPES: ReadonlySet<BodyShape> = new Set<BodyShape>(["dip", "to220", "to92", "header", "terminal", "axial", "hc49", "relay", "electrolytic", "heatsink", "transformer", "ct-transformer", "minifit", "kk-header", "box-header", "latch-header"]);

export type BodySpec = {
  kind: BodyKind;
  shape?: BodyShape;
  length: number;
  width: number;
  height: number;
  /** Body colour; terminations/leads are drawn metal. */
  color: string;
  pins: number;
  pitch: number;
};

/**
 * The 3D model (src/vendor/circuitflow/partModels.js) that draws each shape. The board studio and the box-build
 * view both read it, so a part looks the same in the two.
 */
export const SHAPE_MODEL: Partial<Record<BodyShape, string>> = {
  smdcan: "smdcan",
  tantalum: "tantalum",
  "power-inductor": "powerind",
  heatsink: "heatsink",
  transformer: "transformer",
  "ct-transformer": "ct",
  minifit: "minifit",
  "kk-header": "kk",
  "box-header": "boxheader",
  "latch-header": "latchheader",
  "hc49-smd": "hc49smd",
  sot223: "sot223",
  dpak: "dpak",
  fuse: "fuse",
  header: "pinheader",
  to220: "to220v",
  electrolytic: "electrolytic",
};

type PkgLike = { family?: string | null; name?: string | null; lengthMm?: number | null; widthMm?: number | null; heightMm?: number | null; pinCount?: number | null; pitchMm?: number | null };

/**
 * The usual lead or pad pitch of a package family, in mm, for when neither the part nor its footprint name gives one:
 * QFN / DFN / SON / LGA and QFP 0.5, TSSOP / SSOP / MSOP 0.65, SOIC / SOP / SO 1.27. Null for anything else.
 */
export function familyPitch(name: string | null | undefined): number | null {
  const n = (name ?? "").toUpperCase();
  if (/\b(QFN|DFN|SON|WSON|VSON|LGA|UQFN|VQFN)|^(QFN|DFN|SON|LGA)/.test(n)) return 0.5;
  if (/(LQFP|TQFP|QFP)/.test(n)) return 0.5;
  if (/(TSSOP|SSOP|MSOP|VSSOP)/.test(n)) return 0.65;
  if (/(SOIC|SOP|\bSO-?\d)/.test(n)) return 1.27;
  return null;
}

const FAMILY_PITCH: Record<string, number> = { QFN: 0.5, SON: 0.5, QFP: 0.5, BGA: 0.8, LGA: 0.5, CSP: 0.4, SSOP: 0.65, TSSOP: 0.65, SOIC: 1.27, SOT: 0.95 };

const BLACK = "#1f1f22";
const MLCC_TAN = "#b89466";
const RES_BLACK = "#2a2a2a";

export function bodyFor(pkg: PkgLike | null, opts: { category?: string | null; mpn?: string | null } = {}): BodySpec {
  const fam = pkg?.family ?? "";
  const L = pkg?.lengthMm ?? 0;
  const W = pkg?.widthMm ?? 0;
  const H = pkg?.heightMm ?? 0;
  const pins = pkg?.pinCount ?? 2;
  // No pitch on file: the family's usual one, so fine-pitch pads land under the body instead of 1.27 mm apart.
  const pitch = pkg?.pitchMm ?? FAMILY_PITCH[fam] ?? familyPitch(pkg?.name) ?? 1.27;
  const cat = opts.category ?? "";

  if (fam === "CHIP") {
    const isCap = /mlcc|cap/.test(cat);
    const isLed = /led/.test(cat);
    const isFerrite = /ferrite/.test(cat);
    return { kind: "chip", length: L, width: W, height: isCap ? Math.max(H, W * 0.8) : H, color: isLed ? "#e8f2e0" : isCap ? MLCC_TAN : isFerrite ? "#3a3a3a" : RES_BLACK, pins: 2, pitch };
  }
  if (fam === "MOLDED") return { kind: "molded", length: L, width: W, height: H, color: "#c9a227", pins: 2, pitch };
  if (fam === "SOD" || fam === "SMx") return { kind: "molded", length: L, width: W, height: H, color: BLACK, pins: 2, pitch };
  if (fam === "DIP") return { kind: "gullwing", shape: "dip", length: L, width: W, height: H, color: BLACK, pins, pitch };
  // Three leads and a tab, not two rows of leads: the same look the BoM line's own words give (part-bodies.ts).
  if (fam === "SOT" && /SOT-?223/i.test(pkg?.name ?? "")) return { kind: "gullwing", shape: "sot223", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (["SOT", "SOIC", "SSOP", "TSSOP", "TSOP"].includes(fam)) return { kind: "gullwing", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (["QFN", "SON"].includes(fam)) return { kind: "leadless", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (fam === "QFP") return { kind: "quad", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (["BGA", "LGA", "CSP"].includes(fam)) return { kind: "array", length: L, width: W, height: H, color: fam === "LGA" ? "#d6d6d0" : BLACK, pins, pitch };
  if (fam === "TO" && /TO-?220/i.test(pkg?.name ?? "")) return { kind: "power", shape: "to220", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (fam === "TO" && /TO-?92/i.test(pkg?.name ?? "")) return { kind: "power", shape: "to92", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (fam === "TO" && /TO-?26[38]|TO-?252|D2?-?PAK/i.test(pkg?.name ?? "")) return { kind: "power", shape: "dpak", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (fam === "TO") return { kind: "power", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (fam === "RADIAL") return { kind: "can", shape: "electrolytic", length: L, width: W, height: H, color: "#1f3a6e", pins: 2, pitch };
  if (fam === "VCHIP") return { kind: "can", shape: "smdcan", length: L, width: W, height: H, color: "#c9ccd2", pins: 2, pitch };
  if (fam === "MODULE") return { kind: "module", length: L, width: W, height: H, color: "#c9ccd2", pins, pitch };
  if (fam === "XTAL") return { kind: "crystal", length: L, width: W, height: H, color: "#c9ccd2", pins, pitch };
  if (fam === "LED") return { kind: "chip", length: L, width: W, height: H, color: "#f2f2ea", pins, pitch };
  if (fam === "AXIAL") return { kind: "can", shape: "axial", length: L, width: W, height: H, color: "#3b3b3b", pins: 2, pitch };

  // No package: guess from category so connectors, inductors and mechanics still look right.
  if (/connector|terminal|header|usb|rj45|m12|dsub|fpc|btb|wtb/.test(cat)) return { kind: "connector", shape: /terminal/.test(cat) ? "terminal" : /header/.test(cat) ? "header" : undefined, length: L || 10, width: W || 6, height: H || 6, color: /terminal/.test(cat) ? "#3f7f3f" : /usb|rj45|m12|dsub/.test(cat) ? "#b8bcc4" : "#ececec", pins, pitch };
  if (/inductor/.test(cat)) return { kind: "generic", length: L || 5, width: W || 5, height: H || 3, color: "#2c2c2c", pins: 2, pitch };
  if (/aluminium|supercap|film/.test(cat)) return { kind: "can", shape: /film/.test(cat) ? undefined : "electrolytic", length: L || 8, width: W || 8, height: H || 11, color: "#1f3a6e", pins: 2, pitch };
  if (/relay|buzzer|battery|switch|potentiometer/.test(cat)) return { kind: "generic", shape: /relay/.test(cat) ? "relay" : undefined, length: L || 10, width: W || 8, height: H || 8, color: /relay/.test(cat) ? "#2b4a8b" : BLACK, pins, pitch };
  if (/heatsink/.test(cat)) return { kind: "generic", length: L || 19, width: W || 13, height: H || 12, color: "#2a2a2a", pins: 0, pitch };
  return { kind: "generic", length: L || 3, width: W || 3, height: H || 1.5, color: BLACK, pins, pitch };
}

/** Footprint names from CAD files ("C_0603_1608Metric", "SOIC-8_3.9x4.9mm") → our package names. */
export function packageFromFootprint(footprint: string | null | undefined, known: string[]): string | null {
  if (!footprint) return null;
  const f = footprint.toUpperCase();
  const exact = known.find((k) => k.toUpperCase() === f);
  if (exact) return exact;
  const chip = f.match(/(?:^|[_-])(0201|0402|0603|0805|1206|1210|2512)(?:[_-]|$)/);
  if (chip) return chip[1];
  const named = known
    .filter((k) => k.length >= 4)
    .sort((a, b) => b.length - a.length)
    .find((k) => f.includes(k.toUpperCase()));
  return named ?? null;
}

/** What the copper under a part reads as (src/lib/board/placement-snap.ts), as stored with its placement. */
export type CopperFacts = { label: string; length: number | null; width: number | null; pads: number | null };

/**
 * A body sized from the copper a part sits on, for a part no package describes: the named package when the copper
 * reads as one we know ("0402", "SOT-23"), else a body of the land pattern's kind, the size of its pads' inner span.
 */
export function bodyFromCopper(c: CopperFacts, packages: PkgLike[], opts: { category?: string | null } = {}): BodySpec | null {
  const label = c.label.trim();
  const named = packages.find((p) => (p.name ?? "").toUpperCase() === label.toUpperCase());
  if (named) return bodyFor(named, opts);
  const L = c.length ?? 0, W = c.width ?? 0;
  if (!(L > 0) || !(W > 0)) return null;
  const pins = Number(label.match(/-(\d{1,4})/)?.[1] ?? c.pads ?? 2);
  const pitch = Number(label.match(/(\d+(?:\.\d+)?) mm$/)?.[1] ?? 1.27);
  const [long, short] = [Math.max(L, W), Math.min(L, W)];
  if (/^(?:QFP)/.test(label)) return { kind: "quad", length: Math.max(1, L - 2.6), width: Math.max(1, W - 2.6), height: 1.4, color: BLACK, pins, pitch };
  if (/^(?:QFN|DFN)/.test(label)) return { kind: "leadless", length: Math.max(1, L - 0.4), width: Math.max(1, W - 0.4), height: 0.85, color: BLACK, pins, pitch };
  if (/^BGA/.test(label)) return { kind: "array", length: L + 0.6, width: W + 0.6, height: 1.2, color: BLACK, pins, pitch };
  if (/^(?:SOIC|TSSOP)/.test(label)) return { kind: "gullwing", length: long - 0.2, width: Math.max(1, short - 2.4), height: 1.5, color: BLACK, pins, pitch };
  if (/^4-pad/.test(label)) return { kind: "crystal", length: long, width: short, height: Math.max(0.45, short * 0.35), color: "#c9ccd2", pins: 4, pitch: Math.round(long * 60) / 100 };
  if (/through-hole/.test(label)) return null;
  return null;
}

/**
 * A pin header (or socket strip) laid out the way its drilled pads are. A BoM line seldom says whether its twelve
 * positions are one row or two; the copper under the part always does. Only when the copper is a plain
 * rows × columns grid of as many pads as the body has pins: any other body, and any other copper, comes back as is.
 */
export function headerOnCopper(body: BodySpec, copper: Pick<CopperFacts, "label"> | null | undefined): BodySpec {
  const pitch = body.pitch || 2.54;
  const strip = body.shape === "header" || (body.kind === "connector" && !body.shape && Math.abs(body.length * body.width - body.pins * pitch * pitch) < 0.1);
  const grid = strip ? copper?.label.match(/^(\d+)×(\d+) through-hole/) : null;
  if (!grid) return body;
  const [rows, cols] = [Number(grid[1]), Number(grid[2])];
  if (rows * cols !== body.pins || Math.round(body.width / pitch) === rows) return body;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { ...body, length: r2(cols * pitch), width: r2(rows * pitch) };
}

/**
 * The body a BoM line's own words describe: an aluminium can, a finned heatsink, a Mini-Fit header, a 144-pin LQFP.
 * Read with the recognisers of src/knowledge/part-bodies.ts — the part number first, then the description, then the
 * footprint name, because that is how far each can be trusted. Null when nothing in the line says what the part
 * looks like; the caller then falls back to the catalogue package or the copper.
 */
export function bodyForLine(line: { mpn?: string | null; description?: string | null; pkg?: string | null; refDes?: string | null }): BodySpec | null {
  const clean = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  const mpn = clean(line.mpn);
  const description = clean(line.description);
  const pkg = clean(line.pkg);
  const l: BodyLine = { mpn, description, pkg, refDes: clean(line.refDes), text: [mpn, description, pkg].filter(Boolean).join(" ") };
  for (const field of ["mpn", "description", "pkg"] as const) {
    if (!l[field]) continue;
    for (const r of PART_BODIES) {
      const pattern = r[field];
      const hit = pattern ? l[field].match(pattern) : null;
      const body = hit ? r.body(l, hit) : null;
      if (body) return body;
    }
  }
  return null;
}
