/**
 * Code 39 barcodes for product labels. Each character is 9 elements (bar, space, bar, … bar);
 * "1" marks a wide element, and every pattern has exactly three wide ones.
 */
const PATTERNS: Record<string, string> = {
  "0": "000110100",
  "1": "100100001",
  "2": "001100001",
  "3": "101100000",
  "4": "000110001",
  "5": "100110000",
  "6": "001110000",
  "7": "000100101",
  "8": "100100100",
  "9": "001100100",
  A: "100001001",
  B: "001001001",
  C: "101001000",
  D: "000011001",
  E: "100011000",
  F: "001011000",
  G: "000001101",
  H: "100001100",
  I: "001001100",
  J: "000011100",
  K: "100000011",
  L: "001000011",
  M: "101000010",
  N: "000010011",
  O: "100010010",
  P: "001010010",
  Q: "000000111",
  R: "100000110",
  S: "001000110",
  T: "000010110",
  U: "110000001",
  V: "011000001",
  W: "111000000",
  X: "010010001",
  Y: "110010000",
  Z: "011010000",
  "-": "010000101",
  ".": "110000100",
  " ": "011000100",
  $: "010101000",
  "/": "010100010",
  "+": "010001010",
  "%": "000101010",
  "*": "010010100",
};

export const CODE39_CHARS = Object.keys(PATTERNS).filter((c) => c !== "*");

/**
 * Bars for `text` wrapped in the * start/stop characters, as alternating bar/space widths in
 * narrow-module units (wide = 3, which scanners read reliably), with a narrow gap between characters.
 * Null when the text has characters Code 39 can't carry.
 */
export function code39(text: string): number[] | null {
  const t = text.toUpperCase();
  if (!t || [...t].some((c) => c === "*" || !PATTERNS[c])) return null;
  const out: number[] = [];
  [...`*${t}*`].forEach((c, i, all) => {
    for (const bit of PATTERNS[c]) out.push(bit === "1" ? 3 : 1);
    if (i < all.length - 1) out.push(1); // inter-character gap (a space)
  });
  return out;
}
