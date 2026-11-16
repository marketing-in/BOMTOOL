/**
 * The feasibility review: every fact about the build turned into a check (green / amber / red), grouped into gates
 * in build order. Gates are signed one after another; a signed gate is locked and nothing reopens it. Pure.
 */

export type Level = "green" | "amber" | "red";

export const GATES = [
  { key: "data", title: "Files & data", what: "Is what the customer sent enough to judge the build?" },
  { key: "board", title: "Bare board", what: "Can a fabricator on file make this board?" },
  { key: "parts", title: "Components", what: "Is every line matched, priced and available?" },
  { key: "smt", title: "Paste & SMT", what: "Can our SMT lines print, place and reflow it?" },
  { key: "tht", title: "Through-hole & finishing", what: "Insertion, wave or selective, press-fit, coating." },
  { key: "test", title: "Inspection & test", what: "Can every joint be inspected and the board tested?" },
  { key: "box", title: "Box build", what: "Does it go into its enclosure with a complete kit?" },
  { key: "cost", title: "Cost", what: "Is every element of the cost known?" },
  { key: "capacity", title: "Capacity & shifts", what: "How long the lot takes on our lines." },
] as const;

export type GateKey = (typeof GATES)[number]["key"];

export type Check = {
  key: string;
  gate: GateKey;
  label: string;
  level: Level;
  detail: string;
  /** The number a sign-off vouches for; a change after signing is flagged. */
  value?: string;
  fix?: { href: string; label: string };
};

