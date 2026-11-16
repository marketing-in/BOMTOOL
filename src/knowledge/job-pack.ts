import type { Article } from "./types";
import { CAM_NAMES, type CamLayer } from "../lib/board/cam-names";
import { decodeMpn, decodedLabel } from "../lib/bom/mpn-decode";

/**
 * Reading a customer's files (Phase 29): the job-pack workbook, the names of fabrication files, and what a passive's
 * part number says. Two of the tables are built from the tables the readers themselves use, so the page and the
 * tool cannot say different things.
 */

const LAYER_WORD: Record<string, string> = { copper: "copper", soldermask: "solder mask", silkscreen: "silkscreen (legend)", solderpaste: "solder paste", outline: "board outline", drill: "drill", drawing: "drawing" };
const layerLabel = (l: CamLayer) =>
  l.type === "drawing" ? `${l.label ?? "Drawing"} — kept out of the picture` : l.type === "outline" || l.type === "drill" ? LAYER_WORD[l.type].replace(/^./, (c) => c.toUpperCase()) : `${l.side === "top" ? "Top" : l.side === "bottom" ? "Bottom" : "Inner"} ${LAYER_WORD[l.type]}`;

/** One row per layer: every name that means it. */
function nameRows(group: (typeof CAM_NAMES)[number]): string[][] {
  const by = new Map<string, string[]>();
  for (const [name, layer] of Object.entries(group.names)) {
    const label = layerLabel(layer);
    by.set(label, [...(by.get(label) ?? []), group.where === "extension" ? `.${name.toUpperCase()}` : name]);
  }
  return [...by].map(([label, names]) => [names.join(", "), label]);
}

const example = (mpn: string, fields: string): string[] => {
  const d = decodeMpn(mpn);
  return [d?.maker ?? "", mpn, fields, d ? decodedLabel(d) : ""];
};

