import { boardFits, type EnclosureSpec } from "./enclosures";
import type { BodySpec } from "./bodies";

/** A wall of the box, by its outward axis. x− is the front for extruded boxes. */
export type BoxFace = "x-" | "x+" | "y-" | "y+";

/** An opening in a wall where an edge connector meets it. `u` runs along the wall, `z` up from the outside bottom. */
export type CutOut = {
  refDes: string;
  face: BoxFace;
  u: number;
  z: number;
  w: number;
  h: number;
  color: string;
};

/** in-bom: bought on a BoM line · supplied: ships with the enclosure · missing: needed but not on the BoM · nre: a one-off job to quote · check: a design question. */
export type KitStatus = "in-bom" | "supplied" | "missing" | "nre" | "check";
export type KitLine = {
  refDes: string;
  mpn: string;
  partId: string | null;
  description: string;
  category: string | null;
  qty: number;
};
export type KitItem = {
  key: string;
  label: string;
  qty: number;
  status: KitStatus;
  line: KitLine | null;
  why: string;
};

export type BoxFit = {
  /** Board outline inside the walls, with 1 mm to spare. */
  fits2d: boolean;
  /** Free space per side between the board edge and the inner wall. */
  clearanceX: number;
  clearanceY: number;
  /** Space between the tallest top-side part and the underside of the lid (negative = it hits). */
  headroom: number;
  tallest: { refDes: string; height: number } | null;
  ok: boolean;
};

export type BoxAnalysis = {
  /** Extruded boxes hold a board in their side slots when its width matches; otherwise it sits on standoffs. */
  mount: "slots" | "standoffs";
  /** Height of the board's underside above the inner floor (standoffs, or the slot for extruded boxes). */
  standoff: number;
  /** Where the standoff height came from. */
  standoffSource: "bom" | "clearance";
  /** Board underside, measured up from the outside bottom of the box. */
  boardBottom: number;
  fit: BoxFit;
  cutouts: CutOut[];
  kit: KitItem[];
};

type PlacedPart = {
  refDes: string;
  x: number;
  y: number;
  rotation: number;
  side: "TOP" | "BOTTOM";
  body: Pick<BodySpec, "kind" | "length" | "width" | "height" | "color">;
};

const STANDOFF = /stand-?off|spacer|pillar/i;
const SCREW = /screw|bolt/i;
const FEET = /\bfeet\b|\bfoot\b|bumper|bumpon/i;
const LABEL = /label|name ?plate/i;

/** Footprint half-extents along the board's x and y for a part rotated by `rotation` degrees. */
function extents(p: PlacedPart): [number, number] {
  const quarter = Math.round((((p.rotation % 360) + 360) % 360) / 90) % 2 === 1;
  return quarter ? [p.body.width / 2, p.body.length / 2] : [p.body.length / 2, p.body.width / 2];
}

const find = (lines: KitLine[], test: (l: KitLine) => boolean) => lines.find(test) ?? null;
const mm = (n: number) => `${+n.toFixed(1)} mm`;

/** One sentence on whether the board goes in the box, and if not, what stops it. */
export function boxVerdict(enc: EnclosureSpec, box: BoxAnalysis): { ok: boolean; text: string } {
  const f = box.fit;
  if (!f.fits2d) return { ok: false, text: `Board is larger than the ${enc.mpn} inner space (${mm(enc.length - 2 * enc.wall)} × ${mm(enc.width - 2 * enc.wall)})` };
  if (f.headroom < 0 && f.tallest) return { ok: false, text: `${f.tallest.refDes} (${mm(f.tallest.height)} tall) hits the lid by ${mm(-f.headroom)}` };
  if (f.headroom < 1) return { ok: false, text: `Only ${mm(f.headroom)} between the tallest part and the lid` };
  return { ok: true, text: `Fits: ${mm(Math.min(f.clearanceX, f.clearanceY))} clear at the closest wall, ${mm(f.headroom)} under the lid` };
}

/**
 * Everything about how a board goes into its box: mount height, fit and headroom, the wall openings
 * its edge connectors need, and the box-build kit checked against the BoM.
 * Board is centred in the box; coordinates are board-centred mm.
 */
