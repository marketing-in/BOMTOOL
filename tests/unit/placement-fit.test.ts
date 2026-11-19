import { describe, expect, it } from "vitest";
import { padsFromLayerSvg, placementFit, type FitPlacement } from "@/lib/board/placement-fit";
import { matchFootprints, matchNote } from "@/lib/board/footprint-match";
import { findMismatches } from "@/lib/bom/mismatch";

/** A gerber-to-svg layer drawing with pad flashes at the given Gerber points (mm unless `inch`). */
const layer = (pts: [number, number][], inch = false) =>
  `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="${inch ? "1in" : "17mm"}" height="15mm" viewBox="0 0 17000 15000"><defs><rect x="-500" y="-300" width="1000" height="600" id="x_pad-10"/></defs><g transform="translate(0,15000) scale(1,-1)">${pts
    .map(([x, y]) => `<use xlink:href="#x_pad-10" x="${(x * 1000) / (inch ? 25.4 : 1)}" y="${(y * 1000) / (inch ? 25.4 : 1)}"/>`)
    .join("")}<path d="M0 0 1000 1000"/></g></svg>`;

const chip = (refDes: string, x: number, y: number, side = "TOP"): FitPlacement => ({ refDes, x, y, side, reach: 1.6 });
/** A 0402 at (x, y): two pads 0.5 mm either side. */
const pads0402 = (x: number, y: number) => [
  { x: x - 0.5, y },
  { x: x + 0.5, y },
];

describe("pads read off a copper layer drawing", () => {
  it("reads every flashed pad at its Gerber point, in mm or inches, and leaves tracks and regions out", () => {
    expect(padsFromLayerSvg(layer([[1.5, 2], [10, 13.5]]))).toEqual([
      { x: 1.5, y: 2 },
      { x: 10, y: 13.5 },
    ]);
    const inch = padsFromLayerSvg(layer([[25.4, 12.7]], true));
    expect(inch[0].x).toBeCloseTo(25.4, 6);
    expect(inch[0].y).toBeCloseTo(12.7, 6);
    expect(padsFromLayerSvg(null)).toEqual([]);
    expect(padsFromLayerSvg("<svg width=\"10mm\"><path d=\"M0 0\"/></svg>")).toEqual([]);
  });
});

describe("do the placements sit on the Gerbers?", () => {
  const box = { x: 0, y: 0, w: 17, h: 15 };
  const top = [...pads0402(3, 3), ...pads0402(8, 3), ...pads0402(13, 3), ...pads0402(3, 10), ...pads0402(8, 10)];
  const placed = [chip("C1", 3, 3), chip("C2", 8, 3), chip("C3", 13, 3), chip("C4", 3, 10), chip("C5", 8, 10)];

  it("is green when every placement lies on the board with copper under it", () => {
    const f = placementFit({ box, pads: { top, bottom: [] }, placements: placed });
    expect(f).toMatchObject({ level: "green", foreign: false, outside: [], offPad: [], padsChecked: true });
  });

  it("flags a few placements with no pad under them, each with its reason (amber: the rest fit)", () => {
    const f = placementFit({ box, pads: { top, bottom: [] }, placements: [...placed, chip("R9", 15, 13)] });
    expect(f.level).toBe("amber");
    expect(f.offPad).toEqual(["R9"]);
    expect(f.why.R9).toMatch(/no copper pad on the top/);
  });

  it("calls out the Gerbers of another board when most placements are off it (the 'k' upload: a relay board's Gerbers)", () => {
    const relay = { x: 20, y: -105, w: 80, h: 85 };
    const f = placementFit({ box: relay, pads: { top: [{ x: 35.8, y: -65.5 }], bottom: [] }, placements: placed });
    expect(f).toMatchObject({ level: "red", foreign: true });
    expect(f.outside).toHaveLength(5);
    expect(f.note).toMatch(/5 placements of 5 lie outside the Gerber board — are these the Gerbers \(or the pick-and-place file\) of another board\?/);
    expect(f.why.C1).toMatch(/^the Gerbers do not fit the placements: placed at 3, 3 mm, outside the Gerber board/);
  });

  it("catches another board even when the outlines overlap: no copper where the parts go", () => {
    const other = [...pads0402(5, 6), ...pads0402(11, 12)];
    expect(placementFit({ box, pads: { top: other, bottom: [] }, placements: placed })).toMatchObject({ level: "red", foreign: true });
  });

  it("looks for a bottom part's pads on the bottom copper, and a through-hole part's on either side", () => {
    const f = placementFit({ box, pads: { top, bottom: pads0402(13, 10) }, placements: [chip("C6", 13, 10, "BOTTOM"), { ...chip("J1", 8, 3, "BOTTOM"), tht: true }] });
    expect(f.level).toBe("green");
    expect(placementFit({ box, pads: { top, bottom: pads0402(13, 10) }, placements: [chip("C7", 8, 3, "BOTTOM")] }).offPad).toEqual(["C7"]);
  });

  it("checks only the outline when the layers carry no flashed pads", () => {
    const f = placementFit({ box, pads: { top: [], bottom: [] }, placements: placed });
    expect(f).toMatchObject({ level: "green", padsChecked: false, note: "All 5 placements lie on the board" });
  });
});

