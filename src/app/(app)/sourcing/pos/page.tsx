import Link from "next/link";
import { db } from "@/lib/db";
import { formatMoney, isCurrency } from "@/lib/currency";
import { PO_STATUS } from "@/lib/procurement-labels";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";

export const metadata = { title: "PO drafts" };

export default async function PosPage() {
  const pos = await db.purchaseOrderDraft.findMany({
    orderBy: { createdAt: "desc" },
    include: { supplier: true, rfq: { select: { id: true, number: true } }, lines: { select: { qty: true, unitPrice: true } } },
  });
  return (
    <>
      <PageHeader title="Purchase-order drafts" description="Created from awarded RFQ lines. Approve, then send from your ERP or email — the app does not email suppliers." />
      <div className="overflow-hidden rounded-lg border bg-card">
        {pos.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2.5 font-normal">PO</th>
                  <th className="px-4 py-2.5 font-normal">Supplier</th>
                  <th className="px-4 py-2.5 font-normal">Status</th>
                  <th className="px-4 py-2.5 text-right font-normal">Lines</th>
                  <th className="px-4 py-2.5 text-right font-normal">Goods</th>
                  <th className="px-4 py-2.5 text-right font-normal">Landed (INR, net)</th>
                  <th className="px-4 py-2.5 font-normal">From</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pos.map((p) => {
                  const goods = p.lines.reduce((s, l) => s + l.qty * Number(l.unitPrice), 0);
                  const b = (p.costBreakdown ?? {}) as { netTotal?: number };
                  return (
                    <tr key={p.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5"><Link href={`/sourcing/pos/${p.id}`} className="num font-medium hover:underline">{p.number}</Link></td>
                      <td className="px-4 py-2.5">{p.supplier.name}</td>
                      <td className="px-4 py-2.5 text-xs"><span className="inline-flex items-center gap-1.5"><RiskDot level={PO_STATUS[p.status].level} />{PO_STATUS[p.status].label}</span></td>
                      <td className="num px-4 py-2.5 text-right">{p.lines.length}</td>
                      <td className="num px-4 py-2.5 text-right whitespace-nowrap">{isCurrency(p.currency) ? formatMoney(goods, p.currency) : `${goods.toFixed(2)} ${p.currency}`}</td>
                      <td className="num px-4 py-2.5 text-right whitespace-nowrap">{b.netTotal ? formatMoney(b.netTotal, "INR") : "—"}</td>
                      <td className="px-4 py-2.5 text-xs">{p.rfq ? <Link href={`/sourcing/rfqs/${p.rfq.id}`} className="num hover:underline">{p.rfq.number}</Link> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No PO drafts yet">Award lines on an RFQ, then create PO drafts.</EmptyState>
        )}
      </div>
    </>
  );
}
