import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { boardSpecFromDetails, checkPackAgainstBom, previewPack, readJobPack, sideOfName, summarisePack, summaryWorthKeeping, type JobPack } from "@/lib/bom/workbook";
import { autoMap, headerConfidence, headerSignature, templateMapping } from "@/lib/bom/columns";
import { formDefaults, parseTitle, pickDetail, sameCustomer, sameRevision } from "@/lib/bom/details";
import { partNumberIn, readAlternates, scrubRows } from "@/lib/bom/scrub";
import { Catalog, matchLine, type CatalogPart } from "@/lib/bom/match";
import { readSheets } from "@/lib/bom/parse";
import { buildAliasIndex } from "@/lib/normalise";

/** Every page of a customer's workbook (Phase 37), on workbooks made here in the shape of the real ones. */

type Sheet = (string | number)[][];
function workbook(sheets: Record<string, Sheet>, opts: { hidden?: string[]; hiddenRows?: Record<string, number[]> } = {}): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const hide = opts.hiddenRows?.[name];
    if (hide) ws["!rows"] = rows.map((_, i) => (hide.includes(i) ? { hidden: true } : {}));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  if (opts.hidden) wb.Workbook = { Sheets: wb.SheetNames.map((name) => ({ name, Hidden: opts.hidden!.includes(name) ? 1 : 0 })) };
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true }) as ArrayBuffer);
}
const sheet = (pack: JobPack, name: string) => pack.sheets.find((s) => s.name === name)!;
const summary = (pack: JobPack) => {
  const { mapping } = autoMap(pack.rows[pack.headerRow], pack.rows.slice(pack.headerRow + 1));
  return summarisePack(pack, { rows: pack.rows, headerRow: pack.headerRow, mapping });
};
const csv = (text: string) => new TextEncoder().encode(text);

const BOM_HEAD = ["Designator", "Qty", "Manufacturer Part Number", "Manufacturer", "Description"];

describe("the header names", () => {
  it("reads the maker's part number however it is qualified, and never a second source as the part", () => {
    expect(headerConfidence("Primary MPN / Model", "mpn")).toBeGreaterThanOrEqual(80);
    expect(headerConfidence("MPN / Model", "mpn")).toBeGreaterThanOrEqual(80);
    expect(headerConfidence("Primary Manufacturer", "manufacturer")).toBeGreaterThanOrEqual(65);
    // A guess ("Likely part number") is tried as an alternate, never taken as the customer's part number.
    expect(headerConfidence("Likely part number", "mpn")).toBe(0);
    expect(headerConfidence("Likely part number", "alternates")).toBeGreaterThanOrEqual(85);
    expect(headerConfidence("Proposed MPN", "mpn")).toBe(0);
    expect(headerConfidence("Preferred MPN", "mpn")).toBeGreaterThanOrEqual(80);
    expect(headerConfidence("Alternate MPN", "mpn")).toBe(0);
    expect(headerConfidence("Alternate MPN", "alternates")).toBeGreaterThanOrEqual(85);
    expect(headerConfidence("Candidate part numbers", "alternates")).toBe(100);
    expect(autoMap(["Reference", "BOM Item", "Internal Part Number", "Primary Manufacturer", "Primary MPN / Model"]).mapping).toEqual(["refDes", null, "customerPn", "manufacturer", "mpn"]);
  });

  it("does not take a mount type, an axis, a scope or a sentence for a BoM field", () => {
    expect(headerConfidence("Mounting", "dnp")).toBe(0);
    expect(headerConfidence("Mounted on", "dnp")).toBe(0);
    expect(headerConfidence("Mount", "dnp")).toBe(100);
    expect(headerConfidence("Size X (mm)", "package")).toBe(0);
    expect(headerConfidence("Position Y (mm)", "refDes")).toBe(0);
    expect(headerConfidence("Count scope", "qty")).toBe(0);
    expect(headerConfidence("Min order qty", "qty")).toBe(0);
    expect(headerConfidence("Country of Origin", "qty")).toBe(0);
    expect(headerConfidence("Package Code", "customerPn")).toBe(0);
    expect(headerConfidence("HTS Code", "customerPn")).toBe(0);
    expect(headerConfidence("Unique named component placements. The bare PCB is excluded.", "dnp")).toBe(0);
    // A "Location" of shelves is not a designator column; one of designators is.
    expect(autoMap(["MPN", "Stock", "Location"], [["LM358DR", "40", "Rack A shelf"], ["NE555", "10", "Bin twelve"]]).mapping[2]).toBeNull();
    expect(autoMap(["MPN", "Qty", "Location"], [["LM358DR", "2", "U1, U2"], ["NE555", "1", "U3"]]).mapping[2]).toBe("refDes");
  });
});

