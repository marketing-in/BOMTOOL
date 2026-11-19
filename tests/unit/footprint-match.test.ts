import { describe, expect, it } from "vitest";
import { checkValue, compare, footprintKind, matchFootprints, matchHeldNote, matchNote, signature, type MatchLineIn, type MatchPlacementIn } from "@/lib/board/footprint-match";
import { findMismatches } from "@/lib/bom/mismatch";

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

/** The TYPE7 TPMS board as uploaded (BoMs fdgd / nbbv / ng / k): the customer's XY report carries a value per designator. */
const TYPE7_LINES: MatchLineIn[] = [
  line(1, "C1,C6", "C_0402", { mpn: "GRM1555C1H101JA01D", rawMpn: "MC0402N101J500CT / 0402N11J5CT", catalogPkg: "0402", description: "CAPA,100PF,50V,SMD-0402,5%,COG/NPO,CER,VISHAY/KEMET" }),
  line(2, "C2", "C_0402", { mpn: "GRM1555C1H8R2CA01D", description: "CAP CER, 8.2PF, 50V, COG, 0402, SMD - MPN :CL05C8R2CB51PNC, MFG. : Samsung Electro-Mechanics" }),
  line(3, "C3,C8,C9", "C_0402", { mpn: "M155R71A14JA1D/ 0402B104J100CT", description: "CAPA,0.1MICROF,50V,SMD-0402,X7R,CER,VISHAY/KEMET" }),
  line(4, "C4,C7", "C_0402", { mpn: "CL05A105KA5NQNC", rawMpn: "EMK105BJ105KV-F / 0402X105K160CT", catalogPkg: "0402", description: "CAP CER,1µF, 16V, SMD,10%,X5R, 0402" }),
  line(5, "C5", "C_0402", { mpn: "0402N221J500CT", description: "CAP CER 220PF, 50V, 5%, C0G/NP0, 0402" }),
  line(6, "L1", "C_0402", { mpn: "LQG15HS47NJ02D", description: "INDUCTOR, 47nH, 300mA, 0402, SMD - MPN. : LQG15HS47NJ02D, MFG. : Murata" }),
  line(7, "L2", "C_0402", { mpn: "LQG15HS56NJ02D", description: "INDUCTOR, 56nH, 2500mA, 0402, SMD, MPN. : LQG15HS56NJ02D, MFG : Murata" }),
  line(8, "L4", "C_1210", { mpn: "1143AA-722J=P3", description: "FIXED INDUCTOR - 7.2MH 3% TRANSPNDR COIL - AEC-Q200" }),
  line(9, "U1", "LGA24", { mpn: "SNP739D01CLE", description: "TPMS SENSOR IC, 100 – 900 KPA (MPN : SNP739D01CLE : PUID: 70-030-1423)" }),
  line(10, "Y1", "CRY_HCR2016", { mpn: "830069493", description: "CRYSTAL, 10PF, 24 MHZ, 15 PPM, SMD" }),
  line(11, "BT1", "TPMS_BAT-1", { mpn: null, dnp: true, description: "Not fitted — BAT 3V" }),
  line(12, "L3", "C_0402", { mpn: null, dnp: true, description: "Not fitted" }),
];
const TYPE7_XY: MatchPlacementIn[] = (
  [
    ["C1", "C_0402", "100pF"], ["C2", "C_0402", "8.2pF"], ["C3", "C_0402", "100nF"], ["C4", "C_0402", "1uF"], ["C5", "C_0402", "1.5nF"], ["C6", "C_0402", "100pF"],
    ["C7", "C_0402", "1uF"], ["C8", "C_0402", "100nF"], ["C9", "C_0402", "100nF"], ["L1", "C_0402", "47nH"], ["L2", "C_0402", "56nH"], ["L3", "C_0402", "NC"],
    ["L4", "C_1210", "1.08mH"], ["U1", "LGA24", "SNP739"], ["Y1", "CRY_HCR2016", "24MHZ"], ["BT1", "TPMS_BAT-1", "BAT 3V"],
  ] as const
).map(([refDes, footprint, value]) => at(refDes, footprint, { value }));

