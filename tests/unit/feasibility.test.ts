import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { measureFab, readFab } from "@/lib/board/fab-measure";
import { ASSEMBLY } from "@/data/assembly";
import { classifyPart, countDnp, countJoints, jointsOf, pinFactor, type AsmPart } from "@/lib/feasibility/joints";
import { asmParts } from "@/lib/feasibility/parts";
import { panelise } from "@/lib/feasibility/panel";
import { apertureAreaRatio, smtLineSheet } from "@/lib/feasibility/smt-line";
import { consumablesForLot, maskedParts } from "@/lib/feasibility/consumables";
import { dnpPasteGrams, estimatePaste, padsOf, pasteByPackage, pasteFactor, pasteForLot, solderForLot, stencilFor } from "@/lib/feasibility/paste";
import { DEFAULT_RATES } from "@/data/costing";
import { quoteForQty } from "@/lib/costing/quote";
import { analyseExpenses } from "@/lib/costing/expenses";
import { planCapacity } from "@/lib/feasibility/capacity";
import { buildChecks, fingerprint, gateStates, GATES, readSignoffs, reviewPassed, sign, verdict, type Facts, type Signoff } from "@/lib/feasibility/gates";

const part = (refDes: string, over: Partial<AsmPart> = {}): AsmPart => ({ refDes, side: "TOP", mount: "SMT", kind: "chip", pkg: "0603", pins: 2, pitchMm: 0, lengthMm: 1.6, widthMm: 0.8, ...over });

const board: AsmPart[] = [
  ...Array.from({ length: 10 }, (_, i) => part(`R${i + 1}`)),
  part("C1", { side: "BOTTOM", pkg: "0402", lengthMm: 1, widthMm: 0.5 }),
  part("U1", { kind: "gullwing", pkg: "SOIC-8", pins: 8, pitchMm: 1.27, lengthMm: 4.9, widthMm: 3.9 }),
  part("U2", { kind: "leadless", pkg: "QFN-32", pins: 32, pitchMm: 0.5, lengthMm: 5, widthMm: 5 }),
  part("U3", { kind: "array", pkg: "BGA-100", pins: 100, pitchMm: 0.8, lengthMm: 10, widthMm: 10 }),
  part("J1", { mount: "THT", kind: "connector", pkg: "HDR-1x10", pins: 10, pitchMm: 2.54, lengthMm: 25, widthMm: 2.5 }),
  part("J2", { mount: "PRESS_FIT", kind: "connector", pkg: "PF-20", pins: 20, pitchMm: 2, lengthMm: 20, widthMm: 5 }),
];

describe("solder joints", () => {
  it("counts a chip as two joints and a QFN with its exposed pad", () => {
    expect(jointsOf(part("R1", { pins: 0 }))).toBe(2);
    expect(jointsOf(board.find((p) => p.refDes === "U2")!)).toBe(33);
    expect(jointsOf(board.find((p) => p.refDes === "J1")!)).toBe(10);
  });

  it("splits joints by side and method and says what each inspection looks at", () => {
    const j = countJoints(board);
    expect(j.smt.TOP).toEqual({ placements: 13, joints: 20 + 8 + 33 + 100 });
    expect(j.smt.BOTTOM).toEqual({ placements: 1, joints: 2 });
    expect(j.tht).toEqual({ parts: 1, joints: 10 });
    expect(j.pressFit).toEqual({ parts: 1, pins: 20 });
    expect(j.hidden).toEqual({ parts: 2, joints: 133 });
    // Press-fit pins are not soldered.
    expect(j.total).toBe(163 + 10);
    expect(j.placements).toBe(14);
    expect(j.finestPitchMm).toBe(0.5);
    expect(j.inspection.spiDeposits).toBe(163);
    expect(j.inspection.aoiJoints).toBe(30);
    expect(j.inspection.xrayJoints).toBe(133);
    expect(j.inspection.thtJoints).toBe(10);
    expect(j.inspection.probeNets).toBe(Math.round((173 + 20) / ASSEMBLY.jointsPerNet));
    expect(j.byPackage[0].pkg).toBe("BGA-100");
    expect(j.byPackage.reduce((s, r) => s + r.joints, 0)).toBe(j.total + j.pressFit.pins);
  });

  it("is empty for an empty board", () => {
    const j = countJoints([]);
    expect(j.total).toBe(0);
    expect(j.finestPitchMm).toBeNull();
  });
});