describe("what the file says about itself", () => {
  it("reads the name and revision from the title rows, with the cell each came from", () => {
    const pack = readJobPack(
      workbook({
        "CUSTOMER BOM": [["TYPE9 V2 MAIN BOARD REV 3.0"], ["BOM"], BOM_HEAD, ["R1", 1, "RC0603FR-0710KL", "Yageo", "RES 10k 0603"], ["C1", 1, "GRM188R71H104KA93D", "Murata", "CAP 100nF 0603"]],
      }),
      "TYPE9-REV3 (1).xlsx",
    );
    expect(pickDetail(pack.details, "name")).toMatchObject({ value: "TYPE9 V2 MAIN BOARD", from: "“CUSTOMER BOM” A1", via: "title" });
    expect(pickDetail(pack.details, "revision")).toMatchObject({ value: "3.0", from: "“CUSTOMER BOM” A1" });
    // The file name says rev 3: the same revision, so no finding.
    expect(pack.details.items.some((d) => d.key === "revision" && d.via === "file-name" && d.value === "3")).toBe(true);
    expect(pack.findings).toEqual([]);
    expect(formDefaults(pack.details)).toMatchObject({ bomName: { value: "TYPE9 V2 MAIN BOARD" }, revision: { value: "3.0", from: "“CUSTOMER BOM” A1" } });
  });

  it("splits a title that names the board's and the PCB's revision, and reads a CAD report's header", () => {
    expect(parseTitle("ASUS PRIME H310M-A R2.0 · PCB rev. 1.01A")).toEqual({ name: "ASUS PRIME H310M-A R2.0", revision: "R2.0", pcbRevision: "1.01A" });
    expect(parseTitle("Bill of Materials")).toEqual({});
    expect(sameRevision("REV 3.0", "3")).toBe(true);
    expect(sameRevision("A", "B")).toBe(false);
    const pack = readJobPack(
      workbook({
        BOM: [["Bill of Materials"], ["Project: GW-300.PrjPcb"], ["Variant: [No Variations]", "Report date: 2026-10-20"], BOM_HEAD, ["U1", 1, "LM358DR", "TI", "Op-amp"], ["U2", 1, "NE555DR", "TI", "Timer"]],
        XY: [["Placed Component Report"], ["D:/PCB/GW300/Rev3.0/ARTWORK/gw300.brd"], ["Total Placed Components: 2"], ["REFDES", "SYM_X", "SYM_Y", "SYM_ROTATE", "SYM_MIRROR"], ["U1", "1", "2", "0", "NO"], ["U2", "5", "2", "0", "NO"]],
      }),
      "gw300.xlsx",
    );
    expect(pickDetail(pack.details, "name")?.value).toBe("GW-300");
    expect(pickDetail(pack.details, "project")?.value).toBe("GW-300.PrjPcb");
    expect(pickDetail(pack.details, "date")).toMatchObject({ value: "2026-10-20", from: "“BOM” B3" });
    expect(pickDetail(pack.details, "revision")).toMatchObject({ value: "3.0", via: "path" });
    expect(pickDetail(pack.details, "tool")?.value).toMatch(/Cadence/);
    expect(pack.details.items.some((d) => d.key === "variant")).toBe(false);
    const { summary: s } = summary(pack);
    expect(s.details!.totals).toEqual([expect.objectContaining({ label: "Total Placed Components", said: 2, read: 2, sheet: "XY" })]);
  });

  it("reads a sheet of label/value pairs into details, the board spec and totals checked against the lines", () => {
    const bytes = workbook({
      Components: [["References", "Quantity", "MPN", "Manufacturer"], ["R1, R2, R3", 3, "RC0603FR-0710KL", "Yageo"], ["C1", 1, "GRM188R71H104KA93D", "Murata"]],
      Board: [["Field", "Value"], ["Board", "Nano Shield"], ["PCB revision", "1.01A"], ["Assembly part number", "ASM-4410"], ["Size (mm)", "60 × 59"], ["Layers", "4"], ["Part numbers", "2"], ["Parts", "5"], ["Build quantity", "250"]],
    });
    const pack = readJobPack(bytes, "nano.xlsx");
    expect(sheet(pack, "Board")).toMatchObject({ kind: "details", used: true });
    expect(pickDetail(pack.details, "name")).toMatchObject({ value: "Nano Shield", from: "“Board” B2", via: "sheet" });
    expect(pickDetail(pack.details, "partNumber")?.value).toBe("ASM-4410");
    expect(boardSpecFromDetails(pack.details)).toEqual({ sizeMm: [60, 59], layers: 4, pcbRevision: "1.01A" });
    expect(formDefaults(pack.details)).toMatchObject({ bomName: { value: "Nano Shield" }, buildQty: { value: 250, from: "“Board” B9" } });
    const { summary: s } = summary(pack);
    // Two part numbers agree; five parts do not (the lines hold four).
    expect(s.details!.totals.map((t) => [t.label, t.said, t.read])).toEqual([["Part numbers", 2, 2], ["Parts", 5, 4]]);
    expect(s.findings.map((f) => f.text)).toContain("“Board” B8 gives parts 5; the tool read 4 parts per board on the BoM lines.");
  });

  it("takes notes and a build quantity from a sheet of free text, and nothing from the file name's 'revised'", () => {
    const pack = readJobPack(workbook({ BOM: [BOM_HEAD, ["U1", 1, "LM358DR", "TI", "Op-amp"]], Notes: [["Build 500 pieces"], ["Ship by Friday"]] }), "speaker-revised-design-bom.xlsx");
    expect(sheet(pack, "Notes")).toMatchObject({ kind: "details", used: true });
    expect(pickDetail(pack.details, "buildQty")?.value).toBe("500");
    expect(pack.details.notes).toEqual([{ text: "Ship by Friday", from: "“Notes” A2" }]);
    expect(pack.details.items.some((d) => d.key === "revision")).toBe(false);
    expect(pickDetail(pack.details, "name")?.value).toBe("Speaker revised design");
  });
});

