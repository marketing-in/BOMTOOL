"use client";

import { useActionState, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { importPriceList } from "@/app/(app)/sourcing/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const field = "h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PriceListForm({ suppliers }: { suppliers: { id: string; name: string; currency: string }[] }) {
  const [state, action, pending] = useActionState(importPriceList, undefined);
  const [supplierId, setSupplierId] = useState(suppliers.find((s) => /robu|evelta/i.test(s.name))?.id ?? "new");
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <form action={action} className="space-y-4 rounded-lg border bg-card p-4">
      <div className="space-y-1.5">
        <Label htmlFor="supplierId">Supplier</Label>
        <select id="supplierId" name="supplierId" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={field}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.currency})</option>
          ))}
          <option value="new">New supplier…</option>
        </select>
      </div>
      {supplierId === "new" ? (
        <div className="space-y-1.5">
          <Label htmlFor="newSupplier">New supplier name (India, INR)</Label>
          <input id="newSupplier" name="newSupplier" required className={field} />
        </div>
      ) : null}
      <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center hover:border-foreground/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
        <input type="file" name="file" accept=".xlsx,.xls,.csv,.tsv" className="sr-only" aria-label="Price-list file" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
        <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
        <span className="num text-sm">{fileName ?? "Choose an .xlsx or .csv price list"}</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="addUnknown" className="size-4 accent-[var(--primary)]" />
        Add MPNs that aren’t in our catalogue yet (as “uncategorised”)
      </label>
      {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state?.message ? <p role="status" className="text-sm text-risk-green">{state.message}</p> : null}
      <Button type="submit" className="h-10 w-full" disabled={pending || !fileName}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Import price list
      </Button>
    </form>
  );
}