export function analyseBox(enc: EnclosureSpec, board: { w: number; h: number; thickness: number }, parts: PlacedPart[], lines: KitLine[], maxGap = 12): BoxAnalysis {
  const top = parts.filter((p) => p.side === "TOP");
  const under = Math.max(0, ...parts.filter((p) => p.side === "BOTTOM").map((p) => p.body.height));

  // Slots only grip a board whose width matches their pitch (inner width, within a few mm).
  const slotPitch = enc.width - 2 * enc.wall;
  const mount = enc.style === "extruded" && Math.abs(slotPitch - board.h) <= 3 ? "slots" : "standoffs";
  // Standoffs: the BoM's own length when it says one ("Standoff M3 10mm"), else enough to clear the solder side.
  const standoffLine = find(lines, (l) => l.category === "fastener" && STANDOFF.test(l.description));
  const fromBom = standoffLine ? Number(standoffLine.description.match(/(\d+(?:\.\d+)?)\s*mm/i)?.[1]) : NaN;
  const useBom = mount === "standoffs" && Number.isFinite(fromBom) && fromBom >= 2 && fromBom <= 40;
  const standoff = useBom ? fromBom : Math.max(6, Math.ceil(under + 2));
  const boardBottom = enc.wall + standoff;
  const boardTop = boardBottom + board.thickness;

  // Fit: outline, then height under the lid.
  const { fits: fits2d } = boardFits(enc, board.w, board.h);
  const innerTop = enc.style === "extruded" ? enc.height - enc.wall : enc.height - enc.lidHeight;
  const tallestPart = top.reduce<PlacedPart | null>((m, p) => (!m || p.body.height > m.body.height ? p : m), null);
  const headroom = innerTop - boardTop - (tallestPart?.body.height ?? 0);
  const fit: BoxFit = {
    fits2d,
    clearanceX: (enc.length - 2 * enc.wall - board.w) / 2,
    clearanceY: (enc.width - 2 * enc.wall - board.h) / 2,
    headroom,
    tallest: tallestPart ? { refDes: tallestPart.refDes, height: tallestPart.body.height } : null,
    ok: fits2d && headroom >= 1,
  };

  // Openings: a top-side connector whose outer edge is within maxGap of an inner wall.
  const ix = enc.length / 2 - enc.wall;
  const iy = enc.width / 2 - enc.wall;
  const wallTop = innerTop - 0.5;
  const cutouts: CutOut[] = [];
  for (const p of top) {
    if (p.body.kind !== "connector") continue;
    const [ex, ey] = extents(p);
    const gaps: [BoxFace, number][] = [
      ["x-", p.x - ex + ix],
      ["x+", ix - (p.x + ex)],
      ["y-", p.y - ey + iy],
      ["y+", iy - (p.y + ey)],
    ];
    const [face, gap] = gaps.reduce((a, b) => (b[1] < a[1] ? b : a));
    if (gap > maxGap) continue;
    const alongX = face === "y-" || face === "y+";
    const h = Math.min(p.body.height + 1.5, wallTop - boardTop);
    cutouts.push({
      refDes: p.refDes,
      face,
      u: alongX ? p.x : p.y,
      z: boardTop + h / 2,
      w: (alongX ? ex : ey) * 2 + 1.5,
      h,
      color: p.body.color,
    });
  }

  // Box-build kit: what a fit-out of this style needs, and whether the BoM already buys it.
  const kit: KitItem[] = [];
  const add = (key: string, label: string, qty: number, line: KitLine | null, why: string, missing: KitStatus = "missing") =>
    kit.push({ key, label, qty, status: line ? "in-bom" : missing, line, why });
  const encLine = find(lines, (l) => l.category === "enclosure");
  add("enclosure", enc.label, 1, encLine, encLine ? "On the BoM." : "In the project spec but not on the BoM — add it so it gets bought.");
  for (const s of enc.supplied)
    kit.push({
      key: `supplied-${s}`,
      label: s,
      qty: 1,
      status: "supplied",
      line: null,
      why: "Ships with the enclosure.",
    });
  if (mount === "slots") {
    kit.push({
      key: "slots",
      label: "Board slides into the extrusion slots",
      qty: 1,
      status: "supplied",
      line: null,
      why: "Its width matches the slot pitch, so no standoffs are needed.",
    });
  } else {
    if (enc.style === "extruded")
      kit.push({
        key: "carrier",
        label: "Board doesn't reach the slots",
        qty: 1,
        status: "check",
        line: null,
        why: `The board is ${+board.h.toFixed(1)} mm wide but the slots are ${+slotPitch.toFixed(1)} mm apart — mount it on floor standoffs (drawn) or a carrier plate.`,
      });
    add("standoffs", "Standoffs M3", 4, standoffLine, standoffLine ? "On the BoM." : "Holds the board off the floor — not on the BoM.");
    const screwLine = find(lines, (l) => l.category === "fastener" && SCREW.test(l.description));
    add(
      "screws",
      enc.style === "moulded" ? "Self-tapping screws (board to bosses)" : "M3 screws (board and floor)",
      enc.style === "moulded" ? 4 : 8,
      screwLine,
      screwLine ? "On the BoM." : "Fixes board and standoffs — not on the BoM.",
    );
  }
  add(
    "feet",
    "Rubber feet",
    4,
    find(lines, (l) => FEET.test(l.description)),
    "Stops the box marking the bench — often forgotten on the BoM.",
  );
  add(
    "label",
    "Product label",
    1,
    find(lines, (l) => LABEL.test(l.description)),
    "Name, P/N, revision and serial — needs a label stock and printer template.",
  );
  const faces = [...new Set(cutouts.map((c) => c.face))];
  if (faces.length) {
    const refs = cutouts.map((c) => c.refDes).join(", ");
    kit.push({
      key: "machining",
      label: `Panel machining for ${refs}`,
      qty: faces.length,
      status: "nre",
      line: null,
      why: `${faces.length} face${faces.length === 1 ? "" : "s"} need${faces.length === 1 ? "s" : ""} openings — quote CNC or punch tooling as NRE and confirm the panel drawing with the customer.`,
    });
  }

  return {
    mount,
    standoff,
    standoffSource: useBom ? "bom" : "clearance",
    boardBottom,
    fit,
    cutouts,
    kit,
  };
}
