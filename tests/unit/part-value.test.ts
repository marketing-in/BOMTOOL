import { describe, expect, it } from "vitest";
import { formatValue, isNoValue, looksLikePartName, milliMegaSlip, readReading, readValue, sameValue, samePartName, valueKindOf, type Quantity } from "@/lib/board/part-value";

const field = (t: string, q: Quantity) => readValue(t, q, "field");
const desc = (t: string, q: Quantity) => readValue(t, q, "description");
const close = (a: number | null, b: number) => a !== null && sameValue(a, b);

describe("what a designator's value measures", () => {
  it("goes by the designator's letters", () => {
    expect(valueKindOf("C5")).toBe("capacitance");
    expect(valueKindOf("R12")).toBe("resistance");
    expect(valueKindOf("L4")).toBe("inductance");
    expect(valueKindOf("Y1")).toBe("frequency");
    expect(valueKindOf("X2")).toBe("frequency");
    expect(valueKindOf("XTAL1")).toBe("frequency");
    expect(valueKindOf("F1")).toBe("current");
    expect(valueKindOf("FB2")).toBe("impedance");
    expect(valueKindOf("U1")).toBe("part");
    expect(valueKindOf("Q3")).toBe("part");
    expect(valueKindOf("J1")).toBeNull();
    expect(valueKindOf("TP4")).toBeNull();
  });

  it("takes X as a crystal only when the BoM line says crystal, oscillator or hertz (X is a connector under IEC 81346)", () => {
    expect(valueKindOf("X1", "CRYSTAL 16MHz 18pF")).toBe("frequency");
    expect(valueKindOf("X1", "OSC 25.000 MHZ 3.3V")).toBe("frequency");
    expect(valueKindOf("X1", "CONNECTOR 4 POS 2.5M CABLE")).toBeNull();
    expect(valueKindOf("Y1", "CONNECTOR")).toBe("frequency");
  });
});

