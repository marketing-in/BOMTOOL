import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { convert, priceAtQty } from "@/lib/currency";
import { readBreaks } from "@/lib/pricing";
import { landedCost } from "@/lib/landed-cost";
import { purchaseQty } from "@/lib/bom/buildqty";
import { FALLBACK_DUTY, loadDutyRates } from "@/server/bom-pipeline";
import { ensureFx } from "@/server/fx";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { CartEditor, type CartRow, type SupplierChoice } from "@/components/sourcing/cart-editor";

export const metadata = { title: "Cart" };

export default async function CartPage() {
  const user = await requireUser();
  const currency = await getDisplayCurrency();
  await ensureFx();
  const cart = await db.cart.findFirst({
    where: { userId: user.id, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          supplier: true,
          part: { include: { manufacturer: true, offers: { include: { supplier: true } }, excessListings: { include: { supplier: true } } } },
        },
      },
    },
  });
  const rates = await loadDutyRates(db);

  const rows: CartRow[] = (cart?.items ?? []).map((it) => {
    const p = it.part;
    // Price the line from the chosen supplier: excess ask, bid, or that supplier's offer at the order qty.
    const excess = it.excessListingId ? p.excessListings.find((e) => e.id === it.excessListingId) : undefined;
    const offers = p.offers.filter((o) => o.supplierId === it.supplierId);
    let native: number | null = null;
    let cur = "INR";
    let orderQty = it.qty;
    if (it.isBid && it.bidPrice) {
      native = Number(it.bidPrice);
      cur = it.currency;
    } else if (excess?.askPrice) {
      native = Number(excess.askPrice);
      cur = excess.currency;
    } else if (offers.length) {
      const o = [...offers].sort((a, b) => Number(b.stock >= it.qty) - Number(a.stock >= it.qty))[0];
      orderQty = purchaseQty(it.qty, o.moq, o.spq);
      native = priceAtQty(readBreaks(o.priceBreaks), orderQty);
      cur = o.currency;
    }
    const supplier = it.supplier ?? excess?.supplier ?? null;
    const lc =
      native !== null && supplier
        ? landedCost({ unitPrice: native, currency: cur, qty: orderQty, originCountry: supplier.country, hsn: p.hsnCode, rates, freightPct: Number(supplier.freightPct), fallback: FALLBACK_DUTY })
        : null;
    const choices: SupplierChoice[] = [
      ...new Map(
        p.offers
          .filter((o) => o.stock > 0 || o.supplierId === it.supplierId)
          .map((o) => {
            const q = purchaseQty(it.qty, o.moq, o.spq);
            const u = priceAtQty(readBreaks(o.priceBreaks), q);
            return [o.supplierId, { id: o.supplierId, name: o.supplier.name, kind: o.supplier.kind, unit: u === null ? null : convert(u, o.currency, currency), stock: o.stock, mock: o.source === "mock" }] as const;
          }),
      ).values(),
    ].sort((a, b) => (a.unit ?? Infinity) - (b.unit ?? Infinity));
    return {
      id: it.id,
      partId: p.id,
      mpn: p.mpn,
      manufacturer: p.manufacturer.name,
      description: p.description,
      qty: it.qty,
      orderQty,
      supplierId: it.supplierId,
      supplierName: supplier?.name ?? null,
      supplierKind: supplier?.kind ?? null,
      isBid: it.isBid,
      bidPrice: it.bidPrice ? Number(it.bidPrice) : null,
      bidCurrency: it.currency,
      excess: !!excess,
      unit: native === null ? null : convert(native, cur, currency),
      landedUnit: lc ? convert(lc.netPerUnit, "INR", currency) : null,
      landedTotal: lc ? convert(lc.netTotal, "INR", currency) : null,
      duty: lc && !lc.domestic ? convert(lc.bcd + lc.sws, "INR", currency) : 0,
      note: it.note,
      choices,
    };
  });

  // Suppliers worth asking: everyone with offers for these parts, plus excess partners on bid lines.
  const supplierIds = new Set<string>();
  for (const it of cart?.items ?? []) {
    for (const o of it.part.offers) if (o.supplier.kind !== "BROKER" || it.supplierId === o.supplierId) supplierIds.add(o.supplierId);
    if (it.supplierId) supplierIds.add(it.supplierId);
  }
  const suppliers = await db.supplier.findMany({ where: { id: { in: [...supplierIds] } }, orderBy: { name: "asc" } });
  const preferred = new Set((cart?.items ?? []).map((i) => i.supplierId).filter(Boolean) as string[]);

  return (
    <>
      <PageHeader title="Cart" />
      {rows.length ? (
        <CartEditor
          rows={rows}
          currency={currency}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, kind: s.kind, country: s.country, preferred: preferred.has(s.id) }))}
          canRfq={can(user.role, "rfq.send")}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <EmptyState title="Your cart is empty">
            Add shortages from a <Link href="/boms" className="underline">BoM</Link>, or parts from a part page.
          </EmptyState>
        </div>
      )}
    </>
  );
}
