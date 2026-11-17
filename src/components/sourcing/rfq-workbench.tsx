"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Condition, SupplierKind } from "@prisma/client";
import { CheckCheck, Download, FileUp, Loader2, PencilLine, Send, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  awardBestLanded,
  createPos,
  importQuoteFile,
  markRfqSent,
  quoteFromLiveOffers,
  saveAwards,
  saveManualQuote,
} from "@/app/(app)/sourcing/actions";
import { formatMoney, type Currency } from "@/lib/currency";
import { SUPPLIER_KIND_LABEL } from "@/lib/risk";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RiskDot } from "@/components/data/badges";
import { cn } from "@/lib/utils";

type Cell = {
  quoteLineId: string;
  supplierId: string;
  unit: number;
  currency: string;
  qtyOffered: number;
  leadTimeWeeks: number | null;
  covers: boolean;
  awarded: boolean;
  landedUnit: number;
  landedTotal: number;
  duty: number;
  dutyAssumed: boolean;
  domestic: boolean;
  condition: Condition;
  coc: boolean;
  dateCode: string | null;
};

export type WorkbenchData = {
  rfqId: string;
  status: string;
  currency: Currency;
  editable: boolean;
  canPo: boolean;
  suppliers: {
    id: string;
    name: string;
    kind: SupplierKind;
    currency: string;
    quoted: boolean;
    source: string | null;
    receivedAt: string | null;
    freight: number | null;
    lines: number;
    awardedNet: number;
    allNet: number;
    hasPo: boolean;
  }[];
  lines: { id: string; partId: string; mpn: string; manufacturer: string; qty: number; target: number | null; note: string | null; bestQuoteLineId: string | null; cells: Cell[] }[];
  pos: { id: string; number: string }[];
};

type ActionResult = { error?: string; message?: string } | undefined;

