import { describe, expect, it } from "vitest";
import { classifyLayer, fileFunctionFor, layerComment, looksExcellon, looksGerber } from "@/lib/board/layers";
import { CAM_NAMES, innerLayerIndex, layerFromWords } from "@/lib/board/cam-names";
import { writeExcellon, writeGerber } from "@/lib/board/gerber-write";
import { cutHoles, findGrid, panelFacts, sameInEvery } from "@/lib/board/panel";
import { normaliseBoardSet } from "@/lib/board/normalise";
import { sortBoardFiles } from "@/lib/board/upload";
import { boundsOf, identifyLayer, parseExcellon, parseGerber, type CfShape } from "@/vendor/circuitflow/gerber-entry";
import { findParts } from "@/lib/board/find-parts";
import { measureFab } from "@/lib/board/fab-measure";

/** A CAM station's export: inches, 2.6 format, the layer named in a comment, apertures picked with G54. */
const camFile = (layer: string, body: string) =>
  [`G04 -- output software:cam station v3 *`, `G04 -- stepname:set*`, `G04 -- layer:${layer}*`, `*`, `%FSLAX26Y26*%`, `%MOIN*%`, `%ADD10C,0.019685*%`, `%ADD11R,0.039370X0.019685*%`, `G75*`, `G90*`, body, `M02*`].join("\n");

const rect = (x: number, y: number, w: number, h: number, width = 0.15): CfShape => ({ k: "stroke", w: width, pts: [[x, y], [x, y + h], [x + w, y + h], [x + w, y], [x, y]] });
const pad = (x: number, y: number, w = 0.6, h = 0.5): CfShape => ({ k: "poly", pts: [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]] });
const dot = (x: number, y: number, d: number): CfShape => ({ k: "circle", x, y, r: d / 2 });

/**
 * A made-up panel shaped like a real one: boards of 20 × 10 mm, 3 across and 2 up, 2 mm apart, a 5 mm rail top and
 * bottom, mouse bites in the gaps, four tooling holes and three fiducials in the rails.
 */
function panel() {
  const W = 20;
  const H = 10;
  const origins: [number, number][] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) origins.push([c * 22, 7 + r * 12]);
  const width = 3 * W + 2 * 2;
  const top = 7 + 2 * H + 2 + 2;
  const outline: CfShape[] = [...origins.map(([x, y]) => rect(x, y, W, H)), rect(0, 0, width, 5, 0.3), rect(0, top, width, 5, 0.3)];
  const copper: CfShape[] = [];
  const mask: CfShape[] = [];
  const holes: CfShape[] = [];
  for (const [x, y] of origins) {
    // Two chip parts, a four-pin header and two vias on every board.
    for (const [px, py] of [[4, 3], [5.2, 3], [10, 6], [11.2, 6]] as const) {
      copper.push(pad(x + px, y + py));
      mask.push(pad(x + px, y + py, 0.7, 0.6));
    }
    for (let i = 0; i < 4; i++) {
      copper.push(dot(x + 4 + i * 2.54, y + 8.5, 1.6));
      mask.push(dot(x + 4 + i * 2.54, y + 8.5, 1.8));
      holes.push(dot(x + 4 + i * 2.54, y + 8.5, 0.9));
    }
    copper.push(dot(x + 15, y + 2, 0.6), dot(x + 16, y + 4, 0.6));
    holes.push(dot(x + 15, y + 2, 0.3), dot(x + 16, y + 4, 0.3));
  }
  // Panel-only: fiducials and tooling holes in the rails, mouse bites in the gaps.
  for (const [fx, fy] of [[5, 2.5], [width - 5, 2.5], [5, top + 2.5]] as const) {
    copper.push(dot(fx, fy, 1));
    mask.push(dot(fx, fy, 2));
  }
  for (const [tx, ty] of [[2, 2.5], [width - 2, 2.5], [2, top + 2.5], [width - 3, top + 2.5]] as const) holes.push(dot(tx, ty, 2));
  for (let i = 0; i < 5; i++) for (const gx of [20.3, 21.7, 42.3, 43.7]) for (const y0 of [9, 21]) holes.push(dot(gx, y0 + i * 0.8, 0.5));
  return {
    files: [
      { name: "tl", text: camHeader("tl") + writeGerber(copper) },
      { name: "ts", text: camHeader("ts") + writeGerber(mask) },
      { name: "ko", text: camHeader("ko") + writeGerber(outline) },
      { name: "drl", text: camHeader("drl") + writeGerber(holes) },
      { name: "sk", text: camHeader("sk") + writeGerber(origins.map(([x, y]) => dot(x + 15, y + 2, 0.5))) },
    ],
    outline,
    copper,
  };
}
const camHeader = (layer: string) => `G04 -- layer:${layer}*\n`;

