import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { convert } from "@/lib/currency";
import { getRfqComparison } from "@/server/procurement";
import { ensureFx } from "@/server/fx";
import { PageHeader } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { RfqWorkbench, type WorkbenchData } from "@/components/sourcing/rfq-workbench";
import { RFQ_STATUS } from "@/lib/procurement-labels";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `RFQ ${(await params).id.slice(-6)}` };
}

export default async function RfqPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const currency = await getDisplayCurrency();
  await ensureFx();
  const c = await getRfqComparison(id);
  if (!c) notFound();
  const { rfq, rows, supplierTotals } = c;
  const quoteBySupplier = new Map(rfq.quotes.map((q) => [q.supplierId, q]));

  const data: WorkbenchData = {
    rfqId: rfq.id,
    status: rfq.status,
    currency,
    editable: can(user.role, "rfq.send") && rfq.status !== "CLOSED",
    canPo: can(user.role, "sourcing.buy"),
    suppliers: rfq.suppliers
      .map((s) => {
        const q = quoteBySupplier.get(s.id);
        const t = supplierTotals.find((x) => x.supplierId === s.id);
        return {
          id: s.id,
          name: s.name,
          kind: s.kind,
          currency: q?.currency ?? s.currency,
          quoted: !!q,
          source: q?.source ?? null,
          receivedAt: q?.receivedAt.toISOString() ?? null,
          freight: q?.freight ? Number(q.freight) : null,
          lines: t?.lines ?? 0,
          awardedNet: convert(t?.awardedNet ?? 0, "INR", currency),
          allNet: convert(t?.allNet ?? 0, "INR", currency),
          hasPo: rfq.purchaseOrders.some((p) => p.supplierId === s.id),
        };
      })
      .sort((a, b) => Number(b.quoted) - Number(a.quoted) || a.name.localeCompare(b.name)),
    lines: rows.map((r) => ({
      id: r.line.id,
      partId: r.line.partId,
      mpn: r.line.part.mpn,
      manufacturer: r.line.part.manufacturer.name,
      qty: r.line.qty,
      target: r.line.targetPrice ? Number(r.line.targetPrice) : null,
      note: r.line.note,
      bestQuoteLineId: r.bestQuoteLineId,
      cells: r.cells.map((cell) => ({
        quoteLineId: cell.quoteLineId,
        supplierId: cell.supplierId,
        unit: cell.unit,
        currency: cell.currency,
        qtyOffered: cell.qtyOffered,
        leadTimeWeeks: cell.leadTimeWeeks,
        covers: cell.covers,
        awarded: cell.awarded,
        landedUnit: convert(cell.landed.netPerUnit, "INR", currency),
        landedTotal: convert(cell.landed.netTotal, "INR", currency),
        duty: convert(cell.landed.bcd + cell.landed.sws, "INR", currency),
        dutyAssumed: cell.landed.dutyAssumed,
        domestic: cell.landed.domestic,
        condition: cell.condition,
        coc: cell.coc,
        dateCode: cell.dateCode,
      })),
    })),
    pos: rfq.purchaseOrders.map((p) => ({ id: p.id, number: p.number })),
  };

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/sourcing/rfqs" className="hover:text-foreground">RFQs</Link>}
        title={<span className="num">{rfq.number}</span>}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><RiskDot level={RFQ_STATUS[rfq.status].level} />{RFQ_STATUS[rfq.status].label}</span>
            <span>reply by <span className="num">{rfq.dueDate?.toISOString().slice(0, 10) ?? "—"}</span></span>
            <span>{rfq.incoterm}</span>
            <span>by {rfq.createdBy.name}</span>
          </span>
        }
      />
      {rfq.notes ? <p className="-mt-3 mb-5 max-w-[75ch] text-sm text-muted-foreground">“{rfq.notes}”</p> : null}
      <RfqWorkbench data={data} />
    </>
  );
}
