/**
 * What a customer's file says about itself (Phase 37): the board or product name, its number and revision, the build
 * quantity, the board's size and stack-up, notes, and totals to check the tables against. Read from the rows above a
 * table (a title block, a CAD tool's report header), from sheets of label/value pairs, from free-text notes, from the
 * bare board's BoM line and from the file name. Every value keeps where it came from. Pure.
 */

export type DetailKey =
  | "name"
  | "product"
  | "partNumber"
  | "revision"
  | "pcbRevision"
  | "customer"
  | "buildQty"
  | "project"
  | "variant"
  | "date"
  | "tool"
  | "boardSize"
  | "productSize"
  | "layers"
  | "thickness"
  | "finish"
  | "mask"
  | "silk"
  | "material"
  | "copper";

export const DETAIL_LABEL: Record<DetailKey, string> = {
  name: "Board / assembly",
  product: "Product",
  partNumber: "Part number",
  revision: "Revision",
  pcbRevision: "PCB revision",
  customer: "Customer",
  buildQty: "Build qty",
  project: "Design file",
  variant: "Variant",
  date: "Date",
  tool: "Made with",
  boardSize: "Board size",
  productSize: "Product size",
  layers: "Layers",
  thickness: "Thickness",
  finish: "Finish",
  mask: "Solder mask",
  silk: "Legend",
  material: "Material",
  copper: "Copper",
};

/** Where a value was read, strongest first: a sheet of details, a title block, the bare board's line, a design-file path, the file name. */
export type DetailVia = "sheet" | "title" | "board-line" | "path" | "file-name";
const VIA_RANK: Record<DetailVia, number> = { sheet: 0, title: 1, "board-line": 2, path: 3, "file-name": 4 };

export type FileDetail = { key: DetailKey | null; label: string; value: string; from: string; via: DetailVia };
export type FileNote = { text: string; from: string };
/** What a count in the file is about: designators, BoM lines, pieces per board, part options. */
export type CountWhat = "designators" | "designators-with-mpn" | "designators-with-any-mpn" | "lines" | "pieces" | "options" | "placements";
export type TotalCheck = { label: string; said: number; what: CountWhat; from: string; sheet: string | null; read?: number | null };
export type PackDetails = { items: FileDetail[]; notes: FileNote[]; totals: TotalCheck[] };

export const emptyDetails = (): PackDetails => ({ items: [], notes: [], totals: [] });

/** Where a cell sits: the sheet's own row numbers, so a value can be found again in Excel. */
export type SheetPos = { name: string | null; rowNo: number[]; col0: number };

