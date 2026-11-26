import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import path from "node:path";
import { autoMap, detectHeaderRow, headerSignature } from "@/lib/bom/columns";
import { parseBomFile } from "@/lib/bom/parse";
import { cleanMpn, parseQty, scrubRows } from "@/lib/bom/scrub";
import { parseDescription } from "@/lib/bom/describe";
import { Catalog, levenshtein, matchLine, type CatalogPart } from "@/lib/bom/match";
import { purchaseQty, requiredQty } from "@/lib/bom/buildqty";
import { availabilityScore, dateCodeAge, economicScore, qualityScore, resilienceScore, scoreBom, sustainabilityScore, type ScoreInput } from "@/lib/bom/scores";
import { buildAliasIndex } from "@/lib/normalise";

const aliases = buildAliasIndex([
  { name: "Texas Instruments", aliases: ["TI"] },
  { name: "Murata Manufacturing", aliases: ["Murata"] },
  { name: "Yageo", aliases: [] },
  { name: "Samsung Electro-Mechanics", aliases: ["Samsung"] },
]);

describe("column detection", () => {
  it("maps an Altium export", () => {
    const headers = ["Comment", "Description", "Designator", "Footprint", "LibRef", "Quantity", "Manufacturer 1", "Manufacturer Part Number 1"];
    const { mapping } = autoMap(headers);
    expect(mapping).toEqual(["value", "description", "refDes", "package", null, "qty", "manufacturer", "mpn"]);
  });
  it("maps a KiCad export", () => {
    const { mapping } = autoMap(["Reference", "Value", "Footprint", "Datasheet", "Qty", "DNP", "MPN", "Manufacturer"]);
    expect(mapping).toEqual(["refDes", "value", "package", null, "qty", "dnp", "mpn", "manufacturer"]);
  });
  it("maps an OrCAD export (Part = value)", () => {
    const { mapping } = autoMap(["Item", "Quantity", "Reference", "Part", "PCB Footprint", "Mfr P/N"]);
    expect(mapping).toEqual([null, "qty", "refDes", "value", "package", "mpn"]);
  });
  it("prefers a specific MPN column over a generic 'Part Number'", () => {
    const { mapping } = autoMap(["Part Number", "Mfr Part Number", "Qty"]);
    expect(mapping).toEqual([null, "mpn", "qty"]);
  });
  it("finds the header below a title block", () => {
    const rows = [
      ["Project: GW-200", "", ""],
      ["Revision B", "Date 2026-10-01", ""],
      ["", "", ""],
      ["Designator", "Quantity", "Manufacturer Part Number"],
      ["C1", "1", "GRM188R71H104KA93D"],
    ];
    expect(detectHeaderRow(rows)).toBe(3);
  });
  it("builds a stable header signature", () => {
    expect(headerSignature(["Qty ", "MPN", ""])).toBe("qty|mpn");
  });
});

describe("file parsing", () => {
  it("parses the sample CSV", () => {
    const buf = readFileSync(path.resolve("samples/boms/NIM-GW200-PCBA_revB.csv"));
    const { rows } = parseBomFile(buf, "NIM-GW200-PCBA_revB.csv");
    expect(rows[0]).toContain("Manufacturer Part Number");
    expect(rows).toHaveLength(29);
  });
  it("parses semicolon CSV and strips BOM", () => {
    const text = "﻿Ref;Qty;MPN\nR1;1;RC0603FR-0710KL\n";
    const { rows } = parseBomFile(new TextEncoder().encode(text), "x.csv");
    expect(rows).toEqual([["Ref", "Qty", "MPN"], ["R1", "1", "RC0603FR-0710KL"]]);
  });
  it("parses xlsx, skipping an empty first sheet", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Cover"]]), "Cover");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Designator", "Qty", "MPN"], ["U1", 1, "LM358DR"]]), "BOM");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const { sheetName, rows } = parseBomFile(out, "bom.xlsx");
    expect(sheetName).toBe("BOM");
    expect(rows[1]).toEqual(["U1", "1", "LM358DR"]);
  });
  it("rejects unsupported files", () => {
    expect(() => parseBomFile(new Uint8Array(), "board.pdf")).toThrow(/Unsupported/);
  });
});