describe("solder paste", () => {
  it("gives through-hole parts no paste and chips two apertures", () => {
    expect(padsOf(board.find((p) => p.refDes === "J1")!)).toEqual({ apertures: 0, areaMm2: 0 });
    const r = padsOf(part("R1"));
    expect(r.apertures).toBe(2);
    expect(r.areaMm2).toBeCloseTo(1.36, 2);
  });

  it("picks the foil from the finest feature", () => {
    expect(stencilFor([part("R1", { pkg: "0805" })])).toBe(ASSEMBLY.stencilUm.coarse);
    expect(stencilFor([part("R1", { pkg: "0402" })])).toBe(ASSEMBLY.stencilUm.standard);
    expect(stencilFor([part("R1", { pkg: "0201" })])).toBe(ASSEMBLY.stencilUm.fine);
    expect(stencilFor([part("U", { kind: "quad", pkg: "LQFP-100", pins: 100, pitchMm: 0.4 })])).toBe(ASSEMBLY.stencilUm.fine);
  });

  it("estimates from the packages: area × foil × transfer × density", () => {
    const e = estimatePaste([part("R1", { pkg: "0805", lengthMm: 2, widthMm: 1.25 })], null);
    expect(e.source).toBe("packages");
    expect(e.sides).toHaveLength(1);
    const area = 2 * 1.3 * ASSEMBLY.paste.apertureReduction;
    const grams = (area * 0.15 * ASSEMBLY.paste.transfer * ASSEMBLY.paste.densityGPerCm3) / 1000;
    expect(e.gramsPerBoard).toBeCloseTo(grams, 6);
  });

  it("uses the measured paste layer when the Gerbers have one, and lands in a plausible range", () => {
    const measured = { paste: { top: { apertures: 400, areaMm2: 300, source: "paste-layer" as const }, bottom: null }, holes: null };
    const e = estimatePaste(board, measured);
    const top = e.sides.find((s) => s.side === "TOP")!;
    expect(top.source).toBe("paste-layer");
    expect(top.apertures).toBe(400);
    expect(top.areaMm2).toBe(300);
    // 300 mm² through a 120 µm foil is roughly 0.13 g.
    expect(top.grams).toBeGreaterThan(0.1);
    expect(top.grams).toBeLessThan(0.16);
    // The bottom side had nothing measured, so the whole board is only as good as its estimate.
    expect(e.sides.find((s) => s.side === "BOTTOM")!.source).toBe("packages");
    expect(e.source).toBe("packages");
  });

  it("issues printed paste plus wipes plus the bead on each stencil each shift, in whole jars", () => {
    const e = estimatePaste(board, null);
    const lot = pasteForLot(e, 1000, 1.2, 6500);
    expect(lot.printedG).toBeCloseTo(e.gramsPerBoard * 1000, 6);
    expect(lot.wipeG).toBeCloseTo((lot.printedG * ASSEMBLY.paste.wipeLossPct) / 100, 6);
    expect(lot.beadG).toBe(2 * ASSEMBLY.paste.beadGPerSidePerShift * 2);
    expect(lot.issueG).toBeCloseTo(lot.printedG + lot.wipeG + lot.beadG, 6);
    expect(lot.jars).toBe(Math.ceil(lot.issueG / ASSEMBLY.paste.jarG));
    expect(lot.cost).toBeCloseTo((lot.issueG / 1000) * 6500, 6);
    expect(pasteForLot(estimatePaste([], null), 1000, 1, 6500)).toMatchObject({ issueG: 0, jars: 0, cost: 0 });
  });

  it("adds dross to the bar solder of a lot", () => {
    const s = solderForLot(100, 500);
    expect(s.perBoardG).toBeCloseTo(1.5, 6);
    expect(s.lotG).toBeCloseTo(1.5 * 500 * 1.3, 6);
  });
});

