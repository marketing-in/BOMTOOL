import { PCB_ARTICLES } from "./pcb";
import { PCBA_ARTICLES } from "./pcba";
import { DESIGN_FOR_ASSEMBLY_ARTICLES } from "./design-for-assembly";
import { BOX_BUILD_ARTICLES } from "./box-build";
import { SEMICONDUCTOR_ARTICLES } from "./semiconductors";
import { PASSIVE_EM_ARTICLES } from "./passives";
import { PACKAGE_ARTICLES, RISK_ARTICLES } from "./packages-and-risk";
import { JOB_PACK_ARTICLES } from "./job-pack";
import type { Article } from "./types";

export * from "./types";
export { PROCESSES } from "./processes";

/** Every knowledge article, versioned seed content. */
export const ARTICLES: Article[] = [
  ...PCB_ARTICLES,
  ...PCBA_ARTICLES,
  ...DESIGN_FOR_ASSEMBLY_ARTICLES,
  ...JOB_PACK_ARTICLES,
  ...BOX_BUILD_ARTICLES,
  ...SEMICONDUCTOR_ARTICLES,
  ...PASSIVE_EM_ARTICLES,
  ...PACKAGE_ARTICLES,
  ...RISK_ARTICLES,
];

export function articleForCategory(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.categorySlugs?.includes(slug));
}

/** Package family (as stored on Package.family) → package article. */
export const PACKAGE_FAMILY_ARTICLE: Record<string, string> = {
  CHIP: "package-chip",
  MOLDED: "tantalum-capacitors",
  SOD: "package-sot-sod",
  SMx: "diodes",
  SOT: "package-sot-sod",
  SOIC: "package-soic-family",
  SSOP: "package-soic-family",
  TSSOP: "package-soic-family",
  TSOP: "package-soic-family",
  SON: "package-qfn-dfn",
  QFN: "package-qfn-dfn",
  LGA: "package-bga-csp",
  QFP: "package-qfp",
  BGA: "package-bga-csp",
  CSP: "package-bga-csp",
  TO: "package-to-power",
  AXIAL: "package-tht",
  DIP: "package-tht",
  RADIAL: "package-tht",
  VCHIP: "aluminium-capacitors",
  XTAL: "crystals",
  MODULE: "rf-wireless",
  LED: "leds",
};
