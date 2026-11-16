import type { Article } from "@/knowledge/types";
import type { DictEntry } from "@/knowledge/dictionary/types";
import type { DeepReport } from "@/lib/bom/deep-analysis";
import type { ReverseReport } from "@/lib/reverse";
import type { AsmPart } from "@/lib/feasibility/joints";
import { countJoints } from "@/lib/feasibility/joints";
import { compressRefs } from "@/lib/board/find-parts";
import { normaliseMpn } from "@/lib/normalise";
import type { PartReport } from "@/server/part-report";
import type { PlantCheck } from "@/lib/ops/machines";
import type { BuildLike } from "./types";

/**
 * What a tool hands to the AI: the platform's records cut down to the figures an answer needs. Every list is
 * capped and says how many rows it left out, so nothing is dropped silently. Money is INR throughout.
 */

type Line = BuildLike["lines"][number];

const r2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const r0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v));
export const refsOf = (refDes: string | null | undefined) => (refDes ?? "").split(/[,\s;]+/).map((r) => r.trim()).filter(Boolean);
/** A long run of designators, cut to the first few with the rest counted. */
export const someRefs = (refs: string[], limit = 12) => (refs.length > limit ? `${compressRefs(refs.slice(0, limit))} +${refs.length - limit} more` : compressRefs(refs));
const capped = <T>(rows: T[], limit: number) => ({ rows: rows.slice(0, limit), more: Math.max(0, rows.length - limit) });

// ── Knowledge

export function articleText(a: Article): string {
  const out: string[] = [`# ${a.title}`, a.summary];
  for (const s of a.sections) {
    out.push(`\n## ${s.heading}`);
    if (s.type === "text") out.push(...s.paragraphs);
    else if (s.type === "facts") out.push(...s.items.map((i) => `- ${i.label}: ${i.value}`));
    else if (s.type === "list") out.push(...s.items.map((i) => `- ${i}`));
    else if (s.type === "steps") out.push(...s.steps.map((st, i) => `${i + 1}. ${st.title} — ${st.detail}`));
    else {
      out.push(s.columns.join(" | "), ...s.rows.map((r) => r.join(" | ")));
      if (s.note) out.push(s.note);
    }
  }
  if (a.standards?.length) out.push("\n## Standards", ...a.standards.map((s) => `- ${s.code}: ${s.title}`));
  return out.join("\n");
}

/** Articles longer than this are cut, and the cut is stated in the result. */
export const ARTICLE_CHARS = 14_000;

export function articleDigest(a: Article) {
  const text = articleText(a);
  return {
    kind: "article" as const,
    slug: a.slug,
    title: a.title,
    domain: a.domain,
    tags: a.tags,
    related: a.related ?? [],
    text: text.length > ARTICLE_CHARS ? text.slice(0, ARTICLE_CHARS) : text,
    ...(text.length > ARTICLE_CHARS ? { cut: `Only the first ${ARTICLE_CHARS} of ${text.length} characters are here; the rest is on the article's page.` } : {}),
  };
}

export function dictDigest(e: DictEntry) {
  return {
    kind: "dictionary" as const,
    slug: e.slug,
    name: e.name,
    aka: e.aka ?? [],
    group: e.group,
    oneLiner: e.oneLiner,
    what: e.what,
    how: e.how,
    specs: e.specs,
    packages: e.packages ?? [],
    uses: e.uses,
    selection: e.selection,
    alternatives: e.alternatives,
    assembly: e.ems ?? [],
    pitfalls: e.pitfalls ?? [],
    sourcing: e.sourcing ?? [],
    makers: e.makers ?? [],
    article: e.article ?? null,
    related: e.related ?? [],
    ...(e.maintenance ? { maintenance: e.maintenance, defects: e.defects ?? [], consumables: e.consumables ?? [] } : {}),
  };
}

// ── BoM

