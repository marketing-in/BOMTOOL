import { describe, expect, it } from "vitest";
import { blockOf, reverseEngineer, type RePart, type ReverseInput } from "@/lib/reverse";

const part = (refDes: string, description: string | null, over: Partial<RePart> = {}): RePart => ({ refDes, mpn: null, manufacturer: null, description, value: null, kind: null, pkg: null, pins: 2, dnp: false, unit: null, lifecycle: "ACTIVE", alternates: 0, ...over });

const gateway: RePart[] = [
  part("U1", "Wi-Fi + BLE 5 module, dual-core 240 MHz", { mpn: "ESP32-S3-WROOM-1", manufacturer: "Espressif", pins: 41, unit: 265 }),
  part("U2", "10/100 Ethernet PHY, RMII", { mpn: "LAN8720A", pins: 24, lifecycle: "NRND", alternates: 1 }),
  part("U3", "3.3 V half-duplex RS-485 transceiver", { mpn: "MAX3485", pins: 8 }),
  part("U4", "Step-down buck regulator 4.5-28 V in, 3.3 V 2 A out", { mpn: "TPS54202", pins: 6 }),
  part("U5", "LDO linear regulator 1.8 V 300 mA", { mpn: "AP2112K-1.8", pins: 5 }),
  part("U6", "64 Mbit SPI NOR flash memory", { mpn: "W25Q64", pins: 8 }),
  part("Y1", "Crystal 25 MHz 3225", { mpn: "ABM8-25M", pins: 4 }),
  part("D1", "TVS diode 24 V", { mpn: "SMBJ24A" }),
  part("F1", "Resettable fuse 1 A", { mpn: "MF-MSMF110" }),
  part("D2", "LED green 0603", { mpn: "LTST-C191KGKT" }),
  part("J1", "RJ45 connector with magnetics", { mpn: "HR911105A", pins: 12 }),
  part("J2", "Terminal block 2 way 5.08 mm", { mpn: "1729128" }),
  part("R1", "RES 10k 1% 0603", { mpn: "RC0603FR-0710KL" }),
  part("R2", "RES 10k 1% 0603", { mpn: "RC0603FR-0710KL" }),
  part("C1", "CAP CER 100nF 50V X7R 0603", { mpn: "CL10B104KB8NNNC" }),
  part("R9", "RES 0R 0603", { mpn: "RC0603JR-070RL", dnp: true }),
];

const input = (parts: RePart[], over: Partial<ReverseInput> = {}): ReverseInput => ({
  parts,
  board: { widthMm: 100, heightMm: 80, layers: 4, source: "gerber", placed: true },
  joints: 312,
  sides: 1,
  finestPitchMm: 0.5,
  unmatched: 0,
  box: null,
  route: ["PCB fabrication", "Kitting", "Solder paste printing", "Pick and place", "Reflow soldering"],
  ...over,
});

describe("sorting parts into blocks", () => {
  it("goes by what the description says", () => {
    const want: Record<string, string> = { U1: "processing", U2: "wired", U3: "wired", U4: "power", U5: "power", U6: "memory", Y1: "timing", D1: "power-in", F1: "power-in", D2: "ui", J1: "connectors", J2: "connectors", R1: "passives", C1: "passives" };
    for (const p of gateway.filter((x) => want[x.refDes])) expect([p.refDes, blockOf(p)]).toEqual([p.refDes, want[p.refDes]]);
  });

  it("does not take a driver or a protection chip for the thing it serves", () => {
    expect(blockOf(part("U7", "ESD protection for USB connector"))).toBe("power-in");
    expect(blockOf(part("U8", "MOSFET gate driver, half bridge"))).toBe("drive");
    expect(blockOf(part("U9", "RS-485 transceiver with connector-side ESD"))).toBe("wired");
    expect(blockOf(part("R5", "Current-sense resistor 10 mΩ"))).toBe("sensing");
  });

  it("falls back to the designator when there is no description, and admits what it cannot tell", () => {
    expect(blockOf(part("J7", null))).toBe("connectors");
    expect(blockOf(part("C12", null))).toBe("passives");
    expect(blockOf(part("Q3", null))).toBe("drive");
    expect(blockOf(part("K1", null))).toBe("drive");
    expect(blockOf(part("U12", null, { mpn: "XYZ123" }))).toBe("unknown");
  });
});

