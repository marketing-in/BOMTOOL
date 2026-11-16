/** How the box is made — decides its shape, how the board mounts and how it comes apart. */
export type EnclosureStyle = "diecast" | "extruded" | "moulded" | "sheet-metal";

/** Outer dimensions (mm) of enclosures we stock; inner = outer − 2 × wall. */
export type EnclosureSpec = {
  mpn: string;
  label: string;
  length: number;
  width: number;
  height: number;
  wall: number;
  /** Die-cast/moulded: lid plate thickness. Extruded: end-panel thickness. */
  lidHeight: number;
  material: "aluminium" | "plastic" | "steel";
  style: EnclosureStyle;
  /** Surface colour of the finish. */
  finish: string;
  /** Radius of the rounded vertical edges. */
  cornerRadius: number;
  /** Hardware that ships in the enclosure's own box, so it needn't be on the BoM. */
  supplied: string[];
};

const diecast = (mpn: string, length: number, width: number, height: number, wall: number, cornerRadius: number): EnclosureSpec => ({
  mpn,
  label: `Hammond ${mpn} die-cast aluminium`,
  length,
  width,
  height,
  wall,
  lidHeight: 4,
  material: "aluminium",
  style: "diecast",
  finish: "#b9bdc3",
  cornerRadius,
  supplied: ["Lid screws ×4"],
});

const extruded = (mpn: string, length: number): EnclosureSpec => ({
  mpn,
  label: `Hammond ${mpn} extruded aluminium`,
  length,
  width: 103,
  height: 53,
  wall: 2,
  lidHeight: 3,
  material: "aluminium",
  style: "extruded",
  finish: "#c7cbd1",
  cornerRadius: 3,
  supplied: ["End panels ×2", "Panel screws ×8"],
});

/**
 * Catalogue enclosures, outer dimensions from Hammond's catalogue (check the drawing before machining). Each is a
 * part in the catalogue too (category "enclosure"), so stock and offers come from the same tiers as components.
 */
export const ENCLOSURES: Record<string, EnclosureSpec> = {
  "1590A": diecast("1590A", 92.6, 38.5, 31, 2.5, 4),
  "1590B": diecast("1590B", 112.4, 60.5, 31, 2.5, 4.5),
  "1590N1": diecast("1590N1", 121, 66, 39.5, 2.8, 5),
  "1590BB": diecast("1590BB", 119.5, 94, 34, 3, 6),
  "1590XX": diecast("1590XX", 145, 121, 39, 3, 6),
  "1590DD": diecast("1590DD", 188, 120, 33, 3, 6),
  "1455N1201": extruded("1455N1201", 120),
  "1455N1601": extruded("1455N1601", 160),
  "1455N2201": extruded("1455N2201", 220),
};

/** Does the board fit inside (with 1 mm clearance each side)? */
export function boardFits(enc: EnclosureSpec, boardW: number, boardH: number) {
  const innerL = enc.length - 2 * enc.wall - 2;
  const innerW = enc.width - 2 * enc.wall - 2;
  const [a, b] = [Math.max(boardW, boardH), Math.min(boardW, boardH)];
  return { fits: a <= innerL && b <= innerW, innerL, innerW };
}
