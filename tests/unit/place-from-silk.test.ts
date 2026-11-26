import { describe, expect, it } from "vitest";
import type { CopperPad, CopperPads } from "@/lib/board/copper-pads";
import { findFootprints } from "@/lib/board/footprints";
import type { SilkLabel, SilkOutline } from "@/lib/board/silk-read";
import { SILK_GLYPHS } from "@/lib/board/silk-font";
import { bodyOnLand, foundFromSilk, landWords, placeFromLayers, placeFromSilk, silkMarks, terminalLand, type PlaceLine, type SilkMark } from "@/lib/board/place-from-silk";
import { copperCheck, judgeRef } from "@/lib/board/footprint-match";
import { placeFromSilkscreen } from "@/server/placement-silk";

// ── Synthetic boards: pads as the copper reader gives them, lettering as the silkscreen reader gives it ──

const pad = (x: number, y: number, w: number, h: number, extra: Partial<CopperPad> = {}): CopperPad => ({ x, y, w, h, shape: "rect", hole: 0, ...extra });
const ring = (x: number, y: number, d: number, hole: number, shape: CopperPad["shape"] = "round"): CopperPad => ({ x, y, w: d, h: d, shape, hole });

/** A chip's two pads round a centre: `len` along the part, `wide` across it, centres `d` apart. */
const twoPads = (cx: number, cy: number, len: number, wide: number, d: number, vertical = false): CopperPad[] =>
  vertical ? [pad(cx, cy - d / 2, wide, len), pad(cx, cy + d / 2, wide, len)] : [pad(cx - d / 2, cy, len, wide), pad(cx + d / 2, cy, len, wide)];
const c0805 = (cx: number, cy: number, v = false) => twoPads(cx, cy, 1, 1.3, 1.9, v);
const c0402 = (cx: number, cy: number, v = false) => twoPads(cx, cy, 0.55, 0.6, 1, v);
/** An aluminium can's land: two long thin pads end to end. */
const can = (cx: number, cy: number, v = false) => twoPads(cx, cy, 3.83, 1.29, 5.61, v);

/** An 8-lead small-outline land, rows along x. */
const soic8 = (cx: number, cy: number): CopperPad[] => {
  const out: CopperPad[] = [];
  for (let i = 0; i < 4; i++) out.push(pad(cx - 1.905 + i * 1.27, cy - 2.7, 0.6, 1.5), pad(cx - 1.905 + i * 1.27, cy + 2.7, 0.6, 1.5));
  return out;
};
/** `n` leads a side round a square. */
const quad = (cx: number, cy: number, n: number, edge: number): CopperPad[] => {
  const out: CopperPad[] = [];
  for (let i = 0; i < n; i++) {
    const t = -((n - 1) * 0.5) / 2 + i * 0.5;
    out.push(pad(cx + t, cy - edge, 0.3, 1.5), pad(cx + t, cy + edge, 0.3, 1.5), pad(cx - edge, cy + t, 1.5, 0.3), pad(cx + edge, cy + t, 1.5, 0.3));
  }
  return out;
};
/** A SOT-23: two leads below, one above. */
const sot23 = (cx: number, cy: number, flipped = false): CopperPad[] => {
  const s = flipped ? -1 : 1;
  return [pad(cx - 0.95, cy - 1.1 * s, 0.6, 0.8), pad(cx + 0.95, cy - 1.1 * s, 0.6, 0.8), pad(cx, cy + 1.1 * s, 0.6, 0.8)];
};

const label = (text: string, x: number, y: number, rotation: SilkLabel["rotation"] = 0, height = 1): SilkLabel => ({ text, x, y, rotation, height, mirrored: false, confidence: 1, designator: /^[A-Z]{1,3}[0-9]{1,4}$/.test(text) });
const outline = (x0: number, y0: number, x1: number, y1: number): SilkOutline => ({ x0, y0, x1, y1, closed: true, round: false, strokes: 1 });

type Board = { top?: CopperPad[]; bottom?: CopperPad[]; labels?: SilkLabel[]; bottomLabels?: SilkLabel[]; outlines?: SilkOutline[]; marks?: SilkMark[]; lines?: PlaceLine[] };
const place = (b: Board) => {
  const pads: CopperPads = { top: b.top ?? [], bottom: b.bottom ?? [] };
  const footprints = findFootprints(pads, { outlines: { top: b.outlines ?? [] } });
  return placeFromSilk({
    footprints,
    top: { labels: b.labels ?? [], outlines: b.outlines ?? [], marks: b.marks ?? [] },
    bottom: { labels: (b.bottomLabels ?? []).map((l) => ({ ...l, mirrored: true })), outlines: [] },
    lines: b.lines,
  });
};
const at = (res: ReturnType<typeof place>, ref: string) => res.placements.find((p) => p.refDes === ref);

