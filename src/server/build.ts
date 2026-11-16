import "server-only";
import { cache } from "react";
import type { CustomerQuote, SupplierKind } from "@prisma/client";
import { db } from "@/lib/db";
import { convert, getActiveFx, isCurrency, priceAtQty, type Currency } from "@/lib/currency";
import { readBreaks } from "@/lib/pricing";
import { landedCost, type DutyRate } from "@/lib/landed-cost";
import { normaliseMpn } from "@/lib/normalise";
import { DEFAULT_RATES, PCB_COST, BOX_COST } from "@/data/costing";
import { estimatePcb, type PcbFacts } from "@/lib/costing/pcb";
import { processCosts, type NreItem, type ProcessCost } from "@/lib/costing/process";
import { customBoxSpec, estimateCustomBox, machiningCost, type MakerStyle } from "@/lib/costing/box";
import { componentsCost, type LineCost } from "@/lib/costing/components";
import { defaultQuantities, quoteForQty, readRates, type QtyQuote } from "@/lib/costing/quote";
import { ENCLOSURES, boardFits, type EnclosureSpec } from "@/lib/board/enclosures";
import { analyseBox, boxVerdict, type KitLine } from "@/lib/board/box";
import { matchFabs, type BoardCapabilities, type BoxCapabilities } from "@/lib/supply-chain";
import { classifyBox, classifyPcb } from "@/lib/directory/recognise";
import { pcbTechnology } from "@/knowledge/pcb-technologies";
import { BOX_TYPES } from "@/knowledge/box-types";
import { FALLBACK_DUTY, analyseRevisionAt, loadDutyRates, type AnalysedLine, type LinePin } from "@/server/bom-pipeline";
import { viewerDataWithAnalysis } from "@/server/board-view";
import { ensureFx } from "@/server/fx";
import type { PartRisk } from "@/lib/part-risk";
import type { ViewerData } from "@/components/viewer/types";
import { asmParts } from "@/lib/feasibility/parts";
import { estimatePaste } from "@/lib/feasibility/paste";
import { compareStrategies, isStrategy, type OrderKey } from "@/lib/costing/strategy";

/**
 * Build & quote (Phase 13): everything the four steps show for one BoM revision — the bare-board options and their
 * prices per quantity, each line's cost and chosen source, the boxes that fit, the process cost and the quote.
 * All money in INR; pages convert for display.
 */

export type BoardChoice = { supplierId?: string; stockPartId?: string; quotedUnit?: number; quotedNre?: number; quotedLeadDays?: number };
export type BoxChoice = { kind: "catalogue"; mpn: string } | { kind: "custom"; style: MakerStyle; supplierId: string } | { kind: "none" };

export type PricePoint = { qty: number; unit: number | null; nre: number };

export type FabOption = {
  id: string;
  name: string;
  country: string | null;
  online: boolean;
  fits: boolean;
  gaps: string[];
  leadDays: number;
  certifications: string[];
  /** Landed estimate per quoted quantity. */
  prices: PricePoint[];
  /** The fab's own quote, typed in — replaces the estimate. */
  quoted: { unit: number; nre: number; leadDays: number | null } | null;
  minLot: boolean;
};

export type BoxSourceTiers = { ours: number; oursUnit: number | null; partners: number; distributors: number; distributorUnit: number | null; market: number; marketUnit: number | null; mock: boolean };

export type BoxOption = {
  key: string;
  kind: "catalogue" | "custom";
  spec: EnclosureSpec;
  /** Box type slug (src/knowledge/box-types.ts). */
  type: string | null;
  ipRating: string | null;
  fits: boolean;
  fitText: string;
  cutouts: number;
  leadDays: number;
  prices: PricePoint[];
  /** Catalogue boxes: the part and its stock by tier. */
  partId: string | null;
  tiers: BoxSourceTiers | null;
  /** Made to fit: who makes it. */
  maker: { id: string; name: string; country: string | null } | null;
};

