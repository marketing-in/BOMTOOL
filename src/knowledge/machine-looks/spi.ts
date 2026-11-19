import type { MachineLook } from "./types";

/**
 * Solder paste inspection on our lines as the machines look on the floor. Facts only; the builders are in
 * src/components/ops/machine-3d/spi.ts under the same keys.
 */
export const SPI_LOOKS: MachineLook[] = [
  {
    key: "magicray-icon",
    family: "spi",
    types: ["SPI"],
    match: "magic-?ray\\s+icon",
    name: "Magic-ray ICON",
    bodyMm: { l: 1000, d: 1360, h: 1620, source: "maker", note: "Maker's outline drawing of the ICON." },
    railFromFrontMm: 670,
    reachMm: { front: 40, back: 30, top: 345 },
    livery: { body: "#f1f1f2", monitor: "#e9e8ea", plate: "#f3f3f3", bar: "#9a73a8", stripes: "#754697", amber: "#f7b611", green: "#5db63c" },
    features: ["white centre block proud of two lower shoulders", "violet stripe down each shoulder", "lilac bar under the built-in screen", "MAGICray and \"icon\" lettering", "e-stop and buttons on the right shoulder", "signal tower at the rear left of the top"],
    refs: [
      { label: "LINE ONE ALL MACHINE SPECIFICATION DETAILS, slide 3: the ICON on Line 1", source: "sheet" },
      { label: "Magic-ray ICON product page", source: "maker", url: "https://www.magic-ray.com" },
    ],
  },
  {
    key: "kohyoung-ky8030-2",
    family: "spi",
    types: ["SPI"],
    match: "koh\\s*young\\s+ky\\s*8030",
    name: "Koh Young KY8030-2",
    bodyMm: { l: 1000, d: 1265, h: 1627, source: "maker", note: "Koh Young KY8030-2 (M size) specification." },
    railFromFrontMm: 590,
    reachMm: { front: 418, back: 0, top: 475 },
    livery: { body: "#ebebe9", strip: "#333335", window: "#141214", band: "#8b8d90", perforated: "#dededb", arm: "#e6e6e4", green: "#237a56", red: "#b12021" },
    features: ["white box standing high on four chrome legs", "charcoal control strip down the left of the front", "black window with KY8030-2 on it", "aluminium grab rail", "KOHYOUNG on the door", "black monitor on an arm over a keyboard shelf, upper right"],
    refs: [
      { label: "MACHINERY DETAILS, page 7 (the Line 2 machines) and page 10 (SPI)", source: "sheet" },
      { label: "Koh Young KY8030-2 product page", source: "maker", url: "https://www.kohyoung.com" },
    ],
  },
  {
    key: "ckd-vp-01g",
    family: "spi",
    types: ["SPI"],
    match: "ckd\\s+vp-?01",
    name: "CKD VP-01G",
    bodyMm: { l: 938, d: 1191, h: 1480, source: "sheet", note: "CKD VP-01G brochure, outline drawing." },
    railFromFrontMm: 548,
    reachMm: { front: 10, back: 0, top: 372 },
    livery: { body: "#efeeec", seam: "#8b9496", logo: "#17946c", model: "#4f4d4b" },
    features: ["compact white box sitting low", "grey seam right across at half height", "rounded pilasters either side", "black screen standing proud on a silver neck", "PUSH flap for the keyboard", "green CKD mark and VP-01G on the door", "slim signal tower at the front left of the top"],
    refs: [{ label: "CKD VP-01G brochure, pages 1–2", source: "sheet" }],
  },
];