const RES = { description: "RES 10K OHM 1% 1/8W 0805", pkg: "0805" };
const CAP = { description: "CAP CER 100NF 50V X7R 0805", pkg: "0805" };
const OPAMP = { description: "IC OPAMP DUAL 8-SOIC", pkg: "SOIC-8" };

describe("rows of chips with their names beside them", () => {
  // Six 0805s in a row, each name printed above the gap to the next chip: every name but the last is as near
  // the neighbour as its own chip.
  const top = [0, 1, 2, 3, 4, 5].flatMap((i) => c0805(10 + 4 * i, 10));
  const labels = [0, 1, 2, 3, 4, 5].map((i) => label(`R${i + 1}`, 12 + 4 * i, 12));

  it("settles the whole row at once, with the BoM", () => {
    const res = place({ top, labels, lines: [{ refDes: "R1-R6", ...RES }] });
    expect(res.placements).toHaveLength(6);
    for (let i = 0; i < 6; i++) expect(at(res, `R${i + 1}`)).toMatchObject({ x: 10 + 4 * i, y: 10, side: "TOP", copper: "0805", pads: 2, how: "label", rotation: 0, turn: null });
    expect(res.report).toEqual({ missing: [], extra: [], unlettered: [], mismatches: [], unchecked: [] });
  });

  it("and the same from the board alone", () => {
    const res = place({ top, labels });
    for (let i = 0; i < 6; i++) expect(at(res, `R${i + 1}`)).toMatchObject({ x: 10 + 4 * i, how: "label" });
  });

  it("a chip standing upright lies along y", () => {
    const res = place({ top: c0805(10, 10, true), labels: [label("C1", 12.2, 10, 90)], lines: [{ refDes: "C1", ...CAP }] });
    expect(at(res, "C1")).toMatchObject({ x: 10, y: 10, rotation: 90, length: 2.9 });
  });
});

describe("an IC with its decoupling capacitors", () => {
  // The IC's name is printed over one capacitor, that capacitor's name in the gap beside the IC: by nearness alone
  // the two would swap.
  const top = [...soic8(20, 20), ...c0805(25, 20, true), ...c0805(15, 20, true)];
  const labels = [label("U1", 25, 22.6), label("C1", 23.3, 20, 90), label("C2", 13.3, 20, 90)];

  it("what the BoM says each part is breaks the tie", () => {
    const res = place({ top, labels, lines: [{ refDes: "U1", ...OPAMP }, { refDes: "C1,C2", ...CAP }] });
    expect(at(res, "U1")).toMatchObject({ x: 20, y: 20, copper: "SOIC-8 1.27 mm", pads: 8, kind: "dual" });
    expect(at(res, "C1")).toMatchObject({ x: 25, y: 20, copper: "0805" });
    expect(at(res, "C2")).toMatchObject({ x: 15, y: 20, copper: "0805" });
    expect(res.report.mismatches).toEqual([]);
  });

  it("without a BoM the designator's letters do", () => {
    const res = place({ top, labels });
    expect(at(res, "U1")).toMatchObject({ x: 20, pads: 8 });
    expect(at(res, "C1")).toMatchObject({ x: 25 });
  });

  it("a BoM line on the wrong land is reported, not hidden", () => {
    // The BoM calls R7 an 0402; the board has an 0805 land under that name.
    const res = place({ top: c0805(10, 10), labels: [label("R7", 10, 12)], lines: [{ refDes: "R7", description: "RES 1K OHM 1% 0402", pkg: "0402" }] });
    expect(at(res, "R7")).toMatchObject({ x: 10, copper: "0805" });
    expect(res.report.mismatches).toEqual([{ refDes: "R7", bom: "0402", copper: "0805" }]);
  });
});

