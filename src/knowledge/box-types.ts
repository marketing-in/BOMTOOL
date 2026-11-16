/**
 * Box types — how a finished product is housed. Versioned seed data (Phase 12). `makerStyle` links a type to
 * enclosure makers' capabilities (Supplier.capabilities.styles); `enclosureStyle` to our enclosure catalogue
 * (src/lib/board/enclosures.ts).
 */

export type BoxType = {
  slug: string;
  name: string;
  summary: string;
  materials: string[];
  /** Typical IP range. */
  ip: [string, string];
  uses: string[];
  pros: string[];
  cons: string[];
  /** EMC: does the shell itself shield? */
  shielding: "good" | "partial" | "none";
  /** Machining for connectors/displays. */
  machining: string;
  makerStyle: "diecast" | "extruded" | "moulded" | "sheet-metal";
  enclosureStyle: "diecast" | "extruded" | "moulded" | null;
  /** Typical lead for catalogue sizes; custom tooling adds weeks. */
  leadDays: number;
};

export const BOX_TYPES: BoxType[] = [
  {
    slug: "diecast-aluminium",
    name: "Die-cast aluminium box",
    summary: "A cast aluminium body with a screwed lid — rugged and shielding.",
    materials: ["Aluminium alloy (A380/ADC12)", "Optional powder coat"],
    ip: ["IP54", "IP67"],
    uses: ["Motor controllers", "Outdoor sensors", "RF modules", "Industrial interfaces"],
    pros: ["Strong and heat-conducting", "Shields RF and ESD", "Gasketed versions reach IP66/67"],
    cons: ["Heavier", "Drilling and tapping per connector", "Limited inner draft angles"],
    shielding: "good",
    machining: "CNC drilling and tapping for glands and connectors; powder coat after machining.",
    makerStyle: "diecast",
    enclosureStyle: "diecast",
    leadDays: 14,
  },
  {
    slug: "extruded-aluminium",
    name: "Extruded aluminium enclosure",
    summary: "An aluminium profile cut to length with two end panels; the board slides into slots.",
    materials: ["6063 aluminium, anodised", "Aluminium or ABS end panels"],
    ip: ["IP40", "IP65"],
    uses: ["Gateways", "Data loggers", "Desktop and DIN-adjacent instruments"],
    pros: ["Any length", "Board slides in — fast assembly", "End panels are easy to machine and print"],
    cons: ["Board width must match the slots", "Higher IP needs gaskets and sealed panels"],
    shielding: "good",
    machining: "Cut-outs on the end panels only; the profile stays plain.",
    makerStyle: "extruded",
    enclosureStyle: "extruded",
    leadDays: 10,
  },
  {
    slug: "moulded-plastic",
    name: "Moulded plastic box (ABS / PC)",
    summary: "Injection-moulded halves or body + lid, standard or custom.",
    materials: ["ABS (UL94-HB/V0)", "Polycarbonate (UV-stable, impact)", "PC/ABS"],
    ip: ["IP40", "IP67"],
    uses: ["Consumer products", "Handhelds", "Wall sensors", "Battery products"],
    pros: ["Light and cheap at volume", "Any colour and shape", "Radio-transparent for wireless products"],
    cons: ["No shielding without coating", "Custom moulds cost time and money", "Heat stays inside"],
    shielding: "none",
    machining: "Standard boxes: CNC cut-outs; custom: features moulded in.",
    makerStyle: "moulded",
    enclosureStyle: "moulded",
    leadDays: 21,
  },
  {
    slug: "sheet-metal",
    name: "Sheet-metal chassis",
    summary: "Folded steel or aluminium sheet, often with a separate cover.",
    materials: ["CRCA steel, powder coated", "Aluminium 5052", "Stainless 304"],
    ip: ["IP20", "IP54"],
    uses: ["Power supplies", "Control cabinets", "19-inch and bench equipment"],
    pros: ["Cheap tooling (laser + press brake)", "Large sizes", "Easy to change"],
    cons: ["Gaps limit IP and shielding unless gasketed", "Needs PEM inserts for mounting"],
    shielding: "partial",
    machining: "Cut-outs in the flat pattern before bending; PEM studs and standoffs pressed in.",
    makerStyle: "sheet-metal",
    enclosureStyle: null,
    leadDays: 10,
  },
  {
    slug: "din-rail",
    name: "DIN-rail module housing",
    summary: "Modular plastic housing that clips onto a 35 mm rail in a panel.",
    materials: ["PC / PA, UL94-V0"],
    ip: ["IP20", "IP40"],
    uses: ["PLC I/O", "Industrial gateways", "Meters and relays"],
    pros: ["Standard panel mounting", "Pluggable terminal blocks", "Front labels"],
    cons: ["Fixed widths (modules of 17.5 mm)", "Low IP — needs a cabinet"],
    shielding: "none",
    machining: "Front window and terminal openings are moulded; labels printed.",
    makerStyle: "moulded",
    enclosureStyle: "moulded",
    leadDays: 14,
  },
  {
    slug: "sealed-ip67",
    name: "Sealed field box (IP67/IP68)",
    summary: "Gasketed polycarbonate or aluminium box with cable glands or sealed connectors.",
    materials: ["Polycarbonate with silicone gasket", "Die-cast aluminium with gasket"],
    ip: ["IP66", "IP68"],
    uses: ["Outdoor IoT nodes", "Agriculture", "Street lighting controllers"],
    pros: ["Rain, dust and washdown proof", "Pressure-equalising vents available"],
    cons: ["Every opening needs a sealed part", "Condensation management"],
    shielding: "partial",
    machining: "Gland holes and vent; M12 or sealed connectors.",
    makerStyle: "diecast",
    enclosureStyle: "diecast",
    leadDays: 18,
  },
  {
    slug: "handheld",
    name: "Handheld / wearable shell",
    summary: "Ergonomic two-part shell with battery compartment, often custom moulded.",
    materials: ["PC/ABS", "TPE over-mould"],
    ip: ["IP40", "IP65"],
    uses: ["Meters", "Remotes", "Scanners", "Wearables"],
    pros: ["Comfortable, branded look", "Battery door and display window built in"],
    cons: ["Custom tooling", "Drop testing and EMC need care"],
    shielding: "none",
    machining: "Mostly moulded features; keypad and window inserts.",
    makerStyle: "moulded",
    enclosureStyle: "moulded",
    leadDays: 35,
  },
];

export const boxType = (slug: string) => BOX_TYPES.find((b) => b.slug === slug) ?? null;