describe("fabrication file names", () => {
  const G = "%FSLAX26Y26*%\n%MOIN*%\n%ADD10C,0.01*%\nD10*\nX0Y0D03*\nM02*\n";
  const X = "M48\nMETRIC\nT01C0.300\n%\nT01\nX1.0Y1.0\nM30\n";

  it("reads the short names a CAM station writes, with no extension", () => {
    expect(classifyLayer("tl", G)).toMatchObject({ type: "copper", side: "top" });
    expect(classifyLayer("bl", G)).toMatchObject({ type: "copper", side: "bottom" });
    expect(classifyLayer("ts", G)).toMatchObject({ type: "soldermask", side: "top" });
    expect(classifyLayer("bs", G)).toMatchObject({ type: "soldermask", side: "bottom" });
    expect(classifyLayer("to", G)).toMatchObject({ type: "silkscreen", side: "top" });
    expect(classifyLayer("bo", G)).toMatchObject({ type: "silkscreen", side: "bottom" });
    expect(classifyLayer("ko", G)).toMatchObject({ type: "outline" });
    expect(classifyLayer("drl", G)).toMatchObject({ type: "drill" });
    expect(classifyLayer("l2", G)).toMatchObject({ type: "copper", side: "inner", index: 2 });
    expect(classifyLayer("sk", G)).toMatchObject({ type: "drawing", label: "Via plugging" });
  });

  it("believes a comment in the file's head when the name says nothing", () => {
    expect(layerComment(camFile("tl", ""))).toBe("tl");
    expect(classifyLayer("job_0001", camFile("bs", ""))).toMatchObject({ type: "soldermask", side: "bottom" });
    expect(classifyLayer("file3", `G04 Layer: BottomSilkLayer*\n${G}`)).toMatchObject({ type: "silkscreen", side: "bottom" });
    expect(classifyLayer("file4", `G04 Layer: TopPasteMaskLayer*\n${G}`)).toMatchObject({ type: "solderpaste", side: "top" });
  });

  it("still reads extensions, KiCad names and X2 attributes, and words in the name", () => {
    expect(classifyLayer("board.GTL")).toMatchObject({ type: "copper", side: "top" });
    expect(classifyLayer("board.cmp")).toMatchObject({ type: "copper", side: "top" });
    expect(classifyLayer("board.smb")).toMatchObject({ type: "soldermask", side: "bottom" });
    expect(classifyLayer("amp-B_Cu.gbr")).toMatchObject({ type: "copper", side: "bottom" });
    expect(classifyLayer("x.gbr", `%TF.FileFunction,Legend,Top*%\n${G}`)).toMatchObject({ type: "silkscreen", side: "top" });
    expect(classifyLayer("SOLDERMASK_TOP.art", G)).toMatchObject({ type: "soldermask", side: "top" });
    expect(classifyLayer("Top Copper.pho", G)).toMatchObject({ type: "copper", side: "top" });
    expect(classifyLayer("board outline.gbr", G)).toMatchObject({ type: "outline" });
  });

  it("tells a drill file by what is in it, and a note from a drill file", () => {
    expect(looksExcellon(X)).toBe(true);
    expect(looksGerber(X)).toBe(false);
    expect(classifyLayer("holes", X)).toMatchObject({ type: "drill" });
    expect(classifyLayer("drill.txt", X)).toMatchObject({ type: "drill" });
    expect(classifyLayer("readme.txt", "Please build 100 pieces.")).toMatchObject({ type: "unknown" });
    expect(classifyLayer("notes", "Please build 100 pieces.")).toMatchObject({ type: "unknown" });
    // A picture of the holes is a drawing, not the holes.
    expect(classifyLayer("drill_drawing.gbr", G)).toMatchObject({ type: "drawing" });
  });

  it("keeps one name table, with no name meaning two things in one group", () => {
    for (const g of CAM_NAMES) expect(Object.keys(g.names).length).toBeGreaterThan(3);
    expect(layerFromWords("GTL")).toMatchObject({ type: "copper", side: "top" });
    expect(layerFromWords("Bottom Overlay")).toMatchObject({ type: "silkscreen", side: "bottom" });
    expect(layerFromWords("customer notes")).toBeNull();
    expect(innerLayerIndex("in1")).toBe(2);
    expect(innerLayerIndex("g3")).toBe(3);
    expect(innerLayerIndex("l1")).toBeNull();
  });

  it("writes the X2 file function for what it recognised", () => {
    expect(fileFunctionFor({ type: "copper", side: "top" }, 4)).toBe("Copper,L1,Top");
    expect(fileFunctionFor({ type: "copper", side: "bottom" }, 4)).toBe("Copper,L4,Bot");
    expect(fileFunctionFor({ type: "copper", side: "inner", index: 3 }, 4)).toBe("Copper,L3,Inr");
    expect(fileFunctionFor({ type: "silkscreen", side: "bottom" })).toBe("Legend,Bot");
    expect(fileFunctionFor({ type: "outline", side: "all" })).toBe("Profile,NP");
    expect(fileFunctionFor({ type: "drawing", side: "all" })).toBeNull();
  });
});

