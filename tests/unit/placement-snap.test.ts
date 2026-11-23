import { describe, expect, it } from "vitest";
import { flashesFromSvg, padsOfSide, pathPoints, type CopperPad } from "@/lib/board/copper-pads";
import { readCopper, registerPlacements, snapPlacements, type SnapIn } from "@/lib/board/placement-snap";
import { copperCheck } from "@/lib/board/footprint-match";
import { bodyFromFootprint } from "@/lib/board/find-parts";
import { bodyFromCopper } from "@/lib/board/bodies";

const pad = (x: number, y: number, w: number, h: number, extra: Partial<CopperPad> = {}): CopperPad => ({ x, y, w, h, shape: "rect", hole: 0, ...extra });

/** An 0402's two pads (1.0 mm apart) round a centre, along x or along y. */
const chip0402 = (cx: number, cy: number, vertical = false): CopperPad[] =>
  vertical ? [pad(cx, cy - 0.5, 0.6, 0.55), pad(cx, cy + 0.5, 0.6, 0.55)] : [pad(cx - 0.5, cy, 0.55, 0.6), pad(cx + 0.5, cy, 0.55, 0.6)];

/** A SOT-23: pins 1 and 2 on one side 1.9 mm apart, pin 3 opposite. */
const sot23 = (cx: number, cy: number): CopperPad[] => [pad(cx - 0.95, cy - 1.1, 0.6, 0.8), pad(cx + 0.95, cy - 1.1, 0.6, 0.8), pad(cx, cy + 1.1, 0.6, 0.8)];

/** A QFN with `n` pads a side at 0.5 mm and an exposed pad in the middle. */
const qfn = (cx: number, cy: number, n: number, ep = true): CopperPad[] => {
  const out: CopperPad[] = [];
  const half = ((n - 1) * 0.5) / 2;
  const edge = half + 0.9;
  for (let i = 0; i < n; i++) {
    const t = -half + i * 0.5;
    out.push(pad(cx + t, cy - edge, 0.25, 0.8), pad(cx + t, cy + edge, 0.25, 0.8), pad(cx - edge, cy + t, 0.8, 0.25), pad(cx + edge, cy + t, 0.8, 0.25));
  }
  if (ep) out.push(pad(cx, cy, 2.6, 2.6));
  return out;
};

const body0402 = { kind: "chip", length: 1, width: 0.5, pins: 2 };
const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

describe("copper pads from the layer drawings", () => {
  const svg = `<svg width="20mm" height="20mm" viewBox="0 0 20000 20000"><defs>
    <rect x="-300" y="-250" width="600" height="500" id="p_pad-10"/><circle cx="0" cy="0" r="300" id="p_pad-11"/>
    <polygon points="-400,-200 400,-200 400,200 -400,200" id="p_pad-12"/>
    <mask id="clear"><use xlink:href="#p_pad-11" x="9000" y="9000"/></mask></defs>
    <g><use xlink:href="#p_pad-10" x="1000" y="2000"/><use xlink:href="#p_pad-11" x="5000" y="5000"/><use xlink:href="#p_pad-12" x="7000" y="3000"/>
    <path d="M 10000 10000 10600 10000 10600 11200 10000 11200 Z"/><path fill="none" stroke-width="200" d="M 0 0 5000 0"/></g></svg>`;

  it("reads flashes with their aperture's size, and small filled regions; not knock-outs or tracks", () => {
    const f = flashesFromSvg(svg);
    expect(f).toHaveLength(4);
    expect(f[0]).toMatchObject({ x: 1, y: 2, shape: "rect" });
    expect(f[0].w).toBeCloseTo(0.6);
    expect(f[0].h).toBeCloseTo(0.5);
    expect(f[1]).toMatchObject({ x: 5, y: 5, shape: "round" });
    expect(f[2].w).toBeCloseTo(0.8);
    // The region: a 0.6 × 1.2 mm pad drawn as an outline.
    expect(f[3].x).toBeCloseTo(10.3);
    expect(f[3].h).toBeCloseTo(1.2);
  });

  it("keeps the pads the mask opens over and drops via rings", () => {
    const copper = [pad(1, 1, 0.6, 0.5), { ...pad(3, 3, 0.6, 0.6), shape: "round" as const }, pad(6, 6, 1, 1)];
    const mask = [pad(1, 1, 0.7, 0.6), pad(6, 6, 1.1, 1.1)];
    const pads = padsOfSide(copper, mask, [{ x: 3, y: 3, d: 0.3 }, { x: 6, y: 6, d: 0.9 }]);
    expect(pads.map((p) => [p.x, p.hole])).toEqual([[1, 0], [6, 0.9]]);
  });

  it("reads path points with implicit line-tos and arcs", () => {
    expect(pathPoints("M 0 0 10 0 10 5 A 2 2 0 0 1 12 7 Z M 20 20 L 21 21")).toEqual([[[0, 0], [10, 0], [10, 5], [12, 7]], [[20, 20], [21, 21]]]);
  });
});

