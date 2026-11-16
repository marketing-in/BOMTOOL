/**
 * Catalogue look-ups for parts read off a board's Gerbers (Phase 14): what in our catalogue fits a footprint, for the
 * quick look's table and the components step's "Choose the part".
 */
import "server-only";
import type { Lifecycle, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Currency } from "@/lib/currency";
import { bestOffer } from "@/lib/pricing";
import { expandRefDes } from "@/lib/refdes";
import { GUESSED_MARK, KIND_CATEGORIES, kindForLine, packageHint, type FoundGroup, type LineKind } from "@/lib/board/find-parts";

export type CatalogueFit = { parts: number; inStock: number; href: string | null };

/** Parts in a footprint's packages (exact names, or family and pin count) and of the categories a kind allows. */
export function fitsWhere(footprint: string | null, kind: LineKind | null): Prisma.PartWhereInput | null {
  const hint = packageHint(footprint);
  // Leaded footprints say more than the kind: a radial is an electrolytic, film cap or inductor, a header a header.
  const cats = /^Radial/i.test(footprint ?? "")
    ? ["aluminium-cap", "polymer-cap", "film-cap", "supercap", "inductor"]
    : /^Header/i.test(footprint ?? "")
      ? ["connector-header", "terminal-block", "connector-wtb"]
      : kind
        ? KIND_CATEGORIES[kind]
        : [];
  const pkg: Prisma.PartWhereInput[] = [
    ...(hint.names.length ? [{ package: { name: { in: hint.names } } }] : []),
    ...(hint.family && hint.pins ? [{ package: { family: hint.family, pinCount: hint.pins } }] : []),
  ];
  // A footprint we can't name (headers, odd modules) narrows by kind alone; with neither there's nothing to go on.
  if (!pkg.length && !cats.length) return null;
  return { AND: [...(pkg.length ? [{ OR: pkg }] : []), ...(cats.length ? [{ category: { slug: { in: cats } } }] : [])] };
}

/** How many catalogue parts — and how many in our stores — come in each group's footprint, for the kind it looks like. */
export async function catalogueFits(groups: FoundGroup[]): Promise<Map<string, CatalogueFit>> {
  const out = new Map<string, CatalogueFit>();
  await Promise.all(
    groups.map(async (g) => {
      const where = fitsWhere(g.package, g.passive ? "passive" : g.kind === "other" ? null : g.kind);
      if (!where) return out.set(g.key, { parts: 0, inStock: 0, href: null });
      const [parts, inStock] = await Promise.all([
        db.part.count({ where }),
        db.part.count({ where: { AND: [where, { inventoryLots: { some: { qty: { gt: 0 }, isConsigned: false } } }] } }),
      ]);
      const names = packageHint(g.package).names;
      out.set(g.key, { parts, inStock, href: names.length === 1 ? `/parts?pkg=${encodeURIComponent(names[0])}` : null });
    }),
  );
  return out;
}

// ───────────────────────────── Choose the part for a line ─────────────────────────────

export type PartChoice = {
  partId: string;
  mpn: string;
  manufacturer: string;
  description: string | null;
  pkg: string | null;
  lifecycle: Lifecycle;
  /** Free in our stores. */
  ours: number;
  /** In stock at authorised distributors. */
  distributors: number;
  /** Best offer at the line's need, display currency. */
  unit: number | null;
  /** Why the matcher proposed it (match candidates only). */
  reason: string | null;
};

const choiceSelect = {
  id: true,
  mpn: true,
  description: true,
  lifecycle: true,
  manufacturer: { select: { name: true } },
  package: { select: { name: true } },
  inventoryLots: { where: { qty: { gt: 0 }, isConsigned: false }, select: { qty: true, reservedQty: true } },
  offers: { select: { supplierId: true, priceBreaks: true, moq: true, currency: true, stock: true, supplier: { select: { kind: true } } } },
} satisfies Prisma.PartSelect;

type ChoiceRow = Prisma.PartGetPayload<{ select: typeof choiceSelect }>;

function toChoice(p: ChoiceRow, need: number, currency: Currency, reason: string | null = null): PartChoice {
  return {
    partId: p.id,
    mpn: p.mpn,
    manufacturer: p.manufacturer.name,
    description: p.description,
    pkg: p.package?.name ?? null,
    lifecycle: p.lifecycle,
    ours: p.inventoryLots.reduce((s, l) => s + Math.max(0, l.qty - l.reservedQty), 0),
    distributors: p.offers.filter((o) => o.supplier.kind === "AUTHORISED" || o.supplier.kind === "MANUFACTURER").reduce((s, o) => s + o.stock, 0),
    unit: bestOffer(p.offers, need, currency)?.unit ?? null,
    reason,
  };
}

/** Ours first, then active parts in distributor stock, then the cheapest. */
const byAvailability = (a: PartChoice, b: PartChoice) =>
  Number(b.ours > 0) - Number(a.ours > 0) ||
  Number(b.lifecycle === "ACTIVE") - Number(a.lifecycle === "ACTIVE") ||
  Number(b.distributors > 0) - Number(a.distributors > 0) ||
  (a.unit ?? Infinity) - (b.unit ?? Infinity);

/**
 * Parts to choose from for a line without one: the matcher's candidates, parts in our catalogue that fit the
 * footprint (for the kind the designators or the guess say), and a free search.
 */
export async function partChoices(lineId: string, need: number, currency: Currency, find?: string) {
  const line = await db.bomLine.findUnique({
    where: { id: lineId },
    select: { refDes: true, rawPackage: true, rawValue: true, rawDescription: true, matches: { orderBy: { confidence: "desc" }, select: { confidence: true, reason: true, part: { select: choiceSelect } } } },
  });
  if (!line) return null;
  const kind = kindForLine(line.refDes, line.rawPackage, line.rawValue, line.rawDescription);
  const where = fitsWhere(line.rawPackage, kind);
  const q = find?.trim().slice(0, 60);
  const [fitRows, foundRows] = await Promise.all([
    where ? db.part.findMany({ where, select: choiceSelect, take: 60 }) : Promise.resolve([]),
    q ? db.part.findMany({ where: { OR: [{ mpn: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }, select: choiceSelect, take: 12 }) : Promise.resolve([]),
  ]);
  const matches = line.matches.map((m) => toChoice(m.part, need, currency, `${m.reason ?? "Match"} · ${m.confidence}%`));
  const shown = new Set(matches.map((c) => c.partId));
  return {
    kind,
    footprint: line.rawPackage,
    guessed: !!line.rawDescription?.includes(GUESSED_MARK),
    refs: expandRefDes(line.refDes),
    matches,
    fits: fitRows.map((p) => toChoice(p, need, currency)).filter((c) => !shown.has(c.partId)).sort(byAvailability).slice(0, 10),
    fitsTotal: fitRows.length,
    found: foundRows.map((p) => toChoice(p, need, currency)).sort(byAvailability),
    query: q ?? "",
  };
}