export const JOB_PACK_ARTICLES: Article[] = [
  {
    slug: "reading-a-job-pack",
    domain: "PROCESS",
    title: "Reading a customer's job pack",
    summary: "One workbook often carries everything the line needs: the BoM, where every part sits, what each side is loaded with and what stays empty. What each sheet is, how CAD tools write them, and what to check between them before the first board.",
    tags: ["job pack", "BoM", "XY", "centroid", "pick and place", "placement report", "load list", "DNP", "DNL", "not fitted", "Allegro", "NPI", "data check"],
    version: 1,
    related: ["bom-gerber-footprint-match", "fabrication-file-names", "passive-part-numbers", "pick-and-place", "smt-line-setup-changeover"],
    standards: [{ code: "IPC-2581 / ODB++", title: "Design data exchange that carries BoM, placements and layers in one package" }],
    sections: [
      {
        type: "text",
        heading: "What a job pack is",
        paragraphs: [
          "A customer who has built the board before rarely sends a bare BoM. They send the working file their last assembler used: the BoM, the placement report from the CAD tool, the lists the pick-and-place machine was loaded from, and the designators that are deliberately left empty. Each sheet answers a different question, and they were often edited by different people on different days.",
          "Reading only the first sheet throws most of it away. Reading all of them, and checking them against each other, finds the mistakes that otherwise show up as a wrong part on a finished board.",
        ],
      },
      {
        type: "table",
        heading: "The sheets, and what each is for",
        columns: ["Sheet", "What it holds", "Who works from it", "What the tool does with it"],
        rows: [
          ["Customer BoM", "One line per part: house code, description, maker's part number, package, designators, quantity. Often a last line for the bare board itself.", "Purchasing", "Becomes the BoM. The bare board's line becomes the board's spec, not a component."],
          ["Placement report (XY, centroid, pick-and-place file)", "One row per designator: X, Y, rotation, side, footprint and the design's value. Exported by the CAD tool, so it lists every footprint on the board.", "NPI, machine programming", "Becomes the placements: the 3D view, the footprint match, the machine check."],
          ["Load list, one per side", "One row per part the machine places on that side: part number, description, designator, X, Y, rotation.", "Machine programmer, line setup", "Checked against the placement report: same position, same angle, same side."],
          ["Not-fitted list (DNP), one per side", "Designators that have pads on the board and get no part.", "Programmer, AOI (it must expect empty pads), inspection", "Those designators become not-fitted lines, so BoM and board agree and the 3D view leaves the pads empty."],
        ],
        note: "The BoM is found by its header, not by its position: the sheet whose header reads most like a BoM is the BoM.",
      },
      {
        type: "table",
        heading: "How CAD tools write a placement report",
        columns: ["Tool", "Designator", "Position", "Rotation", "Side"],
        rows: [
          ["Altium (Pick and Place)", "Designator", "Center-X(mm), Center-Y(mm)", "Rotation", "Layer: TopLayer / BottomLayer"],
          ["KiCad (.pos)", "Ref", "PosX, PosY", "Rot", "Side: top / bottom"],
          ["Cadence Allegro (Placed Component Report)", "REFDES", "SYM_X, SYM_Y", "SYM_ROTATE", "SYM_MIRROR: NO = top, YES = bottom"],
          ["EasyEDA / JLC (CPL)", "Designator", "Mid X, Mid Y", "Rotation", "Layer: T / B"],
          ["Eagle (.mnt / .mnb)", "first column", "X, Y", "angle", "one file per side"],
          ["Machine load list", "RefDes", "X, Y", "R", "one sheet per side"],
        ],
        note: "Allegro also gives SYM_NAME (the footprint) and COMP_VALUE (the value in the schematic). A mirrored symbol is on the bottom: that is what SYM_MIRROR means.",
      },
      {
        type: "table",
        heading: "Words that mean \"leave the pads empty\"",
        columns: ["Written as", "Stands for"],
        rows: [
          ["DNP", "Do not populate / do not place"],
          ["DNF, NF", "Do not fit / not fitted"],
          ["DNI", "Do not install"],
          ["DNL", "Do not load"],
          ["DNM, NM", "Do not mount / not mounted"],
          ["NC (as a value)", "No component"],
          ["Quantity 0 beside designators", "The line is kept for the record; nothing is bought or placed"],
        ],
        note: "A not-fitted position is still a footprint: it takes paste unless the stencil is closed there, and AOI must be told to expect it empty.",
      },
      {
        type: "list",
        heading: "What to check between the sheets",
        tone: "tip",
        items: [
          "Count: fitted designators in the BoM plus not-fitted designators equals the placement report. Anything left over is on the board with no instruction.",
          "Each BoM line's quantity equals its number of designators.",
          "Every load-list row sits at the placement report's position, angle and side.",
          "The part number each load-list row names is one the BoM line for that designator names.",
          "The value in the design file equals the value in the BoM for every capacitor, resistor and inductor. Where they differ, the BoM was changed after layout (a tuned value) or one of them is wrong: ask.",
          "The part number agrees with its own description: value, voltage, size, tolerance, dielectric.",
          "The placement report and the Gerbers share an origin and a unit. A report measured from the board corner will not line up with Gerbers drawn in panel coordinates.",
        ],
      },
      {
        type: "list",
        heading: "What these checks catch",
        tone: "risk",
        items: [
          "A capacitor described as 50 V bought as a 10 V part because the second-source part number was never checked.",
          "A part number with characters lost in a copy and paste, which no distributor will find.",
          "A position loaded on the wrong side after a late layout change.",
          "A tuning value changed in the BoM and never in the design, so the next revision quietly reverts it.",
          "A connector or battery that is fitted by hand later, missing from every list.",
        ],
      },
      {
        type: "steps",
        heading: "What the tool does when you upload one",
        steps: [
          { title: "Reads every sheet", detail: "Names each one: BoM, placement report, load list, not-fitted list, or not used." },
          { title: "Takes the BoM", detail: "Finds the header under any title rows, maps the columns, splits a cell that holds two part numbers into the part and its alternate." },
          { title: "Takes the placements", detail: "From the CAD report; with none, from the per-side load lists." },
          { title: "Adds the not-fitted lines", detail: "For designators the board has and the BoM does not, when a list or a design value explains them." },
          { title: "Reads the bare board's line", detail: "Layers, thickness, copper, finish, colours and size go to the board's spec." },
          { title: "Checks", detail: "The sheets against each other, each part number against its description, and on the footprint-match step the BoM's values against the design's." },
        ],
      },
    ],
  },
  {
    slug: "fabrication-file-names",
    domain: "PCB",
    title: "Which Gerber file is which layer",
    summary: "A fabrication set is a folder of files that each draw one layer. How CAD and CAM tools name them — by extension, by a two-letter name, or in a comment inside the file — and what changes when the set comes back from a fabricator as a panel.",
    tags: ["Gerber", "RS-274X", "X2", "Excellon", "layer", "GTL", "GKO", "CAM", "panel", "drill", "via plugging", "file names"],
    version: 1,
    related: ["pcb-design-data", "fiducials-panelization", "reading-a-job-pack", "pcb-fab-process"],
    standards: [
      { code: "Gerber RS-274X / X2", title: "The layer image format; X2 adds a file-function attribute that says which layer a file is" },
      { code: "IPC-NC-349 (Excellon)", title: "Drill and rout data" },
    ],
    sections: [
      {
        type: "text",
        heading: "Why the name matters",
        paragraphs: [
          "A Gerber file is a picture of one layer and, unless it carries the X2 attribute, nothing in the picture says which layer it is. The name is the only label. Every CAD tool has its own habit, and a fabricator's CAM station re-exports the job under its own names again.",
          "The tool looks, in this order, at the X2 file function, a KiCad-style name, the extension, the file's own format (a drill file is recognisable by what is in it), a comment near the top that names the layer, and the bare name.",
        ],
      },
      ...CAM_NAMES.map((g) => ({
        type: "table" as const,
        heading: `${g.tool} — by ${g.where === "extension" ? "extension" : "name"}`,
        columns: [g.where === "extension" ? "Extension" : "Name", "Layer"],
        rows: nameRows(g),
        note: g.note,
      })),
      {
        type: "table",
        heading: "A comment inside the file",
        columns: ["Line near the top of the file", "Written by", "Layer"],
        rows: [
          ["G04 -- layer:tl*", "A CAM station re-exporting a job", "Top copper"],
          ["G04 Layer: BottomSilkLayer*", "EasyEDA", "Bottom silkscreen"],
          ["%TF.FileFunction,Soldermask,Top*%", "Any tool that writes Gerber X2", "Top solder mask"],
        ],
        note: "Inner copper is numbered from the top: l2, g2 or in1 is the first layer under the top.",
      },
      {
        type: "text",
        heading: "Drill files",
        paragraphs: [
          "Holes normally come as Excellon: a list of tools with their diameters, then coordinates. Plated and non-plated holes are often in separate files. Slots are written as a start and an end point.",
          "A CAM station sometimes writes the drill layer as a Gerber instead: round flashes for holes, short strokes for slots, the aperture diameter being the hole size. Read as Excellon it is empty. The tool recognises it and reads the flashes as holes.",
        ],
      },
      {
        type: "text",
        heading: "When the set is a panel",
        paragraphs: [
          "The fabricator builds boards in panels: the same board stepped out in rows and columns, with rails for the conveyor, tooling holes, fiducials and break-off tabs. If the Gerbers you are given came from the fabricator's CAM (the step is often called \"set\" or \"panel\"), they draw every board.",
          "The tool finds the repeat in the outline layer — the same closed outline on a regular grid, or one frame cut by score lines — checks that every position holds the same artwork, cuts one board out of every layer and moves it to 0,0. The panel's own figures are kept and shown on the bare-board step.",
        ],
      },
      {
        type: "facts",
        heading: "What a panel adds around the boards",
        items: [
          { label: "Rails", value: "Waste strips, usually 5 to 10 mm, on two opposite sides: what the conveyor and the clamps hold" },
          { label: "Tooling holes", value: "Non-plated, 2 to 3.2 mm, in the rails; one is offset so the panel cannot go in turned round" },
          { label: "Panel fiducials", value: "Bare 1 mm copper dots with a 2 to 3 mm clear ring in the mask, three of them, not symmetrical" },
          { label: "Mouse bites", value: "Rows of 0.5 to 0.8 mm holes through the tabs, so a board snaps out leaving a rough edge on the tab only" },
          { label: "V-score", value: "A groove cut from both faces leaving about a third of the thickness; boards share edges, no gap" },
          { label: "Via plugging layer", value: "A fabrication-only layer marking the vias to fill with mask ink, so solder and flux cannot pass" },
        ],
      },
    ],
  },
  {
    slug: "passive-part-numbers",
    domain: "COMPONENT",
    title: "Reading a passive's part number",
    summary: "Makers of ceramic capacitors, chip resistors and chip inductors build the value, voltage, tolerance, dielectric and size into the part number. Reading it checks a BoM line against its own description without looking anything up.",
    tags: ["MLCC", "capacitor", "resistor", "inductor", "part number", "MPN", "decode", "EIA code", "voltage code", "tolerance", "dielectric", "second source"],
    version: 1,
    related: ["reading-a-job-pack", "package-chip", "bom-gerber-footprint-match"],
    sections: [
      {
        type: "text",
        heading: "Why read it",
        paragraphs: [
          "The description is what the designer meant. The part number is what gets bought. On a line with a second source, the two part numbers were usually typed by hand, years apart. Reading each number field by field shows at once whether it is the part the description asks for.",
          "A number that follows its maker's pattern only part of the way has lost characters somewhere: it will match nothing at a distributor and should go back to the customer.",
        ],
      },
      {
        type: "table",
        heading: "Ceramic capacitors, field by field",
        columns: ["Maker", "Example", "The fields, in order", "Reads as"],
        rows: [
          example("GRM155R71A104JA01D", "series · size · thickness · dielectric · voltage · value · tolerance · spec · packing"),
          example("CL05A105KO5NNNC", "series · size · dielectric · value · tolerance · voltage · the rest"),
          example("CC0402KRX7R9BB104", "series · size · tolerance · packing · dielectric · voltage · process · value"),
          example("C1005X7R1H104K050BB", "series · metric size · dielectric · voltage · value · tolerance · thickness · packing"),
          example("0402N101J500CT", "size · dielectric · value · tolerance · voltage · termination · packing"),
          example("EMK105BJ105KV-F", "voltage · series · size · dielectric · value · tolerance · thickness · packing"),
          example("C0402C104K4RACTU", "series · size · style · value · tolerance · voltage · dielectric · the rest"),
          example("04025C104KAT2A", "size · voltage · dielectric · value · tolerance · the rest"),
        ],
        note: "Sizes: Murata and Samsung use two digits (15 or 05 = 0402, 18 or 10 = 0603, 21 = 0805); TDK and Taiyo Yuden use the metric size (1005 or 105 = 0402).",
      },
      {
        type: "table",
        heading: "The value code",
        columns: ["Code", "How to read it", "Value"],
        rows: [
          ["104", "10 followed by 4 zeros, in picofarads", "100 nF"],
          ["105", "10 followed by 5 zeros, in picofarads", "1 µF"],
          ["101", "10 followed by 1 zero, in picofarads", "100 pF"],
          ["8R2", "R is the decimal point", "8.2 pF"],
          ["109", "A last 9 means ×0.1", "1 pF"],
          ["103 (resistor, 5 %)", "10 followed by 3 zeros, in ohms", "10 kΩ"],
          ["1002 (resistor, 1 %)", "100 followed by 2 zeros, in ohms", "10 kΩ"],
          ["4K7, 10K0, 4R7", "The letter is the decimal point and the multiplier", "4.7 kΩ, 10 kΩ, 4.7 Ω"],
          ["47N, 4N7, R10 (RF inductor)", "Nanohenries; R counts in microhenries", "47 nH, 4.7 nH, 100 nH"],
          ["2R2, 100 (power inductor)", "Microhenries", "2.2 µH, 10 µH"],
        ],
      },
      {
        type: "table",
        heading: "Voltage codes on capacitors",
        columns: ["Rated voltage", "Murata, TDK", "Samsung", "Yageo", "Kemet", "Taiyo Yuden", "Walsin"],
        rows: [
          ["6.3 V", "0J", "Q", "5", "9", "J", "6R3"],
          ["10 V", "1A", "P", "6", "8", "L", "100"],
          ["16 V", "1C", "O", "7", "4", "E", "160"],
          ["25 V", "1E", "A", "8", "3", "T", "250"],
          ["50 V", "1H", "B", "9", "5", "U", "500"],
          ["100 V", "2A", "C", "0", "1", "H", "101"],
        ],
        note: "A part rated above what the description asks for is fine. A part rated below it is the mistake to stop.",
      },
      {
        type: "table",
        heading: "Tolerance letters",
        columns: ["Letter", "Capacitors", "Resistors"],
        rows: [
          ["B", "±0.1 pF", "±0.1 %"],
          ["C", "±0.25 pF", "±0.25 %"],
          ["D", "±0.5 pF", "±0.5 %"],
          ["F", "±1 %", "±1 %"],
          ["G", "±2 %", "±2 %"],
          ["J", "±5 %", "±5 %"],
          ["K", "±10 %", "±10 %"],
          ["M", "±20 %", "±20 %"],
        ],
      },
      {
        type: "table",
        heading: "Chip resistors and inductors",
        columns: ["Maker", "Example", "The fields, in order", "Reads as"],
        rows: [
          example("RC0402FR-0710KL", "series · size · tolerance · packing · value"),
          example("CRCW040210K0FKED", "series · size · value · tolerance · the rest"),
          example("ERJ-2RKF1002X", "series and size · tolerance · value · packing"),
          example("RK73H1ETTP1002F", "series · class · size · packing · value · tolerance"),
          example("LQG15HS47NJ02D", "series · size · type · value · tolerance · the rest"),
          example("LQM21PN2R2MC0D", "series · size · type · value · tolerance · the rest"),
        ],
      },
      {
        type: "list",
        heading: "What the tool flags on a BoM line",
        tone: "risk",
        items: [
          "Another value: the part number is not the value the description gives.",
          "A lower voltage: the part number is rated below the description.",
          "Another size: the part number's case size is not the line's package.",
          "A wider tolerance or a lesser dielectric than asked for (X5R where X7R is written).",
          "An incomplete number: it starts like a known series and does not follow it through.",
        ],
      },
    ],
  },
];