describe("reading values in every common notation", () => {
  it("capacitance: 100nF = 0.1µF = 0.1uF = 100n = 0u1; 1n5 = 1.5nF", () => {
    for (const t of ["100nF", "0.1µF", "0.1μF", "0.1uF", "100n", "0u1", "100NF", "0.1UF", ".1uF", "100 nF"]) expect(close(field(t, "capacitance"), 1e-7), t).toBe(true);
    for (const t of ["1n5", "1.5nF", "1500pF", "1.5n"]) expect(close(field(t, "capacitance"), 1.5e-9), t).toBe(true);
    expect(close(field("8.2pF", "capacitance"), 8.2e-12)).toBe(true);
    expect(close(field("2p2", "capacitance"), 2.2e-12)).toBe(true);
  });

  it("does not guess at an ambiguous capacitor code", () => {
    expect(field("104", "capacitance")).toBeNull();
    expect(field("100", "capacitance")).toBeNull();
    expect(field("1MF", "capacitance")).toBeNull();
  });

  it("resistance: 4K7 = 4.7k = 4700 = 4.7 kOhm; 10R = 10Ω = 10E; 2R2; 0R; 1M", () => {
    for (const t of ["4K7", "4k7", "4.7k", "4.7K", "4700", "4.7kΩ", "4.7 kOhm", "4K7Ω"]) expect(close(field(t, "resistance"), 4700), t).toBe(true);
    for (const t of ["10R", "10Ω", "10E", "10 ohm", "10"]) expect(close(field(t, "resistance"), 10), t).toBe(true);
    expect(close(field("2R2", "resistance"), 2.2)).toBe(true);
    expect(close(field("0R1", "resistance"), 0.1)).toBe(true);
    expect(field("0R", "resistance")).toBe(0);
    expect(close(field("1M", "resistance"), 1e6)).toBe(true);
    expect(close(field("10m", "resistance"), 0.01)).toBe(true);
    for (const t of ["1MEG", "1Meg", "1 MEGOHM", "1M OHM", "1 MOhm", "1MΩ"]) expect(close(field(t, "resistance"), 1e6), t).toBe(true);
    for (const t of ["10 mOhm", "10mΩ", "R010"]) expect(close(field(t, "resistance"), 0.01), t).toBe(true);
  });

  it("leaves upper-case MOHM unread: milliohm in some catalogues, megaohm in others", () => {
    expect(desc("RES 10 MOHM 1% 1/2W 1206", "resistance")).toBeNull();
    expect(field("1MOHM", "resistance")).toBeNull();
    // 10 mΩ against 10 MΩ is a slip of the prefix; 10 mΩ against 4.7 kΩ is another part.
    expect(milliMegaSlip(10e-3, 10e6)).toBe(true);
    expect(milliMegaSlip(10e-3, 4700)).toBe(false);
  });

  it("takes a 3- or 4-digit resistor code as either the number or the EIA code, never a size", () => {
    expect(readReading("103", "resistance", "field")).toMatchObject({ v: 103, alts: [10000] });
    expect(readReading("4701", "resistance", "field")).toMatchObject({ v: 4701, alts: [4700] });
    // Ending in 0: plain only ("100" is 100 Ω, "4700" is 4.7 kΩ).
    expect(readReading("100", "resistance", "field")).toMatchObject({ v: 100, alts: [] });
    expect(readReading("4700", "resistance", "field")).toMatchObject({ v: 4700, alts: [] });
    for (const t of ["0603", "1608", "1005", "3216"]) expect(field(t, "resistance"), t).toBeNull();
  });

  it("inductance: 47nH = 0.047uH = 47n; 7.2MH is millihenries; 2R2 is 2.2 µH", () => {
    for (const t of ["47nH", "0.047uH", "0.047µH", "47n", "47NH"]) expect(close(field(t, "inductance"), 47e-9), t).toBe(true);
    expect(close(field("7.2MH", "inductance"), 7.2e-3)).toBe(true);
    expect(close(field("1.08mH", "inductance"), 1.08e-3)).toBe(true);
    expect(close(field("4u7", "inductance"), 4.7e-6)).toBe(true);
    expect(close(field("2R2", "inductance"), 2.2e-6)).toBe(true);
  });

  it("frequency: 24MHz = 24 MHZ = 24M; 32.768kHz = 32K768", () => {
    for (const t of ["24MHz", "24 MHZ", "24MHZ", "24M", "24.000MHz", "24mhz"]) expect(close(field(t, "frequency"), 24e6), t).toBe(true);
    for (const t of ["32.768kHz", "32.768 KHZ", "32K768", "32.768K"]) expect(close(field(t, "frequency"), 32768), t).toBe(true);
    expect(field("24", "frequency")).toBeNull();
  });

  it("current and impedance", () => {
    expect(close(field("500mA", "current"), 0.5)).toBe(true);
    expect(close(field("0.5A", "current"), 0.5)).toBe(true);
    expect(close(field("500MA", "current"), 0.5)).toBe(true);
    expect(close(field("220R@100MHz", "impedance"), 220)).toBe(true);
    expect(close(field("600Ω", "impedance"), 600)).toBe(true);
    expect(close(field("120", "impedance"), 120)).toBe(true);
    expect(desc("FERRITE 120 1A", "impedance")).toBeNull();
  });

  it("splits a value from a voltage or size joined with - or _", () => {
    expect(close(field("22uF-10V", "capacitance"), 22e-6)).toBe(true);
    expect(close(field("1µF_0402", "capacitance"), 1e-6)).toBe(true);
    expect(close(field("100nF_0402", "capacitance"), 1e-7)).toBe(true);
  });

  it("formats the way people write them", () => {
    expect(formatValue(1.5e-9, "capacitance")).toBe("1.5 nF");
    expect(formatValue(220e-12, "capacitance")).toBe("220 pF");
    expect(formatValue(7.2e-3, "inductance")).toBe("7.2 mH");
    expect(formatValue(24e6, "frequency")).toBe("24 MHz");
    expect(formatValue(32768, "frequency")).toBe("32.768 kHz");
    expect(formatValue(4700, "resistance")).toBe("4.7 kΩ");
  });
});

