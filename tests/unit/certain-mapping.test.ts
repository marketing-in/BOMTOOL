import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { strToU8, zipSync } from "fflate";
import { autoMap, detectHeaderRow } from "@/lib/bom/columns";
import { certainMapping, decidingColumns, type CertainInput } from "@/lib/bom/certain-mapping";
import { mappingProblem, missingFields, type ColumnMapping } from "@/lib/bom/fields";
import { boardAfter, routeFiles } from "@/lib/bom/route-files";
import { bomAmong, previewPack, readJobPack, summarisePack } from "@/lib/bom/workbook";
import { sortBoardFiles } from "@/lib/board/upload";
import { locate, neighbours } from "@/lib/bom/workflow";

function workbook(sheets: Record<string, string[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** Shaped like the customer's TYPE7 job pack: a BoM under a title block, the Cadence placement report, not-fitted lists. */
const TYPE7 = {
  "CUSTOMER BOM": [
    ["TYPE7 V1 SS BOARD"],
    ["BOM"],
    ["SI.NO.", "ME-Code", "Part", "MFR P No", "Package", "Reference", "Quantity"],
    ["1", "ME10001", "CAPA,100PF,50V,SMD-0402,5%,COG/NPO,CER", "MC0402N101J500CT / 0402N11J5CT", "C_0402", "C1,C6", "2"],
    ["2", "ME10002", "CAP CER 220PF, 50V, 5%, C0G/NP0, 0402", "0402N221J500CT", "C_0402", "C5", "1"],
    ["3", "ME10003", "INDUCTOR, 47nH, 300mA, 0402, SMD", "LQG15HS47NJ02D", "C_0402", "L1", "1"],
    ["4", "ME10004", "SENSOR IC, 100 – 900 KPA", "ABC739D01", "LGA24", "U1", "1"],
    ["5", "ME10005", "PCB, TYPE7 V1 SS BOARD, REV 3.0, FR4, Green Mask, White Legend, 2Layer, 1.6mmT, 35micron, ENIG, RoHs, 17 x 15 Sq.mm", "", "", "", "1"],
  ],
  XY: [
    ["Placed Component Report"],
    ["Total Placed Components: 7"],
    ["REFDES", "COMP_DEVICE_TYPE", "COMP_VALUE", "COMP_TOL", "SYM_NAME", "SYM_X", "SYM_Y", "SYM_ROTATE", "SYM_MIRROR"],
    ["C1", "CAP NP_0_C_0402_100PF", "100pF", "", "C_0402", "10.75", "13.7", "180", "NO"],
    ["C6", "CAP NP_0_C_0402_100PF", "100pF", "", "C_0402", "10.73", "8.14", "270", "YES"],
    ["C5", "CAP NP_0_C_0402_1.5NF", "1.5nF", "", "C_0402", "2.08", "4.19", "270", "YES"],
    ["L1", "INDUCTOR_C_0402_47NH", "47nH", "", "C_0402", "9.87", "12.71", "270", "NO"],
    ["U1", "SENSOR_LGA24", "ABC739", "", "LGA24", "8.42", "7.49", "90", "NO"],
    ["CN1", "HEADER 4PIN", "BERG 4PIN", "", "BERG_4PIN_1_27MM", "13.75", "0.84", "180", "NO"],
    ["R1", "RESISTOR_R_0402_DNL", "DNL", "", "R_0402", "1.04", "5.25", "90", "YES"],
  ],
  "TOP DNP": [["CN1", "NO"]],
  "BOTTOM DNP": [["R1", "BOTTOM"]],
};

/** The upload's own steps: read the pack, map automatically, add the not-fitted lines, then judge the columns. */
function judgePack(bytes: Uint8Array, name: string, extra: Partial<CertainInput> = {}) {
  const pack = readJobPack(bytes, name);
  const auto = autoMap(pack.rows[pack.headerRow], pack.rows.slice(pack.headerRow + 1));
  const { rows } = summarisePack(pack, { rows: pack.rows, headerRow: pack.headerRow, mapping: auto.mapping });
  return { pack, auto, rows, certainty: certainMapping({ rows, headerRow: pack.headerRow, mapping: auto.mapping, confidence: auto.confidence, bomFound: pack.bomFound, ...extra }) };
}

/** A plain table, judged as the upload would judge a CSV with this header. */
function judgeRows(rows: string[][], extra: Partial<CertainInput> = {}) {
  const headerRow = detectHeaderRow(rows);
  const auto = autoMap(rows[headerRow], rows.slice(headerRow + 1));
  return { auto, certainty: certainMapping({ rows, headerRow, mapping: auto.mapping, confidence: auto.confidence, bomFound: true, ...extra }) };
}

describe("columns the upload takes without the mapping page", () => {
  it("takes a TYPE7-shaped BoM straight to the footprint match", () => {
    const { pack, auto, rows, certainty } = judgePack(workbook(TYPE7), "TYPE7V1SS30-REV3 (1).xlsx");
    expect(pack.headerRow).toBe(2);
    expect(auto.mapping).toEqual([null, "customerPn", "description", "mpn", "package", "refDes", "qty"]);
    // "MFR P No" is a prefix of "mfrpn": exactly the lowest confidence that is not a guess.
    expect(auto.confidence[3]).toBe(75);
    expect(certainty).toEqual({ certain: true, via: "auto" });
    expect(decidingColumns(rows[pack.headerRow], auto.mapping)).toEqual(["MPN ← MFR P No", "RefDes ← Reference", "Qty ← Quantity"]);
    // The not-fitted designators were added as lines and do not upset the rule.
    expect(rows.length).toBe(pack.rows.length + 2);
  });

  it("tells the upload form the same, with the header's template signature", () => {
    const { columns } = previewPack(workbook(TYPE7), "TYPE7V1SS30-REV3 (1).xlsx");
    expect(columns).toEqual({ certain: true, signature: "sino|mecode|part|mfrpno|package|reference|quantity" });
  });

  it("asks when the part's name comes from a guessed header", () => {
    const rows = [
      ["Ref", "Qty", "Part", "Likely part number"],
      ["C1", "1", "Ceramic capacitor 100 nF 50 V X7R 0402", "GRM155R71H104KE14D"],
      ["R1", "1", "Thick film resistor 10 k 1% 0402", "RC0402FR-0710KL"],
      ["U1", "1", "Microcontroller 32-bit ARM QFN-32", "STM32G031K8U6"],
    ];
    const { auto, certainty } = judgeRows(rows);
    expect(auto.mapping).toContain("description");
    expect(auto.mapping).not.toContain("mpn");
    expect(certainty).toMatchObject({ certain: false });
    expect(certainty.certain ? "" : certainty.why).toMatch(/description column is a guess/);
  });

  it("takes a customer's saved template for the same header, as long as the mapping can be used", () => {
    const rows = [
      ["Ref", "Qty", "Part", "Likely part number"],
      ["C1", "1", "Ceramic capacitor 100 nF 50 V X7R 0402", "GRM155R71H104KE14D"],
    ];
    const saved: ColumnMapping = ["refDes", "qty", "description", "mpn"];
    expect(certainMapping({ rows, headerRow: 0, mapping: saved, confidence: [0, 0, 0, 0], bomFound: true, template: true })).toEqual({ certain: true, via: "template" });
    // A template that maps nothing to count by is still a question for a person.
    expect(certainMapping({ rows, headerRow: 0, mapping: [null, null, "description", "mpn"], confidence: [0, 0, 0, 0], bomFound: true, template: true })).toMatchObject({ certain: false });
    // A template made for another header width does not fit.
    expect(certainMapping({ rows, headerRow: 0, mapping: ["refDes", "qty", "mpn"], confidence: [0, 0, 0], bomFound: true, template: true })).toMatchObject({ certain: false });
  });

  it("accepts hierarchical designators while most cells still read like designators", () => {
    const head = ["Reference", "Quantity", "Description", "Manufacturer Part Number"];
    const line = (ref: string, i: number) => [ref, "1", `Capacitor ${i} nF 50 V 0402`, `GRM155R71H${100 + i}KE14D`];
    const most = ["C1", "C2", "C3", "R1", "R2", "R3", "U1", "AU1C3", "L1U1C232", "O1Q171"];
    expect(judgeRows([head, ...most.map(line)]).certainty).toEqual({ certain: true, via: "auto" });
    const half = ["C1", "C2", "C3", "R1", "AU1C3", "L1U1C232", "O1Q171", "GU1C220"];
    expect(judgeRows([head, ...half.map(line)]).certainty).toMatchObject({ certain: false, why: expect.stringMatching(/designator cells/) });
  });

  it("asks when no sheet read like a BoM and one was taken anyway", () => {
    const bytes = workbook({ Parts: [["Item", "Notes"], ["1", "see drawing"], ["2", "see drawing"]] });
    const { pack, certainty } = judgePack(bytes, "parts.xlsx");
    expect(pack.bomFound).toBe(false);
    expect(certainty).toMatchObject({ certain: false });
  });

  it("asks when another row reads almost as much like a header", () => {
    const rows = [
      ["Description", "Qty", "Reference", "MPN"],
      ["Desc", "Quantity", "Designator", "Manufacturer Part Number"],
      ["Capacitor 100 nF 50 V 0402", "1", "C1", "GRM155R71H104KE14D"],
    ];
    expect(judgeRows(rows).certainty).toMatchObject({ certain: false, why: expect.stringMatching(/header/) });
  });

  it("asks when a column left alone claims the designators as strongly", () => {
    const rows = [
      ["Reference", "Designator", "Qty", "MPN", "Description"],
      ["C1", "C1", "1", "GRM155R71H104KE14D", "Capacitor 100 nF"],
      ["R1", "R1", "1", "RC0402FR-0710KL", "Resistor 10 k"],
    ];
    expect(judgeRows(rows).certainty).toMatchObject({ certain: false, why: expect.stringMatching(/Designator/) });
  });

  it("asks when the quantities do not agree with the designators", () => {
    const rows = [
      ["Reference", "Qty", "MPN", "Description"],
      ["C1,C2", "1", "GRM155R71H104KE14D", "Capacitor 100 nF"],
      ["R1,R2,R3", "2", "RC0402FR-0710KL", "Resistor 10 k"],
      ["U1", "1", "STM32G031K8U6", "Microcontroller"],
    ];
    expect(judgeRows(rows).certainty).toMatchObject({ certain: false, why: expect.stringMatching(/designator counts/) });
  });

  it("asks for a BoM with no designators: there is nothing to check the footprints by", () => {
    const rows = [
      ["Qty", "MPN", "Description"],
      ["2", "GRM155R71H104KE14D", "Capacitor 100 nF"],
      ["3", "RC0402FR-0710KL", "Resistor 10 k"],
    ];
    expect(judgeRows(rows).certainty).toMatchObject({ certain: false, why: expect.stringMatching(/designator column/) });
  });
});

describe("one check for a mapping, wherever it is confirmed", () => {
  it("says what is missing and why a mapping cannot be used", () => {
    expect(missingFields(["refDes", null])).toEqual(["MPN, Description or Value"]);
    expect(missingFields(["mpn", null])).toEqual(["Qty or RefDes"]);
    expect(missingFields(["mpn", "qty"])).toEqual([]);
    expect(mappingProblem(["mpn", "mpn", "qty"])).toMatch(/one column/);
    expect(mappingProblem(["qty", null])).toMatch(/MPN, Description or Value/);
    expect(mappingProblem(["value", null])).toMatch(/Qty or RefDes/);
    expect(mappingProblem(["value", "refDes"])).toBeNull();
  });
});

// ── A fabricator's panel of two boards with extension-less layer names, as the TYPE7 Gerber zip comes.
const co = (mm: number) => String(Math.round(mm * 1e6));
const gerber = (layer: string, apertures: string[], body: string[]) => [`G04 -- layer:${layer}*`, "%FSLAX46Y46*%", "%MOMM*%", ...apertures, "G01*", "%LPD*%", ...body, "M02*", ""].join("\n");
const flash = (d: number, x: number, y: number) => [`D${d}*`, `X${co(x)}Y${co(y)}D03*`];
const box = (d: number, x: number, y: number, w: number, h: number) => [`D${d}*`, `X${co(x)}Y${co(y)}D02*`, `X${co(x + w)}Y${co(y)}D01*`, `X${co(x + w)}Y${co(y + h)}D01*`, `X${co(x)}Y${co(y + h)}D01*`, `X${co(x)}Y${co(y)}D01*`];
function panelZip(): Uint8Array {
  const boards = [0, 19];
  const pads = boards.flatMap((ox) => [4, 5, 9, 10].flatMap((x) => flash(10, ox + x, 5)));
  return zipSync({
    "GERBER TYPE7/tl": strToU8(gerber("tl", ["%ADD10R,0.6X0.5*%"], pads)),
    "GERBER TYPE7/ts": strToU8(gerber("ts", ["%ADD10R,0.7X0.6*%"], pads)),
    "GERBER TYPE7/ko": strToU8(gerber("ko", ["%ADD10C,0.15*%"], boards.flatMap((ox) => box(10, ox, 0, 17, 15)))),
  });
}

describe("the BoM and the Gerbers dropped together", () => {
  const xlsx = { name: "TYPE7V1SS30-REV3 (1).xlsx", bytes: workbook(TYPE7) };
  const zip = { name: "GERBER TYPE7V1SS30_Panel Geber (1) (1).zip", bytes: panelZip() };

  it("sends the workbook to the BoM and the zip to the board files, on either box and in either order", () => {
    for (const zone of ["bom", "board"] as const)
      for (const files of [[xlsx, zip], [zip, xlsx]]) expect(routeFiles(files, { zone, hasBom: false })).toEqual({ bom: xlsx, board: [zip] });
  });

  it("leaves a pick-and-place file and a drill file with the board files", () => {
    const files = [{ name: "GW200_PickPlace.csv" }, { name: "GW200.GTL" }, { name: "NC Drill.txt" }, { name: "TOP_XY.xlsx" }];
    expect(routeFiles(files, { zone: "board", hasBom: false })).toEqual({ bom: null, board: files });
    // On the BoM box a lone text file is a BoM; among Gerbers it is a drill file.
    expect(routeFiles([{ name: "bom.txt" }], { zone: "bom", hasBom: false }).bom?.name).toBe("bom.txt");
    expect(routeFiles([{ name: "drill.txt" }, { name: "board.zip" }], { zone: "bom", hasBom: false })).toEqual({ bom: null, board: [{ name: "drill.txt" }, { name: "board.zip" }] });
  });

  it("keeps the chosen BoM when more board files are dropped, and replaces it from the BoM box", () => {
    expect(routeFiles([{ name: "other.xlsx" }, { name: "g.zip" }], { zone: "board", hasBom: true })).toEqual({ bom: null, board: [{ name: "other.xlsx" }, { name: "g.zip" }] });
    expect(routeFiles([{ name: "rev4.xlsx" }], { zone: "bom", hasBom: true }).bom?.name).toBe("rev4.xlsx");
    expect(routeFiles([{ name: "board.zip" }], { zone: "bom", hasBom: false })).toEqual({ bom: null, board: [{ name: "board.zip" }] });
  });

  it("keeps the Gerbers chosen before when the BoM alone is picked through the board box", () => {
    // Zip first, then the workbook alone through the board box's picker. The picker has emptied the input of the zip,
    // so the zip must be given back to it, or the form would send the BoM without its Gerbers.
    const first = routeFiles([zip], { zone: "board", hasBom: false });
    const afterZip = boardAfter([], first.board, "board");
    expect(afterZip).toEqual([zip]);
    const second = routeFiles([xlsx], { zone: "board", hasBom: false });
    expect(second).toEqual({ bom: xlsx, board: [] });
    expect(boardAfter(afterZip!, second.board, "board")).toEqual([zip]);
    // A drop on the BoM box does not touch the board input: nothing to sync. Board files routed anywhere replace.
    expect(boardAfter([zip], [], "bom")).toBeNull();
    const other = { name: "other.zip", bytes: new Uint8Array() };
    expect(boardAfter([zip], [other], "bom")).toEqual([other]);
    expect(boardAfter([zip], [other], "board")).toEqual([other]);
  });

  it("on the server, takes a workbook among the board files as the BoM, not as the pick-and-place file", () => {
    // Left among the board files, the workbook's XY sheet would make it the centroid file.
    expect(sortBoardFiles([xlsx, zip]).centroid?.name).toBe(xlsx.name);
    const among = bomAmong([zip, xlsx]);
    expect(among?.index).toBe(1);
    expect(among?.pack.bomSheet).toBe("CUSTOMER BOM");
    expect(among?.pack.placements).toHaveLength(7);
    // What is left is the Gerber panel: its extension-less layers read, one board cut out of two.
    const board = sortBoardFiles([zip]);
    expect(board.centroid).toBeNull();
    expect(board.gerbers.map((g) => g.name).sort()).toEqual(["ko", "tl", "ts"]);
    expect(board.panel?.count).toBe(2);
  });

  it("leaves a workbook that holds only placements with the board files", () => {
    expect(bomAmong([{ name: "assembly.xlsx", bytes: workbook({ XY: TYPE7.XY }) }])).toBeNull();
    expect(bomAmong([{ name: "readme.pdf", bytes: new Uint8Array([1, 2, 3]) }])).toBeNull();
  });
});

describe("after the footprint match", () => {
  it("goes on from step 3 to step 4, Line possible, and on through the steps", () => {
    const at = locate("/match").step!;
    expect(at).toMatchObject({ key: "footprint", n: 3 });
    const order: string[] = [];
    for (let step: typeof at | null = at; step; step = neighbours(step).next) order.push(`${step.n}. ${step.label}`);
    expect(order).toEqual(["3. Footprint & mismatch", "4. Line possible", "5. Bare board", "6. Components", "7. Estimate & quote"]);
  });
});
