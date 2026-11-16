import type { SupplierKind } from "@prisma/client";

/**
 * Sample vendor list for Phase 10: channel partners and sourcing agents (tier 2 stock), PCB fabricators and
 * box makers. Names ending in "— sample" are fictional placeholders: replace them with the plant's approved
 * vendor list (Sourcing → Suppliers). Hammond is real — it makes the enclosures already used on our BoMs —
 * but its capabilities here are the catalogue range only, not a quote.
 */

export type BoardCapabilities = {
  maxLayers: number;
  /** Surface finishes offered. */
  finishes: string[];
  thicknessMm: [number, number];
  minTraceMm: number;
  ipcClass: 2 | 3;
  leadDays: { proto: number; production: number };
  certifications: string[];
  /** Special processes offered (src/knowledge/pcb-technologies.ts `needs.technology`). */
  technologies?: string[];
  /** An online instant-quote service (the bare-board marketplace) rather than a fab we work with directly. */
  online?: boolean;
  /** Price level for the bare-board estimate (src/lib/costing/pcb.ts): 1 = an Indian production fab. SAMPLE values. */
  pricing?: { factor: number; minLotFactor?: number; toolingFactor?: number };
};

export type BoxCapabilities = {
  styles: ("diecast" | "extruded" | "moulded" | "sheet-metal")[];
  /** Highest IP rating they make. */
  ipMax: string;
  /** Cut-outs, tapping, powder coat, printing. */
  services: string[];
  leadDays: number;
  /** Styles they make to fit a board (src/lib/costing/box.ts); catalogue makers leave it out. */
  custom?: ("diecast" | "extruded" | "moulded" | "sheet-metal")[];
  /** Price level for made-to-fit estimates (1 = the BOX_COST base). SAMPLE values. */
  pricing?: { factor: number };
};

export type SeedVendor = {
  code: string;
  name: string;
  kind: SupplierKind;
  country: string;
  currency: string;
  freightPct: number;
  supplies: string[];
  capabilities?: BoardCapabilities | BoxCapabilities | { leadDays: number; coverage: number; priceFactor: number; location: string };
};

/** Tier 2: partners who hold stock for us or source on request. coverage = share of BoM parts they list. */
export const CHANNEL_PARTNERS: SeedVendor[] = [
  { code: "CP-KOVAI", name: "Kovai Components (channel partner) — sample", kind: "CHANNEL_PARTNER", country: "IN", currency: "INR", freightPct: 0.4, supplies: ["components"], capabilities: { leadDays: 2, coverage: 0.45, priceFactor: 0.92, location: "Coimbatore" } },
  { code: "CP-LAMINGTON", name: "Lamington Road stockist (sourcing agent) — sample", kind: "CHANNEL_PARTNER", country: "IN", currency: "INR", freightPct: 0.6, supplies: ["components"], capabilities: { leadDays: 4, coverage: 0.35, priceFactor: 0.88, location: "Mumbai" } },
  { code: "CP-SZ-AGENT", name: "Shenzhen sourcing agent — sample", kind: "CHANNEL_PARTNER", country: "CN", currency: "USD", freightPct: 3, supplies: ["components"], capabilities: { leadDays: 12, coverage: 0.6, priceFactor: 0.78, location: "Shenzhen" } },
];

