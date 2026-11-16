/**
 * Expands a reference-designator string into individual designators.
 *   "C1-C4, C7"   → C1 C2 C3 C4 C7
 *   "R1-4"        → R1 R2 R3 R4
 *   "U1 U2;U3"    → U1 U2 U3
 * Unrecognised tokens are kept as-is so nothing is silently dropped.
 */
export function expandRefDes(input: string | null | undefined): string[] {
  if (!input) return [];
  const out: string[] = [];
  for (const raw of input.split(/[,;\s]+/)) {
    const token = raw.trim();
    if (!token) continue;
    const range = token.match(/^([A-Za-z_]+)(\d+)\s*[-–:]\s*(?:([A-Za-z_]+))?(\d+)$/);
    if (range) {
      const [, prefix, startStr, endPrefix, endStr] = range;
      const start = Number(startStr);
      const end = Number(endStr);
      if ((!endPrefix || endPrefix.toUpperCase() === prefix.toUpperCase()) && end >= start && end - start < 10000) {
        for (let i = start; i <= end; i++) out.push(`${prefix.toUpperCase()}${i}`);
        continue;
      }
    }
    out.push(token.toUpperCase());
  }
  return out;
}

export function countRefDes(input: string | null | undefined): number {
  return expandRefDes(input).length;
}
