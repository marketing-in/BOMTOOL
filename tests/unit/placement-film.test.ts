import { describe, expect, it } from "vitest";
import type { RefResult } from "@/lib/board/footprint-match";
import { bodyColor, buildFilm, cameraAt, doneBy, extent, filmFrame, fxAt, geoFromBody, geoFromSignature, headAt, placementOrder } from "@/lib/board/placement-film";
import { signature } from "@/lib/board/footprint-match";

const ref = (r: string, status: RefResult["status"], x: number | null, y: number | null, footprint: string | null = "0603", bomPkg: string | null = "0603", side = "TOP"): RefResult => ({
  ref: r,
  status,
  why: "",
  lineNo: 1,
  mpn: null,
  bomPkg,
  footprint,
  x,
  y,
  side: x === null ? null : side,
});

describe("land patterns from footprint names", () => {
  it("sizes chips by their code and puts two pads at the ends", () => {
    const g = geoFromSignature(signature("C_0603_1608Metric"))!;
    expect(g.kind).toBe("chip");
    expect([g.l, g.w]).toEqual([1.6, 0.8]);
    expect(g.pads).toHaveLength(2);
    expect(g.pads[0][0]).toBeLessThan(0);
    expect(g.pads[1][0]).toBeGreaterThan(0);
  });

  it("gives ICs their pin count", () => {
    expect(geoFromSignature(signature("SOIC-8_3.9x4.9mm_P1.27mm"))!.pads).toHaveLength(8);
    expect(geoFromSignature(signature("LQFP-48_7x7mm_P0.5mm"))!.pads).toHaveLength(48);
    // QFN: 24 pins round the edge and the exposed pad in the middle.
    expect(geoFromSignature(signature("QFN-24"))!.pads).toHaveLength(25);
    expect(geoFromSignature(signature("SOT-23"))!.pads).toHaveLength(3);
    expect(geoFromSignature(signature("Module"))).toBeNull();
  });

  it("falls back to the body the package data gives, and refuses bodies with no size", () => {
    const g = geoFromBody({ kind: "module", l: 25.5, w: 18, pins: 38, pitch: 1.27, color: "#c9ccd2", rot: 0 })!;
    expect(g.kind).toBe("module");
    expect(extent(g).hx).toBeGreaterThanOrEqual(12.75);
    expect(geoFromBody({ kind: "chip", l: 0, w: 0, pins: 2, pitch: 1, color: "#000", rot: 0 })).toBeNull();
  });

  it("never draws a blue body", () => {
    expect(bodyColor("#1f3a6e", "can", "C1")).toBe("#2c2c2f");
    expect(bodyColor("#b89466", "chip", "C1")).toBe("#b89466");
    expect(bodyColor(null, "chip", "C4")).toBe("#b89466");
  });
});

describe("the board film", () => {
  const refs = [
    ref("C1", "match", 10, 10),
    ref("C2", "match", 30, 10),
    ref("U1", "mismatch", 20, 30, "SOIC-8", "QFN-24"),
    ref("R9", "check", 40, 30),
    ref("TP1", "not-in-bom", 45, 5),
    ref("C7", "match", 5, 35, "0603", "0603", "BOTTOM"),
    ref("C99", "not-on-board", null, null),
  ];
  const frame = filmFrame(refs, { widthMm: 50, heightMm: 40 }, null)!;
  const f = buildFilm({ refs, frame, art: false });

  it("uses the board when every part is on it, and flips y so the top of the board is up", () => {
    expect(frame).toMatchObject({ x0: 0, y0: 0, w: 50, h: 40, real: false });
    expect(f.parts.find((p) => p.ref === "C1")).toMatchObject({ x: 10, y: 30 });
  });

  it("places the top side before the bottom, and keeps parts with no place for the feeder", () => {
    expect(f.parts.at(-1)!.ref).toBe("C7");
    expect(f.parts).toHaveLength(6);
    expect(f.tray.map((t) => t.ref)).toEqual(["C99"]);
  });

  it("runs 6–12 s whatever the part count", () => {
    expect(f.duration).toBeGreaterThanOrEqual(6);
    expect(f.duration).toBeLessThanOrEqual(12.5);
    const many = Array.from({ length: 300 }, (_, k) => ref(`R${k}`, k % 17 ? "match" : "mismatch", (k % 20) * 5 + 2, Math.floor(k / 20) * 5 + 2));
    const big = buildFilm({ refs: many, frame: filmFrame(many, { widthMm: 104, heightMm: 80 }, null)!, art: false });
    expect(big.duration).toBeGreaterThanOrEqual(6);
    expect(big.duration).toBeLessThanOrEqual(12.5);
    // Slots follow one another, and every part is let go inside its own.
    for (let k = 1; k < big.parts.length; k++) expect(big.parts[k].start).toBeGreaterThanOrEqual(big.parts[k - 1].arrive);
  });

  it("drops a match, bursts a mismatch, and leaves parts not in the BoM as empty pads", () => {
    const match = f.parts.find((p) => p.ref === "C1")!;
    const bad = f.parts.find((p) => p.ref === "U1")!;
    const stray = f.parts.find((p) => p.ref === "TP1")!;
    expect(fxAt(f, match, match.arrive - 0.01)).toBe("before");
    const mid = fxAt(f, match, match.arrive + f.drop / 2);
    expect(mid).not.toBe("before");
    expect(typeof mid === "object" && mid.lift > 0 && mid.lift < 1).toBe(true);
    expect(fxAt(f, match, f.duration)).toBe("after");
    const hover = fxAt(f, bad, bad.arrive + bad.hover / 2);
    expect(typeof hover === "object" && hover.chip === 1 && hover.lift > 0.5).toBe(true);
    const burst = fxAt(f, bad, bad.arrive + bad.hover + 0.2);
    expect(typeof burst === "object" && burst.chip === 0 && burst.burst > 0).toBe(true);
    const empty = fxAt(f, stray, stray.arrive + 0.1);
    expect(typeof empty === "object" && empty.chip === 0).toBe(true);
  });

  it("moves the head to each part as it lets go, carries the part there, and parks it at the end", () => {
    const p = f.parts[2];
    const at = headAt(f, p.arrive);
    expect(at.x).toBeCloseTo(p.x, 5);
    expect(at.y).toBeCloseTo(p.y, 5);
    expect(headAt(f, (p.start + p.arrive) / 2).carrying).toBe(p.status === "not-in-bom" ? -1 : p.i);
    expect(headAt(f, f.duration).opacity).toBeCloseTo(0, 5);
    expect(doneBy(f, f.duration)).toBe(6);
    expect(doneBy(f, 0)).toBe(0);
  });

  it("shows the whole board at rest", () => {
    for (const t of [0, f.duration]) {
      const c = cameraAt(f, t);
      expect(c.z).toBeCloseTo(1, 5);
      expect(c.cx).toBeCloseTo(f.w / 2, 5);
      expect(c.cy).toBeCloseTo(f.h / 2, 5);
    }
  });

  it("orders a side in alternating bands", () => {
    const pts = [
      { x: 1, y: 1, bottom: false },
      { x: 9, y: 1, bottom: false },
      { x: 1, y: 9, bottom: false },
      { x: 9, y: 9, bottom: false },
    ];
    expect(placementOrder(pts, 10).map((p) => `${p.x},${p.y}`)).toEqual(["1,1", "9,1", "9,9", "1,9"]);
  });
});