describe("scrubbing", () => {
  it("cleans MPNs and quantities", () => {
    expect(cleanMpn(' MPN: "LM358DR" ')).toBe("LM358DR");
    expect(cleanMpn("LM358DR-ND")).toBe("LM358DR");
    expect(cleanMpn("N/A")).toBeNull();
    expect(cleanMpn("tbd")).toBeNull();
    expect(parseQty("4 pcs")).toBe(4);
    expect(parseQty("1,000")).toBe(1000);
    expect(parseQty("")).toBeNull();
  });

  it("flags issues, resolves aliases and detects DNP", () => {
    const rows = [
      ["Designator", "Qty", "MPN", "Manufacturer", "Description", "Populate"],
      ["C1-C4", "4", "GRM188R71H104KA93D", "Murata", "100nF", "Yes"],
      ["R1-R4", "5", "RC0603FR-0710KL", "Yageo", "10k", ""],
      ["C5", "", "", "", "10uF 25V X7R 0805", ""],
      ["R9", "1", "RC0603FR-0710KL", "Acme", "10k", "DNP"],
      ["", "", "", "", "", ""],
      ["U1", "1", "LM358DR", "TI", "Op-amp", "No"],
    ];
    const { mapping } = autoMap(rows[0]);
    const lines = scrubRows(rows, 0, mapping, aliases);
    expect(lines).toHaveLength(5);
    expect(lines[0].manufacturer).toBe("Murata Manufacturing");
    expect(lines[0].issues).toEqual([]);
    expect(lines[1].issues).toContain("QTY_REFDES_MISMATCH");
    expect(lines[1].issues).toContain("DUPLICATE_MPN");
    expect(lines[2].issues).toEqual(expect.arrayContaining(["MISSING_MPN", "QTY_FROM_REFDES"]));
    expect(lines[2].qty).toBe(1);
    expect(lines[3].dnp).toBe(true);
    expect(lines[3].issues).toContain("UNKNOWN_MANUFACTURER");
    expect(lines[4].dnp).toBe(true); // Populate = No
    expect(lines[4].manufacturer).toBe("Texas Instruments");
  });

  it("skips section-title rows that only carry a value", () => {
    const rows = [["Comment", "Designator", "Quantity", "MPN"], ["Power", "", "", ""], ["10k", "R1", "1", "RC0603FR-0710KL"]];
    expect(scrubRows(rows, 0, autoMap(rows[0]).mapping, aliases)).toHaveLength(1);
  });

  it("treats a DNP column with 'x' as not placed", () => {
    const rows = [["Ref", "Qty", "MPN", "DNP"], ["R1", "1", "X1", "x"], ["R2", "1", "X2", ""]];
    const lines = scrubRows(rows, 0, autoMap(rows[0]).mapping, aliases);
    expect(lines.map((l) => l.dnp)).toEqual([true, false]);
  });
});

describe("description parser", () => {
  it.each([
    ["CAP CER 10uF 25V X7R 0805", { kind: "capacitor", capacitance: 10e-6, voltage: 25, dielectric: "X7R", package: "0805" }],
    ["100nF/50V NP0 0603", { kind: "capacitor", capacitance: 100e-9, voltage: 50, dielectric: "C0G", package: "0603" }],
    ["10k 1% 0603 1/10W", { kind: "resistor", resistance: 10_000, tolerance: 1, power: 0.1, package: "0603" }],
    ["RES 4K7 0402", { kind: "resistor", resistance: 4_700, package: "0402" }],
    ["RES 0.1R 1% 1W 2512", { kind: "resistor", resistance: 0.1, tolerance: 1, power: 1, package: "2512" }],
    ["IND 10uH 1A", { kind: "inductor", inductance: 10e-6 }],
    ["Op-amp dual SOIC-8", { kind: null }],
  ])("%s", (text, expected) => {
    const got = parseDescription(text);
    for (const [k, v] of Object.entries(expected)) {
      if (typeof v === "number") expect(got[k as keyof typeof got] as number).toBeCloseTo(v, 12);
      else expect(got[k as keyof typeof got]).toBe(v);
    }
  });
});

