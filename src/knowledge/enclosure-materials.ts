/**
 * Enclosure materials and surface finishes. Versioned seed data (Phase 12). Values are typical figures for
 * comparing materials; the grade's datasheet and the maker's process decide.
 */

export type EnclosureMaterial = {
  slug: string;
  name: string;
  family: "Aluminium" | "Zinc & magnesium" | "Steel" | "Plastic" | "Composite" | "Gasket & seal";
  /** g/cm³ */
  density: number;
  /** Continuous service temperature, °C. */
  maxTempC: number;
  /** UL 94 flammability class (plastics) or "non-combustible". */
  flammability: string;
  uv: "good" | "fair" | "poor";
  chemical: "good" | "fair" | "poor";
  shielding: "good" | "partial" | "none";
  /** W/m·K */
  k: string;
  processes: string[];
  cost: number;
  uses: string[];
  notes: string;
};

export const ENCLOSURE_MATERIALS: EnclosureMaterial[] = [
  { slug: "al-6063", name: "Aluminium 6063 (extrusion alloy)", family: "Aluminium", density: 2.7, maxTempC: 150, flammability: "non-combustible", uv: "good", chemical: "fair", shielding: "good", k: "200", processes: ["Extrusion", "CNC", "Anodising"], cost: 1.6, uses: ["Extruded enclosures", "Heatsinks", "Rails"], notes: "Excellent surface for anodising; the standard extrusion alloy." },
  { slug: "al-5052", name: "Aluminium 5052 (sheet)", family: "Aluminium", density: 2.68, maxTempC: 150, flammability: "non-combustible", uv: "good", chemical: "good", shielding: "good", k: "138", processes: ["Laser cutting", "Bending", "Welding"], cost: 1.7, uses: ["Sheet-metal covers", "Marine housings"], notes: "Bends well, good corrosion resistance." },
  { slug: "al-adc12", name: "Die-cast aluminium (ADC12 / A380)", family: "Aluminium", density: 2.74, maxTempC: 150, flammability: "non-combustible", uv: "good", chemical: "fair", shielding: "good", k: "92–96", processes: ["High-pressure die casting", "CNC finishing", "Powder coat"], cost: 1.5, uses: ["Die-cast boxes", "Motor housings", "Outdoor enclosures"], notes: "Complex shapes with fins and bosses; porosity limits anodising — usually powder coated." },
  { slug: "zamak3", name: "Zinc die-cast (Zamak 3)", family: "Zinc & magnesium", density: 6.6, maxTempC: 100, flammability: "non-combustible", uv: "good", chemical: "fair", shielding: "good", k: "113", processes: ["Die casting (hot chamber)", "Plating"], cost: 1.4, uses: ["Small heavy housings", "Connector shells", "Knobs"], notes: "Very fine detail and thin walls, but heavy and creeps under load at temperature." },
  { slug: "mg-az91", name: "Magnesium AZ91D", family: "Zinc & magnesium", density: 1.81, maxTempC: 120, flammability: "non-combustible (chips flammable)", uv: "fair", chemical: "poor", shielding: "good", k: "72", processes: ["Thixomolding", "Die casting"], cost: 2.5, uses: ["Handheld and laptop shells", "Camera bodies"], notes: "Lightest structural metal; needs conversion coating against corrosion." },
  { slug: "steel-crca", name: "Cold-rolled steel (CRCA / DC01)", family: "Steel", density: 7.85, maxTempC: 300, flammability: "non-combustible", uv: "good", chemical: "poor", shielding: "good", k: "50", processes: ["Laser cutting", "Bending", "Spot welding", "Powder coat"], cost: 1, uses: ["Cabinets", "Power supply chassis", "19-inch equipment"], notes: "Cheapest sheet metal; must be painted or plated. Magnetic shielding at low frequency." },
  { slug: "steel-gi", name: "Galvanised steel (GI / SECC)", family: "Steel", density: 7.85, maxTempC: 250, flammability: "non-combustible", uv: "good", chemical: "fair", shielding: "good", k: "50", processes: ["Laser cutting", "Bending", "Clinching"], cost: 1.1, uses: ["Internal chassis", "PC cases"], notes: "Zinc coat protects bare edges; conductive for EMC bonding." },
  { slug: "ss-304", name: "Stainless steel 304", family: "Steel", density: 8.0, maxTempC: 400, flammability: "non-combustible", uv: "good", chemical: "good", shielding: "partial", k: "16", processes: ["Laser cutting", "Bending", "TIG welding", "Brushing"], cost: 3, uses: ["Food and pharma equipment", "Washdown housings"], notes: "No paint needed; hard to machine; weakly magnetic." },
  { slug: "ss-316", name: "Stainless steel 316", family: "Steel", density: 8.0, maxTempC: 400, flammability: "non-combustible", uv: "good", chemical: "good", shielding: "partial", k: "16", processes: ["Laser cutting", "Bending", "Welding"], cost: 4, uses: ["Marine", "Chemical plants"], notes: "Molybdenum adds chloride resistance over 304." },
  { slug: "abs", name: "ABS", family: "Plastic", density: 1.04, maxTempC: 80, flammability: "UL94 HB (V-0 grades available)", uv: "poor", chemical: "fair", shielding: "none", k: "0.17", processes: ["Injection moulding", "CNC", "3D printing"], cost: 1, uses: ["Indoor consumer housings", "Standard project boxes"], notes: "Easy to mould, paint and glue; yellows outdoors." },
  { slug: "pc", name: "Polycarbonate (PC)", family: "Plastic", density: 1.2, maxTempC: 120, flammability: "UL94 V-2 (V-0 grades)", uv: "fair", chemical: "fair", shielding: "none", k: "0.2", processes: ["Injection moulding", "Extrusion"], cost: 1.5, uses: ["Outdoor and IP67 boxes", "Transparent lids", "Impact-resistant housings"], notes: "Tough and clear; UV-stabilised grades for outdoors; stress-cracks with some solvents." },
  { slug: "pc-abs", name: "PC/ABS blend", family: "Plastic", density: 1.15, maxTempC: 100, flammability: "UL94 V-0 grades common", uv: "poor", chemical: "fair", shielding: "none", k: "0.2", processes: ["Injection moulding"], cost: 1.3, uses: ["Handhelds", "Chargers", "Instrument housings"], notes: "Tougher than ABS, easier than PC; common for flame-rated products." },
  { slug: "asa", name: "ASA", family: "Plastic", density: 1.07, maxTempC: 85, flammability: "UL94 HB", uv: "good", chemical: "fair", shielding: "none", k: "0.17", processes: ["Injection moulding", "Extrusion"], cost: 1.3, uses: ["Outdoor housings", "Automotive exterior parts"], notes: "ABS-like but UV stable." },
  { slug: "pa66-gf", name: "PA66-GF30 (glass-filled nylon)", family: "Plastic", density: 1.36, maxTempC: 130, flammability: "UL94 HB (V-0 grades)", uv: "fair", chemical: "good", shielding: "none", k: "0.3", processes: ["Injection moulding"], cost: 1.8, uses: ["Structural brackets", "Connector housings", "Automotive"], notes: "Stiff and strong; absorbs moisture which changes dimensions." },
  { slug: "pbt-gf", name: "PBT-GF (glass-filled polyester)", family: "Plastic", density: 1.5, maxTempC: 140, flammability: "UL94 V-0 grades", uv: "fair", chemical: "good", shielding: "none", k: "0.25", processes: ["Injection moulding"], cost: 1.8, uses: ["Connector bodies", "Relay housings", "Sensor housings"], notes: "Dimensionally stable, good electrical properties." },
  { slug: "pp", name: "Polypropylene (PP)", family: "Plastic", density: 0.9, maxTempC: 100, flammability: "UL94 HB", uv: "poor", chemical: "good", shielding: "none", k: "0.12", processes: ["Injection moulding", "Living hinges"], cost: 0.8, uses: ["Battery boxes", "Chemical-resistant lids"], notes: "Light and cheap; hard to paint or glue." },
  { slug: "grp", name: "Glass-reinforced polyester (GRP / SMC)", family: "Composite", density: 1.85, maxTempC: 130, flammability: "self-extinguishing grades", uv: "good", chemical: "good", shielding: "none", k: "0.3", processes: ["Compression moulding (SMC/BMC)"], cost: 2, uses: ["Outdoor distribution boxes", "Meter cabinets"], notes: "Very durable outdoors; heavy and limited in shape." },
  { slug: "epdm", name: "EPDM gasket", family: "Gasket & seal", density: 1.2, maxTempC: 130, flammability: "—", uv: "good", chemical: "good", shielding: "none", k: "0.25", processes: ["Die-cut", "Extruded profile"], cost: 1, uses: ["Outdoor seals"], notes: "Weather and ozone resistant; not for oils." },
  { slug: "silicone", name: "Silicone gasket", family: "Gasket & seal", density: 1.2, maxTempC: 200, flammability: "UL94 V-0 grades", uv: "good", chemical: "fair", shielding: "none", k: "0.2", processes: ["Die-cut", "Moulded", "Form-in-place"], cost: 1.5, uses: ["IP67 lids", "High-temperature seals"], notes: "Wide temperature range; conductive grades for EMI gaskets." },
  { slug: "pu-fip", name: "Polyurethane form-in-place gasket", family: "Gasket & seal", density: 0.4, maxTempC: 80, flammability: "—", uv: "fair", chemical: "fair", shielding: "none", k: "0.05", processes: ["Robot-dispensed foam"], cost: 1.2, uses: ["Moulded lids", "Complex outlines"], notes: "Dispensed straight onto the part; no gasket inventory." },
];

