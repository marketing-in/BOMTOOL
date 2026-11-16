import { describe, expect, it } from "vitest";
import { PARTS, HSN_BY_CATEGORY } from "../../prisma/seed-data/parts";
import { MANUFACTURERS } from "../../prisma/seed-data/manufacturers";
import { PACKAGES } from "../../prisma/seed-data/packages";
import { PARAMETERS } from "../../prisma/seed-data/parameters";
import { CATEGORY_TREE, IMPORT_ONLY_CATEGORIES, type SeedCategory } from "../../prisma/seed-data/categories";
import { BOMS } from "../../prisma/seed-data/boms";
import { LINES } from "../../prisma/seed-data/factory";
import { normaliseManufacturerKey, normaliseMpn } from "@/lib/normalise";

const leafSlugs = (nodes: SeedCategory[]): string[] => nodes.flatMap((n) => (n.children?.length ? leafSlugs(n.children) : [n.slug]));

describe("seed data integrity", () => {
  it("has 200 parts with unique MPN keys per manufacturer", () => {
    expect(PARTS).toHaveLength(200);
    const keys = PARTS.map((p) => `${normaliseMpn(p.mpn)}|${p.mfr}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("references only known manufacturers, leaf categories, packages and parameters", () => {
    const mfrs = new Set(MANUFACTURERS.map((m) => m.name));
    const cats = new Set(leafSlugs(CATEGORY_TREE));
    const pkgs = new Set(PACKAGES.map((p) => p.name));
    const params = new Set(PARAMETERS.map((p) => p.key));
    for (const p of PARTS) {
      expect(mfrs, p.mpn).toContain(p.mfr);
      expect(cats, p.mpn).toContain(p.cat);
      if (p.pkg) expect(pkgs, p.mpn).toContain(p.pkg);
      for (const key of Object.keys(p.params)) expect(params, `${p.mpn}.${key}`).toContain(key);
      expect(p.usd).toBeGreaterThan(0);
    }
  });

  it("covers every leaf category with parts and an HSN code", () => {
    const used = new Set(PARTS.map((p) => p.cat));
    for (const slug of leafSlugs(CATEGORY_TREE).filter((s) => !IMPORT_ONLY_CATEGORIES.includes(s))) {
      expect(used, slug).toContain(slug);
      expect(HSN_BY_CATEGORY[slug], slug).toMatch(/^\d{8}$/);
    }
  });

  it("has no manufacturer alias that resolves to two manufacturers", () => {
    const owner = new Map<string, string>();
    for (const m of MANUFACTURERS) {
      for (const a of [m.name, ...(m.shortName ? [m.shortName] : []), ...m.aliases]) {
        const key = normaliseManufacturerKey(a);
        const prev = owner.get(key);
        expect(prev === undefined || prev === m.name, `${a} → ${prev} and ${m.name}`).toBe(true);
        owner.set(key, m.name);
      }
    }
  });

  it("includes lifecycle risk to exercise scoring", () => {
    const lcs = new Set(PARTS.map((p) => p.lc ?? "ACTIVE"));
    for (const lc of ["ACTIVE", "NRND", "LAST_TIME_BUY", "EOL", "OBSOLETE"]) expect(lcs).toContain(lc);
  });

  it("defines 4 lines and 3 sample BoMs whose MPNs mostly exist in the catalogue", () => {
    expect(LINES).toHaveLength(4);
    expect(BOMS).toHaveLength(3);
    const known = new Set(PARTS.map((p) => normaliseMpn(p.mpn)));
    for (const b of BOMS) {
      const withMpn = b.lines.filter((l) => l.mpn);
      const matched = withMpn.filter((l) => known.has(normaliseMpn(l.mpn!)));
      expect(matched.length, b.name).toBe(withMpn.length);
    }
  });
});
