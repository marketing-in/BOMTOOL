/**
 * Reverse engineering a product from what the customer sent: every part sorted into the functional block it belongs
 * to (power, processing, radio, interfaces, sensing, drive …), what the device most likely is, its interfaces and
 * supply rails, the parts that define it, and what is still missing before it could be rebuilt.
 *
 * It reads part numbers, descriptions and designators — not copper. A BoM and Gerbers do not say which pin goes to
 * which, so the block diagram is inferred from the kinds of part present and says so. Pure.
 */

export type BlockKey =
  | "power-in"
  | "power"
  | "processing"
  | "memory"
  | "timing"
  | "wireless"
  | "wired"
  | "sensing"
  | "analog"
  | "drive"
  | "ui"
  | "connectors"
  | "logic"
  | "passives"
  | "mechanical"
  | "unknown";

export const BLOCKS: Record<BlockKey, { label: string; does: string; column: "in" | "core" | "out" | "support" }> = {
  "power-in": { label: "Protection and rectification", does: "Takes the incoming supply and keeps surges, reverse polarity and static away from the rest.", column: "in" },
  connectors: { label: "Connectors and terminals", does: "Where power and signals enter and leave the board.", column: "in" },
  sensing: { label: "Sensing", does: "Measures the outside world: temperature, current, motion, light.", column: "in" },
  power: { label: "Power conversion", does: "Turns the input into the steady rails the chips need.", column: "core" },
  processing: { label: "Processing", does: "The brain: runs the firmware and decides what the product does.", column: "core" },
  memory: { label: "Memory", does: "Holds firmware, settings or logged data outside the processor.", column: "core" },
  timing: { label: "Clock and timing", does: "Gives the processor and interfaces their time base.", column: "core" },
  analog: { label: "Analogue signal chain", does: "Amplifies, filters and converts signals between the real world and the processor.", column: "core" },
  wireless: { label: "Wireless", does: "Radio links: Wi-Fi, Bluetooth, LoRa, cellular or positioning.", column: "out" },
  wired: { label: "Wired communication", does: "Talks to other equipment over a cable: Ethernet, RS-485, CAN, USB.", column: "out" },
  drive: { label: "Switching and drive", does: "Switches loads on and off: transistors, relays, motor and gate drivers.", column: "out" },
  ui: { label: "Indicators and controls", does: "What a person sees and touches: LEDs, buttons, displays, buzzers.", column: "out" },
  logic: { label: "Glue logic", does: "Small logic chips that buffer, shift or combine signals.", column: "support" },
  passives: { label: "Passives", does: "Resistors, capacitors and inductors that set values, filter and decouple.", column: "support" },
  mechanical: { label: "Mechanical", does: "Enclosure, fasteners, heatsinks and cables.", column: "support" },
  unknown: { label: "Not recognised", does: "No description or part number to go by.", column: "support" },
};

export type RePart = {
  refDes: string;
  mpn: string | null;
  manufacturer: string | null;
  description: string | null;
  value: string | null;
  /** Dictionary kind name ("Buck regulator", "MLCC"). */
  kind: string | null;
  pkg: string | null;
  pins: number;
  dnp: boolean;
  /** Unit cost in INR where known. */
  unit: number | null;
  lifecycle: string | null;
  alternates: number;
  /**
   * Read off the Gerber pads with no part chosen yet: the footprint and position are real, but what the part is —
   * and even its designator letter — is a guess. Such parts are counted, never given a job.
   */
  guessed?: boolean;
};

const prefix = (ref: string) => ref.toUpperCase().match(/^[A-Z]+/)?.[0] ?? "";

