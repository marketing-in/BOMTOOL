"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveDutyRate } from "@/app/(app)/compliance/actions";
import { Button } from "@/components/ui/button";

type Rate = { prefix: string; description: string; bcdPct: number; igstPct: number; note: string };

export function DutyTableEditor({ rates, editable }: { rates: Rate[]; editable: boolean }) {
  const [rows, setRows] = useState(rates);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Rate>({ prefix: "", description: "", bcdPct: 10, igstPct: 18, note: "" });
  const cell = "num h-8 w-full rounded border bg-background px-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:border-transparent disabled:bg-transparent";
  const save = (r: Rate) =>
    start(async () => {
      const res = await saveDutyRate(r);
      if (res?.error) toast.error(res.error);
      else toast.success(`Saved ${r.prefix}`);
    });
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="w-24 px-3 py-2 font-normal">HSN prefix</th>
            <th className="px-3 py-2 font-normal">Goods</th>
            <th className="w-20 px-3 py-2 font-normal">BCD %</th>
            <th className="w-20 px-3 py-2 font-normal">IGST %</th>
            <th className="px-3 py-2 font-normal">Note</th>
            {editable ? <th className="w-20 px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y">
          {[...rows, ...(editable ? [draft] : [])].map((r, i) => {
            const isDraft = editable && i === rows.length;
            const set = (patch: Partial<Rate>) => (isDraft ? setDraft({ ...draft, ...patch }) : setRows(rows.map((x, k) => (k === i ? { ...x, ...patch } : x))));
            return (
              <tr key={isDraft ? "new" : r.prefix}>
                <td className="px-3 py-1.5">{isDraft ? <input aria-label="New HSN prefix" value={r.prefix} onChange={(e) => set({ prefix: e.target.value.replace(/\D/g, "").slice(0, 8) })} className={cell} placeholder="e.g. 8504" /> : <span className="num">{r.prefix}</span>}</td>
                <td className="px-3 py-1.5"><input aria-label={`Description ${r.prefix}`} value={r.description} disabled={!editable} onChange={(e) => set({ description: e.target.value })} className={cell} /></td>
                <td className="px-3 py-1.5"><input aria-label={`BCD ${r.prefix}`} type="number" step="0.5" min={0} value={r.bcdPct} disabled={!editable} onChange={(e) => set({ bcdPct: Number(e.target.value) })} className={cell} /></td>
                <td className="px-3 py-1.5"><input aria-label={`IGST ${r.prefix}`} type="number" step="1" min={0} value={r.igstPct} disabled={!editable} onChange={(e) => set({ igstPct: Number(e.target.value) })} className={cell} /></td>
                <td className="px-3 py-1.5"><input aria-label={`Note ${r.prefix}`} value={r.note} disabled={!editable} onChange={(e) => set({ note: e.target.value })} className={cell} /></td>
                {editable ? (
                  <td className="px-3 py-1.5 text-right">
                    <Button size="sm" variant={isDraft ? "default" : "ghost"} className="h-8" disabled={pending || (isDraft && r.prefix.length < 4)} onClick={() => save(r)}>
                      {isDraft ? "Add" : "Save"}
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">Indicative. SWS = 10 % of BCD. Confirm with your customs broker; changes go to the audit log.</p>
    </div>
  );
}
