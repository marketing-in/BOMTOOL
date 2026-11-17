import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { convert, formatMoney, isCurrency } from "@/lib/currency";
import { readServices, servicesTotal, suggestServices } from "@/lib/order-services";
import { PoServices } from "@/components/sourcing/po-services";
import { PO_STATUS } from "@/lib/procurement-labels";
import { PageHeader } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { PoActions } from "@/components/sourcing/po-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const po = await db.purchaseOrderDraft.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: po?.number ?? "PO" };
}

export default async function PoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const po = await db.purchaseOrderDraft.findUnique({
    where: { id },
    include: {
      supplier: true,
      rfq: { select: { id: true, number: true, incoterm: true } },
      lines: { include: { part: { include: { manufacturer: true } }, quoteLine: true }, orderBy: { part: { mpn: "asc" } } },
    },
  });
  if (!po) notFound();
  const fmt = (n: number, unit = false) => (isCurrency(po.currency) ? formatMoney(n, po.currency, { unit }) : `${n.toFixed(unit ? 4 : 2)} ${po.currency}`);
  const goods = po.lines.reduce((s, l) => s + l.qty * Number(l.unitPrice), 0);
  const b = (po.costBreakdown ?? {}) as Record<string, number>;
  const services = readServices(po.services);
  const goodsInr = convert(goods, po.currency, "INR");
  const creator = po.createdById ? await db.user.findUnique({ where: { id: po.createdById }, select: { name: true } }) : null;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          eyebrow={<Link href="/sourcing/pos" className="hover:text-foreground">PO drafts</Link>}
          title={<span className="num">{po.number}</span>}
          description={<span className="inline-flex items-center gap-1.5"><RiskDot level={PO_STATUS[po.status].level} />{PO_STATUS[po.status].label}</span>}
          actions={<PoActions poId={po.id} status={po.status} canApprove={can(user.role, "admin.users")} canEdit={can(user.role, "sourcing.buy")} />}
        />
      </div>

      <article className="rounded-xl border bg-card p-6 print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-6 border-b pb-5">
          <div>
            <div className="text-xs text-muted-foreground">Purchase order (draft)</div>
            <div className="text-3xl leading-tight font-semibold tracking-tight tabular-nums">{po.number}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {po.createdAt.toISOString().slice(0, 10)}
              {po.rfq ? <> · from <span className="num">{po.rfq.number}</span></> : null}
              {creator ? <> · {creator.name}</> : null}
            </div>
          </div>
          <div className="text-sm">
            <div className="text-xs text-muted-foreground">Supplier</div>
            <div className="font-medium">{po.supplier.name}</div>
            <div className="text-muted-foreground">{po.supplier.country ?? ""} · {po.supplier.contactEmail ?? po.supplier.website ?? ""}</div>
            <div className="mt-2 text-xs text-muted-foreground">Delivery terms</div>
            <div>{po.rfq?.incoterm ?? "—"}</div>
          </div>
        </header>

        <table className="mt-5 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3 font-normal">#</th>
              <th className="py-2 pr-3 font-normal">MPN</th>
              <th className="py-2 pr-3 font-normal">Manufacturer</th>
              <th className="py-2 pr-3 font-normal">Description</th>
              <th className="py-2 pr-3 text-right font-normal">Qty</th>
              <th className="py-2 pr-3 text-right font-normal">Unit</th>
              <th className="py-2 pr-3 text-right font-normal">Amount</th>
              <th className="py-2 text-right font-normal">LT</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {po.lines.map((l, i) => (
              <tr key={l.id}>
                <td className="num py-2 pr-3 text-muted-foreground">{i + 1}</td>
                <td className="num py-2 pr-3 font-medium">{l.part.mpn}</td>
                <td className="py-2 pr-3">{l.part.manufacturer.name}</td>
                <td className="max-w-64 py-2 pr-3 text-xs text-muted-foreground">{l.part.description}</td>
                <td className="num py-2 pr-3 text-right">{l.qty.toLocaleString("en-IN")}</td>
                <td className="num py-2 pr-3 text-right whitespace-nowrap">{fmt(Number(l.unitPrice), true)}</td>
                <td className="num py-2 pr-3 text-right whitespace-nowrap">{fmt(l.qty * Number(l.unitPrice))}</td>
                <td className="num py-2 text-right text-xs">{l.leadTimeWeeks ? `${l.leadTimeWeeks} wk` : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td colSpan={6} className="py-2 pr-3 text-right text-sm font-medium">Goods total</td>
              <td className="num py-2 pr-3 text-right font-medium whitespace-nowrap">{fmt(goods)}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        {b.total ? (
          <section className="mt-6 max-w-md border-t pt-5 text-sm print:break-inside-avoid">
            <h2 className="mb-3 text-sm font-semibold" title="Indicative duty rates">Estimated landed cost, INR</h2>
            <dl className="num space-y-1">
              {[
                ["Goods", b.goods],
                ["Freight", b.freight],
                ["Insurance", b.insurance],
                ["Basic customs duty", b.bcd],
                ["Social welfare surcharge", b.sws],
                ["IGST (input credit)", b.igst],
                ["GST (input credit)", b.gst],
              ]
                .filter(([, v]) => Number(v) > 0)
                .map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{formatMoney(Number(v), "INR")}</dd>
                  </div>
                ))}
              <div className="flex justify-between gap-4 border-t pt-1 font-medium">
                <dt>Cash out</dt>
                <dd>{formatMoney(b.total, "INR")}</dd>
              </div>
              <div className="flex justify-between gap-4 font-medium">
                <dt>Cost after input credit</dt>
                <dd>{formatMoney(b.netTotal, "INR")}</dd>
              </div>
            </dl>
          </section>
        ) : null}
        <section className="mt-6 border-t pt-5 text-sm print:break-inside-avoid" aria-labelledby="services">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="services" className="text-sm font-semibold" title="Transport, finance, storage, test">Order services, INR</h2>
            {services.length ? (
              <span className="num font-medium">
                Order total {formatMoney((b.total ?? goodsInr) + servicesTotal(services), "INR")}
                <span className="font-normal text-muted-foreground"> = {b.total ? "landed cash out" : "goods"} + services</span>
              </span>
            ) : null}
          </div>
          <PoServices poId={po.id} initial={services} suggest={suggestServices({ supplierKind: po.supplier.kind, country: po.supplier.country })} editable={po.status === "DRAFT" && can(user.role, "sourcing.buy")} />
          {!services.length && po.status !== "DRAFT" ? <p className="text-muted-foreground">None booked.</p> : null}
        </section>
        <p className="mt-6 text-xs text-muted-foreground">Draft generated by EMS Sourcing. Prices per the supplier’s quote; CoC required with each lot. Not valid until approved.</p>
      </article>
    </>
  );
}
