import { describe, expect, it } from "vitest";
import { analyseBox, type KitLine } from "@/lib/board/box";
import { ENCLOSURES } from "@/lib/board/enclosures";
import { code39, CODE39_CHARS } from "@/lib/board/code39";

const body = (kind: "connector" | "can" | "gullwing", length: number, width: number, height: number) => ({ kind, length, width, height, color: "#3f7f3f" });
const line = (description: string, category: string | null, refDes = "X1"): KitLine => ({
  refDes,
  mpn: "M",
  partId: null,
  description,
  category,
  qty: 1,
});

describe("analyseBox — die-cast 1590B with a power board", () => {
  const board = { w: 100, h: 52, thickness: 1.6 };
  const parts = [
    {
      refDes: "J1",
      x: -45,
      y: 0,
      rotation: 0,
      side: "TOP" as const,
      body: body("connector", 10, 6, 6),
    },
    {
      refDes: "C25",
      x: 0,
      y: 0,
      rotation: 0,
      side: "TOP" as const,
      body: body("can", 10, 10, 20),
    },
    {
      refDes: "U1",
      x: 20,
      y: 10,
      rotation: 0,
      side: "TOP" as const,
      body: body("gullwing", 5, 4, 1.5),
    },
  ];
  const lines = [line("Enclosure die-cast", "enclosure", "ENC1"), line("Standoff M3 10mm", "fastener", "MH1-MH4")];
  const a = analyseBox(ENCLOSURES["1590B"], board, parts, lines);

  it("takes the standoff length from the BoM", () => {
    expect(a.standoff).toBe(10);
    expect(a.standoffSource).toBe("bom");
    expect(a.boardBottom).toBeCloseTo(12.5);
  });

  it("flags a part too tall for the lid", () => {
    expect(a.fit.fits2d).toBe(true);
    expect(a.fit.tallest).toEqual({ refDes: "C25", height: 20 });
    // 31 − 4 (lid) − 12.5 − 1.6 − 20
    expect(a.fit.headroom).toBeCloseTo(-7.1);
    expect(a.fit.ok).toBe(false);
  });

  it("opens the wall an edge connector faces", () => {
    expect(a.cutouts).toHaveLength(1);
    expect(a.cutouts[0]).toMatchObject({ refDes: "J1", face: "x-", u: 0 });
    expect(a.cutouts[0].z).toBeGreaterThan(a.boardBottom + board.thickness);
  });

  it("checks the box-build kit against the BoM", () => {
    const status = Object.fromEntries(a.kit.map((k) => [k.key, k.status]));
    expect(status).toMatchObject({
      enclosure: "in-bom",
      standoffs: "in-bom",
      screws: "missing",
      feet: "missing",
      label: "missing",
      machining: "nre",
    });
    expect(a.kit.find((k) => k.status === "supplied")?.label).toBe("Lid screws ×4");
  });
});

describe("analyseBox — extruded 1455N1601", () => {
  const board = { w: 100, h: 80, thickness: 1.6 };

  const parts = [
    {
      refDes: "J2",
      x: 0,
      y: 0,
      rotation: 0,
      side: "TOP" as const,
      body: body("connector", 10, 6, 6),
    },
    {
      refDes: "C9",
      x: 10,
      y: 10,
      rotation: 0,
      side: "BOTTOM" as const,
      body: body("can", 6, 6, 5.4),
    },
  ];
  const standoffs = [line("Standoff M3 10mm", "fastener")];

  it("slides a board as wide as the slot pitch into the slots, clear of the solder side", () => {
    const a = analyseBox(ENCLOSURES["1455N1601"], { w: 150, h: 96, thickness: 1.6 }, parts, standoffs);
    expect(a.mount).toBe("slots");
    // Slots ignore the BoM's standoffs: the slot height clears the 5.4 mm bottom part.
    expect(a.standoff).toBe(8);
    expect(a.standoffSource).toBe("clearance");
    expect(a.cutouts).toEqual([]);
    expect(a.fit.ok).toBe(true);
    expect(a.kit.find((k) => k.key === "enclosure")?.status).toBe("missing");
    expect(a.kit.some((k) => k.key === "standoffs")).toBe(false);
    expect(a.kit.find((k) => k.key === "slots")?.status).toBe("supplied");
  });

  it("puts a narrower board on standoffs and says why", () => {
    const a = analyseBox(ENCLOSURES["1455N1601"], board, parts, standoffs);
    expect(a.mount).toBe("standoffs");
    expect(a.standoff).toBe(10);
    expect(a.kit.find((k) => k.key === "carrier")).toMatchObject({
      status: "check",
    });
    expect(a.kit.find((k) => k.key === "carrier")?.why).toContain("80 mm wide but the slots are 99 mm apart");
    expect(a.kit.find((k) => k.key === "standoffs")?.status).toBe("in-bom");
  });

  it("uses the rotated footprint to find the nearest wall", () => {
    // 20 × 6 connector turned 90°: it runs along y, so its top end sits 2 mm from the y+ edge of the board.
    const parts = [
      {
        refDes: "J3",
        x: 30,
        y: 28,
        rotation: 90,
        side: "TOP" as const,
        body: body("connector", 20, 6, 8),
      },
    ];
    const a = analyseBox(ENCLOSURES["1455N1601"], board, parts, []);
    expect(a.cutouts[0]).toMatchObject({ refDes: "J3", face: "y+", u: 30 });
    expect(a.cutouts[0].w).toBeCloseTo(7.5);
  });
});

describe("code39", () => {
  it("wraps the text in start/stop characters with narrow gaps", () => {
    const bars = code39("A")!;
    expect(bars).toHaveLength(9 * 3 + 2);
    // "*" is 010010100: narrow bar, wide space, narrow bar, narrow space, wide bar, …
    expect(bars.slice(0, 9)).toEqual([1, 3, 1, 1, 3, 1, 3, 1, 1]);
  });

  it("gives every character exactly three wide elements", () => {
    for (const c of CODE39_CHARS) {
      const bars = code39(c)!;
      const mid = bars.slice(10, 19);
      expect(
        mid.filter((b) => b === 3),
        c,
      ).toHaveLength(3);
    }
  });

  it("refuses characters Code 39 can't carry", () => {
    expect(code39("NIM-GW200-PCBA")).not.toBeNull();
    expect(code39("rev_b")).toBeNull();
    expect(code39("A*B")).toBeNull();
    expect(code39("")).toBeNull();
  });
});