/** How a hand-chosen source reads: the name from the plan when the pinned offer is in use. */
export function pinLabel(l: Line): string | null {
  if (!l.pin) return null;
  if (l.pin.ours) return "our own stores";
  const row = l.plan.find((p) => (l.pin!.offerId && p.offerId === l.pin!.offerId) || (l.pin!.excessListingId && p.excessListingId === l.pin!.excessListingId));
  return row ? row.source : l.pin.offerId ? "a distributor offer (not in use at this quantity)" : "a partner / excess listing (not in use at this quantity)";
}

export function lineRow(l: Line) {
  return {
    line: l.lineNo,
    refs: someRefs(refsOf(l.refDes)) || null,
    mpn: l.mpn,
    matched: Boolean(l.partId),
    qtyPerBoard: l.qtyPerBoard,
    required: l.required,
    ...(l.dnp ? { dnp: true } : {}),
    ...(l.excluded ? { pricedAs: l.excluded } : {}),
    unitInr: r2(l.cost.unit),
    perBoardInr: r2(l.perBoard),
    source: l.sourceLabel,
    ...(l.pinned ? { pinnedTo: pinLabel(l) } : {}),
    leadWeeks: l.leadWeeks,
    risk: l.risk ? { score: l.risk.score, level: l.risk.level } : null,
    stock: l.stock,
  };
}

export const LINE_FILTERS = ["all", "risky", "short", "unmatched", "pinned", "long-lead", "costly"] as const;
export type LineFilter = (typeof LINE_FILTERS)[number];

const stockAll = (l: Line) => l.stock.ours + l.stock.partners + l.stock.distributors + l.stock.market;

export function filterLines(lines: Line[], filter: LineFilter): Line[] {
  const live = lines.filter((l) => !l.dnp);
  switch (filter) {
    case "risky":
      return live.filter((l) => l.risk && l.risk.level !== "green").sort((a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0));
    case "short":
      return live.filter((l) => l.partId && !l.excluded && stockAll(l) < l.required);
    case "unmatched":
      return live.filter((l) => !l.partId);
    case "pinned":
      return lines.filter((l) => l.pinned);
    case "long-lead":
      return live.filter((l) => (l.leadWeeks ?? 0) > 0).sort((a, b) => (b.leadWeeks ?? 0) - (a.leadWeeks ?? 0));
    case "costly":
      return [...live].sort((a, b) => b.perBoard - a.perBoard);
    default:
      return lines;
  }
}

export function linesDigest(b: BuildLike, filter: LineFilter, limit: number) {
  const { rows, more } = capped(filterLines(b.lines, filter), limit);
  return { bom: b.title, revisionId: b.revisionId, buildQty: b.refQty, filter, totalLines: b.lines.length, lines: rows.map(lineRow), ...(more ? { notShown: more } : {}) };
}

/** A line by its number ("12", "line 12"), one of its designators ("U3") or its part number. */
export function findLine(b: BuildLike, query: string): Line | null {
  const q = query.trim();
  if (!q) return null;
  const n = /^(?:line\s*)?#?(\d+)$/i.exec(q);
  if (n) return b.lines.find((l) => l.lineNo === Number(n[1])) ?? null;
  const up = q.toUpperCase();
  const byRef = b.lines.find((l) => refsOf(l.refDes).some((r) => r.toUpperCase() === up));
  if (byRef) return byRef;
  const key = normaliseMpn(q);
  if (!key) return null;
  return b.lines.find((l) => l.mpn && normaliseMpn(l.mpn) === key) ?? b.lines.find((l) => l.mpn && key.length >= 4 && normaliseMpn(l.mpn).includes(key)) ?? null;
}

const asmByRef = (b: BuildLike) => new Map<string, AsmPart>([...b.assembly.parts, ...b.assembly.dnp].map((p) => [p.refDes, p]));

type Placed = BuildLike["viewer"]["parts"][number];

