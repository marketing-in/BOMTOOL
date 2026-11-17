"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { SupplierKind } from "@prisma/client";
import { Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createRfq, removeCartItem, updateCartItem } from "@/app/(app)/sourcing/actions";
import { formatMoney, type Currency } from "@/lib/currency";
import { SUPPLIER_KIND_LABEL, SUPPLIER_TIER } from "@/lib/risk";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type SupplierChoice = { id: string; name: string; kind: SupplierKind; unit: number | null; stock: number; mock: boolean };
export type CartRow = {
  id: string;
  partId: string;
  mpn: string;
  manufacturer: string;
  description: string;
  qty: number;
  orderQty: number;
  supplierId: string | null;
  supplierName: string | null;
  supplierKind: SupplierKind | null;
  isBid: boolean;
  bidPrice: number | null;
  bidCurrency: string;
  excess: boolean;
  unit: number | null;
  landedUnit: number | null;
  landedTotal: number | null;
  duty: number;
  note: string | null;
  choices: SupplierChoice[];
};

const input =
  "num h-9 rounded-md border bg-background px-2 text-sm outline-none transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring";

export function CartEditor({
  rows,
  currency,
  suppliers,
  canRfq,
}: {
  rows: CartRow[];
  currency: Currency;
  suppliers: { id: string; name: string; kind: SupplierKind; country: string | null; preferred: boolean }[];
  canRfq: boolean;
}) {
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(suppliers.filter((s) => s.preferred).map((s) => s.id)));
  const [due, setDue] = useState(() => new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
  const [incoterm, setIncoterm] = useState("DAP, our factory");
  const [notes, setNotes] = useState("");

  const total = rows.reduce((s, r) => s + (r.landedTotal ?? 0), 0);
  const duty = rows.reduce((s, r) => s + r.duty, 0);
  const grouped = useMemo(() => {
    const m = new Map<string, CartRow[]>();
    for (const r of rows) m.set(r.supplierName ?? "No supplier chosen", [...(m.get(r.supplierName ?? "No supplier chosen") ?? []), r]);
    return [...m.entries()];
  }, [rows]);

  const run = (fn: () => Promise<{ error?: string; message?: string } | undefined>) =>
    start(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
      else if (res?.message) toast.success(res.message);
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {grouped.map(([supplier, items]) => (
          <section key={supplier} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4">
              <h2 className="text-sm font-semibold">{supplier}</h2>
              <span className="num text-sm font-semibold" title="Landed">{formatMoney(items.reduce((s, r) => s + (r.landedTotal ?? 0), 0), currency)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 font-normal">Part</th>
                    <th className="px-4 py-2 font-normal">Qty</th>
                    <th className="px-4 py-2 font-normal">Supplier</th>
                    <th className="px-4 py-2 text-right font-normal">Unit</th>
                    <th className="px-4 py-2 text-right font-normal">Landed / unit</th>
                    <th className="px-4 py-2 text-right font-normal">Landed total</th>
                    <th className="px-2 py-2"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-2.5">
                        <Link href={`/parts/${r.partId}`} className="num font-medium hover:underline">{r.mpn}</Link>
                        {r.isBid ? <span className="ml-2 rounded bg-risk-amber-soft px-1.5 py-0.5 text-[10px]">Bid {r.bidPrice} {r.bidCurrency}</span> : null}
                        <div className="text-xs text-muted-foreground">{r.manufacturer}</div>
                        {r.note ? <div className="mt-0.5 max-w-72 truncate text-xs text-muted-foreground" title={r.note}>{r.note}</div> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min={1}
                          defaultValue={r.qty}
                          aria-label={`Quantity for ${r.mpn}`}
                          className={`${input} w-24`}
                          onBlur={(e) => {
                            const q = Number(e.target.value);
                            if (q !== r.qty) run(() => updateCartItem(r.id, { qty: q }));
                          }}
                        />
                        {r.orderQty !== r.qty ? <div className="num mt-1 text-[11px] text-muted-foreground">orders {r.orderQty.toLocaleString("en-IN")} (MOQ/reel)</div> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.excess || r.isBid ? (
                          <span className="text-xs">{r.supplierName}</span>
                        ) : (
                          <select
                            aria-label={`Supplier for ${r.mpn}`}
                            value={r.supplierId ?? ""}
                            onChange={(e) => run(() => updateCartItem(r.id, { supplierId: e.target.value || null }))}
                            className={`${input} max-w-56`}
                          >
                            <option value="">Let the RFQ decide</option>
                            {r.choices.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                                {c.unit !== null ? ` · ${formatMoney(c.unit, currency, { unit: true })}` : ""}
                                {c.stock ? ` · ${c.stock.toLocaleString("en-IN")} in stock` : " · no stock"}
                                {c.mock ? " · mock" : ""}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="num px-4 py-2.5 text-right whitespace-nowrap">{r.unit === null ? "—" : formatMoney(r.unit, currency, { unit: true })}</td>
                      <td className="num px-4 py-2.5 text-right whitespace-nowrap">{r.landedUnit === null ? "—" : formatMoney(r.landedUnit, currency, { unit: true })}</td>
                      <td className="num px-4 py-2.5 text-right whitespace-nowrap">{r.landedTotal === null ? "—" : formatMoney(r.landedTotal, currency)}</td>
                      <td className="px-2 py-2">
                        <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${r.mpn}`} disabled={pending} onClick={() => run(() => removeCartItem(r.id))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border bg-card p-5" title="Net of GST/IGST input credit · indicative duty rates">
          <div className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{formatMoney(total, currency)}</div>
          <div className="mt-1.5 text-xs text-muted-foreground">Estimated landed total</div>
          <div className="num mt-3 text-xs text-muted-foreground">incl. {formatMoney(duty, currency)} duty</div>
        </div>

        {canRfq ? (
          <form
            className="space-y-4 rounded-xl border bg-card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createRfq({ supplierIds: [...chosen], dueDate: due, incoterm, notes }));
            }}
          >
            <h2 className="text-base font-semibold" title="All cart lines go to every supplier you tick; each one quotes what they can.">Request quotes</h2>
            <fieldset className="max-h-72 space-y-1 overflow-y-auto">
              <legend className="sr-only">Suppliers</legend>
              {[...suppliers]
                .sort((a, b) => SUPPLIER_TIER[a.kind] - SUPPLIER_TIER[b.kind] || a.name.localeCompare(b.name))
                .map((s) => (
                  <label key={s.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={chosen.has(s.id)}
                      onCheckedChange={(v) =>
                        setChosen((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(s.id);
                          else next.delete(s.id);
                          return next;
                        })
                      }
                    />
                    <span className="flex-1">{s.name}</span>
                    <span className="text-[11px] text-muted-foreground">{SUPPLIER_KIND_LABEL[s.kind]}</span>
                  </label>
                ))}
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="due">Reply by</Label>
                <input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${input} w-full`} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="incoterm">Delivery terms</Label>
                <input id="incoterm" value={incoterm} onChange={(e) => setIncoterm(e.target.value)} className={`${input} w-full`} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes to suppliers</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. CoC required, date code ≤ 2 years" />
            </div>
            <Button type="submit" className="h-10 w-full" disabled={pending || !chosen.size}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Create RFQ to {chosen.size} supplier{chosen.size === 1 ? "" : "s"}
            </Button>
          </form>
        ) : null}
      </aside>
    </div>
  );
}