/** Rules in priority order: the first that matches names the block. */
const RULES: { block: BlockKey; text?: RegExp; refs?: string[]; not?: RegExp }[] = [
  { block: "mechanical", text: /enclosure|\bscrew\b|standoff|heat ?sink|fastener|\bnut\b|washer|\blabel\b|\bcable\b|harness|gasket/ },
  { block: "connectors", text: /connector|\bheader\b|terminal block|\bjack\b|receptacle|\bsocket\b|\bplug\b|card holder|battery holder/, not: /driver|protect|transceiver|controller|\besd\b/ },
  { block: "processing", text: /\bmcu\b|microcontroller|microprocessor|\bsoc\b|\bfpga\b|\bcpld\b|\bdsp\b|cortex|risc-v|\besp32|\bstm32|\batmega|\bnrf5|system on module|compute module/ },
  { block: "wireless", text: /wi-?fi|bluetooth|\bble\b|\blora\b|zigbee|\bgsm\b|\blte\b|nb-iot|\bgnss\b|\bgps\b|rf transceiver|antenna|\bnfc\b|sub-?ghz|\brf\b.*(module|amplifier|switch|front)/ },
  { block: "wired", text: /ethernet|\bphy\b|rs-?485|rs-?232|rs-?422|\bcan\b.*transceiver|can fd|transceiver|usb[- ](to|hub|bridge|uart|controller)|uart bridge|\blin\b transceiver|digital isolator|level (shifter|translator)/ },
  { block: "memory", text: /\bflash\b|eeprom|\bsram\b|\bdram\b|\bfram\b|\bemmc\b|\bnand\b|\bnor\b memory|memory/ },
  { block: "power", text: /regulator|\bldo\b|\bbuck\b|\bboost\b|dc[-/ ]?dc|pmic|charger|power module|switcher|voltage reference|supervisor|reset ic|led driver|power management/ },
  { block: "sensing", text: /sensor|accelerometer|gyro|\bimu\b|thermistor|\bntc\b|humidity|current[- ]sense|hall[- ]effect|microphone|photodiode|thermocouple/ },
  { block: "analog", text: /op-?amp|operational amplifier|comparator|\badc\b|\bdac\b|instrumentation|amplifier|data converter|analog(ue)? (switch|mux)|multiplexer/ },
  { block: "drive", text: /mosfet|\bigbt\b|\brelay\b|motor driver|gate driver|h-bridge|\bbjt\b|transistor|\btriac\b|optocoupler|photocoupler|solid[- ]state relay|load switch|darlington/ },
  { block: "timing", text: /crystal|oscillator|resonator|\brtc\b|real[- ]time clock|clock (generator|buffer)/ },
  { block: "power-in", text: /\bfuse\b|\btvs\b|varistor|\bmov\b|\besd\b|polyfuse|\bptc\b|surge|reverse polarity|schottky|rectifier|\bdiode\b|zener|gas discharge|common[- ]mode choke/, not: /\bled\b|light[- ]emitting/ },
  { block: "ui", text: /\bled\b|light[- ]emitting|display|\blcd\b|\boled\b|\bswitch\b|push ?button|buzzer|speaker|potentiometer|encoder|trimmer/ },
  { block: "logic", text: /logic|\bgate\b|\bbuffer\b|flip-?flop|shift register|inverter|schmitt/ },
  { block: "passives", text: /resistor|capacitor|\bmlcc\b|inductor|ferrite|\bbead\b|\bchoke\b|\bcap\b|\bres\b|\bind\b/ },
  // Nothing in the text: the designator letter is the last word.
  { block: "connectors", refs: ["J", "P", "CN", "CON"] },
  { block: "passives", refs: ["R", "C", "L", "FB", "RN"] },
  { block: "power-in", refs: ["D", "F", "TVS", "RV"] },
  { block: "drive", refs: ["Q", "K", "RLY"] },
  { block: "timing", refs: ["Y", "X", "XTAL"] },
  { block: "ui", refs: ["LED", "SW", "S", "BZ", "LS", "DS"] },
  { block: "sensing", refs: ["TH", "RT"] },
];

const textOf = (p: RePart) => `${p.kind ?? ""} ${p.description ?? ""} ${p.value ?? ""}`.toLowerCase();