describe("a label inside a big footprint", () => {
  const top = [...quad(40, 20, 12, 4.2), ...c0805(47.5, 20, true)];
  const labels = [label("U3", 40, 20, 0, 1.5), label("R9", 47.5, 22.4)];
  const lines = [{ refDes: "U3", description: "IC MCU 32BIT 64KB FLASH 48LQFP", pkg: "LQFP48" }, { refDes: "R9", ...RES }];

  it("belongs to that footprint", () => {
    const res = place({ top, labels, lines });
    expect(at(res, "U3")).toMatchObject({ x: 40, y: 20, kind: "quad", pads: 48, how: "label" });
    expect(at(res, "U3")!.copper).toMatch(/^QFP-48/);
    expect(at(res, "R9")).toMatchObject({ x: 47.5, copper: "0805" });
  });

  it("a name printed far out at the end of a long body is tied through the drawn outline", () => {
    // A latch header: ten pins in the middle of a 33 mm body; the name sits at the body's end, 10 mm from the pins.
    const pins: CopperPad[] = [];
    for (let i = 0; i < 5; i++) pins.push(ring(60 + i * 2.54, 10, 1.3, 0.9), ring(60 + i * 2.54, 12.54, 1.3, 0.9));
    const res = place({ top: pins, labels: [label("J8", 47.5, 11.3, 0, 1.25)], outlines: [outline(49, 7, 81, 15.5)], lines: [{ refDes: "J8", description: "CONN HEADER VERT 10POS 2.54MM 2ROW", pkg: "HDR-2X5" }] });
    expect(at(res, "J8")).toMatchObject({ x: 65.08, y: 11.27, tht: true, pads: 10, copper: "2×5 through-hole, 2.54 mm" });
  });
});

describe("a label that was not read", () => {
  const top = [0, 1, 2, 3].flatMap((i) => c0805(10 + 4 * i, 10));
  const labels = [0, 1, 2].map((i) => label(`R${i + 1}`, 10 + 4 * i, 12));

  it("takes the one footprint left that fits its line", () => {
    const res = place({ top, labels, lines: [{ refDes: "R1-R4", ...RES }] });
    expect(at(res, "R4")).toMatchObject({ x: 22, y: 10, how: "fit", confidence: 0.4 });
    expect(at(res, "R2")).toMatchObject({ x: 14, how: "label" });
    expect(res.report.missing).toEqual([]);
  });

  it("is left out when two lines could want the footprint", () => {
    const res = place({ top, labels, lines: [{ refDes: "R1-R4", ...RES }, { refDes: "C9", ...CAP }] });
    expect(res.placements.map((p) => p.refDes)).toEqual(["R1", "R2", "R3"]);
    expect(res.report.missing).toEqual(["C9", "R4"]);
    expect(res.report.unlettered).toHaveLength(1);
  });

  it("never takes a neighbour's footprint", () => {
    // R3's own land is not on the board; R1 and R2 are read and keep theirs.
    const res = place({ top: top.slice(0, 4), labels: labels.slice(0, 2), lines: [{ refDes: "R1-R3", ...RES }] });
    expect(at(res, "R1")).toMatchObject({ x: 10 });
    expect(at(res, "R2")).toMatchObject({ x: 14 });
    expect(at(res, "R3")).toBeUndefined();
    expect(res.report.missing).toEqual(["R3"]);
  });

  it("a part the copper cannot be is not put on it", () => {
    // U5 is an 8-lead IC whose name is printed by a chip land: nothing near it can be the part.
    const res = place({ top: c0805(10, 10), labels: [label("U5", 10, 12)], lines: [{ refDes: "U5", ...OPAMP }] });
    expect(res.placements).toEqual([]);
    expect(res.report.missing).toEqual(["U5"]);
  });
});

describe("a line that is not fitted", () => {
  it("is placed on its footprint all the same, and says so", () => {
    const res = place({ top: [...c0805(10, 10), ...c0805(14, 10)], labels: [label("R1", 10, 12), label("R2", 14, 12)], lines: [{ refDes: "R1", ...RES }, { refDes: "R2", ...RES, dnp: true }] });
    expect(at(res, "R1")).toMatchObject({ dnp: false });
    expect(at(res, "R2")).toMatchObject({ x: 14, dnp: true, how: "label" });
  });

  it("a designator the BoM does not list is reported with its footprint", () => {
    const res = place({ top: [...c0805(10, 10), ...c0805(14, 10)], labels: [label("R1", 10, 12), label("R2", 14, 12)], lines: [{ refDes: "R1", ...RES }] });
    expect(res.placements.map((p) => p.refDes)).toEqual(["R1"]);
    expect(res.report.extra).toEqual([{ refDes: "R2", x: 14, y: 10, side: "TOP", copper: "0805" }]);
  });
});

