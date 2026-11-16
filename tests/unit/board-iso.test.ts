import { describe, expect, it } from "vitest";
import { VIEW, bounds, corners, depth, planeMatrix, project, shade, view, wallPoints, walls } from "@/lib/board/iso";
import { buildSheets, type LayerMeta } from "@/lib/board/layer-place";

describe("the tilted view of a board", () => {
  it("keeps the centre in the middle and lifts higher points up the picture", () => {
    expect(project(0, 0, 0)[0]).toBeCloseTo(0);
    expect(project(0, 0, 0)[1]).toBeCloseTo(0);
    // Picture y runs down: a point above the board is drawn higher, so its y is smaller.
    expect(project(0, 0, 10)[1]).toBeLessThan(project(0, 0, 0)[1]);
    expect(project(0, 0, 10)[0]).toBeCloseTo(0);
  });

  it("turns the right and the front edge towards the viewer", () => {
    // The board's right side lands to the right, and nearer (lower in the picture) than its left side.
    const right = project(50, 0, 0);
    const left = project(-50, 0, 0);
    expect(right[0]).toBeGreaterThan(left[0]);
    expect(right[1]).toBeGreaterThan(left[1]);
    // The front edge (low y) is nearer than the back edge.
    expect(depth(0, -40)).toBeLessThan(depth(0, 40));
    expect(project(0, -40, 0)[1]).toBeGreaterThan(project(0, 40, 0)[1]);
  });

  it("lays a flat drawing on a level with the same projection", () => {
    // planeMatrix maps picture coordinates (u right, v down = -y) of a level: check it against project().
    const m = planeMatrix(3).match(/matrix\(([^)]+)\)/)![1].split(" ").map(Number);
    const at = (u: number, v: number) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];
    for (const [x, y] of [[12, 7], [-30, 22], [0, -40]] as const) {
      const [px, py] = project(x, y, 3);
      const [qx, qy] = at(x, -y);
      expect(qx).toBeCloseTo(px, 3);
      expect(qy).toBeCloseTo(py, 3);
    }
  });

  it("shows the two walls that face the viewer, the left-facing one lighter", () => {
    const seen = walls(corners(0, 0, 10, 6, 0));
    expect(seen).toHaveLength(2);
    // Front wall (along the low-y edge) and right wall (along the high-x edge).
    const front = seen.find((w) => w.a[1] === -3 && w.b[1] === -3)!;
    const right = seen.find((w) => w.a[0] === 5 && w.b[0] === 5)!;
    expect(front).toBeTruthy();
    expect(right).toBeTruthy();
    expect(front.light).toBeGreaterThan(right.light);
    expect(wallPoints(front, 0, 2).split(" ")).toHaveLength(4);
  });

  it("shows exactly two walls of a part however it is turned", () => {
    for (const turn of [90, 37, 180, 271]) expect(walls(corners(5, 5, 10, 6, turn))).toHaveLength(2);
  });

  it("looks straight down when pitched 90°: no wall faces the viewer more than edge-on", () => {
    const top = view(0, 90);
    // Height no longer moves a point in the picture.
    expect(project(3, 4, 10, top)[1]).toBeCloseTo(project(3, 4, 0, top)[1]);
  });

  it("bounds the picture around the board and what stands on it", () => {
    const b = bounds(100, 80, -2, 12);
    for (const [x, y, z] of [[-50, -40, -2], [50, 40, 12], [50, -40, 0], [-50, 40, 12]] as const) {
      const [px, py] = project(x, y, z);
      expect(px).toBeGreaterThanOrEqual(b.x - 1e-6);
      expect(px).toBeLessThanOrEqual(b.x + b.w + 1e-6);
      expect(py).toBeGreaterThanOrEqual(b.y - 1e-6);
      expect(py).toBeLessThanOrEqual(b.y + b.h + 1e-6);
    }
    expect(VIEW.cp).toBeGreaterThan(0);
  });

  it("makes a colour lighter or darker, and leaves what it cannot read alone", () => {
    expect(shade("#808080", 0.5)).toBe("#c0c0c0");
    expect(shade("#808080", -0.5)).toBe("#404040");
    expect(shade("#fff", -1)).toBe("#000000");
    expect(shade("var(--x)", 0.3)).toBe("var(--x)");
  });
});

describe("the board pulled apart", () => {
  const layers: LayerMeta[] = [
    { key: "copper-top-1", type: "copper", side: "top", index: 1 },
    { key: "copper-inner-3", type: "copper", side: "inner", index: 3 },
    { key: "copper-inner-2", type: "copper", side: "inner", index: 2 },
    { key: "copper-bottom-4", type: "copper", side: "bottom", index: 4 },
    { key: "soldermask-top-9", type: "soldermask", side: "top", index: null },
    { key: "silkscreen-top-7", type: "silkscreen", side: "top", index: null },
    { key: "soldermask-bottom-4", type: "soldermask", side: "bottom", index: null },
  ];
  const spec = { layerCount: 4, thicknessMm: 1.6, maskColor: "green", finish: "ENIG" };

  it("stacks a four-layer board mask, copper, prepreg, copper, core, copper, prepreg, copper, mask", () => {
    const s = buildSheets({ ...spec, layers });
    expect(s.map((x) => x.label)).toEqual(["Solder mask & silkscreen", "Top copper · L1", "Prepreg", "Inner copper · L2", "Core", "Inner copper · L3", "Prepreg", "Bottom copper · L4", "Bottom solder mask"]);
    // Inner layers in their own order, each with its own drawing in copper.
    expect(s[3].draw).toEqual([{ layer: "copper-inner-2", color: "c27c3e" }]);
    expect(s[5].draw).toEqual([{ layer: "copper-inner-3", color: "c27c3e" }]);
    expect(s[0].face).toBe("top");
    expect(s[8].face).toBe("bottom");
    // The laminate between four layers shares 80 % of the board's thickness three ways.
    expect(s[2].note).toBe("0.43 mm");
  });

  it("draws a two-layer board around one core, and plain sheets when no drawing is on file", () => {
    const s = buildSheets({ ...spec, layerCount: 2, layers: [] });
    expect(s.map((x) => x.label)).toEqual(["Solder mask", "Top copper · L1", "Core", "Bottom copper · L2", "Bottom solder mask"]);
    expect(s.every((x) => x.draw.length === 0)).toBe(true);
    expect(s[2].note).toBe("1.3 mm");
  });

  it("counts inner layers from the layer count when their drawings are missing", () => {
    const s = buildSheets({ ...spec, layerCount: 6, layers: layers.filter((l) => l.side !== "inner") });
    expect(s.filter((x) => x.kind === "copper").map((x) => x.label)).toEqual(["Top copper · L1", "Inner copper · L2", "Inner copper · L3", "Inner copper · L4", "Inner copper · L5", "Bottom copper · L6"]);
    expect(s.filter((x) => x.kind === "dielectric").map((x) => x.label)).toEqual(["Prepreg", "Core", "Prepreg", "Core", "Prepreg"]);
  });
});
