import { describe, expect, it } from "vitest";
import { ARTICLES, PROCESSES, PACKAGE_FAMILY_ARTICLE, articleForCategory } from "@/knowledge";
import { CATEGORY_TREE, type SeedCategory } from "../../prisma/seed-data/categories";
import { PACKAGES } from "../../prisma/seed-data/packages";

const leaves = (nodes: SeedCategory[]): string[] => nodes.flatMap((n) => (n.children?.length ? leaves(n.children) : [n.slug]));
const slugs = new Set(ARTICLES.map((a) => a.slug));

describe("knowledge content", () => {
  it("has unique slugs and a healthy amount of content", () => {
    expect(slugs.size).toBe(ARTICLES.length);
    expect(ARTICLES.length).toBeGreaterThanOrEqual(70);
  });

  it("every article has a summary, tags and at least one section", () => {
    for (const a of ARTICLES) {
      expect(a.summary.length, a.slug).toBeGreaterThan(30);
      expect(a.tags.length, a.slug).toBeGreaterThan(0);
      expect(a.sections.length, a.slug).toBeGreaterThan(0);
      for (const s of a.sections) {
        if (s.type === "table") for (const r of s.rows) expect(r.length, `${a.slug}/${s.heading}`).toBe(s.columns.length);
      }
    }
  });

  it("related links resolve", () => {
    for (const a of ARTICLES) for (const r of a.related ?? []) expect(slugs, `${a.slug} → ${r}`).toContain(r);
  });

  it("every catalogue category except 'uncategorised' has an article", () => {
    for (const c of leaves(CATEGORY_TREE).filter((s) => s !== "uncategorised")) {
      expect(articleForCategory(c), c).toBeDefined();
    }
  });

  it("every package family maps to an article", () => {
    for (const p of PACKAGES) expect(slugs, p.family).toContain(PACKAGE_FAMILY_ARTICLE[p.family]);
  });

  it("process players point at articles and processes referenced by articles exist", () => {
    for (const p of PROCESSES) expect(slugs).toContain(p.article);
    const processSlugs = new Set(PROCESSES.map((p) => p.slug));
    for (const a of ARTICLES) if (a.visual?.kind === "process") expect(processSlugs, a.slug).toContain(a.visual.process);
  });
});
