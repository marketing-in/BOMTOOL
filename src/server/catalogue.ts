import "server-only";
import type { Lifecycle, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { convert, type Currency } from "@/lib/currency";
import { bestOffer } from "@/lib/pricing";
import { normaliseMpn } from "@/lib/normalise";
import { mslState } from "@/lib/ops/msl";
import { webUrl } from "@/server/sourcing/normalise";

export const PAGE_SIZE = 50;

export type PartFilters = { q?: string; category?: string; lifecycle?: Lifecycle; page?: number; maker?: string; pkg?: string; inStock?: boolean };

export type Facet = { value: string; count: number };

export async function listParts(filters: PartFilters, currency: Currency) {
  const where: Prisma.PartWhereInput = {};
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { mpnNormalised: { contains: normaliseMpn(q) } },
      { description: { contains: q, mode: "insensitive" } },
      { manufacturer: { name: { contains: q, mode: "insensitive" } } },
      { manufacturer: { aliases: { some: { alias: { equals: q.toUpperCase().replace(/[^A-Z0-9]/g, "") } } } } },
    ];
  }
  if (filters.category) {
    where.category = { OR: [{ slug: filters.category }, { parent: { slug: filters.category } }] };
  }
  if (filters.lifecycle) where.lifecycle = filters.lifecycle;
  const inStock: Prisma.PartWhereInput = filters.inStock ? { OR: [{ inventoryLots: { some: { qty: { gt: 0 } } } }, { offers: { some: { stock: { gt: 0 } } } }] } : {};
  // Facet counts ignore their own filter, like a distributor's parametric search.
  const facetBase: Prisma.PartWhereInput = { AND: [where, inStock] };
  const filtered: Prisma.PartWhereInput = {
    AND: [where, inStock, filters.maker ? { manufacturer: { name: filters.maker } } : {}, filters.pkg ? { package: { name: filters.pkg } } : {}],
  };

  const page = Math.max(1, filters.page ?? 1);
  const [total, parts, makerGroups, pkgGroups] = await Promise.all([
    db.part.count({ where: filtered }),
    db.part.findMany({
      where: filtered,
      orderBy: [{ category: { sortOrder: "asc" } }, { mpn: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        manufacturer: { select: { name: true, shortName: true } },
        category: { select: { name: true, slug: true } },
        package: { select: { name: true } },
        offers: { select: { supplierId: true, currency: true, stock: true, moq: true, priceBreaks: true } },
        inventoryLots: { select: { qty: true, reservedQty: true } },
      },
    }),
    filters.category ? db.part.groupBy({ by: ["manufacturerId"], where: { AND: [facetBase, filters.pkg ? { package: { name: filters.pkg } } : {}] }, _count: { _all: true } }) : Promise.resolve([]),
    filters.category ? db.part.groupBy({ by: ["packageId"], where: { AND: [facetBase, filters.maker ? { manufacturer: { name: filters.maker } } : {}] }, _count: { _all: true } }) : Promise.resolve([]),
  ]);
  const [makerNames, pkgNames] = await Promise.all([
    makerGroups.length ? db.manufacturer.findMany({ where: { id: { in: makerGroups.map((g) => g.manufacturerId) } }, select: { id: true, name: true } }) : Promise.resolve([]),
    pkgGroups.length ? db.package.findMany({ where: { id: { in: pkgGroups.map((g) => g.packageId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? null;
  const facets = {
    makers: makerGroups.map((g) => ({ value: name(makerNames, g.manufacturerId) ?? "?", count: g._count._all })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    packages: pkgGroups
      .map((g) => ({ value: name(pkgNames, g.packageId), count: g._count._all }))
      .filter((f): f is Facet => !!f.value)
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
  };

  const rows = parts.map((p) => {
    const best = bestOffer(p.offers, 1000, currency);
    return {
      id: p.id,
      mpn: p.mpn,
      manufacturer: p.manufacturer.shortName ?? p.manufacturer.name,
      description: p.description,
      category: p.category.name,
      package: p.package?.name ?? null,
      lifecycle: p.lifecycle,
      internalStock: p.inventoryLots.reduce((s, l) => s + l.qty - l.reservedQty, 0),
      marketStock: p.offers.reduce((s, o) => s + o.stock, 0),
      sources: p.offers.length,
      bestUnit: best?.unit ?? null,
      imageUrl: webUrl(p.imageUrl),
      datasheetUrl: webUrl(p.datasheetUrl),
    };
  });
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), facets };
}

export async function listCategories() {
  return db.category.findMany({
    where: { parentId: null },
    orderBy: { sortOrder: "asc" },
    include: { children: { orderBy: { sortOrder: "asc" }, select: { slug: true, name: true, _count: { select: { parts: true } } } } },
  });
}

export async function getPart(id: string) {
  return db.part.findUnique({
    where: { id },
    include: {
      manufacturer: true,
      category: { include: { parent: true } },
      package: true,
      parameters: { include: { parameter: true }, orderBy: { parameter: { name: "asc" } } },
      offers: { include: { supplier: true } },
      inventoryLots: { include: { warehouse: true, customer: true }, orderBy: { receivedAt: "asc" } },
      excessListings: { include: { supplier: true } },
      alternatesFrom: { include: { altPart: { include: { manufacturer: true } } }, orderBy: { confidence: "desc" } },
      priceHistory: { orderBy: { recordedAt: "asc" } },
      bomLines: { include: { revision: { include: { bom: { include: { project: true } } } } } },
    },
  });
}

export async function getDashboard(currency: Currency) {
  const [partCount, supplierCount, lifecycle, lots, lines, revisions, watch] = await Promise.all([
    db.part.count(),
    db.supplier.count({ where: { active: true } }),
    db.part.groupBy({ by: ["lifecycle"], _count: { _all: true } }),
    db.inventoryLot.findMany({ select: { qty: true, unitCost: true, currency: true, isConsigned: true, msl: true, floorLifeHoursLeft: true, mslOpenedAt: true } }),
    db.line.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { machines: true } },
        workOrders: { where: { status: { in: ["IN_PROGRESS", "KITTING", "READY", "PLANNED"] } }, include: { project: true }, orderBy: { plannedStart: "asc" } },
      },
    }),
    db.bomRevision.findMany({
      orderBy: { createdAt: "desc" },
      include: { bom: { include: { project: { include: { customer: true } } } }, lines: { select: { issues: true, part: { select: { lifecycle: true } } } } },
    }),
    db.bomLine.findMany({
      where: { part: { lifecycle: { not: "ACTIVE" } } },
      include: { part: { include: { manufacturer: true } }, revision: { include: { bom: true } } },
      take: 12,
    }),
  ]);

  const ownStockValue = lots
    .filter((l) => !l.isConsigned && l.unitCost)
    .reduce((s, l) => s + convert(l.qty * Number(l.unitCost), l.currency, currency), 0);
  const msl = lots.map((l) => mslState({ msl: l.msl, openedAt: l.mslOpenedAt, hoursLeft: l.floorLifeHoursLeft }));
  const openMslBags = msl.filter((m) => m.running).length;
  const mslExpiring = msl.filter((m) => m.running && (m.hoursLeft ?? 0) < 24).length;

  return {
    partCount,
    supplierCount,
    lifecycle: Object.fromEntries(lifecycle.map((l) => [l.lifecycle, l._count._all])) as Partial<Record<Lifecycle, number>>,
    ownStockValue,
    openMslBags,
    mslExpiring,
    lines,
    revisions: revisions.map((r) => ({
      id: r.id,
      name: r.bom.name,
      revision: r.revision,
      project: r.bom.project.name,
      customer: r.bom.project.customer.name,
      stage: r.bom.project.stage,
      status: r.status,
      buildQty: r.buildQty,
      lineCount: r.lines.length,
      issueCount: r.lines.filter((l) => l.issues.length).length,
      riskCount: r.lines.filter((l) => l.part && l.part.lifecycle !== "ACTIVE").length,
    })),
    watch,
  };
}
