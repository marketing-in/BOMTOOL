/**
 * What a BoM line says about its part, as a short data sheet: the kind of part in plain words and its key figures
 * (a capacitor's value, voltage and dielectric; an inductor's inductance and current; a transformer's ratio and core;
 * a connector's positions and pitch …). Read from the line's own description, part number and package, so it works
 * for a part the catalogue has never seen. Pure; only says what the text supports.
 */
import { parseDescription } from "@/lib/bom/describe";
import { decodeMpn, formatSi } from "@/lib/bom/mpn-decode";

export type PartFact = { label: string; value: string };
export type PartFacts = { kind: string; facts: PartFact[] };

export type FactsIn = { refDes?: string | null; mpn?: string | null; description?: string | null; pkg?: string | null; value?: string | null };

const num = (s: string) => Number(s.replace(/,/g, ""));
const trim = (n: number) => String(Number(n.toPrecision(4)));

/** The first match of a figure with its unit, outside part-number-like runs: "35V", "22 A", "10MHZ". */
function figure(text: string, unit: RegExp): { n: number; prefix: string } | null {
  const m = text.match(new RegExp(String.raw`(?<![\w.\/-])(\d+(?:\.\d+)?)\s*([pnuµmkKM]?)\s*(?:${unit.source})(?![\w])`, "i"));
  return m ? { n: num(m[1]), prefix: m[2] } : null;
}
const SCALE: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, "": 1, k: 1e3, M: 1e6 };
/**
 * BoM text is often all capitals, so the prefix's case says nothing: "18PF" is picofarads, "15KV" kilovolts. An "M"
 * is mega only where that makes sense ("10MHZ"); "5MA" is milliamps.
 */
const scaled = (f: { n: number; prefix: string }, megaOk: boolean) => f.n * (SCALE[/^m$/i.test(f.prefix) ? (megaOk ? "M" : "m") : f.prefix.toLowerCase()] ?? 1);

const volts = (t: string) => {
  const f = figure(t, /V(?:DC|AC)?/);
  return f ? formatSi(scaled(f, false), "V") : null;
};
const amps = (t: string) => {
  const f = figure(t, /A(?:MPS?)?/);
  return f ? formatSi(scaled(f, false), "A") : null;
};

/** A package the description names ("8-SOIC", "144LQFP", "TO-220AB", "SOT223", "SOD323", "SMB"). */
function namedPackage(t: string): string | null {
  const lead = t.match(/\b(\d{1,3})-?\s?(LQFP|TQFP|QFP|QFN|DFN|TSSOP|SSOP|MSOP|SOIC|SOP|BGA|DIP)\b/i);
  if (lead) return `${lead[2].toUpperCase()}-${lead[1]}`;
  const tail = t.match(/\b(LQFP|TQFP|QFP|QFN|DFN|TSSOP|SSOP|MSOP|SOIC|SOP|BGA|DIP)-?\s?(\d{1,3})\b/i);
  if (tail) return `${tail[1].toUpperCase()}-${tail[2]}`;
  const named = t.match(/\b(TO-?\d{2,3}[A-Z]{0,2}(?:-\d)?|SOT-?\d{2,3}(?:-\d)?|SOD-?\d{3}|D2?PAK|SM[ABC]|DO-?\d{2,3}-?[A-Z]{0,2})\b/i);
  if (named) return named[1].toUpperCase().replace(/^(TO|SOT|SOD|DO)(\d)/, "$1-$2");
  return null;
}

const push = (facts: PartFact[], label: string, value: string | null | undefined) => {
  if (value && !facts.some((f) => f.label === label)) facts.push({ label, value });
};