function columnLetter(n: number): string {
  let s = "";
  for (let c = n + 1; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
}
export function cellAt(pos: SheetPos, i: number, j: number): string {
  const row = pos.rowNo[i] ?? i + 1;
  return pos.name === null ? `row ${row}` : `“${pos.name}” ${columnLetter(pos.col0 + j)}${row}`;
}
export function rowAt(pos: SheetPos, i: number): string {
  const row = pos.rowNo[i] ?? i + 1;
  return pos.name === null ? `row ${row}` : `“${pos.name}” row ${row}`;
}

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");

/** A label in a details sheet or a "Label: value" line, to the detail it gives. */
const LABEL_KEY: [RegExp, DetailKey][] = [
  [/^(pcb|board|bareboard|pwb|fab|fabrication)(rev|revision|version|ver)(no|number)?$/, "pcbRevision"],
  [/^(bom|assembly|pcba|document|doc|drawing)?(rev|revision|version|ver|issue)(no|number|level)?$/, "revision"],
  [/^(board|boardname|pcb|pcbname|pcba|pcbaname|assembly|assemblyname|title|name|boardtitle|design|designname|module)$/, "name"],
  [/^(product|productname|model|device|item|itemname)$/, "product"],
  [
    /^(partnumber|partno|pn|assemblypartnumber|assemblypn|assemblyno|assemblynumber|boardpartnumber|boardpn|pcbapartnumber|pcbapn|sourcebomidentifier|bomidentifier|bomid|bomnumber|bomno|bompartnumber|drawingnumber|drawingno|documentnumber|documentno|docno|toplevelpartnumber|productcode|productnumber)$/,
    "partNumber",
  ],
  [/^(customer|customername|client|clientname|oem|endcustomer)$/, "customer"],
  [/^(buildqty|buildquantity|orderqty|orderquantity|quantity|qty|lotsize|batchsize|batchqty|qtytobuild|quantitytobuild|productionqty|productionquantity|boardstobuild|units)$/, "buildQty"],
  [/^(project|projectname|projectfile|designfile|pcbfile|boardfile)$/, "project"],
  [/^(variant|assemblyvariant|bomvariant)$/, "variant"],
  [/^(date|reportdate|exported|exportdate|exportedon|created|createdon|generated|generatedon|dated|issuedate|releasedate|printdate|revisiondate)$/, "date"],
  [/^(generatedby|tool|cadtool|software|exportedfrom|createdwith|eda|edatool|designtool)$/, "tool"],
  [/^(size|boardsize|pcbsize|dimensions|boarddimensions|pcbdimensions|outline|boardoutline|productsize|overallsize|enclosuresize)$/, "boardSize"],
  [/^(layers|layercount|nooflayers|numberoflayers|copperlayers)$/, "layers"],
  [/^(thickness|boardthickness|pcbthickness)$/, "thickness"],
  [/^(finish|surfacefinish|platingfinish)$/, "finish"],
  [/^(soldermask|mask|maskcolou?r|soldermaskcolou?r)$/, "mask"],
  [/^(silkscreen|silk|legend|silkscreencolou?r|legendcolou?r)$/, "silk"],
  [/^(material|basematerial|laminate|pcbmaterial|boardmaterial)$/, "material"],
  [/^(copper|copperweight|copperthickness|copperoz)$/, "copper"],
];

/** A count the file gives, to what it should equal in the tables. */
const COUNT_LABEL: [RegExp, CountWhat][] = [
  [/^(placements|designators|references|components)with(a|the)?(primary)(mpn|partnumber)/, "designators-with-mpn"],
  [/^(placements|designators|references|components)with(atleastone|any|an)(mpn|partnumber)/, "designators-with-any-mpn"],
  [/^(total)?placedcomponents$/, "placements"],
  [/^(component)?placements$|^(total)?designators$|^(total)?referencedesignators$|^references$/, "designators"],
  [/^(bomitems|bomitemsforplacements|bomlines|partlines|lines|lineitems|partnumbers|uniqueparts|uniquepartnumbers|items|uniqueitems|noofitems|numberofitems)$/, "lines"],
  [/^(parts|pieces|totalparts|totalpieces|components|totalcomponents|totalqty|totalquantity|partcount|componentcount|parts(per)?(board|pcb))$/, "pieces"],
  [/^(primaryandalternateentries|partoptions|alternateentries|alternates|bomentries)$/, "options"],
];

export function labelKey(label: string): DetailKey | null {
  const n = norm(label);
  return LABEL_KEY.find(([re]) => re.test(n))?.[1] ?? null;
}
function countOf(label: string, value: string): CountWhat | null {
  if (!/^\d[\d,]*$/.test(value.trim())) return null;
  const n = norm(label);
  return COUNT_LABEL.find(([re]) => re.test(n))?.[1] ?? null;
}

/** Words that name the document, not the board: "BOM", "Bill of Materials", "Placed Component Report". */
const GENERIC = /^(bom|b\.o\.m\.?|bill\s*of\s*materials?|parts?\s*list|component\s*list|material\s*list|placed\s*component\s*report|pick\s*(and|&|n)\s*place|centroid|xy\s*data|assembly\s*drawing|customer\s*bom|macro\s*bom|load\s*list|primary\s*and\s*alternate\s*bom\s*parts|top|bottom|top\s*side|bottom\s*side|notes?|remarks?|details?|summary|about|scope)$/i;
const TOOL = /\b(altium(\s*designer)?|kicad|eagle|orcad|cadence(\s*allegro)?|allegro|pads|xpedition|easyeda|proteus|diptrace|circuitmaker|fusion\s*360|zuken|solidworks\s*pcb)\b/i;
const REV = /\b(?:rev(?:ision)?|ver(?:sion)?)\.?\s*[:#-]?\s*([A-Z]?\d+(?:\.\d+)*[A-Z]?|[A-Z]{1,2}\d?)\b/i;
const DATE = /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+(?:[\d:]+\s+)?\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4})(?:\s+[\d:]+)?$/i;
const PATH = /^[A-Za-z]:[\\/]|^\/[\w.-]+\/|^\\\\|[\\/][^\\/]+\.(brd|pcbdoc|prjpcb|kicad_pcb|kicad_pro|pcb|sch|schdoc|dsn|brd)$/i;
const DESIGN_FILE = /^[\w .-]+\.(brd|pcbdoc|prjpcb|kicad_pcb|kicad_pro|sch|schdoc|dsn)$/i;
/** A sentence: a full stop between words ("… designators. Filter …"), a closing full stop, or too many words to be a title. */
const isProse = (t: string) => t.split(/\s+/).length > 8 || /[a-z]{2,}\.\s+[A-Z][a-z]/.test(t) || (/[a-z]\.$/.test(t) && t.split(/\s+/).length >= 4);
/** "SENSOR-HUB.PrjPcb" → "SENSOR-HUB": a design file names the board. */
const designName = (file: string) => file.replace(/\.[a-z_]+$/i, "").trim();

