"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CURRENCIES } from "@/lib/currency";
import { BOX_COST, DEFAULT_RATES, type Rates } from "@/data/costing";
import { ENCLOSURES } from "@/lib/board/enclosures";
import { parseQuantities, readRates } from "@/lib/costing/quote";
import { scoreRevision, type LinePin } from "@/server/bom-pipeline";
import { STRATEGY, type OrderKey } from "@/lib/costing/strategy";
import { expandRefDes } from "@/lib/refdes";
import { STRATEGY_FIELD, ensureDraft, getBuild, type BoardChoice, type BoxChoice } from "@/server/build";
import { importMarketResult } from "@/server/sourcing/market";

export type BuildResult = { error?: string; message?: string } | undefined;

const json = (v: unknown) => v as Prisma.InputJsonValue;
const done = (revisionId: string, message?: string): BuildResult => {
  revalidatePath(`/boms/${revisionId}`, "layout");
  return message ? { message } : undefined;
};

export async function chooseBoard(revisionId: string, choice: { supplierId?: string; stockPartId?: string } | null): Promise<BuildResult> {
  const user = await requireUser("bom.write");
  const draft = await ensureDraft(revisionId, user.id);
  const prev = (draft.board ?? {}) as BoardChoice;
  let next: BoardChoice = {};
  if (choice?.supplierId) {
    const fab = await db.supplier.findUnique({ where: { id: choice.supplierId }, select: { supplies: true, name: true } });
    if (!fab?.supplies.includes("pcb-fab")) return { error: "That supplier doesn't make bare boards." };
    // A typed-in quote belongs to its fab; keep it only when the fab stays the same.
    next = prev.supplierId === choice.supplierId ? prev : { supplierId: choice.supplierId };
  } else if (choice?.stockPartId) {
    if (!(await db.part.findUnique({ where: { id: choice.stockPartId }, select: { id: true } }))) return { error: "Part not found." };
    next = { stockPartId: choice.stockPartId };
  }
  await db.customerQuote.update({ where: { id: draft.id }, data: { board: json(next) } });
  return done(revisionId, choice ? "Board source chosen" : "Back to the cheapest fab that fits");
}

export async function saveFabQuote(revisionId: string, supplierId: string, q: { unit: number; nre: number; leadDays: number | null } | null): Promise<BuildResult> {
  const user = await requireUser("bom.write");
  if (q && (!(q.unit > 0) || q.unit > 1_000_000 || !(q.nre >= 0) || (q.leadDays !== null && !(q.leadDays >= 0 && q.leadDays <= 365)))) return { error: "Enter a unit price above 0, NRE of 0 or more and a lead time in days." };
  const fab = await db.supplier.findUnique({ where: { id: supplierId }, select: { supplies: true } });
  if (!fab?.supplies.includes("pcb-fab")) return { error: "That supplier doesn't make bare boards." };
  const draft = await ensureDraft(revisionId, user.id);
  const board: BoardChoice = q ? { supplierId, quotedUnit: q.unit, quotedNre: q.nre, quotedLeadDays: q.leadDays ?? undefined } : { supplierId };
  await db.customerQuote.update({ where: { id: draft.id }, data: { board: json(board) } });
  return done(revisionId, q ? "Fab quote saved — it replaces the estimate" : "Back to the estimate");
}

/**
 * Takes a part for a line that has none (or another): for all its places, or only for the designators given — the line
 * is then split, the chosen places becoming a new line with the part and the rest staying to be chosen.
 */
