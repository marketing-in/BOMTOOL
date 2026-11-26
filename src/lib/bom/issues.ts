import type { RiskLevel } from "@/lib/risk";

export const ISSUE_INFO: Record<string, { label: string; level: RiskLevel; help: string }> = {
  MISSING_MPN: { label: "No MPN", level: "amber", help: "Matched from the description — confirm the part." },
  MISSING_QTY: { label: "No qty", level: "red", help: "Neither a quantity nor designators were given." },
  QTY_FROM_REFDES: { label: "Qty from RefDes", level: "amber", help: "Quantity was blank; counted the designators instead." },
  QTY_REFDES_MISMATCH: { label: "Qty ≠ RefDes", level: "amber", help: "Quantity differs from the number of designators — ask the customer which is right." },
  UNKNOWN_MANUFACTURER: { label: "Unknown mfr", level: "amber", help: "Manufacturer name is not in our alias table." },
  DUPLICATE_MPN: { label: "Duplicate MPN", level: "amber", help: "The same MPN appears on more than one line — consider merging." },
  MULTIPLE_MPN: { label: "Alternates named", level: "green", help: "The line names more than one part number (in the cell, the description or an alternates column). The first is the part; the others are tried as alternates." },
  MPN_UNREADABLE: { label: "MPN incomplete", level: "amber", help: "A part number on this line starts like a known series but is not a whole part number — check for missing characters." },
  MPN_VALUE_MISMATCH: { label: "MPN ≠ value", level: "red", help: "The part number is a different value from the description. Ask which is right before buying." },
  MPN_VOLTAGE_LOW: { label: "MPN voltage low", level: "red", help: "The part number is rated below the voltage the description asks for." },
  MPN_SIZE_MISMATCH: { label: "MPN ≠ size", level: "red", help: "The part number is a different case size from the line's package." },
  MPN_SPEC_DIFF: { label: "MPN spec differs", level: "amber", help: "The part number has a wider tolerance or a lesser dielectric than the description asks for." },
  PACKAGE_CONFLICT: { label: "Package conflict", level: "red", help: "The description names one package and the package column another: one of them is not the part that fits the board. Ask which is right." },
  GENERIC_MPN: { label: "No maker part number", level: "amber", help: "The part number is a name (\"TRANSFORMER\"), not a maker's part number: a custom part needs its drawing or specification, and no distributor sells it." },
};

/** An issue as stored: a code, or "CODE: what is wrong" (src/lib/bom/line-checks.ts). */
export function readIssue(stored: string): { code: string; detail: string | null; info: (typeof ISSUE_INFO)[string] | null } {
  const at = stored.indexOf(": ");
  const code = at > 0 ? stored.slice(0, at) : stored;
  return { code, detail: at > 0 ? stored.slice(at + 2) : null, info: ISSUE_INFO[code] ?? null };
}