const part = (id: string, mpn: string, extra: Partial<CatalogPart> = {}): CatalogPart => ({
  id,
  mpn,
  mpnNormalised: mpn.toUpperCase().replace(/[\s\-./_,]/g, ""),
  manufacturer: "Yageo",
  categorySlug: "resistor-chip",
  packageName: "0603",
  lifecycle: "ACTIVE",
  num: {},
  text: {},
  ...extra,
});

describe("matching", () => {
  const catalog = new Catalog([
    part("r10k", "RC0603FR-0710KL", { num: { resistance: 10_000, tolerance: 1, power: 0.1 } }),
    part("r10k-vishay", "CRCW060310K0FKEA", { manufacturer: "Vishay", num: { resistance: 10_000, tolerance: 1, power: 0.1 } }),
    part("c10u-x7r", "C2012X7R1E106K125AB", { manufacturer: "TDK", categorySlug: "mlcc", packageName: "0805", num: { capacitance: 10e-6, voltage: 25 }, text: { dielectric: "X7R" } }),
    part("c10u-x5r", "CL21A106KAYNNNE", { manufacturer: "Samsung Electro-Mechanics", categorySlug: "mlcc", packageName: "0805", num: { capacitance: 10e-6, voltage: 25 }, text: { dielectric: "X5R" } }),
    part("lm358", "LM358DR", { manufacturer: "Texas Instruments", categorySlug: "op-amp", packageName: "SOIC-8" }),
  ]);
  const line = (over: Partial<Parameters<typeof matchLine>[0]>) =>
    ({ lineNo: 1, rawRow: [], rawMpn: null, mpn: null, rawManufacturer: null, manufacturer: null, qty: 1, refDes: null, description: null, value: null, package: null, dnp: false, customerPn: null, issues: [], ...over }) as Parameters<typeof matchLine>[0];

  it("computes edit distance with an early cut-off", () => {
    expect(levenshtein("LM358DR", "LM358D")).toBe(1);
    expect(levenshtein("ABCDEFG", "ZZZZZZZ", 2)).toBe(3);
  });
  it("matches exact MPNs", () => {
    const r = matchLine(line({ mpn: "LM358DR", manufacturer: "Texas Instruments" }), catalog);
    expect(r.selected).toMatchObject({ partId: "lm358", method: "EXACT", confidence: 100 });
    expect(r.needsReview).toBe(false);
  });
  it("matches normalised MPNs", () => {
    expect(matchLine(line({ mpn: "rc0603fr 0710kl" }), catalog).selected?.method).toBe("NORMALISED");
  });
  it("fuzzy-matches ordering-code variants and flags review", () => {
    const r = matchLine(line({ mpn: "LM358DRG4", manufacturer: "Texas Instruments" }), catalog);
    expect(r.selected).toMatchObject({ partId: "lm358", method: "FUZZY" });
    expect(r.needsReview).toBe(true);
  });
  it("penalises a manufacturer mismatch", () => {
    const r = matchLine(line({ mpn: "LM358DR", manufacturer: "Yageo" }), catalog);
    expect(r.selected?.confidence).toBe(70);
    expect(r.needsReview).toBe(true);
  });
  it("matches parametrically from the description, preferring the exact dielectric", () => {
    const r = matchLine(line({ description: "10uF 25V X7R 0805" }), catalog);
    expect(r.candidates.map((c) => c.partId)).toEqual(["c10u-x7r"]); // X5R is worse than X7R → excluded
    expect(r.selected?.method).toBe("PARAMETRIC");
  });
  it("allows a better dielectric than requested", () => {
    const r = matchLine(line({ description: "10uF 16V X5R 0805" }), catalog);
    expect(r.candidates.map((c) => c.partId).sort()).toEqual(["c10u-x5r", "c10u-x7r"]);
    expect(r.selected?.partId).toBe("c10u-x5r");
  });
  it("never swaps a part the customer named for another one a few characters off", () => {
    const shifters = new Catalog([part("txs", "TXS0108EPWR", { manufacturer: "Texas Instruments", categorySlug: "level-shifter", packageName: "TSSOP-20" })]);
    const r = matchLine(line({ mpn: "TXB0108PWR", manufacturer: "Texas Instruments" }), shifters);
    expect(r.selected).toBeNull();
    expect(r.candidates[0]).toMatchObject({ partId: "txs", method: "FUZZY" });
    expect(r.candidates[0].confidence).toBeLessThan(60);
    expect(r.needsReview).toBe(true);
  });
  it("offers an equivalent for a named part not in the catalogue, but leaves the choice to the customer", () => {
    const r = matchLine(line({ mpn: "GRM21BR61E106KA73L", manufacturer: "Murata", description: "CAP CER 10UF 25V 10% X5R 0805" }), catalog);
    expect(r.selected).toBeNull();
    expect(r.candidates.map((c) => c.partId).sort()).toEqual(["c10u-x5r", "c10u-x7r"]);
    expect(Math.max(...r.candidates.map((c) => c.confidence))).toBeLessThan(60);
  });
  it("asks an inductor for the current its line names", () => {
    const coils = new Catalog([
      part("small", "XAL4020-222MEB", { categorySlug: "inductor", num: { inductance: 2.2e-6, current: 5.6 } }),
      part("big", "SRP1270-2R2M", { manufacturer: "Bourns", categorySlug: "inductor", num: { inductance: 2.2e-6, current: 22 } }),
      part("unknown", "IND-2R2-X", { categorySlug: "inductor", num: { inductance: 2.2e-6 } }),
    ]);
    const r = matchLine(line({ description: "INDUCTOR 2.2UH 22A SMD" }), coils);
    expect(r.selected?.partId).toBe("big");
    expect(r.candidates.map((c) => c.partId)).not.toContain("small");
    expect(r.candidates.find((c) => c.partId === "unknown")?.reason).toMatch(/current rating unknown/);
  });
  it("returns no selection when nothing fits", () => {
    const r = matchLine(line({ mpn: "ZZZ999" }), catalog);
    expect(r.selected).toBeNull();
    expect(r.needsReview).toBe(true);
  });
});

