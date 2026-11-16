import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { blobs, classify, clusterPads, rasterise } from "@/vendor/circuitflow/gerberInfer.js";
import { evalExpr, identifyLayer, parseExcellon, parseGerber } from "@/vendor/circuitflow/gerber.js";
import {
  bomRowsFromFound,
  FOUND_BOM_HEADER,
  FOUND_BOM_MAPPING,
  compressRefs,
  findParts,
  groupFound,
  GUESSED_MARK,
  kindForLine,
  looksLikeMpn,
  mountFromFootprint,
  packageHint,
  snapPitch,
  type FoundParts,
} from "@/lib/board/find-parts";
import { parseDescription } from "@/lib/bom/describe";

const read = (dir: string) => readdirSync(dir).map((name) => ({ name, text: readFileSync(path.join(dir, name), "utf8") }));
const CTRL = read(path.join(process.cwd(), "samples/board/CTRL-01"));
const GW = read(path.join(process.cwd(), "samples/board/GW-200"));

type Pad = { x: number; y: number; w: number; h: number; area: number; outline: number[][]; hole: number };
const rect = (x: number, y: number, w: number, h: number, extra: Partial<Pad> = {}): Pad => ({
  x,
  y,
  w,
  h,
  area: w * h,
  outline: [
    [x - w / 2, y - h / 2],
    [x + w / 2, y - h / 2],
    [x + w / 2, y + h / 2],
    [x - w / 2, y + h / 2],
  ],
  hole: 0,
  ...extra,
});

describe("circuitflow's Gerber reader (vendored)", () => {
  it("evaluates aperture macro arithmetic without eval", () => {
    expect(evalExpr("$1+$1", [0, 0.25])).toBe(0.5);
    expect(evalExpr("-($2-$1)/2", [0, 1, 5])).toBe(-2);
    expect(evalExpr("2x(3+4)", [])).toBe(14);
  });

  it("reads units, zero suppression and Excellon formats", () => {
    const inch = parseGerber("%FSLAX24Y24*%\n%MOIN*%\n%ADD10C,0.0100*%\nD10*\nX0Y0D02*\nX10000Y0D01*\nM02*", "a.gtl");
    expect(inch.objects[0].pts[1][0]).toBeCloseTo(25.4, 6);
    const eagle = parseExcellon("%\nM48\nM72\n;FILE_FORMAT=2:4\nINCH,TZ\nT01C0.0240\n%\nT01\nX16910Y10810\nM30", "board.drd");
    expect(eagle.hits[0].x).toBeCloseTo(1.691 * 25.4, 6);
  });

  it("names layers from KiCad, Altium and Eagle files", () => {
    const g = "%FSLAX46Y46*%%MOMM*%";
    const cases: Record<string, string> = { "board-F_Cu.gbr": "copper:top", "board-B_Mask.gbr": "mask:bottom", "proj.GTO": "silk:top", "proj.GKO": "outline:all", "arduino.cmp": "copper:top" };
    for (const [name, want] of Object.entries(cases)) {
      const id = identifyLayer(name, g);
      expect(`${id.kind}:${id.side}`, name).toBe(want);
    }
  });
});

describe("circuitflow's part guesser (vendored)", () => {
  it("turns mask openings into pads however they were drawn", () => {
    const objects = [
      { k: "circle", x: -5, y: 0, r: 0.5, pol: "D" },
      { k: "poly", pts: [[0, -1], [2, -1], [2, 1], [0, 1]], pol: "D" },
      { k: "stroke", pts: [[5, 0], [7, 0]], w: 0.6, pol: "D" },
      { k: "stroke", pts: [[5, 0], [5, 1]], w: 0.6, pol: "D" },
    ];
    expect(blobs(rasterise(objects, { minX: -10, minY: -5, maxX: 10, maxY: 5 }, { ppm: 20 }))).toHaveLength(3);
  });

  it("groups and names DIP, SOIC, chip passives and headers", () => {
    const dip: Pad[] = [];
    for (let i = 0; i < 14; i++) dip.push(rect(0, i * 2.54, 1.6, 1.6, { hole: 0.8 }), rect(7.62, i * 2.54, 1.6, 1.6, { hole: 0.8 }));
    const soic: Pad[] = [];
    for (let i = 0; i < 4; i++) soic.push(rect(30, i * 1.27, 1.5, 0.6), rect(35.4, i * 1.27, 1.5, 0.6));
    const r1 = [rect(50, 0, 0.9, 0.95), rect(51.55, 0, 0.9, 0.95)];
    const header = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => rect(70, i * 2.54, 1.7, 1.7, { hole: 1 }));
    const groups: Pad[][] = clusterPads([...dip, ...soic, ...r1, ...header]);
    const names = groups.map((g) => String(classify(g).package).split(",")[0]).sort();
    expect(names).toEqual(["0603", "DIP-28", "Header 1x8", "SOIC-8"]);
  });

  it("names a QFN by its pins, not its exposed pad, and knows SOT-23-5 and 4-pad crystals", () => {
    const qfn: Pad[] = [];
    for (let i = 0; i < 6; i++) {
      const o = (i - 2.5) * 0.5;
      qfn.push(rect(o, -1.975, 0.275, 0.75), rect(o, 1.975, 0.275, 0.75), rect(-1.975, o, 0.75, 0.275), rect(1.975, o, 0.75, 0.275));
    }
    qfn.push(rect(0, 0, 2.2, 2.2));
    expect(classify(qfn).package).toMatch(/^QFN-24 \+ EP/);
    const sot5 = [rect(-0.95, -1.3, 0.55, 1.1), rect(0, -1.3, 0.55, 1.1), rect(0.95, -1.3, 0.55, 1.1), rect(-0.95, 1.3, 0.55, 1.1), rect(0.95, 1.3, 0.55, 1.1)];
    expect(classify(sot5).package).toBe("SOT-23-5");
    const xtal = [rect(-1.1, -0.8, 1.4, 1.2), rect(1.1, -0.8, 1.4, 1.2), rect(-1.1, 0.8, 1.4, 1.2), rect(1.1, 0.8, 1.4, 1.2)];
    expect(classify(xtal).type).toBe("crystal");
  });
});