export const PCB_FABS: SeedVendor[] = [
  {
    code: "FAB-CHENNAI", name: "Chennai Circuits (PCB fab) — sample", kind: "MANUFACTURER", country: "IN", currency: "INR", freightPct: 0.5, supplies: ["pcb-fab"],
    capabilities: { maxLayers: 8, finishes: ["HASL-LF", "ENIG", "OSP"], thicknessMm: [0.6, 2.4], minTraceMm: 0.1, ipcClass: 2, leadDays: { proto: 5, production: 12 }, certifications: ["ISO 9001", "UL 796"], technologies: ["high-tg"], pricing: { factor: 1 } } satisfies BoardCapabilities,
  },
  {
    code: "FAB-PUNE-HDI", name: "Pune HDI Boards — sample", kind: "MANUFACTURER", country: "IN", currency: "INR", freightPct: 0.6, supplies: ["pcb-fab"],
    capabilities: { maxLayers: 16, finishes: ["ENIG", "ENEPIG", "ImAg", "OSP"], thicknessMm: [0.4, 3.2], minTraceMm: 0.075, ipcClass: 3, leadDays: { proto: 7, production: 15 }, certifications: ["ISO 9001", "IATF 16949", "UL 796"], technologies: ["hdi", "high-tg", "rf-ptfe", "rigid-flex"], pricing: { factor: 1.18, toolingFactor: 1.3 } } satisfies BoardCapabilities,
  },
  {
    code: "FAB-SZ-PROTO", name: "Shenzhen quick-turn fab — sample", kind: "MANUFACTURER", country: "CN", currency: "USD", freightPct: 4, supplies: ["pcb-fab", "pcb-assembly"],
    capabilities: { maxLayers: 12, finishes: ["HASL-LF", "ENIG", "OSP", "ImSn"], thicknessMm: [0.4, 2.4], minTraceMm: 0.09, ipcClass: 2, leadDays: { proto: 4, production: 14 }, certifications: ["ISO 9001", "UL 796"], technologies: ["flex", "mcpcb", "high-tg"], online: true, pricing: { factor: 0.55, minLotFactor: 0.6, toolingFactor: 0.5 } } satisfies BoardCapabilities,
  },
  {
    code: "FAB-BLR-HEAVY", name: "Bengaluru heavy-copper fab — sample", kind: "MANUFACTURER", country: "IN", currency: "INR", freightPct: 0.5, supplies: ["pcb-fab"],
    capabilities: { maxLayers: 6, finishes: ["HASL-LF", "ENIG"], thicknessMm: [1.0, 3.2], minTraceMm: 0.15, ipcClass: 3, leadDays: { proto: 8, production: 18 }, certifications: ["ISO 9001", "AS9100"], technologies: ["heavy-copper", "mcpcb", "high-tg"], pricing: { factor: 1.12 } } satisfies BoardCapabilities,
  },
  {
    code: "FAB-ONLINE-POOL", name: "Online PCB pool service (instant quote) — sample", kind: "MANUFACTURER", country: "CN", currency: "USD", freightPct: 5, supplies: ["pcb-fab"],
    capabilities: { maxLayers: 6, finishes: ["HASL-LF", "ENIG", "OSP"], thicknessMm: [0.6, 2.0], minTraceMm: 0.1, ipcClass: 2, leadDays: { proto: 6, production: 16 }, certifications: ["ISO 9001", "UL 796"], online: true, pricing: { factor: 0.45, minLotFactor: 0.35, toolingFactor: 0 } } satisfies BoardCapabilities,
  },
];

export const BOX_MAKERS: SeedVendor[] = [
  {
    code: "BOX-HAMMOND", name: "Hammond Manufacturing", kind: "MANUFACTURER", country: "CA", currency: "USD", freightPct: 4, supplies: ["enclosure"],
    capabilities: { styles: ["diecast", "extruded", "moulded"], ipMax: "IP67", services: ["Catalogue enclosures"], leadDays: 21 } satisfies BoxCapabilities,
  },
  {
    code: "BOX-PEENYA-CNC", name: "Peenya CNC & powder coat — sample", kind: "MANUFACTURER", country: "IN", currency: "INR", freightPct: 0.8, supplies: ["enclosure"],
    capabilities: { styles: ["diecast", "extruded", "sheet-metal"], ipMax: "IP65", services: ["Connector cut-outs", "Tapping", "Powder coat", "Pad printing"], leadDays: 7, custom: ["sheet-metal", "extruded"], pricing: { factor: 1 } } satisfies BoxCapabilities,
  },
  {
    code: "BOX-CHENNAI-MOULD", name: "Chennai plastic moulding — sample", kind: "MANUFACTURER", country: "IN", currency: "INR", freightPct: 0.8, supplies: ["enclosure"],
    capabilities: { styles: ["moulded"], ipMax: "IP66", services: ["Custom moulds", "Labels", "Ultrasonic welding"], leadDays: 30, custom: ["moulded"], pricing: { factor: 1 } } satisfies BoxCapabilities,
  },
];

export const ALL_VENDORS = [...CHANNEL_PARTNERS, ...PCB_FABS, ...BOX_MAKERS];