function placedRow(p: Placed, asm: AsmPart | undefined) {
  return {
    ref: p.refDes,
    line: p.lineNo,
    side: p.side,
    xMm: r2(p.x),
    yMm: r2(p.y),
    rotationDeg: r0(p.rotation),
    package: p.pkg ?? asm?.pkg ?? null,
    pins: asm?.pins ?? p.body.pins,
    pitchMm: r2(asm?.pitchMm ?? p.body.pitch),
    mount: asm?.mount ?? null,
    mpn: p.mpn,
    value: p.value,
    kind: p.kind?.name ?? null,
    ...(p.dnp ? { dnp: true } : {}),
  };
}

export function lineDetail(b: BuildLike, l: Line) {
  const asm = asmByRef(b);
  const placed = b.viewer.parts.filter((p) => p.lineId === l.id);
  const first = placed[0];
  return {
    bom: b.title,
    revisionId: b.revisionId,
    buildQty: b.refQty,
    ...lineRow(l),
    refs: refsOf(l.refDes).join(", ") || null,
    manufacturer: l.manufacturer,
    description: l.description,
    category: l.category,
    footprint: l.footprint,
    kind: first?.kind?.name ?? null,
    lifecycle: first?.lifecycle ?? null,
    rohs: first?.rohs ?? null,
    reach: first?.reach ?? null,
    alternates: first?.alternates.map((a) => ({ mpn: a.mpn, type: a.type })) ?? [],
    /** The sources the quote uses for this line at the build quantity, in the order they are drawn on. */
    sourcesInUse: l.plan.map((p) => ({ tier: p.tier, kind: p.kind, source: p.source, qty: p.qty, orderQty: p.orderQty, landedUnitInr: r2(p.unit) })),
    pinnedSource: l.pinned ? { chosenByHand: true, source: pinLabel(l) } : { chosenByHand: false },
    riskSummary: l.risk?.summary ?? null,
    riskFactors: l.riskFactors.map((f) => ({ factor: f.label, score: f.score, level: f.level, reason: f.reason, ...(f.action ? { action: f.action } : {}) })),
    missingDetails: l.missing,
    onTheBoard: {
      layoutIsApproximate: b.viewer.approximateLayout,
      ...capped(placed.map((p) => placedRow(p, asm.get(p.refDes))), 24),
    },
  };
}

export function overviewDigest(b: BuildLike, deep: DeepReport | null) {
  return {
    revisionId: b.revisionId,
    bom: b.title,
    product: b.product ? { name: b.product.name, partNumber: b.product.partNumber, revision: b.product.revision } : null,
    buildQty: b.refQty,
    lines: b.lines.length,
    ...(deep
      ? {
          verdict: deep.verdict,
          linesThatNeedParts: deep.counted,
          matched: deep.matched,
          riskMix: deep.distribution,
          coveredFrom: deep.coverage,
          longestFactoryLead: deep.longestLead,
          toDoFirst: deep.actions.slice(0, 8).map((a) => ({ level: a.level, title: a.title, detail: a.detail, lines: a.lines.slice(0, 8).map((l) => l.label), ...(a.lines.length > 8 ? { moreLines: a.lines.length - 8 } : {}), toBuyInr: r0(a.value) })),
          riskiestLines: deep.topRisks.slice(0, 8).map((t) => ({ line: t.line.lineNo, mpn: t.line.mpn, refs: t.line.refDes, score: t.line.risk?.score ?? null, factor: t.factor.label, reason: t.factor.reason })),
          whereTheMoneyGoes: deep.pareto.slice(0, 8).map((p) => ({ label: p.label, inr: r0(p.value), sharePct: r0(p.share * 100), cumulativePct: r0(p.cumulative * 100) })),
          partsCostInr: r0(deep.spendTotal),
          stillToBuyInr: r0(deep.toBuyTotal),
          lifecycle: deep.lifecycle,
          compliance: deep.compliance,
        }
      : {}),
    quote: b.quotes.map((q) => ({ qty: q.qty, pricePerBoardInr: r2(q.unitPrice), lotInr: r0(q.lotPrice), nreInr: r0(q.nreTotal), perBoardByGroupInr: Object.fromEntries(Object.entries(q.byGroup).map(([k, v]) => [k, r2(v)])), linesWithoutPrice: q.unpriced })),
    delivery: { leadDays: b.leadDays, setBy: b.leadDriver },
    sourcing: {
      strategyInUse: b.sourcing.active,
      linesPinnedByHand: b.sourcing.pinned,
      componentsPerBoardInr: r2(b.sourcing.perBoardNow),
      strategies: b.sourcing.strategies.map((s) => ({ key: s.key, perBoardInr: r2(s.perBoard), leadWeeks: s.leadWeeks, linesShort: s.short, linesThatWouldChange: s.changes })),
    },
    warnings: b.warnings,
  };
}

