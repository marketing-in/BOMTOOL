const PREFIX: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  μ: 1e-6,
  m: 1e-3,
  "": 1,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
};

/**
 * Parses an engineering value to its SI base number.
 *   "10k" → 10000, "4K7" → 4700, "0R1" → 0.1, "100nF" → 1e-7, "4.7 µF" → 4.7e-6,
 *   "25V" → 25, "10 mΩ" → 0.01, "72 MHz" → 7.2e7, "1%" → 1.
 * Returns null when the text has no leading number.
 */
export function parseSiValue(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = text.trim().replace(/,/g, "");

  // RKM / "R" notation: 4K7, 2M2, 0R1, 4R7, 1u5
  const rkm = s.match(/^(\d+)([RpnuµμmkKMG])(\d+)\s*[A-Za-zΩ%]*$/);
  if (rkm) {
    const [, whole, p, frac] = rkm;
    const mult = p === "R" ? 1 : PREFIX[p];
    return Number(`${whole}.${frac}`) * mult;
  }

  const m = s.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([pnuµμmkKMG]?)(.*)$/);
  if (!m) return null;
  const [, num, prefix, rest] = m;
  const value = Number(num);
  if (Number.isNaN(value)) return null;
  // A lone "m" is the metre unit, not milli ("5 m" of cable).
  if (prefix === "m" && rest.trim() === "") return value;
  return value * PREFIX[prefix];
}
