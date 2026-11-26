import { describe, expect, it } from "vitest";
import type { CopperPad, CopperPads } from "@/lib/board/copper-pads";
import { enclosedBy, findFootprints, type Footprint, type OutlineHint } from "@/lib/board/footprints";

const pad = (x: number, y: number, w: number, h: number, extra: Partial<CopperPad> = {}): CopperPad => ({ x, y, w, h, shape: "rect", hole: 0, ...extra });
const ring = (x: number, y: number, d: number, hole: number, shape: CopperPad["shape"] = "round"): CopperPad => ({ x, y, w: d, h: d, shape, hole });

/** A chip's two pads round a centre: `len` along the part, `wide` across it, centres `d` apart. */
const twoPads = (cx: number, cy: number, len: number, wide: number, d: number, vertical = false): CopperPad[] =>
  vertical ? [pad(cx, cy - d / 2, wide, len), pad(cx, cy + d / 2, wide, len)] : [pad(cx - d / 2, cy, len, wide), pad(cx + d / 2, cy, len, wide)];
const c0402 = (cx: number, cy: number, v = false) => twoPads(cx, cy, 0.55, 0.6, 1, v);
const c0603 = (cx: number, cy: number, v = false) => twoPads(cx, cy, 0.9, 0.95, 1.6, v);
const c0805 = (cx: number, cy: number, v = false) => twoPads(cx, cy, 1, 1.3, 1.9, v);
/** An 8 mm aluminium can's land: two long thin pads end to end. */
const can = (cx: number, cy: number, v = false) => twoPads(cx, cy, 3.83, 1.29, 5.61, v);

/** Two rows of `n` leads along x, `rows` apart. */
const dual = (cx: number, cy: number, n: number, pitch: number, rows: number, w: number, h: number): CopperPad[] => {
  const out: CopperPad[] = [];
  for (let i = 0; i < n; i++) {
    const x = cx - ((n - 1) * pitch) / 2 + i * pitch;
    out.push(pad(x, cy - rows / 2, w, h), pad(x, cy + rows / 2, w, h));
  }
  return out;
};
const soic8 = (cx: number, cy: number) => dual(cx, cy, 4, 1.27, 5.4, 0.6, 1.5);

/** `n` leads a side round a square, their rows `edge` from the centre. */
const quad = (cx: number, cy: number, n: number, pitch: number, edge: number, w: number, len: number): CopperPad[] => {
  const out: CopperPad[] = [];
  for (let i = 0; i < n; i++) {
    const t = -((n - 1) * pitch) / 2 + i * pitch;
    out.push(pad(cx + t, cy - edge, w, len), pad(cx + t, cy + edge, w, len), pad(cx - edge, cy + t, len, w), pad(cx + edge, cy + t, len, w));
  }
  return out;
};

