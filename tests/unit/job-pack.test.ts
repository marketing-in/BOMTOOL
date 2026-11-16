import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { checkPackAgainstBom, notFittedRows, readJobPack, sideOfName } from "@/lib/bom/workbook";
import { autoMap, detectHeaderRow, headerConfidence } from "@/lib/bom/columns";
import { findBareBoard, mpnInText, scrubRows, splitMpns } from "@/lib/bom/scrub";
import { boardSpecLabel, isBareBoardLine, parseBoardSpec } from "@/lib/bom/bare-board";
import { capCode, damagedLike, decodeMpn, decodedLabel, nhCode, resCode, uhCode } from "@/lib/bom/mpn-decode";
import { checkLine } from "@/lib/bom/line-checks";
import { readIssue } from "@/lib/bom/issues";
import { parseDescription } from "@/lib/bom/describe";
import { Catalog, matchLine, type CatalogPart } from "@/lib/bom/match";
import { mapCentroidHeader, parseCentroid } from "@/lib/board/centroid";
import { matchFootprints, valueDiffers } from "@/lib/board/footprint-match";
import { sortBoardFiles } from "@/lib/board/upload";
import { expandRefDes } from "@/lib/refdes";
import { readSheets } from "@/lib/bom/parse";
import { bodyFromFootprint } from "@/lib/board/find-parts";
import { ARTICLES } from "@/knowledge";
import { CAM_NAMES } from "@/lib/board/cam-names";

/** A made-up job pack shaped like a real one: BoM, CAD placement report, load lists per side, not-fitted lists. */
const BOM = [
  ["SENSOR BOARD REV 2.0"],
  ["BOM"],
  ["SI.NO.", "ME-Code", "Part", "MFR P No", "Package", "Reference", "Quantity"],
  ["1", "ME10001", "CAPA,100PF,50V,SMD-0402,5%,COG/NPO,CER", "MC0402N101J500CT / 0402N11J5CT", "C_0402", "C1,C6", "2"],
  ["2", "ME10002", "CAP CER, 8.2PF, 50V, COG, 0402, SMD - MPN :CL05C8R2CB51PNC, MFG. : Samsung Electro-Mechanics", "GRM1555C1H8R2CA01D", "C_0402", "C2", "1"],
  ["3", "ME10003", "CAPA,0.1MICROF,50V,SMD-0402,X7R,CER", "GRM155R71H104KE14D/ 0402B104J100CT", "C_0402", "C3,C8", "2"],
  ["4", "ME10004", "CAP CER 220PF, 50V, 5%, C0G/NP0, 0402", "0402N221J500CT", "C_0402", "C5", "1"],
  ["5", "ME10005", "INDUCTOR, 47nH, 300mA, 0402, SMD - MPN. : LQG15HS47NJ02D, MFG. : Murata", "LQG15HS47NJ02D", "C_0402", "L1", "1"],
  ["6", "ME10006", "SENSOR IC, 100 – 900 KPA", "ABC739D01", "LGA24", "U1", "1"],
  ["7", "ME10007", "PCB, SENSOR BOARD, REV 2.0, FR4, Glass Epoxy, Green Mask, White Legend, 2Layer, 1.6mmT, 35micron,ENIG, RoHs, 17 x 15 Sq.mm", "", "", "", "1"],
];
const XY = [
  ["Placed Component Report"],
  ["D:/PCB/sensor/rev2/artwork/sensor.brd"],
  ["Total Placed Components: 9"],
  ["REFDES", "COMP_DEVICE_TYPE", "COMP_VALUE", "COMP_TOL", "SYM_NAME", "SYM_X", "SYM_Y", "SYM_ROTATE", "SYM_MIRROR"],
  ["C1", "CAP NP_0_C_0402_100PF", "100pF", "", "C_0402", "10.75", "13.7", "180", "NO"],
  ["C2", "CAP NP_0_C_0402_8.2PF", "8.2pF", "", "C_0402", "10.82", "11.66", "90", "NO"],
  ["C3", "CAP NP_0_C_0402_100NF", "100nF", "", "C_0402", "4.63", "10.95", "0", "NO"],
  ["CN1", "HEADER 4PIN", "BERG 4PIN", "", "BERG_4PIN_1_27MM", "13.75", "0.84", "180", "NO"],
  ["L1", "INDUCTOR_C_0402_47NH", "47nH", "", "C_0402", "9.87", "12.71", "270", "NO"],
  ["U1", "SENSOR_LGA24", "ABC739", "", "LGA24", "8.42", "7.49", "90", "NO"],
  ["C5", "CAP NP_0_C_0402_1.5NF", "1.5nF", "", "C_0402", "2.08", "4.19", "270", "YES"],
  ["C6", "CAP NP_0_C_0402_100PF", "100pF", "", "C_0402", "10.73", "8.14", "270", "YES"],
  ["C8", "CAP NP_0_C_0402_100NF", "100nF", "", "C_0402", "5.44", "11.03", "180", "YES"],
  ["R1", "RESISTOR_R_0402_DNL", "DNL", "", "R_0402", "1.04", "5.25", "90", "YES"],
];
const LOAD_HEAD = ["Item,Number", "Item,Description", "RefDes", "X", "Y", "R"];
const TOP_LOAD = [
  LOAD_HEAD,
  ["MC0402N101J500CT / 0402N11J5CT", "CAPA,100PF", "C1", "10.75", "13.7", "180"],
  ["GRM1555C1H8R2CA01D", "CAP CER, 8.2PF", "C2", "10.82", "11.66", "90"],
  ["GRM155R71H104KE14D/ 0402B104J100CT", "CAPA,0.1MICROF", "C3", "4.63", "10.95", "0"],
  ["LQG15HS47NJ02D", "INDUCTOR, 47nH", "L1", "9.87", "12.71", "270"],
  ["ABC739D01", "SENSOR IC", "U1", "8.42", "7.49", "90"],
];
const BOTTOM_LOAD = [
  LOAD_HEAD,
  ["0402N221J500CT", "CAP CER 220PF", "C5", "2.08", "4.19", "270"],
  ["MC0402N101J500CT / 0402N11J5CT", "CAPA,100PF", "C6", "10.73", "8.14", "270"],
  ["GRM155R71H104KE14D/ 0402B104J100CT", "CAPA,0.1MICROF", "C8", "5.44", "11.03", "180"],
];

