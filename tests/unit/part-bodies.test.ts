import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PART_BODIES, PART_BODIES_VERSION } from "@/knowledge/part-bodies";
import { bodyFor, bodyForLine, headerOnCopper, SHAPE_MODEL, THROUGH_HOLE_SHAPES, type BodySpec } from "@/lib/board/bodies";
import { heatsinkLooks, studioModel, toCircuitflowBoard } from "@/components/viewer/to-circuitflow";
import { padsFor } from "@/lib/board/artwork";
import type { ViewerData } from "@/components/viewer/types";
import { buildBody, modelKind } from "@/vendor/circuitflow/partModels.js";

/** A BoM line the way a distributor's catalogue writes it. */
const line = (mpn: string, description: string, pkg = "", refDes = "") => bodyForLine({ mpn, description, pkg, refDes });
/** Shape (or kind, where the kind draws it), then length × width × height. */
const read = (b: BodySpec | null) => (b ? [b.shape ?? b.kind, b.length, b.width, b.height] : null);

describe("the body a BoM line describes", () => {
  it("reads chip capacitors and resistors from the part number, with the thickness where the number carries it", () => {
    expect(read(line("GRM21BR61C106KE15L", "CAP CER 10UF 16V X5R 0805"))).toEqual(["chip", 2, 1.25, 1.25]);
    expect(read(line("C3216X7R1H105K160AA", "CAP CER 1UF 50V X7R 1206"))).toEqual(["chip", 3.2, 1.6, 1.6]);
    expect(read(line("C0603C104K5RACTU", ""))).toEqual(["chip", 1.6, 0.8, 0.8]);
    expect(read(line("CRCW06031K00FKEA", "RES 1K OHM 1% 1/10W 0603"))).toEqual(["chip", 1.6, 0.8, 0.45]);
    expect(read(line("ERJ-6ENF1002V", ""))).toEqual(["chip", 2, 1.25, 0.5]);
    expect(line("GRM21BR61C106KE15L", "")?.color).not.toBe(line("CRCW06031K00FKEA", "")?.color);
  });

  it("reads chip parts from the size in the description or the footprint name when the number is unknown", () => {
    expect(read(line("HOUSE-0001", "CAP CER 0.1UF 50V X7R 1210"))).toEqual(["chip", 3.2, 2.5, 1.6]);
    expect(read(line("HOUSE-0002", "RES 0.02 OHM 2W 1% 2512 SMD"))).toEqual(["chip", 6.35, 3.2, 0.6]);
    expect(read(line("HOUSE-0003", "", "RES_RC0805"))).toEqual(["chip", 2, 1.25, 0.5]);
    expect(read(line("HOUSE-0004", "", "C_0402", "C12"))).toEqual(["chip", 1, 0.5, 0.5]);
    // A bead's "600 OHM" does not make it a resistor; a bare size with nothing to say what the part is, is nothing.
    expect(line("HOUSE-0005", "FERRITE BEAD 600 OHM 0603 1LN")?.color).toBe("#3a3a3a");
    expect(line("HOUSE-0006", "", "0805")).toBeNull();
  });

  it("sizes SMD aluminium cans from the case code, a diameter, written dimensions, or capacitance × voltage", () => {
    // A Panasonic hybrid can of 100 µF 25 V is the 6.3 mm can, 7.7 mm tall (case D8), on a 6.6 mm base.
    expect(read(line("EEH-ZA1E101XP", "CAP ALUM POLY HYB 100UF 25V SMD"))).toEqual(["smdcan", 6.6, 6.6, 7.7]);
    expect(read(line("EEH-ZA1E101XP", "", "PANASONIC_D8"))).toEqual(["smdcan", 6.6, 6.6, 7.7]);
    // On another maker's footprint "D8" is an 8 mm diameter.
    expect(read(line("UWT1V101MCL1GS", "CAP ALUM 100UF 20% 35V SMD", "CAP_D8_SMD"))).toEqual(["smdcan", 8.3, 8.3, 10.2]);
    expect(read(line("HOUSE-0010", "CAP ALUM 220UF 35V SMD 10X10.2"))).toEqual(["smdcan", 10.3, 10.3, 10.2]);
    expect(read(line("EEE-FK1C100R", ""))).toEqual(["smdcan", 5.3, 5.3, 5.4]);
  });

  it("stands radial cans up and gives tantalums their case", () => {
    const radial = line("EEU-FR1V471", "CAP ALUM 470UF 20% 35V RADIAL");
    expect(radial).toMatchObject({ kind: "can", shape: "electrolytic" });
    expect(radial!.length).toBeGreaterThanOrEqual(10);
    expect(radial!.height).toBeGreaterThan(radial!.length);
    expect(read(line("25ZLH470MEFC8X11.5", ""))).toEqual(["electrolytic", 8, 8, 11.5]);
    expect(read(line("T491B106K016AT", "CAP TANT 10UF 16V 10% 1411"))).toEqual(["tantalum", 3.5, 2.8, 1.9]);
    expect(read(line("TAJD107K016RNJ", ""))).toEqual(["tantalum", 7.3, 4.3, 2.8]);
  });

  it("reads shielded power inductors' sizes from their series numbers", () => {
    expect(read(line("SRP1270-4R7M", "FIXED IND 4.7UH 15A SMD"))).toEqual(["power-inductor", 13.5, 12.5, 7]);
    expect(read(line("SRP7028A-4R7M", ""))).toEqual(["power-inductor", 7.3, 6.6, 2.8]);
    expect(read(line("SRR1260-100M", ""))).toEqual(["power-inductor", 12.5, 12.5, 6]);
    expect(read(line("DR74-100-R", "INDUCTOR SHIELD PWR 10UH SMD"))).toEqual(["power-inductor", 7.6, 7.6, 4.35]);
    expect(read(line("DR127-470-R", ""))).toEqual(["power-inductor", 12.5, 12.5, 8]);
    expect(read(line("XAL7030-222MEC", ""))).toEqual(["power-inductor", 7.3, 7.3, 3.1]);
    expect(read(line("MSS1260-103MLD", ""))).toEqual(["power-inductor", 12.3, 12.3, 6.1]);
    expect(read(line("744771147", ""))).toEqual(["power-inductor", 12, 12, 6]);
    expect(read(line("CDRH127/LDNP-100MC", ""))).toEqual(["power-inductor", 12, 12, 8]);
    expect(read(line("IHLP2525CZER2R2M01", ""))).toEqual(["power-inductor", 6.75, 6.55, 3]);
    // No series we know: the current rating picks the size class; a chip-sized one stays a chip.
    expect(read(line("HOUSE-0020", "FIXED IND 4.7UH 8A SHIELDED SMD"))).toEqual(["power-inductor", 10.3, 10.5, 4]);
    expect(read(line("HOUSE-0021", "FIXED IND 2.2UH 1.2A 0805"))).toEqual(["chip", 2, 1.25, 0.85]);
  });

  it("knows the power packages, and that a heatsink for a TO-220 is a heatsink", () => {
    expect(line("IRF540NPBF", "MOSFET N-CH 100V 33A TO220AB")).toMatchObject({ shape: "to220", pins: 3, length: 10.2, height: 18.5 });
    expect(line("MBR1045G", "DIODE SCHOTTKY 45V 10A TO220AC")).toMatchObject({ shape: "to220", pins: 2 });
    expect(line("IRFP460PBF", "MOSFET N-CH 500V 20A TO-247AC")).toMatchObject({ shape: "to220", length: 15.9 });
    expect(read(line("HOUSE-0030", "MOSFET N-CH 60V 50A D2PAK"))).toEqual(["dpak", 10.16, 9.15, 4.45]);
    expect(read(line("HOUSE-0031", "MOSFET N-CH 60V 12A DPAK"))).toEqual(["dpak", 6.6, 6.1, 2.3]);
    expect(read(line("513202B02500G", "HEAT SINK TO-220 BOARD MOUNT BLACK"))).toEqual(["heatsink", 34.92, 12.7, 50.8]);
    expect(read(line("513002B02500G", ""))).toEqual(["heatsink", 34.92, 12.7, 25.4]);
    expect(read(line("HOUSE-0032", "HEAT SINK TO-220 VERT SOLDER PINS 2.5 IN"))).toEqual(["heatsink", 34.92, 12.7, 63.5]);
    expect(line("HOUSE-0033", "HEATSINK TO-220 CLIP-ON")).toMatchObject({ shape: "heatsink", pins: 0, height: 12.7 });
    // What goes with a heatsink is not one.
    expect(line("HOUSE-0034", "HEATSINK COMPOUND 5G")).toBeNull();
    expect(line("HOUSE-0035", "THERMAL PAD FOR HEATSINK 20X20")).toBeNull();
    expect(line("HOUSE-0036", "INSULATOR MICA TO-220 HEATSINK")).toBeNull();
  });

  it("trusts the description before the footprint name", () => {
    // A SOT-223 regulator drawn on a footprint the library calls TO263.
    expect(read(line("HOUSE-0039", "IC REG LINEAR 5V 800MA SOT-223", "D2PAK_TO263"))).toEqual(["sot223", 6.5, 3.5, 1.6]);
    expect(read(line("HOUSE-0040", "", "TO263-3"))).toEqual(["dpak", 10.16, 9.15, 4.45]);
  });

  it("sizes a transformer from the core its line names, and knows a current-sense transformer", () => {
    const e55 = line("HOUSE-0049", "TRANSFORMER SMPS 4 WINDINGS", "E55/28/21");
    expect(e55).toMatchObject({ kind: "module", shape: "transformer" });
    expect(e55!.length).toBeCloseTo(56.5, 1);
    expect(e55!.width).toBeCloseTo(61, 1);
    expect(e55!.height).toBeGreaterThan(38);
    expect(e55!.height).toBeLessThan(46);
    expect(line("HOUSE-0050", "FLYBACK TRANSFORMER ETD34 12 PIN")).toMatchObject({ shape: "transformer", length: 36, pins: 12 });
    expect(line("HOUSE-0051", "XFMR SMPS RM8")).toMatchObject({ shape: "transformer", length: 19.7, width: 19.7 });
    const efd = line("HOUSE-0052", "TRANSFORMER EFD20 LOW PROFILE")!;
    expect(efd.height).toBeLessThan(12);
    expect(read(line("FIS112NL", "XFRMR CURR SENSE 20A 1:100 T/H"))).toEqual(["ct-transformer", 17.6, 15, 12.5]);
    expect(line("HOUSE-0053", "XFRMR CURR SENSE 10A 1:50 T/H")).toMatchObject({ shape: "ct-transformer" });
  });

  it("counts a Molex Mini-Fit Jr's circuits from its number", () => {
    expect(line("39-28-1043", "CONN HEADER 4POS 4.2MM VERT TIN")).toMatchObject({ shape: "minifit", pins: 4, pitch: 4.2, length: 9.6, width: 9.6, height: 12.8 });
    expect(line("39-29-9062", "")).toMatchObject({ shape: "minifit", pins: 6, length: 13.8 });
    expect(line("39-28-1243", "")).toMatchObject({ pins: 24, length: 51.6 });
    // Right-angle (39-30): the same housing lying down.
    expect(line("39-30-1040", "")).toMatchObject({ shape: "minifit", width: 12.8, height: 9.6 });
    expect(line("HOUSE-0060", "CONN HEADER 8POS 4.2MM VERT GOLD")).toMatchObject({ shape: "minifit", pins: 8, length: 18 });
    expect(line("39-28-1043", "")!.color).not.toBe(line("IRF540NPBF", "MOSFET N-CH 100V 33A TO220AB")!.color);
  });

  it("knows one-row locking headers: Molex KK and SL, JST XH", () => {
    expect(line("22-23-2031", "CONN HEADER 3POS .100 VERT TIN")).toMatchObject({ shape: "kk-header", pins: 3, pitch: 2.54, length: 7.62 });
    expect(line("70543-0002", "")).toMatchObject({ shape: "kk-header", pins: 3 });
    expect(line("70543-0003", "CONN HEADER 4POS .100 VERT TIN")).toMatchObject({ shape: "kk-header", pins: 4 });
    expect(line("B4B-XH-A(LF)(SN)", "")).toMatchObject({ shape: "kk-header", pins: 4, pitch: 2.5, length: 12.4, width: 5.75, height: 7 });
  });

  it("lays pin headers out in one row or two", () => {
    expect(line("HOUSE-0070", "CONN HEADER VERT 40POS 2.54MM")).toMatchObject({ shape: "header", pins: 40, length: 101.6, width: 2.54 });
    expect(line("HOUSE-0071", "CONN HEADER VERT 10POS 2.54MM DUAL ROW")).toMatchObject({ shape: "header", pins: 10, length: 12.7, width: 5.08 });
    expect(line("HOUSE-0072", "PIN HEADER 2X8 2.54MM")).toMatchObject({ pins: 16, length: 20.32, width: 5.08 });
    // A jumper-block footprint holds one jumper per column: six positions on a three-jumper block are 2 × 3.
    expect(line("HOUSE-0073", 'CONN HEADER 6POS BRKWAY .100"', "JUMPER_3POS")).toMatchObject({ pins: 6, length: 7.62, width: 5.08 });
    expect(line("826632-4", "CONN HEADER BRKWY 8POS VERT GOLD")).toMatchObject({ pins: 8, length: 10.16, width: 5.08 });
    expect(line("HOUSE-0074", "CONN HEADER VERT 20POS 1.27MM")).toMatchObject({ pitch: 1.27, height: 4.5 });
    expect(line("HOUSE-0075", "CONN RCPT 8POS 0.1 GOLD PCB HEADER SOCKET")).toMatchObject({ kind: "connector", pins: 8, height: 8.5 });
  });

  it("tells a shrouded box header from one with ejector latches", () => {
    expect(read(line("HOUSE-0080", "CONN HEADER VERT 10POS 2.54MM SHROUDED"))).toEqual(["box-header", 20.32, 8.9, 9.1]);
    const latch = line("HOUSE-0081", "10 PIN FRC CONNECTOR WITH EJECTOR LATCHES")!;
    expect(latch).toMatchObject({ shape: "latch-header", pins: 10, pitch: 2.54 });
    expect(latch.length).toBeGreaterThan(30);
    expect(latch.height).toBeGreaterThan(12);
    expect(line("HOUSE-0082", "CONN HEADER IDC 16POS W/O LATCH")).toMatchObject({ shape: "box-header", pins: 16, length: 27.94 });
  });

  it("lays an HC-49 SMD crystal flat and sizes ceramic ones by their case", () => {
    expect(read(line("ECS-80-18-5PX-TR", "CRYSTAL 8MHZ 18PF SMD"))).toEqual(["hc49-smd", 11.4, 4.8, 4.3]);
    expect(read(line("ECS-80-18-5PLX-TR", ""))).toEqual(["hc49-smd", 11.4, 4.8, 3.2]);
    expect(read(line("ABLS-12.000MHZ-B2-T", ""))).toEqual(["hc49-smd", 11.4, 4.8, 4.3]);
    expect(read(line("HOUSE-0090", "CRYSTAL 16MHZ 18PF", "HC49/US"))).toEqual(["hc49", 11.05, 4.65, 3.5]);
    expect(line("ABM3-8.000MHZ-D2Y-T", "")).toMatchObject({ kind: "crystal", length: 5, width: 3.2, pins: 4 });
    expect(line("HOUSE-0091", "CRYSTAL 32.768KHZ 12.5PF SMD")).toMatchObject({ kind: "crystal", length: 3.2, width: 1.5, pins: 2 });
  });

  it("knows SMD diodes, and that an SMA jack is not one", () => {
    expect(read(line("B340A-13-F", "DIODE SCHOTTKY 40V 3A SMA"))).toEqual(["molded", 4.3, 2.6, 2.2]);
    expect(read(line("B340B-13-F", "DIODE SCHOTTKY 40V 3A SMB"))).toEqual(["molded", 4.3, 3.6, 2.3]);
    expect(read(line("HOUSE-0100", "", "DO-214AB"))).toEqual(["molded", 6.9, 5.9, 2.3]);
    expect(read(line("1N4148W-7-F", "DIODE GEN PURP 100V 300MA SOD123"))).toEqual(["molded", 2.7, 1.6, 1.1]);
    expect(read(line("HOUSE-0101", "DIODE SCHOTTKY 30V 1A SOD-323"))).toEqual(["molded", 1.7, 1.3, 0.95]);
    expect(line("HOUSE-0102", "CONN SMA JACK STR 50 OHM PCB")).toBeNull();
  });

  it("knows board-mount fuses and resettable fuses by their size", () => {
    expect(line("0451005.MRL", "FUSE BRD MNT 5A 125VAC/VDC SMD")).toMatchObject({ kind: "chip", shape: "fuse", length: 6.1, width: 2.69, height: 2.69 });
    expect(read(line("1206L050YR", "PTC RESET FUSE 6V 500MA 1206"))).toEqual(["fuse", 3.2, 1.6, 0.9]);
    expect(read(line("MF-MSMF110-2", ""))).toEqual(["fuse", 4.5, 3.2, 1.1]);
    expect(read(line("HOUSE-0110", "PTC 1.1A 16V POLYFUSE 1812"))).toEqual(["fuse", 4.5, 3.2, 1.1]);
    // The slow-blow series and the other ways a line says "board mount".
    expect(line("0452003.MRL", "FUSE BOARD MNT 3A 125VAC/VDC 2SMD")).toMatchObject({ shape: "fuse", length: 6.1 });
    expect(line("HOUSE-0111", "FUSE BOARD MNT 3A 125VAC/VDC 2SMD")).toMatchObject({ shape: "fuse", length: 6.1 });
    // A ten-digit connector order number that starts like a fuse series is not a fuse.
    expect(line("0449140601", "CONN HEADER 6POS 4.2MM VERT TIN")).toMatchObject({ shape: "minifit", pins: 6 });
    expect(line("0451005.MRL", "")!.color).not.toBe(line("1206L050YR", "")!.color);
  });

  it("gives QFPs their real body for the pin count", () => {
    const sides = Object.fromEntries([48, 64, 100, 144, 176].map((n) => [n, read(line("HOUSE-MCU", `IC MCU 32BIT 1MB FLASH ${n}LQFP`))]));
    expect(sides).toEqual({ 48: ["quad", 7, 7, 1.4], 64: ["quad", 10, 10, 1.4], 100: ["quad", 14, 14, 1.4], 144: ["quad", 20, 20, 1.4], 176: ["quad", 24, 24, 1.4] });
    expect(line("HOUSE-MCU", "IC MCU 32BIT 1MB FLASH 144LQFP")).toMatchObject({ pins: 144, pitch: 0.5 });
    expect(read(line("HOUSE-0120", "IC MCU 8BIT 32KB FLASH 44-TQFP (10X10)"))).toEqual(["quad", 10, 10, 1]);
    expect(read(line("HOUSE-0121", "", "LQFP-64_10x10mm_P0.5mm"))).toEqual(["quad", 10, 10, 1.4]);
    expect(line("STM32F407VGT6", "")).toMatchObject({ kind: "quad", pins: 100, length: 14 });
    expect(line("STM32F103C8T6", "")).toMatchObject({ kind: "quad", pins: 48, length: 7 });
  });

  it("sizes small-outline, leadless and DIP chips from the package and pin count", () => {
    expect(read(line("HOUSE-0130", "IC GATE DRVR LOW-SIDE 8-SOIC"))).toEqual(["gullwing", 4.9, 3.9, 1.5]);
    expect(read(line("HOUSE-0131", "", "SO8"))).toEqual(["gullwing", 4.9, 3.9, 1.5]);
    expect(read(line("HOUSE-0132", "", "SO-N8"))).toEqual(["gullwing", 4.9, 3.9, 1.5]);
    expect(read(line("HOUSE-0133", "IC DRIVER 20-SOIC"))).toEqual(["gullwing", 12.8, 7.5, 2.35]);
    expect(read(line("HOUSE-0134", "IC TRANSLATOR 16-TSSOP"))).toEqual(["gullwing", 5, 4.4, 1]);
    expect(line("HOUSE-0135", "IC TRNSLTR BIDIRECTIONAL 20TSSOP")).toMatchObject({ pins: 20, pitch: 0.65, length: 6.5 });
    expect(read(line("HOUSE-0136", "IC REG BUCK ADJ 3A 32-VFQFN (5X5)"))).toEqual(["leadless", 5, 5, 0.85]);
    expect(line("HOUSE-0137", "IC OPAMP GP 1 CIRCUIT SOT23-5")).toMatchObject({ kind: "gullwing", pins: 5, length: 2.9, width: 1.6 });
    expect(line("HOUSE-0138", "IC TIMER 8-DIP")).toMatchObject({ shape: "dip", pins: 8, length: 10.16 });
  });

  it("does not take a part's helper for the part", () => {
    // A transformer driver is a chip in its own package; a shunt and a fuse holder are not on the pads at all.
    expect(read(line("HOUSE-0150", "IC TRANSFORMER DRIVER PUSH-PULL SOT23-5"))).toEqual(["gullwing", 2.9, 1.6, 1.1]);
    expect(line("HOUSE-0151", "JUMPER SHUNT 2POS .100 GOLD")).toBeNull();
    expect(line("HOUSE-0152", "FUSE HOLDER CARTRIDGE 250V 10A SMD")).toBeNull();
    expect(line("HOUSE-0153", "CONN RCPT USB2.0 TYPE-C 24POS SMD R/A")).toBeNull();
    expect(line("0039281043", "")).toMatchObject({ shape: "minifit", pins: 4 });
  });

  it("does not read a chip maker's part number as a passive series", () => {
    // Texas Instruments "TPS…" regulators and switches are not AVX "TPS" tantalums.
    expect(line("TPS54331DR", "IC REG BUCK ADJ 3A 8SOIC")).toMatchObject({ kind: "gullwing", pins: 8 });
    expect(line("TPS7A4700RGWR", "IC REG LIN POS ADJ 1A 20VQFN")).toMatchObject({ kind: "leadless", pins: 20 });
    expect(line("TPS2041BDBVR", "IC PWR SWITCH N-CHAN 1:1 SOT23-5")).toMatchObject({ kind: "gullwing", pins: 5 });
    expect(line("TPS62130RGTR", "")).toBeNull();
    expect(read(line("TPSD107K016R0100", "CAP TANT 100UF 10% 16V 2917"))).toEqual(["tantalum", 7.3, 4.3, 2.8]);
    expect(read(line("TPSB106K016R0500", ""))).toEqual(["tantalum", 3.5, 2.8, 1.9]);
    // An onsemi transistor and a MEMS microphone share their first letters with Coilcraft and TDK inductors.
    expect(line("MSD1819A-RT1G", "TRANS NPN 50V 0.1A SC-70")).toMatchObject({ kind: "gullwing", pins: 3 });
    expect(line("MSD1819A-RT1G", "")).toBeNull();
    expect(line("SPM0408LE5H-TB", "MIC MEMS ANALOG OMNI -18DB")).toBeNull();
    expect(read(line("MSD1260-103MLD", ""))).toEqual(["power-inductor", 12.3, 12.3, 6.1]);
    expect(read(line("SPM6530T-2R2M", ""))).toEqual(["power-inductor", 6.5, 6.5, 3]);
    expect(read(line("SLF12575T-100M5R4-PF", ""))).toEqual(["power-inductor", 12.5, 12.5, 7.5]);
  });

  it("does not draw fine-pitch and cable connectors as a strip of pins", () => {
    // 40 contacts at 0.5 mm are a 24 mm flat-cable connector, not a 100 mm pin strip.
    expect(line("HOUSE-0160", "CONN RCPT 40POS 0.5MM FPC")).toBeNull();
    expect(line("HOUSE-0161", "CONN SOCKET 80POS 0.8MM BTB SMD")).toBeNull();
    expect(line("HOUSE-0162", "CONN D-SUB RCPT 9POS R/A SOLDER")).toBeNull();
    expect(line("HOUSE-0163", "CONN RCPT 30POS 0.4MM SMD GOLD")).toBeNull();
    expect(line("HOUSE-0164", "USB TYPE A HEADER 4POS")).toBeNull();
    expect(line("HOUSE-0165", "CONN HEADER USB A 4POS R/A")).toBeNull();
    for (const d of ["CONN RCPT 40POS 0.5MM FPC", "CONN SOCKET 80POS 0.8MM BTB SMD", "CONN FFC BOTTOM 24POS 1.00MM R/A"]) expect(line("HOUSE-0166", d)?.length ?? 0, d).toBeLessThan(60);
    // A real socket strip and a 1.27 mm header still read.
    expect(line("HOUSE-0167", "CONN RCPT 8POS 0.1 GOLD PCB HEADER SOCKET")).toMatchObject({ kind: "connector", pins: 8, length: 20.32 });
    expect(line("HOUSE-0168", "CONN HEADER VERT 20POS 1.27MM")).toMatchObject({ shape: "header", pitch: 1.27, length: 25.4 });
  });

  it("takes the case of a chip from the last size in the line, never from its value", () => {
    expect(read(line("HOUSE-0170", "CAP CER 2220PF 50V X7R 0603"))).toEqual(["chip", 1.6, 0.8, 0.8]);
    expect(read(line("HOUSE-0171", "RES 1206 OHM 1% 1/10W 0603"))).toEqual(["chip", 1.6, 0.8, 0.45]);
    expect(read(line("HOUSE-0172", "CAP CER 1210 0.1UF 50V X7R"))).toEqual(["chip", 3.2, 2.5, 1.6]);
  });

  it("reads the packages the first table missed", () => {
    expect(line("EP4CE6E22C8N", "IC FPGA 91 I/O 144EQFP")).toMatchObject({ kind: "quad", pins: 144, length: 20 });
    // Sixteen-pin SOIC: Texas Instruments' DW suffix is the 7.5 mm wide body.
    expect(read(line("ISO7741DWR", "DGTL ISO 5000VRMS 4CH GP 16SOIC"))).toEqual(["gullwing", 10.3, 7.5, 2.35]);
    expect(read(line("HOUSE-0173", "IC DRIVER 16SOIC"))).toEqual(["gullwing", 9.9, 3.9, 1.5]);
  });

  it("lays a header out as its drilled pads are, when the line does not say one row or two", () => {
    const strip = line("HOUSE-0174", "CONN HEADER VERT 12POS 2.54MM")!;
    expect(strip).toMatchObject({ shape: "header", pins: 12, length: 30.48, width: 2.54 });
    expect(headerOnCopper(strip, { label: "2×6 through-hole, 2.54 mm" })).toMatchObject({ shape: "header", pins: 12, length: 15.24, width: 5.08 });
    // Copper that is not a grid of as many pins, and bodies that are not pin strips, are left alone.
    expect(headerOnCopper(strip, { label: "2×5 through-hole, 2.54 mm" })).toBe(strip);
    expect(headerOnCopper(strip, { label: "1×12 through-hole, 2.54 mm" })).toBe(strip);
    expect(headerOnCopper(strip, { label: "12 through-hole pads, 2.54 mm" })).toBe(strip);
    expect(headerOnCopper(strip, null)).toBe(strip);
    const mini = line("39-28-1043", "")!;
    expect(headerOnCopper(mini, { label: "2×2 through-hole, 4.2 mm" })).toBe(mini);
    // TE's 146257 breakaway headers are two-row.
    expect(line("5-146257-8", "CONN HEADR BRKWAY .100 16POS STR")).toMatchObject({ pins: 16, length: 20.32, width: 5.08 });
  });

  it("says nothing when the line says nothing", () => {
    expect(line("", "")).toBeNull();
    expect(line("HOUSE-0140", "MOUNTING HOLE 4.5MM")).toBeNull();
    expect(bodyForLine({})).toBeNull();
  });
});

