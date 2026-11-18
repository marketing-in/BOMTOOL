/**
 * Describes a component's 3D body from package data, independent of the renderer.
 * Units: mm. x = length (along pin rows), y = width, z = height above the board.
 */
export type BodyKind = "chip" | "molded" | "gullwing" | "leadless" | "quad" | "array" | "power" | "can" | "module" | "crystal" | "connector" | "generic";

/**
 * What the part looks like, where the kind alone would draw the wrong thing: a relay is not a black block, a screw
 * terminal is not a capacitor can. Only the 3D renderer reads it; pads, routes and box cut-outs go by `kind`.
 */
export type BodyShape = "relay" | "terminal" | "header" | "dip" | "led" | "to220" | "to92" | "hc49" | "electrolytic" | "axial";

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
  if (["SOT", "SOIC", "SSOP", "TSSOP", "TSOP"].includes(fam)) return { kind: "gullwing", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (["QFN", "SON"].includes(fam)) return { kind: "leadless", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (fam === "QFP") return { kind: "quad", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (["BGA", "LGA", "CSP"].includes(fam)) return { kind: "array", length: L, width: W, height: H, color: fam === "LGA" ? "#d6d6d0" : BLACK, pins, pitch };
  if (fam === "TO" && /TO-?220/i.test(pkg?.name ?? "")) return { kind: "power", shape: "to220", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (fam === "TO" && /TO-?92/i.test(pkg?.name ?? "")) return { kind: "power", shape: "to92", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (fam === "TO") return { kind: "power", length: L, width: W, height: H, color: BLACK, pins, pitch };
  if (fam === "RADIAL") return { kind: "can", shape: "electrolytic", length: L, width: W, height: H, color: "#1f3a6e", pins: 2, pitch };
  if (fam === "VCHIP") return { kind: "can", length: L, width: W, height: H, color: "#c9ccd2", pins: 2, pitch };
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
