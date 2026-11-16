"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseBomFile, MAX_BOM_BYTES } from "@/lib/bom/parse";
import { parseQuoteSheet } from "@/lib/rfq-sheet";
import { autoMapPriceList, parsePriceList } from "@/lib/price-list";
import { normaliseMpn } from "@/lib/normalise";
import { startJob } from "@/server/jobs";
import { activeAdapters, callAdapter, pickPart } from "@/server/sourcing";
import { SupplierResolver, applyAdapterPart, applyLifecycle, upsertPartFromAdapter } from "@/server/sourcing/refresh";
import { scoreRevision } from "@/server/bom-pipeline";
import {
  addShortagesToCart,
  addToCart,
  awardBest,
  createPurchaseOrders,
  createRfqFromCart,
  quoteFromOffers,
  saveQuote,
  setAwards,
  type CartAdd,
  type QuoteLineInput,
} from "@/server/procurement";

export type Result = { error?: string; message?: string; jobId?: string | null } | undefined;

const fail = (e: unknown): Result => ({ error: e instanceof Error ? e.message : "Something went wrong." });

// ───────────────────────────── Refresh ─────────────────────────────

export async function refreshNow(scope: { partIds?: string[]; revisionId?: string; hot?: boolean; label?: string }): Promise<Result> {
  const user = await requireUser("sourcing.buy");
  try {
    if (scope.hot) return { jobId: await startJob("refresh.hot", "manual", { userId: user.id, label: scope.label ?? "Hot parts" }) };
    let partIds = scope.partIds ?? [];
    if (scope.revisionId) {
      const lines = await db.bomLine.findMany({ where: { revisionId: scope.revisionId, partId: { not: null }, dnp: false }, select: { partId: true } });
      partIds = [...new Set(lines.map((l) => l.partId!))];
    }
    if (!partIds.length) return { error: "No matched parts to refresh." };
    return { jobId: await startJob("refresh.parts", "manual", { partIds, userId: user.id, label: scope.label }) };
  } catch (e) {
    return fail(e);
  }
}

/** Looks a not-found BoM line's MPN up at the distributors; creates the part, re-matches, re-scores. */
export async function searchDistributorsForLine(lineId: string): Promise<Result> {
  await requireUser("bom.write");
  const line = await db.bomLine.findUnique({ where: { id: lineId } });
  if (!line?.rawMpn) return { error: "This line has no MPN to search for." };
  const suppliers = new SupplierResolver(await db.supplier.findMany());
  const tried: string[] = [];
  for (const a of activeAdapters()) {
    tried.push(a.label);
    try {
      const { parts } = await callAdapter(a, line.rawMpn, 15 * 60);
      const ap = pickPart(parts, line.rawMpn, line.rawManufacturer);
      if (!ap) continue;
      const { partId, created } = await upsertPartFromAdapter(ap, a.key);
      await applyAdapterPart(partId, a.key, ap, suppliers);
      await applyLifecycle(partId, [{ source: a.key, lifecycle: ap.lifecycle }]);
      const literal = ap.mpn.toUpperCase() === line.rawMpn.trim().toUpperCase();
      await db.$transaction([
        db.bomLineMatch.updateMany({ where: { bomLineId: lineId }, data: { selected: false } }),
        db.bomLineMatch.upsert({
          where: { bomLineId_partId: { bomLineId: lineId, partId } },
          create: { bomLineId: lineId, partId, method: literal ? "EXACT" : "NORMALISED", confidence: literal ? 100 : 98, reason: `Found at ${a.label}`, selected: true },
          update: { selected: true, reason: `Found at ${a.label}` },
        }),
        db.bomLine.update({ where: { id: lineId }, data: { partId, needsReview: false } }),
      ]);
      await scoreRevision(db, line.revisionId);
      revalidatePath(`/boms/${line.revisionId}`);
      return { message: `${ap.mpn} found at ${a.label}${created ? " and added to the catalogue" : ""}.` };
    } catch (e) {
      return fail(e);
    }
  }
  return { error: `Not found at ${tried.join(", ") || "any configured distributor"}.` };
}

