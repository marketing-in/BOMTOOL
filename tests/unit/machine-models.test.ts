import { describe, expect, it } from "vitest";
import { LINES } from "../../prisma/seed-data/factory";
import { MACHINE_KINDS, CHIP_ORDER } from "@/lib/ops/machines";
import { MACHINE_MODELS, findModel, normName, type Fact, type MachineModel } from "@/knowledge/machine-models";
import { PACKAGE_LADDER, packageReach, placerCaps, type PlacerCaps } from "@/lib/ops/package-reach";

const machines = LINES.flatMap((l) => l.machines.map((m) => ({ line: l.code, ...m })));
const words = (s: string) => s.trim().split(/\s+/).length;
const sortPair = (p: unknown): [number, number] | null => (Array.isArray(p) && p.length === 2 ? ([Math.max(p[0], p[1]), Math.min(p[0], p[1])] as [number, number]) : null);

/** Machines we expect no model profile for: none since the in-house benches left with the through-hole and box-build lines. */
const NO_PROFILE = new Set<string>([]);

describe("machine model profiles", () => {
  it("every machine on our lines resolves, except the in-house benches", () => {
    const missing: string[] = [];
    for (const m of machines) {
      const name = `${m.vendor} ${m.model}`;
      const prof = findModel(m.vendor, m.model);
      if (NO_PROFILE.has(name)) {
        expect(prof, name).toBeNull();
        continue;
      }
      if (!prof) missing.push(name);
      else expect(prof.kind, name).toBe(m.type);
    }
    expect(missing).toEqual([]);
    // The list of exceptions matches the plant exactly.
    expect(machines.filter((m) => findModel(m.vendor, m.model) === null).map((m) => `${m.vendor} ${m.model}`).sort()).toEqual([...NO_PROFILE].sort());
  });

  it("resolves the right Janome robot and the not-installed kit", () => {
    expect(findModel("Janome", "JR3403 + SVC-300 spray valve")?.id).toBe("janome-jr3403-coater");
    expect(findModel("Janome", "JR3403 router")?.id).toBe("janome-jr3403-router");
    expect(findModel("Yamaha", "YSM20R Z:LEX #2")?.id).toBe("yamaha-ysm20r");
    expect(findModel("EMST", "Konark 710EC")?.id).toBe("emst-konark-710ec");
    expect(findModel("Omron", "VT-RNS II-pt")?.id).toBe("omron-vt-rns-ii-pt");
    expect(findModel("CKD", "VP-01G")?.id).toBe("ckd-vp-01g");
    expect(findModel("Magic-ray", "V5300")?.id).toBe("magic-ray-v5300");
    expect(findModel("Magic-ray", "Cube+")?.id).toBe("magic-ray-cube");
    expect(findModel("Acme", "Mystery 9000")).toBeNull();
  });

  it("profiles are well formed", () => {
    const ids = MACHINE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MACHINE_MODELS) {
      expect(m.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(Object.keys(MACHINE_KINDS)).toContain(m.kind);
      expect(m.match.length, m.id).toBeGreaterThan(0);
      for (const n of m.match) expect(n, m.id).toBe(n.toLowerCase());
      expect(words(m.oneLiner), m.id).toBeLessThanOrEqual(14);
      expect(m.strengths.length, m.id).toBeLessThanOrEqual(3);
      expect(m.limits.length, m.id).toBeLessThanOrEqual(3);
      for (const s of [...m.strengths, ...m.limits]) expect(words(s), `${m.id}: ${s}`).toBeLessThanOrEqual(10);
      expect(m.keyFacts.length, m.id).toBeGreaterThanOrEqual(1);
      expect(m.keyFacts.length, m.id).toBeLessThanOrEqual(8);
      expect(m.version).toBe(1);
      if (m.kind === "PICK_AND_PLACE") expect(m.placement, m.id).toBeDefined();
      else expect(m.placement, m.id).toBeUndefined();
      if (m.placement?.minChip) expect(CHIP_ORDER as readonly string[]).toContain(m.placement.minChip.value);
      if (m.launched) expect(m.launched.value).toBeGreaterThan(1980);
    }
    // No two profiles share a needle.
    const needles = MACHINE_MODELS.flatMap((m) => m.match.map(normName));
    expect(new Set(needles).size).toBe(needles.length);
  });

  it("facts marked 'sheet' agree with the plant's machine specs", () => {
    const sheet = <T>(f: Fact<T> | undefined): T | undefined => (f && f.source === "sheet" ? f.value : undefined);
    let checked = 0;
    for (const m of machines) {
      const prof: MachineModel | null = findModel(m.vendor, m.model);
      if (!prof || !m.specs) continue;
      const s = m.specs as Record<string, unknown>;
      const eqPair = (fact: [number, number] | undefined, spec: unknown, what: string) => {
        if (fact === undefined || spec === undefined) return;
        expect(sortPair(fact), `${prof.id} ${what}`).toEqual(sortPair(spec));
        checked++;
      };
      const eq = (fact: unknown, spec: unknown, what: string) => {
        if (fact === undefined || spec === undefined) return;
        expect(fact, `${prof.id} ${what}`).toEqual(spec);
        checked++;
      };
      eqPair(sheet(prof.board.maxMm), s.maxBoardMm, "max board");
      eqPair(sheet(prof.board.minMm), s.minBoardMm, "min board");
      const t = sheet(prof.board.thicknessMm);
      if (t) {
        eq(t[0], s.minThicknessMm, "min thickness");
        eq(t[1], s.maxThicknessMm, "max thickness");
      }
      const p = prof.placement;
      if (p) {
        eq(sheet(p.minChip), s.minChip, "min chip");
        eqPair(sheet(p.maxPartMm), s.maxComponentMm, "max part");
        eq(sheet(p.maxPartHeightMm), s.maxComponentHeightMm, "max height");
        eq(sheet(p.feederSlots8mm), s.feederSlots, "feeder slots");
        eq(sheet(p.ratedCph), s.cph, "rated CPH");
        const acc = sheet(p.accuracyUm);
        if (acc !== undefined && typeof s.accuracyMm === "number") eq(acc, Math.round(s.accuracyMm * 1000), "accuracy");
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("only a sheet value may claim to come from the plant's figures for placers on the floor", () => {
    // Placer sheet facts must exist in factory.ts (not invented): every 'sheet' minChip/maxPart/height has a spec.
    for (const m of machines.filter((x) => x.type === "PICK_AND_PLACE")) {
      const p = findModel(m.vendor, m.model)!.placement!;
      const s = (m.specs ?? {}) as Record<string, unknown>;
      if (p.minChip?.source === "sheet") expect(s.minChip).toBeDefined();
      if (p.maxPartMm?.source === "sheet") expect(s.maxComponentMm).toBeDefined();
      if (p.maxPartHeightMm?.source === "sheet") expect(s.maxComponentHeightMm).toBeDefined();
      if (p.ratedCph?.source === "sheet") expect(s.cph).toBeDefined();
    }
  });
});

describe("package reach", () => {
  const m20 = LINES.flatMap((l) => l.machines).find((m) => m.model === "M20 i-Pulse")!;
  const reachOf = (caps: PlacerCaps) => Object.fromEntries(packageReach(caps).map((r) => [r.id, r]));

  it("covers the ladder small to large", () => {
    expect(PACKAGE_LADDER.map((p) => p.label)).toEqual([
      "01005",
      "0201",
      "0402",
      "0603",
      "0805/1206",
      "SOT-23/SOD",
      "SOIC",
      "TSSOP/SSOP (0.65)",
      "QFP 0.5",
      "QFP 0.4",
      "QFN/DFN",
      "BGA 0.8+",
      "BGA 0.5",
      "CSP/WLCSP 0.4",
      "Large BGA (>35 mm)",
      "Electrolytic / tall (>10 mm)",
      "Large connector / odd-form (>50 mm)",
    ]);
  });

  it("M20 i-Pulse: 0201 min, 120 × 90 max, 25 mm tall", () => {
    const caps = placerCaps(m20.specs, findModel(m20.vendor, m20.model));
    expect(caps.minChip).toBe("0201");
    expect(caps.from.minChip).toBe("machine");
    expect(caps.accuracyUm).toBe(25);
    const r = reachOf(caps);
    expect(r["01005"].reach).toBe("no");
    expect(r["01005"].reason).toMatch(/0201/);
    expect(r["0201"].reach).toBe("yes");
    expect(r["0402"].reach).toBe("yes");
    expect(r["0805-1206"].reach).toBe("yes");
    expect(r["sot23-sod"].reach).toBe("yes");
    expect(r["soic"].reach).toBe("yes");
    expect(r["qfp-0.5"].reach).toBe("yes");
    // No finest pitch on file: 0.4 mm parts need a trial, never a blind yes.
    expect(r["qfp-0.4"].reach).toBe("check");
    expect(r["csp-0.4"].reach).toBe("check");
    expect(r["bga-large"].reach).toBe("yes");
    expect(r["tall"].reach).toBe("yes");
    expect(r["odd-form"].reach).toBe("yes");
    expect(r["odd-form"].reason).toMatch(/120 × 90/);
  });

  it("YSM20R: large odd-form fits 100 × 55, tall parts within the FM head's 28 mm", () => {
    const y = LINES.flatMap((l) => l.machines).find((m) => m.model.startsWith("YSM20R"))!;
    const r = reachOf(placerCaps(y.specs, findModel(y.vendor, y.model)));
    expect(r["01005"].reach).toBe("no");
    expect(r["0201"].reach).toBe("yes");
    expect(r["bga-large"].reach).toBe("yes");
    expect(r["odd-form"].reach).toBe("yes");
    expect(r["tall"].reach).toBe("yes");
  });

  it("limits say no: a small chip-shooter can't take big or tall parts", () => {
    const caps = placerCaps({ minChip: "0402", maxComponentMm: [30, 30], maxComponentHeightMm: 6, minPitchMm: 0.5 }, null);
    const r = reachOf(caps);
    expect(r["0201"].reach).toBe("no");
    expect(r["0402"].reach).toBe("yes");
    expect(r["qfp-0.5"].reach).toBe("yes");
    expect(r["qfp-0.4"].reach).toBe("no");
    expect(r["csp-0.4"].reach).toBe("no");
    expect(r["bga-large"].reach).toBe("no");
    expect(r["tall"].reach).toBe("no");
    expect(r["odd-form"].reach).toBe("no");
  });

  it("1206-only placers get a partial on 0805/1206", () => {
    const r = reachOf(placerCaps({ minChip: "1206", maxComponentMm: [50, 50], maxComponentHeightMm: 15 }, null));
    expect(r["0805-1206"].reach).toBe("check");
    expect(r["0603"].reach).toBe("no");
  });

  it("unknown inputs give check, never yes", () => {
    const r = packageReach(placerCaps(null, null));
    expect(r.every((x) => x.reach === "check")).toBe(true);
  });

  it("falls back to the model profile when the machine record is empty", () => {
    const prof = findModel("Yamaha", "M20 i-Pulse")!;
    const caps = placerCaps({}, prof);
    expect(caps.minChip).toBe("0201");
    expect(caps.from.minChip).toBe("sheet");
    expect(caps.maxPartMm).toEqual([120, 90]);
    expect(reachOf(caps)["01005"].reach).toBe("no");
  });
});