describe("the knowledge table", () => {
  it("is versioned, and every recogniser has a name, something to match and a source note", () => {
    expect(PART_BODIES_VERSION).toBeGreaterThanOrEqual(1);
    expect(new Set(PART_BODIES.map((r) => r.id)).size).toBe(PART_BODIES.length);
    for (const r of PART_BODIES) {
      expect(r.mpn ?? r.description ?? r.pkg, r.id).toBeInstanceOf(RegExp);
      expect(r.source.length, r.id).toBeGreaterThan(20);
    }
  });
});

/** A studio part straight from a body, the way the board view hands it over. */
const studioPart = (body: BodySpec, extra: Record<string, unknown> = {}) => ({
  ref: "X1",
  value: "",
  mpn: "",
  package: "",
  type: "other",
  x: 0,
  y: 0,
  rot: 0,
  side: "top",
  w: body.length,
  d: body.width,
  h: body.height,
  model: studioModel(body),
  pins: body.pins,
  pitch: body.pitch,
  color: body.color,
  ...extra,
});

/** One catalogue line for each new look, and how far its leads reach past the body along x and z (mm). */
const LOOKS: [string, BodySpec | null, [number, number]][] = [
  ["heatsink", line("513202B02500G", ""), [0, 0]],
  ["transformer", line("HOUSE-0049", "TRANSFORMER", "E55/28/21"), [0, 0]],
  ["ct", line("FIS112NL", ""), [0, 0]],
  ["smdcan", line("EEH-ZA1E101XP", "CAP ALUM POLY HYB 100UF 25V SMD"), [0, 0]],
  ["powerind", line("SRP1270-4R7M", ""), [0, 0]],
  ["minifit", line("39-28-1043", ""), [0, 0]],
  ["kk", line("22-23-2031", ""), [0, 0]],
  ["boxheader", line("HOUSE-0080", "CONN HEADER VERT 10POS 2.54MM SHROUDED"), [0, 0]],
  ["latchheader", line("HOUSE-0081", "10 PIN FRC CONNECTOR WITH EJECTOR LATCHES"), [0, 0]],
  ["pinheader", line("HOUSE-0071", "CONN HEADER VERT 20POS 2.54MM DUAL ROW"), [0, 0]],
  ["hc49smd", line("ECS-80-18-5PX-TR", ""), [0, 0]],
  ["fuse", line("0451005.MRL", ""), [0, 0]],
  ["to220v", line("IRF540NPBF", "MOSFET N-CH 100V 33A TO220AB"), [0, 0]],
  ["tantalum", line("T491B106K016AT", ""), [0, 0]],
  ["electrolytic", line("25ZLH470MEFC8X11.5", ""), [0, 0]],
  // Gull-wing leads reach 1 mm past a QFP or SOIC body on each leaded side; a SOT-223's and a DPAK's reach further.
  ["qfp", line("HOUSE-MCU", "IC MCU 32BIT 1MB FLASH 144LQFP"), [2, 2]],
  ["gull", line("HOUSE-0130", "IC GATE DRVR LOW-SIDE 8-SOIC"), [0, 2.1]],
  ["sot223", line("HOUSE-0041", "IC REG LINEAR 3.3V 1A SOT-223"), [0, 3.5]],
  ["dpak", line("HOUSE-0031", "MOSFET N-CH 60V 12A DPAK"), [0, 3.6]],
];

