"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { addCompetitors, removeCompetitor } from "@/app/(app)/validation/actions";

export type CompetitorItem = { id: string; name: string; aliases: string[] };

/**
 * One customer's competitor list: makers whose parts must not be on its boards. Add by typing or pasting (one maker
 * a line, other spellings after a comma or in brackets) or from a CSV / Excel file; remove with the cross.
 */
export function CompetitorEditor({ customerId, customer, items, canEdit }: { customerId: string; customer: string; items: CompetitorItem[]; canEdit: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      {items.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={`${customer}'s competitors`}>
          {items.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-1 pr-1.5 pl-3 text-sm">
              <span>{c.name}</span>
              {c.aliases.length ? <span className="text-xs text-muted-foreground">({c.aliases.join(", ")})</span> : null}
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await removeCompetitor(c.id);
                      if (r.error) toast.error(r.error);
                      else toast.success(r.message ?? "Removed");
                    })
                  }
                  className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No competitor list for {customer} yet. Without one, the competitor check does not run.</p>
      )}
      {canEdit ? (
        <form
          ref={form}
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            start(async () => {
              const r = await addCompetitors(customerId, data);
              if (r.error) toast.error(r.error);
              else {
                toast.success(r.message ?? "Added");
                form.current?.reset();
              }
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted-foreground">Add makers: one a line; other spellings after a comma or in brackets</span>
            <textarea name="text" rows={3} placeholder={"Texas Instruments (TI)\nON Semiconductor, onsemi"} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted">
              <Upload className="size-4" aria-hidden /> Upload a list (CSV or Excel)
              <input name="file" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm" className="sr-only" />
            </label>
            <button type="submit" disabled={pending} className="ml-auto h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {pending ? "Adding…" : "Add to the list"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