describe("build quantity", () => {
  it("adds attrition and rounds up", () => {
    expect(requiredQty({ qtyPerBoard: 18, buildQty: 500, attritionPct: 2 })).toEqual({ base: 9000, attrition: 180, required: 9180 });
    expect(requiredQty({ qtyPerBoard: 1, buildQty: 50, attritionPct: 0.3 })).toEqual({ base: 50, attrition: 1, required: 51 });
    expect(requiredQty({ qtyPerBoard: 2, buildQty: 50, attritionPct: 2, dnp: true }).required).toBe(0);
  });
  it("applies MOQ and full-reel rounding", () => {
    expect(purchaseQty(0, 10, 4000)).toBe(0);
    expect(purchaseQty(3, 10, 4000)).toBe(10);
    expect(purchaseQty(2000, 1, 4000)).toBe(2000); // half a reel: cut tape
    expect(purchaseQty(2500, 1, 4000)).toBe(4000); // ≥ 60%: full reel
    expect(purchaseQty(9180, 1, 4000)).toBe(12000);
  });
});

describe("scores", () => {
  const base: ScoreInput = {
    need: 1000,
    lifecycle: "ACTIVE",
    introducedYear: 2015,
    counterfeitRisk: 1,
    brandTier: 5,
    rohs: "COMPLIANT",
    reach: "COMPLIANT",
    conflictMinerals: true,
    internalQty: 0,
    excessQty: 0,
    authorisedStock: 50_000,
    authorisedSources: 4,
    factoryLeadWeeks: 12,
    dropInAlternates: 1,
    chosen: { kind: "AUTHORISED", condition: "NEW_FACTORY_SEALED", dateCode: "2620", coc: true, country: "US" },
    chosenUnit: 1,
    marketUnits: [1, 1.1, 1.2],
    priceTrendPct: 0,
    nowYear: 2026.8,
  };
  it("rewards a healthy, multi-sourced active part", () => {
    expect(availabilityScore(base)).toBe(90);
    expect(resilienceScore(base)).toBe(100);
    expect(qualityScore(base)).toBeGreaterThanOrEqual(90);
    expect(economicScore(base)).toBeGreaterThan(75);
    expect(sustainabilityScore(base)).toBe(80);
  });
  it("turns red for an obsolete, short, broker-only part", () => {
    const bad: ScoreInput = {
      ...base,
      lifecycle: "OBSOLETE",
      authorisedStock: 0,
      authorisedSources: 0,
      excessQty: 300,
      factoryLeadWeeks: null,
      dropInAlternates: 0,
      counterfeitRisk: 5,
      chosen: { kind: "BROKER", condition: "REFURBISHED", dateCode: "1905", coc: false, country: "CN" },
      chosenUnit: 3,
    };
    expect(availabilityScore(bad)).toBeLessThan(40);
    expect(resilienceScore(bad)).toBeLessThan(40);
    expect(qualityScore(bad)).toBeLessThan(40);
    expect(economicScore(bad)).toBeLessThan(40);
  });
  it("is fully available from internal stock", () => {
    expect(availabilityScore({ ...base, internalQty: 2000 })).toBe(98);
  });
  it("reads date codes", () => {
    expect(dateCodeAge("2101", 2026)).toBeCloseTo(5, 5);
    expect(dateCodeAge("abc", 2026)).toBeNull();
  });
  it("rolls up with bottlenecks for availability", () => {
    const good = { availability: 100, resilience: 100, quality: 80, economic: 80, sustainability: 80 };
    const bad = { availability: 0, resilience: 20, quality: 40, economic: 40, sustainability: 40 };
    const s = scoreBom([{ scores: good, spend: 900 }, { scores: bad, spend: 100 }])!;
    expect(s.availability).toBe(25);
    expect(s.quality).toBe(76);
    expect(scoreBom([])).toBeNull();
  });
});