describe("Gerbers only", () => {
  const top = [...c0805(10, 10), ...c0805(14, 10), ...soic8(24, 10), ...c0805(34, 10), ...can(44, 10), pad(52, 10, 1, 1), pad(56, 10, 1, 1), ...c0402(60, 10), ...c0402(60, 13)];
  const labels = [label("R1", 10, 12), label("C5", 14, 12), label("U2", 24, 14.6), label("RC3", 44, 13), label("PB1", 52, 11.8), label("TP3", 56, 11.8), label("GND", 34, 12), label("R1", 70, 30)];
  const res = place({ top, labels });

  it("every lettered footprint gets its designator", () => {
    expect(at(res, "R1")).toMatchObject({ x: 10, how: "label" });
    expect(at(res, "C5")).toMatchObject({ x: 14, how: "label" });
    expect(at(res, "U2")).toMatchObject({ x: 24, kind: "dual" });
    // Letters no designator usually starts with still name a footprint that is left for them.
    expect(at(res, "RC3")).toMatchObject({ x: 44, how: "label" });
  });

  it("pin names and test points make no parts", () => {
    expect(at(res, "PB1")).toBeUndefined();
    expect(at(res, "TP3")).toBeUndefined();
    expect(at(res, "GND")).toBeUndefined();
  });

  it("footprints without lettering are numbered by kind", () => {
    const made = res.placements.filter((p) => p.how === "unlettered");
    expect(made.map((p) => [p.refDes, p.x, p.y])).toEqual([["P1", 60, 13], ["P2", 34, 10], ["P3", 60, 10]]);
    expect(res.report.unlettered).toHaveLength(3);
  });

  it("comes out as the parts a quick look shows", () => {
    const found = foundFromSilk(res);
    expect(found.source).toBe("silkscreen");
    expect(found.reader).toBe("silk");
    const part = (ref: string) => found.parts.find((p) => p.ref === ref)!;
    expect(part("R1")).toMatchObject({ kind: "resistor", package: "0805", passive: false, pads: 2, tht: false, side: "TOP" });
    expect(part("C5")).toMatchObject({ kind: "capacitor" });
    expect(part("U2")).toMatchObject({ kind: "chip", package: "SOIC-8 1.27 mm" });
    expect(part("P2")).toMatchObject({ kind: "other", passive: true });
    expect(found.notes[0]).toMatch(/^4 of 7 parts/);
  });

  it("a board with no lettering is still a guess, with every footprint found", () => {
    const found = foundFromSilk(place({ top: [...c0805(10, 10), ...soic8(24, 10)] }));
    expect(found.source).toBe("guessed");
    expect(found.parts.map((p) => p.ref).sort()).toEqual(["P1", "U1"]);
  });

  it("through-hole lands keep the names the rest of the app reads", () => {
    const header = [0, 1, 2, 3].map((i) => ring(10 + i * 2.54, 10, 1.7, 1));
    const radial = [ring(30, 10, 1.9, 0.9), ring(35, 10, 1.9, 0.9)];
    const found = foundFromSilk(place({ top: [...header, ...radial], labels: [label("J4", 13.8, 12.4), label("C8", 32.5, 12.4)] }));
    expect(found.parts.find((p) => p.ref === "J4")).toMatchObject({ kind: "connector", package: "Header 1x4, 2.54 mm", tht: true });
    expect(found.parts.find((p) => p.ref === "C8")).toMatchObject({ kind: "capacitor", package: "Radial, 5 mm lead pitch" });
  });

  it("reads a row of big drilled leads at a terminal block's pitch as a screw terminal, lettered or not", () => {
    expect(terminalLand("1×2 through-hole, 5 mm", 1.52)).toEqual({ ways: 2, pitch: 5 });
    expect(terminalLand("1×3 through-hole, 3.81 mm", 1.2)).toEqual({ ways: 3, pitch: 3.81 });
    // A pin header, or a can's thin leads, is no terminal block.
    expect(terminalLand("1×2 through-hole, 2.54 mm", 1.0)).toBeNull();
    expect(terminalLand("1×2 through-hole, 5 mm", 0.9)).toBeNull();

    const block = (x: number) => [ring(x, 10, 3, 1.5), ring(x + 5.08, 10, 3, 1.5, "rect")];
    const can = [ring(40, 10, 2.6, 1.3), ring(45, 10, 2.6, 1.3)];
    const res = place({
      top: [...block(10), ...block(25), ...can],
      labels: [label("J3", 12.5, 14)],
      outlines: [{ x0: 37.5, y0: 5, x1: 47.5, y1: 15, closed: true, round: true, strokes: 1 }],
    });
    expect(at(res, "J3")).toMatchObject({ x: 12.54, drill: 1.5, how: "label" });
    // Unlettered: a terminal block is numbered as a connector; inside a drawn circle (a can, a coil) it is not.
    expect(at(res, "J4")).toMatchObject({ x: 27.54, how: "unlettered" });
    expect(at(res, "C1")).toMatchObject({ x: 42.5, how: "unlettered" });
    const found = foundFromSilk(res);
    expect(found.parts.find((p) => p.ref === "J3")).toMatchObject({ kind: "connector", package: "2-way terminal block, 5 mm" });
    expect(found.parts.find((p) => p.ref === "J4")).toMatchObject({ kind: "connector", package: "2-way terminal block, 5 mm" });
    // Drawn as the green screw terminal of its pitch, from the copper alone or from the quick look's name.
    expect(bodyOnLand("J3", { label: "1×2 through-hole, 5.08 mm", length: 8, width: 3, pads: 2, drill: 1.5 })).toMatchObject({ kind: "connector", shape: "terminal", pins: 2, pitch: 5.08 });
    expect(landWords({ kind: "connector", package: "3-way terminal block, 3.5 mm", pads: 3, tht: true, w: 10, d: 3 })).toEqual({ description: "TERMINAL BLOCK 3 POS 3.5MM", pkg: "" });
  });

  it("says what a lettered part on an unnamed land most likely is", () => {
    expect(landWords({ kind: "capacitor", package: "2 pads 9.4 × 1.3 mm", pads: 2, tht: false, w: 9.4, d: 1.3 })).toEqual({ description: "CAP ALUM SMD", pkg: "DIA 6.3" });
    expect(landWords({ kind: "inductor", package: "2 pads 15.0 × 4.5 mm", pads: 2, tht: false, w: 15, d: 4.5 })?.description).toBe("INDUCTOR POWER SMD 13.5X13.5");
    expect(landWords({ kind: "resistor", package: "0805", pads: 2, tht: false, w: 2.9, d: 1.3 })).toBeNull();
  });
});