describe("the footprint check uses it", () => {
  const lines = [
    { id: "a", lineNo: 1, refDes: "C1, C2", pkg: "0402", mpn: "GRM155", dnp: false },
    { id: "b", lineNo: 2, refDes: "C3", pkg: "0402", mpn: "GRM155", dnp: false },
  ];
  const placements = [
    { refDes: "C1", footprint: "C_0402", x: 3, y: 3, side: "TOP" },
    { refDes: "C2", footprint: "C_0402", x: 8, y: 3, side: "TOP" },
    { refDes: "C3", footprint: "C_0402", x: 13, y: 3, side: "TOP" },
  ];

  it("makes a placement that misses the Gerbers a mismatch, whatever its footprint name says", () => {
    const m = matchFootprints(lines, placements, { level: "amber", note: "1 placement does not sit on the Gerbers: C3", foreign: false, why: { C3: "no copper pad on the top of the Gerbers where it is placed (13, 3 mm)" } });
    expect(m.counts).toMatchObject({ match: 2, mismatch: 1 });
    expect(m.level).toBe("red");
    const c3 = m.refs.find((r) => r.ref === "C3")!;
    expect(c3).toMatchObject({ status: "mismatch", why: "no copper pad on the top of the Gerbers where it is placed (13, 3 mm)" });
    expect(c3.notes?.[0]).toMatchObject({ on: "board", level: "mismatch" });
    expect(m.summary).toMatch(/1 placement not on the Gerbers/);
    const g = findMismatches(m, []).groups.find((x) => x.key === "board")!;
    expect(g).toMatchObject({ title: "Not on the Gerbers", level: "red" });
    expect(g.items.map((i) => i.ref)).toEqual(["C3"]);
  });

  it("says plainly when the Gerbers are not this board", () => {
    const why = { C1: "the Gerbers do not fit the placements: x", C2: "the Gerbers do not fit the placements: x", C3: "the Gerbers do not fit the placements: x" };
    const m = matchFootprints(lines, placements, { level: "red", note: "3 placements of 3 lie outside the Gerber board — are these the Gerbers (or the pick-and-place file) of another board?", foreign: true, why });
    expect(m.title).toBe("The Gerbers do not fit the placements");
    expect(m.counts.mismatch).toBe(3);
    expect(m.fit).toMatchObject({ foreign: true, misses: 3 });
    expect(matchNote(m)).toBe("The Gerbers do not fit the placements");
  });

  it("changes nothing when there is no fit to apply", () => {
    expect(matchFootprints(lines, placements).counts).toMatchObject({ match: 3, mismatch: 0 });
    expect(matchFootprints(lines, placements).fit).toBeUndefined();
  });
});
