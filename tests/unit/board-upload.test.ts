import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { sortBoardFiles } from "@/lib/board/upload";

const gerber = "%FSLAX26Y26*%\n%MOMM*%\nG04 top copper*\nM02*\n";
const drill = "M48\nMETRIC\n%\nT01C0.300\nM30\n";
const centroid = "Designator,Mid X,Mid Y,Rotation,Layer\nU1,10,20,90,T\n";

describe("board file upload", () => {
  it("opens a Gerber zip and sorts layers, drill and the centroid", () => {
    const zip = zipSync({
      "gerbers/board.GTL": strToU8(gerber),
      "gerbers/board.GBL": strToU8(gerber),
      "gerbers/board.DRL": strToU8(drill),
      "assembly/board-PickPlace.csv": strToU8(centroid),
      "readme.md": strToU8("# fab notes"),
      "__MACOSX/gerbers/._board.GTL": strToU8("junk"),
    });
    const r = sortBoardFiles([{ name: "board.zip", bytes: zip }]);
    expect(r.gerbers.map((g) => g.name).sort()).toEqual(["board.DRL", "board.GBL", "board.GTL"]);
    expect(r.centroid?.name).toBe("board-PickPlace.csv");
    expect(r.skipped).toEqual(["readme.md"]);
  });

  it("takes loose files as they are, and never mistakes a drill file for a centroid", () => {
    const r = sortBoardFiles([
      { name: "board-F_Cu.gbr", bytes: strToU8(gerber) },
      { name: "board-PTH.drl", bytes: strToU8(drill) },
      { name: "positions.txt", bytes: strToU8("M48\nINCH\n") },
    ]);
    expect(r.gerbers.map((g) => g.name)).toEqual(["board-F_Cu.gbr", "board-PTH.drl", "positions.txt"]);
    expect(r.centroid).toBeNull();
  });

  it("refuses a zip that expands too far, and skips oversized entries", () => {
    const big = new Uint8Array(600 * 1024); // zeros: compresses to almost nothing
    const zip = zipSync({ "a.GTL": big, "b.GTL": big, "c.GTL": big });
    expect(zip.length).toBeLessThan(64 * 1024);
    expect(() => sortBoardFiles([{ name: "bomb.zip", bytes: zip }], { expanded: 1024 * 1024, entry: 1024 * 1024 })).toThrow(/expands to more than 1 MB/);
    expect(sortBoardFiles([{ name: "big.zip", bytes: zip }], { expanded: 4 * 1024 * 1024, entry: 512 * 1024 }).gerbers).toEqual([]);
  });

  it("says so when the board files come as a RAR, 7-Zip or gzip archive, whatever the file is called", () => {
    const rar = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0xcf, 0x90, 0x73]);
    expect(() => sortBoardFiles([{ name: "Ti-Circle_Gerberpnl.rar", bytes: rar }])).toThrow(/“Ti-Circle_Gerberpnl\.rar” is a RAR archive\. This tool opens \.zip archives only/);
    expect(() => sortBoardFiles([{ name: "gerbers.zip", bytes: rar }])).toThrow(/RAR archive/);
    expect(() => sortBoardFiles([{ name: "g.7z", bytes: new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4]) }])).toThrow(/7-Zip archive/);
    expect(() => sortBoardFiles([{ name: "g.tgz", bytes: new Uint8Array([0x1f, 0x8b, 8, 0]) }])).toThrow(/gzip \/ tar archive/);
  });
});
