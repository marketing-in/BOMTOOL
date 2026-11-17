import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { RFQ_STATUS } from "@/lib/procurement-labels";

export const metadata = { title: "RFQs" };


export default async function RfqsPage() {
  const rfqs = await db.rfq.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } }, _count: { select: { lines: true, quotes: true, suppliers: true, purchaseOrders: true } } },
  });
  return (
    <>
      <PageHeader title="RFQs" />
      <div className="overflow-hidden rounded-xl border bg-card">
        {rfqs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2.5 font-normal">RFQ</th>
                  <th className="px-4 py-2.5 font-normal">Status</th>
                  <th className="px-4 py-2.5 text-right font-normal">Lines</th>
                  <th className="px-4 py-2.5 text-right font-normal">Quotes</th>
                  <th className="px-4 py-2.5 font-normal">Reply by</th>
                  <th className="px-4 py-2.5 font-normal">Buyer</th>
                  <th className="px-4 py-2.5 text-right font-normal">POs</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rfqs.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5"><Link href={`/sourcing/rfqs/${r.id}`} className="num font-medium hover:underline">{r.number}</Link></td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="inline-flex items-center gap-1.5"><RiskDot level={RFQ_STATUS[r.status].level} />{RFQ_STATUS[r.status].label}</span>
                    </td>
                    <td className="num px-4 py-2.5 text-right">{r._count.lines}</td>
                    <td className="num px-4 py-2.5 text-right">{r._count.quotes}/{r._count.suppliers}</td>
                    <td className="num px-4 py-2.5 text-xs">{r.dueDate?.toISOString().slice(0, 10) ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.createdBy.name}</td>
                    <td className="num px-4 py-2.5 text-right">{r._count.purchaseOrders || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No RFQs yet">Create one from the <Link href="/sourcing/cart" className="underline">cart</Link>.</EmptyState>
        )}
      </div>
    </>
  );
}
