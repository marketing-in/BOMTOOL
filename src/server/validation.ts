import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { expandRefDes } from "@/lib/refdes";
import { footprintMatchFor } from "@/server/workflow";
import { validate, type VLine, type Validation } from "@/lib/validation/checks";
import { loadAliasIndex } from "@/server/bom-pipeline";
import { resolveManufacturer } from "@/lib/normalise";
import { consumableNeeds, registerAlerts, type ConsumableNeed, type RegisterItem, type RegisterSpec } from "@/lib/validation/consumables";
import { lookupPending, type LookupStats } from "@/server/sourcing/lookup";
import { activeAdapters } from "@/server/sourcing";

/**
 * BoM validation (Phase 46): one revision's lines, placements, footprint check, distributor listings, the customer's
 * competitor list and the reviewers' calls, turned into flags (src/lib/validation/checks.ts). Read-only apart from
 * the calls a reviewer makes; nothing here buys anything.
 */

/** The distributors the validation shows by name, in this order: the SoW's four, and Mouser beside them. */
export const DISTRIBUTORS = [
  { key: "digikey", label: "Digi-Key", codes: ["DIGIKEY"] },
  { key: "newark", label: "Newark", codes: ["NEWARK"] },
  { key: "element14", label: "element14", codes: ["E14-"] },
  { key: "lcsc", label: "LCSC", codes: ["LCSC"] },
  { key: "mouser", label: "Mouser", codes: ["MOUSER"] },
] as const;
export type DistributorKey = (typeof DISTRIBUTORS)[number]["key"];

const distributorOf = (code: string): DistributorKey | null => DISTRIBUTORS.find((d) => d.codes.some((c) => code === c || (c.endsWith("-") && code.startsWith(c))))?.key ?? null;

/** Kinds of seller that make a part visible in the market (not our own stores, not brokers). */
const CHANNEL = new Set(["AUTHORISED", "MANUFACTURER"]);

export type ValidationRow = {
  lineNo: number;
  refDes: string;
  refs: string[];
  mpn: string | null;
  manufacturer: string | null;
  description: string | null;
  pkg: string | null;
  dnp: boolean;
  need: number;
  matched: { id: string; mpn: string; confirmed: boolean } | null;
  lifecycle: string | null;
  /** Stock per named distributor: null when it does not list the part. */
  stock: Record<DistributorKey, number | null>;
};

export const validationFor = cache(async (revisionId: string) => {
  const rev = await db.bomRevision.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      revision: true,
      buildQty: true,
      status: true,
      bom: { select: { name: true, project: { select: { name: true, customer: { select: { id: true, code: true, name: true, competitors: { select: { id: true, name: true, aliases: true, note: true }, orderBy: { name: "asc" } } } } } } } },
      board: { select: { source: true } },
    },
  });
  if (!rev) return null;
  const [lines, placements, calls] = await Promise.all([
    db.bomLine.findMany({
      where: { revisionId },
      orderBy: { lineNo: "asc" },
      select: {
        lineNo: true,
        refDes: true,
        rawMpn: true,
        rawManufacturer: true,
        rawDescription: true,
        rawPackage: true,
        qtyPerBoard: true,
        dnp: true,
        needsReview: true,
        issues: true,
        supplierPn: true,
        supplierName: true,
        part: {
          select: {
            id: true,
            mpn: true,
            lifecycle: true,
            manufacturer: { select: { name: true } },
            package: { select: { name: true, pinCount: true } },
            offers: { select: { stock: true, factoryLeadTimeWeeks: true, supplier: { select: { code: true, name: true, kind: true, isAuthorised: true } } } },
          },
        },
      },
    }),
    db.placement.findMany({ where: { revisionId }, select: { refDes: true, footprint: true, copper: true, padCount: true, snap: true } }),
    db.validationCall.findMany({ where: { revisionId }, select: { key: true, status: true, reason: true, decidedAt: true, decidedById: true } }),
  ]);
  const footprint = placements.length ? await footprintMatchFor(revisionId) : null;
  const qty = Math.max(1, rev.buildQty);

  const vlines: VLine[] = lines.map((l) => {
    const offers = (l.part?.offers ?? []).filter((o) => CHANNEL.has(o.supplier.kind));
    return {
      lineNo: l.lineNo,
      refs: expandRefDes(l.refDes),
      mpn: l.rawMpn,
      manufacturer: l.rawManufacturer,
      description: l.rawDescription,
      pkg: l.rawPackage,
      dnp: l.dnp,
      need: l.qtyPerBoard * qty,
      part: l.part
        ? { mpn: l.part.mpn, manufacturer: l.part.manufacturer.name, pkg: l.part.package?.name ?? null, pins: l.part.package?.pinCount ?? null, lifecycle: l.part.lifecycle, confirmed: !l.needsReview }
        : null,
      offers: offers.map((o) => ({ seller: o.supplier.name, stock: o.stock, authorised: o.supplier.isAuthorised || o.supplier.kind === "AUTHORISED", leadWeeks: o.factoryLeadTimeWeeks })),
      issues: l.issues,
      supplierPn: l.supplierPn,
      supplier: l.supplierName,
    };
  });
  // Two maker names are one maker when the alias table takes them to the same name.
  const aliases = await loadAliasIndex(db);
  const sameMaker = (a: string, b: string) => {
    const [x, y] = [resolveManufacturer(a, aliases), resolveManufacturer(b, aliases)];
    return x !== null && x === y;
  };

  const validation: Validation = validate({
    lines: vlines,
    placements: placements.length ? placements : null,
    footprint,
    competitors: rev.bom.project.customer.competitors,
    calls,
    sameMaker,
  });

  const rows: ValidationRow[] = lines.map((l, i) => {
    const stock = Object.fromEntries(DISTRIBUTORS.map((d) => [d.key, null])) as Record<DistributorKey, number | null>;
    for (const o of l.part?.offers ?? []) {
      const k = distributorOf(o.supplier.code);
      if (k) stock[k] = (stock[k] ?? 0) + o.stock;
    }
    return {
      lineNo: l.lineNo,
      refDes: l.refDes ?? "",
      refs: vlines[i].refs,
      mpn: l.rawMpn,
      manufacturer: l.rawManufacturer,
      description: l.rawDescription,
      pkg: l.rawPackage,
      dnp: l.dnp,
      need: vlines[i].need,
      matched: l.part ? { id: l.part.id, mpn: l.part.mpn, confirmed: !l.needsReview } : null,
      lifecycle: l.part?.lifecycle ?? null,
      stock,
    };
  });

  return {
    revision: { id: rev.id, revision: rev.revision, status: rev.status, buildQty: qty, bom: rev.bom.name, project: rev.bom.project.name, hasBoard: rev.board?.source === "gerber", placements: placements.length },
    customer: { id: rev.bom.project.customer.id, code: rev.bom.project.customer.code, name: rev.bom.project.customer.name },
    competitors: rev.bom.project.customer.competitors,
    validation,
    rows,
  };
});