/** Pin rows: `cols` × `rows` rings from a corner, pin 1 square. */
const pins = (x: number, y: number, cols: number, rows: number, px: number, py: number, d: number, hole: number): CopperPad[] => {
  const out: CopperPad[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out.push(ring(x + i * px, y + j * py, d, hole, i + j === 0 ? "rect" : "round"));
  return out;
};

const top = (...pads: CopperPad[][]): CopperPads => ({ top: pads.flat(), bottom: [] });
/** Through-hole pads show on both sides. */
const both = (smd: CopperPad[], tht: CopperPad[]): CopperPads => ({ top: [...smd, ...tht], bottom: tht.map((p) => ({ ...p })) });
const kinds = (fps: Footprint[]) => fps.map((f) => f.kind).sort().join(" ");
const labels = (fps: Footprint[]) => fps.map((f) => f.read.label).sort().join(" | ");
const at = (fps: Footprint[], x: number, y: number) => fps.find((f) => Math.abs(f.x - x) < 0.05 && Math.abs(f.y - y) < 0.05);

describe("two-terminal parts", () => {
  it("pairs a row of chips side by side along each chip, though the neighbours are closer than a chip's own pads", () => {
    // Five 0805s 1.7 mm apart: pads of neighbouring chips are 1.7 mm from each other, a chip's own 1.9 mm.
    const fps = findFootprints(top(...[0, 1, 2, 3, 4].map((i) => c0805(10, 10 + i * 1.7))));
    expect(fps).toHaveLength(5);
    for (const f of fps) expect(f).toMatchObject({ kind: "chip", rotation: 0, x: 10, tht: false, side: "TOP" });
    expect(fps[0].read.label).toBe("0805");
  });

  it("follows how the same pads pair elsewhere on the board when a block could pair either way", () => {
    // Four chips side by side pair along x or, two and two, along y: both leave no pad over. A chip on its own
    // elsewhere — here on the other side — shows which.
    const block = [0, 1, 2, 3].flatMap((i) => c0805(10, 10 + i * 1.7));
    const fps = findFootprints({ top: block, bottom: c0805(30, 30) });
    expect(fps.filter((f) => f.side === "TOP")).toHaveLength(4);
    expect(fps.every((f) => f.kind === "chip" && f.rotation === 0)).toBe(true);
    expect(fps.filter((f) => f.side === "BOTTOM")).toHaveLength(1);
  });

  it("pairs four pads in a near-square block at the very distance the board's other chips have", () => {
    // Two 0402s standing side by side, 1.04 mm apart; their own pads are 1.07 mm apart like every other 0402 here.
    const block = [pad(2, 3, 0.57, 0.57), pad(2, 4.07, 0.57, 0.57), pad(3.04, 3.01, 0.57, 0.57), pad(3.04, 4.08, 0.57, 0.57)];
    const others = [twoPads(10, 10, 0.57, 0.57, 1.07), twoPads(15, 10, 0.57, 0.57, 1.07, true), twoPads(20, 10, 0.57, 0.57, 1.07)].flat();
    const fps = findFootprints(top(block, others));
    expect(fps).toHaveLength(5);
    expect(fps.slice(0, 2).map((f) => [f.x, f.rotation, f.read.label])).toEqual([[2, 90, "0402"], [3.04, 90, "0402"]]);
  });

  it("pairs two chips end to end without a pad left over, and never chains three pads", () => {
    // 0402s end to end: the pads between the two chips are closer (0.75 mm) than a chip's own (1 mm).
    const row = [pad(0, 0, 0.57, 0.57), pad(1.05, 0, 0.57, 0.57), pad(1.8, 0, 0.57, 0.57), pad(2.85, 0, 0.57, 0.57)];
    const ends = findFootprints(top(row));
    expect(ends.map((f) => f.x)).toEqual([0.525, 2.325]);
    // A chip and one more alike pad beside it: a chip and a lone pad, not a three-pad part.
    const fps = findFootprints(top(c0805(0, 0), [pad(0.95, 1.7, 1, 1.3)], c0805(10, 0), c0805(20, 0)));
    expect(kinds(fps)).toBe("chip chip chip single");
    expect(at(fps, 0, 0)?.pads).toHaveLength(2);
  });

  it("reads an aluminium can's long pads as one two-pad part named by its land, and keeps cans side by side apart", () => {
    const fps = findFootprints(top(can(10, 10, true), can(19.5, 10, true), can(29, 10, true)));
    expect(fps).toHaveLength(3);
    for (const f of fps) expect(f).toMatchObject({ kind: "two-pad", rotation: 90, y: 10 });
    expect(fps[0].read.label).toBe("2 pads 9.4 × 1.3 mm");
    expect(fps[0].box).toMatchObject({ x0: 9.355, x1: 10.645 });
  });

  it("finds both of two footprints drawn over each other", () => {
    const fps = findFootprints(top(twoPads(5, 5, 2.02, 3.02, 6.4, true), twoPads(5, 5, 1.64, 2.56, 4.6, true)));
    expect(fps).toHaveLength(2);
    expect(new Set(fps.map((f) => f.id)).size).toBe(2);
    expect(fps.map((f) => f.pads.length)).toEqual([2, 2]);
  });

  it("does not pair round pads, and leaves slivers of copper out", () => {
    const fps = findFootprints(top([pad(0, 0, 1, 1, { shape: "round" }), pad(1.6, 0, 1, 1, { shape: "round" }), pad(10, 10, 0.2, 0.9, { shape: "poly" })]));
    expect(fps.map((f) => f.pads.length)).toEqual([1, 1]);
    expect(fps.some((f) => f.kind === "chip" || f.kind === "two-pad")).toBe(false);
  });

  it("stays right and quick on a long row of chips", () => {
    const row = Array.from({ length: 40 }, (_, i) => c0402(5, 5 + i * 0.9)).flat();
    const t0 = performance.now();
    const fps = findFootprints(top(row, c0402(20, 20)));
    expect(performance.now() - t0).toBeLessThan(500);
    expect(fps).toHaveLength(41);
    expect(fps.every((f) => f.kind === "chip" && f.rotation === 0 && f.read.label === "0402")).toBe(true);
  });
});

describe("ICs", () => {
  it("keeps the decoupling capacitors against an IC out of it", () => {
    const fps = findFootprints(top(soic8(0, 0), c0402(0, 4.2), c0402(3.2, 0, true)));
    expect(kinds(fps)).toBe("chip chip dual");
    expect(at(fps, 0, 0)).toMatchObject({ kind: "dual", rotation: 0 });
    expect(at(fps, 0, 0)?.pads).toHaveLength(8);
    expect(at(fps, 0, 0)?.read.label).toBe("SOIC-8 1.27 mm");
  });

  it("reads two SOIC-8 end to end, or side by side closer than their own rows, as two", () => {
    const inLine = findFootprints(top(soic8(0, 0), soic8(5.41, 0)));
    expect(labels(inLine)).toBe("SOIC-8 1.27 mm | SOIC-8 1.27 mm");
    // Side by side: the facing rows of the two parts are 3 mm apart, a part's own rows 5.4 mm.
    const stacked = findFootprints(top(soic8(0, 0), soic8(0, 8.4)));
    expect(stacked.map((f) => [f.y, f.pads.length])).toEqual([[0, 8], [8.4, 8]]);
    // Standing on end: pin rows along y.
    const turned = findFootprints(top(soic8(0, 0).map((p) => pad(p.y, p.x, p.h, p.w))));
    expect(turned[0]).toMatchObject({ kind: "dual", rotation: 90 });
  });

  it("makes one footprint of a 144-pin QFP", () => {
    const fps = findFootprints(top(quad(50, 40, 36, 0.5, 10.6, 0.3, 1.27), c0805(50, 53.5), c0805(63.5, 40, true)));
    const u = at(fps, 50, 40)!;
    expect(u).toMatchObject({ kind: "quad", rotation: 0 });
    expect(u.pads).toHaveLength(144);
    expect(u.read).toMatchObject({ label: "QFP-144 0.5 mm", pitch: 0.5, ep: false });
    expect(fps).toHaveLength(3);
  });

  it("takes the copper inside a QFN's ring as its exposed pad, in one piece or five", () => {
    const leads = quad(10, 10, 6, 0.5, 2.15, 0.25, 0.8);
    const one = findFootprints(top(leads, [pad(10, 10, 2.6, 2.6)]));
    expect(one).toHaveLength(1);
    expect(one[0].read.label).toBe("QFN-24 + EP 0.5 mm");
    const pieces = [pad(9.3, 9.3, 0.82, 0.82), pad(10.7, 9.3, 0.82, 0.82), pad(10, 10, 0.82, 0.82), pad(9.3, 10.7, 0.82, 0.82), pad(10.7, 10.7, 0.82, 0.82)];
    const five = findFootprints(top(leads, pieces));
    expect(five).toHaveLength(1);
    expect(five[0].pads).toHaveLength(29);
    expect(five[0].read).toMatchObject({ label: "QFN-24 + EP 0.5 mm", ep: true });
    // A pin-1 mark or a strip of pour inside the ring is not part of it, and not a part of its own.
    const marked = findFootprints(top(leads, [pad(8.6, 11.4, 0.4, 0.3, { shape: "poly" })]));
    expect(marked).toHaveLength(1);
    expect(marked[0].pads).toHaveLength(24);
  });

  it("reads rows put down with rounded positions", () => {
    // CAM output on a 0.025 mm grid: a 0.6 mm pitch reads 0.575 to 0.625.
    const xs = [3, 3.625, 4.225, 4.8, 5.4, 6, 6.6];
    const rows = xs.flatMap((x) => [pad(x, 2, 0.34, 1.3, { shape: "poly" }), pad(x, 6.7, 0.34, 1.3, { shape: "poly" })]);
    const fps = findFootprints(top(rows));
    expect(fps).toHaveLength(1);
    expect(fps[0].pads).toHaveLength(14);
  });

  it("names a SOT-23, and a row of leads with a tab by the tab", () => {
    const sot23 = [pad(-0.95, -1.1, 0.6, 0.8), pad(0.95, -1.1, 0.6, 0.8), pad(0, 1.1, 0.6, 0.8)];
    const sot223 = [pad(7.7, -3.15, 1.5, 2), pad(10, -3.15, 1.5, 2), pad(12.3, -3.15, 1.5, 2), pad(10, 3.15, 3.8, 2)];
    const to263 = [pad(50, -2.54, 3, 1.3), pad(50, 0, 3, 1.3), pad(50, 2.54, 3, 1.3), pad(40, 0, 7.4, 10.2, { shape: "poly" })];
    const fps = findFootprints(top(sot23, sot223, to263));
    expect(kinds(fps)).toBe("sot sot sot");
    expect(labels(fps)).toBe("SOT-223 | SOT-23 | TO-263");
    expect(fps.find((f) => f.read.label === "TO-263")).toMatchObject({ rotation: 90 });
    expect(fps.find((f) => f.read.label === "TO-263")?.pads).toHaveLength(4);
  });

  it("tells a resistor array from the same pads standing alone as two-pad parts", () => {
    const array = dual(10, 10, 4, 1.27, 2.25, 0.62, 1.35);
    expect(findFootprints(top(array)).map((f) => [f.kind, f.pads.length])).toEqual([["dual", 8]]);
    // The same land used on its own elsewhere: four of that part side by side.
    const fps = findFootprints(top(array, twoPads(30, 30, 1.35, 0.62, 2.25, true)));
    expect(fps).toHaveLength(5);
    expect(fps.every((f) => f.kind === "two-pad" && f.rotation === 90)).toBe(true);
  });

  it("keeps four alike pads in a tight block as one part unless the board uses them as chips", () => {
    const block = [...c0603(10, 10), ...c0603(10, 11.5)];
    const alone = findFootprints(top(block));
    expect(alone.map((f) => [f.kind, f.pads.length])).toEqual([["other", 4]]);
    expect(alone[0].read.label).toMatch(/^4-pad /);
    const used = findFootprints(top(block, c0603(20, 20)));
    expect(kinds(used)).toBe("chip chip chip");
    expect(labels(used)).toBe("0603 | 0603 | 0603");
  });
});

describe("through-hole", () => {
  it("makes one footprint of a header whose pads show on both sides", () => {
    const fps = findFootprints(both([], pins(10, 10, 10, 2, 2.54, 2.54, 1.7, 1)));
    expect(fps).toHaveLength(1);
    expect(fps[0]).toMatchObject({ kind: "tht-grid", side: "TOP", tht: true, rotation: 0 });
    expect(fps[0].pads).toHaveLength(20);
    expect(fps[0].read.label).toBe("2×10 through-hole, 2.54 mm");
    const col = findFootprints(both([], pins(10, 10, 2, 6, 2.54, 2.54, 1.7, 1)));
    expect(col[0]).toMatchObject({ kind: "tht-grid", rotation: 90 });
    expect(col[0].read.label).toBe("2×6 through-hole, 2.54 mm");
  });

  it("reads single rows, pairs and a DIP", () => {
    const fps = findFootprints(both([], [...pins(0, 0, 4, 1, 2.54, 0, 1.7, 1), ...pins(20, 0, 2, 1, 2.5, 0, 1.93, 1.3), ...pins(40, 0, 2, 4, 7.62, 2.54, 1.6, 0.8)]));
    expect(fps.map((f) => [f.kind, f.read.label])).toEqual([
      ["tht-row", "1×4 through-hole, 2.54 mm"],
      ["tht-row", "1×2 through-hole, 2.54 mm"],
      ["tht-grid", "DIP-8 2.54 mm"],
    ]);
  });

  it("keeps a heatsink's two pins, the TO-220s on it and its neighbours apart", () => {
    const heatsink = [ring(0, -12.7, 3.83, 2.8), ring(0, 12.7, 3.83, 2.8)];
    const q1 = [-2.54, 0, 2.54].map((y) => ring(-3.8, y, 1.93, 1.3));
    const q2 = [-2.54, 0, 2.54].map((y) => ring(3.8, y, 1.93, 1.3));
    const fps = findFootprints(both([], [...heatsink, ...q1, ...q2]));
    expect(fps.map((f) => [f.x, f.kind, f.read.label])).toEqual([
      [-3.8, "tht-row", "1×3 through-hole, 2.54 mm"],
      [0, "tht-row", "1×2 through-hole, 25.4 mm"],
      [3.8, "tht-row", "1×3 through-hole, 2.54 mm"],
    ]);
    expect(fps[1]).toMatchObject({ rotation: 90, y: 0 });
  });

  it("joins a transformer's two rows of pins, with the pin spaced off its row", () => {
    const left = [0, 6.35, 12.7, 19.05, 25.4].map((y) => ring(0, y, 1.55, 1.15));
    const right = [0, 6.35, 12.7, 19.05, 25.4, 31.75].map((y) => ring(24, y, 1.55, 1.15));
    const fps = findFootprints(both([], [...left, ring(0, 30.5, 1.55, 1.15, "rect"), ...right]));
    expect(fps).toHaveLength(1);
    expect(fps[0]).toMatchObject({ kind: "tht-other", rotation: 90 });
    expect(fps[0].pads).toHaveLength(12);
  });

  // An L-shaped relay outline: its box takes in the notch at the top right, where an LED stands.
  const lShape: OutlineHint = { x0: -4, y0: -3, x1: 24, y1: 16, edges: [-4, -3, 24, -3, 24, -3, 24, 8, 24, 8, 16, 8, 16, 8, 16, 16, 16, 16, -4, 16, -4, 16, -4, -3] };

  it("tells what an L-shaped outline encloses from what is only inside its box", () => {
    expect(enclosedBy(lShape, 6, 6)).toBe(true);
    expect(enclosedBy(lShape, 20, 4)).toBe(true);
    expect(enclosedBy(lShape, 20, 12)).toBe(false);
    expect(enclosedBy(lShape, 30, 4)).toBe(false);
    // A line drawn inside the outline (a coil symbol) does not change the answer.
    expect(enclosedBy({ ...lShape, edges: [...lShape.edges!, 2, 2, 10, 2] }, 6, 6)).toBe(true);
    // A plain box: its extent is its shape.
    expect(enclosedBy({ x0: 0, y0: 0, x1: 4, y1: 4 }, 2, 2)).toBe(true);
  });

  it("makes one part of a relay's pins inside its L-shaped outline, and leaves the LED in the notch out", () => {
    const relay = [ring(0, 0, 2.6, 1.3), ring(0, 12.2, 2.6, 1.3), ring(12, 0, 2.6, 1.3), ring(12, 12.2, 2.6, 1.3), ring(-2, 6, 2.6, 1.3)];
    const led = [ring(19, 12, 1.6, 0.8), ring(21.54, 12, 1.6, 0.8, "rect")];
    const fps = findFootprints(both([], [...relay, ...led]), { outlines: { top: [lShape] } });
    const k = fps.find((f) => f.kind === "tht-other")!;
    expect(k.pads).toHaveLength(5);
    expect(fps.find((f) => f.pads.some((p) => p.x === 19))!.pads).toHaveLength(2);
    // Read by its box alone, the outline would have taken the LED's pins too.
    const boxed = findFootprints(both([], [...relay, ...led]), { outlines: { top: [{ ...lShape, edges: undefined }] } });
    expect(boxed.find((f) => f.kind === "tht-other")!.pads).toHaveLength(7);
  });

  it("reads a 2 × 2 power header as one part and its peg holes as holes", () => {
    const header = pins(10, 10, 2, 2, 4.2, 5.5, 2.06, 1.55);
    const pegs = [ring(7.4, 17.8, 3.6, 3), ring(16.8, 17.8, 3.6, 3)];
    const fps = findFootprints(both([], [...header, ...pegs]));
    expect(kinds(fps)).toBe("mount-hole mount-hole tht-grid");
    const j = fps.find((f) => f.kind === "tht-grid")!;
    expect(j.pads).toHaveLength(4);
    expect(j.read.label).toBe("2×2 through-hole, 4.2 mm");
  });

  it("leaves out vias left open in the mask", () => {
    // Twenty rings wherever the routing put them, four of them in a 2 mm square, beside a real header.
    const spots = [[3.1, 4.2], [9.7, 2.3], [15.2, 8.8], [22.4, 3.9], [27.9, 11.6], [5.5, 14.1], [12.3, 17.9], [19.8, 15.3], [25.1, 19.7], [31.6, 6.4], [2.2, 22.5], [8.9, 25.3], [16.7, 23.1], [23.3, 27.8], [29.4, 24.6], [34.8, 16.2]];
    const vias = [...spots.map(([x, y]) => ring(x, y, 1.29, 0.8)), ring(40, 40, 1.29, 0.8), ring(42, 40, 1.29, 0.8), ring(40, 42, 1.29, 0.8), ring(42, 42, 1.29, 0.8)];
    const header = pins(50, 10, 4, 1, 2.54, 0, 1.29, 0.9);
    const fps = findFootprints(both(c0805(10, 10), [...vias, ...header]));
    expect(kinds(fps)).toBe("chip tht-row");
    // A fence of touching rings is vias too.
    const fence = Array.from({ length: 8 }, (_, i) => ring(i * 0.86, 0, 0.84, 0.5));
    expect(findFootprints(both([], fence))).toHaveLength(0);
    // A 1.27 mm header's pads stand close too, with room for solder between them.
    expect(findFootprints(both([], pins(0, 0, 4, 1, 1.27, 0, 1.16, 0.85))).map((f) => f.read.label)).toEqual(["1×4 through-hole, 1.27 mm"]);
  });
});

describe("lone pads", () => {
  it("tells mounting holes, fiducials and test points apart and never joins them to a neighbour", () => {
    const smd = [...c0805(10, 10), pad(13, 10, 1.5, 1.5), pad(30, 30, 1, 1, { shape: "round" }), pad(11.2, 11.5, 1, 1, { shape: "round" })];
    const fps = findFootprints(both(smd, [ring(40, 40, 6, 3.2), ring(10, 14, 1.9, 1.1)]));
    expect(fps.map((f) => [f.kind, f.read.label, f.pads.length])).toEqual([
      ["chip", "0805", 2],
      ["single", "1 through-hole pad", 1],
      ["single", "1 pad", 1],
      ["single", "1 pad", 1],
      ["fiducial", "1 pad", 1],
      ["mount-hole", "mounting hole", 1],
    ]);
  });

  it("reads dozens of alike round pads as test points, the few of another size as fiducials", () => {
    const points = Array.from({ length: 12 }, (_, i) => pad(5 + i * 6, 5, 1.02, 1.02, { shape: "round" }));
    const marks = [pad(5, 40, 1.05, 1.05, { shape: "round" }), pad(70, 40, 1.05, 1.05, { shape: "round" })];
    const fps = findFootprints(top(points, marks));
    expect(fps.filter((f) => f.kind === "single")).toHaveLength(12);
    expect(fps.filter((f) => f.kind === "fiducial").map((f) => f.y)).toEqual([40, 40]);
  });
});

describe("silkscreen outlines as a hint", () => {
  it("splits four alike pads the way two outlines are drawn round them", () => {
    const block = [...c0603(10, 10), ...c0603(10, 11.5)];
    const outlines = { top: [{ x0: 8.6, y0: 9.4, x1: 11.4, y1: 10.6 }, { x0: 8.6, y0: 10.9, x1: 11.4, y1: 12.1 }] };
    const fps = findFootprints(top(block), { outlines });
    expect(fps.map((f) => [f.kind, f.y, f.rotation])).toEqual([["chip", 10, 0], ["chip", 11.5, 0]]);
    // One outline round all four of a block the board would otherwise read as two chips: one part.
    const one = findFootprints(top(block, c0603(20, 20)), { outlines: { top: [{ x0: 8.6, y0: 9.4, x1: 11.4, y1: 12.1 }] } });
    expect(one.map((f) => f.pads.length).sort()).toEqual([2, 4]);
  });

  it("joins loose pins of two sizes inside one outline, but not an outline that holds a whole row", () => {
    const t2 = [ring(0, 0, 1.3, 0.9), ring(0, 12, 1.3, 0.9), ring(7, 5, 2.3, 1.4), ring(14, 12, 2.3, 1.4)];
    const row = pins(30, 0, 3, 1, 2.54, 0, 1.93, 1.3);
    const apart = findFootprints(both([], [...t2, ...row]));
    expect(apart.map((f) => f.pads.length)).toEqual([2, 2, 3]);
    const hinted = findFootprints(both([], [...t2, ...row]), { outlines: { top: [{ x0: -2, y0: -2, x1: 16, y1: 14 }, { x0: 28, y0: -14, x1: 38, y1: 14 }] } });
    expect(hinted.map((f) => [f.kind, f.pads.length])).toEqual([["tht-other", 4], ["tht-row", 3]]);
  });
});

describe("the footprint itself", () => {
  it("has a stable id, its centre, box and pads whatever order the pads come in", () => {
    const pads = [...soic8(10, 10), ...c0805(20, 10), ...c0402(10, 15)];
    const a = findFootprints({ top: pads, bottom: [] });
    const b = findFootprints({ top: [...pads].reverse(), bottom: [] });
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
    expect(a.map((f) => f.id)).toEqual(["TOP:10.00:10.00", "TOP:10.00:15.00", "TOP:20.00:10.00"]);
    expect(a[2].box).toEqual({ x0: 18.55, y0: 9.35, x1: 21.45, y1: 10.65 });
    // Every pad in one footprint only.
    const all = a.flatMap((f) => f.pads);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(pads.length);
  });
});