describe("choosing and merging the BoM sheets", () => {
  // One row per designator, an item key, no X/Y: a BoM, though the sheet is called Placements.
  const PER_DESIGNATOR = [
    ["MAINBOARD X1 R2.0 · PCB rev. 1.01A"],
    ["Reference", "BOM Item", "Internal Part Number", "Primary Manufacturer", "Primary MPN / Model"],
    ["C1", "10", "12N-0001", "SAMSUNG", "CL05B104KO5NNNC"],
    ["C2", "10", "12N-0001", "SAMSUNG", "CL05B104KO5NNNC"],
    ["C3", "10", "12N-0001", "SAMSUNG", "CL05B104KO5NNNC"],
    ["R1", "11", "06N-0002", "YAGEO", "RC0402FR-0710KL"],
    ["U1", "12", "02N-0003", "", ""],
    ["J1", "13", "12G-0004", "FOXCONN", "JM36113-P2122-7F"],
  ];
  const OPTIONS = [
    ["Primary and alternate BOM parts"],
    ["BOM Item", "BOM Status", "Internal Part Number", "Manufacturer", "MPN / Model"],
    ["10", "Primary", "12N-0001", "SAMSUNG", "CL05B104KO5NNNC"],
    ["10", "Alternate", "12N-0101", "MURATA", "GRM155R71C104KA88D"],
    ["11", "Primary", "06N-0002", "YAGEO", "RC0402FR-0710KL"],
    ["12", "Primary", "02N-0003", "", ""],
    ["12", "Alternate", "02N-0103", "TI", "TPS62160DSGR"],
    ["12", "Alternate", "02N-0104", "", ""],
  ];
  const SCOPE = [["MAINBOARD X1 R2.0"], ["PCB revision", "1.01A"], ["Source BOM identifier", "40-XYZ-01"], ["Component placements", "6"], ["BOM items for placements", "4"], ["Primary and alternate entries", "6"]];
  const XY = [["Designator", "Mid X", "Mid Y", "Rotation", "Layer"], ["C1", "1", "1", "0", "Top"], ["C2", "2", "1", "0", "Top"], ["C3", "3", "1", "0", "Top"], ["R1", "4", "1", "0", "Top"], ["U1", "5", "5", "0", "Top"], ["J1", "9", "9", "90", "Bottom"]];

  it("takes a per-designator sheet as the BoM over a placement sheet and a details sheet, wherever it sits, and groups it by item", () => {
    for (const order of [
      { Scope: SCOPE, XY, "BOM Part Options": OPTIONS, Placements: PER_DESIGNATOR },
      { Placements: PER_DESIGNATOR, "BOM Part Options": OPTIONS, Scope: SCOPE, XY },
    ]) {
      const pack = readJobPack(workbook(order), "x1.xlsx");
      expect(pack.bomSheet).toBe("Placements");
      expect(sheet(pack, "XY")).toMatchObject({ kind: "placement", used: true });
      expect(sheet(pack, "Scope")).toMatchObject({ kind: "details" });
      expect(sheet(pack, "Placements").says).toMatch(/6 rows, one per designator → 4 lines by “BOM Item”/);
    }
    const pack = readJobPack(workbook({ Placements: PER_DESIGNATOR, "BOM Part Options": OPTIONS, Scope: SCOPE, XY }), "x1.xlsx");
    const header = pack.rows[pack.headerRow];
    expect(header).toEqual(["Reference", "BOM Item", "Internal Part Number", "Primary Manufacturer", "Primary MPN / Model", "Quantity (rows counted)", "Alternates (BOM Part Options)", "Alternate internal P/Ns (BOM Part Options)"]);
    expect(pack.ownColumns).toBe(5);
    expect(pack.rows.slice(pack.headerRow + 1).map((r) => [r[0], r[5], r[6], r[7]])).toEqual([
      ["C1, C2, C3", "3", "GRM155R71C104KA88D (MURATA)", ""],
      ["R1", "1", "", ""],
      // The alternate known only by its internal part number is kept on the line, not tried as an MPN.
      ["U1", "1", "TPS62160DSGR (TI)", "02N-0104"],
      ["J1", "1", "", ""],
    ]);
    expect(autoMap(header, pack.rows.slice(pack.headerRow + 1)).mapping[7]).toBeNull();
    const { summary: s, lines } = summary(pack);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ mpn: "CL05B104KO5NNNC", qty: 3, customerPn: "12N-0001", altMpns: ["GRM155R71C104KA88D"] });
    expect(lines[0].issues).not.toContain("QTY_FROM_REFDES");
    // The line with no part number of its own is matched on its alternate.
    expect(lines[2]).toMatchObject({ mpn: null, altMpns: ["TPS62160DSGR"] });
    expect(s.alternates).toMatchObject({ on: "BOM Item", entries: 6, alternates: 3, withMpn: 2, lines: 2, onlyFromAlternates: 1, primaryDiffers: 0, ipnOnly: 1, ipnLines: 1 });
    expect(sheet(pack, "BOM Part Options").says).toBe(
      "3 alternates, joined on “BOM Item” · 2 alternate part numbers on 2 lines, tried when the first part does not match · 1 alternate with only an internal part number (1 line), kept in “Alternate internal P/Ns (BOM Part Options)” · 1 line get their only part number here",
    );
    expect(sheet(pack, "BOM Part Options")).toMatchObject({ kind: "alternates", used: true });
    expect(s.details!.totals.map((t) => [t.label, t.read])).toEqual([["Component placements", 6], ["BOM items for placements", 4], ["Primary and alternate entries", 6]]);
    expect(s.findings).toEqual([]);
    expect(pickDetail(pack.details, "pcbRevision")?.value).toBe("1.01A");
    expect(pickDetail(pack.details, "partNumber")?.value).toBe("40-XYZ-01");
  });

  it("groups one designator per row by item, never a not-fitted row with a fitted one, and leaves a hand-made BoM alone", () => {
    const rows = (n: number, dnp: (i: number) => string) => Array.from({ length: n }, (_, i) => [`R${i + 1}`, "RC0603FR-0710KL", "Yageo", dnp(i)]);
    const head = ["Designator", "MPN", "Manufacturer", "DNP"];
    const pack = readJobPack(workbook({ BOM: [head, ...rows(12, (i) => (i >= 10 ? "DNP" : ""))] }), "x.xlsx");
    expect(pack.rows.slice(pack.headerRow + 1).map((r) => [r[0], r[3], r[4]])).toEqual([
      ["R1, R2, R3, R4, R5, R6, R7, R8, R9, R10", "", "10"],
      ["R11, R12", "DNP", "2"],
    ]);
    // Five lines, two of them the same part: the customer's lines stay as they are.
    const hand = readJobPack(workbook({ BOM: [["Designator", "Qty", "MPN"], ["R1", 1, "RC0603FR-0710KL"], ["R2", 1, "RC0603FR-0710KL"], ["U1", 1, "LM358DR"], ["C1", 1, "GRM188R71H104KA93D"], ["D1", 1, "1N4148W"]] }), "y.xlsx");
    expect(hand.rows).toHaveLength(6);
  });

  it("matches an alternate against its own maker", () => {
    const part = (id: string, mpn: string, manufacturer: string): CatalogPart => ({ id, mpn, mpnNormalised: mpn.toUpperCase(), manufacturer, categorySlug: "ic", packageName: null, lifecycle: "ACTIVE", num: {}, text: {} });
    const catalog = new Catalog([part("p1", "TPS62160DSGR", "Texas Instruments")]);
    const aliases = buildAliasIndex([{ name: "Texas Instruments", aliases: ["TI"] }, { name: "Samsung", aliases: [] }]);
    expect(readAlternates("TPS62160DSGR (TI); LM358DR / NE555DR")).toEqual([{ mpn: "TPS62160DSGR", maker: "TI" }, { mpn: "LM358DR", maker: null }, { mpn: "NE555DR", maker: null }]);
    const [line] = scrubRows([["Ref", "Qty", "MPN", "Manufacturer", "Alternate MPNs"], ["U1", "1", "XX-UNKNOWN-1", "Samsung", "TPS62160DSGR (TI)"]], 0, autoMap(["Ref", "Qty", "MPN", "Manufacturer", "Alternate MPNs"]).mapping, aliases);
    expect(line).toMatchObject({ manufacturer: "Samsung", altMpns: ["TPS62160DSGR"], altMakers: ["Texas Instruments"] });
    expect(matchLine(line, catalog).selected).toMatchObject({ partId: "p1", confidence: 100 });
  });

  it("merges a BoM split by side, each line tagged with its sheet", () => {
    const pack = readJobPack(
      workbook({
        "BOM TOP": [BOM_HEAD, ["C1, C2", 2, "GRM188R71H104KA93D", "Murata", "CAP 100nF"], ["U1", 1, "LM358DR", "TI", "Op-amp"]],
        "BOM BOTTOM": [BOM_HEAD, ["C10, C11", 2, "GRM188R71H104KA93D", "Murata", "CAP 100nF"], ["R20", 1, "RC0603FR-0710KL", "Yageo", "RES 10k"]],
      }),
      "split.xlsx",
    );
    expect(pack.bomSheets).toEqual(["BOM TOP", "BOM BOTTOM"]);
    expect(sheet(pack, "BOM BOTTOM")).toMatchObject({ kind: "bom", used: true, says: "2 rows — merged into the BoM, each tagged “BOM BOTTOM”" });
    expect(pack.rows[pack.headerRow].at(-1)).toBe("Section");
    expect(pack.rows.slice(pack.headerRow + 1).map((r) => [r[0], r.at(-1)])).toEqual([["C1, C2", "BOM TOP"], ["U1", "BOM TOP"], ["C10, C11", "BOM BOTTOM"], ["R20", "BOM BOTTOM"]]);
    expect(summary(pack).lines).toHaveLength(4);
  });

  it("merges a PCBA and a mechanical BoM in other columns, rather than dropping one", () => {
    const pack = readJobPack(
      workbook({
        PCBA: [BOM_HEAD, ["C1", 1, "GRM188R71H104KA93D", "Murata", "CAP"], ["U1", 1, "LM358DR", "TI", "Op-amp"], ["R1", 1, "RC0603FR-0710KL", "Yageo", "RES"], ["J1", 1, "B2B-XH-A", "JST", "Header"]],
        "Mechanical BOM": [["Item", "Part No", "Mfr", "Qty", "Description"], ["1", "SCR-M3x6", "Bossard", "4", "Screw M3x6"], ["2", "ENC-ABS-200", "Hammond", "1", "Enclosure"]],
      }),
      "box.xlsx",
    );
    expect(pack.bomSheets).toEqual(["PCBA", "Mechanical BOM"]);
    const lines = summary(pack).lines;
    expect(lines.map((l) => l.mpn)).toEqual(["GRM188R71H104KA93D", "LM358DR", "RC0603FR-0710KL", "B2B-XH-A", "SCR-M3x6", "ENC-ABS-200"]);
    expect(lines.at(-1)).toMatchObject({ qty: 1, rawManufacturer: "Hammond", description: "Enclosure" });
  });

  it("leaves out a copy, a hidden older sheet and a sheet listing the same parts, and says so", () => {
    const full = [BOM_HEAD, ["C1", 1, "GRM188R71H104KA93D", "Murata", "CAP"], ["U1", 1, "LM358DR", "TI", "Op-amp"], ["R1", 1, "RC0603FR-0710KL", "Yageo", "RES"], ["R2", 1, "RC0603FR-0710KL", "Yageo", "RES"]];
    const copy = readJobPack(workbook({ "BOM (2)": full.slice(0, 3), BOM: full }), "copy.xlsx");
    expect(copy.bomSheets).toEqual(["BOM"]);
    expect(sheet(copy, "BOM (2)")).toMatchObject({ used: false, says: "2 rows — a copy of “BOM”, not used" });

    const revs = readJobPack(workbook({ "BOM rev A": full.slice(0, 3), "BOM rev B": full }, { hidden: ["BOM rev A"] }), "revs.xlsx");
    expect(revs.bomSheets).toEqual(["BOM rev B"]);
    expect(sheet(revs, "BOM rev A")).toMatchObject({ used: false, hidden: true, says: "2 rows — another BoM-like sheet, a hidden sheet, not used" });

    const same = readJobPack(workbook({ BOM: full, Components: [["Ref", "Part", "Qty", "Function"], ["C1", "Capacitor", "1", "Decoupling"], ["U1", "Op-amp", "1", "Gain"], ["R1", "Resistor", "1", "Bias"], ["R2", "Resistor", "1", "Bias"]] }), "same.xlsx");
    expect(same.bomSheets).toEqual(["BOM"]);
    expect(sheet(same, "Components")).toMatchObject({ used: false, says: "4 rows — the same parts as “BOM” (by designators), not a second BoM, not used" });
  });

  it("lets the person choose the BoM sheet", () => {
    const bytes = workbook({ "BOM (2)": [BOM_HEAD, ["U1", 1, "LM358DR", "TI", "Op-amp"]], BOM: [BOM_HEAD, ["U1", 1, "NE555DR", "TI", "Timer"], ["U2", 1, "NE555DR", "TI", "Timer"]] });
    expect(readJobPack(bytes, "x.xlsx").bomSheet).toBe("BOM");
    expect(readJobPack(bytes, "x.xlsx", { bomSheets: ["BOM (2)"] }).bomSheet).toBe("BOM (2)");
  });

  it("does not call a price list or a part list the BoM, and says when no sheet reads like one", () => {
    const pack = readJobPack(
      workbook({
        Parts: [["MPN", "Manufacturer", "Description", "Min order qty"], ["LM358DR", "TI", "Op-amp", "2500"], ["NE555DR", "TI", "Timer", "2500"]],
        PriceBreaks: [["MPN", "Manufacturer", "Quantity", "Price", "Currency"], ...["LM358DR", "NE555DR"].flatMap((m) => [1, 10, 100].map((q) => [m, "TI", q, 0.1, "USD"]))],
      }),
      "mouser.xlsx",
    );
    expect(pack.bomFound).toBe(false);
    expect(pack.bomSheet).toBe("Parts");
    expect(sheet(pack, "PriceBreaks")).toMatchObject({ kind: "reference", used: false, says: "6 rows — a price list (quantity breaks), not a BoM" });
    expect(pack.findings[0].text).toMatch(/No sheet reads like a BoM .* “Parts” was taken/);
  });
});