export async function choosePart(revisionId: string, lineId: string, partId: string, refs: string[] | null): Promise<BuildResult & { lineId?: string }> {
  const user = await requireUser("bom.write");
  const line = await db.bomLine.findUnique({ where: { id: lineId } });
  if (!line || line.revisionId !== revisionId) return { error: "Line not found." };
  const part = await db.part.findUnique({ where: { id: partId }, select: { id: true, mpn: true } });
  if (!part) return { error: "Part not found." };
  const all = expandRefDes(line.refDes);
  const pick = refs?.length ? [...new Set(refs)] : all;
  if (refs?.length && !pick.every((r) => all.includes(r))) return { error: "Those designators aren't on this line." };
  const reason = `Chosen in Build & quote by ${user.name ?? user.email}`;
  let target = lineId;
  if (all.length && pick.length < all.length) {
    const rest = all.filter((r) => !pick.includes(r));
    const last = await db.bomLine.aggregate({ where: { revisionId }, _max: { lineNo: true } });
    target = await db.$transaction(async (tx) => {
      const created = await tx.bomLine.create({
        data: {
          revisionId,
          lineNo: (last._max.lineNo ?? 0) + 1,
          rawMpn: line.rawMpn,
          rawManufacturer: line.rawManufacturer,
          rawDescription: line.rawDescription,
          rawPackage: line.rawPackage,
          rawValue: line.rawValue,
          rawRow: line.rawRow ?? Prisma.DbNull,
          refDes: pick.join(", "),
          qtyPerBoard: pick.length,
          dnp: line.dnp,
          customerPartNumber: line.customerPartNumber,
          issues: line.issues,
          partId: part.id,
          needsReview: false,
        },
      });
      await tx.bomLineMatch.create({ data: { bomLineId: created.id, partId: part.id, method: "MANUAL", confidence: 100, reason, selected: true } });
      await tx.bomLine.update({ where: { id: lineId }, data: { refDes: rest.join(", "), qtyPerBoard: rest.length } });
      await tx.placement.updateMany({ where: { revisionId, refDes: { in: pick } }, data: { bomLineId: created.id } });
      return created.id;
    });
  } else {
    await db.$transaction([
      db.bomLineMatch.upsert({
        where: { bomLineId_partId: { bomLineId: lineId, partId: part.id } },
        create: { bomLineId: lineId, partId: part.id, method: "MANUAL", confidence: 100, reason },
        update: { method: "MANUAL", confidence: 100, reason },
      }),
      db.bomLineMatch.updateMany({ where: { bomLineId: lineId }, data: { selected: false } }),
      db.bomLineMatch.updateMany({ where: { bomLineId: lineId, partId: part.id }, data: { selected: true } }),
      db.bomLine.update({ where: { id: lineId }, data: { partId: part.id, needsReview: false } }),
    ]);
  }
  await scoreRevision(db, revisionId);
  await db.auditLog.create({ data: { userId: user.id, action: "bom.choosePart", entity: "BomLine", entityId: target, data: { from: lineId, partId: part.id, refs: pick } } });
  revalidatePath(`/boms/${revisionId}`);
  const split = target !== lineId;
  return { ...done(revisionId, split ? `${part.mpn} on ${pick.length} of ${all.length} places — a new line` : `${part.mpn} chosen for line ${line.lineNo}`), lineId: target };
}

/** Takes a part found at the distributors for a line: it is added to our catalogue with its offers, then chosen. */
export async function chooseMarketPart(revisionId: string, lineId: string, query: string, key: string, refs: string[] | null): Promise<BuildResult & { lineId?: string }> {
  const user = await requireUser("bom.write");
  const line = await db.bomLine.findUnique({ where: { id: lineId }, select: { revisionId: true } });
  if (!line || line.revisionId !== revisionId) return { error: "Line not found." };
  const res = await importMarketResult(query, key, user.id);
  if ("error" in res) return res;
  return choosePart(revisionId, lineId, res.partId, refs);
}

