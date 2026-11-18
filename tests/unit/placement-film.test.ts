import { describe, expect, it } from "vitest";
import type { RefResult } from "@/lib/board/footprint-match";
import { FLY, bodyColor, buildFilm, extent, filmFrame, fxAt, geoFromBody, geoFromSignature, settled, sweepOrder } from "@/lib/board/placement-film";
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

  it("flies the top side in before the bottom, and keeps parts with no place for the feeder strip", () => {
    expect(f.parts.at(-1)!.ref).toBe("C7");
    expect(f.parts).toHaveLength(6);
    expect(f.tray.map((t) => t.ref)).toEqual(["C99"]);
    // The strip turns red once every part has landed.
    expect(f.tray[0].at).toBeGreaterThanOrEqual(Math.max(...f.parts.map((p) => p.land)));
  });

  it("settles in about 2–4 s whatever the part count", () => {
    expect(f.duration).toBeGreaterThanOrEqual(1.5);
    expect(f.duration).toBeLessThanOrEqual(4);
    const many = Array.from({ length: 300 }, (_, k) => ref(`R${k}`, k % 17 ? "match" : "mismatch", (k % 20) * 5 + 2, Math.floor(k / 20) * 5 + 2));
    const big = buildFilm({ refs: many, frame: filmFrame(many, { widthMm: 104, heightMm: 80 }, null)!, art: false });
    expect(big.duration).toBeGreaterThanOrEqual(2);
    expect(big.duration).toBeLessThanOrEqual(4);
    // A quick stagger: each part sets off no earlier than the one before it.
    for (let k = 1; k < big.parts.length; k++) expect(big.parts[k].start).toBeGreaterThanOrEqual(big.parts[k - 1].start);
  });

  it("flies a part in from above, bigger, and lands it on its pads", () => {
    const p = f.parts.find((q) => q.ref === "C1")!;
    expect(fxAt(p, p.start - 0.01)).toBe("before");
    const mid = fxAt(p, p.start + FLY / 2);
    expect(typeof mid === "object" && mid.lift > 0 && mid.lift < 1 && mid.dy < 0).toBe(true);
    const down = fxAt(p, p.land);
    expect(typeof down === "object" && down.lift === 0 && down.dx === 0 && down.dy === 0).toBe(true);
    expect(fxAt(p, f.duration)).toBe("after");
    expect(settled(f, f.duration)).toBe(true);
  });

  it("lands a mismatch too (it blinks red on the page), and leaves parts not in the BoM as bare pads", () => {
    const bad = f.parts.find((q) => q.ref === "U1")!;
    const landed = fxAt(bad, bad.land + 0.01);
    expect(typeof landed === "object" && landed.chip === 1).toBe(true);
    const stray = f.parts.find((q) => q.ref === "TP1")!;
    const empty = fxAt(stray, stray.land);
    expect(typeof empty === "object" && empty.chip === 0 && empty.mark > 0).toBe(true);
  });

  it("sweeps a side from the top-left corner", () => {
    const pts = [
      { x: 9, y: 9, bottom: false },
      { x: 1, y: 1, bottom: true },
      { x: 5, y: 1, bottom: false },
      { x: 1, y: 2, bottom: false },
    ];
    expect(sweepOrder(pts).map((p) => `${p.x},${p.y},${p.bottom ? "b" : "t"}`)).toEqual(["1,2,t", "5,1,t", "9,9,t", "1,1,b"]);
  });
});
