import { describe, expect, it } from "vitest";
import { confirmWord, deleteBlocker, impactLines, type RevisionImpact } from "@/lib/bom/delete";

const base: RevisionImpact = {
  bomName: "GW-200 Main Board",
  revision: "B",
  lines: 28,
  hasBoard: true,
  placements: 75,
  quotes: 2,
  issuedQuotes: 1,
  reviews: 1,
  carts: 1,
  workOrders: [],
  otherRevisions: 1,
};

describe("deleting a BoM revision", () => {
  it("is allowed with no work orders, and refused while work orders build it", () => {
    expect(deleteBlocker(base)).toBeNull();
    const blocked = deleteBlocker({ ...base, workOrders: ["WO-2026-0001", "WO-2026-0002", "WO-2026-0003", "WO-2026-0004"] });
    expect(blocked).toMatch(/WO-2026-0001, WO-2026-0002, WO-2026-0003 and 1 more/);
    expect(blocked).toMatch(/Close or cancel them/);
  });

  it("lists what goes with it", () => {
    const lines = impactLines(base);
    expect(lines[0]).toMatch(/^28 BoM lines/);
    expect(lines).toContain("The Gerbers and the board drawn from them");
    expect(lines).toContain("75 part positions");
    expect(lines.some((l) => /2 customer quotes, 1 already issued/.test(l))).toBe(true);
    expect(lines.some((l) => /1 cart made from it stay/.test(l))).toBe(true);
    // Another revision remains, so the BoM itself stays.
    expect(lines.some((l) => /only revision/.test(l))).toBe(false);
  });

  it("says the BoM goes too when it is the only revision, and leaves out what is not there", () => {
    const lines = impactLines({ ...base, otherRevisions: 0, hasBoard: false, placements: 0, quotes: 0, issuedQuotes: 0, reviews: 0, carts: 0, lines: 1 });
    expect(lines).toEqual(["1 BoM line with their matches and chosen sources", "The BoM “GW-200 Main Board” itself — this is its only revision"]);
  });

  it("is confirmed by typing the revision label", () => {
    expect(confirmWord({ revision: " B " })).toBe("B");
  });
});
