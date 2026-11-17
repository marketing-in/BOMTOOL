"use client";

import { useActionState, useState, useTransition } from "react";
import { Flame, Loader2, MoreHorizontal, PackageOpen, Archive } from "lucide-react";
import { toast } from "sonner";
import { adjustLot, mslAction, receiveStock } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const field = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ReceiveForm({ parts, warehouses, customers }: { parts: { id: string; mpn: string }[]; warehouses: { id: string; name: string }[]; customers: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(receiveStock, undefined);
  const [mpn, setMpn] = useState("");
  const match = parts.find((p) => p.mpn.toLowerCase() === mpn.trim().toLowerCase());
  return (
    <form action={action} className="space-y-3 self-start rounded-xl border bg-card p-5">
      <h2 className="text-base font-semibold">Receive stock</h2>
      <div className="space-y-1.5">
        <Label htmlFor="rmpn">MPN</Label>
        <input id="rmpn" list="rparts" value={mpn} onChange={(e) => setMpn(e.target.value)} className={`${field} num`} placeholder="Start typing…" autoComplete="off" />
        <datalist id="rparts">
          {parts.map((p) => (
            <option key={p.id} value={p.mpn} />
          ))}
        </datalist>
        <input type="hidden" name="partId" value={match?.id ?? ""} />
        {mpn && !match ? <p className="text-xs text-risk-amber">Not in the catalogue yet</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="rwh">Warehouse</Label>
          <select id="rwh" name="warehouseId" className={field}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rbin">Bin</Label>
          <input id="rbin" name="bin" required className={`${field} num`} placeholder="A-03-12" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="rqty">Qty</Label>
          <input id="rqty" name="qty" type="number" min={1} required className={`${field} num`} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rdc">Date code</Label>
          <input id="rdc" name="dateCode" className={`${field} num`} placeholder="YYWW" maxLength={6} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="rlot">Lot code</Label>
          <input id="rlot" name="lotCode" className={`${field} num`} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rcost">Unit cost (INR)</Label>
          <input id="rcost" name="unitCost" type="number" step="any" min={0} className={`${field} num`} />
        </div>
      </div>
      <input type="hidden" name="currency" value="INR" />
      <div className="space-y-1.5">
        <Label htmlFor="rcust">Consigned by (optional)</Label>
        <select id="rcust" name="customerId" className={field} defaultValue="">
          <option value="">Our own stock</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="cocOnFile" className="size-4 accent-[var(--primary)]" /> CoC received
      </label>
      {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state?.message ? <p role="status" className="text-sm text-risk-green">{state.message}</p> : null}
      <Button type="submit" className="h-10 w-full" disabled={pending || !match}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Receive
      </Button>
    </form>
  );
}

export function LotActions({ lotId, qty, msl, running }: { lotId: string; qty: number; msl: boolean; running: boolean }) {
  const [pending, start] = useTransition();
  const [newQty, setNewQty] = useState(String(qty));
  const [reason, setReason] = useState("");
  const run = (fn: () => Promise<{ error?: string; message?: string } | undefined>) =>
    start(async () => {
      const r = await fn();
      if (r?.error) toast.error(r.error);
      else if (r?.message) toast.success(r.message);
    });
  return (
    <div className="flex items-center justify-end gap-0.5">
      {msl ? (
        running ? (
          <Button variant="ghost" size="icon" className="size-8" title="Close into dry storage (pause clock)" aria-label="Close bag" disabled={pending} onClick={() => run(() => mslAction(lotId, "close"))}>
            <Archive className="size-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="size-8" title="Open bag (start floor-life clock)" aria-label="Open bag" disabled={pending} onClick={() => run(() => mslAction(lotId, "open"))}>
            <PackageOpen className="size-4" />
          </Button>
        )
      ) : null}
      {msl ? (
        <Button variant="ghost" size="icon" className="size-8" title="Baked — reset floor life" aria-label="Record bake" disabled={pending} onClick={() => run(() => mslAction(lotId, "bake"))}>
          <Flame className="size-4" />
        </Button>
      ) : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Adjust quantity">
            <MoreHorizontal className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 space-y-2">
          <div className="text-sm font-medium">Adjust quantity</div>
          <input value={newQty} onChange={(e) => setNewQty(e.target.value)} type="number" min={0} className="num h-9 w-full rounded-md border bg-background px-2 text-sm" aria-label="New quantity" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (cycle count, scrap …)" className="h-9 w-full rounded-md border bg-background px-2 text-sm" aria-label="Reason" />
          <Button size="sm" className="h-9 w-full" disabled={pending} onClick={() => run(() => adjustLot(lotId, Number(newQty), reason))}>
            Save
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
