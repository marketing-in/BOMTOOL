"use client";

import { useMemo, useState } from "react";
import { formatMoney, type FxTable } from "@/lib/currency";
import { landedCost, type DutyRate } from "@/lib/landed-cost";
import { Label } from "@/components/ui/label";

const field = "num h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function LandedCalculator({
  rates,
  fx,
  suppliers,
}: {
  rates: DutyRate[];
  fx: FxTable;
  suppliers: { id: string; name: string; country: string | null; currency: string; freightPct: number }[];
}) {
  const [price, setPrice] = useState("0.50");
  const [currency, setCurrency] = useState("USD");
  const [qty, setQty] = useState("1000");
  const [country, setCountry] = useState("US");
  const [hsn, setHsn] = useState("85423100");
  const [freight, setFreight] = useState("3");

  const result = useMemo(() => {
    const p = Number(price);
    const q = Number(qty);
    if (!(p >= 0) || !(q > 0) || !fx.rates[currency]) return null;
    return landedCost({ unitPrice: p, currency, qty: q, originCountry: country, hsn, rates, freightPct: Number(freight) || 0, fx, fallback: { prefix: "", bcdPct: 10, swsPct: 10, igstPct: 18 } });
  }, [price, currency, qty, country, hsn, freight, rates, fx]);

  const rows: [string, number][] = result
    ? result.domestic
      ? [["Goods", result.goods], ["Freight", result.freight], ["GST 18 % (input credit)", result.gst]]
      : [
          ["Goods (FOB)", result.goods],
          ["Freight", result.freight],
          ["Insurance 1.125 %", result.insurance],
          ["Assessable value (CIF)", result.assessableValue],
          [`Basic customs duty ${result.duty?.bcdPct ?? 0} %`, result.bcd],
          ["Social welfare surcharge", result.sws],
          [`IGST ${result.duty?.igstPct ?? 18} % (input credit)`, result.igst],
        ]
    : [];

  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Start from a supplier</Label>
          <select
            className={`${field} font-sans`}
            defaultValue=""
            onChange={(e) => {
              const s = suppliers.find((x) => x.id === e.target.value);
              if (!s) return;
              setCountry(s.country ?? "US");
              setCurrency(s.currency);
              setFreight(String(s.freightPct));
            }}
          >
            <option value="">Choose…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.country ?? "?"}, {s.currency})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="lc-price">Unit price</Label>
            <input id="lc-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={field} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-cur">Currency</Label>
            <select id="lc-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
              {Object.keys(fx.rates).sort().map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="lc-qty">Quantity</Label>
            <input id="lc-qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className={field} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-country">Ships from (ISO)</Label>
            <input id="lc-country" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))} className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="lc-hsn">HSN code</Label>
            <input id="lc-hsn" value={hsn} onChange={(e) => setHsn(e.target.value)} inputMode="numeric" className={field} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lc-freight">Freight % of goods</Label>
            <input id="lc-freight" value={freight} onChange={(e) => setFreight(e.target.value)} inputMode="decimal" className={field} />
          </div>
        </div>
      </div>

      <div className="rounded-md bg-muted/40 p-4">
        {result ? (
          <>
            <div className="text-xs text-muted-foreground">Cost per unit after input credit</div>
            <div className="num text-3xl font-medium">{formatMoney(result.netPerUnit, "INR", { unit: true })}</div>
            <div className="num mt-1 text-xs text-muted-foreground">
              {result.domestic ? "Domestic purchase" : result.duty ? `HSN ${result.duty.prefix}… · ${result.duty.description ?? ""}` : "HSN not in table — 10 % BCD assumed"}
            </div>
            <dl className="num mt-4 space-y-1 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="font-sans text-muted-foreground">{k}</dt>
                  <dd>{formatMoney(v, "INR")}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t pt-1 font-medium">
                <dt className="font-sans">Cash out</dt>
                <dd>{formatMoney(result.total, "INR")}</dd>
              </div>
              <div className="flex justify-between gap-3 font-medium">
                <dt className="font-sans">Cost after credit</dt>
                <dd>{formatMoney(result.netTotal, "INR")}</dd>
              </div>
            </dl>
            <div className="num mt-3 text-[11px] text-muted-foreground">1 {currency} = ₹{result.fxRate.toFixed(4)}</div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Enter a price, currency and quantity.</p>
        )}
      </div>
    </div>
  );
}
