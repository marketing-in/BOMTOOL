import type { ProjectStage, Role } from "@prisma/client";

export const USERS: { email: string; name: string; role: Role }[] = [
  { email: "admin@ems.local", name: "Admin", role: "ADMIN" },
  { email: "purchasing@ems.local", name: "Priya (Purchasing)", role: "PURCHASING" },
  { email: "engineering@ems.local", name: "Arjun (NPI Engineering)", role: "ENGINEERING" },
  { email: "planning@ems.local", name: "Meera (Planning)", role: "PLANNING" },
  { email: "stores@ems.local", name: "Ravi (Stores)", role: "STORES" },
  { email: "quality@ems.local", name: "Kavya (Quality)", role: "QUALITY" },
  { email: "viewer@ems.local", name: "Guest viewer", role: "VIEWER" },
];

export const CUSTOMERS = [
  { code: "NIMBUS", name: "Nimbus IoT Pvt Ltd", country: "IN" },
  { code: "KINETIC", name: "Kinetic Drives Ltd", country: "IN" },
  { code: "LUMEN", name: "Lumen Lighting Systems", country: "DE" },
];

/**
 * A raw BoM line exactly as a customer would send it. Some lines are deliberately messy
 * (aliases, missing MPN, qty/RefDes mismatch, DNP, obsolete part) to exercise Phase 1 scrubbing.
 */
export type RawBomLine = {
  mpn?: string;
  manufacturer?: string;
  description: string;
  package?: string;
  refDes: string;
  qty: number;
  dnp?: boolean;
};

export type SeedBom = {
  customer: string;
  project: { code: string; name: string; stage: ProjectStage; boardSpec: Record<string, unknown> };
  name: string;
  assemblyPartNumber: string;
  revision: string;
  buildQty: number;
  lines: RawBomLine[];
};

