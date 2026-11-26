import { describe, expect, it } from "vitest";
import { competitorOf, leadsOnCopper, linePins, makerKey, parseCompetitors, pinsFromText, samePart, validate, validationCsv, type VLine, type ValidationInput } from "@/lib/validation/checks";

const line = (o: Partial<VLine> & { lineNo: number; refs: string[] }): VLine => ({ mpn: "X1", manufacturer: "Acme", description: null, pkg: null, dnp: false, need: 10, part: null, offers: [], ...o });
const part = (o: Partial<NonNullable<VLine["part"]>> = {}) => ({ mpn: "X1", manufacturer: "Acme", pkg: null, pins: null, lifecycle: "ACTIVE", confirmed: true, ...o });
const offers = (...sellers: [string, number][]) => sellers.map(([seller, stock]) => ({ seller, stock, authorised: true, leadWeeks: 8 }));
const input = (o: Partial<ValidationInput>): ValidationInput => ({ lines: [], placements: null, footprint: null, competitors: [], calls: [], ...o });

describe("pin counts", () => {
  it("reads pins from package names and descriptions", () => {
    expect(pinsFromText("SOIC-8")).toBe(8);
    expect(pinsFromText("0805")).toBe(2);
    expect(pinsFromText("SOT-23")).toBe(3);
    expect(pinsFromText("SOT-223")).toBe(4);
    expect(pinsFromText("IC MCU ARM 1MB FLASH 144LQFP")).toBe(144);
    expect(pinsFromText("IC DRIVER DUAL 8-SOIC")).toBe(8);
    expect(pinsFromText("CONN HEADER 20POS .100")).toBe(20);
    expect(pinsFromText("Module")).toBeNull();
    expect(pinsFromText("TO220AC")).toBe(2);
    expect(pinsFromText("TO-220AB-3")).toBe(3);
  });

  it("counts an exposed pad out, and prefers the customer's words to a guessed match", () => {
    expect(leadsOnCopper({ copper: "QFN-24 + EP 0.5 mm", padCount: 25 })).toBe(24);
    expect(leadsOnCopper({ copper: "SOIC-8 1.27 mm", padCount: 8 })).toBe(8);
    expect(linePins(line({ lineNo: 1, refs: ["U1"], pkg: "SOIC-8", part: part({ pins: 14, confirmed: false }) }))).toEqual({ pins: 8, from: "package SOIC-8" });
    expect(linePins(line({ lineNo: 1, refs: ["U1"], pkg: "SOIC-8", part: part({ pins: 14, mpn: "P14" }) }))).toEqual({ pins: 14, from: "part P14" });
    // A heatsink names the package it cools, not its own pins.
    expect(linePins(line({ lineNo: 1, refs: ["H1"], description: "HEATSINK TO-220 W/PINS 1.5\"TALL", pkg: "513102 SERIES" }))).toBeNull();
  });
});

describe("competitors", () => {
  const list = parseCompetitors([["Competitor", "Other names"], ["Texas Instruments", "TI"], ["ON Semiconductor; onsemi"], [""], ["texas instruments inc."]]);

  it("reads a pasted or uploaded list, merging the same maker", () => {
    expect(list).toEqual([
      { name: "Texas Instruments", aliases: ["TI"] },
      { name: "ON Semiconductor", aliases: ["onsemi"] },
    ]);
    expect(parseCompetitors([["Analog Devices (ADI)"]])).toEqual([{ name: "Analog Devices", aliases: ["ADI"] }]);
  });

  it("matches whole names and words, never part of a word", () => {
    expect(makerKey("Texas Instruments Incorporated")).toBe("texas instruments");
    expect(competitorOf(["TI"], list)?.name).toBe("Texas Instruments");
    expect(competitorOf(["onsemi"], list)?.name).toBe("ON Semiconductor");
    expect(competitorOf(["ON Semiconductor"], list)?.name).toBe("ON Semiconductor");
    expect(competitorOf(["Tiger Electronics"], list)).toBeNull();
    expect(competitorOf(["Bourns Inc."], list)).toBeNull();
  });
});