export async function pinLine(revisionId: string, lineId: string, pin: LinePin | null): Promise<BuildResult> {
  const user = await requireUser("bom.write");
  const line = await db.bomLine.findUnique({ where: { id: lineId }, select: { revisionId: true, partId: true } });
  if (!line || line.revisionId !== revisionId) return { error: "Line not found." };
  if (pin?.offerId) {
    const o = await db.offer.findUnique({ where: { id: pin.offerId }, select: { partId: true, stock: true } });
    if (!o || o.partId !== line.partId) return { error: "That offer is for another part." };
    if (o.stock <= 0) return { error: "That offer has no stock." };
  }
  if (pin?.excessListingId) {
    const e = await db.excessListing.findUnique({ where: { id: pin.excessListingId }, select: { partId: true } });
    if (!e || e.partId !== line.partId) return { error: "That listing is for another part." };
  }
  const draft = await ensureDraft(revisionId, user.id);
  const lines = { ...((draft.lines ?? {}) as Record<string, LinePin>) };
  if (pin && (pin.offerId || pin.excessListingId || pin.ours)) lines[lineId] = pin.offerId ? { offerId: pin.offerId } : pin.excessListingId ? { excessListingId: pin.excessListingId } : { ours: true };
  else delete lines[lineId];
  await db.customerQuote.update({ where: { id: draft.id }, data: { lines: json(lines) } });
  return done(revisionId, pin ? "Source chosen for this line" : "Back to the sourcing order");
}

/**
 * Sources every line the same way: by lowest price, shortest lead time or lowest risk — or back to the plant's own
 * order. The picks are worked out again here from live stock and prices; what the page showed is not trusted.
 */
export async function applyStrategy(revisionId: string, key: OrderKey): Promise<BuildResult> {
  const user = await requireUser("bom.write");
  if (!(key in STRATEGY)) return { error: "Unknown sourcing choice." };
  const rev = await db.bomRevision.findUnique({ where: { id: revisionId }, select: { id: true } });
  if (!rev) return { error: "BoM revision not found." };
  const draft = await ensureDraft(revisionId, user.id);
  // Choosing for the whole BoM starts clean: sources chosen by hand on single lines are dropped.
  await db.customerQuote.update({ where: { id: draft.id }, data: { lines: json(key === "order" ? {} : { [STRATEGY_FIELD]: key }) } });
  await db.auditLog.create({ data: { userId: user.id, action: "quote.sourcing", entity: "CustomerQuote", entityId: draft.id, data: json({ strategy: key }) } }).catch(() => undefined);
  return done(revisionId, key === "order" ? "Back to our sourcing order on every line" : `Components now sourced by ${STRATEGY[key].label.toLowerCase()}`);
}

export async function chooseBox(revisionId: string, choice: BoxChoice | null): Promise<BuildResult> {
  const user = await requireUser("bom.write");
  if (choice?.kind === "catalogue" && !ENCLOSURES[choice.mpn]) return { error: "Unknown enclosure." };
  if (choice?.kind === "custom") {
    const maker = await db.supplier.findUnique({ where: { id: choice.supplierId }, select: { supplies: true } });
    if (!maker?.supplies.includes("enclosure") || !(choice.style in BOX_COST.unit)) return { error: "That maker doesn't make this box." };
  }
  const draft = await ensureDraft(revisionId, user.id);
  await db.customerQuote.update({ where: { id: draft.id }, data: { box: choice ? json(choice) : Prisma.DbNull } });
  return done(revisionId, choice?.kind === "none" ? "Board only — no box" : choice ? "Box chosen" : "Back to the project's box");
}

export async function saveQuantities(revisionId: string, text: string): Promise<BuildResult> {
  const user = await requireUser("bom.write");
  const quantities = parseQuantities(text);
  if (!quantities.length) return { error: "Enter one to four quantities, e.g. 100, 500, 1k." };
  const draft = await ensureDraft(revisionId, user.id);
  await db.customerQuote.update({ where: { id: draft.id }, data: { quantities } });
  return done(revisionId, `Quoting ${quantities.map((q) => q.toLocaleString("en-IN")).join(" · ")}`);
}

export async function saveRates(revisionId: string, rates: Partial<Rates> | null): Promise<BuildResult> {
  const user = await requireUser("bom.write");
  const draft = await ensureDraft(revisionId, user.id);
  const next = rates ? readRates({ ...readRates(draft.rates, DEFAULT_RATES), ...rates }, DEFAULT_RATES) : null;
  await db.customerQuote.update({ where: { id: draft.id }, data: { rates: next ? json(next) : Prisma.DbNull } });
  return done(revisionId, rates ? "Rates saved for this quote" : "Rates back to the plant defaults");
}

