import type { MountType } from "@prisma/client";

export type SeedPackage = {
  name: string;
  family: string;
  mount?: MountType;
  pins?: number;
  pitch?: number;
  /** [length, width, height] mm */
  size?: [number, number, number];
  attrition?: number;
  ipc?: string;
};

// Attrition defaults reflect our line experience: tiny chips get lost, big ICs almost never.
export const PACKAGES: SeedPackage[] = [
  // Chip passives (imperial codes)
  { name: "0201", family: "CHIP", pins: 2, size: [0.6, 0.3, 0.3], attrition: 5, ipc: "RESC0603X30" },
  { name: "0402", family: "CHIP", pins: 2, size: [1.0, 0.5, 0.35], attrition: 3, ipc: "RESC1005X40" },
  { name: "0603", family: "CHIP", pins: 2, size: [1.6, 0.8, 0.45], attrition: 2, ipc: "RESC1608X55" },
  { name: "0805", family: "CHIP", pins: 2, size: [2.0, 1.25, 0.5], attrition: 1.5, ipc: "RESC2012X60" },
  { name: "1206", family: "CHIP", pins: 2, size: [3.2, 1.6, 0.55], attrition: 1, ipc: "RESC3216X65" },
  { name: "1210", family: "CHIP", pins: 2, size: [3.2, 2.5, 0.55], attrition: 1 },
  { name: "2512", family: "CHIP", pins: 2, size: [6.3, 3.2, 0.6], attrition: 1 },
  { name: "Case A (3216)", family: "MOLDED", pins: 2, size: [3.2, 1.6, 1.6], attrition: 1 },
  { name: "Case B (3528)", family: "MOLDED", pins: 2, size: [3.5, 2.8, 1.9], attrition: 1 },
  // Diode packages
  { name: "SOD-123", family: "SOD", pins: 2, size: [2.7, 1.6, 1.1], attrition: 1.5 },
  { name: "SOD-882", family: "SOD", pins: 2, size: [1.0, 0.6, 0.48], attrition: 3 },
  { name: "SMA (DO-214AC)", family: "SMx", pins: 2, size: [4.3, 2.6, 2.1], attrition: 1 },
  { name: "SMB (DO-214AA)", family: "SMx", pins: 2, size: [4.3, 3.6, 2.2], attrition: 1 },
  { name: "SMC (DO-214AB)", family: "SMx", pins: 2, size: [6.9, 5.9, 2.2], attrition: 1 },
  // SOT / small outline
  { name: "SOT-23", family: "SOT", pins: 3, pitch: 0.95, size: [2.9, 1.3, 1.0], attrition: 1.5, ipc: "SOT95P237X112-3N" },
  { name: "SOT-23-5", family: "SOT", pins: 5, pitch: 0.95, size: [2.9, 1.6, 1.1], attrition: 1.5 },
  { name: "SOT-23-6", family: "SOT", pins: 6, pitch: 0.95, size: [2.9, 1.6, 1.1], attrition: 1.5 },
  { name: "SOT-23-8", family: "SOT", pins: 8, pitch: 0.65, size: [2.9, 1.6, 1.1], attrition: 1.5 },
  { name: "SOT-223", family: "SOT", pins: 4, pitch: 2.3, size: [6.5, 3.5, 1.6], attrition: 0.5 },
  { name: "SOT-563", family: "SOT", pins: 6, pitch: 0.5, size: [1.6, 1.2, 0.55], attrition: 2 },
  { name: "SOP-4", family: "SOIC", pins: 4, pitch: 2.54, size: [4.4, 3.6, 2.0], attrition: 0.5 },
  { name: "SOIC-8", family: "SOIC", pins: 8, pitch: 1.27, size: [4.9, 3.9, 1.75], attrition: 0.5, ipc: "SOIC127P600X175-8N" },
  { name: "SOIC-8-EP", family: "SOIC", pins: 9, pitch: 1.27, size: [4.9, 3.9, 1.75], attrition: 0.5 },
  { name: "SOIC-14", family: "SOIC", pins: 14, pitch: 1.27, size: [8.65, 3.9, 1.75], attrition: 0.5 },
  { name: "SOIC-16", family: "SOIC", pins: 16, pitch: 1.27, size: [9.9, 3.9, 1.75], attrition: 0.5 },
  { name: "SOIC-16W", family: "SOIC", pins: 16, pitch: 1.27, size: [10.3, 7.5, 2.65], attrition: 0.5 },
  { name: "SSOP-28", family: "SSOP", pins: 28, pitch: 0.65, size: [10.2, 5.3, 2.0], attrition: 0.5 },
  { name: "TSSOP-20", family: "TSSOP", pins: 20, pitch: 0.65, size: [6.5, 4.4, 1.2], attrition: 0.5 },
  { name: "VSSOP-10", family: "TSSOP", pins: 10, pitch: 0.5, size: [3.0, 3.0, 1.1], attrition: 0.5 },
  { name: "TSOP-48", family: "TSOP", pins: 48, pitch: 0.5, size: [18.4, 12.0, 1.2], attrition: 0.3 },
  { name: "TSOP-54", family: "TSOP", pins: 54, pitch: 0.8, size: [22.2, 10.2, 1.2], attrition: 0.3 },
  // Leadless
  { name: "WSON-6", family: "SON", pins: 6, pitch: 0.65, size: [2.0, 2.0, 0.8], attrition: 1 },
  { name: "WSON-8", family: "SON", pins: 8, pitch: 0.5, size: [2.0, 2.0, 0.8], attrition: 1 },
  { name: "QFN-20", family: "QFN", pins: 20, pitch: 0.5, size: [4.0, 4.0, 0.9], attrition: 0.5 },
  { name: "QFN-24", family: "QFN", pins: 24, pitch: 0.5, size: [4.0, 4.0, 0.9], attrition: 0.5 },
  { name: "QFN-28", family: "QFN", pins: 28, pitch: 0.5, size: [6.0, 6.0, 0.9], attrition: 0.5 },
  { name: "QFN-36", family: "QFN", pins: 36, pitch: 0.5, size: [6.0, 6.0, 0.9], attrition: 0.5 },
  { name: "QFN-48", family: "QFN", pins: 48, pitch: 0.5, size: [7.0, 7.0, 0.9], attrition: 0.5 },
  { name: "QFN-56", family: "QFN", pins: 56, pitch: 0.4, size: [7.0, 7.0, 0.9], attrition: 0.5 },
  { name: "aQFN-73", family: "QFN", pins: 73, pitch: 0.5, size: [7.0, 7.0, 0.85], attrition: 0.5 },
  { name: "LFCSP-32", family: "QFN", pins: 32, pitch: 0.5, size: [5.0, 5.0, 0.75], attrition: 0.5 },
  { name: "LGA-8", family: "LGA", pins: 8, pitch: 0.65, size: [2.5, 2.5, 0.93], attrition: 1 },
  { name: "LGA-14", family: "LGA", pins: 14, pitch: 0.5, size: [2.5, 3.0, 0.91], attrition: 1 },
  // Quad flat
  { name: "TQFP-32", family: "QFP", pins: 32, pitch: 0.8, size: [9.0, 9.0, 1.2], attrition: 0.3 },
  { name: "TQFP-44", family: "QFP", pins: 44, pitch: 0.8, size: [12.0, 12.0, 1.2], attrition: 0.3 },
  { name: "LQFP-48", family: "QFP", pins: 48, pitch: 0.5, size: [9.0, 9.0, 1.6], attrition: 0.3 },
  { name: "LQFP-64", family: "QFP", pins: 64, pitch: 0.5, size: [12.0, 12.0, 1.6], attrition: 0.3 },
  { name: "LQFP-100", family: "QFP", pins: 100, pitch: 0.5, size: [16.0, 16.0, 1.6], attrition: 0.3 },
  { name: "TQFP-100", family: "QFP", pins: 100, pitch: 0.5, size: [16.0, 16.0, 1.2], attrition: 0.3 },
  { name: "LQFP-144", family: "QFP", pins: 144, pitch: 0.5, size: [22.0, 22.0, 1.6], attrition: 0.3 },
  { name: "EQFP-144", family: "QFP", pins: 144, pitch: 0.5, size: [22.0, 22.0, 1.6], attrition: 0.3 },
  // Area array
  { name: "FBGA-96", family: "BGA", pins: 96, pitch: 0.8, size: [14.0, 8.0, 1.2], attrition: 0.2 },
  { name: "FBGA-153", family: "BGA", pins: 153, pitch: 0.5, size: [11.5, 13.0, 1.0], attrition: 0.2 },
  { name: "FTBGA-256", family: "BGA", pins: 256, pitch: 1.0, size: [17.0, 17.0, 1.55], attrition: 0.2 },
  { name: "MAPBGA-289", family: "BGA", pins: 289, pitch: 0.8, size: [14.0, 14.0, 1.4], attrition: 0.2 },
  { name: "NFBGA-324", family: "BGA", pins: 324, pitch: 0.8, size: [15.0, 15.0, 1.4], attrition: 0.2 },
  { name: "TFBGA-361", family: "BGA", pins: 361, pitch: 0.5, size: [12.0, 12.0, 1.2], attrition: 0.2 },
  { name: "Die (BGA)", family: "CSP", pins: 6, pitch: 0.4, size: [2.5, 1.5, 0.7], attrition: 1 },
  // Power
  { name: "TO-220", family: "TO", mount: "THT", pins: 3, pitch: 2.54, size: [10.0, 4.5, 15.0], attrition: 0.2 },
  { name: "TO-247", family: "TO", mount: "THT", pins: 3, pitch: 5.45, size: [15.9, 5.0, 20.9], attrition: 0.2 },
  { name: "TO-263 (D2PAK)", family: "TO", pins: 3, pitch: 2.54, size: [10.2, 9.0, 4.5], attrition: 0.3 },
  { name: "TO-263-5", family: "TO", pins: 5, pitch: 1.7, size: [10.2, 9.0, 4.5], attrition: 0.3 },
  { name: "SO-8 PowerPAD", family: "SOIC", pins: 9, pitch: 1.27, size: [4.9, 3.9, 1.7], attrition: 0.5 },
  // Through-hole & other
  { name: "DO-41", family: "AXIAL", mount: "THT", pins: 2, size: [5.2, 2.7, 2.7], attrition: 0.5 },
  { name: "DIP-4", family: "DIP", mount: "THT", pins: 4, pitch: 2.54, size: [4.6, 6.5, 3.5], attrition: 0.3 },
  { name: "Radial 8x11.5", family: "RADIAL", mount: "THT", pins: 2, pitch: 3.5, size: [8.0, 8.0, 11.5], attrition: 0.3 },
  { name: "Radial 6.3x11", family: "RADIAL", mount: "THT", pins: 2, pitch: 2.5, size: [6.3, 6.3, 11.0], attrition: 0.3 },
  { name: "SMD Can 6.3x7.7", family: "VCHIP", pins: 2, size: [6.6, 6.6, 7.7], attrition: 0.5 },
  { name: "SMD 3225 (4-pad)", family: "XTAL", pins: 4, size: [3.2, 2.5, 0.8], attrition: 1 },
  { name: "SMD 2012 (2-pad)", family: "XTAL", pins: 2, size: [2.0, 1.2, 0.6], attrition: 1 },
  { name: "SMD 2520 (4-pad)", family: "XTAL", pins: 4, size: [2.5, 2.0, 0.75], attrition: 1 },
  { name: "Module", family: "MODULE", pins: 38, size: [25.5, 18.0, 3.1], attrition: 0.2 },
  { name: "PLCC-4 2020", family: "LED", pins: 4, size: [2.0, 2.0, 0.84], attrition: 1.5 },
];
