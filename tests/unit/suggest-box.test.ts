import { describe, expect, it } from "vitest";
import { ENCLOSURES, suggestEnclosure } from "@/lib/board/enclosures";
import { withSuggestedBox } from "@/lib/board/suggest-box";
import type { ViewerData, ViewerPart } from "@/components/viewer/types";

const part = (side: "TOP" | "BOTTOM", height: number, dnp = false) => ({ refDes: `U${height}${side}`, side, dnp, x: 0, y: 0, rotation: 0, body: { length: 5, width: 5, height } }) as unknown as ViewerPart;

const viewer = (w: number, h: number, parts: ViewerPart[], extra: Partial<ViewerData> = {}) =>
  ({ board: { width: w, height: h, thickness: 1.6 }, parts, enclosure: null, box: null, route: [], product: null, ...extra }) as unknown as ViewerData;

describe("suggestEnclosure", () => {
  it("picks the smallest stocked box the board fits as it lies", () => {
    const s = suggestEnclosure({ w: 80, h: 30, thickness: 1.6 }, [{ side: "TOP", body: { height: 8 } }]);
    expect(s.stocked).toBe(true);
    expect(s.spec.mpn).toBe("1590A");
  });

  it("does not turn the board to make it fit, and skips a box too low for the tallest part", () => {
    // 100 long fits the 1590B / N1 outline, but a 20 mm part needs more height than either has.
    const s = suggestEnclosure({ w: 100, h: 50, thickness: 1.6 }, [{ side: "TOP", body: { height: 20 } }]);
    expect(s.stocked).toBe(true);
    const e = ENCLOSURES[s.spec.mpn];
    expect(e.height - e.lidHeight - (e.wall + 6 + 1.6) - 20).toBeGreaterThanOrEqual(1);
    expect(["1590A", "1590B"]).not.toContain(s.spec.mpn);
  });

  it("makes a box to fit a board no stocked box takes", () => {
    const s = suggestEnclosure({ w: 140, h: 140, thickness: 1.6 }, [
      { side: "TOP", body: { height: 12 } },
      { side: "BOTTOM", body: { height: 3 } },
    ]);
    expect(s.stocked).toBe(false);
    expect(s.spec.style).toBe("diecast");
    // 6 mm round the board inside a 2.5 mm wall; standoffs clear the 3 mm underneath.
    expect(s.spec.length).toBe(157);
    expect(s.spec.width).toBe(157);
    expect(s.spec.height).toBe(Math.ceil(2.5 + 6 + 1.6 + 12 + 5 + 4));
    expect(s.spec.mpn).toBe("Made to fit 157 × 157 × 32");
  });
});

describe("withSuggestedBox", () => {
  it("gives a board with no box one that it fits, with room under the lid", () => {
    const d = withSuggestedBox(viewer(140, 140, [part("TOP", 12), part("BOTTOM", 3), part("TOP", 40, true)]));
    expect(d.boxSuggested).toBe("made");
    expect(d.enclosure?.fits).toBe(true);
    expect(d.box?.fit.ok).toBe(true);
    // A part that is not fitted does not set the height.
    expect(d.enclosure!.height).toBeLessThan(40);
    // The box line says it is our suggestion, not a spec item missing from the BoM.
    const item = d.box!.kit.find((k) => k.key === "enclosure")!;
    expect(item.status).toBe("check");
    expect(item.why).toMatch(/suggestion/i);
  });

  it("leaves a spec's own box alone", () => {
    const given = viewer(80, 30, [], { enclosure: { ...ENCLOSURES["1590B"], fits: true, partId: "p", ipRating: null }, box: {} as ViewerData["box"] });
    expect(withSuggestedBox(given)).toBe(given);
  });
});
