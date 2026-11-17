"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { createWo } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const field = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function WoCreateForm({ revisions, lines }: { revisions: { id: string; label: string; buildQty: number }[]; lines: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createWo, undefined);
  const [rev, setRev] = useState(revisions[0]?.id ?? "");
  const qty = revisions.find((r) => r.id === rev)?.buildQty ?? 100;
  return (
    <form action={action} className="space-y-4 self-start rounded-xl border bg-card p-5">
      <h2 className="text-base font-semibold">New work order</h2>
      <div className="space-y-1.5">
        <Label htmlFor="bomRevisionId">BoM revision</Label>
        <select id="bomRevisionId" name="bomRevisionId" value={rev} onChange={(e) => setRev(e.target.value)} className={field}>
          {revisions.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="buildQty">Build qty</Label>
          <input key={rev} id="buildQty" name="buildQty" type="number" min={1} defaultValue={qty} className={`${field} num`} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lineId">Line</Label>
          <select id="lineId" name="lineId" className={field} defaultValue="">
            <option value="">Decide later</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="plannedStart">Planned start</Label>
          <input id="plannedStart" name="plannedStart" type="date" className={`${field} num`} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dueDate">Due</Label>
          <input id="dueDate" name="dueDate" type="date" className={`${field} num`} />
        </div>
      </div>
      {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" className="h-10 w-full" disabled={pending || !rev}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Create & check clear-to-build
      </Button>
    </form>
  );
}