describe("values: a wrong value on the board is a mismatch, like a wrong footprint", () => {
  const m = matchFootprints(TYPE7_LINES, TYPE7_XY);
  const r = (ref: string) => m.refs.find((x) => x.ref === ref)!;

  it("stops on C5: 220 pF in the BoM, 1.5 nF on the board", () => {
    expect(r("C5")).toMatchObject({ status: "mismatch", why: "value: BoM 220 pF, board 1.5 nF" });
    expect(m.level).toBe("red");
  });

  it("stops on L4 and names the value and the footprint", () => {
    expect(r("L4")).toMatchObject({ status: "mismatch", why: "value: BoM 7.2 mH, board 1.08 mH · footprint named for a capacitor on an inductor" });
  });

  it("asks for a look at inductors on capacitor-named footprints, without stopping", () => {
    expect(r("L1")).toMatchObject({ status: "check", why: "footprint named for a capacitor on an inductor" });
    expect(r("L2").status).toBe("check");
  });

  it("passes the rest in whatever notation each side writes", () => {
    for (const ref of ["C1", "C2", "C3", "C4", "C6", "C7", "C8", "C9", "Y1", "U1"]) expect(r(ref).status, ref).toBe("match");
    expect(m.counts).toEqual({ match: 10, mismatch: 2, check: 2, "not-on-board": 0, "not-in-bom": 0 });
    expect(m.valueDiffs).toBe(2);
    expect(m.valuesChecked).toBe(14);
  });

  it("says that values are what is wrong", () => {
    expect(m.summary).toBe("10 of 14 designators match. 2 values differ between the BoM and the board · 2 to check by eye. 12 of the 14 values both name agree.");
    expect(matchNote(m)).toBe("2 values do not match the board");
    expect(matchHeldNote(m)).toBe("Fix the values first");
  });

  it("keeps each side's value with the designator, for the tables and the card", () => {
    expect(r("C5").values).toEqual({ bom: "220 pF", board: "1.5 nF", same: false });
    expect(r("C3").values).toEqual({ bom: "100 nF", board: "100 nF", same: true });
    expect(r("U1").values).toEqual({ bom: "SNP739D01CLE", board: "SNP739", same: true });
    expect(r("L3")).toBeUndefined();
  });

  it("files C5 and L4 under red wrong values, and L4 under the footprints to confirm too", () => {
    const mm = findMismatches(m, []);
    const value = mm.groups.find((g) => g.key === "value")!;
    expect(value).toMatchObject({ title: "Value differs between BoM and board", level: "red" });
    expect(value.items.map((i) => [i.ref, i.detail])).toEqual([
      ["C5", "BoM 220 pF · board 1.5 nF"],
      ["L4", "BoM 7.2 mH · board 1.08 mH"],
    ]);
    const check = mm.groups.find((g) => g.key === "check")!;
    expect(check.level).toBe("amber");
    expect(check.items.map((i) => i.ref)).toEqual(["L1", "L2", "L4"]);
    expect(mm.level).toBe("red");
    expect(mm.groups[0].key).toBe("value");
    expect(mm.summary).toBe("5 mismatches in 2 groups: 2 values differ · 3 footprints to confirm by eye.");
  });
});

