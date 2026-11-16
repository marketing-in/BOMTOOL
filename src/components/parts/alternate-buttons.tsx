"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { approveAlternate, removeAlternate } from "@/app/(app)/parts/actions";
import { Button } from "@/components/ui/button";

export function ApproveAlternateButton({ partId, altPartId }: { partId: string; altPartId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await approveAlternate(partId, altPartId);
          if (res?.error) toast.error(res.error);
          else toast.success(res?.message ?? "Approved");
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
      Approve
    </Button>
  );
}

/** Two-step remove: the first click asks, the second removes; it resets after a few seconds. */
export function RemoveAlternateButton({ partId, altPartId, mpn }: { partId: string; altPartId: string; mpn: string }) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      size="sm"
      variant="ghost"
      className={armed ? "h-8 text-risk-red hover:text-risk-red" : "h-8 text-muted-foreground"}
      disabled={pending}
      aria-label={armed ? `Confirm removing ${mpn} as an alternate` : `Remove ${mpn} as an alternate`}
      onClick={() => {
        if (!armed) return setArmed(true);
        start(async () => {
          const res = await removeAlternate(partId, altPartId);
          if (res?.error) toast.error(res.error);
          else toast.success(res?.message ?? "Removed");
          setArmed(false);
        });
      }}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      {armed ? "Confirm remove" : "Remove"}
    </Button>
  );
}