describe("plant rules from the 11 Nov 2026 meeting", () => {
  it("classifies MOSFETs, relays, connectors and inductors", () => {
    expect(classifyPart({ refDes: "Q1", kind: "gullwing", text: "N-channel MOSFET 60 V" })).toBe("mosfet");
    expect(classifyPart({ refDes: "U7", kind: "gullwing", text: "MOSFET gate driver" })).toBeNull();
    expect(classifyPart({ refDes: "Q2", kind: "gullwing", text: "NPN transistor" })).toBeNull();
    expect(classifyPart({ refDes: "K1", kind: "generic" })).toBe("relay");
    expect(classifyPart({ refDes: "L3", kind: "molded" })).toBe("inductor");
    expect(classifyPart({ refDes: "J4", kind: "generic" })).toBe("connector");
    expect(classifyPart({ refDes: "X9", kind: "connector" })).toBe("connector");
    expect(classifyPart({ refDes: "R1", kind: "chip", text: "Resistor 10k" })).toBeNull();
  });

  it("counts those pins twice, and nothing else", () => {
    const parts = [part("R1"), part("L1", { kind: "molded", pkg: "IND-4x4", cls: "inductor" }), part("Q1", { kind: "gullwing", pkg: "SOT-23", pins: 3, pitchMm: 0.95, cls: "mosfet" }), part("J1", { mount: "THT", kind: "connector", pkg: "HDR-1x10", pins: 10, cls: "connector" })];
    const j = countJoints(parts);
    expect(j.total).toBe(2 + 2 + 3 + 10);
    expect(j.weighted).toBe(2 + 4 + 6 + 20);
    expect(j.doubled).toEqual({ parts: 3, pins: 15, byClass: { inductor: 1, mosfet: 1, connector: 1 } });
    expect(j.byPackage.find((r) => r.pkg === "HDR-1x10")!.factor).toBe(2);
    expect(j.byPackage.find((r) => r.pkg === "0603")!.factor).toBe(1);
    expect(pinFactor(part("R1"))).toBe(1);
  });

  it("keeps do-not-populate parts out of the count and counts them on their own", () => {
    const body = (kind: "chip" | "connector", pins: number) => ({ kind, length: 2, width: 1, height: 1, color: "#000", pins, pitch: 2.54 });
    const viewer = [
      { refDes: "R1", side: "TOP" as const, body: body("chip", 2), pkg: "0603", dnp: false },
      { refDes: "R2", side: "TOP" as const, body: body("chip", 2), pkg: "0603", dnp: true },
      { refDes: "J9", side: "TOP" as const, body: { ...body("connector", 6), shape: "header" as const }, pkg: "Header 1x6", dnp: true },
    ];
    const a = asmParts(viewer, [{ key: "place-top", side: "TOP", refs: ["R1"] }]);
    expect(a.parts.map((p) => p.refDes)).toEqual(["R1"]);
    expect(a.dnp.map((p) => [p.refDes, p.mount, p.cls ?? null])).toEqual([["R2", "SMT", null], ["J9", "THT", "connector"]]);
    expect(countJoints(a.parts).weighted).toBe(2);
    expect(countDnp(a.dnp)).toEqual({ parts: 2, pins: 8, weighted: 14, refs: ["R2", "J9"] });
    // Only the surface-mount DNP pads would take paste.
    expect(dnpPasteGrams(a.dnp)).toBeCloseTo(estimatePaste([part("R2")], null).gramsPerBoard * (ASSEMBLY.stencilUm.coarse / ASSEMBLY.stencilUm.coarse), 9);
    expect(dnpPasteGrams([])).toBe(0);
  });

  it("counts the pads of do-not-populate parts in the paste, but not as placements", () => {
    const placed = [part("R1"), part("R2")];
    const dnp = [part("R9"), part("J9", { mount: "THT", kind: "connector", pkg: "HDR-1x4", pins: 4 })];
    const without = estimatePaste(placed, null);
    const withDnp = estimatePaste(placed, null, undefined, dnp);
    expect(withDnp.gramsPerBoard).toBeCloseTo(without.gramsPerBoard * 1.5, 9);
    expect(withDnp.sides[0]).toMatchObject({ placements: 2, dnpParts: 1, apertures: 6 });
    // A measured paste layer already has those pads in its area.
    const m = { paste: { top: { apertures: 6, areaMm2: 4, source: "paste-layer" as const }, bottom: null }, holes: null };
    expect(estimatePaste(placed, m, undefined, dnp).gramsPerBoard).toBeCloseTo(estimatePaste(placed, m).gramsPerBoard, 9);
    // A side with only DNP parts is still printed.
    expect(estimatePaste([], null, undefined, [part("R9", { side: "BOTTOM" })]).sides.map((s) => [s.side, s.placements, s.dnpParts])).toEqual([["BOTTOM", 0, 1]]);
    // Switched off, they are left out.
    const off = { ...ASSEMBLY, dnp: { inPinCount: false, inPaste: false } } as unknown as typeof ASSEMBLY;
    expect(estimatePaste(placed, null, off, dnp).gramsPerBoard).toBeCloseTo(without.gramsPerBoard, 9);
    expect(pasteByPackage([...placed, ...dnp], withDnp).reduce((s, r) => s + r.grams, 0)).toBeCloseTo(withDnp.gramsPerBoard, 9);
    const checks = buildChecks(facts({ test: { pins: { weighted: 330, doubledParts: 7, dnpPins: 4 } } }));
    expect(checks.find((c) => c.key === "test.pins")!.detail).toContain("4 of them on DNP parts, counted but not soldered");
  });

  it("prints inductors and connectors with double paste", () => {
    const plain = estimatePaste([part("L1", { kind: "molded", pkg: "IND-4x4", lengthMm: 4, widthMm: 4 })], null);
    const heavy = estimatePaste([part("L1", { kind: "molded", pkg: "IND-4x4", lengthMm: 4, widthMm: 4, cls: "inductor" })], null);
    expect(heavy.gramsPerBoard).toBeCloseTo(plain.gramsPerBoard * 2, 9);
    expect(heavy.sides[0]).toMatchObject({ heavyParts: 1 });
    expect(heavy.sides[0].heavyExtraG).toBeCloseTo(plain.gramsPerBoard, 9);
    // A MOSFET counts double in pins but prints normally.
    expect(pasteFactor(part("Q1", { cls: "mosfet" }))).toBe(1);
    // Measured from the Gerbers: the heavy share is added on top of the measured area.
    const m = { paste: { top: { apertures: 4, areaMm2: 10, source: "paste-layer" as const }, bottom: null }, holes: null };
    const mixed = [part("R1"), part("L1", { kind: "molded", pkg: "IND-4x4", lengthMm: 4, widthMm: 4, cls: "inductor" })];
    expect(estimatePaste(mixed, m).gramsPerBoard).toBeGreaterThan(estimatePaste(mixed.map((p) => ({ ...p, cls: null })), m).gramsPerBoard);
    const rows = pasteByPackage(mixed, estimatePaste(mixed, null));
    expect(rows.reduce((s, r) => s + r.grams, 0)).toBeCloseTo(estimatePaste(mixed, null).gramsPerBoard, 9);
  });

  it("steps boards onto a panel", () => {
    // 100 × 80 on 330 × 250 with 5 mm rails and a 2 mm gap: turned, 4 along and 2 across.
    expect(panelise(100, 80)).toMatchObject({ cols: 4, rows: 2, boards: 8, rotated: true, oversize: false, lengthMm: 326, widthMm: 212 });
    const small = panelise(30, 20);
    expect(small.boards).toBe(small.cols * small.rows);
    expect(small.boards).toBeGreaterThan(60);
    expect(small.lengthMm).toBeLessThanOrEqual(ASSEMBLY.panel.maxLengthMm);
    expect(small.widthMm).toBeLessThanOrEqual(ASSEMBLY.panel.maxWidthMm);
    expect(panelise(400, 300)).toMatchObject({ boards: 1, oversize: true });
    // A long narrow board fits more when turned.
    expect(panelise(60, 300).boards).toBeGreaterThanOrEqual(panelise(300, 60).boards);
  });

  it("lists what a lot uses up, and masks only when the board is coated", () => {
    const parts = [part("R1"), part("J1", { cls: "connector" }), part("SW1"), part("TP3"), part("U1")];
    expect(maskedParts(parts).map((p) => p.refDes)).toEqual(["J1", "SW1", "TP3"]);
    const base = { qty: 100, boardAreaCm2: 80, paste: { perBoardG: 0.5, issueG: 204, cost: 1326, jars: 1 }, solder: { perBoardG: 0.1, lotG: 13, cost: 55 }, wave: true, sides: 2, boardsPerPanel: 6, coating: false, masked: 3, boxed: false };
    const plain = consumablesForLot(base);
    expect(plain.map((c) => c.key)).toEqual(["paste", "solder", "flux", "wipes", "bags"]);
    // 100 boards on panels of 6 are 17 panels, two sides: 34 prints, a wipe every 5.
    expect(plain.find((c) => c.key === "wipes")!.lot).toBe(7);
    expect(plain.find((c) => c.key === "flux")!.lot).toBeCloseTo(0.8 * ASSEMBLY.consumables.waveFluxMlPerDm2 * 100, 6);
    const coated = consumablesForLot({ ...base, coating: true });
    expect(coated.find((c) => c.key === "mask")).toMatchObject({ perBoard: 3, lot: 300 });
    expect(coated.find((c) => c.key === "coat")!.perBoard).toBeCloseTo(80 * 2 * ASSEMBLY.consumables.coatMlPerCm2, 6);
    expect(consumablesForLot({ ...base, paste: null, solder: null, wave: false, sides: 0 }).map((c) => c.key)).toEqual(["bags"]);
  });

  it("adds masking time to the coating stage and shows the new checks", () => {
    const input = { qty: 100, smt: [], tht: null, coating: true, test: { nets: 10, ict: false, program: false, line: null, shiftsPerDay: 1 }, box: null };
    const bare = planCapacity(input).stages.find((s) => s.key === "finish")!;
    const masked = planCapacity({ ...input, maskParts: 4 }).stages.find((s) => s.key === "finish")!;
    expect(masked.secondsPerBoard - bare.secondsPerBoard).toBe(4 * ASSEMBLY.consumables.maskSecPerPart);
    const checks = buildChecks(facts({ data: { dnp: { parts: 3, pins: 8 } }, tht: { coating: "Acrylic", coatCapable: true, masked: 5 }, test: { pins: { weighted: 512, doubledParts: 9 } } }));
    expect(checks.find((c) => c.key === "data.dnp")!.detail).toContain("3 designators marked DNP (8 pins)");
    expect(checks.find((c) => c.key === "tht.mask")).toMatchObject({ level: "amber" });
    expect(checks.find((c) => c.key === "test.pins")!.detail).toContain("512 pins");
    expect(buildChecks(facts()).some((c) => c.key === "tht.mask" || c.key === "data.dnp")).toBe(false);
  });
});

