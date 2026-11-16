import { describe, expect, it } from "vitest";
import { buildRoute, refList, type RouteLine, type RoutePart } from "@/lib/ops/route";

const LINES: RouteLine[] = [
  {
    code: "L1",
    name: "SMT Line 1",
    type: "SMT",
    capability: { minChip: "0201", minPitchMm: 0.35, bga: true, doubleSided: true, maxBoardMm: [510, 460] },
    capacityCph: 78000,
    machines: [
      { type: "STENCIL_PRINTER", vendor: "ASMPT", model: "DEK TQ" },
      { type: "SPI", vendor: "Koh Young", model: "KY8030-3" },
      { type: "PICK_AND_PLACE", vendor: "ASMPT", model: "TX2i" },
      { type: "REFLOW_OVEN", vendor: "Heller", model: "1913 MK5" },
      { type: "AOI", vendor: "Koh Young", model: "Zenith Alpha" },
      { type: "XRAY", vendor: "Nordson", model: "Quadra 7" },
    ],
  },
  {
    code: "L2",
    name: "SMT Line 2",
    type: "SMT",
    capability: { minChip: "0402", minPitchMm: 0.4, bga: true, doubleSided: true, maxBoardMm: [460, 400] },
    capacityCph: 135000,
    machines: [
      { type: "STENCIL_PRINTER", vendor: "EKRA", model: "SERIO 4000" },
      { type: "PICK_AND_PLACE", vendor: "Fuji", model: "NXT III" },
      { type: "REFLOW_OVEN", vendor: "Rehm", model: "VisionXP+" },
    ],
  },
  {
    code: "L3",
    name: "Line 3",
    type: "THT",
    capability: { wave: true, selective: true },
    machines: [
      { type: "SELECTIVE_SOLDER", vendor: "Ersa", model: "VERSAFLOW" },
      { type: "WASHER", vendor: "PBT", model: "SuperSWASH" },
      { type: "CONFORMAL_COATER", vendor: "PVA", model: "Delta 8" },
      { type: "FLYING_PROBE", vendor: "Takaya", model: "APT-1600FD" },
      { type: "ICT", vendor: "Keysight", model: "i3070" },
    ],
  },
  {
    code: "L4",
    name: "Line 4",
    type: "BOX_BUILD",
    capability: {},
    machines: [
      { type: "DEPANELER", vendor: "LPKF", model: "CuttingMaster" },
      { type: "FCT", vendor: "In-house", model: "FCT fixtures" },
      { type: "SCREWDRIVER_STATION", vendor: "Desoutter", model: "CVI3" },
      { type: "PACKING", vendor: "In-house", model: "ESD packing" },
    ],
  },
];

const part = (refDes: string, side: "TOP" | "BOTTOM", o: Partial<RoutePart> = {}): RoutePart => ({
  refDes,
  side,
  mount: "SMD",
  pkg: "0402",
  family: "CHIP",
  pitchMm: null,
  category: "resistor-chip",
  msl: null,
  dnp: false,
  ...o,
});

describe("buildRoute — two-sided NPI board in a box", () => {
  const parts = [
    part("R1", "TOP"),
    part("R2", "TOP"),
    part("U1", "TOP", { pkg: "BGA-64", family: "BGA", pitchMm: 0.5, category: "mcu", msl: "MSL_3" }),
    part("C1", "BOTTOM"),
    part("Q1", "BOTTOM", { pkg: "DPAK", family: "TO", category: "mosfet" }),
    part("J1", "TOP", { mount: "THT", pkg: null, family: null, category: "connector-wtb" }),
    part("R9", "TOP", { dnp: true }),
  ];
  const route = buildRoute({ parts, board: { layers: 4, finish: "ENIG", widthMm: 100, heightMm: 80 }, stage: "NPI", buildQty: 100, enclosure: { mpn: "1590B", kitGaps: 2 }, lines: LINES });
  const step = (key: string) => route.find((s) => s.key === key)!;

  it("orders every step from bare board to packing, lighter side first", () => {
    expect(route.map((s) => s.key)).toEqual([
      "fab",
      "kitting",
      "print-bottom",
      "spi-bottom",
      "place-bottom",
      "reflow-bottom",
      "aoi-bottom",
      "print-top",
      "spi-top",
      "place-top",
      "reflow-top",
      "aoi-top",
      "xray-top",
      "insert",
      "selective",
      "depanel",
      "flying-probe",
      "program",
      "fct",
      "assemble",
      "system-test",
      "inspect",
      "pack",
      "dispatch",
    ]);
  });

  it("names the parts each step handles, skipping DNP", () => {
    expect(step("kitting").refs).toEqual(["U1"]);
    expect(step("place-top").refs).toEqual(["R1", "R2", "U1"]);
    expect(step("xray-top").refs).toEqual(["U1"]);
    expect(step("insert").refs).toEqual(["J1"]);
    expect(step("program").refs).toEqual(["U1"]);
    expect(route.some((s) => s.refs.includes("R9"))).toBe(false);
  });

  it("explains product-specific risks", () => {
    expect(step("reflow-bottom").watch).toContain("Q1");
    expect(step("selective").why).toContain("bottom side already carries SMD");
    expect(step("assemble").watch).toBe("2 box-build kit items not on the BoM yet.");
  });

  it("puts steps on our lines and machines", () => {
    expect(step("place-top").where).toMatchObject({ line: "L1", equipment: "ASMPT TX2i" });
    expect(step("xray-top").where).toMatchObject({ line: "L1", equipment: "Nordson Quadra 7" });
    expect(step("selective").where?.line).toBe("L3");
    expect(step("assemble").where).toMatchObject({ line: "L4", equipment: "Desoutter CVI3" });
  });
});

describe("buildRoute — single-sided production board, coated", () => {
  const parts = [part("R1", "TOP", { pkg: "0603" }), part("U1", "TOP", { pkg: "SOIC-8", family: "SOIC", pitchMm: 1.27, category: "op-amp" })];
  const route = buildRoute({ parts, board: { layers: 2, finish: "HASL", widthMm: 80, heightMm: 50 }, stage: "PRODUCTION", buildQty: 5000, coating: "acrylic", lines: LINES });

  it("uses the fastest line, tests before coating, needs no masking, and ends with inspection, packing and dispatch", () => {
    expect(route.map((s) => s.key)).toEqual(["fab", "kitting", "print-top", "spi-top", "place-top", "reflow-top", "aoi-top", "clean", "depanel", "ict", "fct", "coat", "inspect", "pack", "dispatch"]);
    expect(route.find((s) => s.key === "place-top")?.title).toBe("Pick and place");
    expect(route.find((s) => s.key === "place-top")?.where?.line).toBe("L2");
    // L2 has no SPI: the step points at the line that has one.
    expect(route.find((s) => s.key === "spi-top")?.where?.line).toBe("L1");
    expect(route.find((s) => s.key === "kitting")?.machine).toBe("smart-storage-counter");
  });
});

describe("refList", () => {
  it("shortens long lists", () => {
    expect(refList(["U1", "U2"])).toBe("U1, U2");
    expect(refList(["C1", "C2", "C3", "C4"], 2)).toBe("C1, C2 +2 more");
  });
});