describe("writing Gerber and drill files", () => {
  it("writes shapes a Gerber reader reads back the same", () => {
    const shapes: CfShape[] = [
      dot(1, 2, 0.8),
      pad(5, 5, 1.2, 0.6),
      { k: "stroke", w: 0.2, pts: [[0, 0], [10, 0], [10, 4]] },
      { k: "poly", region: true, pts: [[2, 2], [4, 2], [3, 4]] },
      { k: "circle", x: 3, y: 2.6, r: 0.2, pol: "C" },
    ];
    const text = writeGerber(shapes, { fileFunction: "Copper,L1,Top", comments: ["made up"] });
    expect(text).toContain("%TF.FileFunction,Copper,L1,Top*%");
    expect(text).toContain("%MOMM*%");
    const back = parseGerber(text).objects as unknown as CfShape[];
    expect(back.map((o) => o.k)).toEqual(["circle", "poly", "stroke", "poly", "circle"]);
    expect(back[0]).toMatchObject({ x: 1, y: 2, r: 0.4 });
    // A rectangular pad stays a flash (a pad), not a drawn region.
    expect((back[1] as { region?: boolean }).region).toBeFalsy();
    expect((back[3] as { region?: boolean }).region).toBe(true);
    expect(back[4].pol).toBe("C");
    const b = boundsOf(back)!;
    expect(b.maxX).toBeCloseTo(10.1, 3);
  });

  it("writes holes and slots a drill reader reads back the same", () => {
    const text = writeExcellon([{ x: 1.5, y: 2.5, d: 0.4 }, { x: 3, y: 2.5, d: 0.4 }, { x: 7, y: 1, d: 0.9 }], [{ x1: 10, y1: 5, x2: 12, y2: 5, d: 1.25 }]);
    const back = parseExcellon(text);
    expect(back.hits.map((h) => [h.x, h.y, h.d])).toEqual([[1.5, 2.5, 0.4], [3, 2.5, 0.4], [7, 1, 0.9]]);
    expect(back.slots).toHaveLength(1);
    expect(back.slots[0]).toMatchObject({ x1: 10, x2: 12, d: 1.25 });
    expect(back.plated).toBe(true);
    expect(parseExcellon(writeExcellon([{ x: 0, y: 0, d: 2 }], [], { plated: false })).plated).toBe(false);
  });
});

