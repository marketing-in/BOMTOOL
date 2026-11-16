import { unzipSync } from "fflate";
import { classifyLayer } from "./layers";
import { normaliseBoardSet } from "./normalise";
import { mapCentroidHeader } from "./centroid";
import { readSheets } from "@/lib/bom/parse";

/** Does a spreadsheet hold a table with designators and X/Y (on any sheet)? */
function holdsPlacements(f: UploadFile): boolean {
  if (!/\.(xlsx|xlsm|xls|csv|tsv)$/i.test(f.name)) return false;
  try {
    return readSheets(f.bytes, f.name).some((s) =>
      s.rows.slice(0, 40).some((r) => {
        const m = mapCentroidHeader(r);
        return m.ref !== undefined && m.x !== undefined && m.y !== undefined;
      }),
    );
  } catch {
    return false;
  }
}
import type { PanelFacts } from "./panel";

/** Uploads are capped before and after unzipping (a small zip can expand enormously). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 80 * 1024 * 1024;
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;

export type UploadFile = { name: string; bytes: Uint8Array };
export type BoardFiles = {
  gerbers: { name: string; text: string }[];
  centroid: UploadFile | null;
  /** Files that were neither a fabrication layer nor a centroid (readme, drawings, BoM…). */
  skipped: string[];
  /** Set when the Gerbers were a panel: `gerbers` then hold one board of it. */
  panel: PanelFacts | null;
  /** What the upload did to make the set readable (a panel cut to one board, a drill file rewritten). */
  notes: string[];
};

const isZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const decoder = new TextDecoder("utf-8");
const OFFICE_FILE = /[.](xlsx|xlsm|xlsb|docx|pptx|ods|odt)$/i;

const LIMITS = { expanded: MAX_EXPANDED_BYTES, entry: MAX_ENTRY_BYTES };

/**
 * Opens zips (one level deep), then sorts every file into Gerber/drill layers and one centroid file. The layers
 * come back readable: named, a panel cut to one board, a Gerber-format drill file as Excellon (normalise.ts).
 */
export function sortBoardFiles(files: UploadFile[], limits = LIMITS): BoardFiles {
  const flat: UploadFile[] = [];
  let expanded = 0;
  for (const f of files) {
    // A workbook is a zip inside, but it is one file: it may hold the placement table.
    if (!isZip(f.bytes) || OFFICE_FILE.test(f.name)) {
      flat.push(f);
      continue;
    }
    const entries = unzipSync(f.bytes, {
      filter: (e) => !e.name.endsWith("/") && !e.name.startsWith("__MACOSX/") && !/(^|\/)\./.test(e.name) && e.originalSize <= limits.entry,
    });
    for (const [path, bytes] of Object.entries(entries)) {
      expanded += bytes.length;
      if (expanded > limits.expanded) throw new Error(`The zip expands to more than ${Math.round(limits.expanded / 1048576)} MB — upload the board files only.`);
      flat.push({ name: path.split("/").pop() ?? path, bytes });
    }
  }

  const out: BoardFiles = { gerbers: [], centroid: null, skipped: [], panel: null, notes: [] };
  for (const f of flat) {
    const text = decoder.decode(f.bytes.subarray(0, Math.min(f.bytes.length, limits.entry)));
    const head = text.slice(0, 2000);
    const looksCentroid = /pick|place|centroid|\.pos$|xy|position/i.test(f.name) || /designator|refdes|mid x|posx/i.test(head);
    if ((looksCentroid || holdsPlacements(f)) && !/%FS|M48/.test(text.slice(0, 500))) out.centroid ??= f;
    else if (classifyLayer(f.name, text).type !== "unknown") out.gerbers.push({ name: f.name, text });
    else out.skipped.push(f.name);
  }
  if (out.gerbers.length) {
    const set = normaliseBoardSet(out.gerbers);
    out.gerbers = set.gerbers;
    out.panel = set.panel;
    out.notes = set.notes;
  }
  return out;
}
