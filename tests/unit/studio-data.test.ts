import { describe, expect, it } from "vitest";
import { forStudio } from "@/lib/board/studio-data";
import type { ViewerData, ViewerPart } from "@/components/viewer/types";

const body = { kind: "chip", length: 1.6, width: 0.8, height: 0.45 } as ViewerPart["body"];

const part = (refDes: string, extra: Partial<ViewerPart> = {}): ViewerPart => ({
  refDes,
  x: 1,
  y: 2,
  rotation: 90,
  side: "TOP",
  body,
  lineId: "line-1",
  lineNo: 3,
  partId: "part-1",
  mpn: "GRM188R71H104KA93D",
  pkg: "0603",
  value: "100nF",
  marking: "GRM188",
  manufacturer: "Murata",
  description: "MLCC 100nF 50V X7R 0603",
  lifecycle: "ACTIVE",
  rohs: null,
  reach: null,
  scores: null,
  worst: 80,
  required: 100,
  available: 5000,
  shortfall: 0,
  bestUnit: 0.4,
  landedUnit: 0.5,
  dnp: false,
  alternates: [{ partId: "p2", mpn: "CL10B104KB8NNNC", type: "DROP_IN" }],
  imageUrl: "https://example.com/a.png",
  datasheetUrl: "https://example.com/a.pdf",
  kind: { slug: "mlcc", name: "MLCC" },
  supply: { ours: 1, partners: 2, suppliers: 3, market: 4, sources: 5, leadWeeks: 6 },
  risk: { score: 10, level: "green", summary: "fine", actions: [] },
  ...extra,
});

const layer = (type: string, side: string, size = 10) => ({ key: `${type}-${side}`, type, side, svg: "x".repeat(size) });

const data = (layers: ViewerData["board"]["layers"], top: string | null = "<svg top/>", bottom: string | null = "<svg bottom/>"): ViewerData => ({
  revisionId: "rev-1",
  title: "GW-200 rev A",
  currency: "INR",
  board: { source: "gerber", width: 100, height: 80, thickness: 1.6, layerCount: 4, maskColor: "green", silkColor: "white", finish: "ENIG", origin: { x: 0, y: 0 }, top, bottom, layers, fab: null },
  parts: [part("C1"), part("R9", { dnp: true, side: "BOTTOM" })],
  approximateLayout: false,
  product: { name: "Gateway", partNumber: "GW-200", revision: "A", customer: "Acme" },
  enclosure: null,
  box: null,
  route: [{ key: "smt" } as unknown as ViewerData["route"][number]],
});

describe("the board studio's data on step 3", () => {
  it("keeps the outer copper, mask, legend and drills, and drops outline, paste and inner layers", () => {
    const d = forStudio(
      data([layer("copper", "top"), layer("copper", "bottom"), layer("copper", "inner"), layer("soldermask", "top"), layer("silkscreen", "bottom"), layer("solderpaste", "top"), layer("outline", "all"), layer("drill", "all")]),
    );
    expect(d.board.layers.map((l) => l.key)).toEqual(["copper-top", "copper-bottom", "soldermask-top", "silkscreen-bottom", "drill-all"]);
  });

  it("drops a composite face only when that side's copper is there to draw it from", () => {
    const both = forStudio(data([layer("copper", "top"), layer("copper", "bottom")]));
    expect([both.board.top, both.board.bottom]).toEqual([null, null]);
    const topOnly = forStudio(data([layer("copper", "top")]));
    expect([topOnly.board.top, topOnly.board.bottom]).toEqual([null, "<svg bottom/>"]);
    const none = forStudio(data([]));
    expect([none.board.top, none.board.bottom]).toEqual(["<svg top/>", "<svg bottom/>"]);
  });

  it("keeps what the studio draws for each part and nothing about price, risk or supply", () => {
    const d = forStudio(data([]));
    expect(d.parts[0]).toMatchObject({ refDes: "C1", x: 1, y: 2, rotation: 90, side: "TOP", body, pkg: "0603", value: "100nF", mpn: "GRM188R71H104KA93D", dnp: false });
    expect(d.parts[1]).toMatchObject({ refDes: "R9", side: "BOTTOM", dnp: true });
    expect(d.parts[0]).toMatchObject({ lineId: null, partId: null, manufacturer: null, scores: null, supply: null, risk: null, alternates: [], imageUrl: null, bestUnit: null });
    expect(d.route).toEqual([]);
    expect(d.box).toBeNull();
    expect(d.enclosure).toBeNull();
    // The board's identity and look stay, so the studio draws the same board as the Gerber step.
    expect(d.title).toBe("GW-200 rev A");
    expect(d.board).toMatchObject({ source: "gerber", width: 100, height: 80, layerCount: 4, maskColor: "green", silkColor: "white", finish: "ENIG" });
    expect(d.product?.partNumber).toBe("GW-200");
  });

  it("is smaller than what it came from", () => {
    const full = data([layer("copper", "top", 5000), layer("copper", "bottom", 5000), layer("solderpaste", "top", 5000), layer("outline", "all", 500)], "x".repeat(20000), "x".repeat(8000));
    expect(JSON.stringify(forStudio(full)).length).toBeLessThan(JSON.stringify(full).length / 2.5);
  });
});
