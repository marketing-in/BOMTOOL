import { POWER } from "./power";
import { ANALOG } from "./analog";
import { PROCESSING } from "./processing";
import { LOGIC } from "./logic";
import { INTERFACE } from "./interface";
import { RF, SENSORS } from "./rf-sensors";
import { DISCRETES } from "./discretes";
import { OPTO, PROTECTION } from "./opto-protection";
import { CAPACITORS, RESISTORS } from "./passives";
import { MAGNETICS, FREQUENCY } from "./magnetics-frequency";
import { ELECTROMECHANICAL } from "./electromechanical";
import { CONNECTORS } from "./connectors";
import { CABLES, MATERIALS } from "./cables-materials";
import { MACHINES } from "./machines";
import { MACHINE_PARTS, MACHINE_BLOCKS } from "./machine-parts";
import { GROUPS, SECTIONS, type DictEntry, type DictGroup } from "./types";

export * from "./types";

/** Every dictionary entry, in group order. */
export const DICTIONARY: DictEntry[] = [
  ...POWER,
  ...ANALOG,
  ...PROCESSING,
  ...LOGIC,
  ...INTERFACE,
  ...RF,
  ...SENSORS,
  ...DISCRETES,
  ...OPTO,
  ...PROTECTION,
  ...CAPACITORS,
  ...RESISTORS,
  ...MAGNETICS,
  ...FREQUENCY,
  ...ELECTROMECHANICAL,
  ...CONNECTORS,
  ...CABLES,
  ...MATERIALS,
  ...MACHINES,
  ...MACHINE_PARTS,
  ...MACHINE_BLOCKS,
];

const BY_SLUG = new Map(DICTIONARY.map((e) => [e.slug, e]));

export function dictEntry(slug: string): DictEntry | undefined {
  return BY_SLUG.get(slug);
}

export function groupOf(key: DictGroup) {
  return GROUPS.find((g) => g.key === key)!;
}

export function entriesIn(group: DictGroup): DictEntry[] {
  return DICTIONARY.filter((e) => e.group === group);
}

export function groupsInSection(section: (typeof SECTIONS)[number]) {
  return GROUPS.filter((g) => g.section === section).map((g) => ({ ...g, count: entriesIn(g.key).length }));
}

/** Resolves related slugs to entries, skipping any that don't exist. */
export function relatedEntries(e: DictEntry): DictEntry[] {
  return (e.related ?? []).map((s) => BY_SLUG.get(s)).filter((x): x is DictEntry => !!x);
}

/** Entries that list this one as related (the reverse links). */
export function referencedBy(slug: string): DictEntry[] {
  return DICTIONARY.filter((e) => e.related?.includes(slug) || e.subassemblies?.includes(slug));
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

type Indexed = { e: DictEntry; name: string; aka: string[]; akaSquashed: string[]; text: string; parts: string };

const INDEX: Indexed[] = DICTIONARY.map((e) => ({
  e,
  name: norm(e.name),
  aka: (e.aka ?? []).map(norm),
  akaSquashed: (e.aka ?? []).map(squash),
  text: norm([e.oneLiner, e.what, e.how, ...e.uses, groupOf(e.group).label].join(" ")),
  parts: norm((e.alternatives.equivalents ?? []).flatMap((q) => [q.part, ...q.alts]).join(" ")),
}));

export type DictHit = { entry: DictEntry; score: number };

/**
 * Ranks entries for a query: name and aliases first (including part numbers like "AMS1117" or "LM358"),
 * then equivalents tables, then descriptive text. Every word must match somewhere.
 */
export function searchDictionary(query: string, limit = 50): DictHit[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(" ").filter(Boolean);
  const qs = squash(query);
  const hits: DictHit[] = [];
  for (const it of INDEX) {
    let score = 0;
    if (it.name === q) score += 120;
    else if (it.name.startsWith(q)) score += 80;
    else if (it.name.includes(q)) score += 60;
    if (it.aka.includes(q) || (qs.length >= 3 && it.akaSquashed.includes(qs))) score += 90;
    else if (qs.length >= 3 && it.akaSquashed.some((a) => a.startsWith(qs) || (qs.length >= 5 && a.includes(qs)))) score += 45;
    let all = true;
    for (const w of words) {
      const inName = it.name.includes(w);
      const inAka = it.aka.some((a) => a.includes(w));
      const inParts = w.length >= 3 && it.parts.includes(w);
      const inText = it.text.includes(w);
      if (!(inName || inAka || inParts || inText)) {
        all = false;
        break;
      }
      score += inName ? 20 : inAka ? 14 : inParts ? 10 : 3;
    }
    if (!all && score < 45) continue;
    if (score > 0) hits.push({ entry: it.e, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name)).slice(0, limit);
}

/**
 * Best dictionary entry for a catalogue part: entries for its category, ranked by how well their
 * names/aliases match the part's description and parameters (e.g. a P-channel MOSFET → p-mosfet).
 */
export function entryForPart(p: { categorySlug: string; description?: string | null; mpn?: string | null; params?: Record<string, string> }): DictEntry | undefined {
  const candidates = DICTIONARY.filter((e) => e.categories?.includes(p.categorySlug));
  if (!candidates.length) return undefined;
  if (candidates.length === 1) return candidates[0];
  const hay = norm([p.description ?? "", p.mpn ?? "", ...Object.values(p.params ?? {})].join(" "));
  const hayS = squash([p.description ?? "", p.mpn ?? ""].join(" "));
  let best = candidates[0];
  let bestScore = -1;
  const padded = ` ${hay} `;
  // A word shared by many candidate names ("diode", "channel") says less than a distinctive one ("schottky").
  const names = candidates.map((e) => norm(e.name).split(" "));
  const df = (w: string) => names.filter((n) => n.includes(w)).length || 1;
  for (const e of candidates) {
    let s = 0;
    const words = norm(e.name).split(" ");
    for (const w of words) if (w.length > 2 && hay.includes(w)) s += 6 / df(w);
    // Word pairs separate look-alikes: "p channel" vs "n channel", "current sense" vs "chip resistor".
    for (let i = 0; i + 1 < words.length; i++) if (padded.includes(` ${words[i]} ${words[i + 1]} `)) s += 6;
    for (const a of e.aka ?? []) {
      const n = norm(a);
      if (n.length > 2 && hay.includes(n)) s += 5;
      const sq = squash(a);
      if (sq.length >= 4 && hayS.includes(sq)) s += 8;
    }
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return best;
}

export const DICTIONARY_STATS = {
  entries: DICTIONARY.length,
  machines: DICTIONARY.filter((e) => e.group === "machines").length,
  equivalents: DICTIONARY.reduce((n, e) => n + (e.alternatives.equivalents?.length ?? 0), 0),
};
