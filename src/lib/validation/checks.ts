/**
 * BoM validation (Phase 46): what stands between a customer's BoM + design files and production, as flags a reviewer
 * can settle. Pure: the server gathers the BoM, its placements, the footprint check, the distributors' offers, the
 * customer's competitor list and the reviewers' calls; this turns them into flags.
 *
 * A flag that is not a real problem (a false call) is marked **accepted** with a reason; one that must be fixed is
 * **prohibited**. A part from a maker on the customer's competitor list starts prohibited. The BoM is ready for
 * production when no flag is open and none is prohibited. No purchasing here: availability is only looked at.
 */
import { signature } from "@/lib/board/footprint-match";
import { normaliseMpn } from "@/lib/normalise";
import { readIssue } from "@/lib/bom/issues";
import { checkSupplierPn, type Distributor } from "@/knowledge/distributor-pns";
import type { FootprintMatch } from "@/lib/board/footprint-match";

export type Check = "part" | "footprint" | "pins" | "placement" | "availability" | "visibility" | "distributor" | "competitor";
export type Level = "red" | "amber";
export type CallState = "open" | "accepted" | "prohibited";

export const CHECK_LABEL: Record<Check, string> = {
  part: "Part number",
  footprint: "Footprint",
  pins: "Pin count",
  placement: "Placement",
  availability: "Availability",
  visibility: "Visibility",
  distributor: "Distributor PN",
  competitor: "Competitor",
};

/** One distributor's listing of a part: stock 0 means listed, none in stock. */
export type VOffer = { seller: string; stock: number; authorised: boolean; leadWeeks: number | null };

export type VLine = {
  lineNo: number;
  refs: string[];
  /** The customer's own words. */
  mpn: string | null;
  manufacturer: string | null;
  description: string | null;
  pkg: string | null;
  dnp: boolean;
  /** Parts the build needs for this line (per board × build quantity). */
  need: number;
  /** The catalogue part matched to the line, if any; `confirmed` false when the match is our guess. */
  part: { mpn: string; manufacturer: string; pkg: string | null; pins: number | null; lifecycle: string | null; confirmed: boolean } | null;
  offers: VOffer[];
  /** What the BoM reader found wrong with the line's own words ("PACKAGE_CONFLICT: …", src/lib/bom/line-checks.ts). */
  issues?: string[];
  /** A distributor's part number the BoM gives, and whose it is. */
  supplierPn?: string | null;
  supplier?: string | null;
};

export type VPlacement = { refDes: string; footprint: string | null; copper: string | null; padCount: number | null; snap: string | null };

export type Competitor = { name: string; aliases: string[] };
export type Call = { key: string; status: "ACCEPTED" | "PROHIBITED"; reason: string | null; decidedAt?: Date | string | null };

export type Flag = {
  key: string;
  check: Check;
  level: Level;
  /** What the flag is about: a designator, or "line 12". */
  subject: string;
  lineNo: number | null;
  refs: string[];
  text: string;
  state: CallState;
  reason: string | null;
};

export type ValidationInput = {
  lines: VLine[];
  /** Null when no board files or placement file were given: placement and footprint checks are then not run. */
  placements: VPlacement[] | null;
  footprint: Pick<FootprintMatch, "refs" | "hasBoard"> | null;
  competitors: Competitor[];
  calls: Call[];
  /** Whether two maker names are one maker (the alias table's call); without it, the names are compared word by word. */
  sameMaker?: (a: string, b: string) => boolean;
};

export type Validation = {
  flags: Flag[];
  counts: Record<Check, { open: number; accepted: number; prohibited: number }>;
  open: number;
  accepted: number;
  prohibited: number;
  /** Nothing open and nothing prohibited. */
  ready: boolean;
  /** Checks that could not run, and why ("no placement file or Gerbers"). */
  skipped: { check: Check; why: string }[];
};

// ───────────────────────────── Pins ─────────────────────────────

/** Pins of named packages; a tab counts as a pin where the land has a pad for it. */
const NAMED_PINS: Record<string, number> = {
  "SOT-23": 3,
  "SOT-23-5": 5,
  "SOT-23-6": 6,
  "SOT-223": 4,
  "SOT-89": 3,
  "SOT-323": 3,
  "SOD-123": 2,
  "SOD-323": 2,
  "SOD-882": 2,
  "TO-220": 3,
  "TO-92": 3,
  "TO-252": 3,
  "TO-263": 3,
  "DO-41": 2,
  SMA: 2,
  SMB: 2,
  SMC: 2,
  "HC-49": 2,
};