describe("the bottom side", () => {
  it("a bottom label ties to bottom pads, and a through-hole part goes to the side its name is printed on", () => {
    const header = [0, 1, 2].map((i) => ring(30 + i * 2.54, 10, 1.7, 1));
    const res = place({ top: [...c0805(10, 10), ...header], bottom: [...c0805(10, 10), ...header], labels: [label("R1", 10, 12)], bottomLabels: [label("R2", 10, 12, 180), label("J3", 32.54, 12.4, 180)], lines: [{ refDes: "R1,R2", ...RES }, { refDes: "J3", description: "CONN HEADER VERT 3POS 2.54MM", pkg: "HDR-1X3" }] });
    expect(at(res, "R1")).toMatchObject({ side: "TOP", x: 10 });
    expect(at(res, "R2")).toMatchObject({ side: "BOTTOM", x: 10 });
    expect(at(res, "J3")).toMatchObject({ side: "BOTTOM", x: 32.54, tht: true });
  });
});

describe("which way round a part lies", () => {
  it("a SOT-23 by its rows: the two leads have their own side of the body", () => {
    const line = { refDes: "Q1,Q2", description: "TRANS NPN 40V SOT-23", pkg: "SOT-23" };
    const res = place({ top: [...sot23(10, 10), ...sot23(20, 10, true)], labels: [label("Q1", 10, 13), label("Q2", 20, 13)], lines: [line] });
    // The body's single lead is on its near side at 0 degrees: two leads below means turned half way round.
    expect(at(res, "Q1")).toMatchObject({ rotation: 180, turn: "pads", copper: "SOT-23" });
    expect(at(res, "Q2")).toMatchObject({ rotation: 0, turn: "pads" });
  });

  it("a regulator by its tab", () => {
    // Three leads in a row along x, the tab above them: the body's back is at the tab.
    const lands = (cx: number, cy: number, s: number) => [pad(cx - 2.3, cy - 3.1 * s, 0.95, 2.15), pad(cx, cy - 3.1 * s, 0.95, 2.15), pad(cx + 2.3, cy - 3.1 * s, 0.95, 2.15), pad(cx, cy + 3.1 * s, 3.25, 2.15)];
    const res = place({ top: [...lands(10, 10, 1), ...lands(30, 10, -1)], labels: [label("U1", 10, 15.5), label("U2", 30, 15.5)], lines: [{ refDes: "U1,U2", description: "IC REG LDO 3.3V 1A SOT-223", pkg: "SOT-223" }] });
    expect(at(res, "U1")).toMatchObject({ rotation: 180, turn: "pads", copper: "SOT-223" });
    expect(at(res, "U2")).toMatchObject({ rotation: 0, turn: "pads" });
  });

  it("a header by its one square pad", () => {
    const row = (x: number, square: number) => [0, 1, 2, 3].map((i) => ring(x + i * 2.54, 10, 1.7, 1, i === square ? "rect" : "round"));
    const res = place({ top: [...row(10, 0), ...row(30, 3)], labels: [label("J1", 13.8, 12.4), label("J2", 33.8, 12.4)], lines: [{ refDes: "J1,J2", description: "CONN HEADER VERT 4POS 2.54MM", pkg: "HDR-1X4" }] });
    expect(at(res, "J1")).toMatchObject({ rotation: 0, turn: "copper" });
    expect(at(res, "J2")).toMatchObject({ rotation: 180, turn: "copper" });
  });

  it("an IC by the dot printed at pin 1", () => {
    const res = place({ top: [...soic8(20, 20), ...soic8(40, 20)], labels: [label("U1", 20, 25), label("U2", 40, 25)], marks: [{ kind: "dot", x: 17.6, y: 16.2 }, { kind: "dot", x: 42.4, y: 23.8 }], lines: [{ refDes: "U1,U2", ...OPAMP }] });
    // Pin 1 is at the body's bottom-left at 0 degrees.
    expect(at(res, "U1")).toMatchObject({ rotation: 0, turn: "silkscreen" });
    expect(at(res, "U2")).toMatchObject({ rotation: 180, turn: "silkscreen" });
  });

  it("an aluminium can by its plus sign, or the cut corners of its outline", () => {
    const line = { refDes: "C1-C3", description: "CAP ALUM 100UF 25V 20% SMD" };
    const marks: SilkMark[] = [{ kind: "plus", x: 15.4, y: 11.6 }, { kind: "chamfer", x: 26.9, y: 12.9 }, { kind: "chamfer", x: 26.9, y: 7.1 }];
    const res = place({ top: [...can(10, 10), ...can(30, 10), ...can(50, 10)], labels: [label("C1", 10, 14.4), label("C2", 30, 14.4), label("C3", 50, 14.4)], marks, lines: [line] });
    expect(at(res, "C1")).toMatchObject({ rotation: 0, turn: "silkscreen", copper: "2 pads 9.4 × 1.3 mm" });
    expect(at(res, "C2")).toMatchObject({ rotation: 180, turn: "silkscreen" });
    // Nothing printed: the axis is known, the way round is not, and the placement says so.
    expect(at(res, "C3")).toMatchObject({ rotation: 0, turn: null });
    expect(res.report.mismatches).toEqual([]);
  });

  it("a standing power part turns its tab to its heatsink, the heatsink its flat to the part", () => {
    const sink = [ring(20, 0, 3.8, 2.8), ring(20, 25.4, 3.8, 2.8)];
    const fet = (x: number) => [0, 1, 2].map((i) => ring(x, 10.16 + i * 2.54, 1.9, 1.3));
    const res = place({
      top: [...sink, ...fet(16.2), ...fet(40)],
      labels: [label("H1", 20, 29.5), label("Q1", 13.6, 12.7, 90), label("Q2", 42.6, 12.7, 90)],
      lines: [{ refDes: "H1", description: "HEATSINK TO-220 W/PINS 1.5IN" }, { refDes: "Q1,Q2", description: "MOSFET N-CH 100V 120A TO-220", pkg: "TO-220" }],
    });
    expect(at(res, "H1")).toMatchObject({ x: 20, y: 12.7, copper: "1×2 through-hole, 25.4 mm", rotation: 90, turn: "neighbour" });
    // The tab is at the body's back: Q1 stands west of the heatsink, so its back faces east.
    expect(at(res, "Q1")).toMatchObject({ x: 16.2, y: 12.7, rotation: 90, turn: "neighbour" });
    expect(at(res, "Q2")).toMatchObject({ x: 40, rotation: 90, turn: null });
  });
});

