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

/**
 * Words a BoM adds to a maker's name that do not change the maker: a region or office ("Murata Electronics North
 * America"), "Semi" ("Fairchild Semi"), "International", a group or a division.
 */
const NOT_THE_MAKER = /\b(?:(?:north|south|latin)\s+americas?|americas?|usa|u\.s\.a\.?|europe|emea|asia(?:\s+pacific)?|apac|india|japan|china|germany|uk|international|intl|int'?l|group|holdings?|semi|mfg|manufacturing|components?|devices?|products?|industries|division)\b\.?/gi;

/** Within one typing slip: one letter added, dropped or changed, or two neighbours swapped ("Littlefuse"). */
function oneSlip(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const at: number[] = [];
    for (let i = 0; i < a.length && at.length <= 2; i++) if (a[i] !== b[i]) at.push(i);
    return at.length === 1 || (at.length === 2 && at[1] === at[0] + 1 && a[at[0]] === b[at[1]] && a[at[1]] === b[at[0]]);
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

/**
 * Resolves free-text manufacturer ("TI", "Texas Instruments Inc.") to the canonical name, or null. Failing the alias
 * table, the name without its region or division words, then a long name one typing slip from exactly one maker.
 */
export function resolveManufacturer(raw: string | null | undefined, index: AliasIndex): string | null {
  if (!raw) return null;
  const key = normaliseManufacturerKey(raw);
  if (!key) return null;
  const hit = index.get(key);
  if (hit) return hit;
  const bare = normaliseManufacturerKey(raw.replace(/[/]/g, " ").replace(NOT_THE_MAKER, " "));
  if (bare && bare !== key && index.has(bare)) return index.get(bare)!;
  const word = bare || key;
  if (word.length < 6) return null;
  const near = new Set<string>();
  for (const [k, name] of index) if (k.length >= 6 && oneSlip(k, word)) near.add(name);
  return near.size === 1 ? [...near][0] : null;
}