const IC_FUNCTIONS: [RegExp, string][] = [
  [/\bMCU\b|MICROCONTROLLER/i, "Microcontroller"],
  [/\bDSP\b/i, "Digital signal processor"],
  [/\bFPGA\b|\bCPLD\b/i, "Programmable logic"],
  [/LEVEL\s*SHIFT|TRNSLTR|TRNSTR|TRANSLAT/i, "Level shifter"],
  [/(?:MOSFET|GATE)\s*DR(?:I)?V(?:E)?R/i, "MOSFET gate driver"],
  [/\bLDO\b/i, "Linear regulator (LDO)"],
  [/SW(?:ITCHING)?\s*REG|STP\s*DN|STEP[- ]?DOWN|\bBUCK\b/i, "Step-down switching regulator"],
  [/STEP[- ]?UP|\bBOOST\b/i, "Step-up switching regulator"],
  [/REG(?:ULATOR)?\b.*\bPOS|\bREGULATOR\b|\bREG\b/i, "Voltage regulator"],
  [/OP\s?AMP|\bAMP\b|AMPLIFIER/i, "Amplifier"],
  [/COMPARATOR/i, "Comparator"],
  [/\bADC\b/i, "Analogue-to-digital converter"],
  [/\bDAC\b/i, "Digital-to-analogue converter"],
  [/EEPROM|\bFLASH\b|\bSRAM\b|MEMORY/i, "Memory"],
  [/TRANSCEIVER|\bXCVR\b|RS-?485|RS-?232|\bCAN\b/i, "Transceiver"],
  [/OPTO|ISOLATOR/i, "Isolator"],
];

