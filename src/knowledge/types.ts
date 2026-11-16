import type { KnowledgeDomain } from "@prisma/client";

export type Tone = "tip" | "risk" | "neutral";

export type Section =
  | { type: "text"; heading: string; paragraphs: string[] }
  | { type: "facts"; heading: string; items: { label: string; value: string }[] }
  | { type: "list"; heading: string; items: string[]; tone?: Tone }
  | { type: "table"; heading: string; columns: string[]; rows: string[][]; note?: string }
  | { type: "steps"; heading: string; steps: { title: string; detail: string }[] };

export type Visual =
  | { kind: "process"; process: string }
  | { kind: "stackup" }
  | { kind: "package"; family: string }
  | { kind: "packages" };

export type Article = {
  slug: string;
  domain: KnowledgeDomain;
  title: string;
  summary: string;
  tags: string[];
  /** Bump when the content changes; sync updates only newer versions. */
  version: number;
  sections: Section[];
  standards?: { code: string; title: string }[];
  related?: string[];
  /** Part categories (slugs) this article explains. */
  categorySlugs?: string[];
  visual?: Visual;
};

/** Shape every component-family article follows, so they read the same way. */
export type ComponentEntry = {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  categorySlugs: string[];
  version?: number;
  whatItIs: string;
  howItWorks: string;
  keyParameters: { label: string; value: string }[];
  variants: string[];
  manufacturers: string[];
  failureModes: string[];
  sourcingTips: string[];
  standards?: { code: string; title: string }[];
  related?: string[];
  extra?: Section[];
};

export function componentArticle(c: ComponentEntry): Article {
  return {
    slug: c.slug,
    domain: "COMPONENT",
    title: c.title,
    summary: c.summary,
    tags: c.tags,
    version: c.version ?? 1,
    categorySlugs: c.categorySlugs,
    standards: c.standards,
    related: c.related,
    sections: [
      { type: "text", heading: "What it is", paragraphs: [c.whatItIs] },
      { type: "text", heading: "How it works", paragraphs: [c.howItWorks] },
      { type: "facts", heading: "Parameters to match on", items: c.keyParameters },
      { type: "list", heading: "Packages & variants", items: c.variants },
      { type: "list", heading: "Common manufacturers", items: c.manufacturers },
      { type: "list", heading: "Typical failure modes", items: c.failureModes, tone: "risk" },
      { type: "list", heading: "Sourcing tips", items: c.sourcingTips, tone: "tip" },
      ...(c.extra ?? []),
    ],
  };
}

export const DOMAIN_LABEL: Record<KnowledgeDomain, string> = {
  PCB: "Bare board (PCB)",
  PCBA: "Assembly (PCBA)",
  BOX_BUILD: "Box-build",
  COMPONENT: "Components",
  PACKAGE: "Packages",
  STANDARD: "Standards",
  PROCESS: "Processes",
};