describe("findParts", () => {
  it("takes designators, values and positions from a placement file, in Gerber coordinates", () => {
    const found = findParts(CTRL.filter((f) => !f.name.endsWith(".pos")), CTRL.find((f) => f.name.endsWith(".pos")));
    expect(found.source).toBe("placement");
    expect(found.parts).toHaveLength(19);
    const u1 = found.parts.find((p) => p.ref === "U1")!;
    expect(u1).toMatchObject({ value: "STM32F407VGT6", side: "TOP" });
    // Same frame as the .pos file: U1 at 150, -133.5.
    expect(u1.x).toBeCloseTo(150, 2);
    expect(u1.y).toBeCloseTo(-133.5, 2);
  });

  it("reads designators from X2 pad attributes and names packages from the pads", () => {
    const found = findParts(CTRL.filter((f) => !f.name.endsWith(".pos")));
    expect(found.source).toBe("pad-designators");
    expect(found.parts.map((p) => p.ref).sort()).toContain("R6");
    expect(found.parts).toHaveLength(19);
    // The sample's pads are drawn by circuitflow's generator, not a CAD library: check kinds, and that every part got a package.
    expect(found.parts.find((p) => p.ref === "C1")!.kind).toBe("capacitor");
    expect(found.parts.find((p) => p.ref === "U3")!.kind).toBe("chip");
    expect(found.parts.every((p) => p.package)).toBe(true);
  });

  it("guesses the parts when the files carry no component data", () => {
    const bare = CTRL.filter((f) => !f.name.endsWith(".pos")).map((f) => ({ ...f, text: f.text.replace(/%TO\.[PC],[^%]*%\n/g, "") }));
    const found = findParts(bare);
    expect(found.source).toBe("guessed");
    expect(found.parts).toHaveLength(19);
    expect(found.parts.filter((p) => p.passive)).toHaveLength(14);
    expect(found.parts.every((p) => !p.mpn && !p.value)).toBe(true);
  });

  it("finds every GW-200 part from its Gerbers alone, where the pick-and-place file puts it", () => {
    const found = findParts(GW.filter((f) => !/PickPlace/i.test(f.name)));
    expect(found.source).toBe("guessed");
    const truth = GW.find((f) => /PickPlace/i.test(f.name))!
      .text.trim()
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.split(","))
      .map(([ref, fp, x, y]) => ({ ref, fp, x: parseFloat(x), y: parseFloat(y) }));
    expect(found.parts).toHaveLength(truth.length);
    for (const t of truth) {
      const best = Math.min(...found.parts.map((p) => Math.hypot(p.x - t.x, p.y - t.y)));
      expect(best, `${t.ref} (${t.fp})`).toBeLessThan(1.5);
    }
    const at = (x: number, y: number) => found.parts.find((p) => Math.hypot(p.x - x, p.y - y) < 0.2)!;
    expect(at(30, 18).package).toBe("SOIC-8, 1.27 mm");
    expect(at(50, 40).package).toMatch(/^QFN-48 \+ EP/);
    expect(found.parts.filter((p) => p.package === "0603")).toHaveLength(44);
  });

  it("puts an Altium pick-and-place file's parts at the file's own coordinates", () => {
    const pnp = GW.find((f) => /PickPlace/i.test(f.name))!;
    const found = findParts(GW.filter((f) => f !== pnp), pnp);
    expect(found.source).toBe("placement");
    expect(found.parts).toHaveLength(76);
    expect(found.parts.find((p) => p.ref === "U4")).toMatchObject({ x: 30, y: 18, side: "TOP" });
  });

  it("never throws on files it can't read", () => {
    expect(findParts([{ name: "readme.txt", text: "hello" }])).toMatchObject({ source: "none", parts: [] });
  });
});