describe("SMT line, station by station", () => {
  const smtParts = board.filter((p) => p.mount === "SMT");
  const sheet = (over: Partial<Parameters<typeof smtLineSheet>[0]> = {}) =>
    smtLineSheet({
      qty: 100,
      parts: board,
      paste: estimatePaste(board, null).sides,
      panel: panelise(100, 80),
      passes: [
        { side: "BOTTOM", secondsPerBoard: 20, setupHours: 1.5 },
        { side: "TOP", secondsPerBoard: 30, setupHours: 1.5 },
      ],
      line: { code: "L1", name: "SMT 1", capacityCph: 30000, feederSlots: 60, hasSpi: true, hasAoi: true, hasXray: true },
      feeders: { needed: 6, slots: 60, setups: 1 },
      moistureSensitive: 0,
      board: { layers: 4, thicknessMm: 1.6 },
      ...over,
    });

  it("walks each side through printer, SPI, placement, reflow and AOI, with X-ray where joints hide", () => {
    const s = sheet();
    expect(s.sides.map((x) => [x.side, x.pass])).toEqual([["BOTTOM", 1], ["TOP", 2]]);
    expect(s.sides[0].stations.map((x) => x.key)).toEqual(["load", "print", "spi", "place", "reflow", "aoi"]);
    expect(s.sides[1].stations.map((x) => x.key)).toEqual(["load", "print", "spi", "place", "reflow", "aoi", "xray"]);
    expect(s.sides[1].stations[0].name).toBe("Flip and reload");
    expect(s.sides[1].placements).toBe(smtParts.filter((p) => p.side === "TOP").length);
    expect(s.sides[1].stations.find((x) => x.key === "xray")).toMatchObject({ inline: false });
  });

  it("lets the slowest in-line station set the takt, and works out the lot from it", () => {
    const s = sheet();
    const top = s.sides[1];
    // 8 boards a panel at 30 s a board: placement takes 240 s and nothing else in the line is slower.
    expect(top.stations.find((x) => x.key === "place")!.secPerPanel).toBe(240);
    expect(top.taktSec).toBe(240);
    expect(top.bottleneck).toBe("Pick and place");
    expect(top.boardsPerHour).toBeCloseTo(120, 6);
    expect(s.panels).toBe(13);
    expect(s.runHours).toBeCloseTo((13 * (240 + 160)) / 3600, 6);
    expect(s.setupHours).toBe(3);
    // A finished board has been round twice: 30 s + 20 s.
    expect(s.boardsPerShift).toBe(Math.floor((6.8 * 3600) / 50));
    // X-ray is beside the line, so it never sets the takt however long it takes.
    expect(top.stations.find((x) => x.key === "xray")!.secPerPanel).toBeGreaterThan(top.taktSec);
  });

  it("reports paste per board and per panel from the same estimate", () => {
    const s = sheet();
    const est = estimatePaste(board, null);
    expect(s.pasteGPerBoard).toBeCloseTo(est.gramsPerBoard, 9);
    expect(s.pasteGPerPanel).toBeCloseTo(est.gramsPerBoard * 8, 9);
  });

  it("flags an aperture the stencil cannot release, a missing SPI and extra feeder set-ups", () => {
    // 0.4 mm pitch through a 150 µm foil: a 0.2 mm slot has far too much wall.
    const qfp = part("U9", { kind: "quad", pkg: "LQFP-100", pins: 100, pitchMm: 0.4, lengthMm: 14, widthMm: 14 });
    expect(apertureAreaRatio(qfp, 150)).toBeLessThan(ASSEMBLY.smt.minAreaRatio);
    expect(apertureAreaRatio(part("R1", { pkg: "0805" }), 150)).toBeGreaterThan(ASSEMBLY.smt.minAreaRatio);
    expect(apertureAreaRatio(part("J1", { mount: "THT" }), 120)).toBeNull();
    const thick = sheet({ parts: [qfp], paste: [{ ...estimatePaste([qfp], null).sides[0], stencilUm: 150 }], passes: [{ side: "TOP", secondsPerBoard: 20, setupHours: 1 }] });
    expect(thick.sides[0].areaRatio!.ref).toBe("U9");
    expect(thick.sides[0].stations.find((x) => x.key === "print")).toMatchObject({ level: "amber" });
    const poor = sheet({ line: { code: "L9", name: "Old", capacityCph: 8000, feederSlots: 20, hasSpi: false, hasAoi: true, hasXray: false }, feeders: { needed: 45, slots: 20, setups: 3 } });
    expect(poor.sides[1].stations.find((x) => x.key === "spi")!.level).toBe("amber");
    expect(poor.sides[1].stations.find((x) => x.key === "place")!.watch.join(" ")).toContain("3 times");
    expect(poor.sides[1].stations.find((x) => x.key === "xray")!.level).toBe("amber");
    const checks = buildChecks(facts({ smt: { areaRatio: { value: 0.52, ref: "U9", min: 0.66 } } }));
    expect(checks.find((c) => c.key === "smt.release")).toMatchObject({ level: "amber" });
    expect(buildChecks(facts({ smt: { areaRatio: { value: 0.9, ref: "R1", min: 0.66 } } })).find((c) => c.key === "smt.release")!.level).toBe("green");
  });
});