/** How many pins a package name or a description says the part has, or null. */
export function pinsFromText(text: string | null | undefined): number | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  // TO-220AC / TO-220-2: the two-lead diode version.
  if (/TO-?220\s?-?(?:AC\b|2L?\b)/i.test(t)) return 2;
  const s = signature(t);
  if (s?.kind === "chip") return 2;
  if (s?.kind === "leaded") return s.pins;
  if (s?.kind === "named") return NAMED_PINS[s.name] ?? null;
  // Descriptions put the count first: "8-SOIC", "144LQFP", "20POS", "4 PIN".
  const lead = t.match(/(?:^|[^\w.])(\d{1,3})\s*-?\s*(LQFP|TQFP|QFP|QFN|DFN|SOIC|SOP|SSOP|TSSOP|MSOP|DIP|PDIP|BGA)\b/i);
  if (lead) return Number(lead[1]);
  const pos = t.match(/(?:^|[^\w.])(\d{1,3})\s*-?\s*(?:POS(?:ITION)?S?|PINS?|WAY|CKT|CIRCUITS?)\b/i);
  if (pos) return Number(pos[1]);
  return null;
}

/** Pads a copper reading stands for, less an exposed pad ("QFN-24 + EP" is 24 leads). */
export function leadsOnCopper(p: Pick<VPlacement, "copper" | "padCount">): number | null {
  if (p.padCount === null || p.padCount <= 0) return null;
  return /\+\s*EP\b/.test(p.copper ?? "") ? p.padCount - 1 : p.padCount;
}

/** What the line says the part's pin count is, and from what: the customer's words before a guessed catalogue match. */
/** Hardware that names the package it goes with (a heatsink for a TO-220, a socket for a DIP): its own pins are not that package's. */
const ACCESSORY = /HEAT\s?SINK|\bSOCKET\s+FOR\b|\bCLIP\b|\bSCREW\b|\bWASHER\b|\bSPACER\b|\bSTANDOFF\b|\bINSULATOR\b|THERMAL\s+PAD/i;

export function linePins(l: VLine): { pins: number; from: string } | null {
  if (ACCESSORY.test(`${l.description ?? ""} ${l.pkg ?? ""}`)) return null;
  const sure = l.part?.confirmed ? l.part.pins : null;
  if (sure) return { pins: sure, from: `part ${l.part!.mpn}` };
  const pkg = pinsFromText(l.pkg);
  if (pkg) return { pins: pkg, from: `package ${l.pkg}` };
  const desc = pinsFromText(l.description);
  if (desc) return { pins: desc, from: "the description" };
  if (l.part?.pins) return { pins: l.part.pins, from: `matched part ${l.part.mpn}` };
  return null;
}

// ───────────────────────────── Competitors ─────────────────────────────

/** Words in a maker's name that do not tell makers apart. */
const NOISE = /\b(?:inc|incorporated|corp|corporation|co|company|ltd|limited|llc|gmbh|ag|sa|nv|bv|plc|kk|semiconductors?|electronics?|technolog(?:y|ies)|international|group|holdings?|north america|america|usa|europe|asia)\b/g;

