"use client";

import { useTransition } from "react";
import { Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { acknowledgeEvents } from "@/app/(app)/alerts/actions";
import { Button } from "@/components/ui/button";

export function AckButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="icon" className="size-8" aria-label="Acknowledge" title="Acknowledge" disabled={pending} onClick={() => start(async () => void (await acknowledgeEvents([id])))}>
      <Check className="size-4" />
    </Button>
  );
}

export function AckAllButton({ ids }: { ids: string[] }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      className="h-10"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await acknowledgeEvents(ids);
          toast.success(`${ids.length} market alerts acknowledged`);
        })
      }
    >
      <CheckCheck className="size-4" /> Acknowledge market alerts
    </Button>
  );
}
