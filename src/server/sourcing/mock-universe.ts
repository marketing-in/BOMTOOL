import type { Lifecycle } from "@prisma/client";

/**
 * Real parts that are NOT in the seeded catalogue. The mock adapter "finds" these at distributors so
 * the search-distributors → create-part flow can be demonstrated without API keys.
 */
export type UniversePart = {
  mpn: string;
  manufacturer: string;
  description: string;
  category: string; // distributor-style category text
  usd: number;
  lifecycle?: Lifecycle;
  params?: Record<string, string>;
};

export const MOCK_UNIVERSE: UniversePart[] = [
  { mpn: "NE555DR", manufacturer: "Texas Instruments", description: "Single precision timer, 4.5–16 V, SOIC-8", category: "Clock/Timing - Programmable Timers", usd: 0.12 },
  { mpn: "LM2904DR", manufacturer: "Texas Instruments", description: "Dual op-amp, 3–26 V, automotive-grade option, SOIC-8", category: "Instrumentation, Op Amps", usd: 0.08 },
  { mpn: "TPS563200DDCR", manufacturer: "Texas Instruments", description: "4.5–17 V input, 3 A synchronous buck converter, SOT-23-6", category: "Voltage Regulators - DC DC Switching", usd: 0.38 },
  { mpn: "SN74LVC1G04DBVR", manufacturer: "Texas Instruments", description: "Single inverter gate, 1.65–5.5 V, SOT-23-5", category: "Logic - Gates and Inverters", usd: 0.05 },
  { mpn: "TPS2051BDBVR", manufacturer: "Texas Instruments", description: "0.5 A current-limited USB power switch, SOT-23-5", category: "PMIC - Power Distribution Switches", usd: 0.32 },
  { mpn: "ADS1220IPWR", manufacturer: "Texas Instruments", description: "24-bit 2 kSPS 4-channel low-power delta-sigma ADC, TSSOP-16", category: "Data Acquisition - ADCs", usd: 3.4 },
  { mpn: "STM32F030F4P6", manufacturer: "STMicroelectronics", description: "Arm Cortex-M0 MCU, 48 MHz, 16 KB Flash, TSSOP-20", category: "Embedded - Microcontrollers", usd: 0.62 },
  { mpn: "USBLC6-2SC6", manufacturer: "STMicroelectronics", description: "Very low capacitance ESD protection for USB 2.0, SOT-23-6", category: "TVS - Diodes", usd: 0.09 },
  { mpn: "ATTINY85-20SU", manufacturer: "Microchip Technology", description: "8-bit AVR MCU, 20 MHz, 8 KB Flash, SOIC-8", category: "Embedded - Microcontrollers", usd: 1.05 },
  { mpn: "MAX485ESA+T", manufacturer: "Analog Devices", description: "5 V half-duplex RS-485/RS-422 transceiver, 2.5 Mbps, SOIC-8", category: "Interface - Drivers, Receivers, Transceivers", usd: 1.6 },
  { mpn: "CP2102N-A02-GQFN24", manufacturer: "Silicon Labs", description: "USB 2.0 to UART bridge, QFN-24", category: "Interface - Controllers", usd: 1.35 },
  { mpn: "ESP32-C3-MINI-1-N4", manufacturer: "Espressif Systems", description: "Wi-Fi 4 + BLE 5 RISC-V module, 4 MB flash, PCB antenna", category: "RF Transceiver Modules", usd: 1.75 },
  { mpn: "CH32V003F4P6", manufacturer: "WCH", description: "RISC-V MCU, 48 MHz, 16 KB Flash, TSSOP-20", category: "Embedded - Microcontrollers", usd: 0.12 },
  { mpn: "MP1584EN-LF-Z", manufacturer: "Monolithic Power Systems", description: "28 V, 3 A, 1.5 MHz step-down converter, SOIC-8-EP", category: "Voltage Regulators - DC DC Switching", usd: 0.78, lifecycle: "NRND" },
  { mpn: "AO3401A", manufacturer: "Alpha & Omega Semiconductor", description: "30 V P-channel MOSFET, 4 A, SOT-23", category: "Transistors - FETs, MOSFETs - Single", usd: 0.045 },
  { mpn: "BAT54S-7-F", manufacturer: "Diodes Incorporated", description: "30 V 200 mA dual series Schottky diode, SOT-23", category: "Diodes - Rectifiers - Arrays", usd: 0.03 },
  { mpn: "W25Q32JVSSIQ", manufacturer: "Winbond Electronics", description: "32 Mbit serial NOR flash, SPI/QSPI, SOIC-8", category: "Memory", usd: 0.42 },
  { mpn: "WSLP2512R1000FEA", manufacturer: "Vishay", description: "0.1 Ω ±1% 3 W 2512 power metal-strip current-sense resistor", category: "Chip Resistor - Surface Mount", usd: 0.38, params: { resistance: "100 mΩ", tolerance: "1%", power: "3 W" } },
  { mpn: "XL1509-5.0E1", manufacturer: "XLSEMI", description: "40 V 2 A step-down DC-DC converter, 5 V fixed, SOP-8", category: "Voltage Regulators - DC DC Switching", usd: 0.15 },
  { mpn: "LM7805CT/NOPB", manufacturer: "Texas Instruments", description: "1.5 A positive voltage regulator, 5 V, TO-220", category: "Voltage Regulators - Linear", usd: 0.65, lifecycle: "OBSOLETE" },
];