/** Processor families recognisable from the part number alone, whatever the description says. */
const CPU_MPN = /^(ESP32|ESP8266|STM32|STM8|ATMEGA|ATTINY|ATSAM|NRF5|PIC(1[0-9]|24|32)|DSPIC|RP2040|RP2350|MSP430|LPC[0-9]|GD32|CH32|CC13|CC26|EFM32|EFR32|S32K|R7F|IMX|MIMX)/i;

export function blockOf(p: RePart): BlockKey {
  const t = textOf(p);
  const ref = prefix(p.refDes);
  const hasText = t.trim().length > 0;
  if (p.guessed) return "unknown";
  // A radio module with its own processor is the brain of the board; its radios show up as features.
  if (p.mpn && CPU_MPN.test(p.mpn) && !/connector|socket|adapter|programmer/.test(t)) return "processing";
  for (const r of RULES) {
    if (r.text && hasText && r.text.test(t) && !(r.not && r.not.test(t))) return r.block;
    if (r.refs && r.refs.includes(ref)) return r.block;
  }
  // An IC with nothing but a part number.
  return "unknown";
}

/** Things the product can do, read from every description on the board. */
const FEATURES: { key: string; label: string; group: "radio" | "bus" | "power" | "io"; test: RegExp }[] = [
  { key: "wifi", label: "Wi-Fi", group: "radio", test: /wi-?fi|\b802\.11/ },
  { key: "ble", label: "Bluetooth", group: "radio", test: /bluetooth|\bble\b/ },
  { key: "lora", label: "LoRa / sub-GHz", group: "radio", test: /\blora\b|sub-?ghz/ },
  { key: "cellular", label: "Cellular", group: "radio", test: /\bgsm\b|\blte\b|nb-iot|\b4g\b|\b5g\b/ },
  { key: "gnss", label: "GNSS positioning", group: "radio", test: /\bgnss\b|\bgps\b/ },
  { key: "nfc", label: "NFC", group: "radio", test: /\bnfc\b|\brfid\b/ },
  { key: "ethernet", label: "Ethernet", group: "bus", test: /ethernet|\brj-?45\b|10\/100/ },
  { key: "rs485", label: "RS-485 / RS-422", group: "bus", test: /rs-?485|rs-?422/ },
  { key: "rs232", label: "RS-232", group: "bus", test: /rs-?232/ },
  { key: "can", label: "CAN bus", group: "bus", test: /\bcan\b|can fd/ },
  { key: "usb", label: "USB", group: "bus", test: /\busb\b/ },
  { key: "sd", label: "SD card", group: "bus", test: /\bsd\b card|micro ?sd/ },
  { key: "mains", label: "Mains input", group: "power", test: /varistor|\bmov\b|\bx2\b|ac[-/ ]dc|mains|230 ?v ?ac/ },
  { key: "battery", label: "Battery", group: "power", test: /battery|charger|coin cell|li-?ion|lipo/ },
  { key: "isolated", label: "Galvanic isolation", group: "power", test: /optocoupler|photocoupler|digital isolator|isolated/ },
  { key: "motor", label: "Motor drive", group: "io", test: /motor driver|gate driver|h-bridge|three[- ]phase|bldc/ },
  { key: "relay", label: "Relay outputs", group: "io", test: /\brelay\b/ },
  { key: "display", label: "Display", group: "io", test: /display|\blcd\b|\boled\b/ },
  { key: "analog-in", label: "Analogue inputs", group: "io", test: /\badc\b|instrumentation|4-20 ?ma|thermocouple/ },
];

export type Block = {
  key: BlockKey;
  label: string;
  does: string;
  column: "in" | "core" | "out" | "support";
  /** Fitted designators. */
  parts: number;
  /** The different part numbers in the block, most significant first. */
  items: { refs: string[]; mpn: string | null; manufacturer: string | null; what: string; pins: number; unit: number | null }[];
};