describe("lining the file up with the copper", () => {
  const board: CopperPad[] = [];
  const parts: SnapIn[] = [];
  for (let i = 0; i < 12; i++) {
    const cx = 10 + (i % 4) * 8, cy = 10 + Math.floor(i / 4) * 7;
    board.push(...chip0402(cx, cy, i % 2 === 1));
    parts.push({ refDes: `C${i + 1}`, x: cx, y: cy, rotation: i % 2 ? 90 : 0, side: "TOP", body: body0402 });
  }

  it("leaves a file that already fits alone", () => {
    expect(registerPlacements(parts, { top: board, bottom: [] })).toMatchObject({ dx: 0, dy: 0 });
  });

  it("finds a panel offset to a hundredth of a millimetre", () => {
    const shifted = parts.map((p) => ({ ...p, x: p.x - 5, y: p.y - 12.5 }));
    const r = registerPlacements(shifted, { top: board, bottom: [] });
    expect(r.dx).toBeCloseTo(5, 2);
    expect(r.dy).toBeCloseTo(12.5, 2);
    expect(r.after).toBe(12);
    const s = snapPlacements(shifted, { top: board, bottom: [] });
    for (const [i, p] of s.parts.entries()) {
      expect(near(p.x, parts[i].x)).toBe(true);
      expect(near(p.y, parts[i].y)).toBe(true);
    }
  });
});

describe("each part onto its own pads", () => {
  it("moves a pin-1 point to the middle of its pads, learning which way pin 2 lies", () => {
    const top: CopperPad[] = [];
    const parts: SnapIn[] = [];
    // Pin 1 on the left at rotation 0, on the right at 180, below at 90: the centre is always along the part's +x.
    const cases: [number, number, number][] = [[10, 10, 0], [20, 10, 180], [30, 10, 90], [10, 20, 0], [20, 20, 270]];
    for (const [i, [cx, cy, rot]] of cases.entries()) {
      top.push(...chip0402(cx, cy, rot % 180 !== 0));
      const a = (rot * Math.PI) / 180;
      parts.push({ refDes: `R${i}`, x: cx - 0.5 * Math.cos(a), y: cy - 0.5 * Math.sin(a), rotation: rot, side: "TOP", body: body0402 });
    }
    const s = snapPlacements(parts, { top, bottom: [] });
    expect(s.prior.TOP).toEqual({ dir: 0, mirrored: false });
    for (const [i, [cx, cy]] of cases.entries()) {
      expect(s.parts[i]).toMatchObject({ how: "pads", turned: false });
      expect(near(s.parts[i].x, cx) && near(s.parts[i].y, cy)).toBe(true);
      expect(s.parts[i].copper?.label).toBe("0402");
    }
  });

  it("does not pair pin 1 with the next part's pad end to end", () => {
    // C1 (pin 1 at 10.5) and its neighbour L2 in line, 0.74 mm apart; a third part below.
    const top = [...chip0402(10, 10), ...chip0402(11.74 + 0.5, 10), ...chip0402(10.5, 8.95, true), ...chip0402(14, 14), ...chip0402(16, 14)];
    const parts: SnapIn[] = [
      { refDes: "C1", x: 10.5, y: 10, rotation: 180, side: "TOP", body: body0402 },
      { refDes: "L2", x: 12.74, y: 10, rotation: 180, side: "TOP", body: body0402 },
      { refDes: "C2", x: 10.5, y: 8.45, rotation: 90, side: "TOP", body: body0402 },
      { refDes: "C3", x: 14.5, y: 14, rotation: 180, side: "TOP", body: body0402 },
      { refDes: "C4", x: 16.5, y: 14, rotation: 180, side: "TOP", body: body0402 },
    ];
    const s = snapPlacements(parts, { top, bottom: [] });
    expect(near(s.parts[0].x, 10)).toBe(true);
    expect(near(s.parts[1].x, 12.24)).toBe(true);
    expect(s.parts[0].turned).toBe(false);
  });

  it("leaves a part placed at its centre where it is, and turns one whose pads lie across it", () => {
    const top = [...sot23(5, 5), ...qfn(15, 15, 6), ...chip0402(25, 5, true)];
    const parts: SnapIn[] = [
      { refDes: "Q1", x: 5, y: 5, rotation: 0, side: "TOP", body: { kind: "gullwing", length: 2.9, width: 1.3, pins: 3 } },
      { refDes: "U1", x: 15, y: 15, rotation: 0, side: "TOP", body: { kind: "leadless", length: 4, width: 4, pins: 24 } },
      { refDes: "C9", x: 25, y: 5, rotation: 0, side: "TOP", body: body0402 },
    ];
    const s = snapPlacements(parts, { top, bottom: [] });
    expect(s.parts[0]).toMatchObject({ how: "pads", x: 5, y: 5 });
    expect(s.parts[0].copper?.label).toBe("SOT-23");
    expect(s.parts[1]).toMatchObject({ how: "pads", x: 15, y: 15 });
    expect(s.parts[1].copper?.label).toBe("QFN-24 + EP 0.5 mm");
    expect(s.parts[2]).toMatchObject({ how: "pads", turned: true, rotation: 90 });
  });

  it("gives a one-pin part its own pad, the fitted part the pads two footprints share, and says when there is no copper", () => {
    const top = [pad(3, 3, 1.2, 1.2), ...chip0402(10, 10)];
    const parts: SnapIn[] = [
      { refDes: "TP1", x: 3.2, y: 3.1, rotation: 0, side: "TOP", body: { kind: "generic", length: 3, width: 3, pins: 1 } },
      { refDes: "L5", x: 10, y: 10, rotation: 0, side: "TOP", body: body0402, dnp: true },
      { refDes: "L4", x: 9.5, y: 10, rotation: 0, side: "TOP", body: body0402 },
      { refDes: "C7", x: 30, y: 30, rotation: 0, side: "TOP", body: body0402 },
    ];
    const s = snapPlacements(parts, { top, bottom: [] });
    expect(s.parts[0]).toMatchObject({ how: "pads", x: 3, y: 3 });
    expect(s.parts[2]).toMatchObject({ how: "pads", x: 10 });
    expect(s.parts[1].how).toBe("kept");
    expect(s.parts[3].how).toBe("off-copper");
  });
});