describe("the studio's models", () => {
  it("draws every named shape with its own model", () => {
    for (const [model, body] of LOOKS) {
      expect(body, model).not.toBeNull();
      expect(studioModel(body!), model).toBe(model);
      expect(modelKind(studioPart(body!)), model).toBe(model);
    }
    for (const model of Object.values(SHAPE_MODEL)) expect(modelKind({ model })).toBe(model);
  });

  it("still infers the model of a part that names none", () => {
    expect(modelKind({ type: "chip", package: "SOIC-8" })).toBe("ic");
    expect(modelKind({ type: "capacitor", body: "smd-electrolytic" })).toBe("smdcan");
    expect(modelKind({ type: "connector", package: "PinHeader_1x04" })).toBe("header");
    expect(modelKind({ type: "chip", package: "SOIC-8", model: "no-such-model" })).toBe("ic");
    // Shapes drawn elsewhere (a relay, a DIP) leave the choice to the studio.
    expect(studioModel({ kind: "gullwing", shape: "dip", length: 10, width: 6.4, height: 3.6, color: "#1f1f22", pins: 8, pitch: 2.54 })).toBeNull();
    expect(studioModel({ kind: "leadless", length: 5, width: 5, height: 0.85, color: "#1f1f22", pins: 32, pitch: 0.5 })).toBeNull();
  });

  const mat = (color: number, metalness = 0.1, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  /** Builds a part at a scene scale and seats it the way the board studio does: its centre half its height up. */
  const seated = (part: Record<string, unknown>, scale: number) => {
    const built = buildBody(THREE, part, scale, { mat, partPads: () => [] });
    built.mesh.position.y = built.h / 2;
    built.mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(built.mesh);
    let meshes = 0;
    built.mesh.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    return { built, minY: box.min.y / scale, size: box.getSize(new THREE.Vector3()).divideScalar(scale), meshes };
  };

  it("builds each one the size of its body, standing on the board, from a handful of meshes", () => {
    // Millimetres, and the scale of a 190 mm board in the studio.
    for (const scale of [1, 0.053]) {
      for (const [model, body, [reachX, reachZ]] of LOOKS) {
        const b = body!;
        const { built, minY, size, meshes } = seated(studioPart(b), scale);
        const label = `${model} at ${scale}`;
        expect(built.kind, label).toBe(model);
        expect(built.h / scale, label).toBeCloseTo(b.height, 5);
        expect(size.x, `${label} length`).toBeGreaterThanOrEqual(b.length * 0.85);
        expect(size.x, `${label} length`).toBeLessThanOrEqual(b.length * 1.15 + reachX);
        expect(size.z, `${label} width`).toBeGreaterThanOrEqual(b.width * 0.85);
        expect(size.z, `${label} width`).toBeLessThanOrEqual(b.width * 1.15 + reachZ);
        expect(size.y, `${label} height`).toBeGreaterThanOrEqual(b.height * 0.85);
        expect(size.y, `${label} height`).toBeLessThanOrEqual(b.height * 1.15);
        // Seated: nothing hangs below the board face (a chip's end caps wrap 1 % round the body).
        expect(Math.abs(minY), `${label} sits on the board`).toBeLessThan(Math.max(0.05, b.height * 0.03));
        expect(meshes, `${label} meshes`).toBeLessThanOrEqual(14);
      }
    }
  });

  /** Area of a geometry's triangles that face up (+y) and down, in the model's own units. */
  const facing = (g: THREE.BufferGeometry) => {
    const pos = g.attributes.position;
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    let [up, down] = [0, 0];
    const count = g.index ? g.index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const at = (k: number) => (g.index ? g.index.getX(i + k) : i + k);
      a.fromBufferAttribute(pos, at(0));
      b.fromBufferAttribute(pos, at(1));
      c.fromBufferAttribute(pos, at(2));
      const n = b.sub(a).cross(c.sub(a));
      if (n.y > 0.9 * n.length()) up += n.length() / 2;
      if (n.y < -0.9 * n.length()) down += n.length() / 2;
    }
    return { up, down };
  };

  it("closes every model on top and underneath: no body is an open shell", () => {
    // Extruded outlines (a comb heatsink, a ferrite frame, a rounded inductor, a crystal can) lose their end faces
    // in this three unless they are asked for; a box always has them.
    for (const [model, body] of LOOKS) {
      const b = body!;
      const { built } = seated(studioPart(b), 1);
      const { up, down } = facing(built.mesh.geometry as THREE.BufferGeometry);
      expect(up, `${model} top`).toBeGreaterThan(0.05 * b.length * b.width);
      expect(down, `${model} underside`).toBeGreaterThan(0.05 * b.length * b.width);
    }
    // The winding of a transformer is an extrusion along the board: its two ends are closed too.
    const t = seated(studioPart(LOOKS.find(([m]) => m === "transformer")![1]!), 1);
    const coil = t.built.mesh.children.map((c: THREE.Object3D) => (c as THREE.Mesh).geometry).find((g: THREE.BufferGeometry) => g.type === "ExtrudeGeometry")!;
    const ends = coil.groups.length ? coil.groups : [];
    expect(ends.length).toBe(2);
    expect(ends[0].count).toBeGreaterThan(0);
  });

  it("has the tab of a power package on the body's -y side, in the model and in the pads made for it", () => {
    // +z of a model is the near side of a part at 0 degrees: the app's -y.
    const tabOf = (model: string) => {
      const b = LOOKS.find(([m]) => m === model)![1]!;
      const { built } = seated(studioPart(b), 1);
      // The tab is the widest metal piece: the first child of the body mesh.
      const tab = built.mesh.children[0] as THREE.Mesh;
      const box = new THREE.Box3().setFromObject(tab);
      return (box.min.z + box.max.z) / 2;
    };
    expect(tabOf("dpak")).toBeGreaterThan(0);
    expect(tabOf("to220v")).toBeGreaterThan(0);
    const dpak = LOOKS.find(([m]) => m === "dpak")![1]!;
    const pads = padsFor(dpak);
    const tab = [...pads].sort((p, q) => q.w * q.h - p.w * p.h)[0];
    expect(tab.y).toBeLessThan(0);
    expect(pads.filter((p) => p !== tab).every((p) => p.y > 0)).toBe(true);
    // A flat-mounted power package with no shape keeps its pads as they were.
    const flat = padsFor({ kind: "power", length: 10, width: 9, height: 4.5, color: "#000", pins: 3, pitch: 2.54 });
    expect([...flat].sort((p, q) => q.w * q.h - p.w * p.h)[0].y).toBeGreaterThan(0);
  });

  it("gives a 144-pin QFP its leads as one mesh, and a heatsink its transistor only when asked", () => {
    const qfp = seated(studioPart(line("HOUSE-MCU", "IC MCU 32BIT 1MB FLASH 144LQFP")!), 1);
    // Body, leads, pin-1 dimple.
    expect(qfp.meshes).toBe(3);
    expect(qfp.size.x).toBeCloseTo(22, 1);
    const heatsink = line("513202B02500G", "")!;
    const bare = seated(studioPart(heatsink), 1);
    const fitted = seated(studioPart(heatsink, { device: true }), 1);
    expect(bare.meshes).toBe(1);
    expect(fitted.meshes).toBe(5);
    // The transistor stands in front of the flat, inside the heatsink's height.
    expect(fitted.size.z).toBeGreaterThan(bare.size.z + 3);
    expect(fitted.size.y).toBeCloseTo(bare.size.y, 5);
    // As a channel (power parts standing inside its depth) it is one mesh of the same size.
    const channel = seated(studioPart(heatsink, { channel: true }), 1);
    expect(channel.meshes).toBe(1);
    expect(channel.size.x).toBeCloseTo(bare.size.x, 5);
    expect(channel.size.z).toBeCloseTo(bare.size.z, 5);
    expect(channel.minY).toBeCloseTo(0, 5);
  });
});

