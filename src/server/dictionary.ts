import "server-only";
import type { Lifecycle } from "@prisma/client";
import type { Currency } from "@/lib/currency";
import { db } from "@/lib/db";
import { bestOffer } from "@/lib/pricing";
import { bodyFor, type BodySpec } from "@/lib/board/bodies";
import { entryForPart, type DictEntry } from "@/knowledge/dictionary";
import { webUrl } from "@/server/sourcing/normalise";
import { PACKAGES } from "../../prisma/seed-data/packages";

export type CatalogueRow = {
  id: string;
  mpn: string;
  maker: string;
  description: string;
  lifecycle: Lifecycle;
  imageUrl: string | null;
  packageName: string | null;
  ownStock: number;
  marketStock: number;
  bestUnit: number | null;
};

/** Catalogue parts that are this kind of component, with live stock and best price @1k. */
export async function catalogueForEntry(entry: DictEntry, currency: Currency, limit = 8) {
  if (!entry.categories?.length) return { rows: [] as CatalogueRow[], total: 0, categories: [] as { slug: string; name: string; count: number }[] };
  const [parts, cats] = await Promise.all([
    db.part.findMany({
      where: { category: { slug: { in: entry.categories } } },
      include: {
        manufacturer: { select: { name: true, shortName: true } },
        category: { select: { slug: true } },
        package: { select: { name: true } },
        parameters: { select: { valueText: true } },
        offers: { select: { supplierId: true, currency: true, stock: true, moq: true, priceBreaks: true } },
        inventoryLots: { select: { qty: true, reservedQty: true } },
      },
    }),
    db.category.findMany({ where: { slug: { in: entry.categories } }, select: { slug: true, name: true, _count: { select: { parts: true } } } }),
  ]);
  // Categories like "mosfet" hold both N- and P-channel parts: keep the ones that map to this entry.
  const mine = parts.filter((p) => {
    const e = entryForPart({ categorySlug: p.category.slug, description: p.description, mpn: p.mpn, params: Object.fromEntries(p.parameters.map((x, i) => [String(i), x.valueText])) });
    return !e || e.slug === entry.slug;
  });
  const rows: CatalogueRow[] = mine
    .map((p) => ({
      id: p.id,
      mpn: p.mpn,
      maker: p.manufacturer.shortName ?? p.manufacturer.name,
      description: p.description,
      lifecycle: p.lifecycle,
      imageUrl: webUrl(p.imageUrl),
      packageName: p.package?.name ?? null,
      ownStock: p.inventoryLots.reduce((s, l) => s + l.qty - l.reservedQty, 0),
      marketStock: p.offers.reduce((s, o) => s + o.stock, 0),
      bestUnit: bestOffer(p.offers, 1000, currency)?.unit ?? null,
    }))
    .sort((a, b) => Number(!!b.imageUrl) - Number(!!a.imageUrl) || b.ownStock + b.marketStock - (a.ownStock + a.marketStock));
  return {
    rows: rows.slice(0, limit),
    total: rows.length,
    categories: cats.map((c) => ({ slug: c.slug, name: c.name, count: c._count.parts })),
  };
}

/** 3D body for an entry's model hint, using real package dimensions from the package library. */
export function bodyForEntry(entry: DictEntry): BodySpec | null {
  const m = entry.model;
  if (!m || m.kind === "explorer") return null;
  if (m.kind === "body") {
    return { kind: m.body, length: m.l, width: m.w, height: m.h, pins: m.pins ?? 2, pitch: m.pitch ?? 1.27, color: m.color ?? "#1f1f22" };
  }
  const pkg = PACKAGES.find((p) => p.name === m.package);
  if (!pkg) return null;
  return bodyFor(
    { family: pkg.family, name: pkg.name, pinCount: pkg.pins ?? null, pitchMm: pkg.pitch ?? null, lengthMm: pkg.size?.[0] ?? null, widthMm: pkg.size?.[1] ?? null, heightMm: pkg.size?.[2] ?? null },
    { category: entry.categories?.[0] ?? null },
  );
}