export type EnclosureFinish = { slug: string; name: string; on: string; detail: string; conductive: boolean };

export const ENCLOSURE_FINISHES: EnclosureFinish[] = [
  { slug: "anodise-ii", name: "Anodising type II (decorative)", on: "Aluminium", detail: "5–25 µm oxide, dyed in colours; hard-wearing and insulating.", conductive: false },
  { slug: "anodise-iii", name: "Hard anodising type III", on: "Aluminium", detail: "25–75 µm, very wear resistant; dark grey/black.", conductive: false },
  { slug: "chromate", name: "Chromate / trivalent conversion (Alodine)", on: "Aluminium, zinc", detail: "Thin conductive corrosion protection — keeps EMC bonding points conductive.", conductive: true },
  { slug: "powder", name: "Powder coating", on: "Steel, aluminium, die-cast", detail: "60–120 µm epoxy/polyester, any RAL colour and texture; mask bonding points.", conductive: false },
  { slug: "e-coat", name: "E-coat (cathodic electrocoat)", on: "Steel", detail: "Thin, even primer reaching inside cavities; often under powder.", conductive: false },
  { slug: "zinc-plate", name: "Zinc plating", on: "Steel", detail: "5–12 µm with passivation; conductive, cheap corrosion protection.", conductive: true },
  { slug: "passivate", name: "Passivation / brushing", on: "Stainless steel", detail: "Restores the oxide after machining; brushed or bead-blasted look.", conductive: true },
  { slug: "texture", name: "Mould texture (VDI / Mold-Tech)", on: "Plastics", detail: "Textured tool surface hides scratches and sink marks.", conductive: false },
  { slug: "emi-coat", name: "EMI coating (Ni / Cu paint or vacuum metallising)", on: "Plastics", detail: "Conductive layer inside a plastic box for shielding.", conductive: true },
  { slug: "pad-print", name: "Pad printing / screen printing", on: "All", detail: "Logos, labels and front-panel legends.", conductive: false },
  { slug: "laser-mark", name: "Laser marking", on: "Anodised Al, plastics, steel", detail: "Permanent serials, QR codes and logos without ink.", conductive: false },
  { slug: "iml", name: "In-mould decoration (IMD / IML)", on: "Plastics", detail: "Printed film moulded into the part — durable front panels.", conductive: false },
];
