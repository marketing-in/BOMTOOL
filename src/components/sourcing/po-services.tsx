"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveServices } from "@/app/(app)/sourcing/pos/[id]/actions";
import { SERVICE_HINT, SERVICE_KINDS, SERVICE_LABEL, servicesTotal, type OrderService, type ServiceKind } from "@/lib/order-services";
import { formatMoney } from "@/lib/currency";
import { Button } from "@/components/ui/button";

const field = "h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Transport, finance, storage and test booked with this order; editable while the PO is a draft. */
export function PoServices({ poId, initial, suggest, editable }: { poId: string; initial: OrderService[]; suggest: ServiceKind[]; editable: boolean }) {
  const [rows, setRows] = useState<OrderService[]>(initial);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<OrderService>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const missing = suggest.filter((k) => !rows.some((r) => r.kind === k));

  if (!editable) {
    if (!rows.length) return null;
    return (
      <ul className="num space-y-1 text-sm">
        {rows.map((r, i) => (
          <li key={i} className="flex justify-between gap-4">
            <span className="font-sans">{SERVICE_LABEL[r.kind]}<span className="text-muted-foreground"> · {r.detail}</span></span>
            <span>{formatMoney(r.cost, "INR")}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-2">
      {missing.length ? (
        <p className="text-xs text-risk-amber">Suggested for this order: {missing.map((k) => SERVICE_LABEL[k].toLowerCase()).join(", ")}.</p>
      ) : null}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[9rem_1fr_7rem_2.25rem] items-center gap-2">
          <label className="sr-only" htmlFor={`svc-kind-${i}`}>Service</label>
          <select id={`svc-kind-${i}`} value={r.kind} onChange={(e) => set(i, { kind: e.target.value as ServiceKind })} className={field}>
            {SERVICE_KINDS.map((k) => (
              <option key={k} value={k}>{SERVICE_LABEL[k]}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor={`svc-detail-${i}`}>Detail</label>
          <input id={`svc-detail-${i}`} value={r.detail} onChange={(e) => set(i, { detail: e.target.value })} placeholder={SERVICE_HINT[r.kind]} className={field} />
          <label className="sr-only" htmlFor={`svc-cost-${i}`}>Cost in INR</label>
          <input id={`svc-cost-${i}`} type="number" min={0} step="any" value={r.cost} onChange={(e) => set(i, { cost: Number(e.target.value) })} className={`${field} num text-right`} />
          <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Remove service" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button type="button" variant="outline" className="h-9" onClick={() => setRows((x) => [...x, { kind: missing[0] ?? "transport", detail: "", cost: 0 }])}>
          <Plus className="size-4" /> Add service
        </Button>
        <span className="num text-sm">Services {formatMoney(servicesTotal(rows), "INR")}</span>
        <Button
          type="button"
          className="h-9"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveServices(poId, rows);
              if (r.error) toast.error(r.error);
              else toast.success(r.message);
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} Save services
        </Button>
      </div>
    </div>
  );
}