export type LineRow = {
  id: string;
  lineNo: number;
  refDes: string;
  partId: string | null;
  mpn: string | null;
  manufacturer: string | null;
  description: string | null;
  /** The footprint as uploaded (or read off the Gerbers), for lines that have no part yet. */
  footprint: string | null;
  category: string | null;
  qtyPerBoard: number;
  dnp: boolean;
  /** Priced in step 1 or 3 instead. */
  excluded: "board" | "box" | null;
  required: number;
  cost: LineCost;
  perBoard: number;
  sourceLabel: string | null;
  pinned: boolean;
  pin: LinePin | null;
  /** How the waterfall covers this line at the reference quantity (landed INR for bought parts). */
  plan: { tier: number; kind: string; source: string; qty: number; orderQty: number; unit: number | null; offerId: string | null; excessListingId: string | null }[];
  /** Weeks until the whole line is here from the sources the quote uses: 0 when all of it is on a shelf, null when unknown. */
  leadWeeks: number | null;
  risk: Pick<PartRisk, "score" | "level" | "summary"> | null;
  riskFactors: PartRisk["factors"];
  /** Detail fields the catalogue still lacks. */
  missing: string[];
  stock: { ours: number; partners: number; distributors: number; market: number };
};

const TIER_LABEL: Record<number, string> = { 1: "Our stores", 2: "Consigned", 3: "Partner / excess", 4: "Distributor", 5: "Broker" };
const isEnclosure = (l: AnalysedLine) => l.part?.category.slug === "enclosure";
const isBareBoard = (l: AnalysedLine) =>
  l.part?.category.slug === "pcb" || (!l.part && /\b(bare\s+)?pcb\b|printed circuit board|bare board/i.test(`${l.rawDescription ?? ""} ${l.rawValue ?? ""}`) && !/pcba|assembly/i.test(l.rawDescription ?? ""));

/**
 * How long the line takes to arrive as the quote sources it. Stock is taken off a shelf (ours or a seller's), a
 * partner or excess listing quotes its own lead, and anything nobody has waits for the factory.
 */
function lineLead(l: AnalysedLine): number | null {
  if (!l.part || l.dnp) return null;
  if (l.shortfall > 0) return l.factoryLeadWeeks;
  if (!l.allocations.length) return null;
  return Math.max(0, ...l.allocations.map((a) => (a.excessListingId ? (a.leadWeeks ?? 0) : 0)));
}

export async function loadDraft(revisionId: string) {
  return db.customerQuote.findFirst({ where: { revisionId, status: "DRAFT" }, orderBy: { createdAt: "desc" } });
}

/** The open draft for a revision, made with defaults the first time a choice is saved. */
export async function ensureDraft(revisionId: string, userId?: string): Promise<CustomerQuote> {
  const d = await loadDraft(revisionId);
  if (d) return d;
  const rev = await db.bomRevision.findUniqueOrThrow({ where: { id: revisionId }, select: { buildQty: true } });
  return db.customerQuote.create({ data: { revisionId, quantities: defaultQuantities(rev.buildQty), createdById: userId } });
}

/** Key in a draft quote's `lines` JSON that holds the sourcing strategy; every other key is a BoM line id. */
export const STRATEGY_FIELD = "__strategy";

