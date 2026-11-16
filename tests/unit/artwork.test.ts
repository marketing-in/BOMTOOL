import { describe, expect, it } from "vitest";
import { boardArtwork, padsFor, resistorCode, route45, type ArtPart } from "@/lib/board/artwork";
import type { BodySpec } from "@/lib/board/bodies";

const body = (kind: BodySpec["kind"], extra: Partial<BodySpec> = {}): BodySpec => ({ kind, length: 3, width: 1.5, height: 0.5, color: "#000", pins: 2, pitch: 1.27, ...extra });

describe("resistor value codes", () => {
  it.each([
    ["10k", "103"],
    ["4k7", "472"],
    ["4.7 kΩ", "472"],
    ["100R", "101"],
    ["220", "221"],
    ["1M", "105"],
    ["4R7", "4R7"],
    ["2.2", "2R2"],
    ["0R", "000"],
    ["10", "100"],
    ["10m", "R010"],
    ["10 mΩ", "R010"],
    ["0.1", "R100"],
  ])("%s → %s", (v, code) => expect(resistorCode(v)).toBe(code));
  it("returns null for nothing to read", () => {
    expect(resistorCode(null)).toBeNull();
    expect(resistorCode("DNP")).toBeNull();
  });
});

describe("pads per package", () => {
  it("gives a SOIC-8 four pads per side and a QFP-32 eight per side", () => {
    expect(padsFor(body("gullwing", { pins: 8, length: 4.9, width: 3.9 }))).toHaveLength(8);
    expect(padsFor(body("quad", { pins: 32, length: 7, width: 7, pitch: 0.8 }))).toHaveLength(32);
  });
  it("adds a thermal pad under a QFN", () => {
    const pads = padsFor(body("leadless", { pins: 16, length: 3, width: 3, pitch: 0.5 }));
    expect(pads).toHaveLength(17);
    expect(pads.at(-1)!.out).toEqual([0, 0]);
  });
  it("routes at 45° then straight", () => {
    expect(route45([0, 0], [3, 1])).toEqual([[0, 0], [1, 1], [3, 1]]);
    expect(route45([0, 0], [2, 2])).toEqual([[0, 0], [2, 2]]);
  });
});

describe("board artwork", () => {
  const parts: ArtPart[] = [
    { refDes: "U1", x: -10, y: 5, rotation: 0, side: "TOP", body: body("quad", { pins: 32, length: 7, width: 7, pitch: 0.8 }) },
    { refDes: "R1", x: 5, y: 5, rotation: 90, side: "TOP", body: body("chip", { length: 1.6, width: 0.8 }) },
    { refDes: "C9", x: 10, y: -8, rotation: 0, side: "BOTTOM", body: body("chip", { length: 1.6, width: 0.8 }) },
  ];
  const art = boardArtwork(parts, { width: 80, height: 60 }, "GW-200");
  it("is deterministic", () => expect(boardArtwork(parts, { width: 80, height: 60 }, "GW-200")).toEqual(art));
  it("puts pads, outlines and designators on the right side", () => {
    expect(art.top.pads).toHaveLength(34);
    expect(art.bottom.pads).toHaveLength(2);
    expect(art.top.labels.map((l) => l.text)).toEqual(["U1", "R1"]);
    expect(art.top.pin1).toHaveLength(1);
    expect(art.bottom.pour).toBe(true);
  });
  it("keeps vias and holes on the board, fiducials and a free spot for the label", () => {
    for (const v of art.vias) {
      expect(Math.abs(v.x)).toBeLessThan(40);
      expect(Math.abs(v.y)).toBeLessThan(30);
    }
    expect(art.holes).toHaveLength(4);
    expect(art.fiducials).toHaveLength(3);
    expect(art.label).not.toBeNull();
    expect(art.top.traces.length).toBeGreaterThan(5);
  });
});
