import { describe, expect, it } from "vitest";
import { DICTIONARY, GROUPS, dictEntry, entryForPart, searchDictionary } from "@/knowledge/dictionary";
import { ARTICLES } from "@/knowledge";
import { CATEGORY_TREE } from "../../prisma/seed-data/categories";
import { PACKAGES } from "../../prisma/seed-data/packages";

const categorySlugs = new Set(CATEGORY_TREE.flatMap((c) => [c.slug, ...(c.children ?? []).map((k) => k.slug)]));
const articleSlugs = new Set(ARTICLES.map((a) => a.slug));
const packageNames = new Set(PACKAGES.map((p) => p.name));
const slugs = new Set(DICTIONARY.map((e) => e.slug));
const isSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);

describe("dictionary content integrity", () => {
  it("has unique kebab-case slugs", () => {
    expect(slugs.size).toBe(DICTIONARY.length);
    for (const e of DICTIONARY) expect(isSlug(e.slug), e.slug).toBe(true);
  });

  it("every related entry and sub-assembly slug exists", () => {
    const missing: string[] = [];
    for (const e of DICTIONARY) {
      for (const r of e.related ?? []) if (!slugs.has(r)) missing.push(`${e.slug} → related ${r}`);
      for (const s of e.subassemblies ?? []) if (isSlug(s) && !slugs.has(s)) missing.push(`${e.slug} → part ${s}`);
    }
    expect(missing).toEqual([]);
  });

  it("every catalogue category, article and 3D package exists", () => {
    const missing: string[] = [];
    for (const e of DICTIONARY) {
      for (const c of e.categories ?? []) if (!categorySlugs.has(c)) missing.push(`${e.slug} → category ${c}`);
      if (e.article && !articleSlugs.has(e.article)) missing.push(`${e.slug} → article ${e.article}`);
      if (e.model?.kind === "package" && !packageNames.has(e.model.package)) missing.push(`${e.slug} → package ${e.model.package}`);
    }
    expect(missing).toEqual([]);
  });

  it("every entry is complete enough to be useful", () => {
    for (const e of DICTIONARY) {
      expect(e.oneLiner.length, e.slug).toBeGreaterThan(20);
      expect(e.what.length, e.slug).toBeGreaterThan(40);
      expect(e.how.length, e.slug).toBeGreaterThan(40);
      expect(e.specs.length, e.slug).toBeGreaterThanOrEqual(1);
      expect(e.uses.length, e.slug).toBeGreaterThanOrEqual(1);
      expect(e.selection.length, e.slug).toBeGreaterThanOrEqual(1);
      expect(e.alternatives.rules.length, e.slug).toBeGreaterThanOrEqual(1);
    }
  });

  it("machines say where they sit, what they're made of and how to maintain them", () => {
    for (const e of DICTIONARY.filter((x) => x.group === "machines")) {
      expect(e.station, e.slug).toBeTruthy();
      expect(e.subassemblies?.length, e.slug).toBeGreaterThan(0);
      expect(e.maintenance?.length, e.slug).toBeGreaterThan(0);
      expect(e.defects?.length, e.slug).toBeGreaterThan(0);
    }
  });

  it("every group has entries", () => {
    for (const g of GROUPS) expect(DICTIONARY.filter((e) => e.group === g.key).length, g.key).toBeGreaterThanOrEqual(3);
    expect(DICTIONARY.length).toBeGreaterThanOrEqual(200);
  });
});

describe("dictionary search", () => {
  const top = (q: string) => searchDictionary(q)[0]?.entry.slug;
  const inTop = (q: string, slug: string, n = 3) => searchDictionary(q).slice(0, n).some((h) => h.entry.slug === slug);

  it("finds entries by name, abbreviation and well-known part number", () => {
    expect(top("LDO")).toBe("ldo-regulator");
    expect(top("AMS1117")).toBe("ldo-regulator");
    expect(top("7805")).toBe("linear-regulator");
    expect(top("LM358")).toBe("op-amp");
    expect(top("TVS diode")).toBe("tvs-diode");
    expect(inTop("reflow", "reflow-oven")).toBe(true);
    expect(inTop("nozzle", "placement-nozzle")).toBe(true);
    expect(inTop("MLCC", "mlcc-capacitor")).toBe(true);
    expect(inTop("pogo", "pogo-pin")).toBe(true);
  });

  it("returns nothing for nonsense and requires every word to match", () => {
    expect(searchDictionary("qwertyuiop")).toEqual([]);
    expect(searchDictionary("")).toEqual([]);
  });
});

describe("part → dictionary entry", () => {
  it("picks the entry that fits the part, not just the category", () => {
    expect(entryForPart({ categorySlug: "mosfet", description: "P-channel MOSFET −30 V 4 A SOT-23" })?.slug).toBe("p-mosfet");
    expect(entryForPart({ categorySlug: "mosfet", description: "N-channel logic-level MOSFET 60 V" })?.slug).toBe("n-mosfet");
    expect(entryForPart({ categorySlug: "diode", description: "Schottky rectifier 3 A 40 V SMA" })?.slug).toBe("schottky-diode");
    expect(entryForPart({ categorySlug: "diode", description: "TVS diode 600 W bidirectional SMB" })?.slug).toBe("tvs-diode");
    expect(entryForPart({ categorySlug: "mlcc", description: "100 nF 50 V X7R 0603" })?.slug).toBe("mlcc-capacitor");
    expect(entryForPart({ categorySlug: "power-ic", description: "LDO regulator 3.3 V 1 A SOT-223", mpn: "AMS1117-3.3" })?.slug).toBe("ldo-regulator");
  });

  it("returns undefined for categories the dictionary doesn't cover", () => {
    expect(entryForPart({ categorySlug: "uncategorised" })).toBeUndefined();
    expect(dictEntry("does-not-exist")).toBeUndefined();
  });
});