function readPins(raw: unknown): Map<string, LinePin> {
  const out = new Map<string, LinePin>();
  if (!raw || typeof raw !== "object") return out;
  for (const [lineId, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = v as LinePin;
    if (p && (typeof p.offerId === "string" || typeof p.excessListingId === "string" || p.ours === true)) out.set(lineId, p);
  }
  return out;
}

const readBoardChoice = (raw: unknown): BoardChoice => (raw && typeof raw === "object" ? (raw as BoardChoice) : {});
function readBoxChoice(raw: unknown): BoxChoice | null {
  const b = raw as BoxChoice | null;
  if (b?.kind === "none") return b;
  if (b?.kind === "catalogue" && ENCLOSURES[b.mpn]) return b;
  if (b?.kind === "custom" && typeof b.supplierId === "string" && b.style in BOX_COST.unit) return b;
  return null;
}

/** Landed INR per unit for an INR-equivalent price bought from `country`. */
function landed(unitInr: number, qty: number, country: string | null, freightPct: number, hsn: string, rates: DutyRate[]) {
  return landedCost({ unitPrice: unitInr, currency: "INR", qty, originCountry: country, hsn, rates, freightPct, fallback: FALLBACK_DUTY }).netPerUnit;
}

type VendorRow = { id: string; code: string; name: string; country: string | null; freightPct: unknown; supplies: string[]; capabilities: unknown };

/** Every PCB fab on file for this board: fit, lead and the landed price per quantity (their typed-in quote, else the estimate). */
function fabOptionsFor(facts: PcbFacts, quantities: number[], refQty: number, production: boolean, boardChoice: BoardChoice, vendors: VendorRow[], dutyRates: DutyRate[]): FabOption[] {
  const tech = classifyPcb({ layers: facts.layers, thicknessMm: facts.thicknessMm, copperOz: facts.copperOz, material: facts.material, finish: facts.finish });
  const fabRows = vendors.filter((v) => v.supplies.includes("pcb-fab") && v.capabilities);
  const fits = matchFabs(
    { layers: facts.layers, thicknessMm: facts.thicknessMm, finish: facts.finish, ipcClass: facts.ipcClass ?? 2, production },
    fabRows.map((v) => ({ id: v.id, code: v.code, name: v.name, country: v.country, capabilities: v.capabilities as BoardCapabilities })),
  );
  return fits.map((f) => {
    const v = fabRows.find((x) => x.id === f.id)!;
    const caps = f.capabilities;
    const quoted = boardChoice.supplierId === f.id && boardChoice.quotedUnit ? { unit: boardChoice.quotedUnit, nre: boardChoice.quotedNre ?? 0, leadDays: boardChoice.quotedLeadDays ?? null } : null;
    // Special processes (HDI, flex …) are a fit only where the fab lists them.
    const needTech = pcbTechnology(tech.primary)?.needs.technology;
    const gaps = needTech && !caps.technologies?.includes(needTech) ? [...f.gaps, `no ${pcbTechnology(tech.primary)?.name ?? needTech}`] : f.gaps;
    const prices = quantities.map((q) => {
      if (quoted) return { qty: q, unit: quoted.unit, nre: quoted.nre };
      const e = estimatePcb(facts, q, caps.pricing ?? { factor: 1 });
      return { qty: q, unit: Math.round(landed(e.unit, q, v.country, Number(v.freightPct), PCB_COST.hsn, dutyRates) * 100) / 100, nre: e.tooling };
    });
    return {
      id: f.id,
      name: f.name,
      country: f.country,
      online: !!caps.online,
      fits: gaps.length === 0,
      gaps,
      leadDays: quoted?.leadDays ?? f.leadDays,
      certifications: caps.certifications,
      prices,
      quoted,
      minLot: estimatePcb(facts, refQty, caps.pricing ?? { factor: 1 }).minLot,
    };
  });
}

/** Bare-board prices for a board that has no BoM yet (a Gerber quick look). */
export async function boardPricesFor(facts: PcbFacts, quantities: number[]) {
  await ensureFx();
  const [vendors, dutyRates] = await Promise.all([db.supplier.findMany({ where: { active: true, supplies: { has: "pcb-fab" } }, orderBy: { name: "asc" } }), loadDutyRates(db)]);
  return fabOptionsFor(facts, quantities, quantities[0], false, {}, vendors, dutyRates);
}

export const getBuild = cache(async (revisionId: string) => {
  // Live exchange rates before any price is converted (a fresh server starts on the offline table).
  await ensureFx();
  const draft = await loadDraft(revisionId);
  const rev = await db.bomRevision.findUnique({ where: { id: revisionId }, select: { buildQty: true, bom: { select: { project: { select: { boardSpec: true, stage: true } } } } } });
  if (!rev) return null;
  const rates = readRates(draft?.rates, DEFAULT_RATES);
  const quantities = draft?.quantities.length ? [...draft.quantities].sort((a, b) => a - b) : defaultQuantities(rev.buildQty);
  const refQty = quantities.includes(rev.buildQty) ? rev.buildQty : quantities[0];
  const pins = readPins(draft?.lines);
  // The whole-BoM sourcing choice sits beside the per-line pins (src/lib/costing/strategy.ts).
  const strategyRaw = (draft?.lines as Record<string, unknown> | null | undefined)?.[STRATEGY_FIELD];
  const strategy: OrderKey = isStrategy(strategyRaw) ? strategyRaw : "order";
  const boardChoice = readBoardChoice(draft?.board);
  const spec = (rev.bom.project.boardSpec ?? {}) as { copperOz?: number; material?: string; enclosure?: string; ipcClass?: 2 | 3 };

  const [vendors, dutyRates, smtLines, enclosureParts] = await Promise.all([
    db.supplier.findMany({ where: { active: true, OR: [{ supplies: { has: "pcb-fab" } }, { supplies: { has: "enclosure" } }] }, orderBy: { name: "asc" } }),
    loadDutyRates(db),
    db.line.findMany({ where: { active: true }, select: { code: true, capacityCph: true } }),
    db.part.findMany({
      where: { mpnNormalised: { in: Object.keys(ENCLOSURES).map(normaliseMpn) }, category: { slug: "enclosure" } },
      include: {
        inventoryLots: true,
        offers: { include: { supplier: true } },
        excessListings: { include: { supplier: true } },
        parameters: { where: { parameter: { key: "ip_rating" } }, select: { valueText: true } },
      },
    }),
  ]);

  // The box this quote puts the product in: the chosen one, else the project's spec enclosure.
  const boxChoice: BoxChoice | null = readBoxChoice(draft?.box) ?? (spec.enclosure && ENCLOSURES[spec.enclosure] ? { kind: "catalogue", mpn: spec.enclosure } : null);
  const makers = vendors.filter((v) => v.supplies.includes("enclosure") && v.capabilities);
  // A made-to-fit box needs the board's size and parts first; a first pass without a box gives them.
  const first = await viewerDataWithAnalysis(revisionId, "INR", { enclosure: boxChoice?.kind === "catalogue" ? ENCLOSURES[boxChoice.mpn] : null });
  if (!first) return null;
  const tallestTop = Math.max(0, ...first.data.parts.filter((p) => p.side === "TOP").map((p) => p.body.height));
  const boardSize = { w: first.data.board.width, h: first.data.board.height, thickness: first.data.board.thickness };
  const customSpec = (style: MakerStyle) => customBoxSpec(style, boardSize, tallestTop);
  const chosenEnclosure: EnclosureSpec | null =
    boxChoice?.kind === "catalogue" ? ENCLOSURES[boxChoice.mpn] : boxChoice?.kind === "custom" ? customSpec(boxChoice.style) : null;
  const viewer = boxChoice?.kind === "custom" ? await viewerDataWithAnalysis(revisionId, "INR", { enclosure: chosenEnclosure }) : first;
  if (!viewer) return null;
  const { data, analysis, riskByLine } = viewer;

  const at = await analyseRevisionAt(db, revisionId, "INR", quantities, pins, undefined, strategy === "order" ? undefined : strategy);
  if (!at) return null;

  // ── Step 1: the bare board
  const facts: PcbFacts & { mask: string; silk: string; source: "gerber" | "spec" } = {
    widthMm: data.board.width,
    heightMm: data.board.height,
    layers: data.board.layerCount,
    thicknessMm: data.board.thickness,
    finish: data.board.finish,
    copperOz: spec.copperOz ?? 1,
    material: spec.material ?? null,
    ipcClass: spec.ipcClass ?? 2,
    mask: data.board.maskColor,
    silk: data.board.silkColor,
    source: data.board.source,
  };
  const tech = classifyPcb({ layers: facts.layers, thicknessMm: facts.thicknessMm, copperOz: facts.copperOz, material: facts.material, finish: facts.finish });
  const production = rev.bom.project.stage === "PRODUCTION";
  const fabOptions = fabOptionsFor(facts, quantities, refQty, production, boardChoice, vendors, dutyRates);
  const bareLines = analysis.lines.filter(isBareBoard);
  const bareStock = bareLines
    .filter((l) => l.part)
    .map((l) => ({ partId: l.part!.id, mpn: l.part!.mpn, qty: l.internalQty, unit: l.allocations.find((a) => a.tier <= 2)?.unit ?? null }))
    .find((s) => s.qty > 0) ?? null;
  const lotCost = (o: FabOption, q: number) => {
    const p = o.prices.find((x) => x.qty === q)!;
    return (p.unit ?? Infinity) * q + p.nre;
  };
  const cheapest = [...fabOptions].filter((o) => o.fits).sort((a, b) => lotCost(a, refQty) - lotCost(b, refQty))[0] ?? [...fabOptions].sort((a, b) => lotCost(a, refQty) - lotCost(b, refQty))[0] ?? null;
  const chosenFab = fabOptions.find((o) => o.id === boardChoice.supplierId) ?? null;
  const useStock = !!boardChoice.stockPartId && bareStock?.partId === boardChoice.stockPartId;
  const boardFab = chosenFab ?? cheapest;
  const boardAt = (q: number): { unit: number; nre: number } | null => {
    const fab = boardFab?.prices.find((x) => x.qty === q) ?? null;
    if (useStock && bareStock) {
      const take = Math.min(bareStock.qty, q);
      const stockUnit = bareStock.unit ?? fab?.unit ?? 0;
      const rest = q - take;
      return { unit: (take * stockUnit + rest * (fab?.unit ?? stockUnit)) / q, nre: rest > 0 ? (fab?.nre ?? 0) : 0 };
    }
    return fab?.unit === null || !fab ? null : { unit: fab.unit, nre: fab.nre };
  };
  const board = {
    facts,
    areaCm2: (facts.widthMm * facts.heightMm) / 100,
    technology: { slug: tech.primary, name: pcbTechnology(tech.primary)?.name ?? tech.primary, also: tech.also.map((x) => pcbTechnology(x)?.name ?? x) },
    fabs: fabOptions.filter((o) => !o.online),
    online: fabOptions.filter((o) => o.online),
    stock: bareStock,
    chosen: useStock ? { kind: "stock" as const, id: bareStock!.partId, auto: false } : boardFab ? { kind: "fab" as const, id: boardFab.id, auto: !chosenFab } : null,
    chosenName: useStock ? `Our stock (${bareStock!.mpn})` : (boardFab?.name ?? null),
    leadDays: useStock ? 0 : (boardFab?.leadDays ?? null),
  };

  // ── Step 2: the components, at the reference quantity
  const kitLines: KitLine[] = analysis.lines.map((l) => ({
    refDes: l.refDes ?? "",
    mpn: l.part?.mpn ?? l.rawMpn ?? "",
    partId: l.part?.id ?? null,
    description: [l.part?.description, l.rawDescription].filter(Boolean).join(" · "),
    category: l.part?.category.slug ?? null,
    qty: l.qtyPerBoard,
  }));
  const costIn = (l: AnalysedLine) => ({
    id: l.id,
    dnp: l.dnp,
    matched: !!l.part,
    excluded: isEnclosure(l) || isBareBoard(l),
    required: l.required,
    shortfall: l.shortfall,
    allocations: l.allocations,
    // No authorised offer at all: a shortfall is priced at the dearest source this line already buys from.
    marketUnit: l.bestAuthorised?.landedUnit ?? l.bestAuthorised?.unit ?? (Math.max(0, ...l.allocations.filter((a) => a.tier >= 3).map((a) => a.landedUnit ?? a.unit ?? 0)) || null),
  });
  const costsByQty = new Map(quantities.map((q) => [q, componentsCost(at.byQty.get(q)!.map(costIn), q)]));
  const refLines = at.byQty.get(refQty)!;
  const refCosts = costsByQty.get(refQty)!;
  const lines: LineRow[] = refLines.map((l) => {
    const p = l.part;
    const c = refCosts.byLine.get(l.id)!;
    const main = [...l.allocations].sort((a, b) => b.qty - a.qty)[0];
    const missing = p
      ? [
          !p.datasheetUrl && "datasheet",
          !p.imageUrl && "photo",
          p.rohs === "UNKNOWN" && "RoHS",
          p.reach === "UNKNOWN" && "REACH",
          !p.msl && p.mountType === "SMD" && "MSL",
          !p.hsnCode && "HSN",
          !l.authorisedSources && "distributor offer",
        ].filter((x): x is string => !!x)
      : [];
    const risk = riskByLine.get(l.id);
    return {
      id: l.id,
      lineNo: l.lineNo,
      refDes: l.refDes ?? "",
      partId: p?.id ?? null,
      mpn: p?.mpn ?? l.rawMpn ?? null,
      manufacturer: p?.manufacturer.name ?? l.rawManufacturer ?? null,
      description: p?.description ?? l.rawDescription ?? l.rawValue ?? null,
      footprint: l.rawPackage ?? null,
      category: p?.category.name ?? null,
      qtyPerBoard: l.qtyPerBoard,
      dnp: l.dnp,
      excluded: isEnclosure(l) ? "box" : isBareBoard(l) ? "board" : null,
      required: l.required,
      cost: c,
      perBoard: c.cost / refQty,
      sourceLabel: main ? (main.tier <= 2 ? TIER_LABEL[main.tier] : main.source) : l.shortfall > 0 && l.bestAuthorised ? `${l.bestAuthorised.supplier} (on order)` : null,
      pinned: pins.has(l.id),
      pin: pins.get(l.id) ?? null,
      plan: l.allocations.map((a) => ({ tier: a.tier, kind: a.kind, source: a.source, qty: a.qty, orderQty: a.orderQty, unit: a.tier <= 2 ? a.unit : (a.landedUnit ?? a.unit), offerId: a.offerId, excessListingId: a.excessListingId })),
      leadWeeks: lineLead(l),
      risk: risk ? { score: risk.score, level: risk.level, summary: risk.summary } : null,
      riskFactors: risk?.factors ?? [],
      missing,
      stock: { ours: l.internalQty, partners: l.partnerQty, distributors: l.authorisedStock, market: l.excessQty + l.brokerStock },
    };
  });

  // The ways to source the same lines, side by side, and what the quote uses now.
  const sourced = refLines.filter((l) => !l.dnp && l.part && !isEnclosure(l) && !isBareBoard(l));
  const mainOf = (l: AnalysedLine) => [...l.allocations].sort((a, b) => b.qty - a.qty)[0] ?? null;
  const sourcing = {
    qty: refQty,
    lines: sourced.length,
    /** The strategy the quote is on, and lines given a source by hand on top of it. */
    active: strategy,
    pinned: sourced.filter((l) => pins.has(l.id)).length,
    /** What the quote really costs for components now, per board. */
    perBoardNow: sourced.reduce((s, l) => s + (refCosts.byLine.get(l.id)?.cost ?? 0), 0) / refQty,
    strategies: compareStrategies(
      sourced.map((l) => ({ id: l.id, label: `${l.refDes?.split(/[,\s]+/)[0] || `line ${l.lineNo}`} ${l.part!.mpn}`, required: l.required, candidates: l.candidates, current: mainOf(l) })),
      refQty,
    ),
  };

  // ── Step 3: boxes
  const encPartByMpn = new Map(enclosureParts.map((p) => [p.mpnNormalised, p]));
  const boxPricesFor = (mpn: string, q: number): number | null => {
    const part = encPartByMpn.get(normaliseMpn(mpn));
    if (!part) return null;
    const free = part.inventoryLots.filter((l) => !l.isConsigned).reduce((s, l) => s + Math.max(0, l.qty - l.reservedQty), 0);
    const lot = part.inventoryLots.find((l) => l.unitCost);
    const ownUnit = lot?.unitCost ? convert(Number(lot.unitCost), lot.currency, "INR") : null;
    const offerUnit = (n: number) => {
      const best = part.offers
        .filter((o) => (["AUTHORISED", "MANUFACTURER"] as SupplierKind[]).includes(o.supplier.kind))
        .map((o) => {
          const native = priceAtQty(readBreaks(o.priceBreaks), Math.max(n, o.moq));
          return native === null ? null : { o, unit: landedCost({ unitPrice: native, currency: o.currency, qty: Math.max(n, o.moq), originCountry: o.supplier.country, hsn: part.hsnCode, rates: dutyRates, freightPct: Number(o.supplier.freightPct), fallback: FALLBACK_DUTY }).netPerUnit };
        })
        .filter((x): x is { o: (typeof part.offers)[number]; unit: number } => !!x)
        .sort((a, b) => Number(b.o.stock >= n) - Number(a.o.stock >= n) || a.unit - b.unit)[0];
      if (best) return best.unit;
      const ex = part.excessListings.filter((e) => e.askPrice).map((e) => convert(Number(e.askPrice), e.currency, "INR")).sort((a, b) => a - b)[0];
      return ex ?? null;
    };
    const take = Math.min(free, q);
    const rest = q - take;
    const restUnit = rest > 0 ? offerUnit(rest) : 0;
    const own = ownUnit ?? (take > 0 ? offerUnit(take) : 0);
    if (restUnit === null || own === null) return null;
    return Math.round(((take * own + rest * restUnit) / q) * 100) / 100;
  };
  const fitOf = (enc: EnclosureSpec) => {
    const a = analyseBox(enc, boardSize, data.parts, kitLines);
    return { ok: a.fit.ok && boardFits(enc, boardSize.w, boardSize.h).fits, text: boxVerdict(enc, a).text, cutouts: a.cutouts.length };
  };
  const catalogue: BoxOption[] = Object.values(ENCLOSURES).map((enc) => {
    const part = encPartByMpn.get(normaliseMpn(enc.mpn)) ?? null;
    const fit = fitOf(enc);
    const ip = part?.parameters[0]?.valueText ?? null;
    const authorised = part?.offers.filter((o) => (["AUTHORISED", "MANUFACTURER"] as SupplierKind[]).includes(o.supplier.kind)) ?? [];
    const m = machiningCost(fit.cutouts);
    return {
      key: `catalogue:${enc.mpn}`,
      kind: "catalogue",
      spec: enc,
      type: classifyBox(enc.style, ip),
      ipRating: ip,
      fits: fit.ok,
      fitText: fit.text,
      cutouts: fit.cutouts,
      leadDays: part && part.inventoryLots.some((l) => l.qty - l.reservedQty > 0) ? 0 : authorised.some((o) => o.stock > 0) ? 7 : (makers.find((x) => x.code === "BOX-HAMMOND")?.capabilities as BoxCapabilities | null)?.leadDays ?? 21,
      prices: quantities.map((q) => {
        const u = boxPricesFor(enc.mpn, q);
        return { qty: q, unit: u === null ? null : u + m.perUnit, nre: m.nre };
      }),
      partId: part?.id ?? null,
      tiers: part
        ? {
            ours: part.inventoryLots.filter((l) => !l.isConsigned).reduce((s, l) => s + Math.max(0, l.qty - l.reservedQty), 0),
            oursUnit: (() => {
              const lot = part.inventoryLots.find((l) => l.unitCost);
              return lot?.unitCost ? convert(Number(lot.unitCost), lot.currency, "INR") : null;
            })(),
            partners: part.excessListings.filter((e) => e.supplier.kind === "CHANNEL_PARTNER").reduce((s, e) => s + e.qty, 0),
            distributors: authorised.reduce((s, o) => s + o.stock, 0),
            distributorUnit: (() => {
              const u = authorised.map((o) => priceAtQty(readBreaks(o.priceBreaks), Math.max(refQty, o.moq))).map((n, i) => (n === null ? null : convert(n, authorised[i].currency, "INR"))).filter((x): x is number => x !== null);
              return u.length ? Math.min(...u) : null;
            })(),
            market: part.excessListings.filter((e) => e.supplier.kind !== "CHANNEL_PARTNER").reduce((s, e) => s + e.qty, 0) + part.offers.filter((o) => o.supplier.kind === "BROKER").reduce((s, o) => s + o.stock, 0),
            marketUnit: (() => {
              const u = part.excessListings.filter((e) => e.askPrice).map((e) => convert(Number(e.askPrice), e.currency, "INR"));
              return u.length ? Math.min(...u) : null;
            })(),
            mock: part.offers.some((o) => o.source === "mock"),
          }
        : null,
      maker: null,
    } satisfies BoxOption;
  });
  const custom: BoxOption[] = makers.flatMap((v) => {
    const caps = v.capabilities as unknown as BoxCapabilities;
    return (caps.custom ?? []).map((style) => {
      const enc = customSpec(style);
      const fit = fitOf(enc);
      const m = machiningCost(fit.cutouts);
      const ip = caps.ipMax;
      return {
        key: `custom:${v.id}:${style}`,
        kind: "custom" as const,
        spec: enc,
        type: style === "sheet-metal" ? "sheet-metal" : classifyBox(style, null),
        ipRating: ip,
        fits: fit.ok,
        fitText: fit.text,
        cutouts: fit.cutouts,
        leadDays: caps.leadDays + (style === "moulded" || style === "diecast" ? 35 : 0),
        prices: quantities.map((q) => {
          const e = estimateCustomBox(style, enc, q, caps.pricing?.factor ?? 1);
          return { qty: q, unit: Math.round((landed(e.unit, q, v.country, Number(v.freightPct), BOX_COST.hsn, dutyRates) + m.perUnit) * 100) / 100, nre: e.nre + m.nre };
        }),
        partId: null,
        tiers: null,
        maker: { id: v.id, name: v.name, country: v.country },
      } satisfies BoxOption;
    });
  });
  const chosenBox: BoxOption | null =
    boxChoice?.kind === "catalogue" ? (catalogue.find((o) => o.spec.mpn === boxChoice.mpn) ?? null) : boxChoice?.kind === "custom" ? (custom.find((o) => o.key === `custom:${boxChoice.supplierId}:${boxChoice.style}`) ?? null) : null;
  const recognisedBox = data.enclosure ? classifyBox(data.enclosure.style, data.enclosure.ipRating) : null;
  const box = {
    choice: boxChoice,
    auto: !readBoxChoice(draft?.box),
    chosen: chosenBox,
    recognisedType: recognisedBox,
    types: BOX_TYPES,
    catalogue,
    custom,
    kit: data.box?.kit ?? [],
  };

  // ── Step 4: process cost and the quote per quantity
  // Paste per side goes on the printing steps, so the quote carries it.
  const assembly = asmParts(data.parts, data.route);
  const paste = estimatePaste(assembly.parts, data.board.fab ?? null, undefined, assembly.dnp);
  const process: { steps: ProcessCost[]; nre: NreItem[] } = processCosts(
    data.route.map((s) => ({ key: s.key, stage: s.stage, title: s.title, side: s.side, refs: s.refs.length, line: s.where?.line ?? null, pasteGrams: s.key.startsWith("print-") ? paste.sides.find((p) => p.side === s.side)?.grams : undefined })),
    smtLines,
    rates,
  );
  const quotes: QtyQuote[] = quantities.map((q) => {
    const c = costsByQty.get(q)!;
    const b = chosenBox?.prices.find((x) => x.qty === q);
    return quoteForQty(
      {
        qty: q,
        board: boardAt(q),
        components: { perBoard: c.perBoard, moqExcess: c.moqExcess, unpriced: c.unpriced },
        box: chosenBox && b ? { unit: b.unit ?? 0, nre: chosenBox.kind === "custom" ? b.nre - machiningCost(chosenBox.cutouts).nre : 0, machiningPerUnit: 0, machiningNre: machiningCost(chosenBox.cutouts).nre } : null,
      },
      process,
      rates,
    );
  });
  // Delivery: the longest of bare board, box and parts on order, plus a week on our lines. A part short everywhere waits
  // for the factory; one in stock at a distributor or partner ships in its own lead.
  const partLeads = refLines
    .filter((l) => !l.dnp && l.part && !isEnclosure(l) && !isBareBoard(l))
    .map((l) => {
      const short = l.shortfall > 0;
      // Distributor stock ships in about a week whatever its factory lead; partners and excess quote their own days.
      const bought = l.allocations.filter((a) => a.tier >= 3);
      const days = short ? (l.factoryLeadWeeks ?? l.part!.mfrLeadTimeWeeks ?? 12) * 7 : bought.length ? Math.max(7, ...bought.map((a) => (a.offerId ? 1 : (a.leadWeeks ?? 1)) * 7)) : 0;
      return { days, label: `${l.refDes?.split(/[,\s]+/)[0] || `line ${l.lineNo}`} ${l.part!.mpn} — ${short ? `${l.shortfall.toLocaleString("en-IN")} pcs from the factory, ${Math.round(days / 7)} wk` : `${Math.round(days / 7)} wk`}` };
    })
    .sort((a, b) => b.days - a.days);
  const leads = [
    { days: board.leadDays ?? 0, label: `bare board from ${board.chosenName ?? "the fab"} — ${board.leadDays ?? 0} d` },
    { days: chosenBox?.leadDays ?? 0, label: `box ${chosenBox?.spec.mpn ?? ""} — ${chosenBox?.leadDays ?? 0} d` },
    ...(partLeads[0] ? [partLeads[0]] : []),
  ].sort((a, b) => b.days - a.days);
  const leadDays = (leads[0]?.days ?? 0) + 7;
  const leadDriver = leads[0]?.days ? leads[0].label : null;
  const largest = quantities[quantities.length - 1];
  const shortAtLargest = at.byQty.get(largest)!.filter((l) => !l.dnp && l.part && l.shortfall > 0 && !isEnclosure(l) && !isBareBoard(l)).length;

  const unpriced = Math.max(0, ...quotes.map((q) => q.unpriced));
  const warnings = [
    ...(unpriced ? [`${unpriced} line${unpriced === 1 ? " has" : "s have"} no price yet — match ${unpriced === 1 ? "it" : "them"} or search the distributors.`] : []),
    ...(shortAtLargest ? [`At ${largest.toLocaleString("en-IN")} pcs, ${shortAtLargest} line${shortAtLargest === 1 ? " is" : "s are"} short at every source — priced at the best known price; the factory lead sets delivery.`] : []),
    ...(!board.chosen ? ["No PCB fabricator on file — add one, or type in a fab's quote."] : []),
    ...(chosenBox && chosenBox.prices.some((p) => p.unit === null) ? [`${chosenBox.spec.mpn} has no price yet — refresh its offers or choose another box.`] : []),
    ...(chosenBox && !chosenBox.fits ? [`${chosenBox.spec.label}: ${chosenBox.fitText}`] : []),
  ];

  return {
    revisionId,
    title: data.title,
    product: data.product,
    stage: rev.bom.project.stage,
    buildQty: rev.buildQty,
    draft: draft ? { id: draft.id, currency: (isCurrency(draft.currency) ? draft.currency : "INR") as Currency, validDays: draft.validDays, notes: draft.notes } : null,
    quantities,
    refQty,
    rates,
    viewer: data as ViewerData,
    board,
    boardAt,
    lines,
    sourcing,
    box,
    process,
    assembly,
    paste,
    quotes,
    leadDays,
    leadDriver,
    warnings,
    fx: getActiveFx(),
  };
});

export type Build = NonNullable<Awaited<ReturnType<typeof getBuild>>>;