export type Rail = { ref: string; mpn: string | null; type: string; volts: number[] };

export type Finding = { key: string; level: "green" | "amber" | "red"; title: string; detail: string };

export type ReverseInput = {
  parts: RePart[];
  board: { widthMm: number; heightMm: number; layers: number; source: "gerber" | "spec"; placed: boolean };
  /** Total solder joints and SMT sides, from the feasibility maths. */
  joints: number;
  sides: number;
  finestPitchMm: number | null;
  /** BoM lines with no part matched. */
  unmatched: number;
  box: string | null;
  /** Process route step titles, in order. */
  route: string[];
};

export type ReverseReport = {
  identity: { title: string; summary: string; confidence: "high" | "medium" | "low"; why: string[] };
  blocks: Block[];
  features: { key: string; label: string; group: string; refs: string[] }[];
  rails: Rail[];
  powerInputs: string[];
  keyParts: { refs: string[]; mpn: string; manufacturer: string | null; block: string; what: string; pins: number; unit: number | null; lifecycle: string | null; alternates: number }[];
  counts: { fitted: number; dnp: number; partNumbers: number; recognised: number; active: number; passive: number; /** Footprints off the Gerbers with no part chosen. */ guessed: number };
  findings: Finding[];
  build: { summary: string; steps: string[] };
};

const REGULATOR = [
  { type: "Buck (step-down) converter", test: /\bbuck\b|step-?down/ },
  { type: "Boost (step-up) converter", test: /\bboost\b|step-?up/ },
  { type: "LDO linear regulator", test: /\bldo\b|linear regulator|low[- ]dropout/ },
  { type: "Isolated DC-DC module", test: /isolated.*dc|dc[-/ ]?dc.*isolated/ },
  { type: "Battery charger", test: /charger/ },
  { type: "DC-DC converter", test: /dc[-/ ]?dc|switcher|power module/ },
  { type: "Voltage reference", test: /voltage reference/ },
  { type: "Regulator", test: /regulator|pmic|power management/ },
];