export type Facts = {
  revisionId: string;
  qty: number;
  data: { boardSource: "gerber" | "spec"; placed: boolean; pasteSource: "paste-layer" | "mask-openings" | "packages" | null; lines: number; unmatched: number; assumedPins: number; parts: number; /** Do-not-populate designators and their pins. */ dnp?: { parts: number; pins: number } };
  board: { chosen: boolean; auto: boolean; fits: boolean; name: string | null; gaps: string[]; layers: number; sizeMm: [number, number]; leadDays: number | null };
  parts: { counted: number; unpriced: number; short: number; redRisk: number; amberRisk: number };
  smt: {
    placements: number;
    sides: number;
    joints: number;
    line: string | null;
    /** Why no SMT line can build it, per line. Empty when one can. */
    lineGaps: string[];
    finestPitchMm: number | null;
    smallestChip: string | null;
    hidden: number;
    xray: boolean;
    feeders: { needed: number; slots: number | null; setups: number } | null;
    moistureSensitive: number;
    watch: string[];
    stencilUm: number | null;
    pasteG: number;
    /** Smallest stencil aperture area ratio, where it is, and the least that prints reliably. */
    areaRatio?: { value: number; ref: string; min: number } | null;
  };
  tht: { parts: number; joints: number; selective: boolean; solderCapable: boolean; pressFit: number; pressFitCapable: boolean; coating: string | null; coatCapable: boolean; /** Parts masked before coating. */ masked?: number };
  test: { inspected: { spi: number; aoi: number; xray: number; tht: number }; /** Pin count with the plant's ×2 parts, and how many parts that is. */ pins?: { weighted: number; doubledParts: number; /** Pins of do-not-populate parts inside the count. */ dnpPins?: number }; nets: number; ict: boolean; probeCapable: boolean; programmable: number; fct: boolean };
  box: { wanted: boolean; name: string | null; fits: boolean; fitText: string; kitGaps: number; priced: boolean };
  cost: { unitPrice: number | null; unpriced: number; boardPriced: boolean; marginPct: number; pastePerBoard: number; text: string };
  capacity: { shifts: number; days: number; bottleneck: string | null; materialLeadDays: number; lotHours: number };
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function buildChecks(f: Facts): Check[] {
  const out: Check[] = [];
  const base = `/boms/${f.revisionId}`;
  const add = (gate: GateKey, key: string, label: string, level: Level, detail: string, extra: Partial<Pick<Check, "value" | "fix">> = {}) => out.push({ key: `${gate}.${key}`, gate, label, level, detail, ...extra });

  // ── 1 Files & data
  add("data", "bom", "BoM lines read", f.data.lines ? "green" : "red", f.data.lines ? `${plural(f.data.lines, "line")}, ${plural(f.data.parts, "placement")} on the board.` : "The BoM has no lines.", { value: `${f.data.lines}/${f.data.parts}` });
  add(
    "data",
    "gerbers",
    "Fabrication files",
    f.data.boardSource === "gerber" ? "green" : "amber",
    f.data.boardSource === "gerber" ? "Board size and layers come from the Gerbers." : "No Gerbers: board size and layers come from the project spec. Upload them to measure the board and the paste.",
    f.data.boardSource === "gerber" ? {} : { fix: { href: `${base}/board`, label: "Add Gerbers" } },
  );
  add(
    "data",
    "placement",
    "Placement data",
    f.data.placed ? "green" : "amber",
    f.data.placed ? "Every designator has a position and a side." : "No pick-and-place file: all parts are assumed on the top side, so a second SMT pass may be missing.",
    f.data.placed ? {} : { fix: { href: `${base}/board`, label: "Add pick-and-place" } },
  );
  if (f.data.assumedPins)
    add("data", "pins", "Pin counts", "amber", `${plural(f.data.assumedPins, "placement")} without a known package — counted as two joints each.`, { fix: { href: `${base}/build/parts`, label: "Choose the parts" } });

  if (f.data.dnp?.parts)
    add("data", "dnp", "Do-not-populate parts", "green", `${plural(f.data.dnp.parts, "designator")} marked DNP (${plural(f.data.dnp.pins, "pin")}): not bought and not placed. Their pins are in the pin count and their pads in the paste.`, { value: `${f.data.dnp.parts}/${f.data.dnp.pins}` });

  // ── 2 Bare board
  add(
    "board",
    "fab",
    "Fabricator",
    !f.board.chosen ? "red" : !f.board.fits ? "red" : f.board.auto ? "amber" : "green",
    !f.board.chosen
      ? "No PCB fabricator on file can be priced."
      : !f.board.fits
        ? `${f.board.name}: ${f.board.gaps.join("; ") || "does not meet this board's needs"}.`
        : f.board.auto
          ? `${f.board.name} is the cheapest that fits — not confirmed yet.`
          : `${f.board.name} makes ${f.board.layers}-layer boards like this${f.board.leadDays !== null ? `, ${f.board.leadDays} days` : ""}.`,
    { fix: { href: `${base}/build/board`, label: "Bare board step" } },
  );

  // ── 3 Components
  add(
    "parts",
    "matched",
    "Lines matched to parts",
    f.data.unmatched ? "red" : "green",
    f.data.unmatched ? `${plural(f.data.unmatched, "line")} without a part — nothing to buy or place.` : `All ${f.parts.counted} lines have a part.`,
    f.data.unmatched ? { fix: { href: `${base}/build/parts`, label: "Choose the parts" } } : {},
  );
  add(
    "parts",
    "priced",
    "Prices",
    f.parts.unpriced ? "red" : "green",
    f.parts.unpriced ? `${plural(f.parts.unpriced, "line")} without a price at ${f.qty.toLocaleString("en-IN")} pcs.` : "Every line has a price at this quantity.",
    f.parts.unpriced ? { fix: { href: `${base}/build/parts`, label: "Components step" } } : {},
  );
  add(
    "parts",
    "available",
    "Availability",
    f.parts.short ? "amber" : "green",
    f.parts.short ? `${plural(f.parts.short, "line")} short at every source — they wait for the factory lead time.` : "Stock covers every line: ours first, then distributors.",
    f.parts.short ? { fix: { href: `${base}/supply`, label: "Supply chain" } } : {},
  );
  add(
    "parts",
    "risk",
    "Part risk",
    f.parts.redRisk ? "amber" : "green",
    f.parts.redRisk ? `${plural(f.parts.redRisk, "line")} at high risk (lifecycle, single source or lead time)${f.parts.amberRisk ? `, ${f.parts.amberRisk} to watch` : ""}.` : f.parts.amberRisk ? `No high-risk parts; ${f.parts.amberRisk} to watch.` : "No part at high risk.",
    f.parts.redRisk ? { fix: { href: `${base}/analysis`, label: "Analysis" } } : {},
  );

  // ── 4 Paste & SMT
  if (!f.smt.placements) add("smt", "none", "SMT", "green", "No surface-mount parts — no stencil, no reflow.");
  else {
    add(
      "smt",
      "line",
      "A line that can build it",
      f.smt.lineGaps.length ? "red" : "green",
      f.smt.lineGaps.length ? `No SMT line fits: ${f.smt.lineGaps.join(" · ")}.` : `${f.smt.line ?? "An SMT line"} takes it: ${plural(f.smt.placements, "placement")} on ${plural(f.smt.sides, "side")}${f.smt.smallestChip ? `, chips down to ${f.smt.smallestChip}` : ""}${f.smt.finestPitchMm ? `, pitch down to ${f.smt.finestPitchMm} mm` : ""}.`,
      { value: `${f.smt.placements}/${f.smt.sides}`, fix: { href: "/operations/lines", label: "Lines" } },
    );
    add(
      "smt",
      "paste",
      "Solder paste",
      f.data.pasteSource === "packages" ? "amber" : "green",
      `${f.smt.pasteG.toFixed(2)} g a board through a ${f.smt.stencilUm} µm stencil, ${f.data.pasteSource === "paste-layer" ? "measured from the paste layer" : f.data.pasteSource === "mask-openings" ? "measured from the mask openings" : "estimated from the packages — upload the paste layer to measure it"}.`,
      { value: f.smt.pasteG.toFixed(2) },
    );
    if (f.smt.areaRatio)
      add(
        "smt",
        "release",
        "Paste release",
        f.smt.areaRatio.value < f.smt.areaRatio.min ? "amber" : "green",
        f.smt.areaRatio.value < f.smt.areaRatio.min
          ? `Smallest aperture area ratio ${f.smt.areaRatio.value.toFixed(2)} at ${f.smt.areaRatio.ref}, under ${f.smt.areaRatio.min}: use a thinner or stepped-down foil there.`
          : `Smallest aperture area ratio ${f.smt.areaRatio.value.toFixed(2)} at ${f.smt.areaRatio.ref} — paste releases cleanly from a ${f.smt.stencilUm} µm foil.`,
      );
    const fine = (f.smt.finestPitchMm !== null && f.smt.finestPitchMm <= 0.4) || f.smt.smallestChip === "0201" || f.smt.smallestChip === "01005";
    add("smt", "difficulty", "Fine features", fine ? "amber" : "green", fine ? `Fine work: ${[f.smt.finestPitchMm !== null && f.smt.finestPitchMm <= 0.4 ? `${f.smt.finestPitchMm} mm pitch` : null, f.smt.smallestChip === "0201" || f.smt.smallestChip === "01005" ? `${f.smt.smallestChip} chips` : null].filter(Boolean).join(", ")} — thin stencil, SPI limits tightened, first article under the microscope.` : "Nothing finer than our everyday work.");
    if (f.smt.feeders)
      add(
        "smt",
        "feeders",
        "Feeders",
        f.smt.feeders.setups > 1 ? "amber" : "green",
        f.smt.feeders.slots ? `${f.smt.feeders.needed} feeder slots needed of ${f.smt.feeders.slots}${f.smt.feeders.setups > 1 ? ` — ${f.smt.feeders.setups} set-ups, the board passes the line more than once` : ""}.` : `${f.smt.feeders.needed} feeder slots needed.`,
      );
    if (f.smt.moistureSensitive) add("smt", "msl", "Moisture-sensitive parts", "amber", `${plural(f.smt.moistureSensitive, "part")} at MSL 3 or above — floor life is tracked from bag opening.`);
    for (const [i, w] of f.smt.watch.entries()) add("smt", `watch${i}`, "Watch", "amber", w);
  }

  // ── 5 Through-hole & finishing
  if (!f.tht.parts && !f.tht.pressFit && !f.tht.coating) add("tht", "none", "Through-hole & coating", "green", "No through-hole, press-fit or coating on this product.");
  if (f.tht.parts)
    add(
      "tht",
      "solder",
      f.tht.selective ? "Selective soldering" : "Wave soldering",
      f.tht.solderCapable ? "green" : "red",
      f.tht.solderCapable
        ? `${plural(f.tht.parts, "part")}, ${plural(f.tht.joints, "joint")}${f.tht.selective ? " — selective, because the bottom side carries SMD parts" : " in one wave pass"}.`
        : `${plural(f.tht.parts, "through-hole part")} but no line with ${f.tht.selective ? "selective" : "wave"} soldering.`,
      { value: `${f.tht.parts}/${f.tht.joints}` },
    );
  if (f.tht.pressFit) add("tht", "press", "Press-fit", f.tht.pressFitCapable ? "green" : "red", f.tht.pressFitCapable ? `${plural(f.tht.pressFit, "press-fit part")} on the press-fit cell.` : `${plural(f.tht.pressFit, "press-fit part")} but no press-fit cell.`);
  if (f.tht.coating) add("tht", "coat", "Conformal coating", f.tht.coatCapable ? "green" : "red", f.tht.coatCapable ? `${f.tht.coating} coating after cleaning.` : `${f.tht.coating} coating called up, but no coating line.`);

  if (f.tht.coating && f.tht.masked !== undefined)
    add("tht", "mask", "Masking", f.tht.masked ? "amber" : "green", f.tht.masked ? `${plural(f.tht.masked, "part")} to mask before coating (connectors, relays, switches, test points) and unmask after.` : "Nothing to mask before coating.", { value: `${f.tht.masked}` });

  // ── 6 Inspection & test
  const ins = f.test.inspected;
  if (f.test.pins)
    add(
      "test",
      "pins",
      "Pin count",
      "green",
      `${f.test.pins.weighted.toLocaleString("en-IN")} pins a board as we count them${f.test.pins.doubledParts ? `: ${plural(f.test.pins.doubledParts, "MOSFET, relay, connector or inductor", "MOSFETs, relays, connectors and inductors")} counted twice` : " — no part counts double"}.${f.test.pins.dnpPins ? `; ${f.test.pins.dnpPins.toLocaleString("en-IN")} of them on DNP parts, counted but not soldered` : ""}.`,
      { value: `${f.test.pins.weighted}` },
    );
  add("test", "joints", "Joints to inspect", "green", `${plural(ins.spi, "paste deposit")} at SPI, ${plural(ins.aoi, "joint")} at AOI${ins.xray ? `, ${ins.xray.toLocaleString("en-IN")} under bodies at X-ray` : ""}${ins.tht ? `, ${ins.tht.toLocaleString("en-IN")} through-hole` : ""} — on every board.`, { value: `${ins.spi}/${ins.aoi}/${ins.xray}/${ins.tht}` });
  if (f.smt.hidden) add("test", "xray", "Hidden joints", f.smt.xray ? "green" : "red", f.smt.xray ? `${plural(f.smt.hidden, "part")} soldered under the body — X-ray on the line.` : `${plural(f.smt.hidden, "part")} soldered under the body and no X-ray on any line.`);
  add("test", "electrical", f.test.ict ? "In-circuit test" : "Flying probe", f.test.probeCapable ? "green" : "amber", f.test.probeCapable ? `About ${f.test.nets.toLocaleString("en-IN")} nets to probe (estimated — no netlist)${f.test.ict ? "; a fixture is built" : "; no fixture"}.` : "No electrical tester on file — the functional test alone has to find assembly faults.");
  add("test", "fct", "Functional test", "amber", `${f.test.programmable ? `${plural(f.test.programmable, "programmable part")} to load. ` : ""}The customer's test specification and firmware have to be in hand before the first article.`);

  // ── 7 Box build
  if (!f.box.wanted) add("box", "none", "Enclosure", "green", "Board-only delivery — no box build.");
  else {
    add("box", "fit", "Board in the box", f.box.fits ? "green" : "red", `${f.box.name}: ${f.box.fitText}`, { fix: { href: `${base}/build/box`, label: "Box step" } });
    add("box", "kit", "Box-build kit", f.box.kitGaps ? "amber" : "green", f.box.kitGaps ? `${plural(f.box.kitGaps, "kit item")} (screws, standoffs, labels, cables) not on the BoM yet.` : "Fasteners, standoffs and labels are on the BoM.", f.box.kitGaps ? { fix: { href: `${base}/build/box`, label: "Box step" } } : {});
    if (!f.box.priced) add("box", "price", "Box price", "red", `${f.box.name} has no price at this quantity.`, { fix: { href: `${base}/build/box`, label: "Box step" } });
  }

  // ── 8 Cost
  add(
    "cost",
    "complete",
    "Cost complete",
    f.cost.unitPrice === null || !f.cost.boardPriced ? "red" : f.cost.unpriced ? "red" : "green",
    f.cost.unitPrice === null || !f.cost.boardPriced ? "The bare board has no price, so there is no price per board." : f.cost.unpriced ? `${plural(f.cost.unpriced, "line")} unpriced — the price per board is short by their cost.` : f.cost.text,
    { fix: { href: `${base}/build/quote`, label: "Quote step" } },
  );
  add("cost", "margin", "Margin", f.cost.marginPct < 5 ? "amber" : "green", `${f.cost.marginPct} % margin on material and conversion${f.cost.marginPct < 5 ? " — thin for a first build" : ""}.`, { fix: { href: `${base}/build/quote`, label: "Rates" } });

  // ── 9 Capacity & shifts
  add("capacity", "shifts", "Shifts for the lot", "green", `${f.qty.toLocaleString("en-IN")} pcs take about ${f.capacity.lotHours.toFixed(1)} h of line time: ${f.capacity.shifts.toFixed(1)} shifts, ${Math.max(1, Math.ceil(f.capacity.days))} working day${Math.ceil(f.capacity.days) > 1 ? "s" : ""} on the lines' shift pattern${f.capacity.bottleneck ? `; ${f.capacity.bottleneck} takes longest` : ""}.`, { value: `${f.qty}` });
  add("capacity", "material", "Material lead time", f.capacity.materialLeadDays > 84 ? "amber" : "green", f.capacity.materialLeadDays ? `Material is in after about ${Math.ceil(f.capacity.materialLeadDays / 7)} weeks; the build follows.` : "Material is on the shelf.");
  return out;
}

export type Verdict = { level: Level; label: string; summary: string; reds: number; ambers: number; greens: number };

export function verdict(checks: Check[]): Verdict {
  const reds = checks.filter((c) => c.level === "red").length;
  const ambers = checks.filter((c) => c.level === "amber").length;
  const greens = checks.length - reds - ambers;
  // Two ambers are housekeeping every new product has (customer test spec, an unconfirmed fab).
  const level: Level = reds ? "red" : ambers > 2 ? "amber" : "green";
  const label = level === "red" ? "Not buildable as it stands" : level === "amber" ? "Buildable with care" : "Easy to build";
  const summary =
    level === "red"
      ? `${plural(reds, "blocker")} to clear before we can commit${ambers ? `, and ${plural(ambers, "point")} to watch` : ""}.`
      : level === "amber"
        ? `Nothing blocks the build; ${plural(ambers, "point")} need attention.`
        : ambers
          ? `Everyday work for our lines; ${plural(ambers, "point")} to confirm.`
          : "Everyday work for our lines.";
  return { level, label, summary, reds, ambers, greens };
}

// ───────────────────────────── Sign-off ─────────────────────────────

export type Waiver = { check: string; label: string; reason: string };

export type Signoff = {
  gate: GateKey;
  by: string;
  byName: string;
  /** ISO time. */
  at: string;
  note: string;
  waived: Waiver[];
  /** The gate's checks as signed. */
  fingerprint: string;
  /** What the gate said when signed, kept for the record. */
  record: { label: string; level: Level; detail: string }[];
};

export const fingerprint = (checks: Check[]) => checks.map((c) => `${c.key}=${c.level}${c.value ? `:${c.value}` : ""}`).join("|");

export function readSignoffs(raw: unknown): Signoff[] {
  if (!Array.isArray(raw)) return [];
  const keys = GATES.map((g) => g.key) as string[];
  return (raw as Signoff[]).filter((s) => s && typeof s === "object" && keys.includes(s.gate) && typeof s.at === "string");
}

export type GateState = {
  key: GateKey;
  n: number;
  title: string;
  what: string;
  checks: Check[];
  level: Level;
  /** signed: locked for good · open: the one gate that can be signed now · waiting: an earlier gate is still open. */
  status: "signed" | "open" | "waiting";
  signoff: Signoff | null;
  /** Signed, and the product has changed since. */
  changed: boolean;
};

const worst = (checks: Check[]): Level => (checks.some((c) => c.level === "red") ? "red" : checks.some((c) => c.level === "amber") ? "amber" : "green");

export function gateStates(checks: Check[], signoffs: Signoff[]): GateState[] {
  let opened = false;
  return GATES.map((g, i) => {
    const mine = checks.filter((c) => c.gate === g.key);
    const signoff = signoffs.find((s) => s.gate === g.key) ?? null;
    const status: GateState["status"] = signoff ? "signed" : opened ? "waiting" : "open";
    if (!signoff) opened = true;
    return { key: g.key, n: i + 1, title: g.title, what: g.what, checks: mine, level: worst(mine), status, signoff, changed: !!signoff && signoff.fingerprint !== fingerprint(mine) };
  });
}

export type SignRequest = { gate: GateKey; note: string; waivers: Record<string, string> };

/**
 * Signs the open gate, or says why not. Order is enforced here: only the first unsigned gate can be signed, and a
 * signed gate is never touched again. A red check needs a waiver with a reason from someone allowed to give one.
 */
export function sign(checks: Check[], signoffs: Signoff[], req: SignRequest, who: { id: string; name: string; canWaive: boolean }, now: Date): { signoffs: Signoff[] } | { error: string } {
  const states = gateStates(checks, signoffs);
  const gate = states.find((s) => s.key === req.gate);
  if (!gate) return { error: "Unknown gate." };
  if (gate.status === "signed") return { error: `${gate.title} is signed and locked — it cannot be changed.` };
  if (gate.status === "waiting") {
    const open = states.find((s) => s.status === "open")!;
    return { error: `Sign gate ${open.n}, ${open.title}, first — the gates go in order.` };
  }
  const reds = gate.checks.filter((c) => c.level === "red");
  const waived: Waiver[] = [];
  for (const c of reds) {
    const reason = (req.waivers[c.key] ?? "").trim();
    if (!reason) return { error: `"${c.label}" is red. Clear it, or have Quality waive it with a reason.` };
    if (!who.canWaive) return { error: "Only Quality or an administrator can waive a red check." };
    if (reason.length < 10) return { error: `Give a fuller reason for waiving "${c.label}" (10 characters or more).` };
    waived.push({ check: c.key, label: c.label, reason: reason.slice(0, 500) });
  }
  const entry: Signoff = {
    gate: gate.key,
    by: who.id,
    byName: who.name,
    at: now.toISOString(),
    note: req.note.trim().slice(0, 1000),
    waived,
    fingerprint: fingerprint(gate.checks),
    record: gate.checks.map((c) => ({ label: c.label, level: c.level, detail: c.detail })),
  };
  return { signoffs: [...signoffs, entry] };
}

export const reviewPassed = (signoffs: Signoff[]) => GATES.every((g) => signoffs.some((s) => s.gate === g.key));
