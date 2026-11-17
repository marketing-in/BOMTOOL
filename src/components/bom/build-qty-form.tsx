"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setBuildQty } from "@/app/(app)/boms/actions";
import { Button } from "@/components/ui/button";

export function BuildQtyForm({ revisionId, value, disabled }: { revisionId: string; value: number; disabled?: boolean }) {
  const [qty, setQty] = useState(String(value));
  const [pending, start] = useTransition();
  const dirty = Number(qty) !== value;
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setBuildQty(revisionId, Number(qty));
          if (res?.error) toast.error(res.error);
          else toast.success(`Re-scored for ${Number(qty).toLocaleString("en-IN")} boards`);
        });
      }}
    >
      <label htmlFor="build-qty" className="sr-only">Build quantity</label>
      <input
        id="build-qty"
        type="number"
        min={1}
        value={qty}
        disabled={disabled || pending}
        onChange={(e) => setQty(e.target.value)}
        className="h-10 w-full min-w-0 rounded-md border bg-card px-2 text-2xl font-semibold tracking-tight tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {dirty ? (
        <Button type="submit" size="sm" className="h-9" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Apply"}
        </Button>
      ) : null}
    </form>
  );
}