/** The part's kind and figures, or null when the line says nothing we can read. */
export function partFacts(line: FactsIn): PartFacts | null {
  const d = (line.description ?? "").replace(/µ|μ/g, "u").trim();
  const text = [d, line.value ?? ""].join(" ").trim();
  const prefix = (line.refDes ?? "").replace(/\d.*$/, "").toUpperCase();
  const facts: PartFact[] = [];
  const pd = parseDescription(d, line.value);
  const dm = decodeMpn(line.mpn);
  const pkg = pd.package ?? dm?.size ?? namedPackage(text) ?? null;
  const mount = /\bSMD\b|\bSMT\b|SURFACE/i.test(text) ? "Surface mount" : /\bT\/H\b|\bTH\b|THROUGH[- ]?HOLE|\bTHT\b/i.test(text) ? "Through hole" : null;
  let kind: string | null = null;

  const isCap = /\bCAP(?:A|ACITOR)?S?\b/i.test(d) || (!d && prefix === "C" && pd.kind === "capacitor");
  const isRes = /\bRES(?:ISTOR)?S?\b/i.test(d) || (!d && prefix === "R" && pd.kind === "resistor");
  const isXfmr = /XFRMR|XFMR|TRANSFORMER/i.test(text) || (/\bTRANSFORMER\b/i.test(line.mpn ?? "") && !d);
  const isInd = !isXfmr && (/\bIND(?:UCTOR)?S?\b|\bCHOKE\b|FERRITE\s+BEAD/i.test(d) || (!d && prefix === "L" && pd.kind === "inductor"));

  if (isCap) {
    kind = /ALUM|ELECT|\bELKO\b/i.test(d) ? (/POLY|HYBRID/i.test(d) ? "Polymer aluminium capacitor" : "Aluminium electrolytic capacitor") : /TANT/i.test(d) ? "Tantalum capacitor" : /FILM|POLYPROP|POLYEST/i.test(d) ? "Film capacitor" : /CER|MLCC|X[5-8][RS]|C0G|NP0|Y5V/i.test(d) ? "Ceramic capacitor (MLCC)" : "Capacitor";
    const c = pd.capacitance ?? (dm?.kind === "capacitor" ? dm.value : null);
    push(facts, "Capacitance", c !== null && c !== undefined ? formatSi(c, "F") : null);
    const v = pd.voltage ?? dm?.voltage;
    push(facts, "Rated voltage", v !== undefined ? `${trim(v)} V` : null);
    const tol = pd.tolerance ?? dm?.tolerancePct;
    push(facts, "Tolerance", tol !== undefined ? `±${trim(tol)} %` : null);
    push(facts, "Dielectric", pd.dielectric ?? dm?.dielectric);
    push(facts, "Polarised", /ALUM|ELECT|TANT/i.test(d) ? "Yes" : null);
  } else if (isRes) {
    kind = /\bPTC\b|THERMISTOR|\bNTC\b/i.test(d) ? "Thermistor" : /ARRAY|NETWORK/i.test(d) ? "Resistor array" : /SENSE|SHUNT/i.test(d) || (pd.resistance !== undefined && pd.resistance < 0.1) ? "Current-sense resistor" : "Resistor";
    const r = pd.resistance ?? (dm?.kind === "resistor" ? dm.value : null);
    push(facts, "Resistance", r !== null && r !== undefined ? formatSi(r, "Ω") : null);
    push(facts, "Power", pd.power !== undefined ? formatSi(pd.power, "W") : null);
    const tol = pd.tolerance ?? dm?.tolerancePct;
    push(facts, "Tolerance", tol !== undefined ? `±${trim(tol)} %` : null);
  } else if (isXfmr) {
    kind = /CURR(?:ENT)?\s*SENSE/i.test(text) ? "Current-sense transformer" : /PULSE|GATE\s*DRIVE/i.test(text) ? "Pulse transformer" : /COMMON\s*MODE/i.test(text) ? "Common-mode choke" : "Transformer";
    const ratio = text.match(/(?<![\d:])(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)(?![\d:])/);
    push(facts, "Turns ratio", ratio ? `${ratio[1]} : ${ratio[2]}` : null);
    push(facts, kind === "Current-sense transformer" ? "Primary current" : "Current", amps(text));
    const taps = text.match(/(\d+)\s*-?\s*TAPS?\b/i);
    push(facts, "Taps", taps ? taps[1] : null);
    const core = [line.pkg ?? "", text].join(" ").match(/\b(E[EIFT]?D?\s?\d{2}(?:\/\d{1,2}){1,2}|ETD\s?\d{2}|RM\s?\d{1,2}|PQ\s?\d{2}\/?\d{0,2}|EFD\s?\d{2}|EP\s?\d{1,2})\b/i);
    push(facts, "Core", core ? core[1].toUpperCase().replace(/\s/g, "") : null);
    const p = figure(text, /VA|W/);
    push(facts, "Power", p ? `${trim(scaled(p, false))} ${/VA/i.test(text) ? "VA" : "W"}` : null);
  } else if (isInd) {
    const rated = figure(d, /A(?:MPS?)?/);
    // A chip inductor carries milliamps; amps mean a power inductor whatever the description calls it.
    kind = /FERRITE\s+BEAD/i.test(d) ? "Ferrite bead" : /SHIELD/i.test(d) ? "Shielded power inductor" : /\bPWR\b|POWER/i.test(d) || (rated && scaled(rated, false) >= 1) ? "Power inductor" : "Inductor";
    const l = pd.inductance ?? (dm?.kind === "inductor" ? dm.value : null);
    push(facts, "Inductance", l !== null && l !== undefined ? formatSi(l, "H") : null);
    push(facts, "Rated current", amps(d));
    const tol = pd.tolerance ?? dm?.tolerancePct;
    push(facts, "Tolerance", tol !== undefined ? `±${trim(tol)} %` : null);
    push(facts, "Shielded", /UNSHIELD/i.test(d) ? "No" : /SHIELD/i.test(d) ? "Yes" : null);
  } else if (/\bDIODE\b|\bRECT(?:IFIER)?\b|\bTVS\b|\bZENER\b/i.test(d)) {
    const type = /SCHOTTKY/i.test(d) ? "Schottky diode" : /ZENER/i.test(d) ? "Zener diode" : /\bTVS\b/i.test(d) ? "TVS diode" : /\bLED\b/i.test(d) ? "LED" : /BRIDGE/i.test(d) ? "Bridge rectifier" : "Diode";
    kind = type;
    push(facts, type === "Zener diode" ? "Zener voltage" : "Reverse voltage", volts(d));
    push(facts, "Forward current", amps(d));
  } else if (/\bLED\b/i.test(d)) {
    kind = "LED";
    const colour = d.match(/\b(RED|GREEN|YELLOW|ORANGE|AMBER|WHITE|BLUE|RGB|IR|INFRARED)\b/i);
    push(facts, "Colour", colour ? colour[1][0].toUpperCase() + colour[1].slice(1).toLowerCase() : null);
    push(facts, "Forward current", amps(d));
  } else if (/MOSFET|\bFET\b|\bIGBT\b|TRANSISTOR|\bBJT\b|\bNPN\b|\bPNP\b/i.test(d) && !/DR(?:I)?V(?:E)?R/i.test(d)) {
    const n = /N-?CH/i.test(d), p = /P-?CH/i.test(d);
    kind = /IGBT/i.test(d) ? "IGBT" : /MOSFET|\bFET\b/i.test(d) ? (n ? "N-channel MOSFET" : p ? "P-channel MOSFET" : "MOSFET") : /NPN/i.test(d) ? "NPN transistor" : /PNP/i.test(d) ? "PNP transistor" : "Transistor";
    push(facts, /MOSFET|\bFET\b/i.test(d) ? "Drain-source voltage" : "Voltage", volts(d));
    push(facts, /MOSFET|\bFET\b/i.test(d) ? "Drain current" : "Current", amps(d));
  } else if (/CRYSTAL|\bXTAL\b|OSCILLATOR|\bOSC\b|RESONATOR/i.test(d)) {
    kind = /OSCILLATOR|\bOSC\b/i.test(d) ? "Oscillator" : /RESONATOR/i.test(d) ? "Resonator" : "Crystal";
    const f = figure(d, /HZ/);
    push(facts, "Frequency", f ? formatSi(scaled(f, true), "Hz") : null);
    const load = figure(d, /F/);
    push(facts, "Load capacitance", load ? formatSi(scaled(load, false), "F") : null);
    const ppm = d.match(/±?\s*(\d+)\s*PPM/i);
    push(facts, "Stability", ppm ? `±${ppm[1]} ppm` : null);
  } else if (/\bFUSE\b|POLYFUSE|POLYSWITCH|\bPTC\b/i.test(d)) {
    kind = /\bPTC\b|POLYFUSE|POLYSWITCH|RESETTABLE/i.test(d) ? "Resettable fuse (PTC)" : "Fuse";
    push(facts, kind === "Fuse" ? "Rated current" : "Hold current", amps(d));
    push(facts, "Rated voltage", volts(d));
  } else if (/HEAT\s?SINK/i.test(d)) {
    kind = "Heatsink";
    push(facts, "For package", namedPackage(d));
    const inch = d.match(/(\d+(?:\.\d+)?)\s*(?:"|IN\b|INCH)/i);
    const mm = d.match(/(\d+(?:\.\d+)?)\s*MM\b/i);
    push(facts, "Height", inch ? `${trim(num(inch[1]) * 25.4)} mm (${inch[1]} in)` : mm ? `${mm[1]} mm` : null);
    push(facts, "Fixing", /W\/\s*PINS?|SOLDER\s*PINS?/i.test(d) ? "Solder pins" : /CLIP/i.test(d) ? "Clip" : null);
  } else if (/\bCONN(?:ECTOR)?\b|\bHEADE?R\b|\bHDR\b|SOCKET|\bJACK\b|\bPLUG\b|RECEPTACLE|TERMINAL\s*BLOCK|\bFRC\b|\bFFC\b|\bFPC\b|\bIDC\b|\d+\s*PIN\b/i.test(d) || (!d && (prefix === "J" || prefix === "P" || prefix === "CN"))) {
    const mm = d.match(/(\d+(?:\.\d+)?)\s*MM\b/i);
    // A header at 3 mm pitch or more carries power (Mini-Fit, Micro-Fit, VH): it is not a signal pin strip.
    const power = (mm && num(mm[1]) >= 3) || /MINI-?FIT|MICRO-?FIT|\bPOWER\b|\bPWR\b/i.test(d);
    kind = /TERMINAL\s*BLOCK/i.test(d) ? "Terminal block" : /\bUSB\b/i.test(d) ? "USB connector" : /\bFRC\b|\bIDC\b|BOX\s*HEADER|SHROUD/i.test(d) ? "Shrouded header" : /SOCKET|RECEPTACLE/i.test(d) ? "Socket" : /HEADE?R|\bHDR\b/i.test(d) ? (power ? "Power header" : "Pin header") : "Connector";
    const pos = d.match(/(\d+)\s*-?\s*(?:POS(?:ITION)?S?|PINS?|WAY|CKT|CIRCUITS?)\b/i);
    push(facts, "Positions", pos ? pos[1] : null);
    const inch = d.match(/(?<![\d.])(0?\.\d+)\s*(?:"|IN\b)?(?=\s|$)/);
    push(facts, "Pitch", mm ? `${mm[1]} mm` : inch ? `${trim(num(inch[1]) * 25.4)} mm (${inch[1]} in)` : null);
    push(facts, "Orientation", /\bVERT(?:ICAL)?\b|\bSTR(?:AIGHT)?\b/i.test(d) ? "Vertical" : /\bR\/A\b|RIGHT\s*ANGLE|\bRA\b/i.test(d) ? "Right angle" : null);
    push(facts, "Contact finish", /\bGOLD\b|\bAU\b/i.test(d) ? "Gold" : /\bTIN\b/i.test(d) ? "Tin" : null);
    push(facts, "Latches", /LATCH|EJECTOR/i.test(d) ? "Yes" : null);
  } else if (/\bIC\b|\bMCU\b|\bREG\b|\bAMP\b|DR(?:I)?V(?:E)?R|SHIFTER|\bLOGIC\b/i.test(d) || (!d && (prefix === "U" || prefix === "IC"))) {
    const fn = IC_FUNCTIONS.find(([re]) => re.test(d))?.[1];
    kind = fn ?? "Integrated circuit";
    const flash = d.match(/(\d+(?:\.\d+)?)\s*([KMG])B\s*FLASH/i);
    push(facts, "Flash", flash ? `${flash[1]} ${flash[2].toUpperCase()}B` : null);
    push(facts, "Core", /\bARM\b/i.test(d) ? "ARM" : /\bAVR\b/i.test(d) ? "AVR" : /\bPIC\b/i.test(d) ? "PIC" : /RISC-?V/i.test(d) ? "RISC-V" : null);
    const isReg = /REG|LDO|STP\s*DN|BUCK|BOOST/i.test(d);
    // "15KV ESD" is how hard a static shock the pins survive, not a supply voltage.
    const esd = d.match(/(\d+(?:\.\d+)?)\s*KV\s*ESD/i);
    push(facts, "ESD protection", esd ? `${esd[1]} kV` : null);
    const rest = esd ? d.replace(esd[0], " ") : d;
    push(facts, isReg ? "Output voltage" : "Voltage", /\bADJ\b/i.test(d) && isReg ? "Adjustable" : volts(rest));
    push(facts, isReg ? "Output current" : /DR(?:I)?V(?:E)?R/i.test(d) ? "Drive current" : "Current", amps(d));
    const bw = figure(d, /HZ/);
    push(facts, "Bandwidth", bw ? formatSi(scaled(bw, true), "Hz") : null);
    const ch = d.match(/\b(DUAL|QUAD|HEX|OCTAL|\d+-?BIT)\b/i);
    push(facts, "Channels", ch ? ch[1].toUpperCase().replace(/^(\d+)-?BIT$/, "$1-bit").replace(/^[A-Z]+$/, (w) => w[0] + w.slice(1).toLowerCase()) : null);
  }

  if (!kind) return null;
  // A heatsink's description names the package it cools, not its own.
  push(facts, "Package", kind === "Heatsink" ? line.pkg?.trim() || null : (pkg ?? (line.pkg?.trim() || null)));
  push(facts, "Mounting", mount);
  return { kind, facts };
}