describe("paste by package", () => {
  it("shares each side's paste out by pad area and adds up to the board", () => {
    const e = estimatePaste(board, null);
    const rows = pasteByPackage(board, e);
    expect(rows.reduce((s, r) => s + r.grams, 0)).toBeCloseTo(e.gramsPerBoard, 9);
    expect(rows.reduce((s, r) => s + r.sharePct, 0)).toBeCloseTo(100, 6);
    expect(rows.map((r) => r.pkg)).not.toContain("HDR-1x10");
    const r0603 = rows.find((r) => r.pkg === "0603")!;
    expect(r0603.parts).toBe(10);
    expect(r0603.apertures).toBe(20);
    expect(r0603.gramsEach).toBeCloseTo(r0603.grams / 10, 9);
    expect(rows[0].grams).toBeGreaterThanOrEqual(rows[1].grams);
  });

  it("still adds up when the side was measured from the Gerbers", () => {
    const e = estimatePaste(board, { paste: { top: { apertures: 400, areaMm2: 300, source: "paste-layer" }, bottom: null }, holes: null });
    expect(pasteByPackage(board, e).reduce((s, r) => s + r.grams, 0)).toBeCloseTo(e.gramsPerBoard, 9);
    expect(pasteByPackage([], estimatePaste([], null))).toEqual([]);
  });
});