/** Voltages named in a description, both ends of a range such as "3.5–28 V". */
const volts = (t: string) =>
  [...new Set([...t.matchAll(/(\d+(?:\.\d+)?)(?:\s*(?:–|-|to)\s*(\d+(?:\.\d+)?))?\s*v\b(?!\s*ac)/g)].flatMap((m) => [m[1], m[2]].filter(Boolean).map(Number)).filter((v) => v > 0 && v <= 1000))].sort((a, b) => a - b);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function reverseEngineer(input: ReverseInput): ReverseReport {
  const fitted = input.parts.filter((p) => !p.dnp);
  const byBlock = new Map<BlockKey, RePart[]>();
  for (const p of fitted) {
    const b = blockOf(p);
    byBlock.set(b, [...(byBlock.get(b) ?? []), p]);
  }
  const of = (k: BlockKey) => byBlock.get(k) ?? [];

  const blocks: Block[] = (Object.keys(BLOCKS) as BlockKey[])
    .filter((k) => of(k).length)
    .map((k) => {
      const groups = new Map<string, RePart[]>();
      for (const p of of(k)) {
        const key = (p.mpn ?? `${p.kind ?? ""}|${p.value ?? ""}|${p.pkg ?? ""}`).toUpperCase() || p.refDes;
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      const items = [...groups.values()]
        .map((g) => ({
          refs: g.map((p) => p.refDes),
          mpn: g[0].mpn,
          manufacturer: g[0].manufacturer,
          what: g[0].description ?? g[0].kind ?? ([g[0].value, g[0].pkg].filter(Boolean).join(" ") || "No description"),
          pins: g[0].pins,
          unit: g[0].unit,
        }))
        .sort((a, b) => b.pins - a.pins || (b.unit ?? 0) - (a.unit ?? 0) || b.refs.length - a.refs.length);
      return { key: k, ...BLOCKS[k], parts: of(k).length, items };
    });

  const features = FEATURES.map((f) => ({ key: f.key, label: f.label, group: f.group, refs: fitted.filter((p) => f.test.test(textOf(p))).map((p) => p.refDes) })).filter((f) => f.refs.length);
  const has = (k: string) => features.some((f) => f.key === k);
  const labels = (group: string) => features.filter((f) => f.group === group).map((f) => f.label);

  const rails: Rail[] = of("power").map((p) => {
    const t = textOf(p);
    return { ref: p.refDes, mpn: p.mpn, type: REGULATOR.find((r) => r.test.test(t))?.type ?? "Power part", volts: volts(t) };
  });
  const conn = of("connectors").map(textOf).join(" ");
  const powerInputs = [
    ...(has("mains") ? ["Mains (AC)"] : []),
    ...(/barrel|dc jack|power jack/.test(conn) ? ["DC jack"] : []),
    ...(/terminal block|screw terminal/.test(conn) ? ["Screw terminals"] : []),
    ...(has("usb") ? ["USB"] : []),
    ...(has("battery") ? ["Battery"] : []),
    ...(/poe|power over ethernet/.test(fitted.map(textOf).join(" ")) ? ["Power over Ethernet"] : []),
  ];

  // ── What the device most likely is
  // No separate processor: a radio module or SoC runs the firmware itself.
  const cpu = of("processing")[0] ?? of("wireless").find((p) => /module|\bsoc\b|system[- ]on/.test(textOf(p))) ?? null;
  const radios = labels("radio");
  const buses = labels("bus").filter((b) => b !== "SD card");
  const switches = of("drive").length;
  const relays = fitted.filter((p) => /\brelay\b/.test(textOf(p)) || ["K", "RLY"].includes(prefix(p.refDes))).length;
  const leds = fitted.filter((p) => /\bled\b|light[- ]emitting/.test(textOf(p)) && blockOf(p) === "ui").length;
  let title: string;
  const why: string[] = [];
  const guessed = fitted.filter((p) => p.guessed).length;
  const mostlyGuessed = fitted.length > 0 && guessed / fitted.length > 0.5;
  if (!fitted.length) title = "Nothing to analyse yet";
  else if (mostlyGuessed) {
    title = "Not enough to tell yet";
    why.push(`${plural(guessed, "part")} of ${fitted.length.toLocaleString("en-IN")} were read off the Gerber pads: the footprints and positions are real, but no values or part numbers are in the files.`);
    why.push("Choose the parts in Build & quote → Components, or upload the customer's BoM. The product can be named once its chips have part numbers.");
  }
  else if (cpu && radios.length && (has("ethernet") || has("rs485") || has("can") || has("rs232"))) {
    title = "Wireless gateway or protocol bridge";
    why.push(`A processor with ${list(radios)} on one side and ${list(buses)} on the other: it moves data between a radio network and wired equipment.`);
  } else if (has("motor") || (switches >= 6 && of("drive").some((p) => /mosfet|igbt/.test(textOf(p))) && !radios.length)) {
    title = "Motor drive or power stage";
    why.push(`${plural(switches, "switching part")}${has("motor") ? " with a gate or motor driver" : ""}: the board switches real power to a load.`);
  } else if (cpu && radios.length && of("sensing").length) {
    title = "Wireless sensor node";
    why.push(`${plural(of("sensing").length, "sensing part")}, a processor and ${list(radios)}: it measures something and reports it by radio.`);
  } else if (cpu && relays >= 2) {
    title = "Relay / I/O controller";
    why.push(`${plural(relays, "relay")} driven by a processor: it switches outside loads on command.`);
  } else if (!cpu && leds >= 6) {
    title = "LED lighting board or driver";
    why.push(`${plural(leds, "LED")} and no processor: the board makes light.`);
  } else if (!cpu && of("power").length) {
    title = "Power supply or power conversion board";
    why.push(`${plural(of("power").length, "power-conversion part")} and no processor: its job is to make supply rails.`);
  } else if (cpu && radios.length) {
    title = "Connected controller";
    why.push(`A processor with ${list(radios)}.`);
  } else if (cpu) {
    title = "Embedded controller board";
    why.push("A processor with its supply, clock and interfaces, and no radio.");
  } else {
    title = "Interface or passive board";
    why.push("No processor and no power conversion: connectors, passives and protection only.");
  }
  const cpus = of("processing").length > 1 ? of("processing") : cpu ? [cpu] : [];
  if (mostlyGuessed) {
    // Nothing more can honestly be said.
  } else if (cpus.length === 1) why.push(`The processor is ${cpus[0].mpn ?? cpus[0].refDes}${cpus[0].manufacturer ? ` from ${cpus[0].manufacturer}` : ""}${cpus[0].description ? ` — ${cpus[0].description}` : ""}.`);
  else if (cpus.length > 1) why.push(`${plural(cpus.length, "processor")}: ${list(cpus.slice(0, 4).map((p) => `${p.mpn ?? p.refDes}${p.manufacturer ? ` (${p.manufacturer})` : ""}`))}.`);
  if (!mostlyGuessed && buses.length && !/gateway/.test(title.toLowerCase())) why.push(`Wired interfaces: ${list(buses)}.`);
  if (!mostlyGuessed && powerInputs.length) why.push(`Power comes in by: ${list(powerInputs)}.`);
  if (!mostlyGuessed && has("isolated")) why.push("Part of the circuit is galvanically isolated.");

  const active = fitted.filter((p) => !p.guessed && !["passives", "connectors", "mechanical"].includes(blockOf(p)));
  const described = active.filter((p) => (p.description ?? p.kind ?? "").trim().length > 0).length;
  const share = active.length ? described / active.length : 0;
  const confidence: ReverseReport["identity"]["confidence"] = !active.length || guessed / Math.max(1, fitted.length) > 0.2 ? "low" : share >= 0.8 && of("unknown").length === 0 ? "high" : share >= 0.5 ? "medium" : "low";
  const summary = !fitted.length
    ? "The BoM has no fitted parts."
    : mostlyGuessed
      ? `${plural(fitted.length, "footprint")} on the board, ${plural(fitted.length - guessed, "part")} identified so far.`
      : `${plural(fitted.length, "fitted part")} in ${plural(blocks.filter((b) => b.column !== "support").length, "functional block")}${radios.length ? `, ${list(radios)}` : ""}${buses.length ? `, ${list(buses)}` : ""}.`;

  // ── The parts that define the product
  const seen = new Set<string>();
  const keyParts = active
    .filter((p) => p.mpn)
    .sort((a, b) => b.pins - a.pins || (b.unit ?? 0) - (a.unit ?? 0))
    .filter((p) => (seen.has(p.mpn!.toUpperCase()) ? false : (seen.add(p.mpn!.toUpperCase()), true)))
    .slice(0, 8)
    .map((p) => ({
      refs: active.filter((x) => x.mpn?.toUpperCase() === p.mpn!.toUpperCase()).map((x) => x.refDes),
      mpn: p.mpn!,
      manufacturer: p.manufacturer,
      block: BLOCKS[blockOf(p)].label,
      what: p.description ?? p.kind ?? "No description",
      pins: p.pins,
      unit: p.unit,
      lifecycle: p.lifecycle,
      alternates: p.alternates,
    }));

  // ── What stands between this data and a working copy
  const findings: Finding[] = [];
  const programmable = [...of("processing"), ...(cpu && !of("processing").includes(cpu) ? [cpu] : []), ...of("memory").filter((p) => /flash|eeprom/.test(textOf(p)))];
  findings.push({
    key: "netlist",
    level: "amber",
    title: "Connections are not in the data",
    detail: "A BoM and Gerber artwork say which parts are on the board, not which pin goes to which. The blocks here are inferred from the kinds of part. To prove the circuit, ask for the schematic or a netlist (IPC-D-356, ODB++).",
  });
  if (programmable.length)
    findings.push({ key: "firmware", level: "red", title: "Firmware has to come from the customer", detail: `${plural(programmable.length, "programmable part")} (${programmable.slice(0, 5).map((p) => p.refDes).join(", ")}): the product does nothing without its firmware image, and that cannot be read from a BoM or Gerbers.` });
  findings.push(
    input.board.source === "gerber"
      ? { key: "board", level: "green", title: "Board artwork in hand", detail: `${input.board.layers}-layer board, ${input.board.widthMm.toFixed(1)} × ${input.board.heightMm.toFixed(1)} mm, from the Gerbers.` }
      : { key: "board", level: "red", title: "No Gerbers", detail: `Only the board size and layer count are known (${input.board.layers} layers, ${input.board.widthMm.toFixed(1)} × ${input.board.heightMm.toFixed(1)} mm). The bare board cannot be made without the fabrication files.` },
  );
  if (!input.board.placed) findings.push({ key: "placement", level: "amber", title: "No placement data", detail: "Without a pick-and-place file the position and side of each part are assumed." });
  if (input.unmatched) findings.push({ key: "unmatched", level: "red", title: "Parts we could not identify", detail: `${plural(input.unmatched, "BoM line")} matched no part in the catalogue — custom, mis-typed or unmarked parts.` });
  if (guessed) findings.push({ key: "guessed", level: "red", title: "Parts not chosen yet", detail: `${plural(guessed, "footprint")} came from the Gerbers with no value or part number. Until they are chosen, this page cannot say what they do.` });
  const blind = of("unknown").filter((p) => !p.guessed);
  if (blind.length) findings.push({ key: "unknown", level: "amber", title: "Parts with no description", detail: `${plural(blind.length, "part")} (${blind.slice(0, 6).map((p) => p.refDes).join(", ")}) have a part number or designator only, so their job is not known.` });
  const ending = active.filter((p) => p.lifecycle && p.lifecycle !== "ACTIVE");
  if (ending.length) findings.push({ key: "lifecycle", level: "amber", title: "Parts going out of production", detail: `${plural(ending.length, "active part")} not in full production (${ending.slice(0, 5).map((p) => p.mpn ?? p.refDes).join(", ")}): a rebuild needs alternates.` });
  const sole = keyParts.filter((p) => p.alternates === 0);
  if (sole.length) findings.push({ key: "sole", level: "amber", title: "Key parts with no alternate", detail: `${list(sole.slice(0, 5).map((p) => p.mpn))}: the design depends on ${sole.length === 1 ? "this part" : "these parts"} and nothing on file replaces ${sole.length === 1 ? "it" : "them"}.` });
  findings.push(input.box ? { key: "box", level: "green", title: "Enclosure chosen", detail: input.box } : { key: "box", level: "amber", title: "No enclosure data", detail: "The mechanical side — box, cut-outs, cables, labels — is not described." });

  const passive = of("passives").length;
  return {
    identity: { title, summary, confidence, why },
    blocks,
    features,
    rails,
    powerInputs,
    keyParts,
    counts: { fitted: fitted.length, dnp: input.parts.length - fitted.length, partNumbers: new Set(fitted.map((p) => (p.mpn ?? p.refDes).toUpperCase())).size, recognised: fitted.length - of("unknown").length, active: active.length, passive, guessed },
    findings,
    build: {
      summary: `${input.board.layers}-layer board, ${input.board.widthMm.toFixed(1)} × ${input.board.heightMm.toFixed(1)} mm, ${plural(input.joints, "solder joint")}, SMT on ${plural(input.sides, "side")}${input.finestPitchMm ? `, pitch down to ${input.finestPitchMm} mm` : ""}.`,
      steps: input.route,
    },
  };
}