describe("picking the designator's number out of a description", () => {
  it("takes the value, not the voltage, current, tolerance, temperature or size", () => {
    expect(close(desc("CAP 220PF 50V 5%", "capacitance"), 220e-12)).toBe(true);
    expect(close(desc("CAP CER 220PF, 50V, 5%, C0G/NP0, 0402", "capacitance"), 220e-12)).toBe(true);
    expect(close(desc("CAPA,0.1MICROF,50V,SMD-0402,X7R,CER,VISHAY/KEMET", "capacitance"), 1e-7)).toBe(true);
    expect(close(desc("CAP CER,1µF, 16V, SMD,10%,X5R, 0402", "capacitance"), 1e-6)).toBe(true);
    expect(close(desc("CAP CER 22PF ±0.25PF 50V NP0", "capacitance"), 22e-12)).toBe(true);
    expect(close(desc("INDUCTOR 47nH 300mA", "inductance"), 47e-9)).toBe(true);
    expect(close(desc("INDUCTOR, 56nH, 2500mA, 0402, SMD, MPN. : LQG15HS56NJ02D", "inductance"), 56e-9)).toBe(true);
    expect(close(desc("FIXED INDUCTOR - 7.2MH 3% TRANSPNDR COIL - AEC-Q200", "inductance"), 7.2e-3)).toBe(true);
    expect(close(desc("CRYSTAL, 10PF, 24 MHZ, 15 PPM, SMD", "frequency"), 24e6)).toBe(true);
    expect(close(desc("XTAL 16MHz 18pF", "frequency"), 16e6)).toBe(true);
    expect(close(desc("RES 10k 1% 0603", "resistance"), 1e4)).toBe(true);
    expect(close(desc("RES 4.7 KOHM 1% 1/10W 0603", "resistance"), 4700)).toBe(true);
    expect(close(desc("FUSE 2A 250V 0603 FAST", "current"), 2)).toBe(true);
    expect(close(desc("Ferrite 220R@100MHz 1.4A 0603", "impedance"), 220)).toBe(true);
    expect(close(desc("FERRITE BEAD 600 OHM @ 100MHz DCR 0.15 OHM", "impedance"), 600)).toBe(true);
  });

  it("does not take a spaced voltage, power, tolerance, temperature or ppm as a resistor's value", () => {
    const cases: [string, number][] = [
      ["RES SMD 0603 1/10 W 1 % 10K", 1e4],
      ["RES, 0402, 5 %, 22R", 22],
      ["RES 50 V 10K 0603", 1e4],
      ["RES 2 W 10 OHM 5%", 10],
      ["RESISTOR 0.063 W 1K 0402", 1e3],
      ["RES -55 TO 155 C 10K", 1e4],
      ["RES 100 PPM 10K 0603", 1e4],
      ["RES 200 mW 10K", 1e4],
      ["RES 0402 50 V 10K", 1e4],
      ["RES 1% 0.1 W 4K7", 4700],
      ["RESISTOR 1206 1 WATT 0R1", 0.1],
      ["RES 125 °C 10K", 1e4],
      ["RES 100 1% 0603", 100],
    ];
    for (const [t, v] of cases) expect(close(desc(t, "resistance"), v), t).toBe(true);
    // A value cell with only a tolerance or a size says nothing.
    expect(field("1 %", "resistance")).toBeNull();
    expect(field("1005", "resistance")).toBeNull();
  });

  it("prefers a word with its full unit over a prefix alone, and passes over ESR and DCR", () => {
    expect(close(desc("CRYSTAL 80K ESR 32.768kHz", "frequency"), 32768)).toBe(true);
    expect(close(desc("XTAL 16MHz ESR 40", "frequency"), 16e6)).toBe(true);
    expect(close(desc("FERRITE BEAD 0.15 OHM DCR 600 OHM", "impedance"), 600)).toBe(true);
    expect(close(desc("INDUCTOR 2.5m 47nH", "inductance"), 47e-9)).toBe(true);
    expect(close(desc("CAP 10pF TOL 0.25pF", "capacitance"), 10e-12)).toBe(true);
  });

  it("gives a resettable fuse's hold and trip currents", () => {
    const r = readReading("PTC RESETTABLE 0.5A HOLD 1A TRIP 6V", "current");
    expect(r).toMatchObject({ v: 0.5, alts: [1] });
  });

  it("reads nothing when the description has no such number", () => {
    expect(desc("CAP CER 50V X7R 0402 10%", "capacitance")).toBeNull();
    expect(desc("RES SMD 0603 50V 1/10W 1%", "resistance")).toBeNull();
    expect(desc("CRYSTAL, 10PF, SMD", "frequency")).toBeNull();
    expect(desc("INDUCTOR 300mA 0402", "inductance")).toBeNull();
    expect(desc("TPMS SENSOR IC, 100 – 900 KPA", "resistance")).toBeNull();
    // A part number inside the text is not a value: RC0603FR-0710KL is not 10 kΩ by itself.
    expect(desc("RC0603FR-0710KL", "resistance")).toBeNull();
  });

  it("knows the board's ways of saying nothing is fitted", () => {
    for (const t of ["DNP", "NC", "n/c", "TBD", "DNL", "", "  ", "-", "Not fitted"]) expect(isNoValue(t), t).toBe(true);
    expect(isNoValue("100nF")).toBe(false);
    expect(field("DNP", "capacitance")).toBeNull();
  });
});