/** A maker's name reduced for comparing: lower case, no punctuation, no legal-form words. */
export function makerKey(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The competitor a maker's name belongs to, if any: the whole name or whole words of it, never part of a word. */
export function competitorOf(makers: (string | null | undefined)[], list: Competitor[]): Competitor | null {
  const keys = makers.map(makerKey).filter((k) => k.length >= 2);
  if (!keys.length) return null;
  for (const c of list)
    for (const n of [c.name, ...c.aliases].map(makerKey).filter((k) => k.length >= 2))
      if (keys.some((k) => k === n || ` ${k} `.includes(` ${n} `))) return c;
  return null;
}

// ───────────────────────────── Part numbers ─────────────────────────────

/**
 * One part under two part numbers: the same after normalising, or one the other with an ordering ending (LM358DR /
 * LM358DRG4, C2012X7R1H105K / C2012X7R1H105K125AB). Anything else is another part.
 */
export function samePart(a: string, b: string): boolean {
  const [x, y] = [normaliseMpn(a), normaliseMpn(b)];
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 6 && l.startsWith(s) && l.length - s.length <= 6;
}

/** Line issues the validation reports, and how loudly. */
const ISSUE_LEVEL: Record<string, Level> = {
  PACKAGE_CONFLICT: "red",
  MPN_VALUE_MISMATCH: "red",
  MPN_VOLTAGE_LOW: "red",
  MPN_SIZE_MISMATCH: "red",
  MPN_SPEC_DIFF: "amber",
  MPN_UNREADABLE: "amber",
  GENERIC_MPN: "amber",
};

// ───────────────────────────── Flags ─────────────────────────────

const OBSOLETE = new Set(["OBSOLETE", "EOL"]);
const FADING = new Set(["NRND", "LAST_TIME_BUY"]);
const LIFECYCLE_WORDS: Record<string, string> = { OBSOLETE: "obsolete", EOL: "end of life", NRND: "not recommended for new designs", LAST_TIME_BUY: "at last-time buy" };

const lineSubject = (l: VLine) => `line ${l.lineNo}`;
const n = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-IN")} ${k === 1 ? one : many}`;

/** All flags of one BoM, with the reviewers' calls applied. */
export function validate(input: ValidationInput): Validation {
  const flags: Omit<Flag, "state" | "reason">[] = [];
  const skipped: Validation["skipped"] = [];
  const fitted = input.lines.filter((l) => !l.dnp);
  const lineOf = new Map<string, VLine>();
  for (const l of input.lines) for (const r of l.refs) lineOf.set(r.toUpperCase(), l);

  // Part number: what is bought is the customer's part, and the line's own words agree about it.
  for (const l of fitted) {
    const subject = l.refs[0] ?? lineSubject(l);
    if (l.part && l.mpn?.trim() && !l.mpn.split(/\s*[/;,]\s*(?=[A-Z0-9]{4})/i).some((m) => samePart(m, l.part!.mpn)))
      flags.push({
        key: `part:${l.lineNo}`,
        check: "part",
        level: l.part.confirmed ? "red" : "amber",
        subject,
        lineNo: l.lineNo,
        refs: l.refs,
        text: l.part.confirmed
          ? `matched to ${l.part.mpn} (${l.part.manufacturer}), not the BoM's ${l.mpn}: a substitute the customer must approve`
          : `our guess ${l.part.mpn} (${l.part.manufacturer}) is not the BoM's ${l.mpn}: confirm it as an approved substitute or clear it`,
      });
    for (const stored of l.issues ?? []) {
      const { code, detail, info } = readIssue(stored);
      const level = ISSUE_LEVEL[code];
      if (level) flags.push({ key: `part:${l.lineNo}-${code}`, check: "part", level, subject, lineNo: l.lineNo, refs: l.refs, text: detail ?? info?.help ?? code });
    }
  }

  // Distributor PN: when the BoM carries a distributor's numbers, each one against its line's part and maker.
  const sameMaker = input.sameMaker ?? ((a: string, b: string) => makerKey(a) === makerKey(b) || makerKey(a).split(" ")[0] === makerKey(b).split(" ")[0]);
  const carried = input.lines.filter((l) => l.supplierPn?.trim()).length;
  if (carried) {
    // An empty cell belongs to the column's distributor: the one most lines name.
    const owners = new Map<string, number>();
    for (const l of input.lines) if (l.supplier) owners.set(l.supplier, (owners.get(l.supplier) ?? 0) + 1);
    const column = [...owners].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    for (const l of fitted) {
      const f = checkSupplierPn({ pn: l.supplierPn ?? null, distributor: ((l.supplier ?? column) as Distributor | null) ?? null, mpn: l.mpn, maker: l.manufacturer }, sameMaker);
      if (f) flags.push({ key: `distributor:${l.lineNo}`, check: "distributor", level: f.level, subject: l.refs[0] ?? lineSubject(l), lineNo: l.lineNo, refs: l.refs, text: f.text });
    }
  } else skipped.push({ check: "distributor", why: "the BoM gives no distributor part numbers" });

  // Footprint: the BoM's package against the board's footprint name and the copper under the part.
  if (input.footprint?.hasBoard) {
    for (const r of input.footprint.refs) {
      if (r.status !== "mismatch" && r.status !== "check") continue;
      flags.push({ key: `footprint:${r.ref}`, check: "footprint", level: r.status === "mismatch" ? "red" : "amber", subject: r.ref, lineNo: r.lineNo, refs: [r.ref], text: r.why });
    }
  } else skipped.push({ check: "footprint", why: "no placement file or Gerbers to compare with" });

  // Placement and pin count need to know where the parts sit.
  if (input.placements && input.placements.length) {
    const placed = new Map(input.placements.map((p) => [p.refDes.toUpperCase(), p]));
    for (const l of fitted)
      for (const ref of l.refs) {
        const p = placed.get(ref.toUpperCase());
        if (!p) flags.push({ key: `placement:${ref}`, check: "placement", level: "red", subject: ref, lineNo: l.lineNo, refs: [ref], text: "in the BoM, not on the board or in the placement file" });
        else if (p.snap === "off-copper") flags.push({ key: `placement:${ref}`, check: "placement", level: "red", subject: ref, lineNo: l.lineNo, refs: [ref], text: "placed where the board has no copper pad" });
      }
    for (const p of input.placements)
      if (!lineOf.has(p.refDes.toUpperCase()))
        flags.push({ key: `placement:${p.refDes}`, check: "placement", level: "amber", subject: p.refDes, lineNo: null, refs: [p.refDes], text: "on the board, not in the BoM: a part missing from the BoM, or a footprint left empty on purpose" });

    for (const l of fitted) {
      const want = linePins(l);
      if (!want) continue;
      for (const ref of l.refs) {
        const p = placed.get(ref.toUpperCase());
        if (!p) continue;
        const pads = leadsOnCopper(p);
        const named = pinsFromText(p.footprint);
        // A land may carry a pad or two more than the part has pins (a tab, an exposed pad, mounting pads) but never fewer.
        const spare = /connector|header|conn|jack|socket/i.test(`${l.description ?? ""} ${l.pkg ?? ""}`) ? 4 : 2;
        if (pads !== null && (pads < want.pins || pads > want.pins + spare)) {
          flags.push({ key: `pins:${ref}`, check: "pins", level: "red", subject: ref, lineNo: l.lineNo, refs: [ref], text: `${n(want.pins, "pin")} by ${want.from}, ${n(pads, "pad")} on the board` });
        } else if (pads === null && named !== null && named !== want.pins) {
          flags.push({ key: `pins:${ref}`, check: "pins", level: "red", subject: ref, lineNo: l.lineNo, refs: [ref], text: `${n(want.pins, "pin")} by ${want.from}, the footprint ${p.footprint} has ${named}` });
        }
      }
    }
  } else {
    skipped.push({ check: "placement", why: "no placement file or Gerbers" });
    skipped.push({ check: "pins", why: "no placement file or Gerbers to count pads on" });
  }

  for (const l of fitted) {
    const subject = l.refs[0] ?? lineSubject(l);
    const refs = l.refs;
    // Availability: a part number, a part that is still made, and authorised stock for the build.
    if (!l.mpn?.trim() && !l.part) {
      flags.push({ key: `availability:${l.lineNo}`, check: "availability", level: "red", subject, lineNo: l.lineNo, refs, text: "no manufacturer part number: nothing to buy or check" });
    } else {
      const life = l.part?.lifecycle ?? null;
      if (life && OBSOLETE.has(life)) flags.push({ key: `lifecycle:${l.lineNo}`, check: "availability", level: "red", subject, lineNo: l.lineNo, refs, text: `the part is ${LIFECYCLE_WORDS[life]}` });
      else if (life && FADING.has(life)) flags.push({ key: `lifecycle:${l.lineNo}`, check: "availability", level: "amber", subject, lineNo: l.lineNo, refs, text: `the part is ${LIFECYCLE_WORDS[life]}` });
      if (l.part) {
        const stock = l.offers.filter((o) => o.authorised).reduce((s, o) => s + o.stock, 0);
        if (l.need > 0 && stock === 0) flags.push({ key: `availability:${l.lineNo}`, check: "availability", level: "red", subject, lineNo: l.lineNo, refs, text: `no authorised stock; the build needs ${l.need.toLocaleString("en-IN")}` });
        else if (stock < l.need) flags.push({ key: `availability:${l.lineNo}`, check: "availability", level: "amber", subject, lineNo: l.lineNo, refs, text: `${stock.toLocaleString("en-IN")} in authorised stock; the build needs ${l.need.toLocaleString("en-IN")}` });
      }
    }

    // Visibility: how many distributors list the part at all.
    if (!l.part) {
      if (l.mpn?.trim()) flags.push({ key: `visibility:${l.lineNo}`, check: "visibility", level: "amber", subject, lineNo: l.lineNo, refs, text: `${l.mpn} is not matched to a known part: no distributor data` });
    } else {
      const sellers = new Set(l.offers.map((o) => o.seller));
      const stocked = new Set(l.offers.filter((o) => o.stock > 0).map((o) => o.seller));
      // No offers at all may only mean prices were never fetched for it: to look at, not a stop.
      if (!sellers.size) flags.push({ key: `visibility:${l.lineNo}`, check: "visibility", level: "amber", subject, lineNo: l.lineNo, refs, text: "no distributor listing on file: refresh prices, or no one sells it" });
      else if (stocked.size <= 1) flags.push({ key: `visibility:${l.lineNo}`, check: "visibility", level: "amber", subject, lineNo: l.lineNo, refs, text: stocked.size ? `only ${[...stocked][0]} has it in stock` : `listed by ${n(sellers.size, "distributor")}, none has stock` });
    }
  }

  // Competitors: any line, fitted or not — a competitor's part has no place in the customer's files at all.
  if (input.competitors.length) {
    for (const l of input.lines) {
      // The customer's own maker, and the matched part's only when the match is sure: a guessed match is not theirs.
      const maker = l.part?.confirmed ? l.part.manufacturer : null;
      const c = competitorOf([l.manufacturer, maker], input.competitors);
      if (c) flags.push({ key: `competitor:${l.lineNo}`, check: "competitor", level: "red", subject: l.refs[0] ?? lineSubject(l), lineNo: l.lineNo, refs: l.refs, text: `${competitorOf([l.manufacturer], input.competitors) ? l.manufacturer : maker} is on the customer's competitor list (${c.name})` });
    }
  } else skipped.push({ check: "competitor", why: "the customer has no competitor list" });

  const calls = new Map(input.calls.map((c) => [c.key, c]));
  const out: Flag[] = flags.map((f) => {
    const c = calls.get(f.key);
    const state: CallState = c ? (c.status === "ACCEPTED" ? "accepted" : "prohibited") : f.check === "competitor" ? "prohibited" : "open";
    return { ...f, state, reason: c?.reason ?? (f.check === "competitor" && !c ? "competitor's part" : null) };
  });
  const counts = Object.fromEntries((Object.keys(CHECK_LABEL) as Check[]).map((k) => [k, { open: 0, accepted: 0, prohibited: 0 }])) as Validation["counts"];
  for (const f of out) counts[f.check][f.state]++;
  const open = out.filter((f) => f.state === "open").length;
  const accepted = out.filter((f) => f.state === "accepted").length;
  const prohibited = out.filter((f) => f.state === "prohibited").length;
  return { flags: out, counts, open, accepted, prohibited, ready: open === 0 && prohibited === 0, skipped };
}

/** The report as CSV rows (header first), for the customer or the file. */
export function validationCsv(v: Validation): string[][] {
  return [
    ["Check", "Level", "Designator / line", "Line", "Designators", "Finding", "Call", "Reason"],
    ...v.flags.map((f) => [CHECK_LABEL[f.check], f.level, f.subject, f.lineNo === null ? "" : String(f.lineNo), f.refs.join(" "), f.text, f.state, f.reason ?? ""]),
  ];
}

/**
 * A customer's competitor list as pasted or uploaded: one maker per line or row; other spellings after it in the
 * next cells, or after a comma, semicolon, slash or pipe, or in brackets ("Texas Instruments (TI)"). A header row
 * ("Competitor", "Manufacturer", "Name") and blank lines are skipped; the same maker twice is merged.
 */
export function parseCompetitors(rows: string[][]): Competitor[] {
  const out = new Map<string, Competitor>();
  for (const row of rows) {
    const cells = row.flatMap((c) => String(c ?? "").split(/[;,|/]|\(|\)/)).map((c) => c.trim()).filter(Boolean);
    if (!cells.length) continue;
    const [name, ...aliases] = cells;
    if (/^(?:competitors?|manufacturers?|makers?|names?|brands?|vendors?)$/i.test(name)) continue;
    const key = makerKey(name);
    if (!key) continue;
    const kept = out.get(key) ?? { name, aliases: [] };
    for (const a of aliases) if (makerKey(a) && makerKey(a) !== key && !kept.aliases.some((x) => makerKey(x) === makerKey(a))) kept.aliases.push(a);
    out.set(key, kept);
  }
  return [...out.values()];
}