describe("panels", () => {
  it("finds the same board repeated on a grid", () => {
    const p = panel();
    const grid = findGrid(p.outline)!;
    expect(grid).toMatchObject({ columns: 3, rows: 2, unit: { width: 20, height: 10 }, pitch: { x: 22, y: 12 }, method: "outlines" });
    expect(grid.windows[0]).toMatchObject({ minX: 0, minY: 7, maxX: 20, maxY: 17 });
    expect(sameInEvery(grid, p.copper)).toBe(true);
  });

  it("does not call one board with cut-outs a panel", () => {
    const board: CfShape[] = [rect(0, 0, 80, 60), rect(10, 10, 12, 8), rect(40, 10, 12, 8), rect(10, 40, 12, 8), rect(40, 40, 12, 8)];
    const grid = findGrid(board);
    // The four windows repeat, but there is no artwork inside a hole.
    const copper = [pad(5, 5), pad(30, 30), pad(70, 50)];
    expect(grid ? sameInEvery(grid, copper) : false).toBe(false);
    expect(findGrid([rect(0, 0, 80, 60)])).toBeNull();
  });

  it("reads a V-scored panel: one frame cut by score lines, rails at the ends", () => {
    const outline: CfShape[] = [
      rect(0, 0, 100, 70),
      { k: "stroke", w: 0.1, pts: [[50, 0], [50, 70]] },
      { k: "stroke", w: 0.1, pts: [[0, 5], [100, 5]] },
      { k: "stroke", w: 0.1, pts: [[0, 35], [100, 35]] },
      { k: "stroke", w: 0.1, pts: [[0, 65], [100, 65]] },
    ];
    const grid = findGrid(outline)!;
    expect(grid).toMatchObject({ columns: 2, rows: 2, unit: { width: 50, height: 30 }, method: "score-lines" });
    const facts = panelFacts(grid, outline, []);
    expect(facts).toMatchObject({ count: 4, breakaway: "v-score", gap: { x: 0, y: 0 }, rails: { left: 0, right: 0, top: 5, bottom: 5 }, size: { width: 100, height: 70 } });
  });

  it("leaves the panel's own holes out of a board", () => {
    const p = panel();
    const grid = findGrid(p.outline)!;
    const holes = [{ x: 4, y: 15.5, d: 0.9 }, { x: 15, y: 9, d: 0.3 }, { x: 20.3, y: 9, d: 0.5 }, { x: 20.3, y: 9.8, d: 0.5 }, { x: 2, y: 2.5, d: 2 }];
    const cut = cutHoles(holes, [], grid, grid.windows[0]);
    expect(cut.holes).toEqual([{ x: 4, y: 8.5, d: 0.9 }, { x: 15, y: 2, d: 0.3 }]);
  });

  it("cuts a panel upload down to one board and keeps the panel's figures", () => {
    const { gerbers, panel: facts, notes } = normaliseBoardSet(panel().files);
    expect(facts).toMatchObject({
      columns: 3,
      rows: 2,
      count: 6,
      unit: { width: 20, height: 10 },
      gap: { x: 2, y: 2 },
      size: { width: 64, height: 36 },
      rails: { left: 0, right: 0, top: 5, bottom: 5 },
      toolingHoles: 4,
      fiducials: 3,
      mouseBites: 40,
      breakaway: "mouse-bites",
    });
    expect(notes[0]).toMatch(/panel of 6 boards/);
    const by = Object.fromEntries(gerbers.map((g) => [g.name, g.text]));
    // The outline is now one 20 × 10 board at 0,0.
    const outline = boundsOf(parseGerber(by.ko).objects)!;
    expect([outline.minX, outline.minY].map((v) => Math.abs(Math.round(v)))).toEqual([0, 0]);
    expect([outline.maxX, outline.maxY].map((v) => Math.round(v))).toEqual([20, 10]);
    // One board's copper: four pads, four header pads, two via pads — no fiducial.
    expect(parseGerber(by.tl).objects).toHaveLength(10);
    // The drill file is Excellon now: four header holes and two vias; no tooling hole, no mouse bite.
    expect(looksExcellon(by.drl)).toBe(true);
    const drill = parseExcellon(by.drl);
    expect(drill.hits).toHaveLength(6);
    expect(drill.hits.filter((h) => h.d === 0.9)).toHaveLength(4);
    // Both readers agree on every layer.
    expect(classifyLayer("tl", by.tl)).toMatchObject({ type: "copper", side: "top" });
    expect(identifyLayer("tl", by.tl)).toMatchObject({ kind: "copper", side: "top" });
    expect(identifyLayer("ts", by.ts)).toMatchObject({ kind: "mask", side: "top" });
    expect(identifyLayer("ko", by.ko)).toMatchObject({ kind: "outline" });
    expect(identifyLayer("drl", by.drl)).toMatchObject({ kind: "drill" });
    expect(classifyLayer("sk", by.sk)).toMatchObject({ type: "drawing", label: "Via plugging" });
  });

  it("lets the part reader and the hole count see one board, not six", () => {
    const { gerbers } = normaliseBoardSet(panel().files);
    const found = findParts(gerbers);
    expect(found.parts.length).toBeGreaterThan(0);
    expect(found.parts.length).toBeLessThan(8);
    expect(measureFab(gerbers)?.holes).toMatchObject({ plated: 6, component: 4, vias: 2 });
  });
});

