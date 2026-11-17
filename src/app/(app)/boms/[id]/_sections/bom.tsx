import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardCheck, Download, PackageX, ShoppingCart, Warehouse } from "lucide-react";
import { RefreshButton } from "@/components/sourcing/refresh-button";
import { AddShortagesButton } from "@/components/sourcing/cart-buttons";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoneyCompact } from "@/lib/currency";
import { SCORE_HELP, SCORE_KEYS, SCORE_LABEL } from "@/lib/bom/scores";
import { analyseRevision } from "@/server/bom-pipeline";
import { bestOffer } from "@/lib/pricing";
import { PageHeader, Stat } from "@/components/data/page-header";
import { ScorePill } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BomGrid } from "@/components/bom/bom-grid";
import { BomMoreMenu } from "@/components/bom/bom-more-menu";
import { revisionImpact } from "@/server/bom-delete";
import { BuildQtyForm } from "@/components/bom/build-qty-form";
import type { GridRow } from "@/components/bom/types";


export default async function BomSection({ id }: { id: string }) {
  const user = await requireUser();
  const currency = await getDisplayCurrency();
  const a = await analyseRevision(db, id, currency);
  if (!a) notFound();
  if (a.revision.status === "DRAFT") redirect(`/boms/${id}/map`);
  const { revision: rev, lines, scores, totals } = a;
  const editable = can(user.role, "bom.write");
  const impact = editable ? await revisionImpact(db, id) : null;
  const partIds = [...new Set(lines.map((l) => l.partId).filter((x): x is string => !!x))];
  const recorded = partIds.length
    ? await db.alternate.findMany({
        where: { partId: { in: partIds }, altPart: { lifecycle: { notIn: ["EOL", "OBSOLETE"] } } },
        orderBy: [{ confidence: "desc" }],
        include: {
          altPart: {
            select: {
              mpn: true,
              manufacturer: { select: { name: true } },
              offers: { select: { supplierId: true, currency: true, stock: true, moq: true, priceBreaks: true } },
              inventoryLots: { select: { qty: true, reservedQty: true } },
            },
          },
        },
      })
    : [];
  const altsFor = new Map<string, GridRow["alternates"]>();
  for (const a of recorded) {
    const list = altsFor.get(a.partId) ?? [];
    if (list.length >= 4) continue;
    list.push({
      partId: a.altPartId,
      mpn: a.altPart.mpn,
      manufacturer: a.altPart.manufacturer.name,
      type: a.type,
      confidence: a.confidence,
      approved: !!a.approvedAt,
      stock: a.altPart.inventoryLots.reduce((s, l) => s + l.qty - l.reservedQty, 0) + a.altPart.offers.reduce((s, o) => s + o.stock, 0),
      bestUnit: bestOffer(a.altPart.offers, 1000, currency)?.unit ?? null,
    });
    altsFor.set(a.partId, list);
  }

  const rows: GridRow[] = lines.map((l) => {
    const p = l.part;
    return {
      id: l.id,
      lineNo: l.lineNo,
      rawMpn: l.rawMpn,
      partId: l.partId,
      partMpn: p?.mpn ?? null,
      manufacturer: p?.manufacturer.name ?? null,
      rawManufacturer: l.rawManufacturer,
      description: p?.description ?? l.rawDescription ?? l.rawValue,
      refDes: l.refDes,
      qtyPerBoard: l.qtyPerBoard,
      required: l.required,
      attritionPct: l.attritionPct,
      dnp: l.dnp,
      needsReview: l.needsReview,
      issues: l.issues,
      condition: l.chosen?.condition ?? null,
      moq: l.bestAuthorised?.moq ?? null,
      spq: l.bestAuthorised?.spq ?? null,
      priceBreaks: l.bestAuthorised?.breaks ?? [],
      lastUpdated: l.lastUpdated?.toISOString() ?? null,
      totalStock: l.totalStock,
      internalQty: l.internalQty,
      partnerQty: l.partnerQty,
      excessQty: l.excessQty,
      distributors: l.authorisedSources,
      mfrLeadWeeks: p?.mfrLeadTimeWeeks ?? null,
      factoryLeadWeeks: l.factoryLeadWeeks,
      bestUnit: l.bestAuthorised?.unit ?? null,
      bestSupplier: l.bestAuthorised?.supplier ?? null,
      landedUnit: [...l.allocations].filter((x) => x.tier >= 3).sort((x, y) => y.qty - x.qty)[0]?.landedUnit ?? l.bestAuthorised?.landedUnit ?? null,
      plan: l.allocations.map((x) => ({ tier: x.tier, kind: x.kind, source: x.source, qty: x.qty, orderQty: x.orderQty, unit: x.unit, landedUnit: x.landedUnit })),
      shortfall: l.shortfall,
      toBuyCost: l.toBuyCost,
      toBuyLanded: l.toBuyLanded,
      mock: !!p?.offers.some((o) => o.source === "mock"),
      cart: (() => {
        if (!p || l.dnp) return null;
        const ext = l.allocations.filter((x) => x.tier >= 3);
        const qty = ext.reduce((s, x) => s + x.orderQty, 0) + l.shortfall;
        if (!qty) return null;
        const main = [...ext].sort((x, y) => y.qty - x.qty)[0];
        return {
          partId: p.id,
          qty,
          supplierId: main?.supplierId ?? l.bestAuthorised?.supplierId ?? null,
          offerId: main?.offerId ?? l.bestAuthorised?.offerId ?? null,
          excessListingId: main?.excessListingId ?? null,
          bomLineId: l.id,
        };
      })(),
      excess: (() => {
        const e = p?.excessListings.filter((x) => x.acceptsBids).sort((a, b) => b.qty - a.qty)[0];
        if (!e || l.dnp) return null;
        return { excessListingId: e.id, supplierId: e.supplierId, qty: Math.min(e.qty, Math.max(l.required - l.internalQty, 1)), askPrice: e.askPrice ? Number(e.askPrice) : null, currency: e.currency };
      })(),
      lifecycle: p?.lifecycle ?? null,
      rohs: p?.rohs ?? null,
      reach: p?.reach ?? null,
      hsn: p?.hsnCode ?? null,
      coc: l.chosen ? l.chosen.coc : null,
      scores: l.scores,
      candidates: l.matches.map((m) => ({
        partId: m.partId,
        mpn: m.part.mpn,
        manufacturer: m.part.manufacturer.name,
        method: m.method,
        confidence: m.confidence,
        reason: m.reason,
        selected: m.selected,
      })),
      alternates: l.partId ? (altsFor.get(l.partId) ?? []) : [],
    };
  });

  return (
    <>
      <PageHeader level={2}
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{rev.bom.project.customer.name}</span>
            <span aria-hidden>/</span>
            <span>{rev.bom.project.name}</span>
          </span>
        }
        title={
          <span className="flex flex-wrap items-baseline gap-x-3">
            {rev.bom.name}
            <span className="flex gap-1 text-sm font-normal">
              {rev.bom.revisions.map((r) => (
                <Link
                  key={r.id}
                  href={`/boms/${r.id}`}
                  aria-current={r.id === rev.id ? "page" : undefined}
                  className={`num rounded px-1.5 py-0.5 ${r.id === rev.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  rev {r.revision}
                </Link>
              ))}
            </span>
          </span>
        }
        description={
          <>
            <span className="num">{rev.sourceFileName}</span> · {lines.length} lines · {totals.placementsPerBoard} placements per board
          </>
        }
        actions={
          editable ? (
            <>
              {can(user.role, "sourcing.buy") ? (
                <>
                  <RefreshButton scope={{ revisionId: rev.id, label: `${rev.bom.name} rev ${rev.revision}` }} />
                  <AddShortagesButton revisionId={rev.id} label="Add shortages to cart" variant="outline" tall />
                </>
              ) : null}
              <Button asChild variant="outline" className="h-10">
                <a href={`/boms/${rev.id}/export`} download><Download className="size-4" /> Excel</a>
              </Button>
              <BomMoreMenu revisionId={rev.id} bomId={rev.bomId} canCompare={rev.bom.revisions.length > 1} impact={impact} />
            </>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {SCORE_KEYS.map((k) => (
          <Tooltip key={k}>
            <TooltipTrigger asChild>
              <div tabIndex={0} className="rounded-lg border bg-card px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{SCORE_LABEL[k]}</span>
                  <ScorePill score={scores?.[k] ?? null} />
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${(scores?.[k] ?? 0) >= 70 ? "bg-risk-green" : (scores?.[k] ?? 0) >= 40 ? "bg-risk-amber" : "bg-risk-red"}`}
                    style={{ width: `${scores?.[k] ?? 0}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{SCORE_HELP[k]}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 rounded-lg border bg-card px-4 py-3.5 lg:col-span-1">
          <div className="text-xs text-muted-foreground">Build quantity</div>
          <BuildQtyForm revisionId={rev.id} value={rev.buildQty} disabled={!editable} />
        </div>
        <Stat icon={ShoppingCart} label="To buy, landed" value={formatMoneyCompact(totals.toBuyLanded, currency)} hint={`Goods ${formatMoneyCompact(totals.toBuy, currency)} + freight & duty, net of GST credit`} />
        <Stat icon={Warehouse} label="Covered from our stock" value={formatMoneyCompact(totals.fromStock, currency)} hint="Internal + consigned, at book cost" />
        <Stat icon={PackageX} tone={totals.shortLines ? "red" : "green"} label="Short lines" value={totals.shortLines} hint="Not enough stock anywhere" />
        <Stat icon={ClipboardCheck} tone={totals.needsReview + totals.unmatched ? "amber" : "green"} label="Needs review" value={totals.needsReview + totals.unmatched} hint={`${totals.unmatched} unmatched · ${totals.needsReview} to confirm`} />
      </div>

      <BomGrid rows={rows} currency={currency} editable={editable} canBuy={can(user.role, "sourcing.buy")} />
    </>
  );
}