function workbook(sheets: Record<string, string[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
const PACK = {
  "CUSTOMER BOM": BOM,
  XY,
  "MACRO BOM": [...TOP_LOAD, ...BOTTOM_LOAD.slice(1), [], ["", "", "C1", "NO"], ["", "", "CN1", "NO"]],
  "BOTTOM DNP": [["R1", "BOTTOM"]],
  "TOP DNP": [["CN1", "NO"]],
  "TOP LOAD": TOP_LOAD,
  "BOTTOM LOAD": BOTTOM_LOAD,
  Notes: [["Build 500 pieces"], ["Ship by Friday"]],
};

describe("reading a job pack", () => {
  const pack = readJobPack(workbook(PACK), "pack.xlsx");

  it("reads every sheet and says what each is", () => {
    expect(readSheets(workbook(PACK), "pack.xlsx").map((s) => s.name)).toHaveLength(8);
    const by = Object.fromEntries(pack.sheets.map((s) => [s.name, s]));
    expect(by["CUSTOMER BOM"]).toMatchObject({ kind: "bom", used: true, count: 7 });
    expect(by.XY).toMatchObject({ kind: "placement", used: true, count: 10 });
    expect(by["MACRO BOM"]).toMatchObject({ kind: "load-list", count: 8, side: null });
    expect(by["TOP LOAD"]).toMatchObject({ kind: "load-list", count: 5, side: "TOP" });
    expect(by["BOTTOM LOAD"]).toMatchObject({ kind: "load-list", count: 3, side: "BOTTOM" });
    expect(by["TOP DNP"]).toMatchObject({ kind: "not-fitted", count: 1, side: "TOP" });
    expect(by["BOTTOM DNP"]).toMatchObject({ kind: "not-fitted", count: 1, side: "BOTTOM" });
    expect(by.Notes).toMatchObject({ kind: "other", used: false });
  });

  it("takes the BoM from the sheet that reads like one, wherever it sits", () => {
    expect(pack.bomSheet).toBe("CUSTOMER BOM");
    const moved = readJobPack(workbook({ Notes: PACK.Notes, XY, "Parts": BOM }), "pack.xlsx");
    expect(moved.bomSheet).toBe("Parts");
    expect(moved.rows[2][3]).toBe("MFR P No");
  });

  it("takes the placements, with sides, from the CAD report", () => {
    expect(pack.placementSource).toBe("XY");
    expect(pack.placements).toHaveLength(10);
    expect(pack.placements.find((p) => p.refDes === "C5")).toMatchObject({ x: 2.08, y: 4.19, rotation: 270, side: "BOTTOM", footprint: "C_0402", value: "1.5nF" });
    expect(pack.placements.filter((p) => p.side === "BOTTOM").map((p) => p.refDes)).toEqual(["C5", "C6", "C8", "R1"]);
  });

  it("knows what is not fitted, from the lists and from the design values", () => {
    expect(pack.notFitted).toEqual([
      { refDes: "R1", side: "BOTTOM", why: "sheet “BOTTOM DNP”" },
      { refDes: "CN1", side: "TOP", why: "sheet “TOP DNP”" },
    ]);
    const noLists = readJobPack(workbook({ "CUSTOMER BOM": BOM, XY }), "pack.xlsx");
    expect(noLists.notFitted).toEqual([{ refDes: "R1", side: "BOTTOM", why: "value “DNL” in the design file" }]);
  });

  it("finds nothing wrong when the sheets agree", () => {
    expect(pack.findings).toEqual([]);
  });

  it("says where the sheets disagree", () => {
    const moved = TOP_LOAD.map((r) => (r[2] === "C2" ? [...r.slice(0, 3), "11.5", "11.66", "90"] : r));
    const wrongSide = [...BOTTOM_LOAD, ["LQG15HS47NJ02D", "INDUCTOR", "L1", "9.87", "12.71", "270"]];
    const bad = readJobPack(workbook({ ...PACK, "TOP LOAD": [...moved, ["X", "ghost", "C99", "1", "1", "0"]], "BOTTOM LOAD": wrongSide, "TOP DNP": [["CN1"], ["U1"]] }), "pack.xlsx");
    const text = bad.findings.map((f) => f.text).join(" | ");
    expect(text).toMatch(/“TOP LOAD” loads C99, which the placement report does not have/);
    expect(text).toMatch(/“TOP LOAD” places C2 at another position/);
    expect(text).toMatch(/“BOTTOM LOAD” lists L1, which the placement report has on the other side/);
    expect(text).toMatch(/not fitted and also in a load list: U1/);
  });

  it("builds placements from per-side load lists when there is no CAD report", () => {
    const lists = readJobPack(workbook({ "CUSTOMER BOM": BOM, "TOP LOAD": TOP_LOAD, "BOTTOM LOAD": BOTTOM_LOAD }), "pack.xlsx");
    expect(lists.placementSource).toBe("the load lists");
    expect(lists.placements).toHaveLength(8);
    expect(lists.placements.find((p) => p.refDes === "C8")?.side).toBe("BOTTOM");
    expect(lists.placements.find((p) => p.refDes === "U1")?.side).toBe("TOP");
  });

  it("reads a plain CSV as before: one table, nothing else", () => {
    const csv = new TextEncoder().encode("MPN,Qty,RefDes\nLM358DR,2,U1 U2\n");
    const one = readJobPack(csv, "bom.csv");
    expect(one.rows).toEqual([["MPN", "Qty", "RefDes"], ["LM358DR", "2", "U1 U2"]]);
    expect(one.sheets).toHaveLength(1);
    expect(one.placements).toEqual([]);
  });

  it("reads which side a sheet is about from its name", () => {
    expect(sideOfName("TOP LOAD")).toBe("TOP");
    expect(sideOfName("Bottom_DNP")).toBe("BOTTOM");
    expect(sideOfName("solder side parts")).toBe("BOTTOM");
    expect(sideOfName("MACRO BOM")).toBeNull();
    expect(sideOfName("top and bottom")).toBeNull();
  });
});

describe("the BoM sheet", () => {
  const pack = readJobPack(workbook(PACK), "pack.xlsx");
  const header = detectHeaderRow(pack.rows);
  const { mapping } = autoMap(pack.rows[header], pack.rows.slice(header + 1));

  it("maps the columns: house code, description, maker's part number", () => {
    expect(header).toBe(2);
    expect(mapping).toEqual([null, "customerPn", "description", "mpn", "package", "refDes", "qty"]);
    expect(headerConfidence("Sl. No.", "mpn")).toBe(0);
    expect(headerConfidence("Mfr. P/N", "mpn")).toBeGreaterThanOrEqual(75);
    expect(headerConfidence("Particulars", "description")).toBe(100);
    expect(headerConfidence("HSN Code", "customerPn")).toBe(0);
    // "Part" stays a value when its cells are values.
    expect(autoMap(["Part", "Qty", "Reference"], [["100nF", "2", "C1 C2"], ["10k", "1", "R1"]]).mapping).toEqual(["value", "qty", "refDes"]);
  });

  it("takes the first part number of a cell as the part and the rest as alternates", () => {
    expect(splitMpns("MC0402N101J500CT / 0402N11J5CT")).toEqual(["MC0402N101J500CT", "0402N11J5CT"]);
    expect(splitMpns("GRM155R71H104KE14D/ 0402B104J100CT")).toEqual(["GRM155R71H104KE14D", "0402B104J100CT"]);
    expect(splitMpns("LM317T/NOPB")).toEqual(["LM317T/NOPB"]);
    expect(splitMpns("BC847B; BC847C")).toEqual(["BC847B", "BC847C"]);
    expect(splitMpns("TPS5430DDAR / TI")).toEqual(["TPS5430DDAR"]);
    expect(splitMpns("n/a")).toEqual([]);
    expect(mpnInText("CAP CER, 8.2PF - MPN :CL05C8R2CB51PNC, MFG. : Samsung Electro-Mechanics")).toEqual({ mpn: "CL05C8R2CB51PNC", maker: "Samsung Electro-Mechanics" });
    expect(mpnInText("INDUCTOR, 47nH, SMD - MPN. : LQG15HS47NJ02D, MFG. : Murata")).toEqual({ mpn: "LQG15HS47NJ02D", maker: "Murata" });
    expect(mpnInText("RES 10k 1% 0402")).toEqual({ mpn: null, maker: null });
  });

  it("does not count the bare board as a component, and reads its spec", () => {
    const lines = scrubRows(pack.rows, header, mapping, new Map());
    expect(lines).toHaveLength(6);
    expect(lines.every((l) => l.refDes)).toBe(true);
    const bare = findBareBoard(pack.rows, header, mapping)!;
    expect(bare.customerPn).toBe("ME10007");
    expect(parseBoardSpec(bare.text)).toEqual({ layers: 2, sizeMm: [17, 15], thicknessMm: 1.6, copperOz: 1, finish: "ENIG", mask: "green", silk: "white", material: "FR-4", rohs: true });
    expect(boardSpecLabel(parseBoardSpec(bare.text))).toBe("2 layers · FR-4 · 1.6 mm · 1 oz copper · ENIG · green mask · white legend · 17 × 15 mm");
  });

  it("tells a board from a part sold for boards", () => {
    expect(isBareBoardLine("PCB, FR4, 4 Layer, 1.6mm, HASL", null)).toBe(true);
    expect(isBareBoardLine("Bare PCB", "")).toBe(true);
    expect(isBareBoardLine("PCB TERMINAL BLOCK 2 POS 5.08MM", null)).toBe(false);
    expect(isBareBoardLine("PCB mount relay 12V", null)).toBe(false);
    expect(isBareBoardLine("PCB, FR4, 2 Layer", "PCB1")).toBe(false);
    expect(parseBoardSpec("PWB 4L 1.0 mm thick, 2 oz, lead free HASL, black solder mask, 100 x 80 mm")).toMatchObject({ layers: 4, thicknessMm: 1, copperOz: 2, finish: "LF-HASL", mask: "black", sizeMm: [100, 80] });
  });

  it("turns designators that are on the board and not fitted into not-fitted lines", () => {
    const before = scrubRows(pack.rows, header, mapping, new Map());
    const extra = notFittedRows(pack, pack.rows[header], mapping, new Set(before.flatMap((l) => expandRefDes(l.refDes))));
    expect(extra).toEqual([
      ["", "", "Not fitted (sheet “BOTTOM DNP”)", "", "R_0402", "R1", "0"],
      ["", "", "Not fitted — BERG 4PIN (sheet “TOP DNP”)", "", "BERG_4PIN_1_27MM", "CN1", "0"],
    ]);
    const lines = scrubRows([...pack.rows, ...extra], header, mapping, new Map());
    const added = lines.filter((l) => l.dnp);
    expect(added.map((l) => l.refDes)).toEqual(["R1", "CN1"]);
    expect(added.every((l) => l.issues.length === 0)).toBe(true);
    expect(checkPackAgainstBom(pack, lines.map((l) => ({ refDes: l.refDes, mpn: l.mpn, dnp: l.dnp })))).toEqual([]);
  });

  it("checks the pack against the BoM's designators", () => {
    const lines = scrubRows(pack.rows, header, mapping, new Map()).map((l) => ({ refDes: l.refDes, mpn: l.mpn, dnp: l.dnp }));
    const text = (extra: typeof lines, drop: string[] = []) => checkPackAgainstBom(pack, [...lines.filter((l) => !drop.includes(l.refDes ?? "")), ...extra]).map((f) => f.text).join(" | ");
    expect(text([{ refDes: "C40", mpn: "X", dnp: false }])).toMatch(/On a BoM line but not in the placement data: C40/);
    expect(text([], ["U1"])).toMatch(/On the board, on no BoM line and not listed as not fitted: U1/);
    expect(text([{ refDes: "CN1", mpn: "HDR4", dnp: false }])).toMatch(/Listed as not fitted but on a fitted BoM line: CN1/);
    expect(text([{ refDes: "L1", mpn: "OTHER-PART-1", dnp: false }], ["L1"])).toMatch(/names another part than the BoM for L1/);
  });

  it("reads each line as an engineer would", () => {
    const lines = scrubRows(pack.rows, header, mapping, new Map());
    const by = Object.fromEntries(lines.map((l) => [l.refDes, l]));
    expect(by["C1,C6"]).toMatchObject({ mpn: "MC0402N101J500CT", altMpns: ["0402N11J5CT"], customerPn: "ME10001" });
    expect(by["C1,C6"].issues).toEqual(["MULTIPLE_MPN", "MPN_UNREADABLE: 0402N11J5CT starts like a Walsin ceramic capacitor but is not a complete part number — characters may be missing"]);
    // The description names a second source.
    expect(by.C2).toMatchObject({ mpn: "GRM1555C1H8R2CA01D", altMpns: ["CL05C8R2CB51PNC"], rawManufacturer: null });
    expect(by.C2.issues).toEqual(["MULTIPLE_MPN"]);
    // 50 V in the words, a 10 V part as the alternate.
    expect(by["C3,C8"].issues).toEqual(["MULTIPLE_MPN", "MPN_VOLTAGE_LOW: the line asks for 50 V; 0402B104J100CT is a 10 V part"]);
    expect(by.C5.issues).toEqual([]);
    expect(by.L1).toMatchObject({ rawManufacturer: "Murata", issues: [] });
    expect(by.U1.issues).toEqual([]);
  });
});

describe("reading a passive's part number", () => {
  it.each([
    ["GRM1555C1H8R2CA01D", "Murata", "8.2 pF · 50 V · C0G · 0402"],
    ["GRM155R71A104JA01D", "Murata", "100 nF · 10 V · X7R · ±5 % · 0402"],
    ["GRM188R71H104KA93D", "Murata", "100 nF · 50 V · X7R · ±10 % · 0603"],
    ["CL05C8R2CB51PNC", "Samsung Electro-Mechanics", "8.2 pF · 50 V · C0G · 0402"],
    ["CL05A105KO5NNNC", "Samsung Electro-Mechanics", "1 µF · 16 V · X5R · ±10 % · 0402"],
    ["CC0402KRX7R9BB104", "Yageo", "100 nF · 50 V · X7R · ±10 % · 0402"],
    ["C1005X7R1H104K050BB", "TDK", "100 nF · 50 V · X7R · ±10 % · 0402"],
    ["CGA2B2X7R1H104K050BA", "TDK", "100 nF · 50 V · X7R · ±10 % · 0402"],
    ["MC0402N101J500CT", "Walsin", "100 pF · 50 V · C0G · ±5 % · 0402"],
    ["0402B104J100CT", "Walsin", "100 nF · 10 V · X7R · ±5 % · 0402"],
    ["EMK105BJ105KV-F", "Taiyo Yuden", "1 µF · 16 V · X5R · ±10 % · 0402"],
    ["C0402C104K4RACTU", "Kemet", "100 nF · 16 V · X7R · ±10 % · 0402"],
    ["04025C104KAT2A", "Kyocera AVX", "100 nF · 50 V · X7R · ±10 % · 0402"],
    ["RC0402FR-0710KL", "Yageo", "10 kΩ · ±1 % · 0402"],
    ["RC0402JR-070RL", "Yageo", "0 Ω · ±5 % · 0402"],
    ["CRCW040210K0FKED", "Vishay", "10 kΩ · ±1 % · 0402"],
    ["ERJ-2RKF1002X", "Panasonic", "10 kΩ · ±1 % · 0402"],
    ["ERJ-2GEJ103X", "Panasonic", "10 kΩ · ±5 % · 0402"],
    ["RC1005F103CS", "Samsung Electro-Mechanics", "10 kΩ · ±1 % · 0402"],
    ["RK73H1ETTP1002F", "KOA", "10 kΩ · ±1 % · 0402"],
    ["LQG15HS47NJ02D", "Murata", "47 nH · ±5 % · 0402"],
    ["LQM21PN2R2MC0D", "Murata", "2.2 µH · ±20 % · 0805"],
    ["MLG1005S47NJT000", "TDK", "47 nH · ±5 % · 0402"],
  ])("%s", (mpn, maker, label) => {
    const d = decodeMpn(mpn)!;
    expect(d.maker).toBe(maker);
    expect(decodedLabel(d)).toBe(label);
  });

  it("leaves alone what it does not know, and spots a damaged number", () => {
    for (const mpn of ["LM358DR", "STM32F407VGT6", "1N4148W-7-F", "830069493", "", null]) expect(decodeMpn(mpn)).toBeNull();
    expect(damagedLike("0402N11J5CT")).toBe("Walsin ceramic capacitor");
    expect(damagedLike("M155R71A14JA1D")).toBe("Murata ceramic capacitor");
    expect(damagedLike("GRM155R71A104JA01D")).toBeNull();
    expect(damagedLike("LM358DR")).toBeNull();
  });

  it("reads the value codes", () => {
    expect(capCode("104")).toBeCloseTo(1e-7, 12);
    expect(capCode("8R2")).toBeCloseTo(8.2e-12, 15);
    expect(capCode("109")).toBeCloseTo(1e-12, 15);
    expect(resCode("103")).toBe(10000);
    expect(resCode("1002")).toBe(10000);
    expect(resCode("4K7")).toBe(4700);
    expect(resCode("4R7")).toBeCloseTo(4.7, 9);
    expect(resCode("0R")).toBe(0);
    expect(nhCode("4N7")).toBeCloseTo(4.7e-9, 15);
    expect(nhCode("R10")).toBeCloseTo(1e-7, 12);
    expect(uhCode("100")).toBeCloseTo(1e-5, 10);
    expect(uhCode("R47")).toBeCloseTo(4.7e-7, 12);
  });
});

describe("the part number against the words next to it", () => {
  const check = (mpns: string[], description: string, pkg: string | null = null) => checkLine({ mpns, description, value: null, package: pkg }).map((c) => c.code);

  it("passes a line whose part number says what the description says", () => {
    expect(check(["GRM188R71H104KA93D"], "CAP CER 100nF 50V X7R 10% 0603")).toEqual([]);
    expect(check(["GRM188R71H104KA93D"], "CAP 0.1uF 25V X7R 0603")).toEqual([]); // rated higher than asked: fine
    expect(check(["RC0402FR-0710KL"], "RES 10K 1% 0402")).toEqual([]);
    expect(check(["LM358DR"], "IC OPAMP DUAL SOIC-8")).toEqual([]);
  });

  it("flags another value, a lower voltage, another size, a wider tolerance", () => {
    expect(check(["GRM188R71H104KA93D"], "CAP CER 10nF 50V X7R 0603")).toEqual(["MPN_VALUE_MISMATCH"]);
    expect(check(["GRM155R71A104JA01D"], "CAP 100nF 50V X7R 0402")).toEqual(["MPN_VOLTAGE_LOW"]);
    expect(check(["GRM188R71H104KA93D"], "CAP 100nF 50V X7R", "C_0402")).toEqual(["MPN_SIZE_MISMATCH"]);
    expect(check(["GRM188R71H104KA93D"], "CAP 100nF 50V X7R 5% 0603")).toEqual(["MPN_SPEC_DIFF"]);
    expect(check(["CL05A105KO5NNNC"], "CAP 1uF 16V X7R 0402")).toEqual(["MPN_SPEC_DIFF"]);
    expect(check(["RC0402FR-0710KL"], "CAP 100nF 16V 0402")).toEqual(["MPN_VALUE_MISMATCH"]);
  });

  it("keeps the reason with the code", () => {
    const [issue] = checkLine({ mpns: ["GRM155R71A104JA01D"], description: "CAP 100nF 50V X7R 0402", value: null, package: null });
    expect(issue.detail).toBe("the line asks for 50 V; GRM155R71A104JA01D is a 10 V part");
    const read = readIssue(`${issue.code}: ${issue.detail}`);
    expect(read).toMatchObject({ code: "MPN_VOLTAGE_LOW", detail: issue.detail });
    expect(read.info?.level).toBe("red");
    expect(readIssue("MISSING_MPN")).toMatchObject({ code: "MISSING_MPN", detail: null });
  });

  it("reads units however the BoM types them", () => {
    expect(parseDescription("CAPA,100PF,50V,SMD-0402").capacitance).toBeCloseTo(1e-10, 15);
    expect(parseDescription("CAPA,0.1MICROF,50V").capacitance).toBeCloseTo(1e-7, 12);
    expect(parseDescription("CAP 4.7 MFD 25V").capacitance).toBeCloseTo(4.7e-6, 12);
    expect(parseDescription("FIXED INDUCTOR - 7.2MH 3%").inductance).toBeCloseTo(7.2e-3, 9);
    expect(parseDescription("IND 47NH 0402").inductance).toBeCloseTo(4.7e-8, 14);
  });
});

describe("alternates named on the line", () => {
  const part = (id: string, mpn: string): CatalogPart => ({ id, mpn, mpnNormalised: mpn.replace(/[^A-Z0-9]/gi, "").toUpperCase(), manufacturer: "Walsin", categorySlug: "mlcc", packageName: "0402", lifecycle: "ACTIVE", num: {}, text: {} });
  const catalog = new Catalog([part("p1", "0402B104J100CT")]);
  const line = scrubRows([["MPN", "Qty", "RefDes"], ["ZZ99-UNKNOWN-1 / 0402B104J100CT", "1", "C1"]], 0, ["mpn", "qty", "refDes"], new Map())[0];

  it("matches the line on its alternate when the first part number is not in the catalogue", () => {
    const m = matchLine(line, catalog);
    expect(m.selected?.partId).toBe("p1");
    expect(m.selected?.reason).toMatch(/^Alternate named on the line \(0402B104J100CT\)/);
  });
});

describe("placement files", () => {
  it("reads Cadence Allegro's placed component report", () => {
    expect(mapCentroidHeader(XY[3])).toMatchObject({ ref: 0, value: 2, footprint: 4, x: 5, y: 6, rot: 7, side: 8 });
    const { placements, unit } = parseCentroid(XY);
    expect(unit).toBe("mm");
    expect(placements).toHaveLength(10);
    expect(placements[0]).toEqual({ refDes: "C1", x: 10.75, y: 13.7, rotation: 180, side: "TOP", footprint: "C_0402", value: "100pF" });
    expect(placements.find((p) => p.refDes === "R1")?.side).toBe("BOTTOM");
  });

  it("reads headers that carry their unit, and a load list", () => {
    expect(mapCentroidHeader(["Designator", "Comment", "Layer", "Footprint", "Center-X(mm)", "Center-Y(mm)", "Rotation"])).toMatchObject({ ref: 0, x: 4, y: 5, rot: 6, side: 2 });
    expect(mapCentroidHeader(["Ref", "X (mil)", "Y (mil)", "Rot", "Side"])).toMatchObject({ ref: 0, x: 1, y: 2 });
    expect(mapCentroidHeader(LOAD_HEAD)).toMatchObject({ partNumber: 0, description: 1, ref: 2, x: 3, y: 4, rot: 5 });
  });

  it("takes a workbook with a placement sheet as the pick-and-place file among board files", () => {
    const sorted = sortBoardFiles([{ name: "job.xlsx", bytes: workbook({ Notes: PACK.Notes, XY }) }]);
    expect(sorted.centroid?.name).toBe("job.xlsx");
    expect(sortBoardFiles([{ name: "notes.xlsx", bytes: workbook({ Notes: PACK.Notes }) }]).centroid).toBeNull();
  });
});

describe("the BoM's value against the design file's", () => {
  it("says when they differ, and only then", () => {
    expect(valueDiffers("C5", "CAP CER 220PF, 50V, 5%, C0G/NP0, 0402", "1.5nF")).toBe("value: BoM 220 pF, design file 1.5 nF");
    expect(valueDiffers("L4", "FIXED INDUCTOR - 7.2MH 3%", "1.08mH")).toBe("value: BoM 7.2 mH, design file 1.08 mH");
    expect(valueDiffers("C3", "CAPA,0.1MICROF,50V,SMD-0402,X7R", "100nF")).toBeNull();
    expect(valueDiffers("C1", "CAPA,100PF,50V", "100pF")).toBeNull();
    expect(valueDiffers("R3", "RES 10K 1% 0402", "10k")).toBeNull();
    expect(valueDiffers("R3", "RES 10K 1% 0402", "4K7")).toBe("value: BoM 10 kΩ, design file 4.7 kΩ");
    expect(valueDiffers("R1", "RES 10K 1% 0402", "DNL")).toBeNull();
    expect(valueDiffers("U1", "SENSOR IC", "ABC739")).toBeNull();
    expect(valueDiffers("C9", "CAP 100n", "100n")).toBeNull();
  });

  it("turns a matching footprint with another value into one to check", () => {
    const m = matchFootprints(
      [
        { id: "a", lineNo: 1, refDes: "C1", pkg: "C_0402", mpn: "X", dnp: false, text: "CAP 100pF 50V" },
        { id: "b", lineNo: 2, refDes: "C5", pkg: "C_0402", mpn: "Y", dnp: false, text: "CAP CER 220PF, 50V" },
      ],
      [
        { refDes: "C1", footprint: "C_0402", x: 1, y: 1, side: "TOP", value: "100pF" },
        { refDes: "C5", footprint: "C_0402", x: 2, y: 2, side: "BOTTOM", value: "1.5nF" },
      ],
    );
    expect(m.valueDiffs).toBe(1);
    expect(m.level).toBe("amber");
    expect(m.counts).toMatchObject({ match: 1, check: 1 });
    expect(m.refs.find((r) => r.ref === "C5")?.why).toBe("0402 · value: BoM 220 pF, design file 1.5 nF");
    expect(m.summary).toMatch(/1 value differs from the design file/);
  });
});

describe("bodies for library names the catalogue does not know", () => {
  it("reads the size a crystal's name carries and the pad count of a leadless part", () => {
    expect(bodyFromFootprint("CRY_HCR2016", "crystal")).toMatchObject({ kind: "crystal", length: 2, width: 1.6 });
    expect(bodyFromFootprint("XTAL_3225_4P", "crystal")).toMatchObject({ length: 3.2, width: 2.5 });
    expect(bodyFromFootprint("LGA24", "chip")).toMatchObject({ kind: "leadless", length: 4, width: 4, pins: 24 });
    expect(bodyFromFootprint("QFN32", "chip")).toMatchObject({ kind: "leadless", pins: 32 });
    // A chip part's four digits are its imperial size, as before.
    expect(bodyFromFootprint("C_1210", "inductor")).toMatchObject({ kind: "chip", length: 3.2, width: 2.5 });
  });
});

describe("knowledge on reading a customer's files", () => {
  const by = Object.fromEntries(ARTICLES.map((a) => [a.slug, a]));

  it("has the three articles", () => {
    expect(by["reading-a-job-pack"]?.domain).toBe("PROCESS");
    expect(by["fabrication-file-names"]?.domain).toBe("PCB");
    expect(by["passive-part-numbers"]?.domain).toBe("COMPONENT");
  });

  it("shows the same layer names the reader uses", () => {
    const tables = by["fabrication-file-names"].sections.filter((s) => s.type === "table");
    for (const g of CAM_NAMES) {
      const t = tables.find((s) => s.heading.startsWith(g.tool));
      expect(t, g.tool).toBeDefined();
      const shown = t!.type === "table" ? t!.rows.flatMap((r) => r[0].split(", ")) : [];
      for (const name of Object.keys(g.names)) expect(shown, g.tool).toContain(g.where === "extension" ? `.${name.toUpperCase()}` : name);
    }
  });

  it("decodes every example part number it prints", () => {
    const tables = by["passive-part-numbers"].sections.filter((s) => s.type === "table" && s.columns.includes("Reads as"));
    expect(tables).toHaveLength(2);
    for (const t of tables) if (t.type === "table") for (const r of t.rows) expect(r[3], r[1]).toMatch(/[0-9]/);
  });
});