describe("values: no false alarms", () => {
  it("leaves placements without values as they were (GW-200's pick-and-place file has none)", () => {
    const m = matchFootprints(
      [line(1, "C1-C3", "0603", { description: "CAP CER 100nF 50V X7R 0603" }), line(2, "R1", "0603", { description: "RES 10k 1% 0603" }), line(3, "U1", "SOIC-8", { mpn: "TPS54331DR" })],
      [at("C1", "0603"), at("C2", "0603"), at("C3", "0603"), at("R1", "0603"), at("U1", "SOIC-8")],
    );
    expect(m.level).toBe("green");
    expect(m.valuesChecked).toBe(0);
    expect(m.summary).toBe("All 5 designators have the same footprint in the BoM and on the board.");
  });

  it("says nothing when the board value is not fitted, or either side cannot be read", () => {
    const m = matchFootprints(
      [line(1, "C1", "0402", { description: "CAP 100nF" }), line(2, "C2", "0402", { description: "CAP CER 50V X7R" }), line(3, "R1", "0402", { description: "RES 10K" })],
      [at("C1", "C_0402", { value: "DNP" }), at("C2", "C_0402", { value: "1uF" }), at("R1", "R_0402", { value: "CHIP_RES" })],
    );
    expect(m.counts.match).toBe(3);
  });

  it("reads the value cell before the description", () => {
    const m = matchFootprints([line(1, "R1", "0603", { value: "4K7", description: "RES 1% 0603 50V" })], [at("R1", "R_0603", { value: "4.7k" })]);
    expect(m.refs[0].status).toBe("match");
  });

  it("names both when the footprint and the value are wrong", () => {
    const m = matchFootprints([line(1, "R1", "0603", { description: "RES 10K 1% 0603" })], [at("R1", "R_0805", { value: "4K7" })]);
    expect(m.refs[0]).toMatchObject({ status: "mismatch", why: "BoM 0603, board 0805 · value: BoM 10 kΩ, board 4.7 kΩ" });
    const mm = findMismatches(m, []);
    expect(mm.groups.map((g) => g.key)).toEqual(["footprint", "value"]);
    expect(matchNote(m)).toBe("1 designator does not match the board, 1 by value");
    expect(matchHeldNote(m)).toBe("Fix the footprints and values first");
    expect(findMismatches(m, []).summary).toBe("2 mismatches in 2 groups: 1 footprint differs · 1 value differs.");
  });

  it("names what to fix first for footprints alone and for missing designators", () => {
    const fp = matchFootprints([line(1, "R1", "0603", { description: "RES 10K" })], [at("R1", "R_0805", { value: "10K" })]);
    expect(matchHeldNote(fp)).toBe("Fix the footprints first");
    const gone = matchFootprints([line(1, "R1", "0603"), line(2, "C1", "0402", { description: "CAP 100nF" })], [at("C1", "C_0402", { value: "1uF" }), at("J1", "USB-C")]);
    expect(matchHeldNote(gone)).toBe("Fix the values and missing designators first");
  });

  it("takes a milli/mega slip as one to confirm, not a stop", () => {
    const m = matchFootprints([line(1, "R7", "1206", { value: "10m", description: "RES 10 mOhm 1% 1206" })], [at("R7", "R_1206", { value: "10M" })]);
    expect(m.refs[0]).toMatchObject({ status: "check", why: "value to confirm: BoM 10 mΩ, board 10 MΩ (milli or mega?)" });
    expect(m.valueDiffs).toBe(0);
    expect(m.level).toBe("amber");
    expect(findMismatches(m, []).groups).toMatchObject([{ key: "value", level: "amber" }]);
  });

  it("does not stop on a spaced voltage, power, tolerance or temperature in a resistor's description", () => {
    const descs = ["RES SMD 0603 1/10 W 1 % 10K", "RES 50 V 10K 0603", "RES 1% 0.1 W 10K", "RES -55 TO 155 C 10K", "RES 100 PPM 10K 0603", "RES 200 mW 10K", "RES 125 °C 10K"];
    for (const d of descs) expect(checkValue("R1", { mpn: null, description: d }, "10K"), d).toBeNull();
    expect(checkValue("R1", { mpn: null, value: "1 %", description: "RES 10K 1%" }, "10K")).toBeNull();
    expect(checkValue("R1", { mpn: null, value: "1", description: "RES 10K 1%" }, "10K")).toBeNull();
    expect(checkValue("R1", { mpn: null, value: "1005", description: "RES 10K 1%" }, "10K")).toBeNull();
    // A real difference behind the same noise is still a stop.
    expect(checkValue("R1", { mpn: null, description: "RES 50 V 10K 0603" }, "4K7")).toMatchObject({ level: "mismatch", text: "value: BoM 10 kΩ, board 4.7 kΩ" });
  });

  it("reads a resistor code as either the plain number or the EIA code", () => {
    expect(checkValue("R5", { mpn: null, description: "RES 10K" }, "103")).toBeNull();
    expect(checkValue("R5", { mpn: null, description: "RES 4.7K" }, "472")).toBeNull();
    expect(checkValue("R5", { mpn: null, value: "1002", description: "RES" }, "10K")).toBeNull();
    expect(checkValue("R5", { mpn: null, description: "RES 4K7" }, "103")?.level).toBe("mismatch");
  });

  it("checks crystals, fuses and ferrite beads by their own quantity", () => {
    const m = matchFootprints(
      [line(1, "Y1", "3225", { description: "XTAL 16MHz 18pF 20ppm" }), line(2, "F1", "1206", { description: "FUSE 2A 32V FAST" }), line(3, "FB1", "0603", { description: "Ferrite 600R@100MHz 1A" }), line(4, "Y2", "3225", { description: "XTAL 25MHz" })],
      [at("Y1", "XTAL_3225", { value: "16.000MHz" }), at("F1", "F_1206", { value: "1A" }), at("FB1", "L_0603", { value: "600R@100MHz" }), at("Y2", "XTAL_3225", { value: "24M" })],
    );
    const s = Object.fromEntries(m.refs.map((r) => [r.ref, r.status]));
    expect(s).toEqual({ Y1: "match", F1: "mismatch", FB1: "match", Y2: "mismatch" });
    expect(m.refs.find((r) => r.ref === "F1")!.why).toBe("value: BoM 2 A, board 1 A");
  });

  it("takes a resettable fuse's hold or trip current, a bead's bare ohms, and a crystal on Q", () => {
    expect(checkValue("F1", { mpn: null, description: "PTC RESETTABLE 0.5A HOLD 1A TRIP 6V" }, "1A")).toBeNull();
    expect(checkValue("F1", { mpn: null, description: "PTC RESETTABLE 0.5A HOLD 1A TRIP 6V" }, "500mA")).toBeNull();
    expect(checkValue("F1", { mpn: null, description: "PTC RESETTABLE 0.5A HOLD 1A TRIP 6V" }, "2A")?.level).toBe("mismatch");
    expect(checkValue("FB1", { mpn: null, description: "FERRITE BEAD 0.15 OHM DCR 600 OHM" }, "600R")).toBeNull();
    expect(checkValue("FB1", { mpn: null, description: "FERRITE 120R@100MHz 1A" }, "120")).toBeNull();
    expect(checkValue("Q1", { mpn: null, description: "CRYSTAL 16MHz 18pF" }, "16MHz")).toBeNull();
    expect(checkValue("Q1", { mpn: null, description: "CRYSTAL 16MHz 18pF" }, "12MHz")?.text).toBe("value: BoM 16 MHz, board 12 MHz");
  });

  it("reads X as a crystal only when the BoM line says so", () => {
    expect(checkValue("X1", { mpn: null, description: "CONNECTOR 4 POS 2.5M CABLE" }, "4M")).toBeNull();
    expect(checkValue("X1", { mpn: null, description: "CRYSTAL 16MHz 18pF" }, "12MHz")?.level).toBe("mismatch");
  });

  it("only asks about a part name that clearly differs, never stops on it", () => {
    const m = matchFootprints(
      [line(1, "U1", "SOIC-8", { mpn: "LM358DR" }), line(2, "U2", "SOIC-8", { mpn: "NE555DR" }), line(3, "U3", "SOT-23-5", { mpn: "AP2112K-3.3TRG1" })],
      [at("U1", "SOIC-8", { value: "LM358" }), at("U2", "SOIC-8", { value: "LM358" }), at("U3", "SOT-23-5", { value: "LDO_3V3" })],
    );
    const s = Object.fromEntries(m.refs.map((r) => [r.ref, [r.status, r.why]]));
    expect(s.U1[0]).toBe("match");
    expect(s.U2).toEqual(["check", "part: BoM NE555DR, board LM358"]);
    expect(s.U3[0]).toBe("match");
    expect(findMismatches(m, []).groups.map((g) => [g.key, g.level])).toEqual([["part", "amber"]]);
  });

  it("accepts the CAD conventions for the same part", () => {
    const same: [string, string][] = [["STM32F103C8T6", "STM32F103C8Tx"], ["STM32G431CBU6", "STM32G431CBUx"], ["LM1117IMPX-3.3/NOPB", "LM1117-3.3"], ["LM1117MPX-3.3/NOPB", "LM1117-3.3"], ["TLV70033DDCT", "TLV70033DDCR"]];
    for (const [mpn, board] of same) expect(checkValue("U1", { mpn }, board), board).toBeNull();
    // The customer's own part number on the board is that part.
    expect(checkValue("U1", { mpn: "LM358DR", customerPn: "ME10246" }, "ME10246")).toBeNull();
    for (const [mpn, board] of [["STM32F103C8T6", "STM32F103CBT6"], ["AMS1117-5.0", "AMS1117-3.3"], ["NE555DR", "LM358"]]) expect(checkValue("U1", { mpn }, board)?.level, board).toBe("check");
  });
});

