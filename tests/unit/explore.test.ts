import { describe, expect, it } from "vitest";
import { FINISHES, PCB_STACKS, VIA_INFO } from "@/knowledge/explore/pcb";
import { CHIP_PACKAGES, DIE_LAYERS, ELEMENT_INFO } from "@/knowledge/explore/chips";
import { EXPLODE_GAP, copperLayers, layoutStack, thicknessMm, viaSpan } from "@/lib/explore/stack-layout";

describe("PCB stack-ups", () => {
  it("are symmetric around the centre, so boards stay flat through reflow", () => {
    for (const s of PCB_STACKS) {
      const kinds = s.layers.map((l) => `${l.kind}:${l.um}`);
      expect(kinds, s.key).toEqual([...kinds].reverse());
    }
  });

  it("finish at a realistic thickness with the right number of copper layers", () => {
    for (const s of PCB_STACKS) {
      expect(thicknessMm(s), s.key).toBeGreaterThan(1.4);
      expect(thicknessMm(s), s.key).toBeLessThan(1.7);
    }
    expect(PCB_STACKS.map((s) => copperLayers(s))).toEqual([2, 4, 6, 8, 6]);
  });

  it("has vias that make physical sense", () => {
    for (const s of PCB_STACKS) {
      const n = copperLayers(s);
      for (const v of s.vias) {
        const [lo, hi] = [Math.min(v.from, v.to), Math.max(v.from, v.to)];
        expect(lo, `${s.key} ${v.kind}`).toBeGreaterThanOrEqual(1);
        expect(hi, `${s.key} ${v.kind}`).toBeLessThanOrEqual(n);
        expect(lo).toBeLessThan(hi);
        if (v.kind === "through") expect([lo, hi]).toEqual([1, n]);
        if (v.kind === "micro") expect(hi - lo, "a microvia spans one dielectric").toBe(1);
        if (v.kind === "buried") expect(lo > 1 && hi < n, `${s.key} buried via must not reach the surface`).toBe(true);
        if (v.kind === "blind") expect((lo === 1) !== (hi === n), `${s.key} blind via starts on exactly one surface`).toBe(true);
        expect(VIA_INFO[v.kind].detail.length).toBeGreaterThan(20);
      }
    }
    expect(FINISHES.map((f) => f.key)).toEqual(["enig", "hasl", "osp", "imm-ag"]);
  });
});

describe("stack layout", () => {
  const four = PCB_STACKS.find((s) => s.key === "4")!;

  it("stacks top to bottom, centred on zero", () => {
    const l = layoutStack(four);
    expect(l.layers[0].kind).toBe("silk");
    for (let i = 1; i < l.layers.length; i++) expect(l.layers[i].z1).toBeLessThanOrEqual(l.layers[i - 1].z0 + 1e-9);
    expect(l.layers.at(-1)!.z0).toBeCloseTo(-l.height / 2);
    expect(l.layers[0].z1).toBeCloseTo(l.height / 2);
    expect([...l.copper.keys()]).toEqual([1, 2, 3, 4]);
  });

  it("adds one gap per boundary when exploded", () => {
    const a = layoutStack(four, 0);
    const b = layoutStack(four, 1);
    expect(b.height - a.height).toBeCloseTo((four.layers.length - 1) * EXPLODE_GAP);
  });

  it("spans a via from the lower copper layer's bottom to the upper one's top", () => {
    const l = layoutStack(four, 0.5);
    const [z0, z1] = viaSpan(l, { kind: "through", from: 1, to: 4, drillMm: 0.3 });
    expect(z1).toBeCloseTo(l.copper.get(1)![1]);
    expect(z0).toBeCloseTo(l.copper.get(4)![0]);
    expect(() => viaSpan(l, { kind: "blind", from: 1, to: 9, drillMm: 0.2 })).toThrow(/missing copper layer/);
  });
});

describe("chip content", () => {
  it("describes every element each package uses", () => {
    expect(new Set(CHIP_PACKAGES.map((p) => p.key)).size).toBe(CHIP_PACKAGES.length);
    for (const p of CHIP_PACKAGES) {
      expect(p.elements.length).toBeGreaterThan(1);
      for (const el of p.elements) expect(ELEMENT_INFO[el], `${p.key}: ${el}`).toBeDefined();
      expect(p.ems.length).toBeGreaterThan(0);
    }
  });

  it("orders the die from substrate to passivation, with a pitch on every metal layer", () => {
    expect(DIE_LAYERS[0].kind).toBe("substrate");
    expect(DIE_LAYERS.at(-1)!.kind).toBe("passivation");
    expect(new Set(DIE_LAYERS.map((l) => l.key)).size).toBe(DIE_LAYERS.length);
    const metals = DIE_LAYERS.filter((l) => l.kind === "metal");
    expect(metals.every((m) => (m.pitchNm ?? 0) > 0)).toBe(true);
    // Wiring gets coarser toward the top.
    expect(metals.map((m) => m.pitchNm!)).toEqual([...metals.map((m) => m.pitchNm!)].sort((a, b) => a - b));
  });
});