describe("a BoM from the parts found", () => {
  const guessed = findParts(GW.filter((f) => !/PickPlace/i.test(f.name)));

  it("groups parts into lines, biggest first, with the generated mapping", () => {
    const groups = groupFound(guessed.parts);
    expect(groups[0]).toMatchObject({ package: "0603", passive: true });
    expect(groups[0].refs).toHaveLength(44);
    const rows = bomRowsFromFound(guessed);
    expect(rows[0]).toEqual(FOUND_BOM_HEADER);
    expect(FOUND_BOM_MAPPING).toHaveLength(FOUND_BOM_HEADER.length);
    expect(rows.slice(1).reduce((s, r) => s + Number(r[1]), 0)).toBe(76);
  });

  it("writes guessed rows the matcher can't mistake for a value", () => {
    for (const row of bomRowsFromFound(guessed).slice(1)) {
      expect(row[6]).toContain(GUESSED_MARK);
      // Value, description and package are what the parametric matcher reads.
      expect(parseDescription(row[2], row[6], row[5]).kind, row.join(" | ")).toBeNull();
    }
  });

  it("keeps values and MPNs from the files, so those lines match like any BoM", () => {
    const withPos = findParts(CTRL.filter((f) => !f.name.endsWith(".pos")), CTRL.find((f) => f.name.endsWith(".pos")));
    const rows = bomRowsFromFound(withPos);
    // The .pos file's values are part numbers here: they go to the MPN column, where the matcher looks.
    expect(rows.find((r) => r[2] === "STM32F407VGT6")?.slice(1, 4)).toEqual(["1", "STM32F407VGT6", "STM32F407VGT6"]);
    expect(looksLikeMpn("1N4148")).toBe(true);
    for (const v of ["10k", "4.7uF", "2k2", "100R", "100nF", "DNP", "10"]) expect(looksLikeMpn(v), v).toBe(false);
    const found: FoundParts = { source: "pad-designators", notes: [], parts: [{ ref: "R1", x: 0, y: 0, rotation: 0, side: "TOP", package: "0603", kind: "resistor", value: null, mpn: null, manufacturer: null, pads: 2, tht: false, passive: false, w: 1.6, d: 0.8 }] };
    const [, row] = bomRowsFromFound(found);
    expect(parseDescription(row[2], row[6], row[5]).kind).toBeNull();
  });
});

describe("helpers for lines without a part", () => {
  it("tells through-hole from the footprint name", () => {
    expect(mountFromFootprint("Header 1x8, 2.54 mm pitch")).toBe("THT");
    expect(mountFromFootprint("DIP-28")).toBe("THT");
    expect(mountFromFootprint("Radial, 5.08 mm lead pitch")).toBe("THT");
    expect(mountFromFootprint("PinHeader_1x08_P2.54mm_Vertical_SMD")).toBe("SMD");
    expect(mountFromFootprint("0603")).toBeNull();
  });

  it("knows the kind a line needs from designators and guesses", () => {
    expect(kindForLine("R1, R2", "0603", null, null)).toBe("resistor");
    expect(kindForLine("P1, P2", "0603", null, `Two-pad part, ${GUESSED_MARK} — value and part number are not in the files`)).toBe("passive");
    expect(kindForLine("U4", "SOIC-8, 1.27 mm", null, `SMD part, ${GUESSED_MARK} — …`)).toBe("chip");
    expect(kindForLine(null, "0805", null, null)).toBe("passive");
  });

  it("writes designator runs as ranges", () => {
    expect(compressRefs(["P1", "P2", "P3", "P5", "R1", "R2", "TP"])).toBe("P1–P3, P5, R1–R2, TP");
  });

  it("finds catalogue packages for a footprint, and snaps measured pitches", () => {
    expect(packageHint("0603").names).toEqual(["0603"]);
    expect(packageHint("1210/SMA").names).toEqual(["1210", "SMA (DO-214AC)"]);
    expect(packageHint("QFP-64, 0.5 mm")).toMatchObject({ family: "QFP", pins: 64 });
    expect(packageHint("SOT-23").names).toEqual(["SOT-23"]);
    expect(snapPitch("SOIC-8, 1.3 mm")).toBe("SOIC-8, 1.27 mm");
    expect(snapPitch("Radial, 5.05 mm lead pitch")).toBe("Radial, 5.08 mm lead pitch");
  });
});