export function RfqWorkbench({ data }: { data: WorkbenchData }) {
  const [pending, start] = useTransition();
  const initialAwards = useMemo(
    () => Object.fromEntries(data.lines.map((l) => [l.id, l.cells.find((c) => c.awarded)?.quoteLineId ?? null])) as Record<string, string | null>,
    [data.lines],
  );
  const [awards, setAwardsState] = useState(initialAwards);
  // Server-side award changes (e.g. "Award best landed") arrive as new props — adopt them.
  useEffect(() => setAwardsState(initialAwards), [initialAwards]);
  const dirty = Object.keys(awards).some((k) => awards[k] !== initialAwards[k]);
  const quoted = data.suppliers.filter((s) => s.quoted);
  const money = (n: number, unit = false) => formatMoney(n, data.currency, { unit });

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
      else if (res?.message) toast.success(res.message);
    });

  const awardedTotal = data.lines.reduce((s, l) => s + (l.cells.find((c) => c.quoteLineId === awards[l.id])?.landedTotal ?? 0), 0);
  const awardedCount = Object.values(awards).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-5 py-2.5">
          <h2 className="text-base font-semibold">Suppliers</h2>
          {data.editable && data.status === "DRAFT" ? (
            <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => run(() => markRfqSent(data.rfqId))}>
              <Send className="size-3.5" /> Mark as sent
            </Button>
          ) : null}
        </div>
        <ul className="divide-y">
          {data.suppliers.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
              <div className="min-w-48 flex-1">
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {SUPPLIER_KIND_LABEL[s.kind]} · {s.currency}
                  {s.quoted ? ` · ${s.lines} lines quoted (${s.source?.toLowerCase()})` : " · no quote yet"}
                </div>
              </div>
              {s.quoted ? <span className="num text-base font-semibold">{money(s.allNet)}</span> : <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><RiskDot level="amber" />waiting</span>}
              {data.editable ? (
                <div className="flex flex-wrap gap-1">
                  <Button asChild size="sm" variant="ghost" className="h-8">
                    <a href={`/sourcing/rfqs/${data.rfqId}/export?supplier=${s.id}`} download>
                      <Download className="size-3.5" /> Sheet
                    </a>
                  </Button>
                  <ImportButton onFile={(fd) => run(() => importQuoteFile(data.rfqId, s.id, fd))} disabled={pending} />
                  <ManualQuote supplier={s} lines={data.lines} rfqId={data.rfqId} />
                  {s.kind === "AUTHORISED" || s.kind === "MANUFACTURER" || s.kind === "BROKER" ? (
                    <Button size="sm" variant="ghost" className="h-8" disabled={pending} title="Price from this supplier's current API / price-list offers" onClick={() => run(() => quoteFromLiveOffers(data.rfqId, s.id))}>
                      <Zap className="size-3.5" /> From offers
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex min-h-14 flex-wrap items-center gap-2 border-b px-5 py-2.5">
          <h2 className="mr-auto text-base font-semibold" title="Net of GST/IGST credit">Compare — landed per unit</h2>
          {data.editable && quoted.length ? (
            <>
              <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => run(() => awardBestLanded(data.rfqId))}>
                <Trophy className="size-3.5" /> Award best landed
              </Button>
              {dirty ? (
                <Button size="sm" className="h-8" disabled={pending} onClick={() => run(async () => { await saveAwards(data.rfqId, Object.entries(awards).map(([rfqLineId, quoteLineId]) => ({ rfqLineId, quoteLineId }))); return { message: "Awards saved" }; })}>
                  <CheckCheck className="size-3.5" /> Save awards
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
        {quoted.length ? (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-normal">Part</th>
                  <th className="px-3 py-2 text-right font-normal">Qty</th>
                  {quoted.map((s) => (
                    <th key={s.id} className="min-w-44 px-3 py-2 text-left font-normal">{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.lines.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2.5">
                      <Link href={`/parts/${l.partId}`} className="num font-medium hover:underline">{l.mpn}</Link>
                      <div className="text-xs text-muted-foreground">{l.manufacturer}</div>
                      {l.target ? <div className="num text-[11px] text-muted-foreground">bid {l.target}</div> : null}
                    </td>
                    <td className="num px-3 py-2.5 text-right">{l.qty.toLocaleString("en-IN")}</td>
                    {quoted.map((s) => {
                      const c = l.cells.find((x) => x.supplierId === s.id);
                      if (!c) return <td key={s.id} className="px-3 py-2.5 text-xs text-muted-foreground">no quote</td>;
                      const best = c.quoteLineId === l.bestQuoteLineId;
                      const selected = awards[l.id] === c.quoteLineId;
                      return (
                        <td key={s.id} className="px-2 py-1.5">
                          <label
                            className={cn(
                              "block cursor-pointer rounded-md border px-2.5 py-1.5 transition-colors duration-150",
                              selected ? "border-primary bg-part-soft" : best ? "border-risk-green/60" : "border-transparent hover:border-border",
                              !data.editable && "cursor-default",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {data.editable ? (
                                <input
                                  type="radio"
                                  name={`award-${l.id}`}
                                  checked={selected}
                                  onChange={() => setAwardsState((a) => ({ ...a, [l.id]: c.quoteLineId }))}
                                  className="size-3.5 accent-[var(--primary)]"
                                  aria-label={`Award ${l.mpn} to ${s.name}`}
                                />
                              ) : selected ? (
                                <CheckCheck className="size-3.5 text-primary" aria-label="Awarded" />
                              ) : null}
                              <span className="num font-medium">{money(c.landedUnit, true)}</span>
                              {best ? <span className="rounded bg-risk-green-soft px-1 text-[10px]">best</span> : null}
                            </div>
                            <div className="num mt-0.5 text-[11px] text-muted-foreground">
                              {c.unit} {c.currency}
                              {c.duty > 0 ? ` · duty ${money(c.duty)}` : c.domestic ? " · domestic" : ""}
                              {c.dutyAssumed ? "*" : ""}
                            </div>
                            <div className="num text-[11px]">
                              <span className={c.covers ? "text-muted-foreground" : "text-risk-red"}>{c.qtyOffered.toLocaleString("en-IN")} pcs</span>
                              <span className="text-muted-foreground"> · {c.leadTimeWeeks ? `${c.leadTimeWeeks} wk` : "LT ?"}</span>
                              {!c.coc ? <span className="text-risk-red"> · no CoC</span> : null}
                            </div>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t text-xs">
                <tr>
                  <td className="sticky left-0 bg-card px-4 py-2.5 text-muted-foreground">All quoted lines</td>
                  <td />
                  {quoted.map((s) => (
                    <td key={s.id} className="num px-4 py-2.5">{money(s.allNet)}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
            <p className="px-4 pb-3 text-[11px] text-muted-foreground">* HSN not in the duty table: 10 % BCD assumed. Indicative — confirm with the customs broker.</p>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No quotes yet.
          </p>
        )}
      </section>

      {quoted.length ? (
        <section className="flex flex-wrap items-end gap-x-8 gap-y-4 rounded-xl border bg-card p-5">
          <dl className="flex gap-8">
            <div>
              <dd className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{awardedCount}/{data.lines.length}</dd>
              <dt className="mt-1.5 text-xs text-muted-foreground">lines awarded</dt>
            </div>
            <div>
              <dd className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{money(awardedTotal)}</dd>
              <dt className="mt-1.5 text-xs text-muted-foreground">landed</dt>
            </div>
          </dl>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {data.pos.map((p) => (
              <Button key={p.id} asChild variant="outline" className="h-10">
                <Link href={`/sourcing/pos/${p.id}`} className="num">{p.number}</Link>
              </Button>
            ))}
            {data.canPo && data.status !== "CLOSED" ? (
              <Button
                className="h-10"
                disabled={pending || dirty || !awardedCount}
                title={dirty ? "Save awards first" : undefined}
                onClick={() => run(() => createPos(data.rfqId))}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Create PO drafts
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ImportButton({ onFile, disabled }: { onFile: (fd: FormData) => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="sr-only"
        aria-label="Import quote file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("file", f);
          onFile(fd);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="ghost" className="h-8" disabled={disabled} onClick={() => ref.current?.click()}>
        <FileUp className="size-3.5" /> Import
      </Button>
    </>
  );
}

function ManualQuote({ supplier, lines, rfqId }: { supplier: WorkbenchData["suppliers"][number]; lines: WorkbenchData["lines"]; rfqId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [currency, setCurrency] = useState(supplier.currency);
  const [freight, setFreight] = useState(supplier.freight === null ? "" : String(supplier.freight));
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      lines.map((l) => {
        const c = l.cells.find((x) => x.supplierId === supplier.id);
        return [l.id, { unit: c ? String(c.unit) : "", qty: c ? String(c.qtyOffered) : String(l.qty), lt: c?.leadTimeWeeks ? String(c.leadTimeWeeks) : "", dc: c?.dateCode ?? "" }];
      }),
    ) as Record<string, { unit: string; qty: string; lt: string; dc: string }>,
  );
  const cell = "num h-8 w-full rounded border bg-background px-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8">
          <PencilLine className="size-3.5" /> Enter
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Quote from {supplier.name}</DialogTitle>
          <DialogDescription>Leave the unit price empty for lines they did not quote.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-8 rounded border bg-background px-2">
              {["INR", "USD", "EUR", "GBP", "CNY", "SGD", "JPY"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Freight for whole quote
            <input value={freight} onChange={(e) => setFreight(e.target.value)} inputMode="decimal" placeholder={`default %`} className={`${cell} w-28`} />
          </label>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Part</th>
              <th className="py-1 font-normal">Unit price</th>
              <th className="py-1 font-normal">Qty offered</th>
              <th className="py-1 font-normal">LT (wk)</th>
              <th className="py-1 font-normal">Date code</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1 pr-2">
                  <div className="num text-xs font-medium">{l.mpn}</div>
                  <div className="num text-[11px] text-muted-foreground">need {l.qty.toLocaleString("en-IN")}</div>
                </td>
                {(["unit", "qty", "lt", "dc"] as const).map((k) => (
                  <td key={k} className="py-1 pr-2">
                    <input
                      aria-label={`${k} for ${l.mpn}`}
                      value={values[l.id][k]}
                      onChange={(e) => setValues((v) => ({ ...v, [l.id]: { ...v[l.id], [k]: e.target.value } }))}
                      inputMode={k === "dc" ? "numeric" : "decimal"}
                      className={cell}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <DialogFooter>
          <Button
            className="h-10"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveManualQuote(rfqId, supplier.id, {
                  currency,
                  freight: freight.trim() ? Number(freight) : null,
                  validUntil: null,
                  lines: lines.map((l) => {
                    const v = values[l.id];
                    return {
                      rfqLineId: l.id,
                      unitPrice: v.unit.trim() ? Number(v.unit) : null,
                      qtyOffered: v.qty.trim() ? Number(v.qty) : null,
                      leadTimeWeeks: v.lt.trim() ? Number(v.lt) : null,
                      dateCode: v.dc.trim() || null,
                    };
                  }),
                });
                if (res?.error) toast.error(res.error);
                else {
                  toast.success(res?.message ?? "Saved");
                  setOpen(false);
                }
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
