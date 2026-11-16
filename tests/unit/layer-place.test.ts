import { describe, expect, it } from "vitest";
import { layerPlace } from "@/components/viewer/textures";
import { bodyFromFootprint, squareUp } from "@/lib/board/find-parts";

const board = { width: 70, height: 85, origin: { x: 20, y: -125 } };

describe("placing a Gerber layer on the board", () => {
  it("puts a layer drawn over the whole board at the corner", () => {
    const p = layerPlace('<svg width="70mm" height="85mm" viewBox="20000 -125000 70000 85000">', board);
    expect(p).toEqual({ x: 0, y: 0, w: 70, h: 85 });
  });

  it("puts a drill file in inches, covering only its holes, where the holes are", () => {
    const p = layerPlace('<svg width="2.5512in" height="3.0949in" viewBox="907.5 -4744.5 2551.2 3094.9">', board);
    expect(p.x).toBeCloseTo(3.05, 1);
    // The file's top edge is 41.9 mm below zero and the board's is 40 mm: 1.9 mm down from the top.
    expect(p.y).toBeCloseTo(1.9, 1);
    expect(p.w).toBeCloseTo(64.8, 1);
    expect(p.h).toBeCloseTo(78.61, 1);
  });

  it("covers the board when the drawing or the board's corner is unknown", () => {
    expect(layerPlace("<svg>", board)).toEqual({ x: 0, y: 0, w: 70, h: 85 });
    expect(layerPlace('<svg width="1in" viewBox="0 0 1000 1000">', { width: 70, height: 85 })).toEqual({ x: 0, y: 0, w: 70, h: 85 });
  });
});

describe("bodies for footprints read off Gerbers", () => {
  it("reads a leaded two-pin footprint by what its designator says it is", () => {
    expect(bodyFromFootprint("Radial, 5.08 mm lead pitch", "connector").shape).toBe("terminal");
    expect(bodyFromFootprint("Radial, 2.54 mm lead pitch", "connector").shape).toBe("header");
    expect(bodyFromFootprint("Radial, 2.54 mm lead pitch", "diode").shape).toBe("led");
    expect(bodyFromFootprint("Radial, 5 mm lead pitch", "crystal").shape).toBe("hc49");
    expect(bodyFromFootprint("Radial, 2.5 mm lead pitch", "capacitor").shape).toBe("electrolytic");
  });

  it("knows relays, DIP chips, headers and regulators", () => {
    expect(bodyFromFootprint("5-pin through-hole", "switch").shape).toBe("relay");
    expect(bodyFromFootprint("DIP-18", "chip")).toMatchObject({ shape: "dip", pins: 18, length: 22.86 });
    expect(bodyFromFootprint("Header 1x6, 2.54 mm pitch", "connector")).toMatchObject({ shape: "header", pins: 6, kind: "connector" });
    expect(bodyFromFootprint("TO-92 / TO-220 (3 leads)", "chip").shape).toBe("to220");
    expect(bodyFromFootprint("TO-92 / TO-220 (3 leads)", "transistor").shape).toBe("to92");
  });

  it("squares up a rotation worked out from pads, and leaves a deliberate angle alone", () => {
    expect(squareUp(85.297)).toBe(90);
    expect(squareUp(-3)).toBe(0);
    expect(squareUp(45)).toBe(45);
  });
});