describe("expenses against the price", () => {
  const process = {
    steps: [
      { key: "print-top", stage: "smt" as const, title: "Print paste", perBoard: 2, perLot: 100, seconds: null, note: "" },
      { key: "place-top", stage: "smt" as const, title: "Place", perBoard: 20, perLot: 4800, seconds: 22, note: "" },
      { key: "fct", stage: "test" as const, title: "Functional test", perBoard: 30, perLot: 0, seconds: null, note: "" },
    ],
    nre: [{ key: "stencil", label: "Stencil", amount: 4500 }],
  };
  const input = { qty: 100, board: { unit: 50, nre: 3000 }, components: { perBoard: 400, moqExcess: 2000, unpriced: 0 }, box: null };

  it("splits the price into material, consumables, line work, handling and margin", () => {
    const q = quoteForQty(input, process, DEFAULT_RATES);
    const x = analyseExpenses(q, { chargeMoqExcess: true });
    // Material: board 50 + components 400 + MOQ left-overs 2000 / 100.
    expect(x.perBoard.material).toBeCloseTo(470, 6);
    expect(x.perBoard.consumables).toBeCloseTo(3, 6);
    expect(x.perBoard.process).toBeCloseTo(20 + 48 + 30, 6);
    expect(x.perBoard.spend + x.perBoard.handling + x.perBoard.margin).toBeCloseTo(q.unitPrice, 6);
    expect(x.lot.price).toBeCloseTo(q.lotPrice, 6);
    expect(x.uncharged).toEqual([]);
    expect(x.keptLot).toBeCloseTo(x.lot.handling + x.lot.margin, 6);
    expect(x.lines.reduce((s, l) => s + l.pctOfPrice, 0) + ((x.perBoard.handling + x.perBoard.margin) / q.unitPrice) * 100).toBeCloseTo(100, 6);
    // A 12 % mark-up is less than 12 % of the price.
    expect(x.marginPctOfPrice).toBeCloseTo((12 / 112) * 100, 6);
    expect(x.invoice).toBeCloseTo(q.lotPrice + 7500, 6);
    expect(x.cashOut).toBeCloseTo(47000 + 7500, 6);
  });

  it("takes what the price does not carry out of what is left", () => {
    const q = quoteForQty(input, process, { ...DEFAULT_RATES, chargeMoqExcess: false });
    const x = analyseExpenses(q, { chargeMoqExcess: false, solderLot: 300 });
    expect(x.perBoard.material).toBeCloseTo(450, 6);
    expect(x.uncharged.map((u) => u.key)).toEqual(["moq", "solder"]);
    expect(x.unchargedLot).toBe(2300);
    expect(x.keptLot).toBeCloseTo(x.lot.handling + x.lot.margin - 2300, 6);
    expect(x.cashOut).toBeCloseTo(45000 + 2300 + 7500, 6);
  });

  it("shows what a material price rise leaves, and where it breaks even", () => {
    const x = analyseExpenses(quoteForQty(input, process, DEFAULT_RATES), { chargeMoqExcess: true });
    expect(x.whatIf.map((w) => w.materialUpPct)).toEqual([5, 10]);
    expect(x.whatIf[0].keptLot).toBeCloseTo(x.keptLot - 0.05 * x.lot.material, 6);
    expect(x.whatIf[1].keptLot).toBeLessThan(x.whatIf[0].keptLot);
    const be = x.breakEvenMaterialUpPct!;
    expect(x.keptLot - (x.lot.material * be) / 100).toBeCloseTo(0, 6);
  });
});

