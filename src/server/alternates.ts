import "server-only";
import type { Prisma } from "@prisma/client";
import type { Currency } from "@/lib/currency";
import { db } from "@/lib/db";
import { bestOffer } from "@/lib/pricing";
import { assessAlternate, rankAlternates, type AltPart, type Verdict } from "@/lib/alternates";

const include = {
  manufacturer: { select: { name: true, shortName: true } },
  category: { select: { slug: true } },
  package: { select: { name: true } },
  parameters: { select: { valueText: true, valueNum: true, parameter: { select: { key: true, name: true } } } },
  offers: { select: { supplierId: true, currency: true, stock: true, moq: true, priceBreaks: true } },
  inventoryLots: { select: { qty: true, reservedQty: true } },
} satisfies Prisma.PartInclude;

type Loaded = Prisma.PartGetPayload<{ include: typeof include }>;

function toAlt(p: Loaded, currency: Currency): AltPart {
  return {
    id: p.id,
    mpn: p.mpn,
    manufacturerId: p.manufacturerId,
    manufacturer: p.manufacturer.shortName ?? p.manufacturer.name,
    categorySlug: p.category.slug,
    packageId: p.packageId,
    packageName: p.package?.name ?? null,
    lifecycle: p.lifecycle,
    params: Object.fromEntries(p.parameters.map((x) => [x.parameter.key, { name: x.parameter.name, text: x.valueText, num: x.valueNum }])),
    stock: p.inventoryLots.reduce((s, l) => s + l.qty - l.reservedQty, 0) + p.offers.reduce((s, o) => s + o.stock, 0),
    unit: bestOffer(p.offers, 1000, currency)?.unit ?? null,
  };
}

/** Catalogue parts in the same category that can replace this one, excluding alternates already on record. */
export async function suggestAlternates(partId: string, currency: Currency, limit = 6) {
  const part = await db.part.findUnique({ where: { id: partId }, include: { ...include, alternatesFrom: { select: { altPartId: true } } } });
  if (!part) return [];
  const known = new Set(part.alternatesFrom.map((a) => a.altPartId));
  const pool = await db.part.findMany({ where: { categoryId: part.categoryId, id: { notIn: [part.id, ...known] } }, include });
  return rankAlternates(
    toAlt(part, currency),
    pool.map((p) => toAlt(p, currency)),
    limit,
  );
}

/** Re-checks one pair on the server (approval never trusts the browser's copy of the verdict). */
export async function assessPair(partId: string, altPartId: string): Promise<Verdict | null> {
  const [a, b] = await Promise.all([db.part.findUnique({ where: { id: partId }, include }), db.part.findUnique({ where: { id: altPartId }, include })]);
  if (!a || !b) return null;
  return assessAlternate(toAlt(a, "INR"), toAlt(b, "INR"));
}
