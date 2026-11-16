import { describe, expect, it } from "vitest";
import { compare, matchFootprints, matchNote, signature, type MatchLineIn, type MatchPlacementIn } from "@/lib/board/footprint-match";

describe("reading a footprint name", () => {
  it("finds chip sizes in plain, KiCad and IPC-7351 names", () => {
    expect(signature("0603")).toEqual({ kind: "chip", size: "0603" });
    expect(signature("C_0603_1608Metric")).toEqual({ kind: "chip", size: "0603" });
    expect(signature("RESC1608X55N")).toEqual({ kind: "chip", size: "0603" });
    expect(signature("CAPC2012X100N")).toEqual({ kind: "chip", size: "0805" });
    expect(signature("R0402")).toEqual({ kind: "chip", size: "0402" });
  });

  it("finds the family and pin count of leaded and leadless ICs", () => {
    expect(signature("LQFP-48_7x7mm_P0.5mm")).toEqual({ kind: "leaded", family: "QFP", pins: 48 });
    expect(signature("TQFP-48")).toEqual({ kind: "leaded", family: "QFP", pins: 48 });
    expect(signature("SOIC-8_3.9x4.9mm_P1.27mm")).toEqual({ kind: "leaded", family: "SOIC", pins: 8 });
    expect(signature("SO-8")).toEqual({ kind: "leaded", family: "SOIC", pins: 8 });
    expect(signature("QFN-48 7x7")).toEqual({ kind: "leaded", family: "QFN", pins: 48 });
    expect(signature("VQFN-24")).toEqual({ kind: "leaded", family: "QFN", pins: 24 });
    expect(signature("UFQFPN-48")).toEqual({ kind: "leaded", family: "QFN", pins: 48 });
    expect(signature("TSSOP-20")).toEqual({ kind: "leaded", family: "TSSOP", pins: 20 });
    expect(signature("BGA-256")).toEqual({ kind: "leaded", family: "BGA", pins: 256 });
  });

  it("finds named outlines, and gives up on what it cannot read", () => {
    expect(signature("SOT-23")).toEqual({ kind: "named", name: "SOT-23" });
    expect(signature("SOT23-5")).toEqual({ kind: "named", name: "SOT-23-5" });
    expect(signature("TO-263 (D2PAK)")).toEqual({ kind: "named", name: "TO-263" });
    expect(signature("SMA (DO-214AC)")).toEqual({ kind: "named", name: "SMA" });
    expect(signature("Module")).toBeNull();
    expect(signature("")).toBeNull();
  });
});

describe("comparing the BoM's package with the board's footprint", () => {
  it("matches the same land pattern under different names", () => {
    expect(compare("0603", "C_0603_1608Metric").status).toBe("match");
    expect(compare("LQFP-48", "TQFP-48_7x7mm_P0.5mm").status).toBe("match");
    expect(compare("SOIC-8", "SO-8").status).toBe("match");
    expect(compare("ESP32-WROOM-32", "ESP32-WROOM-32E").status).toBe("match");
  });

  it("flags different sizes, pin counts and kinds", () => {
    expect(compare("0603", "C_0805_2012Metric")).toEqual({ status: "mismatch", why: "BoM 0603, board 0805" });
    expect(compare("QFN-48", "QFN-32").status).toBe("mismatch");
    expect(compare("SOIC-8", "TSSOP-8").status).toBe("mismatch");
    expect(compare("SOT-23", "0603").status).toBe("mismatch");
  });

  it("asks for a look when one side says nothing readable", () => {
    expect(compare(null, "0603")).toEqual({ status: "check", why: "the BoM line names no package" });
    expect(compare("0603", null).status).toBe("check");
    expect(compare("Module", "XYZ-CUSTOM").status).toBe("check");
  });
});

const line = (lineNo: number, refDes: string, pkg: string | null, o: Partial<MatchLineIn> = {}): MatchLineIn => ({ id: `l${lineNo}`, lineNo, refDes, pkg, mpn: `MPN${lineNo}`, dnp: false, ...o });
const at = (refDes: string, footprint: string | null, o: Partial<MatchPlacementIn> = {}): MatchPlacementIn => ({ refDes, footprint, x: 10, y: 10, side: "TOP", ...o });

describe("matching a BoM against a board", () => {
  it("is green when every designator has the same footprint on both sides", () => {
    const m = matchFootprints([line(1, "R1-R3", "0603"), line(2, "U1", "SOIC-8")], [at("R1", "R_0603"), at("R2", "R_0603"), at("R3", "R_0603"), at("U1", "SOIC-8_3.9x4.9mm")]);
    expect(m.level).toBe("green");
    expect(m.counts.match).toBe(4);
    expect(m.title).toBe("BoM and board match");
    expect(matchNote(m)).toBe("4 of 4 footprints match");
  });

  it("is red for a wrong footprint, a designator missing on the board, and a placed part with no BoM line", () => {
    const m = matchFootprints([line(1, "R1, R2", "0603"), line(2, "U1", "QFN-48"), line(3, "C9", "0402")], [at("R1", "R_0603"), at("R2", "R_0805"), at("U1", "QFN-48"), at("J7", "USB-C")]);
    expect(m.level).toBe("red");
    expect(m.counts).toEqual({ match: 2, mismatch: 1, check: 0, "not-on-board": 1, "not-in-bom": 1 });
    expect(m.refs.find((r) => r.ref === "R2")).toMatchObject({ status: "mismatch", why: "BoM 0603, board 0805", lineNo: 1 });
    expect(m.refs.find((r) => r.ref === "C9")?.status).toBe("not-on-board");
    expect(m.refs.find((r) => r.ref === "J7")?.status).toBe("not-in-bom");
    expect(matchNote(m)).toBe("3 designators do not match the board");
  });

  it("is amber when the only doubts are names it cannot read", () => {
    const m = matchFootprints([line(1, "R1", "0603"), line(2, "U9", null)], [at("R1", "0603"), at("U9", "QFN-24")]);
    expect(m.level).toBe("amber");
    expect(m.counts.check).toBe(1);
    expect(matchNote(m)).toBe("1 to check by eye");
  });

  it("leaves DNP lines out, on both sides", () => {
    const m = matchFootprints([line(1, "R1", "0603"), line(2, "R9", "0603", { dnp: true })], [at("R1", "0603"), at("R9", "0603")]);
    expect(m.level).toBe("green");
    expect(m.total).toBe(1);
  });

  it("says so when there is no board to compare with", () => {
    const m = matchFootprints([line(1, "R1-R4", "0603")], []);
    expect(m).toMatchObject({ level: "amber", hasBoard: false, total: 0 });
    expect(m.summary).toMatch(/4 designators/);
    expect(matchNote(m)).toBe("Add Gerbers to check the footprints");
  });
});