describe("validating a BoM", () => {
  it("flags footprint, placement and pin-count problems from the board", () => {
    const v = validate(
      input({
        lines: [line({ lineNo: 1, refs: ["U1"], pkg: "SOIC-8", part: part(), offers: offers(["DigiKey", 100], ["Mouser", 50]) }), line({ lineNo: 2, refs: ["R1", "R2"], pkg: "0805", part: part(), offers: offers(["DigiKey", 100], ["LCSC", 9]) })],
        placements: [
          { refDes: "U1", footprint: null, copper: "SOIC-14 1.27 mm", padCount: 14, snap: "silk" },
          { refDes: "R1", footprint: null, copper: "0805", padCount: 2, snap: "silk" },
          { refDes: "TP9", footprint: null, copper: "1 pads", padCount: 1, snap: "silk" },
        ],
        footprint: { hasBoard: true, refs: [{ ref: "U1", status: "mismatch", why: "BoM SOIC-8, board SOIC-14", lineNo: 1, mpn: null, bomPkg: "SOIC-8", footprint: null, x: 0, y: 0, side: "TOP" }] },
      }),
    );
    expect(v.flags.map((f) => `${f.key} ${f.level}`)).toEqual(["footprint:U1 red", "placement:R2 red", "placement:TP9 amber", "pins:U1 red"]);
    expect(v.flags.find((f) => f.key === "pins:U1")?.text).toBe("8 pins by package SOIC-8, 14 pads on the board");
    expect(v.ready).toBe(false);
  });

  it("flags availability and visibility from the distributors, and says which checks could not run", () => {
    const v = validate(
      input({
        lines: [
          line({ lineNo: 1, refs: ["C1"], part: part({ lifecycle: "OBSOLETE" }), offers: offers(["DigiKey", 5000], ["Mouser", 10]) }),
          line({ lineNo: 2, refs: ["C2"], part: part(), offers: offers(["Newark", 3]) }),
          line({ lineNo: 3, refs: ["C3"], part: part(), offers: [] }),
          line({ lineNo: 4, refs: ["C4"], mpn: "ABC-1", part: null }),
          line({ lineNo: 5, refs: ["C5"], mpn: null, part: null }),
          line({ lineNo: 6, refs: ["C6"], part: part(), offers: offers(["DigiKey", 0], ["Mouser", 0]), dnp: true }),
        ],
      }),
    );
    expect(v.flags.map((f) => `${f.key} ${f.level}`)).toEqual([
      "lifecycle:1 red",
      "availability:2 amber",
      "visibility:2 amber",
      "availability:3 red",
      "visibility:3 amber",
      "visibility:4 amber",
      "availability:5 red",
    ]);
    expect(v.skipped.map((s) => s.check)).toEqual(["distributor", "footprint", "placement", "pins", "competitor"]);
  });

  it("starts a competitor's part prohibited, and applies the reviewers' calls", () => {
    const lines = [line({ lineNo: 1, refs: ["U1"], manufacturer: "Texas Instruments", part: part(), offers: offers(["DigiKey", 99], ["Mouser", 99]) }), line({ lineNo: 2, refs: ["C1"], part: part(), offers: offers(["Newark", 1]) })];
    const competitors = [{ name: "Texas Instruments", aliases: ["TI"] }];
    const before = validate(input({ lines, competitors }));
    expect(before.flags.find((f) => f.check === "competitor")).toMatchObject({ state: "prohibited", reason: "competitor's part" });
    expect(before).toMatchObject({ open: 2, prohibited: 1, ready: false });

    const after = validate(input({ lines, competitors, calls: [{ key: "competitor:1", status: "ACCEPTED", reason: "same name, another maker" }, { key: "availability:2", status: "ACCEPTED", reason: "consigned by the customer" }, { key: "visibility:2", status: "PROHIBITED", reason: "single source not allowed" }] }));
    expect(after).toMatchObject({ open: 0, accepted: 2, prohibited: 1, ready: false });
    expect(after.counts.visibility).toEqual({ open: 0, accepted: 0, prohibited: 1 });

    // A part only guessed to be the competitor's (an unconfirmed catalogue match) is not flagged.
    const guessed = validate(input({ lines: [line({ lineNo: 1, refs: ["C1"], manufacturer: null, part: part({ manufacturer: "Texas Instruments", confirmed: false }), offers: offers(["DigiKey", 99], ["Mouser", 99]) })], competitors }));
    expect(guessed.flags.filter((f) => f.check === "competitor")).toEqual([]);

    const done = validate(input({ lines, competitors, calls: [{ key: "competitor:1", status: "ACCEPTED", reason: "x" }, { key: "availability:2", status: "ACCEPTED", reason: "x" }, { key: "visibility:2", status: "ACCEPTED", reason: "x" }] }));
    expect(done.ready).toBe(true);
    expect(validationCsv(done)[0]).toEqual(["Check", "Level", "Designator / line", "Line", "Designators", "Finding", "Call", "Reason"]);
    expect(validationCsv(done)).toHaveLength(4);
  });
});