describe("footprint names for another kind of part", () => {
  it("reads the kind a library name is for", () => {
    expect(footprintKind("C_0402_1005Metric")).toBe("capacitor");
    expect(footprintKind("CAPC1005X55N")).toBe("capacitor");
    expect(footprintKind("R_0603")).toBe("resistor");
    expect(footprintKind("RESC1608X55N")).toBe("resistor");
    expect(footprintKind("IND_7MH2-1")).toBe("inductor");
    expect(footprintKind("L_0805")).toBe("inductor");
    for (const f of ["CONN", "CRY_HCR2016", "LGA24", "LED_0603", "RJ45", "0402", null]) expect(footprintKind(f), String(f)).toBeNull();
  });

  it("asks for a look, amber only, for R on C_, C on R_, and C or R on L_", () => {
    const m = matchFootprints(
      [line(1, "R1", "0402"), line(2, "C1", "0402"), line(3, "C2", "0402"), line(4, "R2", "0402"), line(5, "L1", "0402"), line(6, "C3", "0402")],
      [at("R1", "C_0402"), at("C1", "R_0402"), at("C2", "L_0402"), at("R2", "R_0402"), at("L1", "L_0402"), at("C3", "C_0402")],
    );
    const s = Object.fromEntries(m.refs.map((r) => [r.ref, r.status]));
    expect(s).toEqual({ R1: "check", C1: "check", C2: "check", R2: "match", L1: "match", C3: "match" });
    expect(m.refs[0].why).toBe("footprint named for a capacitor on a resistor");
    expect(m.level).toBe("amber");
  });
});

