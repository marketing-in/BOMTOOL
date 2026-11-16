"use client";

import { useTransition } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { setPoStatus } from "@/app/(app)/sourcing/actions";
import { Button } from "@/components/ui/button";

export function PoActions({ poId, status, canApprove, canEdit }: { poId: string; status: string; canApprove: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const go = (s: "PENDING_APPROVAL" | "APPROVED" | "SENT" | "CANCELLED") =>
    start(async () => {
      const res = await setPoStatus(poId, s);
      if (res?.error) toast.error(res.error);
    });
  return (
    <>
      <Button variant="outline" className="h-10" onClick={() => window.print()}>
        <Printer className="size-4" /> Print / PDF
      </Button>
      {canEdit && status === "DRAFT" ? (
        <Button variant="outline" className="h-10" disabled={pending} onClick={() => go("PENDING_APPROVAL")}>Submit for approval</Button>
      ) : null}
      {canApprove && status === "PENDING_APPROVAL" ? (
        <Button className="h-10" disabled={pending} onClick={() => go("APPROVED")}>Approve</Button>
      ) : null}
      {canEdit && status === "APPROVED" ? (
        <Button className="h-10" disabled={pending} onClick={() => go("SENT")}>Mark as sent</Button>
      ) : null}
      {canEdit && !["SENT", "CANCELLED"].includes(status) ? (
        <Button variant="ghost" className="h-10" disabled={pending} onClick={() => go("CANCELLED")}>Cancel</Button>
      ) : null}
    </>
  );
}
