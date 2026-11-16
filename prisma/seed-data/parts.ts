import type { Lifecycle, MountType, Msl, ReachStatus, RohsStatus } from "@prisma/client";

export type SeedPart = {
  mpn: string;
  mfr: string; // canonical manufacturer name
  cat: string; // category slug
  pkg: string | null;
  desc: string;
  /** Typical authorised-distributor unit price in USD at 1k qty — drives mock offers. */
  usd: number;
  params: Record<string, string>;
  lc?: Lifecycle;
  msl?: Msl;
  intro?: number;
  /** Counterfeit risk 1–5. */
  cf?: number;
  /** Manufacturer lead time, weeks. */
  lt?: number;
  rohs?: RohsStatus;
  reach?: ReachStatus;
  mount?: MountType;
  eccn?: string;
  hsn?: string;
};

/** India HSN (8-digit ITC-HS) defaults per category. */
export const HSN_BY_CATEGORY: Record<string, string> = {
  mcu: "85423100", "mpu-soc": "85423100", "fpga-cpld": "85423900", memory: "85423200",
  "power-ic": "85423900", "op-amp": "85423300", "data-converter": "85423900", "interface-ic": "85423900",
  "rf-wireless": "85423900", sensor: "85423900", mosfet: "85412900", igbt: "85412900", bjt: "85412100",
  diode: "85411000", led: "85414100", optocoupler: "85414900", "wide-bandgap": "85412900",
  mlcc: "85322400", "tantalum-cap": "85322100", "aluminium-cap": "85322200", "polymer-cap": "85322900",
  "film-cap": "85322500", supercap: "85322900", "resistor-chip": "85332119", "resistor-current-sense": "85332119",
  "resistor-network": "85332119", potentiometer: "85334090", inductor: "85045090", "ferrite-bead": "85045090",
  crystal: "85416000", oscillator: "85416000", fuse: "85361090", "ptc-ntc": "85334090", varistor: "85334090",
  "connector-header": "85366990", "connector-wtb": "85366990", "connector-btb": "85366990", "connector-usb": "85366990",
  "connector-rj45": "85366990", "connector-m12": "85366990", "connector-dsub": "85366990", "terminal-block": "85369090",
  "connector-fpc": "85366990", relay: "85364100", switch: "85365090", buzzer: "85318000", "battery-holder": "85369090",
  heatsink: "76169990", "hookup-wire": "85444999", "ribbon-cable": "85444999", "shielded-cable": "85444999",
  "harness-component": "85369090", enclosure: "76169990", fastener: "73181600",
  "logic-ic": "85423900",
};

const p = (
  mpn: string,
  mfr: string,
  cat: string,
  pkg: string | null,
  desc: string,
  usd: number,
  params: Record<string, string>,
  extra: Partial<SeedPart> = {},
): SeedPart => ({ mpn, mfr, cat, pkg, desc, usd, params, ...extra });

const ST = "STMicroelectronics";
const TI = "Texas Instruments";
const MC = "Microchip Technology";
const IFX = "Infineon Technologies";
const ON = "onsemi";
const VSH = "Vishay";
const MUR = "Murata Manufacturing";
const SAM = "Samsung Electro-Mechanics";
const YAG = "Yageo";
const PAN = "Panasonic";
const WE = "Würth Elektronik";

