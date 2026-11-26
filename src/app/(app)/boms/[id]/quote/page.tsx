import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoney, getActiveFx } from "@/lib/currency";
import { SCORE_KEYS, SCORE_LABEL } from "@/lib/bom/scores";
import { LIFECYCLE_LABEL } from "@/lib/risk";
import { analyseRevision } from "@/server/bom-pipeline";
import { ScorePill } from "@/components/data/badges";
import { PrintButton } from "@/components/data/print-button";

export const metadata = { title: "Quote" };

/** Print-friendly material quote — the browser's "Save as PDF" produces the PDF. */
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currency = await getDisplayCurrency();
  const a = await analyseRevision(db, id, currency);
  if (!a) notFound();
  const rev = a.revision;
  const fx = getActiveFx();
  const money = (n: number | null | undefined, unit = false) => (n === null || n === undefined ? "—" : formatMoney(n, currency, { unit }));
  const lines = a.lines.filter((l) => !l.dnp);
  const perBoard = a.totals.toBuyLanded / Math.max(1, rev.buildQty) + a.totals.fromStock / Math.max(1, rev.buildQty);

  return (
    <article className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/boms/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← Back to BoM</Link>
        <PrintButton />
      </div>
      <div className="rounded-xl border bg-card p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-6 border-b pb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{rev.bom.name} <span className="num text-base font-normal">rev {rev.revision}</span></h1>
            <div className="mt-1 text-sm text-muted-foreground">
              Material quote · {rev.bom.project.customer.name}
              {rev.bom.project.name.trim().toLowerCase() !== rev.bom.name.trim().toLowerCase() ? ` · ${rev.bom.project.name}` : ""}
            </div>
          </div>
          <dl className="num grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="font-sans text-muted-foreground">Build qty</dt>
            <dd className="text-right">{rev.buildQty.toLocaleString("en-IN")}</dd>
            <dt className="font-sans text-muted-foreground">Material / board</dt>
            <dd className="text-right font-medium">{money(perBoard)}</dd>
            <dt className="font-sans text-muted-foreground">To buy (landed)</dt>
            <dd className="text-right">{money(a.totals.toBuyLanded)}</dd>
            <dt className="font-sans text-muted-foreground">Date</dt>
            <dd className="text-right">{new Date().toISOString().slice(0, 10)}</dd>
          </dl>
        </header>
        <section className="flex flex-wrap gap-4 border-b py-4">
          {SCORE_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              {SCORE_LABEL[k]} <ScorePill score={a.scores?.[k] ?? null} />
            </div>
          ))}
        </section>
        <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-xs">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 pr-2 font-normal">#</th>
              <th className="py-1.5 pr-2 font-normal">MPN / manufacturer</th>
              <th className="py-1.5 pr-2 font-normal">RefDes</th>
              <th className="py-1.5 pr-2 text-right font-normal">Need</th>
              <th className="py-1.5 pr-2 font-normal">Lifecycle</th>
              <th className="py-1.5 pr-2 text-right font-normal">Landed unit</th>
              <th className="py-1.5 text-right font-normal">To buy</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l) => (
              <tr key={l.id} className="break-inside-avoid">
                <td className="num py-1.5 pr-2 text-muted-foreground">{l.lineNo}</td>
                <td className="py-1.5 pr-2"><span className="num font-medium">{l.part?.mpn ?? l.rawMpn ?? "—"}</span> <span className="text-muted-foreground">{l.part?.manufacturer.name ?? ""}</span></td>
                <td className="num max-w-40 truncate py-1.5 pr-2">{l.refDes}</td>
                <td className="num py-1.5 pr-2 text-right">{l.required.toLocaleString("en-IN")}</td>
                <td className="py-1.5 pr-2">{l.part ? LIFECYCLE_LABEL[l.part.lifecycle] : "not matched"}</td>
                <td className="num py-1.5 pr-2 text-right">{money(l.bestAuthorised?.landedUnit ?? null, true)}</td>
                <td className="num py-1.5 text-right">{l.toBuyLanded ? money(l.toBuyLanded) : "from stock"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Prices from distributor offers at {new Date().toISOString().slice(0, 10)}{lines.some((l) => l.part?.offers.some((o) => o.source === "mock")) ? " (includes simulated market data)" : ""}; landed cost includes freight, insurance and indicative customs duty, net of GST/IGST input credit. FX: USD ₹{fx.rates.USD?.toFixed(2)}, EUR ₹{fx.rates.EUR?.toFixed(2)} ({fx.source}). Valid 7 days, subject to stock.
        </p>
      </div>
    </article>
  );
}
