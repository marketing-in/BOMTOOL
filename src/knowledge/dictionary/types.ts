/**
 * The component & machine dictionary: one entry per component *type* (LDO, TVS diode, FPC connector,
 * reflow oven, placement nozzle…). Versioned seed content — the UI renders it, nothing is typed into pages.
 */

export type DictGroup =
  | "power"
  | "analog"
  | "processing"
  | "logic"
  | "interface"
  | "rf"
  | "sensors"
  | "discretes"
  | "opto"
  | "protection"
  | "capacitors"
  | "resistors"
  | "magnetics"
  | "frequency"
  | "electromechanical"
  | "connectors"
  | "cables"
  | "materials"
  | "machines"
  | "machine-parts"
  | "machine-blocks";

export type DictSection = "Semiconductors" | "Passives & protection" | "Electromechanical & interconnect" | "PCB & materials" | "EMS machinery";

export const GROUPS: { key: DictGroup; label: string; blurb: string; section: DictSection }[] = [
  { key: "power", label: "Power management", blurb: "Regulators, converters, switches and drivers that turn one supply into what each chip needs.", section: "Semiconductors" },
  { key: "analog", label: "Analog & mixed-signal", blurb: "Amplifiers, converters and analog switches between the real world and the digital side.", section: "Semiconductors" },
  { key: "processing", label: "Processing & memory", blurb: "MCUs, processors, programmable logic and every kind of memory.", section: "Semiconductors" },
  { key: "logic", label: "Logic, timing & glue", blurb: "Gates, registers, level shifters, expanders and real-time clocks.", section: "Semiconductors" },
  { key: "interface", label: "Interface & communication", blurb: "Transceivers and bridges for RS-485, CAN, USB, Ethernet and isolation.", section: "Semiconductors" },
  { key: "rf", label: "RF & wireless", blurb: "Radio modules, GNSS and antennas.", section: "Semiconductors" },
  { key: "sensors", label: "Sensors", blurb: "Temperature, motion, pressure, light, current and gas sensing.", section: "Semiconductors" },
  { key: "discretes", label: "Discrete semiconductors", blurb: "Diodes, MOSFETs, BJTs, IGBTs, thyristors and wide-bandgap devices.", section: "Semiconductors" },
  { key: "opto", label: "Optoelectronics & displays", blurb: "LEDs, optocouplers, light detectors and displays.", section: "Semiconductors" },
  { key: "protection", label: "Circuit protection", blurb: "Fuses, TVS and ESD diodes, varistors, GDTs and thermistors.", section: "Passives & protection" },
  { key: "capacitors", label: "Capacitors", blurb: "Ceramic, tantalum, polymer, electrolytic, film, safety and super capacitors.", section: "Passives & protection" },
  { key: "resistors", label: "Resistors", blurb: "Chip, thin-film, current-sense, arrays, through-hole and potentiometers.", section: "Passives & protection" },
  { key: "magnetics", label: "Magnetics", blurb: "Inductors, ferrite beads, chokes and transformers.", section: "Passives & protection" },
  { key: "frequency", label: "Frequency control", blurb: "Crystals, oscillators, resonators and clock generators.", section: "Passives & protection" },
  { key: "electromechanical", label: "Electromechanical", blurb: "Relays, switches, encoders, buzzers, fans, batteries, heatsinks and shields.", section: "Electromechanical & interconnect" },
  { key: "connectors", label: "Connectors", blurb: "Board, wire, I/O, RF and card connectors.", section: "Electromechanical & interconnect" },
  { key: "cables", label: "Cables & harness", blurb: "Wire, flat and shielded cable, crimps, sleeving and glands.", section: "Electromechanical & interconnect" },
  { key: "materials", label: "PCB & assembly materials", blurb: "Laminates, board types, solder, flux, coatings, adhesives and thermal materials.", section: "PCB & materials" },
  { key: "machines", label: "EMS machines", blurb: "Every station on SMT, THT, test and back-end lines — what it does and how to run it.", section: "EMS machinery" },
  { key: "machine-parts", label: "Machine parts & tooling", blurb: "Feeders, nozzles, heads, stencils, squeegees, fixtures and other wear parts.", section: "EMS machinery" },
  { key: "machine-blocks", label: "Machine building blocks", blurb: "Servos, guides, ball screws, pneumatics, vacuum, PLCs and sensors inside the machines.", section: "EMS machinery" },
];

export const SECTIONS: DictSection[] = ["Semiconductors", "Passives & protection", "Electromechanical & interconnect", "PCB & materials", "EMS machinery"];

/** A parameter worth knowing: what it means and the range you usually see. */
export type Spec = { name: string; meaning: string; typical?: string };

/** A well-known cross-reference. `note` says what differs — always read it before substituting. */
export type Equivalent = { part: string; alts: string[]; note: string };

/** Where a machine sits in the factory flow (drawn as a highlighted station). */
export type Station =
  | "loader"
  | "printer"
  | "spi"
  | "mounter"
  | "reflow"
  | "aoi"
  | "axi"
  | "insertion"
  | "wave"
  | "selective"
  | "press-fit"
  | "depanel"
  | "clean"
  | "coat"
  | "ict"
  | "flying-probe"
  | "fct"
  | "burn-in"
  | "rework"
  | "stores"
  | "harness"
  | "marking"
  | "dispense";

/** What to show as the 3D/visual model for an entry. Package names refer to our package library. */
export type ModelHint =
  | { kind: "package"; package: string }
  | { kind: "body"; body: "chip" | "molded" | "gullwing" | "leadless" | "quad" | "array" | "power" | "can" | "module" | "crystal" | "connector" | "generic"; l: number; w: number; h: number; pins?: number; pitch?: number; color?: string }
  | { kind: "explorer"; explorer: "pcb" | "package" | "die"; preset?: string };

export type DictEntry = {
  slug: string;
  name: string;
  /** Other names, abbreviations and well-known part numbers people search for. */
  aka?: string[];
  group: DictGroup;
  /** One sentence: what it is for. */
  oneLiner: string;
  /** What it does, in plain words. */
  what: string;
  /** How it works. */
  how: string;
  specs: Spec[];
  packages?: string[];
  uses: string[];
  /** Id of a typical application circuit (src/knowledge/circuits.ts). */
  circuit?: string;
  /** How to choose one. */
  selection: string[];
  alternatives: {
    /** What must match and what may differ when substituting. */
    rules: string[];
    equivalents?: Equivalent[];
    /** A different kind of part that can do the same job. */
    crossFamily?: string[];
  };
  /** Assembly and process notes for our lines. */
  ems?: string[];
  /** Design, assembly and field failure risks. */
  pitfalls?: string[];
  sourcing?: string[];
  makers?: string[];
  /** Catalogue category slugs ("In our catalogue"). */
  categories?: string[];
  /** Long-form knowledge article slug. */
  article?: string;
  /** Other dictionary entries. */
  related?: string[];
  model?: ModelHint;
  // Machines
  station?: Station;
  /** Main sub-assemblies (dictionary slugs where we have them, plain text otherwise). */
  subassemblies?: string[];
  maintenance?: { interval: string; task: string }[];
  /** Defects the machine causes when it drifts, or catches when it is an inspection station. */
  defects?: string[];
  consumables?: string[];
  /** Bump when the content changes. */
  version: number;
};