export async function saveQuoteTerms(revisionId: string, terms: { currency: string; validDays: number; notes: string }): Promise<BuildResult> {
  const user = await requireUser("bom.write");
  if (!(CURRENCIES as readonly string[]).includes(terms.currency)) return { error: "Pick INR, USD or EUR." };
  if (!Number.isInteger(terms.validDays) || terms.validDays < 1 || terms.validDays > 365) return { error: "Validity is 1–365 days." };
  const draft = await ensureDraft(revisionId, user.id);
  await db.customerQuote.update({ where: { id: draft.id }, data: { currency: terms.currency, validDays: terms.validDays, notes: terms.notes.trim().slice(0, 2000) || null } });
  return done(revisionId, "Terms saved");
}

/** Freezes the quote as costed now, numbers it, and opens a new draft with the same choices for the next revision. */
export async function issueQuote(revisionId: string): Promise<BuildResult & { quoteId?: string }> {
  const user = await requireUser("sourcing.buy");
  const draft = await ensureDraft(revisionId, user.id);
  const b = await getBuild(revisionId);
  if (!b) return { error: "BoM revision not found." };
  if (b.quotes.some((q) => q.unpriced > 0)) return { error: "Some lines have no price yet — price or remove them before issuing." };
  const year = new Date().getFullYear();
  const count = await db.customerQuote.count({ where: { number: { startsWith: `CQ-${year}-` } } });
  const number = `CQ-${year}-${String(count + 1).padStart(4, "0")}`;
  const snapshot = {
    quantities: b.quantities,
    quotes: b.quotes,
    board: { name: b.board.chosenName, technology: b.board.technology.name, facts: b.board.facts, leadDays: b.board.leadDays },
    box: b.box.chosen ? { label: b.box.chosen.spec.label, mpn: b.box.chosen.spec.mpn, maker: b.box.chosen.maker?.name ?? null, ipRating: b.box.chosen.ipRating } : null,
    lines: b.lines.filter((l) => !l.dnp && !l.excluded).length,
    refQty: b.refQty,
    lineRows: b.lines.map((l) => ({ lineNo: l.lineNo, mpn: l.mpn, manufacturer: l.manufacturer, refDes: l.refDes, qtyPerBoard: l.qtyPerBoard, required: l.required, source: l.sourceLabel, unit: l.cost.unit, perBoard: l.perBoard, pinned: l.pinned, dnp: l.dnp, excluded: l.excluded })),
    process: b.process.steps.map((s) => ({ title: s.title, stage: s.stage, perBoard: s.perBoard, perLot: s.perLot, note: s.note })),
    leadDays: b.leadDays,
    rates: b.rates,
    fx: { asOf: b.fx.asOf, source: b.fx.source, USD: b.fx.rates.USD ?? null, EUR: b.fx.rates.EUR ?? null },
    product: b.product,
    title: b.title,
  };
  await db.$transaction([
    db.customerQuote.update({ where: { id: draft.id }, data: { status: "ISSUED", number, issuedAt: new Date(), snapshot: json(snapshot), quantities: b.quantities } }),
    db.customerQuote.create({
      data: {
        revisionId,
        board: draft.board === null ? undefined : json(draft.board),
        lines: draft.lines === null ? undefined : json(draft.lines),
        box: draft.box === null ? undefined : json(draft.box),
        quantities: b.quantities,
        rates: draft.rates === null ? undefined : json(draft.rates),
        currency: draft.currency,
        validDays: draft.validDays,
        notes: draft.notes,
        createdById: user.id,
      },
    }),
    db.auditLog.create({ data: { userId: user.id, action: "quote.issue", entity: "CustomerQuote", entityId: draft.id, data: { number, quantities: b.quantities } } }),
  ]);
  revalidatePath(`/boms/${revisionId}`, "layout");
  return { message: `${number} issued`, quoteId: draft.id };
}