// ── Board

export function boardDigest(b: BuildLike, reverse: ReverseReport | null) {
  const f = b.board.facts;
  const j = countJoints(b.assembly.parts);
  const packages = capped(j.byPackage, 30);
  return {
    revisionId: b.revisionId,
    bom: b.title,
    board: {
      widthMm: f.widthMm,
      heightMm: f.heightMm,
      areaCm2: r2(b.board.areaCm2),
      layers: f.layers,
      thicknessMm: f.thicknessMm,
      finish: f.finish,
      copperOz: f.copperOz ?? null,
      material: f.material ?? null,
      technology: b.board.technology.name,
      outlineFrom: b.viewer.board.source === "gerber" ? "the uploaded Gerbers" : "the board spec (no Gerbers uploaded)",
      placementsFrom: b.viewer.approximateLayout ? "an approximate layout (no centroid file) — positions are not real" : "the centroid / Gerber files",
      holes: b.viewer.board.fab?.holes ?? null,
      pasteApertures: b.viewer.board.fab ? { top: b.viewer.board.fab.paste.top?.apertures ?? null, bottom: b.viewer.board.fab.paste.bottom?.apertures ?? null } : null,
      fabricator: b.board.chosenName,
      fabLeadDays: b.board.leadDays,
    },
    pinsAndJoints: {
      note: "Pin counts come from each part's package. The platform holds no netlist, so pin functions and signal names are not known.",
      placements: j.placements,
      solderJoints: j.total,
      pinsAsThePlantCountsThem: j.weighted,
      smtTop: j.smt.TOP,
      smtBottom: j.smt.BOTTOM,
      throughHole: j.tht,
      pressFit: j.pressFit,
      hiddenJoints: j.hidden,
      finestPitchMm: j.finestPitchMm,
      doNotPopulate: b.assembly.dnp.length,
      mountAssumedFor: b.assembly.assumed,
      inspection: j.inspection,
      byPackage: packages.rows.map((p) => ({ package: p.pkg, mount: p.mount, parts: p.parts, pinsEach: p.jointsEach, joints: p.joints, ...(p.hidden ? { hiddenJoints: true } : {}), refs: someRefs(p.refs) })),
      ...(packages.more ? { packagesNotShown: packages.more } : {}),
    },
    box: b.viewer.enclosure ? { name: b.viewer.enclosure.label, fits: b.viewer.enclosure.fits } : null,
    route: b.viewer.route.map((s) => ({ step: s.title, side: s.side, parts: s.refs.length, ...(s.watch ? { watch: s.watch } : {}) })),
    ...(reverse
      ? {
          whatItIs: reverse.identity,
          blocks: reverse.blocks.map((k) => ({ block: k.label, does: k.does, parts: k.parts, main: k.items.slice(0, 5).map((i) => ({ refs: someRefs(i.refs), mpn: i.mpn, what: i.what, pins: i.pins })) })),
          powerRails: reverse.rails,
          powerInputs: reverse.powerInputs,
          findings: reverse.findings.map((x) => ({ level: x.level, title: x.title, detail: x.detail })),
          counts: reverse.counts,
        }
      : {}),
  };
}