describe("the catalogue's package against the board, on its own", () => {
  it("stops when the matched part's package disagrees with the footprint, even if the BoM column agrees", () => {
    const m = matchFootprints([line(1, "L4", "C_1210", { mpn: "1143AA-722J", catalogPkg: "SMD 11.5x3.5 (2-pad)" }), line(2, "C1", "C_1210", { mpn: "GRM32ER71H106KA12L", catalogPkg: "0603" })], [at("L4", "C_1210"), at("C1", "C_1210")]);
    expect(m.refs[0].status).toBe("check");
    expect(m.refs[1]).toMatchObject({ status: "mismatch", why: "footprint 1210, catalogue part GRM32ER71H106KA12L is 0603" });
    expect(findMismatches(m, []).groups[0]).toMatchObject({ key: "footprint", items: [{ ref: "C1", detail: "board 1210 · catalogue part GRM32ER71H106KA12L is 0603" }] });
  });

  it("only asks to confirm when the catalogue match is still our own guess", () => {
    const m = matchFootprints([line(1, "U1", "DIP-8", { mpn: "LM358DR", catalogPkg: "SOIC-8", catalogConfirmed: false }), line(2, "U2", "DIP-8", { mpn: "LM358DR", catalogPkg: "SOIC-8", catalogConfirmed: true })], [at("U1", "DIP-8"), at("U2", "DIP-8")]);
    expect(m.refs[0]).toMatchObject({ status: "check", why: "the matched catalogue part LM358DR is SOIC-8, board DIP-8: confirm the match" });
    expect(m.refs[1]).toMatchObject({ status: "mismatch", why: "footprint DIP-8, catalogue part LM358DR is SOIC-8" });
    expect(findMismatches(m, []).groups.map((g) => [g.key, g.level, g.items.map((i) => i.ref)])).toEqual([["footprint", "red", ["U2"]], ["check", "amber", ["U1"]]]);
  });

  it("changes nothing when the catalogue has no package, agrees, or is what the BoM column already says", () => {
    const m = matchFootprints(
      [line(1, "C1", "0603", { catalogPkg: null }), line(2, "C2", "C_0603", { catalogPkg: "0603" }), /* no package column: the workflow falls back to the catalogue's */ line(3, "C3", "0603", { catalogPkg: "0603" }), line(4, "U1", "UFQFPN-48", { catalogPkg: "QFN-48" })],
      [at("C1", "0603"), at("C2", "C_0603"), at("C3", "0603"), at("U1", "QFN-48")],
    );
    expect(m.counts.match).toBe(4);
    // The BoM and catalogue say the same wrong thing: one footprint mismatch, not two.
    const w = matchFootprints([line(1, "C1", "0805", { catalogPkg: "0805" })], [at("C1", "C_0603")]);
    expect(w.refs[0].why).toBe("BoM 0805, board 0603");
  });
});