describe("the part number check", () => {
  it("tells an ordering-code variant of the BoM's part from another part", () => {
    expect(samePart("LM358DR", "LM358DRG4")).toBe(true);
    expect(samePart("C2012X7R1H105K", "C2012X7R1H105K125AB")).toBe(true);
    expect(samePart("TXB0108PWR", "TXS0108EPWR")).toBe(false);
    expect(samePart("SRP1270-2R2M", "XAL4020-222MEB")).toBe(false);
  });

  it("flags a matched part that is not the BoM's, red when confirmed, amber while it is our guess", () => {
    const v = validate(input({
      lines: [
        line({ lineNo: 1, refs: ["U1"], mpn: "TXB0108PWR", part: part({ mpn: "TXS0108EPWR", confirmed: false }), offers: offers(["Digi-Key", 100]) }),
        line({ lineNo: 2, refs: ["U2"], mpn: "TXB0108PWR", part: part({ mpn: "TXS0108EPWR", confirmed: true }), offers: offers(["Digi-Key", 100]) }),
        line({ lineNo: 3, refs: ["U3"], mpn: "LM358DRG4", part: part({ mpn: "LM358DR" }), offers: offers(["Digi-Key", 100]) }),
      ],
    }));
    const parts = v.flags.filter((f) => f.check === "part");
    expect(parts.map((f) => [f.subject, f.level])).toEqual([["U1", "amber"], ["U2", "red"]]);
    expect(parts[1].text).toBe("matched to TXS0108EPWR (Acme), not the BoM's TXB0108PWR: a substitute the customer must approve");
  });

  it("reports what the BoM reader found wrong with a line's own words", () => {
    const v = validate(input({
      lines: [line({ lineNo: 4, refs: ["U6"], issues: ["PACKAGE_CONFLICT: the description says SOT-223, the package column TO263-10 (TO-263)", "UNKNOWN_MANUFACTURER"] })],
    }));
    const f = v.flags.filter((x) => x.check === "part");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: "red", subject: "U6", text: "the description says SOT-223, the package column TO263-10 (TO-263)" });
  });
});

describe("the distributor part number check", () => {
  it("checks each line's number when the BoM carries them, and says so when it does not", () => {
    const lines = [
      line({ lineNo: 1, refs: ["C1"], mpn: "C2012X7R1H105K", manufacturer: "TDK", supplierPn: "445-7547-1-ND", supplier: "Digi-Key" }),
      line({ lineNo: 2, refs: ["T1"], mpn: "TRANSFORMER", manufacturer: "Acme", supplierPn: "TRANSFORMER", supplier: "Digi-Key" }),
      line({ lineNo: 3, refs: ["J8"], mpn: "HDR-10", manufacturer: "Acme", supplierPn: null, supplier: null }),
    ];
    const v = validate(input({ lines }));
    expect(v.flags.filter((f) => f.check === "distributor").map((f) => f.subject)).toEqual(["T1", "J8"]);
    expect(v.flags.find((f) => f.subject === "J8")?.text).toBe("no Digi-Key part number on this line");
    expect(validate(input({ lines: [line({ lineNo: 1, refs: ["C1"] })] })).skipped.map((s) => s.check)).toContain("distributor");
  });
});