export type BoardPartsQuery = { refs?: string[]; side?: "TOP" | "BOTTOM"; minPins?: number; limit?: number };

/** Designators asked for one by one ("U3") or as a run ("C1-C4"). */
function wantRef(refs: string[]) {
  const exact = new Set<string>();
  for (const raw of refs) {
    const r = raw.trim().toUpperCase();
    const run = /^([A-Z]+)(\d+)\s*-\s*(?:\1)?(\d+)$/.exec(r);
    if (run && Number(run[3]) >= Number(run[2]) && Number(run[3]) - Number(run[2]) <= 200) for (let i = Number(run[2]); i <= Number(run[3]); i++) exact.add(`${run[1]}${i}`);
    else if (r) exact.add(r);
  }
  return (ref: string) => exact.has(ref.toUpperCase());
}

export function boardPartsDigest(b: BuildLike, q: BoardPartsQuery) {
  const asm = asmByRef(b);
  const want = q.refs?.length ? wantRef(q.refs) : null;
  const all = b.viewer.parts
    .map((p) => placedRow(p, asm.get(p.refDes)))
    .filter((p) => (!want || want(p.ref)) && (!q.side || p.side === q.side) && (!q.minPins || p.pins >= q.minPins))
    .sort((x, y) => y.pins - x.pins || x.ref.localeCompare(y.ref, "en", { numeric: true }));
  const { rows, more } = capped(all, Math.min(Math.max(q.limit ?? 40, 1), 80));
  return {
    revisionId: b.revisionId,
    bom: b.title,
    frame: "x/y in mm from the board centre, y up; rotation in degrees",
    layoutIsApproximate: b.viewer.approximateLayout,
    partsOnBoard: b.viewer.parts.length,
    matching: all.length,
    parts: rows,
    ...(more ? { notShown: more } : {}),
    ...(want && !all.length ? { note: "None of those designators is on this board." } : {}),
  };
}

// ── Our lines against this board

export function lineFitDigest(b: Pick<BuildLike, "revisionId" | "title">, plant: PlantCheck) {
  const needed = plant.lines.filter((l) => l.level !== "na");
  return {
    revisionId: b.revisionId,
    bom: b.title,
    verdict: plant.level,
    summary: plant.summary,
    useLines: plant.use,
    boardNeeds: plant.needs,
    lines: needed.map((l) => ({
      code: l.code,
      name: l.name,
      type: l.type,
      fit: l.level,
      summary: l.summary,
      steps: l.steps.map((s) => ({ step: s.label, fit: s.level, machines: s.machines, ...(s.reasons.length ? { why: s.reasons } : {}), ...(s.recommended ? { recommended: true } : {}) })),
    })),
    notNeeded: plant.lines.filter((l) => l.level === "na").map((l) => l.code),
    note: "Amber 'not on file' means the machine's limit has not been entered — it can be looked up with AI on Operations → Lines.",
  };
}

// ── One catalogue part

export function partDigest(r: PartReport) {
  const brokers = [...r.availability.marketplace.brokers].sort((a, b) => b.stock - a.stock);
  return {
    ...r.part,
    availability: {
      ourStock: { free: r.availability.ours.reduce((t, l) => t + Math.max(0, l.free), 0), lots: r.availability.ours.slice(0, 8) },
      distributors: r.availability.suppliers.slice(0, 10),
      excess: r.availability.marketplace.excess.slice(0, 6),
      brokers: brokers.slice(0, 5),
      ...(brokers.length > 5 ? { brokersNotShown: brokers.length - 5 } : {}),
    },
    priceTrendPct90d: r2(r.priceTrendPct90d),
    risk: { atNeedOf: r.risk.assumedNeed, score: r.risk.score, level: r.risk.level, summary: r.risk.summary, factors: r.risk.factors.map((f) => ({ factor: f.label, score: f.score, level: f.level, reason: f.reason, ...(f.action ? { action: f.action } : {}) })) },
    alternates: r.alternates,
  };
}