describe("a second sheet that reads like a BoM", () => {
  const BOM = [["Designator", "MPN", "Description", "Qty"], ["U1", "LM358DR", "Op-amp", 1], ["U2", "NE555DR", "Timer", 1], ["R1, R2", "RC0402FR-0710KL", "RES 10k", 2], ["C1", "GRM155R71C104KA88D", "CAP 100nF", 1]];

  it("leaves out a costed copy without designators: compared on part numbers, the same parts", () => {
    const pack = readJobPack(
      workbook({ BOM, Costing: [["MPN", "Description", "Qty", "Unit price"], ["LM358DR", "Op-amp", 1, 0.2], ["NE555DR", "Timer", 1, 0.3], ["RC0402FR-0710KL", "RES 10k", 2, 0.01], ["GRM155R71C104KA88D", "CAP 100nF", 1, 0.01]] }),
      "cost.xlsx",
    );
    expect(pack.bomSheets).toEqual(["BOM"]);
    expect(sheet(pack, "Costing")).toMatchObject({ kind: "bom", used: false, says: "4 rows — the same parts as “BOM” (by part numbers), not a second BoM, not used" });
    const { lines } = summary(pack);
    expect(lines).toHaveLength(4);
    expect(lines.reduce((s, l) => s + l.qty, 0)).toBe(5);
  });

  it("leaves out a sheet it cannot compare, and one named as spares or changes, until the person ticks it", () => {
    const loose = workbook({ BOM: [["Designator", "MPN", "Qty"], ["U1", "LM358DR", 1], ["U2", "NE555DR", 1]], Extras: [["Item", "Description", "Qty"], ["1", "Thermal pad", 2], ["2", "Kapton tape", 1]] });
    const pack = readJobPack(loose, "loose.xlsx");
    expect(pack.bomSheets).toEqual(["BOM"]);
    expect(sheet(pack, "Extras")).toMatchObject({ used: false, canBeBom: true, says: "2 rows — also reads like a BoM, with nothing to compare it with “BOM” by: left out" });
    expect(pack.findings.map((f) => f.text)).toContain("“Extras” also reads like a BoM, with nothing to compare it with “BOM” by (designators, part numbers or descriptions): it was left out. Tick “Use as BoM” on it to add its lines.");
    expect(readJobPack(loose, "loose.xlsx", { bomSheets: ["BOM", "Extras"] }).bomSheets).toEqual(["BOM", "Extras"]);

    const eco = workbook({ BOM, "ECO removed": [["Designator", "MPN", "Description", "Qty"], ["U9", "TL072CDR", "Op-amp", 1], ["R9", "RC0402FR-071KL", "RES 1k", 1]], Spares: [["MPN", "Description", "Qty"], ["BAT54S", "Diode", 10], ["SS34", "Diode", 5]] });
    const named = readJobPack(eco, "eco.xlsx");
    expect(named.bomSheets).toEqual(["BOM"]);
    expect(sheet(named, "ECO removed").says).toBe("2 rows — also reads like a BoM, but its name says it is not part of the build: left out");
    expect(sheet(named, "Spares")).toMatchObject({ used: false });
    expect(summary(named).lines).toHaveLength(4);
  });

  // The XbotGo teardown's shape: a product BoM where most lines (housings, screws, the boards themselves) have no
  // designator, and a sheet of the parts on each of its boards with their position on that board.
  const PRODUCT = [
    ["Line", "Ref", "Part", "Category", "Qty", "Package", "Likely part number"],
    ["1", "", "Front housing half", "Enclosure and mouldings", 1, "", ""],
    ["2", "", "Main processor board", "Circuit boards", 1, "", ""],
    ["3", "U1", "AI vision processor", "Integrated circuits", 1, "BGA", "Rockchip RV11xx / RK35xx family"],
    ["4", "U2", "LPDDR memory", "Integrated circuits", 1, "FBGA", "LPDDR4X 2 to 4 GB"],
    ["5", "", "Decoupling capacitors and passives", "Passives", 60, "0402 / 0603", ""],
    ["6", "", "Front UI daughterboard", "Circuit boards", 1, "", ""],
    ["7", "D1-D4", "Green battery level LEDs", "Display and indicators", 4, "0603 LED", ""],
    ["8", "MK1", "MEMS microphone", "Sensors", 1, "Bottom-port MEMS", "Knowles SPH0645LM4H"],
    ["9", "", "Housing screws", "Fasteners", 4, "M2 self-tapping", ""],
    ["10", "", "Remote PCB", "Circuit boards", 1, "", ""],
    ["11", "", "Remote dome switches", "Electromechanical", 3, "Metal dome", ""],
    ["12", "U1", "Remote 2.4 GHz radio SoC", "Integrated circuits", 1, "QFN-32", "Telink TLSR8251"],
    ["", "", "Total", "", 79, "", ""],
  ];
  const ON_BOARDS = [
    ["Board", "Ref", "Copy", "Part", "Category", "Package", "Likely part number", "Side", "X on board (mm)", "Y on board (mm)", "Height (mm)"],
    ["Main processor board", "U1", "", "AI vision processor", "Integrated circuits", "BGA", "Rockchip RV11xx / RK35xx family", "Top", "23.0", "40.0", "1.2"],
    ["Main processor board", "U2", "", "LPDDR memory", "Integrated circuits", "FBGA", "LPDDR4X 2 to 4 GB", "Top", "43.0", "44.0", "1.0"],
    ["Main processor board", "", "60 pieces", "Decoupling capacitors and passives", "Passives", "0402 / 0603", "", "Top", "10.0", "30.0", "0.5"],
    ...[1, 2, 3, 4].map((k) => ["Front UI daughterboard", `D${k}`, `${k} of 4`, "Green battery level LEDs", "Display and indicators", "0603 LED", "", "Bottom", String(12 + 3 * k), "4.0", "1.0"]),
    ["Front UI daughterboard", "MK1", "", "MEMS microphone", "Sensors", "Bottom-port MEMS", "Knowles SPH0645LM4H", "Bottom", "20.0", "34.0", "1.0"],
    ["Remote PCB", "U1", "", "Remote 2.4 GHz radio SoC", "Integrated circuits", "QFN-32", "Telink TLSR8251", "Top", "64.0", "17.0", "0.9"],
    ...[1, 2, 3].map((k) => ["Remote PCB", "", `${k} of 3`, "Remote dome switches", "Electromechanical", "Metal dome", "", "Bottom", String(40 + 8 * k), "17.0", "0.6"]),
  ];

  it("reads a sheet of the parts on each board as placements per board, not as more BoM lines", () => {
    for (const order of [{ BOM: PRODUCT, "Board components": ON_BOARDS }, { "Board components": ON_BOARDS, BOM: PRODUCT }]) {
      const pack = readJobPack(workbook(order), "camera.xlsx");
      expect(pack.bomSheets).toEqual(["BOM"]);
      expect(sheet(pack, "Board components")).toMatchObject({ kind: "placement", used: true, count: 8 });
      expect(sheet(pack, "Board components").says).toMatch(/^8 parts with a designator on 3 boards: Main processor board 2, Front UI daughterboard 5, Remote PCB 1 · 4 rows without a designator · each board's own positions/);
      // U1 is on two boards: each board keeps its own.
      expect(pack.boards?.groups.map((g) => [g.name, g.refs, g.top, g.bottom])).toEqual([
        ["Main processor board", ["U1", "U2"], 2, 0],
        ["Front UI daughterboard", ["D1", "D2", "D3", "D4", "MK1"], 0, 5],
        ["Remote PCB", ["U1"], 1, 0],
      ]);
      // Positions per board are not put on one board.
      expect(pack.placements).toEqual([]);
      const { summary: s, lines } = summary(pack);
      expect(lines).toHaveLength(12);
      expect(lines.reduce((t, l) => t + l.qty, 0)).toBe(79);
      expect(s.details!.totals).toEqual([expect.objectContaining({ label: "Total", said: 79, read: 79 })]);
      expect(s.findings).toEqual([]);
      // The board each part is on becomes its line's section.
      const header = pack.rows[pack.headerRow];
      expect(header.at(-1)).toBe("Section");
      const body = pack.rows.slice(pack.headerRow + 1);
      expect(body.filter((r) => r[1]).map((r) => [r[1], r.at(-1)])).toEqual([
        ["U1", "Main processor board"],
        ["U2", "Main processor board"],
        ["D1-D4", "Front UI daughterboard"],
        ["MK1", "Front UI daughterboard"],
        ["U1", "Remote PCB"],
      ]);
      // Guesses are tried as alternates, never as the customer's part number; a family with placeholders not at all.
      expect(lines.find((l) => l.description === "AI vision processor")).toMatchObject({ mpn: null, altMpns: [] });
      expect(lines.find((l) => l.description === "MEMS microphone")).toMatchObject({ mpn: null, altMpns: ["SPH0645LM4H"] });
      expect(lines.find((l) => l.description === "MEMS microphone")?.issues).toContain("MISSING_MPN");
    }
  });

  it("checks each board's designators against the BoM", () => {
    const pack = readJobPack(workbook({ BOM: PRODUCT, "Board components": [...ON_BOARDS, ["Remote PCB", "LED9", "", "Status LED", "Display", "0603", "", "Top", "50", "5", "0.5"]] }), "camera.xlsx");
    const { lines } = summary(pack);
    expect(checkPackAgainstBom(pack, lines.map((l) => ({ refDes: l.refDes, mpn: l.mpn, dnp: l.dnp }))).map((f) => f.text)).toEqual(["On a board in “Board components” but on no BoM line: LED9."]);
  });

  it("joins what a sheet of the same parts adds: candidate part numbers, the board each part is mounted on, the circuit boards", () => {
    const pack = readJobPack(
      workbook({
        BOM: [["Line", "Ref", "Part", "Qty", "Likely part number"], ["1", "U1", "3.3 V regulator", 1, "XC6206P332"], ["2", "U2", "Op-amp", 1, "LMV358"], ["3", "SW1", "Key switch", 1, ""], ["4", "PCB1", "Main board", 1, ""]],
        Components: [
          ["Ref", "Part", "Category", "Material", "Mounted on", "Size X (mm)", "Size Y (mm)", "Size Z (mm)", "Candidate part numbers"],
          ["U1", "3.3 V regulator", "Power", "", "PCB1 Main board", "3", "3", "1", "XC6206P332 / ME6211C33"],
          ["U2", "Op-amp", "Integrated circuits", "", "PCB1 Main board", "5", "4", "1.5", "LMV358 / MCP6002"],
          ["SW1", "Key switch", "Electromechanical", "", "PCB2 Key board", "6", "6", "4", ""],
          ["PCB1", "Main board", "Circuit boards", "FR-4, 1.6 mm, 2 layers, green solder mask, HASL finish", "", "96", "1.6", "34", ""],
        ],
      }),
      "speaker.xlsx",
    );
    expect(pack.bomSheets).toEqual(["BOM"]);
    expect(sheet(pack, "Components")).toMatchObject({ kind: "bom", used: true });
    expect(sheet(pack, "Components").says).toBe(
      "4 rows — the same parts as “BOM” (by designators), not a second BoM; taken from it: 2 candidate part numbers on 2 lines, added to “Likely part number” · “Mounted on” is the section of 3 lines · 1 circuit board: material and size read",
    );
    const { lines } = summary(pack);
    expect(lines.map((l) => l.altMpns)).toEqual([["XC6206P332", "ME6211C33"], ["LMV358", "MCP6002"], [], []]);
    expect(pack.rows.slice(pack.headerRow + 1).map((r) => r.at(-1))).toEqual(["PCB1 Main board", "PCB1 Main board", "PCB2 Key board", ""]);
    expect(boardSpecFromDetails(pack.details)).toEqual({ sizeMm: [96, 34], layers: 2, thicknessMm: 1.6, finish: "HASL", mask: "green", material: "FR-4" });
  });
});

describe("a customer's saved column template", () => {
  it("still applies when the upload adds a section column, a row count or alternates after the customer's own columns", () => {
    const plain = ["Designator", "Qty", "MPN", "Description"];
    const saved = { signature: headerSignature(plain), mapping: ["refDes", "qty", "mpn", null] as const };
    const pack = readJobPack(workbook({ BOM: [["SENSOR REV 2"], plain, ["Power"], ["U1", 1, "LM1117-3.3", "LDO"], ["MCU"], ["U2", 1, "STM32F030F4P6", "MCU"]] }), "sensor.xlsx");
    const header = pack.rows[pack.headerRow];
    expect(header).toEqual([...plain, "Section"]);
    expect(headerSignature(header.slice(0, pack.ownColumns))).toBe(saved.signature);
    expect(templateMapping([...saved.mapping], autoMap(header).mapping, pack.ownColumns)).toEqual(["refDes", "qty", "mpn", null, null]);

    // One row per designator: the count the upload adds is the quantity, unless the template already maps one.
    const own = ["Reference", "BOM Item", "Internal Part Number", "Primary Manufacturer", "Primary MPN / Model"];
    const rows = [own, ...["C1", "C2", "C3", "C4"].map((r) => [r, "10", "12N-0001", "SAMSUNG", "CL05B104KO5NNNC"]), ["R1", "11", "06N-0002", "YAGEO", "RC0402FR-0710KL"]];
    const grouped = readJobPack(workbook({ Placements: rows }), "board.xlsx");
    const head = grouped.rows[grouped.headerRow];
    expect(headerSignature(head.slice(0, grouped.ownColumns))).toBe(headerSignature(own));
    expect(templateMapping(["refDes", null, "customerPn", "manufacturer", "mpn"], autoMap(head).mapping, grouped.ownColumns)).toEqual(["refDes", null, "customerPn", "manufacturer", "mpn", "qty"]);
  });
});

describe("pages stacked in one CSV", () => {
  const H = "SI.NO.,ME-Code,Part,MFR P No,Package,Reference,Quantity";
  const L = ["1,ME1,CAP 100nF,GRM155R71C104KA88D,0402,C1,1", "2,ME2,RES 10k,RC0402FR-0710KL,0402,R2,1", "3,ME3,LED,LTST-C191KGKT,0603,D1,1"];

  it("leaves out the title block printed again on each page, and page footers", () => {
    const type7 = readJobPack(csv(["TYPE7 V1 SS BOARD REV 3.0", "BOM", H, L[0], L[1], "TYPE7 V1 SS BOARD REV 3.0", "BOM", H, L[2]].join("\n")), "type7.csv");
    expect(type7.rows.slice(type7.headerRow + 1)).toHaveLength(3);
    expect(type7.rows[type7.headerRow]).not.toContain("Section");
    expect(type7.sheets[0].says).toBe("3 rows — the BoM · 1 repeated header left out");
    const paged = readJobPack(csv([H, L[0], L[1], "Page 1 of 2", H, L[2], "Page 2 of 2"].join("\n")), "paged.csv");
    expect(paged.rows.slice(1)).toEqual([L[0], L[1], L[2]].map((l) => l.split(",")));
  });

  it("takes a side title above the first header as the first page's section", () => {
    const pack = readJobPack(csv(["TOP SIDE", H, L[0], L[1], "BOTTOM SIDE", H, L[2]].join("\n")), "sides.csv");
    expect(pack.rows.slice(pack.headerRow + 1).map((r) => r.at(-1))).toEqual(["TOP SIDE", "TOP SIDE", "BOTTOM SIDE"]);
  });

  it("keeps a free-text row in the middle of the lines as it is, not as a section", () => {
    const pack = readJobPack(csv("Designator,Qty,MPN,Description\nU1,1,LM358DR,Op-amp\nThermal paste\nR1,1,RC0402FR-0710KL,RES\n"), "paste.csv");
    expect(pack.rows[0]).toEqual(["Designator", "Qty", "MPN", "Description"]);
    expect(pack.rows).toHaveLength(4);
  });

  it("groups one designator per row on the part number only when the description agrees too", () => {
    const rows = [...[1, 2, 3, 4, 5, 6].map((k) => `C${k},GRM155R71C104KA88D,CAP 100nF ${k <= 3 ? "10V" : "16V"}`), ...[1, 2, 3, 4, 5, 6].map((k) => `R${k},RC0402FR-0710KL,RES 10k`)];
    const pack = readJobPack(csv(["Designator,MPN,Description", ...rows].join("\n")), "grp.csv");
    expect(pack.rows.slice(1).map((r) => [r[0], r[2], r[3]])).toEqual([
      ["C1, C2, C3", "CAP 100nF 10V", "3"],
      ["C4, C5, C6", "CAP 100nF 16V", "3"],
      ["R1, R2, R3, R4, R5, R6", "RES 10k", "6"],
    ]);
    expect(pack.findings).toEqual([]);
  });
});

describe("lists without a header, and what the file name says", () => {
  it("reads a one-column list of part numbers with no header as lines, not as section titles", () => {
    const pack = readJobPack(workbook({ Sheet1: [["TMTD 570"], ["TMDD"], ["TMDA 200-22"], ["TMDD380"], ["TMTC 330"], ["LM358DR"]] }), "Partnumber.xlsx");
    expect(sheet(pack, "Sheet1").says).toBe("6 rows — taken as the BoM: no sheet read like one · no header row: the columns are named A, B, …");
    expect(pack.rows).toEqual([["Column A"], ["TMTD 570"], ["TMDD"], ["TMDA 200-22"], ["TMDD380"], ["TMTC 330"], ["LM358DR"]]);
  });

  it("takes the CAD tool out of a name read off the file name, and keeps it as a detail", () => {
    const pack = readJobPack(csv("Reference,Value,Qty\nR1,10k,1\n"), "PICO-BOARD_KiCad.csv");
    expect(pickDetail(pack.details, "name")?.value).toBe("PICO-BOARD");
    expect(pickDetail(pack.details, "tool")).toMatchObject({ value: "KiCad", from: "the file name" });
  });

  it("keeps no summary for a plain one-table CSV, whatever its name says", () => {
    const pack = readJobPack(csv("Designator,Qty,MPN\nU1,1,LM358DR\n"), "KD-MC48-PWR_revA.csv");
    expect(pack.details.items.length).toBeGreaterThan(0);
    expect(summaryWorthKeeping(summary(pack).summary)).toBe(false);
  });
});

describe("alternates that name no part", () => {
  it("does not try a family, a range or a placeholder as a part number", () => {
    expect(partNumberIn("Bosch BMI270")).toEqual({ mpn: "BMI270", maker: "Bosch" });
    expect(partNumberIn("TPS62160DSGR")).toEqual({ mpn: "TPS62160DSGR", maker: null });
    expect(partNumberIn("LTC3780EGN#PBF")).toEqual({ mpn: "LTC3780EGN#PBF", maker: null });
    for (const guess of ["RK35xx family", "LPDDR4X 2 to 4 GB", "TI BQ2588x", "Rockchip RV11xx", "ICM-426xx", "STM32F0XX", "Sony IMX-series 4K CMOS sensor", "1 to 2.2 uH, 3 A"]) expect(partNumberIn(guess)).toBeNull();
    expect(readAlternates("Rockchip RV11xx / RK35xx family; Knowles SPH0645LM4H")).toEqual([{ mpn: "SPH0645LM4H", maker: "Knowles" }]);
  });
});

describe("other details a workbook gives", () => {
  it("takes the latest revision from a revision-history sheet", () => {
    const pack = readJobPack(
      workbook({ BOM: [BOM_HEAD, ["U1", 1, "LM358DR", "TI", "Op-amp"]], "Revision History": [["Rev", "Date", "Description", "By"], ["A", "2026-01-10", "First release", "RK"], ["B", "2026-06-02", "C4 changed to 10uF", "RK"], ["C", "2026-10-28", "U3 second source added", "MS"]] }),
      "x.xlsx",
    );
    expect(sheet(pack, "Revision History")).toMatchObject({ kind: "revision-history", used: true, count: 3, says: "3 revisions — the latest is C" });
    expect(pickDetail(pack.details, "revision")).toMatchObject({ value: "C", from: "“Revision History” A4", via: "sheet" });
    expect(formDefaults(pack.details).revision).toMatchObject({ value: "C" });
  });

  it("reads the customer a details sheet names, to be matched against ours", () => {
    const pack = readJobPack(workbook({ BOM: [BOM_HEAD, ["U1", 1, "LM358DR", "TI", "Op-amp"]], Job: [["Customer", "Kinetic Drives Ltd."], ["Build quantity", "500"]] }), "x.xlsx");
    expect(formDefaults(pack.details)).toMatchObject({ customer: { value: "Kinetic Drives Ltd.", from: "“Job” B1" }, buildQty: { value: 500 } });
    expect(sameCustomer("Kinetic Drives Ltd.", "KINETIC DRIVES")).toBe(true);
    expect(sameCustomer("Kinetic Drives", "Kinetic Motors")).toBe(false);
  });

  it("does not read 'Primary' or 'Front' alone in a sheet name as a side of the board", () => {
    expect(sideOfName("Primary Batteries")).toBeNull();
    expect(sideOfName("Front panel BOM")).toBeNull();
    expect(sideOfName("Primary side")).toBe("TOP");
    expect(sideOfName("Secondary_Side_Load")).toBe("BOTTOM");
  });
});

describe("the sheets a job pack already had", () => {
  const XY = [["REFDES", "SYM_X", "SYM_Y", "SYM_ROTATE", "SYM_MIRROR"], ["C1", "1", "1", "0", "NO"], ["U1", "5", "5", "90", "NO"], ["C2", "2", "8", "180", "YES"], ["R1", "9", "9", "0", "YES"]];
  const HEAD = ["Item,Number", "Item,Description", "RefDes", "X", "Y", "R"];
  const TOP = [HEAD, ["GRM188R71H104KA93D", "CAP", "C1", "1", "1", "0"], ["LM358DR", "Op-amp", "U1", "5", "5", "90"]];
  const BOTTOM = [HEAD, ["GRM188R71H104KA93D", "CAP", "C2", "2", "8", "180"]];
  const MACRO = [...TOP, ...BOTTOM.slice(1), ["", "", "C1", "NO", "", ""], ["", "", "U1", "NO", "", ""], ["", "", "R1", "BOTTOM", "", ""]];
  const BOM = [["SENSOR REV 2"], ["Reference", "Quantity", "MFR P No", "Part"], ["C1, C2", "2", "GRM188R71H104KA93D", "CAP 100nF"], ["U1", "1", "LM358DR", "Op-amp"]];

  it("still reads placements, load lists and not-fitted lists; a merged list and its copy are said for, not checked twice", () => {
    const pack = readJobPack(workbook({ "CUSTOMER BOM": BOM, XY, "MACRO BOM": MACRO, "BOTTOM DNP": [["R1", "BOTTOM"]], "TOP LOAD": TOP, "BOTTOM LOAD": BOTTOM, "MACRO BOM (2)": MACRO }, { hiddenRows: { "MACRO BOM": [4, 5] } }), "pack.xlsx");
    expect(pack.placementSource).toBe("XY");
    expect(pack.placements).toHaveLength(4);
    expect(pack.notFitted).toEqual([{ refDes: "R1", side: "BOTTOM", why: "sheet “BOTTOM DNP”" }]);
    expect(pack.loads.map((l) => l.sheet)).toEqual(["TOP LOAD", "BOTTOM LOAD"]);
    expect(sheet(pack, "MACRO BOM")).toMatchObject({ kind: "load-list", used: false, count: 3, hiddenRows: 2 });
    expect(sheet(pack, "MACRO BOM").says).toBe("3 parts to load: TOP LOAD + BOTTOM LOAD in one list · its top/bottom list of 3 designators agrees with “XY”");
    expect(sheet(pack, "MACRO BOM (2)").says).toMatch(/^3 parts to load: the same parts as “MACRO BOM”/);
    expect(pack.findings).toEqual([]);
    const { summary: s } = summary(pack);
    expect(s.added).toEqual(["R1"]);
    expect(s.findings).toEqual([]);
  });

  it("says when a side list disagrees with the placement report", () => {
    const wrong = [...MACRO.slice(0, -1), ["", "", "R1", "NO", "", ""]];
    const pack = readJobPack(workbook({ "CUSTOMER BOM": BOM, XY, "MACRO BOM": wrong }), "pack.xlsx");
    expect(pack.findings.map((f) => f.text)).toContain("The top/bottom list on “MACRO BOM” puts R1 on the other side than “XY”.");
  });

  it("reads hidden rows and says how many", () => {
    const sheets = readSheets(workbook({ A: [["Ref", "Qty"], ["R1", 1], ["R2", 1], ["R3", 1]] }, { hiddenRows: { A: [1, 2] } }), "a.xlsx");
    expect(sheets[0]).toMatchObject({ hiddenRows: 2, rowNo: [1, 2, 3, 4] });
    expect(sheets[0].rows).toHaveLength(4);
  });
});

describe("a CSV", () => {
  it("reads a plain one as before: one table, its rows untouched", () => {
    const text = "Designator,Qty,MPN\nU1,1,LM358DR\nR1-R3,3,RC0603FR-0710KL\n";
    const pack = readJobPack(csv(text), "PWR-12_revB.csv");
    expect(pack.rows).toEqual([["Designator", "Qty", "MPN"], ["U1", "1", "LM358DR"], ["R1-R3", "3", "RC0603FR-0710KL"]]);
    expect(pack.headerRow).toBe(0);
    expect(pack.sheets).toEqual([expect.objectContaining({ name: "PWR-12_revB.csv", kind: "bom", used: true })]);
    expect(pack.singlePage).toBe(true);
    expect(pack.findings).toEqual([]);
    expect(formDefaults(pack.details)).toMatchObject({ bomName: { value: "PWR-12", from: "the file name" }, revision: { value: "B" } });
    expect(previewPack(csv(text), "PWR-12_revB.csv").summary.singlePage).toBe(true);
  });

  it("reads pages stacked in one CSV: repeated headers and section titles are not lines, a total row is a check", () => {
    const text = [
      "Designator,Qty,Manufacturer Part Number,Manufacturer",
      "TOP SIDE,,,",
      "C1,1,GRM188R71H104KA93D,Murata",
      "U1,1,LM358DR,TI",
      "BOTTOM SIDE,,,",
      "Designator,Qty,Manufacturer Part Number,Manufacturer",
      "C2,1,GRM188R71H104KA93D,Murata",
      "Sheet: Box build,,,",
      "Item,Qty,Manufacturer Part Number,Manufacturer",
      ",4,SCR-M3x6,Bossard",
      "Total,7,,",
    ].join("\n");
    const pack = readJobPack(csv(text), "stacked.csv");
    expect(pack.rows[0]).toEqual(["Designator", "Qty", "Manufacturer Part Number", "Manufacturer", "Section"]);
    expect(pack.rows.slice(1)).toEqual([
      ["C1", "1", "GRM188R71H104KA93D", "Murata", "TOP SIDE"],
      ["U1", "1", "LM358DR", "TI", "TOP SIDE"],
      ["C2", "1", "GRM188R71H104KA93D", "Murata", "BOTTOM SIDE"],
      ["", "4", "SCR-M3x6", "Bossard", "Box build"],
    ]);
    expect(pack.sheets[0].says).toBe("4 rows — the BoM · 3 sections: “TOP SIDE”, “BOTTOM SIDE”, “Box build” · 2 repeated headers left out · 1 total row checked, not a line");
    const { summary: s, lines } = summary(pack);
    expect(lines.map((l) => l.refDes)).toEqual(["C1", "U1", "C2", null]);
    expect(s.details!.totals).toEqual([expect.objectContaining({ label: "Total", said: 7, read: 7 })]);
  });
});
