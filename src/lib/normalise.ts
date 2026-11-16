/** Matching key for an MPN: upper-case, no DigiKey "-ND" suffix, no whitespace/dashes/dots/slashes. */
export function normaliseMpn(mpn: string): string {
  return mpn
    .trim()
    .toUpperCase()
    .replace(/-ND$/, "")
    .replace(/[\s\-./_,]/g, "");
}

/** Key for manufacturer alias lookup: upper-case alphanumerics only. */
export function normaliseManufacturerKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Würth → Wurth
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/\b(INC|INCORPORATED|LTD|LIMITED|LLC|CORP|CORPORATION|CO|GMBH|AG|SA|BV|NV|PLC|SEMICONDUCTORS?|ELECTRONICS?|TECHNOLOGY|TECHNOLOGIES)\b\.?/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export type AliasIndex = Map<string, string>; // normalised alias → canonical manufacturer name

export function buildAliasIndex(entries: { name: string; aliases: string[] }[]): AliasIndex {
  const index: AliasIndex = new Map();
  for (const e of entries) {
    index.set(normaliseManufacturerKey(e.name), e.name);
    for (const a of e.aliases) index.set(normaliseManufacturerKey(a), e.name);
  }
  return index;
}

/** Resolves free-text manufacturer ("TI", "Texas Instruments Inc.") to the canonical name, or null. */
export function resolveManufacturer(raw: string | null | undefined, index: AliasIndex): string | null {
  if (!raw) return null;
  const key = normaliseManufacturerKey(raw);
  if (!key) return null;
  return index.get(key) ?? null;
}
