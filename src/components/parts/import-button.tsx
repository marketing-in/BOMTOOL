"use client";

import { useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { importMarketPart } from "@/app/(app)/parts/market/actions";
import { Button } from "@/components/ui/button";

/** Adds a distributor result to our catalogue and opens its part page. */
export function ImportPartButton({ query, resultKey, mpn }: { query: string; resultKey: string; mpn: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      className="h-8"
      disabled={pending}
      aria-label={`Add ${mpn} to the catalogue`}
      onClick={() =>
        start(async () => {
          const res = await importMarketPart(query, resultKey);
          if (res?.error) toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
      Add to catalogue
    </Button>
  );
}