describe("the small signs of a silkscreen", () => {
  it("finds a plus, a dot and a cut corner among the strokes", () => {
    const marks = silkMarks([
      { pts: [[9, 10], [11, 10]], width: 0.2 },
      { pts: [[10, 9], [10, 11]], width: 0.2 },
      { pts: Array.from({ length: 13 }, (_, i) => [20 + 0.15 * Math.cos((i * Math.PI) / 6), 20 + 0.15 * Math.sin((i * Math.PI) / 6)] as [number, number]), width: 0.2 },
      { pts: [[33, 30], [31, 30], [30, 31], [30, 36], [33, 36]], width: 0.2 },
      // A long line and a letter-sized box are none of them.
      { pts: [[40, 40], [50, 40]], width: 0.2 },
      { pts: [[60, 60], [61, 60], [61, 61], [60, 61], [60, 60]], width: 0.2 },
    ]);
    expect(marks).toEqual([{ kind: "dot", x: 20, y: 20 }, { kind: "chamfer", x: 30.5, y: 30.5 }, { kind: "plus", x: 10, y: 10 }]);
  });
});

// ── End to end: the layer drawings the app stores ──

const shapesOf = (ch: string) => SILK_GLYPHS.filter((g) => g.ch === ch).map((g) => g.d.split("|").map((line) => line.split(" ").map((p) => p.split(",").map(Number) as [number, number])));
/** A word drawn with the silkscreen reader's own letter shapes, centred at x, y. */
function word(text: string, x: number, y: number, height = 1): string {
  const lines: [number, number][][] = [];
  let run = 0;
  for (const ch of text) {
    const glyph = shapesOf(ch)[0];
    const xs = glyph.flat().map((p) => p[0]);
    const left = Math.min(...xs);
    for (const line of glyph) lines.push(line.map(([gx, gy]) => [run + ((gx - left) * height) / 100, (gy * height) / 100]));
    run += ((Math.max(...xs) - left) * height) / 100 + 0.3 * height;
  }
  const length = run - 0.3 * height;
  return lines.map((line) => `M ${line.map(([lx, ly]) => `${((x + lx - length / 2) * 1000).toFixed(1)} ${((y + ly - height / 2) * 1000).toFixed(1)}`).join(" ")}`).join(" ");
}
const sheet = (body: string, defs = "") => `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-width="0" width="80mm" height="60mm" viewBox="0 0 80000 60000"><defs>${defs}</defs><g transform="translate(0,60000) scale(1,-1)" fill="currentColor" stroke="currentColor">${body}</g></svg>`;
const copperSheet = (pads: CopperPad[]) =>
  sheet(
    pads.map((p, i) => `<use xlink:href="#p${i}" x="${p.x * 1000}" y="${p.y * 1000}"/>`).join(""),
    pads.map((p, i) => `<rect x="${(-p.w / 2) * 1000}" y="${(-p.h / 2) * 1000}" width="${p.w * 1000}" height="${p.h * 1000}" id="p${i}"/>`).join(""),
  );
