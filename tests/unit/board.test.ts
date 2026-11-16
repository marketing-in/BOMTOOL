import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCentroid, splitPosFile } from "@/lib/board/centroid";
import { classifyLayer } from "@/lib/board/layers";
import { parseBomFile } from "@/lib/bom/parse";

describe("centroid parsing", () => {
  it("reads the Altium-style sample with mm suffixes", () => {
    const buf = readFileSync(path.resolve("samples/board/GW-200/GW200_PickPlace.csv"));
    const { rows } = parseBomFile(buf, "GW200_PickPlace.csv");
    const { placements, unit } = parseCentroid(rows);
    expect(unit).toBe("mm");
    expect(placements.length).toBe(76);
    expect(placements.find((p) => p.refDes === "U2")).toMatchObject({ x: 50, y: 40, side: "TOP", footprint: "QFN-48" });
  });

  it("reads a KiCad .pos file in mm with bottom-side parts and negative rotation", () => {
    const pos = `### Footprint positions
## Unit = mm, Angle = deg.
# Ref     Val       Package                 PosX       PosY       Rot  Side
C1        100n      C_0603_1608Metric      101.6000  -50.8000   -90.0  top
U1        RP2040    QFN-56                 120.0000  -60.0000   0.0    bottom
## End`;
    const { placements, unit } = parseCentroid(splitPosFile(pos));
    expect(unit).toBe("mm");
    expect(placements).toEqual([
      { refDes: "C1", x: 101.6, y: -50.8, rotation: 270, side: "TOP", footprint: "C_0603_1608Metric", value: "100n" },
      { refDes: "U1", x: 120, y: -60, rotation: 0, side: "BOTTOM", footprint: "QFN-56", value: "RP2040" },
    ]);
  });

  it("detects mil from magnitude and converts", () => {
    const rows = [["Ref", "X", "Y", "Rotation", "Side"], ["R1", "2000", "1000", "45", "B"]];
    const { placements, unit } = parseCentroid(rows);
    expect(unit).toBe("mil");
    expect(placements[0]).toMatchObject({ x: 50.8, y: 25.4, side: "BOTTOM", rotation: 45 });
  });

  it("fails clearly without X/Y columns", () => {
    expect(() => parseCentroid([["a", "b"]])).toThrow(/designator and X\/Y/);
  });
});

describe("Gerber layer classification", () => {
  it.each([
    ["board.GTL", "copper", "top"],
    ["board.GBS", "soldermask", "bottom"],
    ["board.G2", "copper", "inner"],
    ["board-F_Cu.gbr", "copper", "top"],
    ["board-In1_Cu.gbr", "copper", "inner"],
    ["board-Edge_Cuts.gm1", "outline", "all"],
    ["board.XLN", "drill", "all"],
    ["readme.pdf", "unknown", "all"],
  ])("%s → %s/%s", (name, type, side) => {
    expect(classifyLayer(name)).toMatchObject({ type, side });
  });
  it("prefers the X2 file function", () => {
    expect(classifyLayer("weird.gbr", "%TF.FileFunction,Copper,L3,Inr*%")).toEqual({ type: "copper", side: "inner", index: 3 });
  });
});