describe("reading a whole product", () => {
  const r = reverseEngineer(input(gateway));

  it("names what the device most likely is, and why", () => {
    expect(r.identity.title).toBe("Wireless gateway or protocol bridge");
    expect(r.identity.confidence).toBe("high");
    expect(r.identity.why.join(" ")).toContain("ESP32-S3-WROOM-1 from Espressif");
    expect(r.identity.why.join(" ")).toContain("Power comes in by: Screw terminals.");
    expect(r.features.map((f) => f.key)).toEqual(expect.arrayContaining(["wifi", "ble", "ethernet", "rs485"]));
    expect(r.features.find((f) => f.key === "ethernet")!.refs).toEqual(["U2", "J1"]);
  });

  it("leaves do-not-populate parts out and groups the same part number together", () => {
    expect(r.counts).toMatchObject({ fitted: 15, dnp: 1, passive: 3 });
    const passives = r.blocks.find((b) => b.key === "passives")!;
    expect(passives.parts).toBe(3);
    expect(passives.items.find((i) => i.mpn === "RC0603FR-0710KL")!.refs).toEqual(["R1", "R2"]);
    expect(r.blocks.map((b) => b.key)).not.toContain("unknown");
  });

  it("reads the supply from the regulators and the connectors", () => {
    expect(r.rails).toEqual([
      { ref: "U4", mpn: "TPS54202", type: "Buck (step-down) converter", volts: [3.3, 4.5, 28] },
      { ref: "U5", mpn: "AP2112K-1.8", type: "LDO linear regulator", volts: [1.8] },
    ]);
    expect(r.powerInputs).toEqual(["Screw terminals"]);
  });

  it("lists the defining parts, biggest first, with their plan B", () => {
    expect(r.keyParts[0]).toMatchObject({ mpn: "ESP32-S3-WROOM-1", block: "Processing", pins: 41, alternates: 0 });
    expect(r.keyParts.map((p) => p.mpn)).not.toContain("RC0603FR-0710KL");
    expect(r.keyParts.find((p) => p.mpn === "LAN8720A")).toMatchObject({ lifecycle: "NRND", alternates: 1 });
  });

  it("says what a rebuild still needs", () => {
    const keys = r.findings.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["netlist", "firmware", "board", "lifecycle", "sole", "box"]));
    expect(r.findings.find((f) => f.key === "firmware")).toMatchObject({ level: "red" });
    expect(r.findings.find((f) => f.key === "firmware")!.detail).toContain("U1, U6");
    expect(r.findings.find((f) => f.key === "board")!.level).toBe("green");
    expect(r.findings.find((f) => f.key === "lifecycle")!.detail).toContain("LAN8720A");
    expect(r.build.summary).toContain("312 solder joints");
  });

  it("is blunter when the data is thin", () => {
    const thin = reverseEngineer(input([part("U1", null, { mpn: "ABC1" }), part("U2", null, { mpn: "ABC2" }), part("R1", null)], { board: { widthMm: 50, heightMm: 40, layers: 2, source: "spec", placed: false }, unmatched: 2 }));
    expect(thin.identity.confidence).toBe("low");
    expect(thin.findings.find((f) => f.key === "board")).toMatchObject({ level: "red", title: "No Gerbers" });
    expect(thin.findings.map((f) => f.key)).toEqual(expect.arrayContaining(["placement", "unmatched", "unknown"]));
    expect(reverseEngineer(input([])).identity.title).toBe("Nothing to analyse yet");
  });

  it("does not pretend to know a board whose parts were only guessed from the Gerbers", () => {
    const guess = (ref: string) => part(ref, null, { guessed: true });
    const board = [...["P1", "P2", "P3", "Q1", "Y1", "U1"].map(guess), part("R1", "RES 10k 0603", { mpn: "RC0603" })];
    expect(blockOf(guess("P1"))).toBe("unknown");
    expect(blockOf(guess("Q1"))).toBe("unknown");
    const r = reverseEngineer(input(board));
    expect(r.identity.title).toBe("Not enough to tell yet");
    expect(r.identity.confidence).toBe("low");
    expect(r.identity.summary).toBe("7 footprints on the board, 1 part identified so far.");
    expect(r.counts).toMatchObject({ guessed: 6, active: 0, recognised: 1 });
    expect(r.blocks.map((b) => b.key)).toEqual(["passives", "unknown"]);
    expect(r.findings.find((f) => f.key === "guessed")).toMatchObject({ level: "red", title: "Parts not chosen yet" });
    expect(r.findings.some((f) => f.key === "unknown")).toBe(false);
    expect(r.keyParts).toEqual([]);
    // A few guessed footprints on an otherwise known board lower the confidence but not the verdict.
    const mixed = reverseEngineer(input([...gateway, ...["P1", "P2", "P3", "P4", "P5"].map(guess)]));
    expect(mixed.identity.title).toBe("Wireless gateway or protocol bridge");
    expect(mixed.identity.confidence).toBe("low");
  });

  it("tells other kinds of product apart", () => {
    const title = (ps: RePart[]) => reverseEngineer(input(ps)).identity.title;
    expect(title([part("U1", "LDO linear regulator 5 V"), part("D1", "Schottky diode"), part("C1", "CAP 10uF")])).toBe("Power supply or power conversion board");
    expect(title([part("U1", "ARM Cortex-M0 microcontroller"), part("K1", "Relay 5 V SPDT"), part("K2", "Relay 5 V SPDT")])).toBe("Relay / I/O controller");
    expect(title([part("U1", "ARM Cortex-M4 MCU"), part("U2", "Three-phase gate driver"), ...[1, 2, 3, 4, 5, 6].map((i) => part(`Q${i}`, "N-channel MOSFET 60 V"))])).toBe("Motor drive or power stage");
    expect(title([part("U1", "BLE SoC microcontroller"), part("U2", "Temperature and humidity sensor")])).toBe("Wireless sensor node");
    // A radio module with no part number we know still counts as the brain.
    expect(title([part("U1", "LoRa module with integrated SoC"), part("U2", "RS-485 transceiver")])).toBe("Wireless gateway or protocol bridge");
    expect(title(Array.from({ length: 8 }, (_, i) => part(`D${i + 1}`, "LED white 3030")))).toBe("LED lighting board or driver");
  });
});
