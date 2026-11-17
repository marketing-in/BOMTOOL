import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader, Section, EmptyState } from "@/components/data/page-header";
import { PriceListForm } from "@/components/sourcing/price-list-form";

export const metadata = { title: "Price lists" };

export default async function PriceListsPage() {
  const user = await requireUser();
  const [suppliers, feeds] = await Promise.all([
    db.supplier.findMany({ where: { kind: { notIn: ["INTERNAL_STOCK", "CONSIGNED"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true } }),
    db.offer.groupBy({ by: ["supplierId"], where: { source: "price-list" }, _count: { _all: true }, _max: { fetchedAt: true } }),
  ]);
  const names = new Map(suppliers.map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader title="Supplier price lists" />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {can(user.role, "sourcing.buy") ? (
          <PriceListForm suppliers={suppliers} />
        ) : (
          <p className="rounded-xl border bg-card px-5 py-6 text-sm text-muted-foreground">Only purchasing can import price lists.</p>
        )}
        <Section title="Loaded price lists">
          {feeds.length ? (
            <ul className="divide-y text-sm">
              {feeds.map((f) => (
                <li key={f.supplierId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span>{names.get(f.supplierId) ?? "Supplier"}</span>
                  <span className="num text-xs text-muted-foreground">{f._count._all} offers · {f._max.fetchedAt?.toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="None yet" />
          )}
        </Section>
      </div>
    </>
  );
}
