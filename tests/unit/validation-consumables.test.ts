import { describe, expect, it } from "vitest";
import { consumableNeeds, gramsOf, mlOf, powderFor, registerAlerts, type RegisterItem } from "@/lib/validation/consumables";

const NOW = Date.parse("2026-11-25T00:00:00Z");
const item = (o: Partial<RegisterItem> & Pick<RegisterItem, "kind">): RegisterItem => ({ id: Math.random().toString(36).slice(2), name: "x", spec: null, quantity: 1, unit: "pcs", minQty: null, location: null, lot: null, expiresAt: null, revisionId: null, ...o });
const lot = [
  { key: "paste", label: "Solder paste", unit: "g", perBoard: 1.2, lot: 640, cost: 0, note: "" },
  { key: "flux", label: "Flux", unit: "ml", perBoard: 3, lot: 1500, cost: null, note: "1.2 ml per dm² ahead of the wave" },
];

describe("consumables against the register", () => {
  it("converts register units", () => {
    expect(gramsOf({ quantity: 2, unit: "jars" })).toBe(1000);
    expect(gramsOf({ quantity: 0.5, unit: "kg" })).toBe(500);
    expect(gramsOf({ quantity: 3, unit: "pcs" })).toBeNull();
    expect(mlOf({ quantity: 2, unit: "L" })).toBe(2000);
    expect(powderFor(100)).toBe("Type 5");
    expect(powderFor(120)).toBe("Type 4");
  });

  it("finds what is missing for a two-sided build with through-hole parts", () => {
    const needs = consumableNeeds({ revisionId: "rev", sides: [{ side: "TOP", stencilUm: 120 }, { side: "BOTTOM", stencilUm: 120 }], lot, now: NOW }, []);
    expect(needs.map((n) => `${n.key}:${n.status}`)).toEqual(["stencil-top:missing", "stencil-bottom:missing", "paste:missing", "flux:missing", "rework-flux:missing"]);
    expect(needs[0].note).toBe("none on file for this board: a 120 µm foil for the top side");
  });

  it("counts only in-date paste, stencils for this board, and flags a foil of the wrong thickness", () => {
    const register = [
      item({ kind: "STENCIL", name: "Top", revisionId: "rev", spec: { side: "TOP", thicknessMm: 0.12 } }),
      item({ kind: "STENCIL", name: "Bottom", revisionId: "rev", spec: { side: "BOTTOM", thicknessMm: 0.15 } }),
      item({ kind: "STENCIL", name: "Another board", revisionId: "other", spec: { side: "TOP", thicknessMm: 0.12 } }),
      item({ kind: "SOLDER_PASTE", name: "SAC305 T4", quantity: 1, unit: "jar", spec: { powderType: "Type 4" }, expiresAt: "2027-03-01" }),
      item({ kind: "SOLDER_PASTE", name: "Old jar", quantity: 4, unit: "jar", expiresAt: "2026-10-01" }),
      item({ kind: "FLUX", name: "No-clean liquid flux", quantity: 2, unit: "L" }),
      item({ kind: "FLUX", name: "Gel flux syringe", quantity: 3, unit: "pcs" }),
    ];
    const needs = consumableNeeds({ revisionId: "rev", sides: [{ side: "TOP", stencilUm: 120 }, { side: "BOTTOM", stencilUm: 120 }], lot, now: NOW }, register);
    const by = Object.fromEntries(needs.map((n) => [n.key, n]));
    expect(by["stencil-top"]).toMatchObject({ status: "ok", have: 1 });
    expect(by["stencil-bottom"]).toMatchObject({ status: "check" });
    expect(by["stencil-bottom"].note).toContain("0.12 mm");
    expect(by.paste).toMatchObject({ status: "short", need: 640, have: 500 });
    expect(by.paste.note).toContain("1 expired jar left out");
    expect(by.flux).toMatchObject({ status: "ok", have: 2000 });
    expect(by["rework-flux"]).toMatchObject({ status: "ok", have: 3 });
  });

  it("lists expired, low and soon-to-expire stock", () => {
    const alerts = registerAlerts([item({ kind: "SOLDER_PASTE", expiresAt: "2026-11-01" }), item({ kind: "FLUX", quantity: 1, minQty: 2, unit: "L" }), item({ kind: "SOLDER_PASTE", expiresAt: "2026-12-10" }), item({ kind: "STENCIL" })], NOW);
    expect(alerts.map((a) => a.why)).toEqual(["expired", "at or below the minimum (2 L)", "expires 2026-12-10"]);
  });
});