const silkSheet = (words: string[]) => sheet(words.map((d) => `<path d="${d}" fill="none" stroke-width="150"/>`).join(""));

describe("from the stored layer drawings", () => {
  const pads = [...c0805(10, 10), ...c0805(16, 10), ...soic8(30, 12)];
  const layers = [
    { type: "copper", side: "top", svg: copperSheet(pads) },
    { type: "silkscreen", side: "top", svg: silkSheet([word("R1", 10, 12.2), word("C2", 16, 12.2), word("U3", 30, 17.2)]) },
  ];

  it("reads the silkscreen against the BoM, finds the footprints and places the parts", () => {
    const res = placeFromLayers(layers, [{ refDes: "R1", ...RES }, { refDes: "C2", ...CAP }, { refDes: "U3", ...OPAMP }, { refDes: "R8", ...RES }]);
    expect(res.footprints).toBe(3);
    expect(res.labels).toBe(3);
    expect(res.placements.map((p) => [p.refDes, p.x, p.y, p.copper])).toEqual([["C2", 16, 10, "0805"], ["R1", 10, 10, "0805"], ["U3", 30, 12, "SOIC-8 1.27 mm"]]);
    expect(res.report.missing).toEqual(["R8"]);
  });

  it("reads the board on its own, and nothing from no drawings", () => {
    expect(placeFromLayers(layers).placements.map((p) => p.refDes)).toEqual(["C2", "R1", "U3"]);
    expect(placeFromLayers([]).placements).toEqual([]);
    expect(placeFromLayers(null).placements).toEqual([]);
  });
});

