import { describe, expect, it } from "vitest";
import { partFacts } from "@/lib/board/part-facts";

const facts = (description: string, extra: { mpn?: string; pkg?: string; refDes?: string } = {}) => {
  const f = partFacts({ description, ...extra });
  return f ? { kind: f.kind, ...Object.fromEntries(f.facts.map((x) => [x.label, x.value])) } : null;
};

describe("a part's data sheet from its BoM line", () => {
  it("reads capacitors: ceramic and aluminium", () => {
    expect(facts("CAP CER 0.22UF 25V 20% X7R 0603")).toMatchObject({ kind: "Ceramic capacitor (MLCC)", Capacitance: "220 nF", "Rated voltage": "25 V", Tolerance: "±20 %", Dielectric: "X7R", Package: "0603" });
    expect(facts("CAP CER 4700PF 100V 2% NP0 1206")).toMatchObject({ Capacitance: "4.7 nF", Dielectric: "C0G" });
    expect(facts("CAP ALUM 150UF 16V 20% SMD", { pkg: "CAN 6.3 SMD" })).toMatchObject({ kind: "Aluminium electrolytic capacitor", Capacitance: "150 µF", "Rated voltage": "16 V", Polarised: "Yes", Mounting: "Surface mount", Package: "CAN 6.3 SMD" });
  });

  it("reads resistors, and calls a milliohm one a current-sense resistor", () => {
    expect(facts("RES 47.5K OHM 1/10W 1% 0603 SMD")).toMatchObject({ kind: "Resistor", Resistance: "47.5 kΩ", Power: "100 mW", Tolerance: "±1 %", Package: "0603" });
    expect(facts("RES 0.005 OHM 2W 1% 2010 SMD")).toMatchObject({ kind: "Current-sense resistor", Resistance: "5 mΩ", Power: "2 W" });
  });

  it("reads inductors and transformers", () => {
    expect(facts("INDUCTOR 4.7UH 9A SMD")).toMatchObject({ kind: "Power inductor", Inductance: "4.7 µH", "Rated current": "9 A" });
    expect(facts("INDUCTOR SHIELD PWR 33UH SMD")).toMatchObject({ kind: "Shielded power inductor", Inductance: "33 µH", Shielded: "Yes" });
    expect(facts("XFRMR CURR SENSE 10A 1:50 T/H")).toMatchObject({ kind: "Current-sense transformer", "Turns ratio": "1 : 50", "Primary current": "10 A", Mounting: "Through hole" });
    expect(facts("Transformer with 2 taps", { pkg: "ETD34" })).toMatchObject({ kind: "Transformer", Taps: "2", Core: "ETD34" });
  });

  it("reads semiconductors", () => {
    expect(facts("DIODE SCHOTTKY 60V 8A TO220AC")).toMatchObject({ kind: "Schottky diode", "Reverse voltage": "60 V", "Forward current": "8 A", Package: "TO-220AC" });
    expect(facts("MOSFET P-CH 30V 12A TO-220")).toMatchObject({ kind: "P-channel MOSFET", "Drain-source voltage": "30 V", "Drain current": "12 A" });
    expect(facts("IC MCU ARM 512KB FLASH 100LQFP")).toMatchObject({ kind: "Microcontroller", Flash: "512 KB", Core: "ARM", Package: "LQFP-100" });
    expect(facts("IC SW REG 5V 2A STP DN 8-SOIC")).toMatchObject({ kind: "Step-down switching regulator", "Output voltage": "5 V", "Output current": "2 A", Package: "SOIC-8" });
    expect(facts("IC REG LDO ADJ 500MA SOT223")).toMatchObject({ kind: "Linear regulator (LDO)", "Output voltage": "Adjustable", Package: "SOT-223" });
    expect(facts("IC MOSFET DRVR DUAL LS 2A 8-SOIC")).toMatchObject({ kind: "MOSFET gate driver", "Drive current": "2 A", Channels: "Dual" });
  });

  it("does not take an ESD rating for a supply voltage", () => {
    const f = facts("IC 4-BIT TRNSLTR 8KV ESD 14TSSOP");
    expect(f).toMatchObject({ kind: "Level shifter", "ESD protection": "8 kV", Package: "TSSOP-14" });
    expect(f).not.toHaveProperty("Voltage");
  });

  it("reads connectors, crystals, fuses and heatsinks", () => {
    expect(facts('CONN HEADER 16POS BRKWAY .100"')).toMatchObject({ kind: "Pin header", Positions: "16", Pitch: "2.54 mm (.100 in)" });
    expect(facts("CONN HEADER 6POS 4.2MM VERT TIN")).toMatchObject({ kind: "Power header", Positions: "6", Pitch: "4.2 mm", Orientation: "Vertical", "Contact finish": "Tin" });
    expect(facts("14 pin IDC header, ejector latch")).toMatchObject({ kind: "Shrouded header", Positions: "14", Latches: "Yes" });
    expect(facts("CRYSTAL 16MHZ 20PF SMD")).toMatchObject({ kind: "Crystal", Frequency: "16 MHz", "Load capacitance": "20 pF" });
    expect(facts("FUSE BOARD MOUNT 3.15A 250VAC SMD")).toMatchObject({ kind: "Fuse", "Rated current": "3.15 A", "Rated voltage": "250 V" });
    expect(facts("PTC 1.1A 16V POLYFUSE 1206")).toMatchObject({ kind: "Resettable fuse (PTC)", "Hold current": "1.1 A", Package: "1206" });
    expect(facts('HEAT SINK TO-220 SOLDER PINS 2" HIGH', { pkg: "EXTRUDED, BOARD MOUNT" })).toMatchObject({ kind: "Heatsink", "For package": "TO-220", Height: "50.8 mm (2 in)", Fixing: "Solder pins", Package: "EXTRUDED, BOARD MOUNT" });
  });

  it("says nothing when the text says nothing", () => {
    expect(partFacts({ description: "Two-pad part · 0805" })).toBeNull();
    expect(partFacts({})).toBeNull();
  });
});