describe("part names", () => {
  it("tells a part number from a value, a package or a library name", () => {
    for (const t of ["SNP739", "LM358", "1N4148", "BC847", "ESP32-S3", "STM32G431"]) expect(looksLikePartName(t), t).toBe(true);
    for (const t of ["100nF", "4K7", "LGA24", "SOT-23", "QFN48", "LDO_3V3", "BAT 3V", "MCU", "DNP", "U1"]) expect(looksLikePartName(t), t).toBe(false);
  });

  it("takes one inside the other as the same part, ignoring punctuation", () => {
    expect(samePartName("SNP739", ["SNP739D01CLE"])).toBe(true);
    expect(samePartName("STM32G431CBU6TR", ["STM32G431CBU6"])).toBe(true);
    expect(samePartName("74HC595", ["SN74HC595DR"])).toBe(true);
    expect(samePartName("AMS1117-3.3", ["AMS1117 3.3"])).toBe(true);
    expect(samePartName("LM358", ["NE555DR"])).toBe(false);
    expect(samePartName("LM358", ["X / LM358DR"])).toBe(true);
    // Found in the description when the part number column is something else.
    expect(samePartName("SNP739", ["70-030-1423"], ["TPMS SENSOR IC (MPN : SNP739D01CLE)"])).toBe(true);
    expect(samePartName("SNP739", [null])).toBeNull();
  });

  it("reads the CAD conventions: a lower-case x for any character, reel letters, and pieces in order", () => {
    expect(samePartName("STM32F103C8Tx", ["STM32F103C8T6"])).toBe(true);
    expect(samePartName("STM32G431CBUx", ["STM32G431CBU6TR"])).toBe(true);
    expect(samePartName("TLV70033DDCR", ["TLV70033DDCT"])).toBe(true);
    expect(samePartName("LM1117-3.3", ["LM1117IMPX-3.3/NOPB"])).toBe(true);
    expect(samePartName("LM1117-3.3", ["LM1117IMPX-ADJ/NOPB"])).toBe(false);
    expect(samePartName("AMS1117-3.3", ["AMS1117-5.0"])).toBe(false);
    expect(samePartName("STM32F103CBT6", ["STM32F103C8T6"])).toBe(false);
    expect(samePartName("STM32F103C8", ["STM32F103CBT6"])).toBe(false);
    expect(samePartName("ESP32-S3", ["ESP32-C3-MINI-1"])).toBe(false);
  });
});
