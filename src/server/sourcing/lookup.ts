/**
 * Every part a BoM names, looked up at the distributors (Phase 47). A customer's MPN that is not in our catalogue is
 * searched at each configured distributor by part number alone (cached, within each one's daily limit); what is
 * found is added to the catalogue with every distributor's offers and lifecycle, and the line is matched to it. When
 * the MPN finds nothing, a Digi-Key number the BoM gives for the line is tried. Nothing else about the customer or
 * the BoM leaves the app.
 */
import type { PrismaClient } from "@prisma/client";
import { normaliseMpn } from "@/lib/normalise";
import { samePart } from "@/lib/validation/checks";
import { activeAdapters, callAdapter, pickPart } from "@/server/sourcing";
import { SupplierResolver, applyAdapterPart, applyLifecycle, upsertPartFromAdapter } from "@/server/sourcing/refresh";
import { scoreRevision } from "@/server/bom-pipeline";
import type { AdapterKey, AdapterPart, SupplierAdapter } from "@/server/sourcing/types";

export type LookupStats = {
  revisionId: string;
  /** Lines whose part was looked for, and how they came out. */
  lines: number;
  found: number;
  notFound: number;
  errors: number;
  /** Lines found by distributor ("Digi-Key": 40). */
  by: Record<string, number>;
  /** Part numbers no distributor knows. */
  missing: string[];
  /** Only the simulated market was asked (no distributor keys set): "not found" means not in the demo data. */
  simulated?: boolean;
  done?: boolean;
};

/** A part number, not a word ("TRANSFORMER") or a value. */
const looksLikeMpn = (s: string) => /\d/.test(s) && /[A-Z]/i.test(s) && s.trim().length >= 4;

/**
 * The adapter's answer for this part: the exact part number, else the one ordering-code variant of it (the BoM's
 * C2012X7R1H105K is sold as C2012X7R1H105K125AB, its LM2675MX-3.3 as LM2675MX-3.3/NOPB) when the maker agrees.
 */
export function pickForLine(parts: AdapterPart[], mpn: string, maker: string | null): AdapterPart | null {
  const exact = pickPart(parts, mpn, maker);
  if (exact) return exact;
  const m = (maker ?? "").toLowerCase().split(/\s+/)[0] ?? "";
  const variants = parts.filter((p) => samePart(mpn, p.mpn) && (!m || p.manufacturer.toLowerCase().includes(m) || m.includes(p.manufacturer.toLowerCase().split(/\s+/)[0])));
  const distinct = new Set(variants.map((p) => normaliseMpn(p.mpn)));
  return distinct.size === 1 ? variants[0] : null;
}

/** The lines of a revision still to look up: a part number, and no part or only our unconfirmed guess of another one. */
async function pending(db: PrismaClient, revisionId: string) {
  const lines = await db.bomLine.findMany({
    where: { revisionId, dnp: false, rawMpn: { not: null } },
    orderBy: { lineNo: "asc" },
    select: { id: true, lineNo: true, rawMpn: true, rawManufacturer: true, supplierPn: true, supplierName: true, partId: true, needsReview: true, part: { select: { mpn: true } } },
  });
  return lines.filter((l) => looksLikeMpn(l.rawMpn!) && (!l.partId || (l.needsReview && !samePart(l.rawMpn!, l.part!.mpn))));
}

/** How many lines of a revision are waiting to be looked up (the validation page's count). */
export async function lookupPending(db: PrismaClient, revisionId: string): Promise<number> {
  return (await pending(db, revisionId)).length;
}

export async function lookUpRevision(db: PrismaClient, revisionId: string, opts: { ttlSec: number; onProgress?: (s: LookupStats) => Promise<void> }): Promise<LookupStats> {
  const todo = await pending(db, revisionId);
  const stats: LookupStats = { revisionId, lines: todo.length, found: 0, notFound: 0, errors: 0, by: {}, missing: [] };
  const adapters = activeAdapters().filter((a) => a.dailyLimit > 0);
  stats.simulated = adapters.every((a) => a.kind === "mock");
  if (!todo.length || !adapters.length) return { ...stats, done: true };
  const suppliers = new SupplierResolver(await db.supplier.findMany());

  const ask = async (a: SupplierAdapter, query: string) => {
    try {
      return (await callAdapter(a, query, opts.ttlSec)).parts;
    } catch {
      stats.errors++;
      return [];
    }
  };

  for (const l of todo) {
    const mpn = l.rawMpn!.trim();
    // Added to the catalogue since the BoM was matched (by another BoM, or a buyer)?
    let partId = (await db.part.findFirst({ where: { mpnNormalised: normaliseMpn(mpn) }, select: { id: true } }))?.id ?? null;
    let how: { label: string; literal: boolean; variant: boolean } | null = partId ? { label: "our catalogue", literal: true, variant: false } : null;
    if (!partId) {
      const hits: { adapter: AdapterKey; label: string; part: AdapterPart }[] = [];
      for (const a of adapters) {
        const p = pickForLine(await ask(a, mpn), mpn, l.rawManufacturer);
        if (p) hits.push({ adapter: a.key, label: a.label, part: p });
      }
      // The distributor's own number for the line, when the part number alone found nothing.
      const dk = adapters.find((a) => a.key === "digikey");
      if (!hits.length && dk && l.supplierName === "Digi-Key" && l.supplierPn?.trim()) {
        const answer = await ask(dk, l.supplierPn.trim());
        const p = answer.length === 1 ? answer[0] : pickForLine(answer, mpn, l.rawManufacturer);
        if (p) hits.push({ adapter: dk.key, label: `${dk.label} (by ${l.supplierPn.trim()})`, part: p });
      }
      if (hits.length) {
        const first = hits[0];
        partId = (await upsertPartFromAdapter(first.part, first.adapter)).partId;
        for (const h of hits) if (normaliseMpn(h.part.mpn) === normaliseMpn(first.part.mpn)) await applyAdapterPart(partId, h.adapter, h.part, suppliers);
        await applyLifecycle(
          partId,
          hits.map((h) => ({ source: h.adapter, lifecycle: h.part.lifecycle ?? null })),
        );
        const key = normaliseMpn(mpn);
        how = { label: first.label, literal: first.part.mpn.trim().toUpperCase() === mpn.toUpperCase(), variant: normaliseMpn(first.part.mpn) !== key };
        stats.by[first.label] = (stats.by[first.label] ?? 0) + 1;
      }
    }
    if (!partId || !how) {
      stats.notFound++;
      stats.missing.push(mpn);
    } else {
      const method = how.variant ? "FUZZY" : how.literal ? "EXACT" : "NORMALISED";
      const confidence = how.variant ? 90 : how.literal ? 100 : 98;
      const reason = how.variant ? `Found at ${how.label} under its full ordering code` : `Found at ${how.label}`;
      await db.$transaction([
        db.bomLineMatch.updateMany({ where: { bomLineId: l.id }, data: { selected: false } }),
        db.bomLineMatch.upsert({
          where: { bomLineId_partId: { bomLineId: l.id, partId } },
          create: { bomLineId: l.id, partId, method, confidence, reason, selected: true },
          update: { selected: true, method, confidence, reason },
        }),
        db.bomLine.update({ where: { id: l.id }, data: { partId, needsReview: how.variant } }),
      ]);
      stats.found++;
    }
    await opts.onProgress?.(stats);
  }
  await scoreRevision(db, revisionId);
  return { ...stats, done: true };
}