export const PARTS: SeedPart[] = [
  // ───────── MCUs ─────────
  p("STM32F103C8T6", ST, "mcu", "LQFP-48", "Arm Cortex-M3 MCU, 72 MHz, 64 KB Flash, 20 KB RAM, USB, CAN", 2.35, { core: "Cortex-M3", clock: "72 MHz", flash: "64 KB", ram: "20 KB", io: "37", supply: "2.0–3.6 V" }, { msl: "MSL_3", intro: 2007, cf: 5, lt: 16, eccn: "5A992.c" }),
  p("STM32F407VGT6", ST, "mcu", "LQFP-100", "Arm Cortex-M4F MCU, 168 MHz, 1 MB Flash, 192 KB RAM, Ethernet MAC, USB OTG", 8.9, { core: "Cortex-M4F", clock: "168 MHz", flash: "1 MB", ram: "192 KB", io: "82", supply: "1.8–3.6 V" }, { msl: "MSL_3", intro: 2011, cf: 4, lt: 20, eccn: "5A992.c" }),
  p("STM32G431CBU6", ST, "mcu", "QFN-48", "Arm Cortex-M4F MCU, 170 MHz, 128 KB Flash, motor-control timers, CORDIC", 3.1, { core: "Cortex-M4F", clock: "170 MHz", flash: "128 KB", ram: "32 KB", io: "42", supply: "1.71–3.6 V" }, { msl: "MSL_3", intro: 2019, cf: 2, lt: 14, eccn: "5A992.c" }),
  p("STM32L476RGT6", ST, "mcu", "LQFP-64", "Ultra-low-power Arm Cortex-M4F MCU, 80 MHz, 1 MB Flash, 128 KB RAM", 6.2, { core: "Cortex-M4F", clock: "80 MHz", flash: "1 MB", ram: "128 KB", io: "51", supply: "1.71–3.6 V" }, { msl: "MSL_3", intro: 2015, cf: 3, lt: 18, eccn: "5A992.c" }),
  p("STM32H743ZIT6", ST, "mcu", "LQFP-144", "Arm Cortex-M7 MCU, 480 MHz, 2 MB Flash, 1 MB RAM, Ethernet, USB HS", 11.8, { core: "Cortex-M7", clock: "480 MHz", flash: "2 MB", ram: "1 MB", io: "114", supply: "1.62–3.6 V" }, { msl: "MSL_3", intro: 2017, cf: 4, lt: 22, eccn: "5A992.c" }),
  p("GD32F103C8T6", "GigaDevice", "mcu", "LQFP-48", "Arm Cortex-M3 MCU, 108 MHz, 64 KB Flash, 20 KB RAM (STM32F103 pin-compatible)", 1.15, { core: "Cortex-M3", clock: "108 MHz", flash: "64 KB", ram: "20 KB", io: "37", supply: "2.6–3.6 V" }, { msl: "MSL_3", intro: 2014, cf: 2, lt: 8 }),
  p("ATMEGA328P-AU", MC, "mcu", "TQFP-32", "8-bit AVR MCU, 20 MHz, 32 KB Flash, 2 KB SRAM, 1 KB EEPROM", 1.62, { core: "AVR 8-bit", clock: "20 MHz", flash: "32 KB", ram: "2 KB", io: "23", supply: "1.8–5.5 V" }, { msl: "MSL_3", intro: 2009, cf: 5, lt: 12 }),
  p("ATSAMD21G18A-AU", MC, "mcu", "LQFP-48", "Arm Cortex-M0+ MCU, 48 MHz, 256 KB Flash, 32 KB SRAM, USB device/host", 2.85, { core: "Cortex-M0+", clock: "48 MHz", flash: "256 KB", ram: "32 KB", io: "38", supply: "1.62–3.63 V" }, { msl: "MSL_3", intro: 2014, cf: 3, lt: 14 }),
  p("PIC16F877A-I/PT", MC, "mcu", "TQFP-44", "8-bit PIC MCU, 20 MHz, 14 KB Flash, 368 B RAM, 10-bit ADC", 4.1, { core: "PIC16 8-bit", clock: "20 MHz", flash: "14 KB", ram: "368 B", io: "33", supply: "4.0–5.5 V" }, { lc: "NRND", msl: "MSL_3", intro: 2003, cf: 3, lt: 10 }),
  p("RP2040", "Raspberry Pi", "mcu", "QFN-56", "Dual Arm Cortex-M0+ MCU, 133 MHz, 264 KB SRAM, external QSPI flash, PIO", 0.8, { core: "Dual Cortex-M0+", clock: "133 MHz", flash: "0 B", ram: "264 KB", io: "30", supply: "1.8–3.3 V" }, { msl: "MSL_3", intro: 2021, cf: 2, lt: 6 }),
  p("MSP430G2553IPW20R", TI, "mcu", "TSSOP-20", "16-bit ultra-low-power MSP430 MCU, 16 MHz, 16 KB Flash, 512 B RAM", 1.35, { core: "MSP430 16-bit", clock: "16 MHz", flash: "16 KB", ram: "512 B", io: "16", supply: "1.8–3.6 V" }, { msl: "MSL_2", intro: 2011, cf: 2, lt: 12 }),
  p("LPC1768FBD100", "NXP Semiconductors", "mcu", "LQFP-100", "Arm Cortex-M3 MCU, 100 MHz, 512 KB Flash, 64 KB RAM, Ethernet, USB, CAN", 7.6, { core: "Cortex-M3", clock: "100 MHz", flash: "512 KB", ram: "64 KB", io: "70", supply: "2.4–3.6 V" }, { msl: "MSL_3", intro: 2009, cf: 3, lt: 26, eccn: "5A992.c" }),
  p("R7FA4M1AB3CFM#AA0", "Renesas Electronics", "mcu", "LQFP-64", "RA4M1 Arm Cortex-M4F MCU, 48 MHz, 256 KB Flash, 32 KB SRAM, USB FS, CAN", 3.4, { core: "Cortex-M4F", clock: "48 MHz", flash: "256 KB", ram: "32 KB", io: "51", supply: "1.6–5.5 V" }, { msl: "MSL_3", intro: 2019, cf: 1, lt: 16 }),

  // ───────── MPUs / SoCs ─────────
  p("MCIMX6Y2CVM08AB", "NXP Semiconductors", "mpu-soc", "MAPBGA-289", "i.MX 6ULL Arm Cortex-A7 MPU, 800 MHz, DDR3/LPDDR2, 2x Ethernet", 7.9, { core: "Cortex-A7", clock: "800 MHz", supply: "1.15–1.4 V core" }, { msl: "MSL_3", intro: 2016, cf: 3, lt: 30, eccn: "5A992.c" }),
  p("AM3358BZCZA100", TI, "mpu-soc", "NFBGA-324", "Sitara AM3358 Arm Cortex-A8 MPU, 1 GHz, PRU-ICSS, 3D graphics", 14.5, { core: "Cortex-A8", clock: "1 GHz", supply: "1.1–1.325 V core" }, { msl: "MSL_3", intro: 2011, cf: 3, lt: 26, eccn: "5A992.c" }),
  p("STM32MP157AAC3", ST, "mpu-soc", "TFBGA-361", "Dual Cortex-A7 650 MHz + Cortex-M4 MPU, 3D GPU, DDR3/DDR3L", 11.2, { core: "Dual Cortex-A7 + M4", clock: "650 MHz" }, { msl: "MSL_3", intro: 2019, cf: 2, lt: 24, eccn: "5A992.c" }),

  // ───────── FPGA / CPLD ─────────
  p("XC7A35T-1FTG256C", "AMD", "fpga-cpld", "FTBGA-256", "Artix-7 FPGA, 33,280 logic cells, 170 user I/O, commercial grade", 38.5, { logic_cells: "33280", io: "170" }, { msl: "MSL_3", intro: 2013, cf: 5, lt: 40, eccn: "3A991.d" }),
  p("10M08SAE144C8G", "Intel", "fpga-cpld", "EQFP-144", "MAX 10 FPGA, 8,000 LEs, single-supply, on-chip flash & ADC", 14.8, { logic_cells: "8000", io: "101" }, { msl: "MSL_3", intro: 2014, cf: 4, lt: 30, eccn: "3A991.d" }),
  p("ICE40UP5K-SG48I", "Lattice Semiconductor", "fpga-cpld", "QFN-48", "iCE40 UltraPlus FPGA, 5,280 LUTs, 1 Mb SPRAM, DSP blocks, low power", 5.6, { logic_cells: "5280", io: "39" }, { msl: "MSL_3", intro: 2017, cf: 2, lt: 16 }),
  p("EPM240T100C5N", "Intel", "fpga-cpld", "TQFP-100", "MAX II CPLD, 240 LEs, 80 user I/O, 3.3/2.5 V", 6.4, { logic_cells: "240", io: "80" }, { lc: "NRND", msl: "MSL_3", intro: 2004, cf: 5, lt: 36 }),

  // ───────── Memory ─────────
  p("W25Q128JVSIQ", "Winbond Electronics", "memory", "SOIC-8", "128 Mbit serial NOR flash, SPI/Dual/Quad, 133 MHz", 0.92, { memory_type: "NOR Flash", density: "128 Mbit", mem_interface: "SPI/QSPI", supply: "2.7–3.6 V" }, { msl: "MSL_3", intro: 2016, cf: 3, lt: 12 }),
  p("IS25LP064A-JBLE", "ISSI", "memory", "SOIC-8", "64 Mbit serial NOR flash, SPI/QPI, 133 MHz", 0.68, { memory_type: "NOR Flash", density: "64 Mbit", mem_interface: "SPI/QSPI", supply: "2.3–3.6 V" }, { msl: "MSL_3", intro: 2015, cf: 2, lt: 12 }),
  p("MT41K256M16TW-107:P", "Micron Technology", "memory", "FBGA-96", "4 Gbit DDR3L SDRAM, 256M x 16, 1866 MT/s, 1.35 V", 4.6, { memory_type: "DDR3L SDRAM", density: "4 Gbit", mem_interface: "DDR3L x16", supply: "1.35 V" }, { msl: "MSL_3", intro: 2012, cf: 4, lt: 26 }),
  p("MT29F4G08ABADAWP-IT:D", "Micron Technology", "memory", "TSOP-48", "4 Gbit SLC NAND flash, x8, 3.3 V, industrial temp", 5.3, { memory_type: "SLC NAND", density: "4 Gbit", mem_interface: "Parallel x8", supply: "2.7–3.6 V" }, { lc: "NRND", msl: "MSL_3", intro: 2010, cf: 4, lt: 30 }),
  p("MTFC8GAKAJCN-4M IT", "Micron Technology", "memory", "FBGA-153", "8 GB eMMC 5.0 managed NAND, industrial temp", 9.8, { memory_type: "eMMC", density: "64 Gbit", mem_interface: "eMMC 5.0", supply: "3.3 V" }, { lc: "EOL", msl: "MSL_3", intro: 2015, cf: 4, lt: 40 }),
  p("AT24C256C-SSHL-T", MC, "memory", "SOIC-8", "256 Kbit I²C serial EEPROM, 1 MHz", 0.38, { memory_type: "EEPROM", density: "256 Kbit", mem_interface: "I2C", supply: "1.7–5.5 V" }, { msl: "MSL_1", intro: 2010, cf: 2, lt: 10 }),
  p("24LC64-I/SN", MC, "memory", "SOIC-8", "64 Kbit I²C serial EEPROM, 400 kHz", 0.29, { memory_type: "EEPROM", density: "64 Kbit", mem_interface: "I2C", supply: "2.5–5.5 V" }, { msl: "MSL_1", intro: 2004, cf: 2, lt: 10 }),

  // ───────── Power ICs ─────────
  p("AMS1117-3.3", "Advanced Monolithic Systems", "power-ic", "SOT-223", "1 A low-dropout linear regulator, fixed 3.3 V output", 0.06, { topology: "LDO", vin_max: "15 V", vout: "3.3 V", iout: "1 A" }, { msl: "MSL_1", intro: 2002, cf: 2, lt: 6 }),
  p("LM1117IMPX-3.3/NOPB", TI, "power-ic", "SOT-223", "800 mA low-dropout linear regulator, fixed 3.3 V, industrial temp", 0.42, { topology: "LDO", vin_max: "15 V", vout: "3.3 V", iout: "800 mA" }, { msl: "MSL_1", intro: 2004, cf: 2, lt: 12 }),
  p("TLV70033DDCR", TI, "power-ic", "SOT-23-5", "200 mA low-IQ LDO, 3.3 V, 31 µA quiescent", 0.16, { topology: "LDO", vin_max: "5.5 V", vout: "3.3 V", iout: "200 mA" }, { msl: "MSL_2", intro: 2010, cf: 1, lt: 12 }),
  p("AP2112K-3.3TRG1", "Diodes Incorporated", "power-ic", "SOT-23-5", "600 mA CMOS LDO, 3.3 V, enable pin", 0.09, { topology: "LDO", vin_max: "6 V", vout: "3.3 V", iout: "600 mA" }, { msl: "MSL_1", intro: 2012, cf: 1, lt: 10 }),
  p("L7805CV", ST, "power-ic", "TO-220", "1.5 A positive linear voltage regulator, 5 V", 0.28, { topology: "Linear", vin_max: "35 V", vout: "5 V", iout: "1.5 A" }, { msl: "MSL_1", intro: 1990, cf: 3, lt: 10, mount: "THT" }),
  p("LM2596S-5.0/NOPB", TI, "power-ic", "TO-263-5", "3 A step-down (buck) switching regulator, 5 V fixed, 150 kHz", 2.65, { topology: "Buck", vin_max: "40 V", vout: "5 V", iout: "3 A" }, { lc: "NRND", msl: "MSL_3", intro: 2000, cf: 4, lt: 14 }),
  p("TPS54331DR", TI, "power-ic", "SOIC-8", "3.5–28 V input, 3 A synchronous-free buck converter, Eco-mode", 0.98, { topology: "Buck", vin_max: "28 V", vout: "0.8–25 V", iout: "3 A" }, { msl: "MSL_2", intro: 2009, cf: 2, lt: 12 }),
  p("TPS62160DSGR", TI, "power-ic", "WSON-8", "3–17 V, 1 A synchronous step-down converter, DCS-Control", 0.95, { topology: "Buck", vin_max: "17 V", vout: "0.9–6 V", iout: "1 A" }, { msl: "MSL_2", intro: 2012, cf: 1, lt: 12 }),
  p("MP2307DN-LF-Z", "Monolithic Power Systems", "power-ic", "SOIC-8-EP", "23 V, 3 A, 340 kHz synchronous buck converter", 0.85, { topology: "Buck", vin_max: "23 V", vout: "0.925–20 V", iout: "3 A" }, { lc: "LAST_TIME_BUY", msl: "MSL_2", intro: 2006, cf: 3, lt: 20 }),
  p("LM5164DDAR", TI, "power-ic", "SO-8 PowerPAD", "6–100 V input, 1 A synchronous buck converter, COT", 1.62, { topology: "Buck", vin_max: "100 V", vout: "1.2–90 V", iout: "1 A" }, { msl: "MSL_2", intro: 2018, cf: 1, lt: 14 }),
  p("TPS61023DRLR", TI, "power-ic", "SOT-563", "0.5–5.5 V input, 3.7 A switch synchronous boost converter", 0.48, { topology: "Boost", vin_max: "5.5 V", vout: "2.2–5.5 V", iout: "1 A" }, { msl: "MSL_1", intro: 2019, cf: 1, lt: 12 }),
  p("IR2110SPBF", IFX, "power-ic", "SOIC-16W", "500 V high- and low-side gate driver, 2 A source/sink", 2.15, { topology: "Gate driver (half-bridge)", vin_max: "20 V", iout: "2 A" }, { msl: "MSL_3", intro: 1998, cf: 4, lt: 16 }),
  p("UCC27517DBVR", TI, "power-ic", "SOT-23-5", "4 A/4 A single-channel low-side gate driver, 13 ns", 0.52, { topology: "Gate driver (low-side)", vin_max: "18 V", iout: "4 A" }, { msl: "MSL_1", intro: 2012, cf: 1, lt: 12 }),

  // ───────── Op-amps ─────────
  p("LM358DR", TI, "op-amp", "SOIC-8", "Dual general-purpose op-amp, 3–32 V, 700 kHz", 0.07, { channels: "2", gbw: "700 kHz", supply: "3–32 V" }, { msl: "MSL_1", intro: 1975, cf: 2, lt: 8 }),
  p("LM324DR", TI, "op-amp", "SOIC-14", "Quad general-purpose op-amp, 3–32 V, 1.2 MHz", 0.09, { channels: "4", gbw: "1.2 MHz", supply: "3–32 V" }, { msl: "MSL_1", intro: 1975, cf: 2, lt: 8 }),
  p("OPA2333AIDR", TI, "op-amp", "SOIC-8", "Dual zero-drift CMOS op-amp, 1.8–5.5 V, 10 µV offset", 1.85, { channels: "2", gbw: "350 kHz", supply: "1.8–5.5 V" }, { msl: "MSL_2", intro: 2006, cf: 2, lt: 12 }),
  p("MCP6002T-I/SN", MC, "op-amp", "SOIC-8", "Dual rail-to-rail I/O op-amp, 1.8–6 V, 1 MHz", 0.24, { channels: "2", gbw: "1 MHz", supply: "1.8–6 V" }, { msl: "MSL_1", intro: 2003, cf: 1, lt: 8 }),
  p("TL072CDR", TI, "op-amp", "SOIC-8", "Dual low-noise JFET-input op-amp, ±18 V, 3 MHz", 0.17, { channels: "2", gbw: "3 MHz", supply: "±2.25–±18 V" }, { msl: "MSL_1", intro: 1978, cf: 2, lt: 8 }),

  // ───────── Data converters ─────────
  p("ADS1115IDGSR", TI, "data-converter", "VSSOP-10", "16-bit 860 SPS 4-channel delta-sigma ADC, PGA, I²C", 2.95, { resolution: "16 bit", channels: "4", sample_rate: "860 SPS", protocol: "I2C" }, { msl: "MSL_2", intro: 2009, cf: 4, lt: 12 }),
  p("MCP3008-I/SL", MC, "data-converter", "SOIC-16", "10-bit 200 kSPS 8-channel SAR ADC, SPI", 1.98, { resolution: "10 bit", channels: "8", sample_rate: "200 kSPS", protocol: "SPI" }, { msl: "MSL_1", intro: 2002, cf: 2, lt: 10 }),
  p("AD7124-8BCPZ", "Analog Devices", "data-converter", "LFCSP-32", "24-bit low-noise, low-power sigma-delta ADC, 8 differential channels", 8.6, { resolution: "24 bit", channels: "8", sample_rate: "19.2 kSPS", protocol: "SPI" }, { msl: "MSL_3", intro: 2016, cf: 2, lt: 16 }),
  p("MCP4725A0T-E/CH", MC, "data-converter", "SOT-23-6", "12-bit single-channel DAC with EEPROM, I²C", 0.98, { resolution: "12 bit", channels: "1", protocol: "I2C" }, { msl: "MSL_1", intro: 2009, cf: 2, lt: 10 }),

  // ───────── Interface ─────────
  p("MAX3485ESA+T", "Analog Devices", "interface-ic", "SOIC-8", "3.3 V half-duplex RS-485/RS-422 transceiver, 10 Mbps", 1.75, { protocol: "RS-485", data_rate: "10 Mbps", supply: "3.0–3.6 V" }, { msl: "MSL_1", intro: 1997, cf: 4, lt: 14 }),
  p("SN65HVD230DR", TI, "interface-ic", "SOIC-8", "3.3 V CAN transceiver, 1 Mbps, standby mode", 0.85, { protocol: "CAN", data_rate: "1 Mbps", supply: "3.0–3.6 V" }, { msl: "MSL_2", intro: 2001, cf: 3, lt: 12 }),
  p("TJA1051T/3,118", "NXP Semiconductors", "interface-ic", "SOIC-8", "High-speed CAN transceiver, 5 V, VIO pin, 5 Mbps CAN FD", 0.62, { protocol: "CAN FD", data_rate: "5 Mbps", supply: "4.5–5.5 V" }, { msl: "MSL_1", intro: 2011, cf: 2, lt: 16 }),
  p("CH340G", "WCH", "interface-ic", "SOIC-16", "USB 2.0 full-speed to UART bridge, 12 MHz crystal", 0.32, { protocol: "USB-UART", data_rate: "2 Mbps", supply: "3.3/5 V" }, { msl: "MSL_3", intro: 2012, cf: 2, lt: 4 }),
  p("FT232RL-REEL", "FTDI", "interface-ic", "SSOP-28", "USB 2.0 full-speed to UART bridge, integrated EEPROM & clock", 3.95, { protocol: "USB-UART", data_rate: "3 Mbps", supply: "3.3–5.25 V" }, { msl: "MSL_3", intro: 2005, cf: 5, lt: 12 }),
  p("LAN8720A-CP-TR", MC, "interface-ic", "QFN-24", "10/100 Ethernet PHY, RMII, HP Auto-MDIX", 0.98, { protocol: "Ethernet 10/100", data_rate: "100 Mbps", supply: "3.3 V" }, { msl: "MSL_3", intro: 2011, cf: 3, lt: 14 }),
  p("MAX232DR", TI, "interface-ic", "SOIC-16", "Dual RS-232 driver/receiver, 5 V, 120 kbps", 0.33, { protocol: "RS-232", data_rate: "120 kbps", supply: "4.5–5.5 V" }, { msl: "MSL_1", intro: 1989, cf: 2, lt: 8 }),
  p("TXS0108EPWR", TI, "interface-ic", "TSSOP-20", "8-bit bidirectional voltage-level translator, auto direction", 0.62, { protocol: "Level shifter", channels: "8", supply: "1.2–5.5 V" }, { msl: "MSL_1", intro: 2008, cf: 2, lt: 10 }),
  p("USB2514B-AEZC", MC, "interface-ic", "QFN-36", "USB 2.0 hi-speed 4-port hub controller", 1.62, { protocol: "USB 2.0 hub", channels: "4", supply: "3.3 V" }, { msl: "MSL_3", intro: 2012, cf: 2, lt: 14 }),

  // ───────── RF / wireless ─────────
  p("ESP32-WROOM-32E-N4", "Espressif Systems", "rf-wireless", "Module", "Wi-Fi + Bluetooth/BLE module, dual-core 240 MHz, 4 MB flash, PCB antenna", 2.6, { radio: "Wi-Fi 4 + BT/BLE 4.2", flash: "4 MB", supply: "3.0–3.6 V" }, { msl: "MSL_3", intro: 2020, cf: 3, lt: 8, eccn: "5A992.c", hsn: "85176290" }),
  p("ESP32-S3-WROOM-1-N8R8", "Espressif Systems", "rf-wireless", "Module", "Wi-Fi + BLE 5 module, dual-core 240 MHz LX7, 8 MB flash, 8 MB PSRAM, AI vector", 3.45, { radio: "Wi-Fi 4 + BLE 5", flash: "8 MB", ram: "8 MB", supply: "3.0–3.6 V" }, { msl: "MSL_3", intro: 2021, cf: 2, lt: 8, eccn: "5A992.c", hsn: "85176290" }),
  p("NRF52840-QIAA-R", "Nordic Semiconductor", "rf-wireless", "aQFN-73", "Bluetooth 5.3 / Thread / Zigbee SoC, Cortex-M4F 64 MHz, 1 MB Flash, USB", 3.9, { radio: "BLE 5.3 / 802.15.4", core: "Cortex-M4F", flash: "1 MB", ram: "256 KB" }, { msl: "MSL_3", intro: 2018, cf: 3, lt: 18, eccn: "5A992.c" }),
  p("SX1276IMLTRT", "Semtech", "rf-wireless", "QFN-28", "137–1020 MHz LoRa long-range transceiver, +20 dBm", 4.4, { radio: "LoRa sub-GHz", supply: "1.8–3.7 V" }, { msl: "MSL_3", intro: 2013, cf: 3, lt: 16, eccn: "5A991.b" }),
  p("CC1101RGPR", TI, "rf-wireless", "QFN-20", "Sub-1 GHz low-power RF transceiver, 300–928 MHz", 1.95, { radio: "Sub-GHz FSK/OOK", supply: "1.8–3.6 V" }, { msl: "MSL_3", intro: 2007, cf: 2, lt: 12 }),

  // ───────── Sensors ─────────
  p("BME280", "Bosch Sensortec", "sensor", "LGA-8", "Combined humidity, pressure and temperature sensor, I²C/SPI", 3.1, { sensor_type: "Humidity/Pressure/Temp", protocol: "I2C/SPI", supply: "1.71–3.6 V" }, { msl: "MSL_1", intro: 2014, cf: 4, lt: 16 }),
  p("MPU-6050", "TDK", "sensor", "QFN-24", "6-axis MEMS motion tracking (3-axis gyro + 3-axis accel), I²C", 2.9, { sensor_type: "IMU 6-axis", protocol: "I2C", supply: "2.375–3.46 V" }, { lc: "OBSOLETE", msl: "MSL_3", intro: 2011, cf: 5, lt: 0 }),
  p("ICM-42688-P", "TDK", "sensor", "LGA-14", "High-precision 6-axis MEMS IMU, low noise, I²C/SPI/I3C", 3.2, { sensor_type: "IMU 6-axis", protocol: "I2C/SPI", supply: "1.71–3.6 V" }, { msl: "MSL_3", intro: 2020, cf: 2, lt: 14 }),
  p("TMP117AIDRVR", TI, "sensor", "WSON-6", "±0.1 °C high-accuracy digital temperature sensor, I²C", 1.85, { sensor_type: "Temperature", protocol: "I2C", supply: "1.8–5.5 V" }, { msl: "MSL_1", intro: 2018, cf: 1, lt: 12 }),
  p("INA219AIDCNR", TI, "sensor", "SOT-23-8", "26 V bidirectional current/power monitor, 12-bit, I²C", 1.12, { sensor_type: "Current/power monitor", protocol: "I2C", supply: "3–5.5 V" }, { msl: "MSL_2", intro: 2008, cf: 3, lt: 12 }),
  p("ACS712ELCTR-20A-T", "Allegro MicroSystems", "sensor", "SOIC-8", "±20 A Hall-effect current sensor, 2.1 kVrms isolation, 5 V", 1.95, { sensor_type: "Current (Hall)", supply: "4.5–5.5 V", current: "20 A" }, { lc: "NRND", msl: "MSL_2", intro: 2006, cf: 5, lt: 16 }),

  // ───────── MOSFETs ─────────
  p("AO3400A", "Alpha & Omega Semiconductor", "mosfet", "SOT-23", "30 V N-channel MOSFET, 5.7 A, 26 mΩ @ 4.5 V", 0.045, { polarity: "N-channel", vds: "30 V", id: "5.7 A", rds_on: "26 mΩ" }, { msl: "MSL_1", intro: 2008, cf: 3, lt: 8 }),
  p("2N7002", ON, "mosfet", "SOT-23", "60 V N-channel small-signal MOSFET, 115 mA", 0.018, { polarity: "N-channel", vds: "60 V", id: "115 mA", rds_on: "7.5 Ω" }, { msl: "MSL_1", intro: 1995, cf: 2, lt: 8 }),
  p("BSS138", ON, "mosfet", "SOT-23", "50 V N-channel logic-level MOSFET, 220 mA", 0.025, { polarity: "N-channel", vds: "50 V", id: "220 mA", rds_on: "3.5 Ω" }, { msl: "MSL_1", intro: 1998, cf: 2, lt: 8 }),
  p("SI2301CDS-T1-GE3", VSH, "mosfet", "SOT-23", "20 V P-channel MOSFET, 3.1 A, 112 mΩ @ 4.5 V", 0.11, { polarity: "P-channel", vds: "20 V", id: "3.1 A", rds_on: "112 mΩ" }, { msl: "MSL_1", intro: 2009, cf: 2, lt: 12 }),
  p("IRLZ44NPBF", IFX, "mosfet", "TO-220", "55 V N-channel logic-level MOSFET, 47 A, 22 mΩ", 0.95, { polarity: "N-channel", vds: "55 V", id: "47 A", rds_on: "22 mΩ" }, { msl: "MSL_1", intro: 1999, cf: 4, lt: 14, mount: "THT" }),
  p("IRF540NPBF", IFX, "mosfet", "TO-220", "100 V N-channel MOSFET, 33 A, 44 mΩ", 0.82, { polarity: "N-channel", vds: "100 V", id: "33 A", rds_on: "44 mΩ" }, { msl: "MSL_1", intro: 1998, cf: 4, lt: 14, mount: "THT" }),
  p("IPB045N10N3G", IFX, "mosfet", "TO-263 (D2PAK)", "OptiMOS 3 100 V N-channel MOSFET, 100 A, 4.5 mΩ", 1.95, { polarity: "N-channel", vds: "100 V", id: "100 A", rds_on: "4.5 mΩ" }, { msl: "MSL_1", intro: 2009, cf: 2, lt: 18 }),

  // ───────── IGBT ─────────
  p("IKW40N120H3", IFX, "igbt", "TO-247", "1200 V 40 A TRENCHSTOP IGBT3 with anti-parallel diode", 5.6, { polarity: "IGBT + diode", vds: "1200 V", id: "40 A" }, { msl: "MSL_1", intro: 2011, cf: 3, lt: 26, mount: "THT" }),
  p("FGH40N60SMD", ON, "igbt", "TO-247", "600 V 40 A field-stop IGBT with diode", 3.4, { polarity: "IGBT + diode", vds: "600 V", id: "40 A" }, { lc: "LAST_TIME_BUY", msl: "MSL_1", intro: 2012, cf: 3, lt: 30, mount: "THT" }),

  // ───────── BJT ─────────
  p("MMBT3904LT1G", ON, "bjt", "SOT-23", "40 V 200 mA NPN general-purpose transistor", 0.012, { polarity: "NPN", vds: "40 V", id: "200 mA" }, { msl: "MSL_1", intro: 1996, cf: 1, lt: 8 }),
  p("MMBT3906LT1G", ON, "bjt", "SOT-23", "40 V 200 mA PNP general-purpose transistor", 0.012, { polarity: "PNP", vds: "40 V", id: "200 mA" }, { msl: "MSL_1", intro: 1996, cf: 1, lt: 8 }),
  p("BC847C,215", "Nexperia", "bjt", "SOT-23", "45 V 100 mA NPN general-purpose transistor, hFE 420–800", 0.011, { polarity: "NPN", vds: "45 V", id: "100 mA" }, { msl: "MSL_1", intro: 2000, cf: 1, lt: 8 }),

  // ───────── Diodes ─────────
  p("1N4148W-7-F", "Diodes Incorporated", "diode", "SOD-123", "100 V 300 mA fast-switching signal diode", 0.012, { polarity: "Switching", vr: "100 V", if: "300 mA" }, { msl: "MSL_1", intro: 2001, cf: 1, lt: 8 }),
  p("1N4007-T", "Diodes Incorporated", "diode", "DO-41", "1000 V 1 A general-purpose rectifier", 0.02, { polarity: "Rectifier", vr: "1000 V", if: "1 A" }, { msl: "MSL_1", intro: 1990, cf: 1, lt: 8, mount: "THT" }),
  p("MBRS340T3G", ON, "diode", "SMC (DO-214AB)", "40 V 3 A Schottky barrier rectifier", 0.14, { polarity: "Schottky", vr: "40 V", if: "3 A" }, { msl: "MSL_1", intro: 2002, cf: 1, lt: 10 }),
  p("US1M-E3/61T", VSH, "diode", "SMA (DO-214AC)", "1000 V 1 A ultrafast rectifier, 75 ns", 0.06, { polarity: "Ultrafast", vr: "1000 V", if: "1 A" }, { msl: "MSL_1", intro: 2004, cf: 1, lt: 10 }),
  p("BZX84C5V1LT1G", ON, "diode", "SOT-23", "5.1 V 250 mW Zener diode, ±5%", 0.015, { polarity: "Zener", vz: "5.1 V", power: "250 mW", tolerance: "5%" }, { msl: "MSL_1", intro: 1998, cf: 1, lt: 8 }),
  p("MMSZ5231B-7-F", "Diodes Incorporated", "diode", "SOD-123", "5.1 V 500 mW Zener diode, ±5%", 0.02, { polarity: "Zener", vz: "5.1 V", power: "500 mW", tolerance: "5%" }, { msl: "MSL_1", intro: 2001, cf: 1, lt: 8 }),
  p("SMBJ24CA", "Littelfuse", "diode", "SMB (DO-214AA)", "600 W bidirectional TVS diode, 24 V stand-off", 0.12, { polarity: "TVS bidirectional", vz: "24 V", power: "600 W" }, { msl: "MSL_1", intro: 2003, cf: 1, lt: 10 }),
  p("PESD5V0S1BL,315", "Nexperia", "diode", "SOD-882", "5 V bidirectional ESD protection diode, 30 kV contact", 0.035, { polarity: "ESD bidirectional", vz: "5 V" }, { msl: "MSL_1", intro: 2008, cf: 1, lt: 8 }),
  p("SRV05-4.TCT", "Semtech", "diode", "SOT-23-6", "5 V 4-line low-capacitance TVS array for USB/high-speed lines", 0.22, { polarity: "ESD array", vz: "5 V", channels: "4" }, { msl: "MSL_1", intro: 2003, cf: 2, lt: 12 }),

  // ───────── LEDs ─────────
  p("LTST-C191KGKT", "Lite-On", "led", "0603", "Green 571 nm SMD LED, 0603, 20 mA", 0.025, { color: "Green", if: "20 mA" }, { msl: "MSL_3", intro: 2004, cf: 1, lt: 8 }),
  p("LTST-C191KRKT", "Lite-On", "led", "0603", "Red 631 nm SMD LED, 0603, 20 mA", 0.025, { color: "Red", if: "20 mA" }, { msl: "MSL_3", intro: 2004, cf: 1, lt: 8 }),
  p("150080BS75000", WE, "led", "0805", "Blue 470 nm WL-SMCW SMD LED, 0805, 20 mA", 0.09, { color: "Blue", if: "20 mA" }, { msl: "MSL_3", intro: 2014, cf: 1, lt: 6 }),
  p("WS2812B-2020", "Worldsemi", "led", "PLCC-4 2020", "Addressable RGB LED with integrated driver, 2.0 x 2.0 mm", 0.09, { color: "RGB", if: "12 mA" }, { msl: "MSL_6", intro: 2018, cf: 2, lt: 4 }),

  // ───────── Optocouplers ─────────
  p("PC817X2NIP0F", "Sharp", "optocoupler", "DIP-4", "Phototransistor optocoupler, 5 kVrms, CTR 80–160%", 0.12, { isolation: "5000 V", ctr: "80–160%", channels: "1" }, { msl: "MSL_1", intro: 2005, cf: 4, lt: 12, mount: "THT" }),
  p("EL357N(C)(TA)-G", "Everlight Electronics", "optocoupler", "SOP-4", "SMD phototransistor optocoupler, 3.75 kVrms, CTR 200–400%", 0.09, { isolation: "3750 V", ctr: "200–400%", channels: "1" }, { msl: "MSL_1", intro: 2008, cf: 2, lt: 8 }),
  p("TLP291(GB-TP,SE", "Toshiba", "optocoupler", "SOP-4", "SMD phototransistor optocoupler, 3.75 kVrms, CTR 100–600%, 110 °C", 0.15, { isolation: "3750 V", ctr: "100–600%", channels: "1" }, { msl: "MSL_1", intro: 2014, cf: 2, lt: 12 }),

  // ───────── SiC / GaN ─────────
  p("C3M0065090D", "Wolfspeed", "wide-bandgap", "TO-247", "900 V 36 A silicon-carbide MOSFET, 65 mΩ", 7.9, { polarity: "SiC N-channel", vds: "900 V", id: "36 A", rds_on: "65 mΩ" }, { msl: "MSL_1", intro: 2016, cf: 2, lt: 30, mount: "THT" }),
  p("SCT3080KLGC11", "ROHM Semiconductor", "wide-bandgap", "TO-247", "1200 V 31 A trench SiC MOSFET, 80 mΩ", 9.6, { polarity: "SiC N-channel", vds: "1200 V", id: "31 A", rds_on: "80 mΩ" }, { msl: "MSL_1", intro: 2017, cf: 2, lt: 26, mount: "THT" }),
  p("EPC2045", "EPC", "wide-bandgap", "Die (BGA)", "100 V 16 A enhancement-mode GaN FET, 7 mΩ", 2.4, { polarity: "GaN N-channel", vds: "100 V", id: "16 A", rds_on: "7 mΩ" }, { msl: "MSL_1", intro: 2017, cf: 1, lt: 16 }),

  // ───────── MLCC ─────────
  p("GRM188R71H104KA93D", MUR, "mlcc", "0603", "100 nF 50 V X7R ±10% 0603 MLCC", 0.004, { capacitance: "100 nF", voltage: "50 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2005, lt: 16 }),
  p("CL10B104KB8NNNC", SAM, "mlcc", "0603", "100 nF 50 V X7R ±10% 0603 MLCC", 0.003, { capacitance: "100 nF", voltage: "50 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2006, lt: 14 }),
  p("CC0603KRX7R9BB104", YAG, "mlcc", "0603", "100 nF 50 V X7R ±10% 0603 MLCC", 0.0028, { capacitance: "100 nF", voltage: "50 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2007, lt: 12 }),
  p("GRM155R71C104KA88D", MUR, "mlcc", "0402", "100 nF 16 V X7R ±10% 0402 MLCC", 0.003, { capacitance: "100 nF", voltage: "16 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2004, lt: 16 }),
  p("GRM188R71E105KA12D", MUR, "mlcc", "0603", "1 µF 25 V X7R ±10% 0603 MLCC", 0.012, { capacitance: "1 µF", voltage: "25 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2009, lt: 18 }),
  p("GRM1555C1H101JA01D", MUR, "mlcc", "0402", "100 pF 50 V C0G ±5% 0402 MLCC", 0.003, { capacitance: "100 pF", voltage: "50 V", dielectric: "C0G", tolerance: "5%" }, { msl: "MSL_1", intro: 2003, lt: 14 }),
  p("CL05A105KA5NQNC", SAM, "mlcc", "0402", "1 µF 25 V X5R ±10% 0402 MLCC", 0.006, { capacitance: "1 µF", voltage: "25 V", dielectric: "X5R", tolerance: "10%" }, { msl: "MSL_1", intro: 2010, lt: 14 }),
  p("GRM188R61E106MA73D", MUR, "mlcc", "0603", "10 µF 25 V X5R ±20% 0603 MLCC", 0.032, { capacitance: "10 µF", voltage: "25 V", dielectric: "X5R", tolerance: "20%" }, { msl: "MSL_1", intro: 2012, lt: 20 }),
  p("CL10C220JB8NNNC", SAM, "mlcc", "0603", "22 pF 50 V C0G ±5% 0603 MLCC", 0.003, { capacitance: "22 pF", voltage: "50 V", dielectric: "C0G", tolerance: "5%" }, { msl: "MSL_1", intro: 2006, lt: 12 }),
  p("C1608C0G1H102J080AA", "TDK", "mlcc", "0603", "1 nF 50 V C0G ±5% 0603 MLCC", 0.004, { capacitance: "1 nF", voltage: "50 V", dielectric: "C0G", tolerance: "5%" }, { msl: "MSL_1", intro: 2008, lt: 14 }),
  p("CL21A106KAYNNNE", SAM, "mlcc", "0805", "10 µF 25 V X5R ±10% 0805 MLCC", 0.018, { capacitance: "10 µF", voltage: "25 V", dielectric: "X5R", tolerance: "10%" }, { msl: "MSL_1", intro: 2010, lt: 16 }),
  p("C2012X7R1E106K125AB", "TDK", "mlcc", "0805", "10 µF 25 V X7R ±10% 0805 MLCC", 0.055, { capacitance: "10 µF", voltage: "25 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2013, lt: 22 }),
  p("GRM21BR61E226ME44L", MUR, "mlcc", "0805", "22 µF 25 V X5R ±20% 0805 MLCC", 0.06, { capacitance: "22 µF", voltage: "25 V", dielectric: "X5R", tolerance: "20%" }, { msl: "MSL_1", intro: 2013, lt: 24 }),
  p("CC0805KKX7R8BB105", YAG, "mlcc", "0805", "1 µF 25 V X7R ±10% 0805 MLCC", 0.008, { capacitance: "1 µF", voltage: "25 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2008, lt: 12 }),
  p("C0805C104K5RACTU", "KEMET", "mlcc", "0805", "100 nF 50 V X7R ±10% 0805 MLCC", 0.009, { capacitance: "100 nF", voltage: "50 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2002, lt: 14 }),
  p("08055C104KAT2A", "KYOCERA AVX", "mlcc", "0805", "100 nF 50 V X7R ±10% 0805 MLCC", 0.01, { capacitance: "100 nF", voltage: "50 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2001, lt: 16 }),
  p("GRM31CR71H475KA12L", MUR, "mlcc", "1206", "4.7 µF 50 V X7R ±10% 1206 MLCC", 0.085, { capacitance: "4.7 µF", voltage: "50 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2011, lt: 24 }),
  p("TMK316B7106KL-TD", "Taiyo Yuden", "mlcc", "1206", "10 µF 25 V X7R ±10% 1206 MLCC", 0.07, { capacitance: "10 µF", voltage: "25 V", dielectric: "X7R", tolerance: "10%" }, { msl: "MSL_1", intro: 2010, lt: 20 }),

  // ───────── Tantalum ─────────
  p("T491A106K016AT", "KEMET", "tantalum-cap", "Case A (3216)", "10 µF 16 V ±10% tantalum capacitor, case A", 0.12, { capacitance: "10 µF", voltage: "16 V", tolerance: "10%", esr: "3 Ω" }, { msl: "MSL_1", intro: 2000, cf: 2, lt: 16 }),
  p("TAJB476K010RNJ", "KYOCERA AVX", "tantalum-cap", "Case B (3528)", "47 µF 10 V ±10% tantalum capacitor, case B", 0.22, { capacitance: "47 µF", voltage: "10 V", tolerance: "10%", esr: "1.4 Ω" }, { msl: "MSL_1", intro: 2001, cf: 2, lt: 18 }),
  p("TAJA105K035RNJ", "KYOCERA AVX", "tantalum-cap", "Case A (3216)", "1 µF 35 V ±10% tantalum capacitor, case A", 0.14, { capacitance: "1 µF", voltage: "35 V", tolerance: "10%", esr: "8 Ω" }, { msl: "MSL_1", intro: 2001, cf: 2, lt: 18 }),

  // ───────── Aluminium electrolytic ─────────
  p("EEE-FK1V101P", PAN, "aluminium-cap", "SMD Can 6.3x7.7", "100 µF 35 V ±20% SMD aluminium electrolytic, 105 °C 2000 h", 0.14, { capacitance: "100 µF", voltage: "35 V", tolerance: "20%", lifetime: "2000 h @ 105 °C" }, { msl: "MSL_1", intro: 2006, cf: 2, lt: 14 }),
  p("UWT1V220MCL1GB", "Nichicon", "aluminium-cap", "SMD Can 6.3x7.7", "22 µF 35 V ±20% SMD aluminium electrolytic, 85 °C", 0.08, { capacitance: "22 µF", voltage: "35 V", tolerance: "20%", lifetime: "2000 h @ 85 °C" }, { msl: "MSL_1", intro: 2004, cf: 2, lt: 12 }),
  p("EEU-FR1E471", PAN, "aluminium-cap", "Radial 8x11.5", "470 µF 25 V ±20% radial low-ESR electrolytic, 105 °C 5000 h", 0.24, { capacitance: "470 µF", voltage: "25 V", tolerance: "20%", lifetime: "5000 h @ 105 °C" }, { msl: "MSL_1", intro: 2015, cf: 3, lt: 16, mount: "THT" }),
  p("35YXF100MEFC6.3X11", "Rubycon", "aluminium-cap", "Radial 6.3x11", "100 µF 35 V ±20% radial electrolytic, 105 °C 2000 h", 0.09, { capacitance: "100 µF", voltage: "35 V", tolerance: "20%", lifetime: "2000 h @ 105 °C" }, { msl: "MSL_1", intro: 2008, cf: 3, lt: 14, mount: "THT" }),

  // ───────── Polymer ─────────
  p("T520B107M006ATE040", "KEMET", "polymer-cap", "Case B (3528)", "100 µF 6.3 V ±20% polymer tantalum, 40 mΩ ESR", 0.55, { capacitance: "100 µF", voltage: "6.3 V", tolerance: "20%", esr: "40 mΩ" }, { msl: "MSL_3", intro: 2005, cf: 2, lt: 20 }),
  p("EEH-ZA1V101P", PAN, "polymer-cap", "SMD Can 6.3x7.7", "100 µF 35 V hybrid polymer aluminium capacitor, 105 °C 4000 h", 0.62, { capacitance: "100 µF", voltage: "35 V", tolerance: "20%", esr: "27 mΩ" }, { msl: "MSL_1", intro: 2014, cf: 2, lt: 18 }),

  // ───────── Film ─────────
  p("MKS2C031001A00JSSD", "WIMA", "film-cap", null, "100 nF 63 V ±5% polyester film capacitor, 5 mm pitch", 0.18, { capacitance: "100 nF", voltage: "63 V", tolerance: "5%" }, { cf: 1, lt: 12, mount: "THT" }),
  p("BFC233920104", VSH, "film-cap", null, "100 nF 310 VAC X2 interference-suppression film capacitor", 0.22, { capacitance: "100 nF", voltage: "310 V", tolerance: "20%" }, { cf: 1, lt: 14, mount: "THT" }),

  // ───────── Supercap ─────────
  p("HV0810-2R7105-R", "Eaton", "supercap", null, "1 F 2.7 V radial supercapacitor, 8 x 10 mm", 0.95, { capacitance: "1 F", voltage: "2.7 V", esr: "200 mΩ" }, { cf: 1, lt: 12, mount: "THT" }),

  // ───────── Chip resistors ─────────
  p("RC0603FR-0710KL", YAG, "resistor-chip", "0603", "10 kΩ ±1% 0.1 W 0603 thick-film chip resistor", 0.0012, { resistance: "10 kΩ", tolerance: "1%", power: "100 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2003, lt: 10 }),
  p("RC0603FR-074K7L", YAG, "resistor-chip", "0603", "4.7 kΩ ±1% 0.1 W 0603 thick-film chip resistor", 0.0012, { resistance: "4.7 kΩ", tolerance: "1%", power: "100 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2003, lt: 10 }),
  p("RC0603FR-07100RL", YAG, "resistor-chip", "0603", "100 Ω ±1% 0.1 W 0603 thick-film chip resistor", 0.0012, { resistance: "100 Ω", tolerance: "1%", power: "100 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2003, lt: 10 }),
  p("RC0603FR-071KL", YAG, "resistor-chip", "0603", "1 kΩ ±1% 0.1 W 0603 thick-film chip resistor", 0.0012, { resistance: "1 kΩ", tolerance: "1%", power: "100 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2003, lt: 10 }),
  p("RC0402FR-0710KL", YAG, "resistor-chip", "0402", "10 kΩ ±1% 0.0625 W 0402 thick-film chip resistor", 0.0011, { resistance: "10 kΩ", tolerance: "1%", power: "62.5 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2003, lt: 10 }),
  p("RC0805FR-0710KL", YAG, "resistor-chip", "0805", "10 kΩ ±1% 0.125 W 0805 thick-film chip resistor", 0.0015, { resistance: "10 kΩ", tolerance: "1%", power: "125 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2003, lt: 10 }),
  p("RC1206JR-070RL", YAG, "resistor-chip", "1206", "0 Ω jumper 1206 chip resistor", 0.002, { resistance: "0 Ω", power: "250 mW" }, { msl: "MSL_1", intro: 2003, lt: 10 }),
  p("CRCW060310K0FKEA", VSH, "resistor-chip", "0603", "10 kΩ ±1% 0.1 W 0603 thick-film chip resistor, AEC-Q200", 0.0035, { resistance: "10 kΩ", tolerance: "1%", power: "100 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2004, lt: 14 }),
  p("ERJ-3EKF1002V", PAN, "resistor-chip", "0603", "10 kΩ ±1% 0.1 W 0603 thick-film chip resistor, AEC-Q200", 0.0025, { resistance: "10 kΩ", tolerance: "1%", power: "100 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2002, lt: 12 }),
  p("ERJ-3EKF1001V", PAN, "resistor-chip", "0603", "1 kΩ ±1% 0.1 W 0603 thick-film chip resistor, AEC-Q200", 0.0025, { resistance: "1 kΩ", tolerance: "1%", power: "100 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2002, lt: 12 }),
  p("CR0603-FX-1002ELF", "Bourns", "resistor-chip", "0603", "10 kΩ ±1% 0.1 W 0603 thick-film chip resistor", 0.0016, { resistance: "10 kΩ", tolerance: "1%", power: "100 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2006, lt: 10 }),
  p("RMCF0603FT10K0", "Stackpole Electronics", "resistor-chip", "0603", "10 kΩ ±1% 0.1 W 0603 thick-film chip resistor", 0.0014, { resistance: "10 kΩ", tolerance: "1%", power: "100 mW", tempco: "100 ppm/°C" }, { msl: "MSL_1", intro: 2008, lt: 8 }),
  p("TNPW060310K0BEEA", VSH, "resistor-chip", "0603", "10 kΩ ±0.1% 25 ppm 0603 thin-film precision resistor", 0.11, { resistance: "10 kΩ", tolerance: "0.1%", power: "125 mW", tempco: "25 ppm/°C" }, { msl: "MSL_1", intro: 2007, lt: 16 }),

  // ───────── Current-sense / network / pot ─────────
  p("WSL2512R0100FEA", VSH, "resistor-current-sense", "2512", "10 mΩ ±1% 1 W 2512 metal-strip current-sense resistor", 0.32, { resistance: "10 mΩ", tolerance: "1%", power: "1 W", tempco: "75 ppm/°C" }, { msl: "MSL_1", intro: 2000, cf: 2, lt: 14 }),
  p("CRA2512-FZ-R010ELF", "Bourns", "resistor-current-sense", "2512", "10 mΩ ±1% 3 W 2512 current-sense resistor", 0.24, { resistance: "10 mΩ", tolerance: "1%", power: "3 W", tempco: "75 ppm/°C" }, { msl: "MSL_1", intro: 2010, cf: 1, lt: 12 }),
  p("CAT16-103J4LF", "Bourns", "resistor-network", "1206", "4 x 10 kΩ ±5% isolated chip resistor array, 1206", 0.018, { resistance: "10 kΩ", tolerance: "5%", channels: "4" }, { msl: "MSL_1", intro: 2004, lt: 10 }),
  p("3296W-1-103LF", "Bourns", "potentiometer", null, "10 kΩ 25-turn cermet trimmer potentiometer, top adjust", 1.05, { resistance: "10 kΩ", tolerance: "10%", power: "500 mW" }, { cf: 4, lt: 10, mount: "THT" }),

  // ───────── Inductors / ferrites ─────────
  p("744043100", WE, "inductor", null, "10 µH 1.0 A WE-TPC shielded SMD power inductor, 4.8 x 4.8 mm", 0.42, { inductance: "10 µH", current: "1 A", isat: "1.2 A" }, { msl: "MSL_1", intro: 2006, lt: 8 }),
  p("SRR1260-100M", "Bourns", "inductor", null, "10 µH 6.6 A shielded SMD power inductor, 12 x 12 mm", 0.48, { inductance: "10 µH", current: "6.6 A", isat: "7.5 A" }, { msl: "MSL_1", intro: 2007, lt: 12 }),
  p("XAL4020-222MEB", "Coilcraft", "inductor", null, "2.2 µH 5.6 A molded power inductor, 4 x 4 mm, low DCR", 0.85, { inductance: "2.2 µH", current: "5.6 A", isat: "6.7 A" }, { msl: "MSL_1", intro: 2012, lt: 10 }),
  p("MLZ2012N100LT000", "TDK", "inductor", "0805", "10 µH 0805 multilayer power inductor", 0.06, { inductance: "10 µH", current: "150 mA" }, { msl: "MSL_1", intro: 2011, lt: 14 }),
  p("BLM18PG221SN1D", MUR, "ferrite-bead", "0603", "220 Ω @ 100 MHz 1.4 A ferrite bead, 0603", 0.012, { impedance: "220 Ω", current: "1.4 A" }, { msl: "MSL_1", intro: 2006, lt: 14 }),
  p("BLM21PG600SN1D", MUR, "ferrite-bead", "0805", "60 Ω @ 100 MHz 3.5 A ferrite bead, 0805", 0.018, { impedance: "60 Ω", current: "3.5 A" }, { msl: "MSL_1", intro: 2006, lt: 14 }),

  // ───────── Frequency control ─────────
  p("ABM8-16.000MHZ-B2-T", "Abracon", "crystal", "SMD 3225 (4-pad)", "16 MHz ±20 ppm crystal, 18 pF, 3.2 x 2.5 mm", 0.22, { frequency: "16 MHz", load_cap: "18 pF", stability: "20 ppm" }, { msl: "MSL_1", intro: 2008, cf: 1, lt: 10 }),
  p("NX3225GA-8MHZ-STD-CRG-2", "NDK", "crystal", "SMD 3225 (4-pad)", "8 MHz ±20 ppm crystal, 8 pF, 3.2 x 2.5 mm", 0.31, { frequency: "8 MHz", load_cap: "8 pF", stability: "20 ppm" }, { msl: "MSL_1", intro: 2012, cf: 1, lt: 14 }),
  p("FC-135 32.7680KA-A3", "Epson", "crystal", "SMD 2012 (2-pad)", "32.768 kHz ±20 ppm tuning-fork crystal, 12.5 pF, 3.2 x 1.5 mm", 0.24, { frequency: "32.768 kHz", load_cap: "12.5 pF", stability: "20 ppm" }, { msl: "MSL_1", intro: 2007, cf: 1, lt: 12 }),
  p("SIT8008BI-12-33E-25.000000G", "SiTime", "oscillator", "SMD 2520 (4-pad)", "25 MHz ±20 ppm MEMS oscillator, 3.3 V LVCMOS", 0.72, { frequency: "25 MHz", stability: "20 ppm", supply: "3.3 V" }, { msl: "MSL_1", intro: 2012, cf: 1, lt: 6 }),
  p("ECS-2520MV-250-BN-TR", "ECS Inc", "oscillator", "SMD 2520 (4-pad)", "25 MHz ±50 ppm crystal oscillator, 1.6–3.6 V CMOS", 0.68, { frequency: "25 MHz", stability: "50 ppm", supply: "1.6–3.6 V" }, { msl: "MSL_1", intro: 2015, cf: 1, lt: 10 }),

  // ───────── Protection ─────────
  p("0466001.NR", "Littelfuse", "fuse", "1206", "1 A 63 V very-fast-acting 1206 SMD fuse", 0.18, { current: "1 A", voltage: "63 V" }, { msl: "MSL_1", intro: 2005, cf: 1, lt: 10 }),
  p("0251001.MXL", "Littelfuse", "fuse", null, "1 A 125 V PICO II axial fast-acting fuse", 0.42, { current: "1 A", voltage: "125 V" }, { cf: 1, lt: 10, mount: "THT" }),
  p("0ZCJ0050FF2E", "Bel Fuse", "ptc-ntc", "1206", "0.5 A hold 16 V resettable PTC fuse, 1206", 0.09, { current: "500 mA", voltage: "16 V" }, { msl: "MSL_1", intro: 2010, cf: 1, lt: 8 }),
  p("NCP18XH103F03RB", MUR, "ptc-ntc", "0603", "10 kΩ ±1% NTC thermistor, B=3380 K, 0603", 0.045, { resistance: "10 kΩ", tolerance: "1%" }, { msl: "MSL_1", intro: 2006, lt: 14 }),
  p("V275LA20AP", "Littelfuse", "varistor", null, "275 VAC 14 mm radial metal-oxide varistor, 4.5 kA", 0.26, { voltage: "275 V", current: "4.5 kA" }, { cf: 1, lt: 12, mount: "THT" }),
  p("MOV-14D471K", "Bourns", "varistor", null, "300 VAC (470 V) 14 mm radial metal-oxide varistor, 6 kA", 0.22, { voltage: "300 V", current: "6 kA" }, { cf: 1, lt: 12, mount: "THT" }),

  // ───────── Connectors ─────────
  p("61300211121", WE, "connector-header", null, "2-pin 2.54 mm single-row straight pin header, THT", 0.06, { positions: "2", pitch: "2.54 mm", series: "WR-PHD" }, { cf: 1, lt: 6, mount: "THT" }),
  p("TSW-110-07-G-S", "Samtec", "connector-header", null, "10-pin 2.54 mm single-row terminal strip, gold, THT", 0.62, { positions: "10", pitch: "2.54 mm", series: "TSW" }, { cf: 1, lt: 4, mount: "THT" }),
  p("PRPC040SAAN-RC", "Sullins Connector Solutions", "connector-header", null, "40-pin 2.54 mm single-row breakaway header, THT", 0.45, { positions: "40", pitch: "2.54 mm", series: "PRPC" }, { cf: 1, lt: 6, mount: "THT" }),
  p("B2B-XH-A(LF)(SN)", "JST", "connector-wtb", null, "XH 2-pin 2.5 mm top-entry wire-to-board header, THT", 0.06, { positions: "2", pitch: "2.5 mm", series: "XH", orientation: "Vertical" }, { cf: 3, lt: 8, mount: "THT" }),
  p("S4B-PH-K-S(LF)(SN)", "JST", "connector-wtb", null, "PH 4-pin 2.0 mm side-entry wire-to-board header, THT", 0.12, { positions: "4", pitch: "2.0 mm", series: "PH", orientation: "Right angle" }, { cf: 3, lt: 8, mount: "THT" }),
  p("53047-0410", "Molex", "connector-wtb", null, "PicoBlade 4-pin 1.25 mm vertical wire-to-board header, THT", 0.28, { positions: "4", pitch: "1.25 mm", series: "PicoBlade", orientation: "Vertical" }, { cf: 2, lt: 10, mount: "THT" }),
  p("430450400", "Molex", "connector-wtb", null, "Micro-Fit 3.0 4-pin dual-row right-angle header, 3.0 mm, 5 A", 0.95, { positions: "4", pitch: "3.0 mm", series: "Micro-Fit 3.0", orientation: "Right angle", contact_rating: "5 A" }, { cf: 2, lt: 12, mount: "THT" }),
  p("DF40C-40DS-0.4V(51)", "Hirose Electric", "connector-btb", null, "40-pin 0.4 mm board-to-board receptacle, 1.5 mm stack", 0.88, { positions: "40", pitch: "0.4 mm", series: "DF40" }, { msl: "MSL_1", cf: 2, lt: 16 }),
  p("FTSH-105-01-F-DV-K", "Samtec", "connector-btb", null, "10-pin 1.27 mm dual-row SMD header with keying shroud (SWD/JTAG)", 1.95, { positions: "10", pitch: "1.27 mm", series: "FTSH" }, { msl: "MSL_1", cf: 1, lt: 4 }),
  p("USB4105-GF-A", "GCT", "connector-usb", null, "USB Type-C 2.0 receptacle, 16-pin, SMD/THT hybrid, top mount", 0.62, { positions: "16", series: "USB-C 2.0", orientation: "Right angle" }, { msl: "MSL_1", cf: 2, lt: 8 }),
  p("10118194-0001LF", "Amphenol", "connector-usb", null, "Micro-USB 2.0 type-B receptacle, 5-pin, SMD", 0.32, { positions: "5", series: "Micro-USB B", orientation: "Right angle" }, { lc: "NRND", msl: "MSL_1", cf: 3, lt: 10 }),
  p("7499010211A", WE, "connector-rj45", null, "RJ45 10/100 Base-T jack with integrated magnetics and LEDs, THT", 2.95, { positions: "8", series: "WE-RJ45 LAN", contact_rating: "1.5 A" }, { cf: 2, lt: 10, mount: "THT" }),
  p("RJHSE-5380", "Amphenol", "connector-rj45", null, "RJ45 shielded modular jack, 8P8C, right-angle, THT", 1.15, { positions: "8", series: "RJHSE" }, { cf: 2, lt: 12, mount: "THT" }),
  p("T4171010004-001", "TE Connectivity", "connector-m12", null, "M12 A-coded 4-pin female panel-mount connector, IP67", 8.4, { positions: "4", series: "M12 A-coded", ip_rating: "IP67" }, { cf: 1, lt: 14, mount: "CHASSIS" }),
  p("L717SDE09P", "Amphenol", "connector-dsub", null, "DE-9 male D-sub, right-angle PCB mount, THT", 1.25, { positions: "9", series: "D-sub DE-9", orientation: "Right angle" }, { cf: 1, lt: 10, mount: "THT" }),
  p("1935161", "Phoenix Contact", "terminal-block", null, "MKDS 1,5/2-5,08 2-pos PCB terminal block, 5.08 mm, 13.5 A", 0.38, { positions: "2", pitch: "5.08 mm", series: "MKDS 1,5", contact_rating: "13.5 A" }, { cf: 2, lt: 8, mount: "THT" }),
  p("691137710002", WE, "terminal-block", null, "WR-TBL 2-pos screw terminal block, 5.0 mm, 16 A", 0.32, { positions: "2", pitch: "5.0 mm", series: "WR-TBL", contact_rating: "16 A" }, { cf: 1, lt: 6, mount: "THT" }),
  p("FH12-24S-0.5SH(55)", "Hirose Electric", "connector-fpc", null, "24-pin 0.5 mm FPC/FFC connector, bottom contact, flip lock", 0.72, { positions: "24", pitch: "0.5 mm", series: "FH12" }, { msl: "MSL_1", cf: 2, lt: 14 }),

  // ───────── Relays / switches / misc EM ─────────
  p("G5LE-1 DC12", "Omron", "relay", null, "SPDT 10 A power relay, 12 VDC coil, THT", 0.92, { coil_voltage: "12 V", contact_rating: "10 A", switch_type: "SPDT" }, { cf: 3, lt: 12, mount: "THT" }),
  p("TQ2-5V", PAN, "relay", null, "DPDT 2 A signal relay, 5 VDC coil, THT", 2.6, { coil_voltage: "5 V", contact_rating: "2 A", switch_type: "DPDT" }, { cf: 2, lt: 14, mount: "THT" }),
  p("PTS645SM43SMTR92 LFS", "C&K", "switch", null, "6 x 6 mm SMD tactile switch, 4.3 mm height, 160 gf", 0.09, { switch_type: "Tactile SPST-NO", contact_rating: "50 mA" }, { msl: "MSL_1", cf: 1, lt: 8 }),
  p("B3F-1000", "Omron", "switch", null, "6 x 6 mm THT tactile switch, 100 gf", 0.16, { switch_type: "Tactile SPST-NO", contact_rating: "50 mA" }, { cf: 2, lt: 10, mount: "THT" }),
  p("EG1218", "E-Switch", "switch", null, "SPDT slide switch, 2.54 mm, THT", 0.42, { switch_type: "Slide SPDT", contact_rating: "200 mA" }, { cf: 1, lt: 8, mount: "THT" }),
  p("CMT-1203-SMT-TR", "CUI Devices", "buzzer", null, "12 mm SMD magnetic transducer buzzer, 3.6 V, 2.7 kHz", 0.68, { frequency: "2.7 kHz", supply: "3.6 V" }, { msl: "MSL_1", cf: 1, lt: 8 }),
  p("3034", "Keystone Electronics", "battery-holder", null, "CR2032 coin-cell holder, SMD", 0.38, { series: "CR2032" }, { msl: "MSL_1", cf: 1, lt: 6 }),
  p("577202B00000G", "Boyd", "heatsink", null, "TO-220 clip-on heatsink, 21 °C/W, black anodised aluminium", 0.65, { material: "Aluminium, black anodised", dimensions: "19 x 13 x 12.7 mm" }, { cf: 1, lt: 8, mount: "THT" }),

  // ───────── Cables & harness ─────────
  p("3051 BK005", "Alpha Wire", "hookup-wire", null, "22 AWG UL1007 stranded hook-up wire, PVC, black, 100 ft", 21.5, { awg: "22 AWG", conductors: "1", insulation: "UL1007 PVC 300 V" }, { cf: 1, lt: 4, mount: "CABLE", hsn: "85444999" }),
  p("3365/10", "3M", "ribbon-cable", null, "10-conductor 1.27 mm grey flat ribbon cable, 28 AWG, per ft", 0.38, { awg: "28 AWG", conductors: "10", pitch: "1.27 mm" }, { cf: 1, lt: 6, mount: "CABLE" }),
  p("8723 060100", "Belden", "shielded-cable", null, "2-pair 22 AWG individually foil-shielded instrumentation cable, 100 ft", 128, { awg: "22 AWG", conductors: "4", insulation: "PVC, foil shield" }, { cf: 1, lt: 8, mount: "CABLE" }),
  p("43030-0007", "Molex", "harness-component", null, "Micro-Fit 3.0 female crimp terminal, 20–24 AWG, tin", 0.06, { series: "Micro-Fit 3.0", awg: "20–24 AWG" }, { cf: 2, lt: 10, mount: "CABLE" }),
  p("43025-0400", "Molex", "harness-component", null, "Micro-Fit 3.0 4-pos dual-row receptacle housing", 0.18, { series: "Micro-Fit 3.0", positions: "4", pitch: "3.0 mm" }, { cf: 2, lt: 10, mount: "CABLE" }),
  p("SXH-001T-P0.6", "JST", "harness-component", null, "XH female crimp contact, 22–28 AWG, tin", 0.02, { series: "XH", awg: "22–28 AWG" }, { cf: 3, lt: 8, mount: "CABLE" }),
  p("XHP-2", "JST", "harness-component", null, "XH 2-pos receptacle housing, 2.5 mm", 0.02, { series: "XH", positions: "2", pitch: "2.5 mm" }, { cf: 3, lt: 8, mount: "CABLE" }),

  // ───────── Mechanical / box-build ─────────
  p("1590B", "Hammond Manufacturing", "enclosure", null, "Die-cast aluminium enclosure, 112 x 60 x 31 mm, unpainted", 7.8, { material: "Die-cast aluminium", dimensions: "112 x 60 x 31 mm", ip_rating: "IP54" }, { cf: 1, lt: 6, mount: "CHASSIS" }),
  p("1455N1601", "Hammond Manufacturing", "enclosure", null, "Extruded aluminium enclosure with end panels, 160 x 103 x 53 mm", 24.5, { material: "Extruded aluminium", dimensions: "160 x 103 x 53 mm", ip_rating: "IP54" }, { cf: 1, lt: 8, mount: "CHASSIS" }),
  p("970100244", WE, "fastener", null, "WA-SSTII M3 10 mm hexagonal brass standoff, female-female", 0.16, { thread: "M3", dimensions: "10 mm", material: "Brass, nickel plated" }, { cf: 1, lt: 6, mount: "CHASSIS", hsn: "74153390" }),
];

/**
 * Catalogue enclosures for the box step (Phase 13), kept apart from PARTS so the seeded market for every other part
 * stays exactly as it was. Outer dimensions from Hammond's catalogue; `usd` only drives the simulated offers.
 */
export const CATALOGUE_ENCLOSURES: SeedPart[] = [
  p("1590A", "Hammond Manufacturing", "enclosure", null, "Die-cast aluminium enclosure, 93 x 39 x 31 mm, unpainted", 7.2, { material: "Die-cast aluminium", dimensions: "93 x 39 x 31 mm", ip_rating: "IP54" }, { cf: 1, lt: 6, mount: "CHASSIS" }),
  p("1590N1", "Hammond Manufacturing", "enclosure", null, "Die-cast aluminium enclosure, 121 x 66 x 40 mm, unpainted", 10.5, { material: "Die-cast aluminium", dimensions: "121 x 66 x 40 mm", ip_rating: "IP54" }, { cf: 1, lt: 6, mount: "CHASSIS" }),
  p("1590BB", "Hammond Manufacturing", "enclosure", null, "Die-cast aluminium enclosure, 120 x 94 x 34 mm, unpainted", 12.4, { material: "Die-cast aluminium", dimensions: "120 x 94 x 34 mm", ip_rating: "IP54" }, { cf: 1, lt: 6, mount: "CHASSIS" }),
  p("1590XX", "Hammond Manufacturing", "enclosure", null, "Die-cast aluminium enclosure, 145 x 121 x 39 mm, unpainted", 17.9, { material: "Die-cast aluminium", dimensions: "145 x 121 x 39 mm", ip_rating: "IP54" }, { cf: 1, lt: 7, mount: "CHASSIS" }),
  p("1590DD", "Hammond Manufacturing", "enclosure", null, "Die-cast aluminium enclosure, 188 x 120 x 33 mm, unpainted", 21.5, { material: "Die-cast aluminium", dimensions: "188 x 120 x 33 mm", ip_rating: "IP54" }, { cf: 1, lt: 7, mount: "CHASSIS" }),
  p("1455N1201", "Hammond Manufacturing", "enclosure", null, "Extruded aluminium enclosure with end panels, 120 x 103 x 53 mm", 19.8, { material: "Extruded aluminium", dimensions: "120 x 103 x 53 mm", ip_rating: "IP54" }, { cf: 1, lt: 8, mount: "CHASSIS" }),
  p("1455N2201", "Hammond Manufacturing", "enclosure", null, "Extruded aluminium enclosure with end panels, 220 x 103 x 53 mm", 29.6, { material: "Extruded aluminium", dimensions: "220 x 103 x 53 mm", ip_rating: "IP54" }, { cf: 1, lt: 8, mount: "CHASSIS" }),
];
