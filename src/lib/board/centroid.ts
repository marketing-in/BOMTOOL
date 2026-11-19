import { normaliseHeader } from "@/lib/bom/columns";

export type PlacementRow = { refDes: string; x: number; y: number; rotation: number; side: "TOP" | "BOTTOM"; footprint: string | null; value: string | null };

export type CentroidField = "ref" | "x" | "y" | "rot" | "side" | "footprint" | "value" | "partNumber" | "description" | "board";
type Field = CentroidField;
/**
 * Header names of placement files, normalised (lower case, letters and digits only, a trailing unit removed):
 * Altium Pick Place, KiCad .pos, Eagle, EasyEDA, PADS, Mentor, Cadence Allegro's "Placed Component Report"
 * (REFDES, SYM_X, SYM_Y, SYM_ROTATE, SYM_MIRROR, SYM_NAME, COMP_VALUE) and the load lists an EMS line is
 * programmed from (Item Number, Item Description, RefDes, X, Y, R). A product's sheet of parts on several boards
 * ("Board | Ref | Side | X on board (mm)") names the board each part sits on.
 */
const SYN: Record<Field, string[]> = {
  ref: ["designator", "ref", "refdes", "reference", "referencedesignator", "refdesignator", "partreference", "part", "component", "name"],
  x: ["midx", "posx", "x", "centerx", "centrex", "refx", "locationx", "symx", "xpos", "xposition", "xcoord", "xcoordinate", "xloc", "xlocation", "placex", "compx", "xonboard", "xonpcb", "boardx", "pcbx"],
  y: ["midy", "posy", "y", "centery", "centrey", "refy", "locationy", "symy", "ypos", "yposition", "ycoord", "ycoordinate", "yloc", "ylocation", "placey", "compy", "yonboard", "yonpcb", "boardy", "pcby"],
  rot: ["rotation", "rot", "angle", "orientation", "rotate", "symrotate", "theta", "r", "rotationdeg", "rotdeg", "deg", "degrees"],
  side: ["layer", "side", "tb", "mirror", "pcbside", "symmirror", "mirrored", "boardside", "placementside", "topbottom", "surface", "face"],
  footprint: ["footprint", "package", "pattern", "pcbfootprint", "symname", "packagename", "decal", "pcbdecal", "geometry", "shape"],
  value: ["comment", "value", "val", "compvalue", "partvalue"],
  partNumber: ["itemnumber", "partnumber", "partno", "pn", "mpn", "mfrpn", "mfrpartnumber", "manufacturerpartnumber", "itemcode"],
  description: ["itemdescription", "description", "desc", "partdescription"],
  board: ["board", "boardname", "pcb", "pcbname", "mountedon", "onboard", "subassembly"],
};

/** "Center-X(mm)" and "Mid X (mil)" name the same column as "Center-X" and "Mid X". */
const stripUnit = (n: string) => (n.length >= 3 ? n.replace(/(mm|mils?|inch(es)?|thou)$/, "") : n);

export function mapCentroidHeader(headers: string[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  headers.forEach((h, i) => {
    const n = stripUnit(normaliseHeader(h));
    for (const f of Object.keys(SYN) as Field[]) {
      if (out[f] === undefined && SYN[f].includes(n)) {
        out[f] = i;
        break;
      }
    }
  });
  return out;
}

/** "12.5mm", "492mil", "12.5" → mm. Bare numbers use the file-level unit guess. */
function toMm(text: string, defaultUnit: "mm" | "mil" | "in"): number | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*(mm|mil|in|")?$/i);
  if (!m) return null;
  const v = Number(m[1]);
  const unit = (m[2]?.toLowerCase() as "mm" | "mil" | "in" | '"' | undefined) ?? defaultUnit;
  return unit === "mil" ? v * 0.0254 : unit === "in" || unit === '"' ? v * 25.4 : v;
}

/**
 * Parses Altium Pick Place, KiCad .pos (whitespace or CSV) and generic centroid tables.
 * Finds the header row, maps columns, detects mm vs mil, normalises side and rotation (0–360).
 */
export function parseCentroid(rows: string[][]): { placements: PlacementRow[]; unit: "mm" | "mil" | "in"; skipped: number } {
  const headerIdx = rows.findIndex((r) => {
    const m = mapCentroidHeader(r);
    return m.ref !== undefined && m.x !== undefined && m.y !== undefined;
  });
  if (headerIdx < 0) throw new Error("No header with designator and X/Y columns found.");
  const cols = mapCentroidHeader(rows[headerIdx]);
  const headerText = rows[headerIdx].join(" ").toLowerCase();
  const fileText = rows.slice(0, headerIdx).flat().join(" ").toLowerCase();
  const data = rows.slice(headerIdx + 1).filter((r) => r[cols.ref!]?.trim());

  // Unit: explicit suffixes win; else header hints; else magnitude (mil values are ~40× larger).
  let unit: "mm" | "mil" | "in" = /\bmils?\b|\(mils?\)|\bthou\b/.test(headerText + fileText) ? "mil" : /\binch(es)?\b|\(in\)/.test(headerText + fileText) ? "in" : "mm";
  if (unit === "mm" && !/mm/.test(headerText + fileText)) {
    const maxV = Math.max(...data.map((r) => Math.abs(Number((r[cols.x!] ?? "").replace(/[^\d.-]/g, "")) || 0)));
    if (maxV > 1500) unit = "mil";
  }

  const placements: PlacementRow[] = [];
  let skipped = 0;
  for (const r of data) {
    const x = toMm(r[cols.x!] ?? "", unit);
    const y = toMm(r[cols.y!] ?? "", unit);
    if (x === null || y === null) {
      skipped++;
      continue;
    }
    const sideText = cols.side !== undefined ? (r[cols.side] ?? "").toLowerCase() : "top";
    const side = /^(b|bot|bottom|bottomlayer|back|yes|mirror)/.test(sideText.replace(/\s/g, "")) ? "BOTTOM" : "TOP";
    const rotRaw = cols.rot !== undefined ? Number((r[cols.rot] ?? "0").replace(/[^\d.-]/g, "")) : 0;
    placements.push({
      refDes: r[cols.ref!].trim().toUpperCase(),
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      rotation: (((Number.isFinite(rotRaw) ? rotRaw : 0) % 360) + 360) % 360,
      side,
      footprint: cols.footprint !== undefined ? r[cols.footprint]?.trim() || null : null,
      value: cols.value !== undefined ? r[cols.value]?.trim() || null : null,
    });
  }
  return { placements, unit, skipped };
}

/** KiCad .pos files are whitespace-separated with a "# Ref Val Package PosX PosY Rot Side" header. */
export function splitPosFile(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^#\s*/, "").trim())
    .filter((l) => l && !/^##/.test(l))
    .map((l) => l.split(/\s+/));
}