export type ValidationData = NonNullable<Awaited<ReturnType<typeof validationFor>>>;

const asRegister = (c: { id: string; kind: string; name: string; spec: unknown; quantity: number; unit: string; minQty: number | null; location: string | null; lot: string | null; expiresAt: Date | null; revisionId: string | null }): RegisterItem => ({
  id: c.id,
  kind: c.kind as RegisterItem["kind"],
  name: c.name,
  spec: (c.spec ?? null) as RegisterSpec | null,
  quantity: c.quantity,
  unit: c.unit,
  minQty: c.minQty,
  location: c.location,
  lot: c.lot,
  expiresAt: c.expiresAt,
  revisionId: c.revisionId,
});

/** The consumables register, every item. */
export async function consumableRegister(): Promise<RegisterItem[]> {
  const items = await db.consumable.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] });
  return items.map(asRegister);
}

/** Register items that need the stores' attention (expired, low, expiring soon). */
export async function consumableAlerts() {
  return registerAlerts(await consumableRegister());
}

/**
 * What one build needs (stencils, paste, flux) against the register. The quantities come from the feasibility study
 * of the revision at its build quantity; null when it cannot be worked out (no board, no parts).
 */
export async function consumablesFor(revisionId: string): Promise<{ needs: ConsumableNeed[]; qty: number } | null> {
  const { getFeasibility } = await import("@/server/feasibility");
  const f = await getFeasibility(revisionId).catch((e) => {
    console.error(`Consumables for ${revisionId}: the feasibility study failed:`, e);
    return null;
  });
  if (!f) return null;
  const register = await consumableRegister();
  return {
    qty: f.qty,
    needs: consumableNeeds({ revisionId, sides: f.paste.sides.map((s) => ({ side: s.side, stencilUm: s.stencilUm })), lot: f.consumables }, register),
  };
}

/**
 * Where looking a BoM's part numbers up at the distributors stands: how many lines still wait, and the last run
 * (running or done: found, not found, the part numbers no distributor knows).
 */
export async function lookupStatus(revisionId: string) {
  const [pending, run] = await Promise.all([
    lookupPending(db, revisionId),
    db.jobRun.findFirst({ where: { kind: "bom.lookup", stats: { path: ["revisionId"], equals: revisionId } }, orderBy: { startedAt: "desc" }, select: { status: true, startedAt: true, finishedAt: true, stats: true, error: true } }),
  ]);
  const s = (run?.stats ?? {}) as Partial<LookupStats>;
  return {
    pending,
    live: activeAdapters().filter((a) => a.kind !== "mock" && a.dailyLimit > 0).map((a) => a.label),
    run: run ? { status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt, lines: s.lines ?? 0, found: s.found ?? 0, notFound: s.notFound ?? 0, errors: s.errors ?? 0, by: s.by ?? {}, missing: s.missing ?? [], simulated: !!s.simulated, error: run.error } : null,
  };
}

