import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOUR, tourStops } from "@/knowledge/tour";
import { NAV } from "@/components/shell/nav";

const pageFor = (href: string) => path.join(process.cwd(), "src/app/(app)", href.replace("{bom}", "[id]"), "page.tsx");

describe("app tour", () => {
  it("opens a page that exists at every stop", () => {
    for (const s of tourStops()) expect([s.key, existsSync(pageFor(s.href))]).toEqual([s.key, true]);
  });

  it("gives every stop something to read and something to try", () => {
    const stops = tourStops();
    expect(stops.length).toBeGreaterThanOrEqual(15);
    expect(new Set(stops.map((s) => s.key)).size).toBe(stops.length);
    for (const s of stops) {
      expect(s.what.length).toBeGreaterThan(30);
      expect(s.tryIt.length).toBeGreaterThan(0);
      expect(s.who.length).toBeGreaterThan(0);
      expect(s.menu.length).toBeGreaterThan(0);
    }
    expect(TOUR.map((c) => c.title[0])).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("is in the side menu, and every menu entry leads to a page", () => {
    const items = NAV.flatMap((g) => g.items);
    expect(items.find((i) => i.href === "/tour")?.label).toBe("App tour");
    expect(items.find((i) => i.href === "/reverse")?.label).toBe("Reverse engineering");
    for (const i of items) expect([i.href, existsSync(pageFor(i.href))]).toEqual([i.href, true]);
  });

  it("covers the pages a job passes through", () => {
    const hrefs = tourStops().map((s) => s.href);
    for (const must of ["/boms/new", "/viewer/new", "/boms/{bom}/build/parts", "/boms/{bom}/feasibility", "/boms/{bom}/reverse", "/sourcing", "/operations", "/compliance"]) expect(hrefs).toContain(must);
  });
});
