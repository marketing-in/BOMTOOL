export type SeedCategory = {
  slug: string;
  name: string;
  attritionPct?: number;
  children?: SeedCategory[];
};

export const CATEGORY_TREE: SeedCategory[] = [
  {
    slug: "semiconductors",
    name: "Semiconductors",
    children: [
      { slug: "mcu", name: "Microcontrollers (MCU)" },
      { slug: "mpu-soc", name: "Microprocessors & SoCs" },
      { slug: "fpga-cpld", name: "FPGAs & CPLDs" },
      { slug: "memory", name: "Memory (DRAM, NOR/NAND, EEPROM, eMMC)" },
      { slug: "power-ic", name: "Power ICs (LDO, DC-DC, PMIC, gate drivers)" },
      { slug: "op-amp", name: "Op-amps & comparators" },
      { slug: "data-converter", name: "ADCs & DACs" },
      { slug: "interface-ic", name: "Interface ICs (RS-485, CAN, USB, Ethernet)" },
      { slug: "rf-wireless", name: "RF & wireless modules" },
      { slug: "sensor", name: "Sensors" },
      { slug: "mosfet", name: "MOSFETs" },
      { slug: "igbt", name: "IGBTs" },
      { slug: "bjt", name: "Bipolar transistors (BJT)" },
      { slug: "diode", name: "Diodes (rectifier, Schottky, Zener, TVS/ESD)" },
      { slug: "led", name: "LEDs" },
      { slug: "optocoupler", name: "Optocouplers" },
      { slug: "wide-bandgap", name: "SiC & GaN power devices" },
    ],
  },
  {
    slug: "passives",
    name: "Passives",
    children: [
      { slug: "mlcc", name: "Ceramic capacitors (MLCC)", attritionPct: 3 },
      { slug: "tantalum-cap", name: "Tantalum capacitors" },
      { slug: "aluminium-cap", name: "Aluminium electrolytic capacitors" },
      { slug: "polymer-cap", name: "Polymer & hybrid capacitors" },
      { slug: "film-cap", name: "Film capacitors" },
      { slug: "supercap", name: "Supercapacitors" },
      { slug: "resistor-chip", name: "Chip resistors (thick/thin film)", attritionPct: 3 },
      { slug: "resistor-current-sense", name: "Current-sense resistors" },
      { slug: "resistor-network", name: "Resistor networks & arrays" },
      { slug: "potentiometer", name: "Potentiometers & trimmers" },
      { slug: "inductor", name: "Inductors" },
      { slug: "ferrite-bead", name: "Ferrite beads", attritionPct: 3 },
      { slug: "crystal", name: "Crystals" },
      { slug: "oscillator", name: "Oscillators" },
      { slug: "fuse", name: "Fuses" },
      { slug: "ptc-ntc", name: "Thermistors & resettable fuses (PTC/NTC)" },
      { slug: "varistor", name: "Varistors (MOV)" },
    ],
  },
  {
    slug: "electromechanical",
    name: "Electromechanical",
    children: [
      { slug: "connector-header", name: "Pin headers & sockets" },
      { slug: "connector-wtb", name: "Wire-to-board connectors" },
      { slug: "connector-btb", name: "Board-to-board connectors" },
      { slug: "connector-usb", name: "USB connectors" },
      { slug: "connector-rj45", name: "RJ45 / modular jacks" },
      { slug: "connector-m12", name: "Circular M8/M12 connectors" },
      { slug: "connector-dsub", name: "D-sub connectors" },
      { slug: "terminal-block", name: "Terminal blocks" },
      { slug: "connector-fpc", name: "FPC/FFC connectors" },
      { slug: "relay", name: "Relays" },
      { slug: "switch", name: "Switches" },
      { slug: "buzzer", name: "Buzzers & speakers" },
      { slug: "battery-holder", name: "Batteries & holders" },
      { slug: "heatsink", name: "Heatsinks" },
    ],
  },
  {
    slug: "cables-wire",
    name: "Cables & wire",
    children: [
      { slug: "hookup-wire", name: "Hook-up wire (UL1007/1015)" },
      { slug: "ribbon-cable", name: "Ribbon & flat cable" },
      { slug: "shielded-cable", name: "Shielded & coax cable" },
      { slug: "harness-component", name: "Harness components (crimps, housings)" },
    ],
  },
  {
    slug: "mechanical",
    name: "Mechanical & box-build",
    children: [
      { slug: "enclosure", name: "Enclosures" },
      { slug: "fastener", name: "Fasteners & standoffs" },
    ],
  },
  {
    slug: "other",
    name: "Other",
    children: [
      { slug: "logic-ic", name: "Logic ICs & timers" },
      { slug: "uncategorised", name: "Uncategorised (imported)" },
    ],
  },
];

/** Leaves that may legitimately start empty (filled by distributor imports). */
export const IMPORT_ONLY_CATEGORIES = ["logic-ic", "uncategorised"];
