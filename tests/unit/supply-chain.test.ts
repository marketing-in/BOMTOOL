import { describe, expect, it } from "vitest";
import { matchBoxMakers, matchFabs, normaliseFinish, type BoardCapabilities, type BoxCapabilities, type Vendor } from "@/lib/supply-chain";
import { bomRows } from "@/lib/board/bom-rows";
import type { ViewerPart } from "@/components/viewer/types";

const fab = (code: string, c: Partial<BoardCapabilities>): Vendor<BoardCapabilities> => ({
  id: code,
  code,
  name: code,
  country: "IN",
  capabilities: { maxLayers: 8, finishes: ["HASL-LF", "ENIG"], thicknessMm: [0.6, 2.4], minTraceMm: 0.1, ipcClass: 2, leadDays: { proto: 5, production: 12 }, certifications: [], ...c },
});

describe("PCB fabricators for a board", () => {
  it("normalises finish names", () => {
    expect(normaliseFinish("LF-HASL")).toBe("HASL-LF");
    expect(normaliseFinish("HASL (lead-free)")).toBe("HASL-LF");
    expect(normaliseFinish("enig")).toBe("ENIG");
  });
  it("lists fits first, fastest first, and says why the others don't fit", () => {
    const need = { layers: 6, thicknessMm: 1.6, finish: "ENIG", ipcClass: 2 as const, production: false };
    const r = matchFabs(need, [fab("SLOW", { leadDays: { proto: 9, production: 20 } }), fab("SMALL", { maxLayers: 4 }), fab("FAST", { leadDays: { proto: 3, production: 10 } }), fab("NOENIG", { finishes: ["OSP"] })]);
    expect(r.map((x) => x.code)).toEqual(["FAST", "SLOW", "SMALL", "NOENIG"]);
    expect(r[2].gaps).toEqual(["6 layers — makes up to 4"]);
    expect(r[3].gaps).toEqual(["no ENIG finish"]);
    expect(r[0].leadDays).toBe(3);
  });
  it("uses production lead time and checks IPC class", () => {
    const r = matchFabs({ layers: 2, thicknessMm: 1.6, finish: "LF-HASL", ipcClass: 3, production: true }, [fab("C2", {})]);
    expect(r[0].fits).toBe(false);
    expect(r[0].gaps[0]).toMatch(/IPC class 3/);
    expect(r[0].leadDays).toBe(12);
  });
});

describe("enclosure makers for a box", () => {
  const maker = (code: string, c: Partial<BoxCapabilities>): Vendor<BoxCapabilities> => ({ id: code, code, name: code, country: "IN", capabilities: { styles: ["diecast"], ipMax: "IP65", services: [], leadDays: 10, ...c } });
  it("needs the style, the IP rating and cut-outs", () => {
    const r = matchBoxMakers({ style: "diecast", ipRating: "IP65", cutouts: 2 }, [maker("CAT", { ipMax: "IP67" }), maker("CNC", { services: ["Connector cut-outs"] }), maker("MOULD", { styles: ["moulded"], services: ["Connector cut-outs"] })]);
    expect(r[0].code).toBe("CNC");
    expect(r[0].fits).toBe(true);
    expect(r.find((x) => x.code === "CAT")!.gaps).toEqual(["2 connector cut-outs — machine elsewhere"]);
    expect(r.find((x) => x.code === "MOULD")!.gaps).toEqual(["no diecast enclosures"]);
  });
  it("rejects a lower IP rating", () => {
    const r = matchBoxMakers({ style: "diecast", ipRating: "IP67", cutouts: 0 }, [maker("LOW", { ipMax: "IP54" })]);
    expect(r[0].gaps).toEqual(["IP67 needed — up to IP54"]);
  });
});

describe("BoM list beside the board", () => {
  const part = (refDes: string, lineId: string | null, lineNo: number | null, extra: Partial<ViewerPart> = {}) =>
    ({ refDes, lineId, lineNo, partId: lineId ? "p" : null, mpn: "X", manufacturer: "M", dnp: false, worst: 80, risk: null, supply: null, rohs: null, reach: null, ...extra }) as ViewerPart;
  it("groups designators by line, in line order", () => {
    const rows = bomRows([part("C2", "a", 2), part("U1", "b", 1), part("C1", "a", 2), part("TP1", null, null)]);
    expect(rows.map((r) => [r.lineNo, r.refs])).toEqual([[1, ["U1"]], [2, ["C2", "C1"]], [null, ["TP1"]]]);
    expect(rows[2].level).toBe("red");
  });
});

describe("order services", () => {
  it("keeps valid rows only and totals them", async () => {
    const { readServices, servicesTotal, suggestServices } = await import("@/lib/order-services");
    const list = readServices([{ kind: "transport", detail: "Air", cost: 4500 }, { kind: "spa", cost: 1 }, { kind: "test", detail: "X-ray", cost: -5 }, { kind: "test", detail: "X-ray", cost: 1200.456 }]);
    expect(list).toEqual([{ kind: "transport", detail: "Air", cost: 4500 }, { kind: "test", detail: "X-ray", cost: 1200.46 }]);
    expect(servicesTotal(list)).toBeCloseTo(5700.46);
    expect(readServices(null)).toEqual([]);
    expect(suggestServices({ supplierKind: "BROKER", country: "HK" })).toEqual(["transport", "test"]);
    expect(suggestServices({ supplierKind: "AUTHORISED", country: "IN" })).toEqual([]);
  });
});
