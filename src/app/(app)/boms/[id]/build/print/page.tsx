import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, isCurrency, type Currency } from "@/lib/currency";
import { getBuild } from "@/server/build";
import type { QtyQuote } from "@/lib/costing/quote";
import { PrintButton } from "@/components/data/print-button";

export const metadata = { title: "Quotation" };

type Snapshot = {
  quantities: number[];
  quotes: QtyQuote[];
  board: { name: string | null; technology: string; facts: { widthMm: number; heightMm: number; layers: number; thicknessMm: number; finish: string } };
  box: { label: string; mpn: string; ipRating: string | null } | null;
  leadDays: number;
  rates: { gstPct: number; chargeMoqExcess: boolean };
  fx: { asOf: string; source: string; USD: number | null; EUR: number | null };
  product: { name: string; partNumber: string | null; revision: string; customer: string } | null;
  title: string;
};

/** The quote as the client sees it: prices only, no costs or margins. Print or Save as PDF from the browser. */
export default async function QuotePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { q } = await searchParams;
  const row = q ? await db.customerQuote.findUnique({ where: { id: q } }) : null;
  if (q && (!row || row.revisionId !== id)) notFound();

  let snap: Snapshot;
  let currency: Currency = "INR";
  if (row?.status === "ISSUED" && row.snapshot) {
    snap = row.snapshot as unknown as Snapshot;
    currency = isCurrency(row.currency) ? row.currency : "INR";
  } else {
    const b = await getBuild(id);
    if (!b) notFound();
    currency = b.draft?.currency ?? "INR";
    snap = {
      quantities: b.quantities,
      quotes: b.quotes,
      board: { name: b.board.chosenName, technology: b.board.technology.name, facts: b.board.facts },
      box: b.box.chosen ? { label: b.box.chosen.spec.label, mpn: b.box.chosen.spec.mpn, ipRating: b.box.chosen.ipRating } : null,
      leadDays: b.leadDays,
      rates: b.rates,
      fx: { asOf: b.fx.asOf, source: b.fx.source, USD: b.fx.rates.USD ?? null, EUR: b.fx.rates.EUR ?? null },
      product: b.product,
      title: b.title,
    };
  }
  const draft = !row || row.status !== "ISSUED";
  const meta = row ?? (await db.customerQuote.findFirst({ where: { revisionId: id, status: "DRAFT" }, orderBy: { createdAt: "desc" } }));
  const validDays = meta?.validDays ?? 30;
  const issuedAt = row?.issuedAt ?? new Date();
  const validUntil = new Date(issuedAt.getTime() + validDays * 86_400_000);
  // INR → the client's currency at the rate the quote was made with.
  const rate = currency === "INR" ? 1 : (snap.fx[currency] ?? null);
  const money = (inr: number, unit = false) => (rate ? formatMoney(inr / rate, currency, { unit }) : formatMoney(inr, "INR", { unit }));
  const company = { name: process.env.COMPANY_NAME, address: process.env.COMPANY_ADDRESS, gstin: process.env.COMPANY_GSTIN, email: process.env.COMPANY_EMAIL };
  const date = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const f = snap.board.facts;
  const nre = snap.quotes[0]?.nre ?? [];

  return (
    <article className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/boms/${id}/build/quote`} className="text-sm text-muted-foreground hover:text-foreground">← Back to the quote</Link>
        <span className="flex items-center gap-3">
          {!company.name ? <span className="text-xs text-muted-foreground">Set COMPANY_NAME, COMPANY_ADDRESS and COMPANY_GSTIN in .env for your letterhead.</span> : null}
          <PrintButton />
        </span>
      </div>
      <div className="rounded-xl border bg-card p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-6 border-b pb-6">
          <div className="text-sm">
            {company.name ? <div className="text-lg font-semibold tracking-tight">{company.name}</div> : null}
            {company.address ? <div className="whitespace-pre-line text-muted-foreground">{company.address}</div> : null}
            {company.gstin ? <div className="num text-muted-foreground">GSTIN {company.gstin}</div> : null}
            {company.email ? <div className="text-muted-foreground">{company.email}</div> : null}
          </div>
          <div className="text-right">
            <h1 className="text-lg font-semibold">Quotation</h1>
            <div className="num text-2xl font-semibold tracking-tight">{row?.number ?? "DRAFT"}</div>
            <div className="text-sm text-muted-foreground">{date(issuedAt)} · valid until {date(validUntil)}</div>
            {draft ? <div className="mt-1 text-xs font-medium text-risk-amber">Draft — not issued</div> : null}
          </div>
        </header>

        <section className="grid gap-6 border-b py-5 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">For</div>
            <div className="font-medium">{snap.product?.customer ?? "—"}</div>
            <div className="mt-3 text-xs text-muted-foreground">Product</div>
            <div className="font-medium">{snap.product?.name ?? snap.title}</div>
            <div className="num text-muted-foreground">{snap.product?.partNumber ? `${snap.product.partNumber} · ` : ""}rev {snap.product?.revision}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Scope</div>
            <ul className="mt-1 space-y-1">
              <li>Bare board: {snap.board.technology}{snap.board.technology.includes(`${f.layers} layers`) ? "" : `, ${f.layers} layers`}, {f.widthMm.toFixed(1)} × {f.heightMm.toFixed(1)} mm, {f.thicknessMm} mm, {f.finish}</li>
              <li>Components: sourcing, incoming inspection, SMT and through-hole assembly to IPC-A-610 class 2</li>
              <li>{snap.box ? `Enclosure: ${snap.box.label}${snap.box.ipRating ? ` (${snap.box.ipRating})` : ""}, box build and test` : "Board only — no enclosure"}</li>
              <li>Packing in ESD bags and cartons</li>
            </ul>
          </div>
        </section>

        <div className="mt-5 overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3 font-normal">Quantity</th>
              <th className="py-2 pr-3 text-right font-normal">Unit price</th>
              <th className="py-2 pr-3 text-right font-normal">Lot price</th>
              <th className="py-2 pr-3 text-right font-normal">One-off costs</th>
              <th className="py-2 pr-3 text-right font-normal">GST {snap.rates.gstPct} %</th>
              <th className="py-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {snap.quotes.map((x) => (
              <tr key={x.qty} className="break-inside-avoid">
                <td className="num py-2.5 pr-3">{x.qty.toLocaleString("en-IN")} pcs</td>
                <td className="num py-2.5 pr-3 text-right font-medium">{money(x.unitPrice, true)}</td>
                <td className="num py-2.5 pr-3 text-right">{money(x.lotPrice)}</td>
                <td className="num py-2.5 pr-3 text-right">{money(x.nreTotal)}</td>
                <td className="num py-2.5 pr-3 text-right">{money(x.gst)}</td>
                <td className="num py-2.5 text-right font-medium">{money(x.total)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>

        {nre.length ? (
          <section className="mt-5 text-sm">
            <h2 className="text-xs text-muted-foreground">One-off costs, charged once per design</h2>
            <ul className="mt-1.5 grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {nre.map((n) => (
                <li key={n.key} className="flex justify-between gap-3">
                  <span>{n.label}</span>
                  <span className="num">{money(n.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-6 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          <p><span className="text-foreground">Delivery:</span> about {Math.ceil(snap.leadDays / 7)} weeks after the purchase order, subject to component availability at the time of order.</p>
          <p className="mt-1">
            Prices are ex-works, per board, excluding GST unless shown. Component prices reflect the market on {date(issuedAt)}; parts bought in minimum or reel quantities beyond the need are{" "}
            {snap.rates.chargeMoqExcess ? "included in the price and delivered with the order" : "not charged"}. Customer-consigned parts are not charged.
            {currency !== "INR" && rate ? ` Converted from INR at ₹${rate.toFixed(2)} per ${currency} (${snap.fx.source}, ${snap.fx.asOf.slice(0, 10)}).` : ""}
          </p>
          {meta?.notes ? <p className="mt-2 text-foreground">{meta.notes}</p> : null}
        </section>
      </div>
    </article>
  );
}