describe("descriptions as distributors write them", () => {
  it("reads an inductor's current, and no crystal as a capacitor or a TO-220 as watts", () => {
    expect(parseDescription("INDUCTOR 2.2UH 22A SMD")).toMatchObject({ kind: "inductor", inductance: 2.2e-6, current: 22 });
    expect(parseDescription("IND 10uH 500mA 0805")).toMatchObject({ kind: "inductor", current: 0.5 });
    expect(parseDescription("CRYSTAL 10MHZ 18PF SMD").kind).toBeNull();
    expect(parseDescription("OSC XO 25.000MHZ 3.3V").kind).toBeNull();
    expect(parseDescription('HEATSINK TO-220 W/PINS 1.5"TALL').power).toBeUndefined();
    expect(parseDescription("RES 150 OHM 1W 1% 2512 SMD")).toMatchObject({ kind: "resistor", power: 1, resistance: 150 });
  });
});

describe("part numbers in their short forms", () => {
  it("reads a TDK base part number without thickness and packing as a complete part number", async () => {
    const { checkLine } = await import("@/lib/bom/line-checks");
    expect(checkLine({ mpns: ["C2012X7R1H105K"], description: "CAP CER 1UF 50V X7R 10% 0805", value: null, package: "CC0805N" })).toEqual([]);
    expect(checkLine({ mpns: ["C2012X7R1H105KT"], description: "CAP CER 1UF 50V X7R 10% 0805", value: null, package: null })).toEqual([]);
    // The wrong value is still found in the short form.
    expect(checkLine({ mpns: ["C2012X7R1H104K"], description: "CAP CER 1UF 50V X7R 10% 0805", value: null, package: null })[0]?.code).toBe("MPN_VALUE_MISMATCH");
  });
});

describe("a line's own words against each other", () => {
  it("flags a description and a package column naming different packages, and a name in place of a part number", async () => {
    const { checkLine } = await import("@/lib/bom/line-checks");
    const ldo = checkLine({ mpns: ["LDO1117X"], description: "IC REG LDO ADJ 1A SOT223", value: null, package: "TO263-10" });
    expect(ldo).toEqual([{ code: "PACKAGE_CONFLICT", detail: "the description says SOT-223, the package column TO263-10 (TO-263)" }]);
    // The same package written two ways is no conflict.
    expect(checkLine({ mpns: ["DRV4427X"], description: "IC MOSFET DRVR DUAL HS 4A 8-SOIC", value: null, package: "SO8-P50-A157" })).toEqual([]);
    expect(checkLine({ mpns: ["SK33X"], description: "DIODE SCHOTTKY 30V 3A SMB", value: null, package: "DO-214-AA" })).toEqual([]);
    expect(checkLine({ mpns: ["TRANSFORMER"], description: "3 Tap Transformer", value: null, package: "E41/17/12" })[0]?.code).toBe("GENERIC_MPN");
  });
});

