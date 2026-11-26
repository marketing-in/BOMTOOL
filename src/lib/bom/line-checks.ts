/**
 * An engineer's read of one BoM line (Phase 29): does the part number agree with the words next to it? The part
 * number is what gets bought, the description is what the designer meant; where they disagree, someone has to
 * decide before the order goes out. Pure, and needs no catalogue (src/lib/bom/mpn-decode.ts).
 */
import { DIELECTRIC_RANK, parseDescription } from "./describe";
import { damagedLike, decodeMpn, formatSi, UNIT_OF } from "./mpn-decode";
import { signature, signatureLabel, type Signature } from "@/lib/board/footprint-match";

export type CheckCode = "MPN_UNREADABLE" | "MPN_VALUE_MISMATCH" | "MPN_VOLTAGE_LOW" | "MPN_SIZE_MISMATCH" | "MPN_SPEC_DIFF" | "PACKAGE_CONFLICT" | "GENERIC_MPN";

/**
 * Two package readings that cannot be the same part: chips of two sizes, leaded parts of two pin counts, two named
 * packages, or a chip against a leaded part. A two-terminal package (SMB, SOD-323) and a chip size are both two pads,
 * and a family name against a named package (SOIC-8 against "SO-8 PowerPAD") is left alone.
 */
export function packagesDiffer(a: Signature, b: Signature): boolean {
  if (a.kind !== b.kind) {
    const twoPads = (s: Signature) => s.kind === "chip" || (s.kind === "named" && /^(?:SMA|SMB|SMC|SOD-|DO-41|HC-49)/.test(s.name));
    return (a.kind === "chip" || b.kind === "chip") && !(twoPads(a) && twoPads(b));
  }
  if (a.kind === "chip") return a.size !== (b as typeof a).size;
  if (a.kind === "leaded") return a.family !== (b as typeof a).family || a.pins !== (b as typeof a).pins;
  return a.name !== (b as typeof a).name;
}
export type LineCheck = { code: CheckCode; detail: string };

const differs = (a: number, b: number) => Math.abs(a - b) > Math.max(Math.abs(a), Math.abs(b)) * 0.01;

/** Every part number of the line (the first, then the alternates) against the line's own words. */
export function checkLine(line: { mpns: string[]; description: string | null; value: string | null; package: string | null }): LineCheck[] {
  const want = parseDescription(line.value, line.description, line.package);
  const wantValue = want.kind === "capacitor" ? want.capacitance : want.kind === "resistor" ? want.resistance : want.kind === "inductor" ? want.inductance : undefined;
  const out: LineCheck[] = [];
  const add = (code: CheckCode, detail: string) => {
    if (!out.some((c) => c.code === code && c.detail === detail)) out.push({ code, detail });
  };
  // The package the description names against the footprint column: one of them is not the part on the board.
  const said = signature(line.description);
  const column = signature(line.package);
  if (said && column && packagesDiffer(said, column)) add("PACKAGE_CONFLICT", `the description says ${signatureLabel(said)}, the package column ${line.package?.trim()} (${signatureLabel(column)})`);
  for (const mpn of line.mpns) {
    // A word where a part number belongs ("TRANSFORMER", "HEATSINK"): a custom or undecided part no distributor sells.
    if (!/\d/.test(mpn) && /[A-Z]{3}/i.test(mpn)) {
      add("GENERIC_MPN", `"${mpn}" is a name, not a maker's part number: a custom part (needs its drawing or specification) or one still to choose`);
      continue;
    }
    const d = decodeMpn(mpn);
    if (!d) {
      const family = damagedLike(mpn);
      if (family) add("MPN_UNREADABLE", `${mpn} starts like a ${family} but is not a complete part number — characters may be missing`);
      continue;
    }
    const unit = UNIT_OF[d.kind];
    if (want.kind && want.kind !== d.kind) {
      add("MPN_VALUE_MISMATCH", `${mpn} is a ${d.kind}; the line describes a ${want.kind}`);
      continue;
    }
    if (wantValue !== undefined && differs(wantValue, d.value)) add("MPN_VALUE_MISMATCH", `the line says ${formatSi(wantValue, unit)}; ${mpn} is ${formatSi(d.value, unit)}`);
    if (want.voltage !== undefined && d.voltage !== undefined && d.voltage < want.voltage - 1e-9) add("MPN_VOLTAGE_LOW", `the line asks for ${want.voltage} V; ${mpn} is a ${d.voltage} V part`);
    if (want.package && d.size && want.package !== d.size) add("MPN_SIZE_MISMATCH", `the line says ${want.package}; ${mpn} is ${d.size}`);
    if (want.tolerance !== undefined && d.tolerancePct !== undefined && d.tolerancePct > want.tolerance + 1e-9) add("MPN_SPEC_DIFF", `the line asks for ±${want.tolerance} %; ${mpn} is ±${d.tolerancePct} %`);
    if (want.dielectric && d.dielectric && (DIELECTRIC_RANK[d.dielectric] ?? 0) < (DIELECTRIC_RANK[want.dielectric] ?? 0)) add("MPN_SPEC_DIFF", `the line asks for ${want.dielectric}; ${mpn} is ${d.dielectric}`);
  }
  return out;
}

/** Stored on the line as "CODE: what is wrong", so the screen can say which numbers disagree. */
export const checkToIssue = (c: LineCheck) => `${c.code}: ${c.detail}`;