describe("storing them for a BoM", () => {
  const pads = [...c0805(10, 10), ...c0805(16, 10), ...soic8(30, 12)];
  const layers = [
    { type: "copper", side: "top", svg: copperSheet(pads) },
    { type: "silkscreen", side: "top", svg: silkSheet([word("R1", 10, 12.2), word("C2", 16, 12.2), word("U3", 30, 17.2)]) },
  ];
  type Row = { refDes: string; snap: string | null; [k: string]: unknown };
  /** A stand-in for the database: one board, its lines and its placements. */
  const fake = (start: { placements?: Row[]; alignment?: unknown; source?: string }) => {
    const state: { placements: Row[]; alignment: unknown; reads: number } = { placements: [...(start.placements ?? [])], alignment: start.alignment ?? null, reads: 0 };
    const lines = [{ id: "l1", refDes: "R1", rawMpn: null, rawDescription: RES.description, rawPackage: "0805", dnp: false, part: null }, { id: "l2", refDes: "C2, U3", rawMpn: null, rawDescription: null, rawPackage: null, dnp: true, part: null }];
    const db = {
      boardModel: {
        findUnique: async () => ({ source: start.source ?? "gerber", alignment: state.alignment }),
        update: async ({ data }: { data: { alignment: unknown } }) => void (state.alignment = data.alignment),
      },
      placement: {
        count: async ({ where }: { where: { snap?: string } }) => state.placements.filter((p) => (where.snap ? p.snap === where.snap : p.snap !== "silk")).length,
        deleteMany: async () => void (state.placements = state.placements.filter((p) => p.snap !== "silk")),
        createMany: async ({ data }: { data: Row[] }) => void state.placements.push(...data),
      },
      bomLine: { findMany: async () => lines },
      $queryRaw: async () => (state.reads++, [{ layers }]),
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    return { db: db as unknown as Parameters<typeof placeFromSilkscreen>[0], state };
  };

  it("places a BoM that came with Gerbers and no placement file, linked to its lines, and remembers it did", async () => {
    const { db, state } = fake({});
    const run = await placeFromSilkscreen(db, "rev");
    expect(run).toMatchObject({ placed: 3, designators: 3, footprints: 3, labels: 3, missing: [], extra: [], unlettered: 0 });
    expect(state.placements.map((p) => [p.refDes, p.snap, p.bomLineId, p.copper, p.padCount, p.x, p.y])).toEqual([
      ["C2", "silk", "l2", "0805", 2, 16, 10],
      ["R1", "silk", "l1", "0805", 2, 10, 10],
      ["U3", "silk", "l2", "SOIC-8 1.27 mm", 8, 30, 12],
    ]);
    // The file's own position is left empty: there was no file.
    expect(state.placements[0]).not.toHaveProperty("cadX");
    expect((state.alignment as { silk: { placed: number } }).silk.placed).toBe(3);
    // Asked again by the viewer: not read a second time. Asked again after the lines changed: its own are replaced.
    expect(await placeFromSilkscreen(db, "rev", { once: true })).toBeNull();
    expect(state.reads).toBe(1);
    expect((await placeFromSilkscreen(db, "rev"))?.placed).toBe(3);
    expect(state.placements).toHaveLength(3);
  });

  it("leaves a board alone whose parts a file placed", async () => {
    const { db, state } = fake({ placements: [{ refDes: "R1", snap: "pads" }, { refDes: "C2", snap: null }] });
    expect(await placeFromSilkscreen(db, "rev")).toBeNull();
    expect(state.placements.map((p) => p.snap)).toEqual(["pads", null]);
    expect(state.reads).toBe(0);
  });

  it("leaves a quick look's own parts alone, and a board without Gerbers", async () => {
    const quick = fake({ placements: [{ refDes: "P1", snap: "silk" }] });
    expect(await placeFromSilkscreen(quick.db, "rev")).toBeNull();
    expect(quick.state.placements).toHaveLength(1);
    expect(await placeFromSilkscreen(fake({ source: "spec" }).db, "rev")).toBeNull();
  });
});

describe("the footprint check for parts placed from the pads", () => {
  const line = { id: "l", lineNo: 1, refDes: "R1", pkg: "0805", mpn: null, dnp: false };

  it("lets the copper speak when no CAD footprint name exists", () => {
    expect(judgeRef("R1", line, { footprint: null, value: null, copper: "0805", onPads: true })).toMatchObject({ status: "match", notes: [] });
    expect(judgeRef("R1", line, { footprint: null, value: null, copper: "1206", onPads: true }).status).toBe("mismatch");
    // Without the silkscreen placing's mark the copper alone does not stand in for a footprint name.
    expect(judgeRef("R1", line, { footprint: null, value: null, copper: "0805" }).status).toBe("check");
    // A placement file's part without a footprint name is still to check.
    expect(judgeRef("R1", line, { footprint: null, value: null }).status).toBe("check");
  });

  it("does not call a two-pad diode on a chip-sized land a mismatch", () => {
    expect(copperCheck({ pkg: "DO-214AA", catalogPkg: null, mpn: null, catalogConfirmed: true }, "2010")).toBeNull();
    expect(copperCheck({ pkg: "SOIC-8", catalogPkg: null, mpn: null, catalogConfirmed: true }, "0805")?.level).toBe("mismatch");
  });
});