describe("what the copper reads as", () => {
  it("names chips, SOT-23s, SOICs, QFNs and QFPs from their pads", () => {
    expect(readCopper([pad(0, 0, 0.9, 0.95), pad(1.6, 0, 0.9, 0.95)])?.label).toBe("0603");
    expect(readCopper([pad(0, 0, 1.2, 2.6), pad(2.9, 0, 1.2, 2.6)])?.label).toBe("1210");
    const soic = [0, 1, 2, 3].flatMap((i) => [pad(-1.905 + i * 1.27, -2.7, 0.6, 1.5), pad(-1.905 + i * 1.27, 2.7, 0.6, 1.5)]);
    expect(readCopper(soic)?.label).toBe("SOIC-8 1.27 mm");
    const qfp: CopperPad[] = [];
    for (let i = 0; i < 12; i++) {
      const t = -2.75 + i * 0.5;
      qfp.push(pad(t, -4.2, 0.3, 1.5), pad(t, 4.2, 0.3, 1.5), pad(-4.2, t, 1.5, 0.3), pad(4.2, t, 1.5, 0.3));
    }
    expect(readCopper(qfp)?.label).toBe("QFP-48 0.5 mm");
  });
});

describe("the part against its copper", () => {
  it("stops on a chip of another size or another pin count, asks when the part is only our guess", () => {
    expect(copperCheck({ pkg: "0603", catalogPkg: null, mpn: null }, "0402")).toMatchObject({ on: "copper", level: "mismatch" });
    expect(copperCheck({ pkg: null, catalogPkg: "SOIC-14", mpn: "LM324DR", catalogConfirmed: false }, "SOIC-8 1.27 mm")).toMatchObject({ level: "check" });
    expect(copperCheck({ pkg: "SOT-23-3", catalogPkg: null, mpn: null }, "SOT-23")).toBeNull();
    expect(copperCheck({ pkg: "0402", catalogPkg: null, mpn: null }, "0402")).toBeNull();
    expect(copperCheck({ pkg: "Module", catalogPkg: null, mpn: null }, "12 pads")).toBeNull();
  });
});

describe("bodies from names and from copper", () => {
  it("reads EasyEDA footprint names: body size, pitch, pin count", () => {
    expect(bodyFromFootprint("SOIC-8_L4.9-W3.9-P1.27-LS6.0-BL")).toMatchObject({ kind: "gullwing", length: 4.9, width: 3.9, pins: 8, pitch: 1.27 });
    expect(bodyFromFootprint("LQFP-176_L24.0-W24.0-P0.50-LS26.0-BL")).toMatchObject({ kind: "quad", length: 24, pins: 176, pitch: 0.5 });
    expect(bodyFromFootprint("SOT-23-3").pins).toBe(3);
    expect(bodyFromFootprint("CRYSTAL-SMD_4P-L3.2-W2.5-BL")).toMatchObject({ kind: "crystal", length: 3.2, width: 2.5, pins: 4 });
    expect(bodyFromFootprint("HDR-TH_4P-P2.54-V-M")).toMatchObject({ kind: "connector", shape: "header", pins: 4 });
    expect(bodyFromFootprint("SR_1PIN").pins).toBe(1);
    expect(bodyFromFootprint("IND_7MH2-1").pins).toBe(2);
  });

  it("sizes a body no package describes from its land pattern", () => {
    expect(bodyFromCopper({ label: "QFN-32 + EP 0.5 mm", length: 5.6, width: 5.6, pads: 33 }, [])).toMatchObject({ kind: "leadless", pins: 32, pitch: 0.5 });
    expect(bodyFromCopper({ label: "0402", length: 1.6, width: 0.6, pads: 2 }, [{ name: "0402", family: "CHIP", lengthMm: 1, widthMm: 0.5, heightMm: 0.35 }])).toMatchObject({ kind: "chip", length: 1 });
    expect(bodyFromCopper({ label: "12 through-hole pads, 2.54 mm", length: 15, width: 5, pads: 12 }, [])).toBeNull();
  });
});
