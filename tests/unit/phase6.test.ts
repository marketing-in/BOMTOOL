import { describe, expect, it } from "vitest";
import { diffRevisions, type DiffLine } from "@/lib/bom/diff";
import { bodyFor, packageFromFootprint } from "@/lib/board/bodies";
import { boardFits, ENCLOSURES } from "@/lib/board/enclosures";

const L = (id: string, refDes: string | null, mpn: string | null, qty: number, dnp = false, description: string | null = null): DiffLine => ({ id, refDes, mpn, qtyPerBoard: qty, dnp, description });

describe("revision diff", () => {
  it("groups designator changes", () => {
    const a = [L("a1", "C1-C4", "GRM188R71H104KA93D", 4), L("a2", "U1", "LM358DR", 1), L("a3", "R1, R2", "RC0603FR-0710KL", 2), L("a4", "J9", "OLD-CONN", 1)];
    const b = [
      L("b1", "C1-C3", "GRM188R71H104KA93D", 3),
      L("b5", "C4", "CL10B104KB8NNNC", 1),
      L("b2", "U1", "lm358dr", 1),
      L("b3", "R1, R2", "RC0603FR-0710KL", 2, true),
      L("b6", "D9", "SMBJ24CA", 1),
    ];
    const { changes, summary } = diffRevisions(a, b);
    const kinds = changes.map((c) => `${c.kind}:${c.refs.join(",")}`).sort();
    expect(kinds).toEqual(["ADDED:D9", "DNP_CHANGED:R1,R2", "MPN_CHANGED:C4", "REMOVED:J9"]);
    expect(summary).toMatchObject({ added: 1, removed: 1, changed: 3, placementsFrom: 8, placementsTo: 6 });
  });

  it("compares designator-less lines by part", () => {
    const { changes } = diffRevisions([L("a", null, "X1", 1)], [L("b", null, "X2", 1)]);
    expect(changes.map((c) => c.kind).sort()).toEqual(["ADDED", "REMOVED"]);
  });
});

describe("3D bodies and enclosures", () => {
  it("sizes bodies from package data and category", () => {
    const mlcc = bodyFor({ family: "CHIP", lengthMm: 1.6, widthMm: 0.8, heightMm: 0.45 }, { category: "mlcc" });
    expect(mlcc).toMatchObject({ kind: "chip", color: "#b89466" });
    expect(mlcc.height).toBeCloseTo(0.64, 6);
    expect(bodyFor({ family: "QFP", pinCount: 48, pitchMm: 0.5, lengthMm: 7, widthMm: 7, heightMm: 1.4 }).kind).toBe("quad");
    expect(bodyFor(null, { category: "connector-usb" }).kind).toBe("connector");
  });
  it("maps CAD footprint names to packages", () => {
    const known = ["0603", "SOIC-8", "QFN-48", "SOT-23"];
    expect(packageFromFootprint("C_0603_1608Metric", known)).toBe("0603");
    expect(packageFromFootprint("Package_SO:SOIC-8_3.9x4.9mm_P1.27mm", known)).toBe("SOIC-8");
    expect(packageFromFootprint("weird", known)).toBeNull();
  });
  it("checks board fit in enclosures", () => {
    expect(boardFits(ENCLOSURES["1455N1601"], 100, 80).fits).toBe(true);
    expect(boardFits(ENCLOSURES["1590B"], 120, 90).fits).toBe(false);
  });
});