// ───────────────────────────── Cart ─────────────────────────────

export async function addItemsToCart(items: CartAdd[]): Promise<Result> {
  const user = await requireUser("sourcing.buy");
  try {
    const { added } = await addToCart(user.id, items);
    revalidatePath("/sourcing", "layout");
    return { message: `${added} line${added === 1 ? "" : "s"} in your cart` };
  } catch (e) {
    return fail(e);
  }
}

export async function addBomShortagesToCart(revisionId: string): Promise<Result> {
  const user = await requireUser("sourcing.buy");
  try {
    const { added } = await addShortagesToCart(user.id, revisionId);
    revalidatePath("/sourcing", "layout");
    return { message: added ? `${added} short line${added === 1 ? "" : "s"} added to your cart` : "Nothing to buy — this build is covered from stock." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCartItem(id: string, data: { qty?: number; supplierId?: string | null }): Promise<Result> {
  const user = await requireUser("sourcing.buy");
  const item = await db.cartItem.findFirst({ where: { id, cart: { userId: user.id, status: "OPEN" } } });
  if (!item) return { error: "Cart line not found." };
  if (data.qty !== undefined && (!Number.isInteger(data.qty) || data.qty < 1)) return { error: "Quantity must be a whole number ≥ 1." };
  await db.cartItem.update({ where: { id }, data: { qty: data.qty, supplierId: data.supplierId === undefined ? undefined : data.supplierId, offerId: data.supplierId === undefined ? undefined : null } });
  revalidatePath("/sourcing/cart");
  return {};
}

export async function removeCartItem(id: string): Promise<Result> {
  const user = await requireUser("sourcing.buy");
  await db.cartItem.deleteMany({ where: { id, cart: { userId: user.id, status: "OPEN" } } });
  revalidatePath("/sourcing", "layout");
  return {};
}

// ───────────────────────────── RFQ ─────────────────────────────

const rfqSchema = z.object({
  supplierIds: z.array(z.string()).min(1, "Pick at least one supplier to ask."),
  dueDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  incoterm: z.string().max(80).optional(),
});

export async function createRfq(input: z.infer<typeof rfqSchema>): Promise<Result> {
  const user = await requireUser("rfq.send");
  const parsed = rfqSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  let id: string;
  try {
    const rfq = await createRfqFromCart(user.id, {
      supplierIds: parsed.data.supplierIds,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      notes: parsed.data.notes || null,
      incoterm: parsed.data.incoterm || null,
    });
    await db.auditLog.create({ data: { userId: user.id, action: "rfq.create", entity: "Rfq", entityId: rfq.id } });
    id = rfq.id;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/sourcing", "layout");
  redirect(`/sourcing/rfqs/${id}`);
}

export async function markRfqSent(rfqId: string): Promise<Result> {
  const user = await requireUser("rfq.send");
  await db.rfq.update({ where: { id: rfqId }, data: { status: "SENT" } });
  await db.auditLog.create({ data: { userId: user.id, action: "rfq.markSent", entity: "Rfq", entityId: rfqId } });
  revalidatePath(`/sourcing/rfqs/${rfqId}`);
  return {};
}

export async function saveManualQuote(
  rfqId: string,
  supplierId: string,
  input: { currency: string; freight: number | null; validUntil: string | null; lines: QuoteLineInput[] },
): Promise<Result> {
  await requireUser("rfq.send");
  try {
    const { priced } = await saveQuote(rfqId, supplierId, {
      currency: input.currency,
      freight: input.freight,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      lines: input.lines,
    });
    revalidatePath(`/sourcing/rfqs/${rfqId}`);
    return { message: `Quote saved (${priced} priced line${priced === 1 ? "" : "s"})` };
  } catch (e) {
    return fail(e);
  }
}

export async function quoteFromLiveOffers(rfqId: string, supplierId: string): Promise<Result> {
  await requireUser("rfq.send");
  try {
    const { priced } = await quoteFromOffers(rfqId, supplierId);
    revalidatePath(`/sourcing/rfqs/${rfqId}`);
    return priced ? { message: `${priced} line${priced === 1 ? "" : "s"} priced from current offers` } : { error: "This supplier has no current offers for these parts." };
  } catch (e) {
    return fail(e);
  }
}

export async function importQuoteFile(rfqId: string, supplierId: string, form: FormData): Promise<Result> {
  await requireUser("rfq.send");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the supplier's filled-in RFQ sheet." };
  if (file.size > MAX_BOM_BYTES) return { error: "File is larger than 10 MB." };
  try {
    const { rows } = parseBomFile(new Uint8Array(await file.arrayBuffer()), file.name);
    const parsed = parseQuoteSheet(rows);
    const rfq = await db.rfq.findUniqueOrThrow({ where: { id: rfqId }, include: { lines: { include: { part: true } } }, });
    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    const byRef = new Map(rfq.lines.map((l) => [l.id, l]));
    const byMpn = new Map(rfq.lines.map((l) => [normaliseMpn(l.part.mpn), l]));
    let unmatched = 0;
    const lines: QuoteLineInput[] = [];
    for (const q of parsed.lines) {
      const line = (q.ref && byRef.get(q.ref)) || (q.mpn && byMpn.get(normaliseMpn(q.mpn)));
      if (!line) {
        unmatched++;
        continue;
      }
      lines.push({ rfqLineId: line.id, unitPrice: q.unitPrice, qtyOffered: q.qtyOffered, leadTimeWeeks: q.leadTimeWeeks, dateCode: q.dateCode, condition: q.condition, cocAvailable: q.cocAvailable });
    }
    if (!lines.length) return { error: "No priced lines found in the file." };
    await saveQuote(rfqId, supplierId, { currency: parsed.currency ?? supplier.currency, source: "IMPORT", lines, notes: `Imported from ${file.name}` });
    revalidatePath(`/sourcing/rfqs/${rfqId}`);
    return { message: `Imported ${lines.length} priced line${lines.length === 1 ? "" : "s"}${unmatched ? `, ${unmatched} row(s) didn't match the RFQ` : ""}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveAwards(rfqId: string, awards: { rfqLineId: string; quoteLineId: string | null }[]): Promise<Result> {
  await requireUser("rfq.send");
  await setAwards(rfqId, awards);
  revalidatePath(`/sourcing/rfqs/${rfqId}`);
  return {};
}

export async function awardBestLanded(rfqId: string): Promise<Result> {
  await requireUser("rfq.send");
  try {
    await awardBest(rfqId);
    revalidatePath(`/sourcing/rfqs/${rfqId}`);
    return { message: "Awarded the lowest landed cost that covers each quantity." };
  } catch (e) {
    return fail(e);
  }
}

export async function createPos(rfqId: string): Promise<Result> {
  const user = await requireUser("sourcing.buy");
  let ids: string[];
  try {
    ids = await createPurchaseOrders(rfqId, user.id);
    await db.auditLog.create({ data: { userId: user.id, action: "po.createDrafts", entity: "Rfq", entityId: rfqId, data: { pos: ids } } });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/sourcing", "layout");
  redirect(ids.length === 1 ? `/sourcing/pos/${ids[0]}` : `/sourcing/pos`);
}

export async function setPoStatus(poId: string, status: "PENDING_APPROVAL" | "APPROVED" | "SENT" | "CANCELLED"): Promise<Result> {
  const user = await requireUser(status === "APPROVED" ? "admin.users" : "sourcing.buy");
  await db.purchaseOrderDraft.update({ where: { id: poId }, data: { status } });
  await db.auditLog.create({ data: { userId: user.id, action: `po.${status.toLowerCase()}`, entity: "PurchaseOrderDraft", entityId: poId } });
  revalidatePath(`/sourcing/pos/${poId}`);
  return {};
}

// ───────────────────────────── Supplier price lists ─────────────────────────────

export async function importPriceList(_prev: Result, form: FormData): Promise<Result> {
  const user = await requireUser("sourcing.buy");
  const file = form.get("file");
  const supplierId = String(form.get("supplierId") ?? "");
  const newSupplier = String(form.get("newSupplier") ?? "").trim();
  const addUnknown = form.get("addUnknown") === "on";
  if (!(file instanceof File) || !file.size) return { error: "Choose a price-list file." };
  if (file.size > MAX_BOM_BYTES) return { error: "File is larger than 10 MB." };

  try {
    let supplier = supplierId && supplierId !== "new" ? await db.supplier.findUnique({ where: { id: supplierId } }) : null;
    if (!supplier) {
      if (!newSupplier) return { error: "Pick a supplier or enter a new supplier name." };
      supplier = await db.supplier.create({
        data: {
          code: `PL-${newSupplier.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 20)}-${Date.now().toString(36).slice(-3).toUpperCase()}`,
          name: newSupplier,
          kind: "AUTHORISED",
          country: "IN",
          currency: "INR",
          adapter: "price-list",
          freightPct: 0.5,
        },
      });
    }
    const { rows } = parseBomFile(new Uint8Array(await file.arrayBuffer()), file.name);
    const headerRow = Math.max(0, rows.findIndex((r) => autoMapPriceList(r).fields.mpn !== undefined));
    const mapping = autoMapPriceList(rows[headerRow] ?? []);
    if (mapping.fields.mpn === undefined) return { error: "No MPN / part-number column found." };
    if (!mapping.breaks.length) return { error: "No price columns found (headers like 'Price', '1+', '100+', '@1000')." };
    const { entries, skipped } = parsePriceList(rows, headerRow, mapping, supplier.currency);

    const parts = await db.part.findMany({ where: { mpnNormalised: { in: entries.map((e) => normaliseMpn(e.mpn)) } }, select: { id: true, mpnNormalised: true } });
    const partByKey = new Map(parts.map((p) => [p.mpnNormalised, p.id]));
    let updated = 0;
    let createdParts = 0;
    let unknown = 0;
    for (const e of entries) {
      let partId = partByKey.get(normaliseMpn(e.mpn));
      if (!partId && addUnknown) {
        const r = await upsertPartFromAdapter({ mpn: e.mpn, manufacturer: e.manufacturer ?? "Unknown", description: e.description, offers: [] }, "mock");
        await db.part.update({ where: { id: r.partId }, data: { source: "price-list" } });
        partId = r.partId;
        if (r.created) createdParts++;
      }
      if (!partId) {
        unknown++;
        continue;
      }
      const sku = e.sku ?? `${supplier.code}-${normaliseMpn(e.mpn)}`;
      const data = {
        packaging: e.packaging, stock: e.stock, moq: e.moq, spq: e.spq, currency: e.currency,
        priceBreaks: e.priceBreaks as unknown as Prisma.InputJsonValue, factoryLeadTimeWeeks: e.leadTimeWeeks,
        dateCode: e.dateCode, source: "price-list", fetchedAt: new Date(), cocAvailable: true,
      };
      await db.offer.upsert({
        where: { partId_supplierId_sku: { partId, supplierId: supplier.id, sku } },
        create: { partId, supplierId: supplier.id, sku, ...data },
        update: data,
      });
      updated++;
    }
    await db.auditLog.create({ data: { userId: user.id, action: "priceList.import", entity: "Supplier", entityId: supplier.id, data: { file: file.name, updated, unknown, createdParts, skipped } } });
    revalidatePath("/sourcing/price-lists");
    return {
      message: `${supplier.name}: ${updated} offer${updated === 1 ? "" : "s"} updated${createdParts ? `, ${createdParts} new parts added` : ""}${unknown ? `, ${unknown} MPNs not in the catalogue (tick "add unknown" to include them)` : ""}${skipped ? `, ${skipped} rows skipped (no MPN or price)` : ""}.`,
    };
  } catch (e) {
    return fail(e);
  }
}