/** A revision as people compare them: "REV 3.0", "Rev3", "3" and "R3.0" are one revision. */
export function sameRevision(a: string, b: string): boolean {
  const n = (r: string) => r.trim().toUpperCase().replace(/^(REV(ISION)?\.?|VER(SION)?\.?|R|V)\s*/, "").replace(/(\.0+)+$/, "").replace(/^0+(?=\d)/, "");
  return n(a) === n(b);
}

/** "TYPE7 V1 SS BOARD REV 3.0" → name and revision; "ASUS PRIME H310M-A R2.0 · PCB rev. 1.01A" → also the PCB's revision. */
export function parseTitle(text: string): { name?: string; revision?: string; pcbRevision?: string } {
  const out: { name?: string; revision?: string; pcbRevision?: string } = {};
  for (const seg of text.split(/\s+[·|–—]\s+|\s+-\s+|\s*,\s*/).map((s) => s.trim()).filter(Boolean)) {
    const pcb = seg.match(/^(?:bare\s*)?(?:pcb|pwb|board|fab)\s+(?:rev(?:ision)?|ver(?:sion)?)\.?\s*[:#]?\s*([A-Z0-9][\w.]*)$/i);
    if (pcb) {
      out.pcbRevision ??= pcb[1];
      continue;
    }
    const rev = seg.match(REV);
    if (rev) {
      out.revision ??= rev[1];
      const rest = seg.replace(rev[0], "").replace(/[\s,;:·-]+$/, "").trim();
      if (rest && !out.name && !GENERIC.test(rest) && /[A-Za-z]/.test(rest)) out.name = rest;
      continue;
    }
    // A model name that ends in its board revision: "H310M-A R2.0".
    const r = seg.match(/\s(R\d+(?:\.\d+)+)$/);
    if (r) out.revision ??= r[1];
    if (!out.name && !GENERIC.test(seg) && /[A-Za-z]/.test(seg) && seg.split(/\s+/).length <= 8) out.name = seg;
  }
  return out;
}

function add(into: PackDetails, d: FileDetail) {
  if (!d.value.trim()) return;
  if (into.items.some((x) => x.key === d.key && x.label === d.label && x.value === d.value && x.from === d.from)) return;
  into.items.push(d);
}

/** A count written as "946 reference designators. …" or "Total Placed Components: 20". */
function countInText(text: string): { label: string; value: string } | null {
  const m = text.match(/^(\d[\d,]*)\s+(reference\s+designators|designators|placements|components|parts|pieces|lines|bom\s+items|part\s+numbers)\b/i);
  return m ? { label: m[2], value: m[1] } : null;
}

/** A label and its value, from a details sheet or a "Label: value" line. */
export function addPair(into: PackDetails, label: string, value: string, from: string, via: DetailVia, sheet: string | null, scopeSheet?: string) {
  const l = label.trim().replace(/[:=]$/, "").trim();
  const v = value.trim();
  if (!l || !v || /^\[?\s*no\s+variations?\s*\]?$/i.test(v)) return;
  const count = countOf(l, v);
  if (count) {
    into.totals.push({ label: l, said: Number(v.replace(/,/g, "")), what: count, from, sheet: scopeSheet ?? sheet });
    return;
  }
  let key = labelKey(l);
  // A size with three numbers is the product's; with two it is the board's, when the sheet is about the board.
  if (key === "boardSize") {
    const dims = v.match(/\d+(?:\.\d+)?/g) ?? [];
    if (dims.length >= 3 || /product|overall|enclosure/i.test(l)) key = "productSize";
    else if (dims.length !== 2) key = null;
  }
  if (key === "buildQty" && !/^\d[\d,]*(\s*(pcs|pieces|boards|units|nos|sets))?$/i.test(v)) key = null;
  if (key === "revision" && v.length > 20) key = null;
  if (key === "name" || key === "product") {
    // "Board: TYPE7 V1 SS BOARD REV 3.0" names the revision too.
    const t = parseTitle(v);
    if (t.revision && !into.items.some((x) => x.key === "revision" && x.from === from)) add(into, { key: "revision", label: "Revision", value: t.revision, from, via });
    if (t.pcbRevision) add(into, { key: "pcbRevision", label: "PCB revision", value: t.pcbRevision, from, via });
  }
  if (key === "tool") {
    const t = v.match(TOOL);
    if (t) {
      add(into, { key: "tool", label: l, value: v, from, via });
      return;
    }
  }
  if (key === "project" && DESIGN_FILE.test(v)) add(into, { key: "name", label: "Design file", value: designName(v), from, via: "path" });
  // A long text is a note, not a detail.
  if (!key && v.length > 80) {
    into.notes.push({ text: `${l}: ${v}`, from });
    return;
  }
  add(into, { key, label: l, value: v, from, via });
}

/**
 * Lines of text: the rows above a table, a CAD report's header, a sheet of notes. A one-cell title names the board and
 * its revision (only above the BoM, `names`); "Label: value" gives a detail; a design-file path, a date and the tool
 * that wrote the file are kept; prose becomes a note.
 */
export function readLines(into: PackDetails, rows: string[][], upTo: number, pos: SheetPos, opts: { names: boolean; scopeSheet?: string }) {
  let named = into.items.some((x) => x.key === "name" && x.via === "title");
  for (let i = 0; i < Math.min(upTo, rows.length); i++) {
    const cells = rows[i].map((text, j) => ({ text: text.trim(), j })).filter((c) => c.text);
    // Two cells side by side: a label and its value ("Project" | "GW-200"), when the first reads like a label.
    if (cells.length === 2 && /^[A-Za-z][A-Za-z .()/#&-]{1,40}:?$/.test(cells[0].text) && (labelKey(cells[0].text) || /:$/.test(cells[0].text))) {
      addPair(into, cells[0].text, cells[1].text, cellAt(pos, i, cells[1].j), "title", pos.name, opts.scopeSheet);
      continue;
    }
    for (const { text, j } of cells) {
      const from = cellAt(pos, i, j);
      const kv = text.match(/^([A-Za-z][A-Za-z0-9 .()/#&-]{1,40}?)\s*[:=]\s+(.+)$/) ?? text.match(/^([A-Za-z][A-Za-z .()/#&-]{1,40}?)\s*[:=]\s*(\S.*)$/);
      if (kv && !/^[A-Za-z]$/.test(kv[1]) && !/^https?$/i.test(kv[1])) {
        addPair(into, kv[1], kv[2], from, "title", pos.name, opts.scopeSheet);
        continue;
      }
      if (PATH.test(text) || DESIGN_FILE.test(text)) {
        const file = text.split(/[\\/]/).pop() ?? text;
        add(into, { key: "project", label: "Design file", value: file, from, via: "path" });
        if (DESIGN_FILE.test(file)) add(into, { key: "name", label: "Design file", value: designName(file), from, via: "path" });
        // A folder named for the revision: ".../Rev3.0/ARTWORK/...".
        const rev = text.split(/[\\/]/).map((seg) => seg.match(/^(?:rev(?:ision)?|ver(?:sion)?)[\s_.-]*([A-Z]?\d+(?:\.\d+)*[A-Z]?)$/i)).find(Boolean);
        if (rev) add(into, { key: "revision", label: "Revision", value: rev[1], from, via: "path" });
        continue;
      }
      if (DATE.test(text)) {
        add(into, { key: "date", label: "Date", value: text, from, via: "title" });
        continue;
      }
      const generated = text.match(/^(?:generated|created|exported|made)\s+(?:by|with|from)\s+(.+)$/i);
      if (generated || (/report/i.test(text) && TOOL.test(text))) {
        add(into, { key: "tool", label: "Made with", value: generated ? generated[1] : text, from, via: "title" });
        continue;
      }
      if (/^placed\s+component\s+report$/i.test(text)) {
        add(into, { key: "tool", label: "Made with", value: "Cadence Allegro (placed component report)", from, via: "title" });
        continue;
      }
      if (GENERIC.test(text) || /^[\d\s.,:/-]+$/.test(text)) continue;
      const count = countInText(text);
      if (count) addPair(into, count.label.replace(/^./, (c) => c.toUpperCase()), count.value, from, "title", pos.name, opts.scopeSheet);
      if (isProse(text)) {
        into.notes.push({ text, from });
        continue;
      }
      if (count) continue;
      // A build quantity written as a line: "Build 500 pieces".
      const build = text.match(/\b(?:build|make|produce|order|batch|lot)\b\D{0,15}?(\d[\d,]*)\s*(?:pcs|pieces|boards|units|nos|sets|off)\b/i);
      if (build) add(into, { key: "buildQty", label: "Build qty", value: build[1].replace(/,/g, ""), from, via: "title" });
      if (!opts.names) {
        if (!build) into.notes.push({ text, from });
        continue;
      }
      const t = parseTitle(text);
      if (!named && t.name) {
        add(into, { key: "name", label: "Title", value: t.name, from, via: "title" });
        named = true;
      }
      if (t.revision) add(into, { key: "revision", label: "Revision", value: t.revision, from, via: "title" });
      if (t.pcbRevision) add(into, { key: "pcbRevision", label: "PCB revision", value: t.pcbRevision, from, via: "title" });
    }
  }
}

const PAIR_HEADER = /^(field|item|key|property|parameter|attribute|name|description|label|detail|spec|specification)$/i;
const DESIGNATOR = /^[A-Za-z]{1,5}\d{1,5}[A-Za-z]?$/;

/**
 * A sheet of label/value pairs ("Board | Arduino Nano IO Shield", "PCB revision | 1.01A"): at most three filled cells
 * a row, an optional one-cell title and an optional "Field | Value" header, and pairs on most rows. Null when the sheet
 * is something else (a not-fitted list has designators where the labels would be).
 */
export function readPairs(rows: string[][]): { title: { text: string; i: number; j: number } | null; pairs: { label: string; value: string; i: number; j: number; vj: number }[] } | null {
  if (rows.length < 2 || rows.length > 120) return null;
  let title: { text: string; i: number; j: number } | null = null;
  const pairs: { label: string; value: string; i: number; j: number; vj: number }[] = [];
  let other = 0;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((text, j) => ({ text: text.trim(), j })).filter((c) => c.text);
    if (cells.length > 3) return null;
    if (i === 0 && cells.length === 1) {
      title = { text: cells[0].text, i, j: cells[0].j };
      continue;
    }
    if (i <= 1 && cells.length === 2 && PAIR_HEADER.test(cells[0].text) && /^(value|values|details?|data|setting|text)$/i.test(cells[1].text)) continue;
    const [a, b] = cells;
    if (cells.length >= 2 && a.text.length <= 60 && /[A-Za-z]/.test(a.text) && !DESIGNATOR.test(a.text) && !/^[\d\s.,-]+$/.test(a.text)) pairs.push({ label: a.text, value: cells.slice(1).map((c) => c.text).join(" "), i, j: a.j, vj: b.j });
    else other++;
  }
  // A label and one value a row; rows of a label and two numbers are a small table ("Category | Lots | Units").
  const twoCells = pairs.filter((p) => rows[p.i].filter((c) => c.trim()).length === 2).length;
  return pairs.length >= 2 && pairs.length >= (pairs.length + other) * 0.7 && twoCells >= pairs.length * 0.7 ? { title, pairs } : null;
}

/** A sheet of free-text notes: one cell a row, words rather than codes. */
export function isNotes(rows: string[][]): boolean {
  if (!rows.length || rows.length > 60) return false;
  const lines = rows.map((r) => r.filter((c) => c.trim()));
  if (lines.some((l) => l.length > 1)) return false;
  return lines.filter((l) => l[0].trim().split(/\s+/).length >= 2).length >= lines.length * 0.5;
}

/** The pairs of a details sheet, into the details. */
export function addPairs(into: PackDetails, read: NonNullable<ReturnType<typeof readPairs>>, pos: SheetPos) {
  if (read.title) {
    const t = parseTitle(read.title.text);
    const from = cellAt(pos, read.title.i, read.title.j);
    if (t.name) add(into, { key: "name", label: "Title", value: t.name, from, via: "sheet" });
    if (t.revision) add(into, { key: "revision", label: "Revision", value: t.revision, from, via: "sheet" });
    if (t.pcbRevision) add(into, { key: "pcbRevision", label: "PCB revision", value: t.pcbRevision, from, via: "sheet" });
  }
  for (const p of read.pairs) addPair(into, p.label, p.value, cellAt(pos, p.i, p.vj), "sheet", pos.name);
}

/** "TYPE7V1SS30-REV3 (1).xlsx", "KD-MC48-PWR_revA.csv", "ASUS_PRIME_H310M-A_R2.0_BOM.xlsx": a name and a revision. */
export function readFileName(into: PackDetails, fileName: string) {
  const base = (fileName.split(/[\\/]/).pop() ?? fileName).replace(/\.[a-z0-9]+$/i, "").replace(/\s*\(\d+\)$/, "").trim();
  if (!base) return;
  const rev = base.match(/(?:^|[_\-\s.])(?:rev\.?\s*(\d+(?:\.\d+)*[A-Z]?|[A-Z]{1,2}\d*)|(r\d+(?:\.\d+)+))(?=$|[_\-\s])/i);
  if (rev) add(into, { key: "revision", label: "Revision", value: rev[1] ?? rev[2], from: "the file name", via: "file-name" });
  let name = (rev ? base.replace(rev[0], "") : base).replace(/[_\s-]*(bom|bill[_\s-]*of[_\s-]*materials?|parts?[_\s-]*list|components?)$/i, "").replace(/_/g, " ").trim();
  // "PICO-BOARD_KiCad": the tool that wrote the file, not part of the board's name.
  const tool = name.match(new RegExp(`(?:^|[\\s-])(${TOOL.source})$`, "i"));
  if (tool && name.length > tool[0].length) {
    add(into, { key: "tool", label: "Made with", value: tool[1], from: "the file name", via: "file-name" });
    name = name.slice(0, -tool[0].length).replace(/[\s-]+$/, "").trim();
  }
  // A slug ("xbotgo-ai-sports-tracking-camera") reads better with spaces.
  if (/^[a-z0-9]+(-[a-z0-9]+){2,}$/.test(name)) name = name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  if (name && /[A-Za-z]/.test(name)) add(into, { key: "name", label: "File name", value: name, from: "the file name", via: "file-name" });
}

/** The bare board's line: "PCB, TYPE7 V1 SS BOARD, REV 3.0, FR4, …" names the board and its revision. */
export function readBoardLine(into: PackDetails, text: string, from: string) {
  const segs = text.split(/\s*,\s*/).slice(1);
  const name = segs.find((s) => /[A-Za-z]/.test(s) && !REV.test(s) && !/\b(fr-?4|layers?|mm|micron|oz|enig|hasl|osp|mask|legend|silk|rohs|epoxy|glass|lead|green|white|black)\b/i.test(s) && s.split(/\s+/).length <= 6);
  if (name) add(into, { key: "name", label: "Bare board", value: name, from, via: "board-line" });
  const rev = segs.map((s) => s.match(REV)).find(Boolean);
  if (rev) add(into, { key: "revision", label: "Revision", value: rev[1], from, via: "board-line" });
}

/** The strongest value for a detail. */
export function pickDetail(details: PackDetails | null | undefined, key: DetailKey): FileDetail | null {
  const all = (details?.items ?? []).filter((d) => d.key === key);
  return all.sort((a, b) => VIA_RANK[a.via] - VIA_RANK[b.via])[0] ?? null;
}

/** Sizes such as "60 × 59" or "17 x 15 mm", as numbers. */
export function sizeOf(value: string): number[] {
  return (value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

export type FormDefault<T> = { value: T; from: string };
export type FormDefaults = { project?: FormDefault<string>; bomName?: FormDefault<string>; revision?: FormDefault<string>; buildQty?: FormDefault<number>; customer?: FormDefault<string> };

/** The details the upload form can take: names, revision and build quantity, each with where it was read. */
export function formDefaults(details: PackDetails | null | undefined): FormDefaults {
  // The board's name and the product's, each from its strongest source; a weaker one (the file name) gives way.
  const named = pickDetail(details, "name");
  const prod = pickDetail(details, "product");
  const stronger = (a: FileDetail | null, b: FileDetail | null) => (a && (!b || VIA_RANK[a.via] <= VIA_RANK[b.via]) ? a : b);
  const name = stronger(named, prod);
  const product = stronger(prod, named);
  const rev = pickDetail(details, "revision");
  const qtyAt = pickDetail(details, "buildQty");
  const qty = Number(qtyAt?.value.replace(/\D/g, ""));
  const tidy = (d: FileDetail | null): FormDefault<string> | undefined => {
    const v = d?.value.replace(/\s+/g, " ").trim().slice(0, 120);
    return d && v ? { value: v, from: d.from } : undefined;
  };
  const out: FormDefaults = {};
  if (tidy(product)) out.project = tidy(product);
  if (tidy(name)) out.bomName = tidy(name);
  if (rev) out.revision = { value: rev.value.replace(/^rev(ision)?\.?\s*/i, "").slice(0, 20), from: rev.from };
  if (qtyAt && Number.isInteger(qty) && qty >= 1 && qty <= 10_000_000) out.buildQty = { value: qty, from: qtyAt.from };
  if (tidy(pickDetail(details, "customer"))) out.customer = tidy(pickDetail(details, "customer"));
  return out;
}

/** A customer's name as people match them: "Kinetic Drives Ltd." and "KINETIC DRIVES" are one customer. */
export function sameCustomer(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\b(ltd|limited|pvt|private|inc|incorporated|llc|llp|gmbh|ag|bv|co|corp|corporation|company|plc|sa|srl|the)\b/g, " ")
      .replace(/\s+/g, "");
  return !!n(a) && n(a) === n(b);
}

/** Where the file contradicts itself: two revisions, two names for the PCB's revision. */
export function detailFindings(details: PackDetails): { level: "amber"; text: string }[] {
  const out: { level: "amber"; text: string }[] = [];
  for (const key of ["revision", "pcbRevision"] as const) {
    const all = details.items.filter((d) => d.key === key);
    const first = pickDetail(details, key);
    const other = first ? all.find((d) => !sameRevision(d.value, first.value)) : null;
    if (first && other) out.push({ level: "amber", text: `The file gives two ${key === "revision" ? "revisions" : "PCB revisions"}: ${first.value} (${first.from}) and ${other.value} (${other.from}).` });
  }
  return out;
}