export const BOMS: SeedBom[] = [
  {
    customer: "NIMBUS",
    project: {
      code: "GW-200",
      name: "GW-200 Industrial IoT Gateway",
      stage: "PRODUCTION",
      boardSpec: { layers: 4, thicknessMm: 1.6, finish: "ENIG", mask: "green", silk: "white", sizeMm: [100, 80], material: "FR-4 Tg150", enclosure: "1455N1601" },
    },
    name: "GW-200 Main Board",
    assemblyPartNumber: "NIM-GW200-PCBA",
    revision: "B",
    buildQty: 500,
    lines: [
      { mpn: "ESP32-S3-WROOM-1-N8R8", manufacturer: "Espressif", description: "Wi-Fi/BLE module 8MB/8MB", package: "Module", refDes: "U1", qty: 1 },
      { mpn: "STM32G431CBU6", manufacturer: "ST", description: "MCU Cortex-M4 170MHz", package: "UFQFPN-48", refDes: "U2", qty: 1 },
      { mpn: "LAN8720A-CP-TR", manufacturer: "Microchip", description: "Ethernet PHY RMII", package: "QFN-24", refDes: "U3", qty: 1 },
      { mpn: "MAX3485ESA+T", manufacturer: "Maxim", description: "RS-485 transceiver 3.3V", package: "SOIC-8", refDes: "U4", qty: 1 },
      { mpn: "SN65HVD230DR", manufacturer: "TI", description: "CAN transceiver 3.3V", package: "SOIC-8", refDes: "U5", qty: 1 },
      { mpn: "TPS54331DR", manufacturer: "Texas Instruments Inc.", description: "Buck 3A 28V", package: "SOIC-8", refDes: "U6", qty: 1 },
      { mpn: "AP2112K-3.3TRG1", manufacturer: "Diodes Inc", description: "LDO 3.3V 600mA", package: "SOT-23-5", refDes: "U7", qty: 1 },
      { mpn: "W25Q128JVSIQ", manufacturer: "Winbond", description: "128Mbit SPI NOR flash", package: "SOIC-8", refDes: "U8", qty: 1 },
      { mpn: "BME280", manufacturer: "Bosch", description: "Env sensor T/H/P", package: "LGA-8", refDes: "U9", qty: 1 },
      { mpn: "MPU-6050", manufacturer: "InvenSense", description: "6-axis IMU", package: "QFN-24", refDes: "U10", qty: 1 },
      { mpn: "GRM188R71H104KA93D", manufacturer: "Murata", description: "CAP CER 100nF 50V X7R 0603", package: "0603", refDes: "C1-C18", qty: 18 },
      { mpn: "CL21A106KAYNNNE", manufacturer: "Samsung", description: "CAP CER 10uF 25V X5R 0805", package: "0805", refDes: "C19, C20, C21, C22, C23, C24", qty: 6 },
      { description: "10uF 25V X7R 0805", package: "0805", refDes: "C25, C26", qty: 2 },
      { mpn: "EEE-FK1V101P", manufacturer: "Panasonic", description: "CAP ALU 100uF 35V SMD", package: "6.3x7.7", refDes: "C27", qty: 1 },
      { mpn: "RC0603FR-0710KL", manufacturer: "Yageo", description: "RES 10k 1% 0603", package: "0603", refDes: "R1-R12", qty: 12 },
      { mpn: "RC0603FR-074K7L", manufacturer: "Yageo", description: "RES 4k7 1% 0603", package: "0603", refDes: "R13, R14, R15, R16", qty: 4 },
      { mpn: "RC0603FR-071KL", manufacturer: "Yageo", description: "RES 1k 1% 0603", package: "0603", refDes: "R17-R20", qty: 5 },
      { mpn: "RC0603FR-07100RL", manufacturer: "Yageo", description: "RES 100R 1% 0603", package: "0603", refDes: "R21, R22", qty: 2, dnp: true },
      { mpn: "744043100", manufacturer: "Wurth", description: "IND 10uH 1A shielded", refDes: "L1", qty: 1 },
      { mpn: "BLM18PG221SN1D", manufacturer: "Murata", description: "Ferrite 220R@100MHz 0603", package: "0603", refDes: "FB1, FB2", qty: 2 },
      { mpn: "ABM8-16.000MHZ-B2-T", manufacturer: "Abracon", description: "XTAL 16MHz 18pF", package: "3225", refDes: "Y1", qty: 1 },
      { mpn: "SMBJ24CA", manufacturer: "Littelfuse", description: "TVS 24V bidir 600W", package: "SMB", refDes: "D1", qty: 1 },
      { mpn: "PESD5V0S1BL,315", manufacturer: "Nexperia", description: "ESD 5V", package: "SOD-882", refDes: "D2-D5", qty: 4 },
      { mpn: "LTST-C191KGKT", manufacturer: "Lite-On", description: "LED green 0603", package: "0603", refDes: "LED1, LED2", qty: 2 },
      { mpn: "USB4105-GF-A", manufacturer: "GCT", description: "USB-C receptacle", refDes: "J1", qty: 1 },
      { mpn: "7499010211A", manufacturer: "Würth Elektronik", description: "RJ45 with magnetics", refDes: "J2", qty: 1 },
      { mpn: "1935161", manufacturer: "Phoenix", description: "Terminal block 2p 5.08", refDes: "J3, J4, J5", qty: 3 },
      { mpn: "FTSH-105-01-F-DV-K", manufacturer: "Samtec", description: "SWD header 2x5 1.27", refDes: "J6", qty: 1 },
    ],
  },
  {
    customer: "KINETIC",
    project: {
      code: "MC-48V",
      name: "MC-48V BLDC Motor Controller",
      stage: "NPI",
      boardSpec: { layers: 6, thicknessMm: 1.6, finish: "ENIG", mask: "black", silk: "white", sizeMm: [100, 52], material: "FR-4 Tg170", copperOz: 2, enclosure: "1590B" },
    },
    name: "MC-48V Power Stage",
    assemblyPartNumber: "KD-MC48-PWR",
    revision: "A",
    buildQty: 120,
    lines: [
      { mpn: "STM32G431CBU6", manufacturer: "STMicro", description: "MCU motor control", package: "QFN-48", refDes: "U1", qty: 1 },
      { mpn: "IR2110SPBF", manufacturer: "International Rectifier", description: "Half-bridge gate driver", package: "SOIC-16W", refDes: "U2, U3, U4", qty: 3 },
      { mpn: "LM5164DDAR", manufacturer: "TI", description: "Buck 100V 1A", package: "SO-8 PowerPAD", refDes: "U5", qty: 1 },
      { mpn: "TLV70033DDCR", manufacturer: "TI", description: "LDO 3.3V 200mA", package: "SOT-23-5", refDes: "U6", qty: 1 },
      { mpn: "INA219AIDCNR", manufacturer: "TI", description: "Current monitor I2C", package: "SOT-23-8", refDes: "U7", qty: 1 },
      { mpn: "TJA1051T/3,118", manufacturer: "NXP", description: "CAN FD transceiver", package: "SOIC-8", refDes: "U8", qty: 1 },
      { mpn: "IPB045N10N3G", manufacturer: "Infineon", description: "MOSFET N 100V 100A D2PAK", package: "D2PAK", refDes: "Q1-Q6", qty: 6 },
      { mpn: "MMBT3904LT1G", manufacturer: "ON Semi", description: "NPN 40V SOT-23", package: "SOT-23", refDes: "Q7, Q8", qty: 2 },
      { mpn: "WSL2512R0100FEA", manufacturer: "Vishay Dale", description: "Shunt 10mR 1W 2512", package: "2512", refDes: "R1, R2, R3", qty: 3 },
      { mpn: "CRCW060310K0FKEA", manufacturer: "Vishay", description: "RES 10k 1% 0603 AEC-Q200", package: "0603", refDes: "R4-R15", qty: 12 },
      { mpn: "ERJ-3EKF1001V", manufacturer: "Panasonic", description: "RES 1k 1% 0603", package: "0603", refDes: "R16-R21", qty: 6 },
      { mpn: "GRM31CR71H475KA12L", manufacturer: "Murata", description: "CAP 4.7uF 50V X7R 1206", package: "1206", refDes: "C1-C8", qty: 8 },
      { mpn: "C0805C104K5RACTU", manufacturer: "Kemet", description: "CAP 100nF 50V X7R 0805", package: "0805", refDes: "C9-C24", qty: 16 },
      { mpn: "EEU-FR1E471", manufacturer: "Panasonic", description: "CAP ALU 470uF 25V radial", refDes: "C25, C26", qty: 2 },
      { mpn: "MBRS340T3G", manufacturer: "onsemi", description: "Schottky 40V 3A SMC", package: "SMC", refDes: "D1, D2, D3", qty: 3 },
      { mpn: "SRR1260-100M", manufacturer: "Bourns", description: "IND 10uH 6.6A", refDes: "L1", qty: 1 },
      { mpn: "MP2307DN-LF-Z", manufacturer: "MPS", description: "Buck 3A aux (legacy)", package: "SOIC-8-EP", refDes: "U9", qty: 1 },
      { mpn: "430450400", manufacturer: "Molex", description: "Micro-Fit 4p RA", refDes: "J1", qty: 1 },
      { mpn: "T4171010004-001", manufacturer: "TE", description: "M12 4p female panel", refDes: "J2", qty: 1 },
      { mpn: "1590B", manufacturer: "Hammond", description: "Enclosure die-cast", refDes: "ENC1", qty: 1 },
      { mpn: "970100244", manufacturer: "Würth", description: "Standoff M3 10mm", refDes: "MH1-MH4", qty: 4 },
    ],
  },
  {
    customer: "LUMEN",
    project: {
      code: "LD-60",
      name: "LD-60 Constant-Current LED Driver",
      stage: "PROTOTYPE",
      boardSpec: { layers: 2, thicknessMm: 1.6, finish: "LF-HASL", mask: "white", silk: "black", sizeMm: [70, 45], material: "FR-4 Tg130" },
    },
    name: "LD-60 Driver Board",
    assemblyPartNumber: "LUM-LD60",
    revision: "A",
    buildQty: 50,
    lines: [
      { mpn: "ATMEGA328P-AU", manufacturer: "Atmel", description: "MCU AVR 32K", package: "TQFP-32", refDes: "U1", qty: 1 },
      { mpn: "LM2596S-5.0/NOPB", manufacturer: "National Semiconductor", description: "Buck 5V 3A", package: "TO-263-5", refDes: "U2", qty: 1 },
      { mpn: "L7805CV", manufacturer: "ST", description: "Linear reg 5V TO-220", package: "TO-220", refDes: "U3", qty: 1, dnp: true },
      { mpn: "LM358DR", manufacturer: "TI", description: "Dual op-amp", package: "SOIC-8", refDes: "U4", qty: 1 },
      { mpn: "PC817X2NIP0F", manufacturer: "Sharp", description: "Optocoupler DIP-4", refDes: "U5", qty: 1 },
      { mpn: "AO3400A", manufacturer: "AOS", description: "MOSFET N 30V SOT-23", package: "SOT-23", refDes: "Q1, Q2", qty: 2 },
      { mpn: "1N4007-T", manufacturer: "Diodes", description: "Rectifier 1A 1000V", package: "DO-41", refDes: "D1-D4", qty: 4 },
      { mpn: "BZX84C5V1LT1G", manufacturer: "ON", description: "Zener 5.1V", package: "SOT-23", refDes: "D5", qty: 1 },
      { mpn: "RC0805FR-0710KL", manufacturer: "Yageo", description: "RES 10k 0805", package: "0805", refDes: "R1-R8", qty: 8 },
      { description: "RES 0.1R 1% 1W 2512", package: "2512", refDes: "R9", qty: 1 },
      { mpn: "CC0805KKX7R8BB105", manufacturer: "Yageo", description: "CAP 1uF 25V 0805", package: "0805", refDes: "C1-C6", qty: 6 },
      { mpn: "35YXF100MEFC6.3X11", manufacturer: "Rubycon", description: "CAP ALU 100uF 35V", refDes: "C7, C8", qty: 2 },
      { mpn: "V275LA20AP", manufacturer: "Littelfuse", description: "MOV 275VAC", refDes: "RV1", qty: 1 },
      { mpn: "0251001.MXL", manufacturer: "Littelfuse", description: "Fuse 1A axial", refDes: "F1", qty: 1 },
      { mpn: "B2B-XH-A(LF)(SN)", manufacturer: "JST", description: "XH 2p header", refDes: "J1, J2", qty: 2 },
      { mpn: "WS2812B-2020", manufacturer: "Worldsemi", description: "RGB LED status", refDes: "LED1", qty: 1 },
    ],
  },
];

/** Customer-style sheet (Altium-like headers) for a seed BoM — used by the seed and the sample-file export. */
export function bomToRows(b: SeedBom): string[][] {
  const header = ["Item", "Designator", "Quantity", "Manufacturer Part Number", "Manufacturer", "Description", "Footprint", "Populate"];
  const rows = b.lines.map((l, i) => [String(i + 1), l.refDes, String(l.qty), l.mpn ?? "", l.manufacturer ?? "", l.description, l.package ?? "", l.dnp ? "DNP" : ""]);
  return [header, ...rows];
}