describe("handing bodies to the studio", () => {
  const part = (refDes: string, body: BodySpec, x = 0, y = 0) => ({ refDes, x, y, rotation: 0, side: "TOP" as const, body, mpn: null, pkg: null, value: null, dnp: false });
  const board = (parts: ReturnType<typeof part>[]) =>
    toCircuitflowBoard({ revisionId: "r", title: "t", board: { width: 120, height: 90, layerCount: 2, maskColor: "green", silkColor: "white", finish: "ENIG" }, parts } as unknown as ViewerData).parts;

  it("names the model and passes the body's size, pins, pitch and colour", () => {
    const can = line("EEH-ZA1E101XP", "CAP ALUM POLY HYB 100UF 25V SMD")!;
    const [c] = board([part("C1", can)]);
    // The studio would size a 100 µF capacitor itself: the body we know wins.
    expect(c).toMatchObject({ model: "smdcan", w: 6.6, d: 6.6, h: 7.7, shape: "cyl" });
    const mini = line("39-28-1043", "")!;
    const [j] = board([part("J1", mini)]);
    expect(j).toMatchObject({ model: "minifit", pins: 4, pitch: 4.2, color: mini.color, leads: "tht" });
    // Four drilled lands: 4.2 mm along the row, the rows 5.5 mm apart.
    expect((j.pads as { x: number; y: number; hole: number }[]).map((p) => [p.x, p.y, p.hole > 0])).toEqual([
      [-2.1, 2.75, true],
      [2.1, 2.75, true],
      [-2.1, -2.75, true],
      [2.1, -2.75, true],
    ]);
    const [u] = board([part("U1", line("HOUSE-MCU", "IC MCU 32BIT 1MB FLASH 144LQFP")!)]);
    expect(u).toMatchObject({ model: "qfp", pins: 144, pitch: 0.5 });
    expect(u.leads).not.toBe("tht");
  });

  it("puts a two-row header's lands on its pin grid", () => {
    const [j] = board([part("J2", line("HOUSE-0072", "PIN HEADER 2X8 2.54MM")!)]);
    const pads = j.pads as { x: number; y: number }[];
    expect(pads).toHaveLength(16);
    expect(new Set(pads.map((p) => p.y)).size).toBe(2);
    expect(Math.max(...pads.map((p) => p.x)) - Math.min(...pads.map((p) => p.x))).toBeCloseTo(7 * 2.54, 5);
  });

  it("draws a transistor on a heatsink only when none is placed against it", () => {
    const heatsink = line("513202B02500G", "")!;
    const fet = line("IRF540NPBF", "MOSFET N-CH 100V 33A TO220AB")!;
    const alone = board([part("H1", heatsink, 0, 0), part("Q1", fet, 60, 0)]);
    expect(alone[0]).toMatchObject({ model: "heatsink", device: true });
    const fitted = board([part("H1", heatsink, 0, 0), part("Q1", fet, 0, 9)]);
    expect(fitted[0].device).toBeUndefined();
    expect(fitted[0].channel).toBeUndefined();
    expect(fitted[1]).toMatchObject({ model: "to220v", pins: 3 });
    // A transistor whose legs stand inside the heatsink's own depth: the heatsink is drawn as a channel round it.
    const inside = board([part("H1", heatsink, 0, 0), part("Q1", fet, 0, 3.8)]);
    expect(inside[0]).toMatchObject({ model: "heatsink", channel: true });
    expect(inside[0].device).toBeUndefined();
  });

  it("decides a heatsink's look once, for the board studio and the box-build view alike", () => {
    const heatsink = line("513202B02500G", "")!;
    const fet = line("IRF540NPBF", "MOSFET N-CH 100V 33A TO220AB")!;
    const looks = heatsinkLooks([part("H1", heatsink, 0, 0), part("Q1", fet, 0, 3.8), part("Q2", fet, 0, -3.8), part("H2", heatsink, 80, 0)]);
    expect(looks.get("H1")).toEqual({ channel: true });
    expect(looks.get("H2")).toEqual({ device: true });
    expect(looks.has("Q1")).toBe(false);
  });

  it("leaves a header that is not its own pin grid to the studio's header", () => {
    // A catalogue header with no package: 10 × 6 mm, two pins at 1.27 mm. Five posts across it would not be its pins.
    const generic = bodyFor(null, { category: "connector-header" });
    expect(generic).toMatchObject({ shape: "header", pins: 2 });
    expect(studioModel(generic)).toBeNull();
    const [j] = board([part("J9", generic)]);
    expect(j.model).toBeUndefined();
    expect((j.pads as unknown[]).length).toBe(2);
    expect(studioModel(line("HOUSE-0072", "PIN HEADER 2X8 2.54MM")!)).toBe("pinheader");
  });

  it("draws a catalogue package with the same model as the same package read from a line", () => {
    const sot = bodyFor({ family: "SOT", name: "SOT-223", lengthMm: 6.5, widthMm: 3.5, heightMm: 1.6, pinCount: 4, pitchMm: 2.3 });
    expect(studioModel(sot)).toBe("sot223");
    expect(studioModel(bodyFor({ family: "VCHIP", name: "SMD Can 6.3x7.7", lengthMm: 6.6, widthMm: 6.6, heightMm: 7.7 }))).toBe("smdcan");
    expect(studioModel(bodyFor({ family: "TO", name: "TO-263-3", lengthMm: 10.16, widthMm: 9.15, heightMm: 4.45, pinCount: 3 }))).toBe("dpak");
    expect(studioModel(bodyFor({ family: "TO", name: "TO-252 (DPAK)", lengthMm: 6.6, widthMm: 6.1, heightMm: 2.3, pinCount: 3 }))).toBe("dpak");
    // Other small outlines stay plain gull-wing packages.
    expect(bodyFor({ family: "SOT", name: "SOT-23", lengthMm: 2.9, widthMm: 1.3, heightMm: 1, pinCount: 3 }).shape).toBeUndefined();
  });

  it("counts the new through-hole shapes as through-hole", () => {
    for (const shape of ["heatsink", "transformer", "minifit", "kk-header", "box-header", "latch-header", "header", "to220"] as const) expect(THROUGH_HOLE_SHAPES.has(shape), shape).toBe(true);
    for (const shape of ["smdcan", "power-inductor", "hc49-smd", "sot223", "dpak", "fuse", "tantalum"] as const) expect(THROUGH_HOLE_SHAPES.has(shape), shape).toBe(false);
  });
});