describe("a single board from a CAM station", () => {
  const board = [
    { name: "tl", text: camFile("tl", "G54D11*\nX0393701Y0196850D03*\nX0787402Y0196850D03*") },
    { name: "ko", text: camFile("ko", "G54D10*\nX0Y0D02*\nX1181102Y0D01*\nX1181102Y0787402D01*\nX0Y0787402D01*\nX0Y0D01*") },
    { name: "drl", text: camFile("drl", "G54D10*\nX0393701Y0393701D03*\nX0787402Y0393701D03*") },
  ];

  it("names the layers, stamps them and turns the Gerber-format drill into holes", () => {
    const { gerbers, panel: facts, notes } = normaliseBoardSet(board);
    expect(facts).toBeNull();
    const by = Object.fromEntries(gerbers.map((g) => [g.name, g.text]));
    expect(by.tl.startsWith("%TF.FileFunction,Copper,L1,Top*%")).toBe(true);
    expect(by.ko.startsWith("%TF.FileFunction,Profile,NP*%")).toBe(true);
    // The rest of the file is untouched.
    expect(by.tl).toContain("G04 -- layer:tl*");
    const drill = parseExcellon(by.drl);
    expect(drill.hits).toHaveLength(2);
    expect(drill.hits[0].d).toBeCloseTo(0.5, 3);
    expect(drill.hits[0].x).toBeCloseTo(10, 3);
    expect(notes.join(" ")).toMatch(/drill file came as a Gerber/);
  });

  it("goes through the upload as layers, not as skipped files", () => {
    const enc = new TextEncoder();
    const sorted = sortBoardFiles(board.map((f) => ({ name: f.name, bytes: enc.encode(f.text) })));
    expect(sorted.skipped).toEqual([]);
    expect(sorted.gerbers.map((g) => g.name).sort()).toEqual(["drl", "ko", "tl"]);
    expect(sorted.panel).toBeNull();
  });

  it("leaves a set that already says what it is exactly as it came", () => {
    const x2 = { name: "amp-F_Cu.gbr", text: "%TF.FileFunction,Copper,L1,Top*%\n%FSLAX46Y46*%\n%MOMM*%\n%ADD10C,0.5*%\nD10*\nX1000000Y1000000D03*\nM02*\n" };
    const drl = { name: "amp.drl", text: "M48\nMETRIC\nT01C0.300\n%\nT01\nX1.0Y1.0\nM30\n" };
    const { gerbers, notes } = normaliseBoardSet([x2, drl]);
    expect(gerbers).toEqual([x2, drl]);
    expect(notes).toEqual([]);
  });
});