describe("measuring the Gerbers", () => {
  const read = (d: string) => {
    const dir = path.join(process.cwd(), "samples/board", d);
    return readdirSync(dir).map((name) => ({ name, text: readFileSync(path.join(dir, name), "utf8") }));
  };

  it("measures the paste layer and counts the drills (GW-200)", () => {
    const m = measureFab(read("GW-200"))!;
    expect(m.paste.top).toMatchObject({ source: "paste-layer", apertures: 335 });
    expect(m.paste.top!.areaMm2).toBeGreaterThan(250);
    expect(m.paste.top!.areaMm2).toBeLessThan(300);
    expect(m.paste.bottom).toBeNull();
    expect(m.holes).toEqual({ plated: 118, component: 36, vias: 82, nonPlated: 0 });
  });

  it("falls back to mask openings when there is no paste layer (CTRL-01)", () => {
    const m = measureFab(read("CTRL-01"))!;
    expect(m.paste.top!.source).toBe("mask-openings");
    expect(m.paste.top!.apertures).toBeGreaterThan(100);
    expect(m.holes!.nonPlated).toBe(4);
    expect(readFab(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(readFab("nonsense")).toBeNull();
  });
});

describe("shifts for a lot", () => {
  const input = {
    qty: 1000,
    smt: [{ side: "TOP" as const, line: "L1", placements: 100, secondsPerBoard: 36, setupHours: 1, shiftsPerDay: 2 }],
    tht: { parts: 6, joints: 30, selective: false, pressFitParts: 0, line: "L3", shiftsPerDay: 1 },
    coating: false,
    test: { nets: 60, ict: false, program: true, line: "L3", shiftsPerDay: 1 },
    box: null,
  };

  it("turns seconds a board into hours, shifts and days on each line's pattern", () => {
    const c = planCapacity(input);
    expect(c.hoursPerShift).toBeCloseTo(6.8, 6);
    const smt = c.stages.find((s) => s.key === "smt-top")!;
    expect(smt.runHours).toBeCloseTo(10, 6);
    expect(smt.hours).toBeCloseTo(11, 6);
    expect(smt.shifts).toBeCloseTo(11 / 6.8, 6);
    expect(smt.days).toBeCloseTo(11 / 6.8 / 2, 6);
    expect(c.stages.map((s) => s.key)).toEqual(["smt-top", "tht", "test", "pack"]);
    expect(c.totalShifts).toBeCloseTo(c.totalHours / 6.8, 6);
    expect(c.days).toBeCloseTo(c.stages.reduce((s, x) => s + x.days, 0), 6);
    expect(c.bottleneck).toBe([...c.stages].sort((a, b) => b.hours - a.hours)[0].key);
  });

  it("halves the days at two shifts a day and grows with the quantity", () => {
    const c = planCapacity(input);
    expect(c.daysAt.map((d) => d.shiftsPerDay)).toEqual([1, 2, 3]);
    expect(c.daysAt[1].days).toBeCloseTo(c.daysAt[0].days / 2, 6);
    expect(planCapacity({ ...input, qty: 5000 }).totalShifts).toBeGreaterThan(c.totalShifts * 4);
  });

  it("adds a stage for each SMT side, coating and box build", () => {
    const c = planCapacity({ ...input, smt: [...input.smt, { ...input.smt[0], side: "BOTTOM" as const }], coating: true, box: { minutesPerUnit: 12, line: "L4", shiftsPerDay: 1 } });
    expect(c.stages.map((s) => s.key)).toEqual(["smt-top", "smt-bottom", "tht", "finish", "test", "box", "pack"]);
  });
});

const facts = (over: Partial<{ [K in keyof Facts]: Partial<Facts[K]> }> = {}): Facts => {
  const base: Facts = {
    revisionId: "rev1",
    qty: 500,
    data: { boardSource: "gerber", placed: true, pasteSource: "paste-layer", lines: 20, unmatched: 0, assumedPins: 0, parts: 120 },
    board: { chosen: true, auto: false, fits: true, name: "Fab A", gaps: [], layers: 4, sizeMm: [100, 80], leadDays: 10 },
    parts: { counted: 20, unpriced: 0, short: 0, redRisk: 0, amberRisk: 0 },
    smt: { placements: 110, sides: 1, joints: 420, line: "L1 (SMT 1)", lineGaps: [], finestPitchMm: 0.5, smallestChip: "0603", hidden: 0, xray: true, feeders: { needed: 18, slots: 60, setups: 1 }, moistureSensitive: 0, watch: [], stencilUm: 120, pasteG: 0.42 },
    tht: { parts: 4, joints: 24, selective: false, solderCapable: true, pressFit: 0, pressFitCapable: false, coating: null, coatCapable: false },
    test: { inspected: { spi: 420, aoi: 420, xray: 0, tht: 24 }, nets: 148, ict: false, probeCapable: true, programmable: 1, fct: true },
    box: { wanted: false, name: null, fits: true, fitText: "", kitGaps: 0, priced: true },
    cost: { unitPrice: 812.5, unpriced: 0, boardPriced: true, marginPct: 15, pastePerBoard: 3.1, text: "₹812.50 a board." },
    capacity: { shifts: 4.2, days: 3, bottleneck: "SMT", materialLeadDays: 21, lotHours: 28.5 },
  };
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) out[k] = typeof v === "object" && v ? { ...(base as unknown as Record<string, object>)[k], ...v } : v;
  return out as Facts;
};

const who = { id: "u1", name: "Asha", canWaive: false };
const quality = { id: "u2", name: "Ravi", canWaive: true };
const now = new Date("2026-11-12T10:00:00Z");

describe("checks and verdict", () => {
  it("puts every check in a known gate and every gate has a check", () => {
    const checks = buildChecks(facts());
    const keys = GATES.map((g) => g.key) as string[];
    expect(checks.every((c) => keys.includes(c.gate))).toBe(true);
    for (const g of GATES) expect(checks.some((c) => c.gate === g.key)).toBe(true);
    expect(new Set(checks.map((c) => c.key)).size).toBe(checks.length);
  });

  it("calls a clean product easy to build", () => {
    const v = verdict(buildChecks(facts()));
    expect(v.reds).toBe(0);
    expect(v.level).toBe("green");
    expect(v.label).toBe("Easy to build");
  });

  it("goes amber when several things need care", () => {
    const v = verdict(buildChecks(facts({ data: { boardSource: "spec", placed: false, pasteSource: "packages" }, smt: { finestPitchMm: 0.4 } })));
    expect(v.level).toBe("amber");
    expect(v.label).toBe("Buildable with care");
  });

  it("goes red when no line fits, hidden joints have no X-ray, or a line has no price", () => {
    const noLine = buildChecks(facts({ smt: { lineGaps: ["L1: pitch 0.3 mm"] } }));
    expect(noLine.find((c) => c.key === "smt.line")!.level).toBe("red");
    expect(verdict(noLine).label).toBe("Not buildable as it stands");
    expect(buildChecks(facts({ smt: { hidden: 2, xray: false } })).find((c) => c.key === "test.xray")!.level).toBe("red");
    const unpriced = buildChecks(facts({ parts: { unpriced: 3 }, cost: { unpriced: 3 } }));
    expect(unpriced.filter((c) => c.level === "red").map((c) => c.key)).toEqual(["parts.priced", "cost.complete"]);
  });
});

describe("gated sign-off", () => {
  const signAll = (checks = buildChecks(facts())) => {
    let s: Signoff[] = [];
    for (const g of GATES) {
      const r = sign(checks, s, { gate: g.key, note: "", waivers: {} }, who, now);
      if ("error" in r) throw new Error(r.error);
      s = r.signoffs;
    }
    return s;
  };

  it("opens only the first unsigned gate", () => {
    const checks = buildChecks(facts());
    expect(gateStates(checks, []).map((g) => g.status)).toEqual(["open", ...Array(8).fill("waiting")]);
    const r = sign(checks, [], { gate: "data", note: " ok ", waivers: {} }, who, now);
    if ("error" in r) throw new Error(r.error);
    expect(r.signoffs[0]).toMatchObject({ gate: "data", by: "u1", byName: "Asha", note: "ok", at: now.toISOString() });
    expect(gateStates(checks, r.signoffs).map((g) => g.status).slice(0, 3)).toEqual(["signed", "open", "waiting"]);
  });

  it("refuses to skip ahead", () => {
    const r = sign(buildChecks(facts()), [], { gate: "smt", note: "", waivers: {} }, who, now);
    expect(r).toEqual({ error: "Sign gate 1, Files & data, first — the gates go in order." });
  });

  it("never signs a gate twice — there is no way back", () => {
    const checks = buildChecks(facts());
    const first = sign(checks, [], { gate: "data", note: "", waivers: {} }, who, now) as { signoffs: Signoff[] };
    const again = sign(checks, first.signoffs, { gate: "data", note: "changed my mind", waivers: {} }, quality, now);
    expect("error" in again && again.error).toMatch(/signed and locked/);
  });

  it("blocks a red check until Quality waives it with a reason", () => {
    const checks = buildChecks(facts({ data: { lines: 0 } }));
    expect(sign(checks, [], { gate: "data", note: "", waivers: {} }, who, now)).toMatchObject({ error: expect.stringContaining("is red") });
    expect(sign(checks, [], { gate: "data", note: "", waivers: { "data.bom": "customer will send it" } }, who, now)).toEqual({ error: "Only Quality or an administrator can waive a red check." });
    expect(sign(checks, [], { gate: "data", note: "", waivers: { "data.bom": "short" } }, quality, now)).toMatchObject({ error: expect.stringContaining("fuller reason") });
    const ok = sign(checks, [], { gate: "data", note: "", waivers: { "data.bom": "customer will send it Monday" } }, quality, now);
    expect("signoffs" in ok && ok.signoffs[0].waived).toEqual([{ check: "data.bom", label: "BoM lines read", reason: "customer will send it Monday" }]);
  });

  it("passes the review only when all nine gates are signed", () => {
    const all = signAll();
    expect(all).toHaveLength(9);
    expect(reviewPassed(all)).toBe(true);
    expect(reviewPassed(all.slice(0, 8))).toBe(false);
  });

  it("flags a signed gate when the product changes afterwards, without reopening it", () => {
    const all = signAll();
    const later = buildChecks(facts({ smt: { placements: 140 } }));
    const states = gateStates(later, all);
    expect(states.find((g) => g.key === "smt")).toMatchObject({ status: "signed", changed: true });
    expect(states.find((g) => g.key === "board")).toMatchObject({ status: "signed", changed: false });
    // The record keeps what was signed.
    expect(all.find((s) => s.gate === "smt")!.record.find((r) => r.label === "A line that can build it")!.detail).toContain("110 placements");
  });

  it("reads stored sign-offs defensively", () => {
    expect(readSignoffs(null)).toEqual([]);
    expect(readSignoffs([{ gate: "nope", at: "x" }, null, { gate: "data", at: now.toISOString() }])).toHaveLength(1);
    const checks = buildChecks(facts()).filter((c) => c.gate === "data");
    expect(fingerprint(checks)).toContain("data.bom=green:20/120");
  });
});
