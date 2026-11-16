import { describe, expect, it } from "vitest";
import { classifyBox, classifyPcb, fabsFor, recogniseBoard, type BoardTypeLike, type FabLike } from "@/lib/directory/recognise";
import { readPartMaster, searchPartMaster, masterCategories } from "@/lib/directory/part-master";
import boardTypes from "@/knowledge/data/board-types.json";
import partMaster from "@/knowledge/data/part-master.json";
import { PCB_TECHNOLOGIES } from "@/knowledge/pcb-technologies";
import { BOX_TYPES } from "@/knowledge/box-types";

describe("board type recognition", () => {
  const types = (boardTypes as unknown as { types: BoardTypeLike[] }).types;
  it("has circuitflow's 61 board types with unique ids", () => {
    expect(types).toHaveLength(61);
    expect(new Set(types.map((t) => t.id)).size).toBe(61);
  });
  it("recognises an Arduino-class board from its chips", () => {
    const m = recogniseBoard({ mpns: ["ATMEGA328P-AU", "CSTCE16M0V53-R0", "AMS1117-5.0"], text: "atmega 16 mhz ceramic resonator ldo usb-b pin header", partCount: 40, widthMm: 68, heightMm: 53, layers: 2 }, types);
    expect(m[0].id).toBe("arduino-avr-board");
    expect(m[0].reasons[0]).toMatch(/chip family/);
  });
  it("returns nothing for a design with no signals", () => {
    expect(recogniseBoard({ mpns: [], text: "", partCount: 0, widthMm: 0, heightMm: 0, layers: 0 }, types)).toEqual([]);
  });
});

describe("PCB technology and box type", () => {
  it("classifies by layers, Tg, copper and material", () => {
    expect(classifyPcb({ layers: 4, thicknessMm: 1.6, material: "FR-4 Tg150" })).toEqual({ primary: "fr4-4l", also: [] });
    expect(classifyPcb({ layers: 6, thicknessMm: 1.6, copperOz: 2, material: "FR-4 Tg170" })).toEqual({ primary: "fr4-6l-plus", also: ["high-tg"] });
    expect(classifyPcb({ layers: 2, thicknessMm: 1.6, copperOz: 3 }).also).toEqual(["heavy-copper"]);
    expect(classifyPcb({ layers: 1, thicknessMm: 1.6, material: "Aluminium MCPCB 2 W/mK" }).primary).toBe("mcpcb");
    for (const slug of ["fr4-2l", "fr4-4l", "fr4-6l-plus", "high-tg", "heavy-copper", "mcpcb"]) expect(PCB_TECHNOLOGIES.some((t) => t.slug === slug)).toBe(true);
  });
  it("classifies enclosures, sealed ones by IP", () => {
    expect(classifyBox("extruded", "IP54")).toBe("extruded-aluminium");
    expect(classifyBox("diecast", "IP67")).toBe("sealed-ip67");
    expect(classifyBox(null, null)).toBeNull();
    for (const slug of ["extruded-aluminium", "sealed-ip67", "diecast-aluminium", "moulded-plastic"]) expect(BOX_TYPES.some((b) => b.slug === slug)).toBe(true);
  });
  it("matches fabs on layers and special processes", () => {
    const fab = (id: string, maxLayers: number, technologies: string[] = []): FabLike => ({ id, name: id, country: "IN", capabilities: { maxLayers, technologies, leadDays: { proto: maxLayers, production: 10 }, finishes: [], ipcClass: 2, certifications: [] } });
    const r = fabsFor({ minLayers: 6, technology: "hdi" }, [fab("A", 8), fab("B", 16, ["hdi"]), fab("C", 4, ["hdi"])]);
    expect(r.map((f) => [f.id, f.fits])).toEqual([["B", true], ["C", false], ["A", false]]);
    expect(r[1].gaps).toEqual(["up to 4 layers"]);
  });
});

describe("part master", () => {
  const rows = readPartMaster(partMaster as Parameters<typeof readPartMaster>[0]);
  it("reads 2,683 reference parts", () => {
    expect(rows).toHaveLength(1454 + 1229);
    expect(masterCategories(rows)[0]).toEqual({ name: "Resistor", count: 1229 });
  });
  it("searches every word across MPN, maker, description and package", () => {
    const r = searchPartMaster(rows, "1n4001", null);
    expect(r.rows[0].mpn).toBe("1N4001");
    const res = searchPartMaster(rows, "10k 0603", "Resistor");
    expect(res.total).toBeGreaterThan(0);
    expect(res.rows.every((x) => x.kind === "res")).toBe(true);
    expect(searchPartMaster(rows, "", "Diode", 99).page).toBe(searchPartMaster(rows, "", "Diode", 99).pages);
  });
});

describe("directory seed data", async () => {
  const { COMPONENT_FAMILIES, COMPONENT_GROUPS } = await import("@/knowledge/component-families");
  const { LAMINATES, FINISHES, BOARD_FEATURES } = await import("@/knowledge/pcb-materials");
  const { ENCLOSURE_MATERIALS, ENCLOSURE_FINISHES } = await import("@/knowledge/enclosure-materials");
  const { CATEGORY_TREE, IMPORT_ONLY_CATEGORIES } = await import("../../prisma/seed-data/categories");
  const slugs = new Set([...CATEGORY_TREE.flatMap((c) => [c.slug, ...(c.children ?? []).map((x) => x.slug)]), ...IMPORT_ONLY_CATEGORIES]);
  const unique = (xs: { slug: string }[]) => new Set(xs.map((x) => x.slug)).size === xs.length;
  it("has unique slugs everywhere", () => {
    for (const list of [COMPONENT_FAMILIES, LAMINATES, FINISHES, BOARD_FEATURES, ENCLOSURE_MATERIALS, ENCLOSURE_FINISHES, PCB_TECHNOLOGIES, BOX_TYPES]) expect(unique(list)).toBe(true);
  });
  it("covers every group and links families to real catalogue categories", () => {
    for (const g of COMPONENT_GROUPS) expect(COMPONENT_FAMILIES.some((x) => x.group === g)).toBe(true);
    for (const fam of COMPONENT_FAMILIES) {
      if (fam.category) expect(slugs.has(fam.category), fam.slug).toBe(true);
      expect(fam.makers.length, fam.slug).toBeGreaterThan(2);
      expect(fam.subTypes.length, fam.slug).toBeGreaterThan(0);
    }
  });
  it("keeps material values sane", () => {
    for (const l of LAMINATES) expect(l.cost).toBeGreaterThan(0);
    for (const m of ENCLOSURE_MATERIALS) {
      expect(m.density).toBeGreaterThan(0.3);
      expect(m.density).toBeLessThan(9);
    }
    expect(FINISHES.find((x) => x.slug === "hasl")!.rohs).toBe(false);
  });
});
