"use client";

import { useState, useTransition } from "react";
import type { WorkOrderStatus } from "@prisma/client";
import { CalendarDays, Loader2, PackageCheck, PackageOpen, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { issueWo, releaseWo, reserveWo, scheduleWo, setWoStatus } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WO_FLOW, WO_STATUS } from "@/lib/ops/labels";

type Props = {
  id: string;
  status: WorkOrderStatus;
  lineId: string | null;
  plannedStart: string | null;
  days: number;
  lines: { id: string; code: string }[];
  hasReservations: boolean;
  canPlan: boolean;
  canStores: boolean;
};

export function WoActions(p: Props) {
  const [pending, start] = useTransition();
  const [line, setLine] = useState(p.lineId ?? "");
  const [date, setDate] = useState(p.plannedStart ?? new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(p.days);
  const run = (fn: () => Promise<{ error?: string; message?: string } | undefined>) =>
    start(async () => {
      const r = await fn();
      if (r?.error) toast.error(r.error);
      else if (r?.message) toast.success(r.message);
    });
  const next = WO_FLOW[WO_FLOW.indexOf(p.status) + 1];

  return (
    <>
      {p.canPlan ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-10"><CalendarDays className="size-4" /> Schedule</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            <label className="block text-xs">
              Line
              <select value={line} onChange={(e) => setLine(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">Unassigned</option>
                {p.lines.map((l) => (
                  <option key={l.id} value={l.id}>{l.code}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                Start
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="num mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" />
              </label>
              <label className="block text-xs">
                Days
                <input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} className="num mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" />
              </label>
            </div>
            <Button className="h-9 w-full" disabled={pending} onClick={() => run(() => scheduleWo(p.id, { lineId: line || null, plannedStart: date, days }))}>
              Save schedule
            </Button>
          </PopoverContent>
        </Popover>
      ) : null}
      {p.canPlan || p.canStores ? (
        <Button variant="outline" className="h-10" disabled={pending} onClick={() => run(() => reserveWo(p.id))}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <PackageOpen className="size-4" />} Reserve stock
        </Button>
      ) : null}
      {p.hasReservations && (p.canPlan || p.canStores) ? (
        <Button variant="ghost" className="h-10" disabled={pending} onClick={() => run(() => releaseWo(p.id))}>
          <Undo2 className="size-4" /> Release
        </Button>
      ) : null}
      {p.hasReservations && p.canStores ? (
        <Button className="h-10" disabled={pending} onClick={() => run(() => issueWo(p.id))}>
          <PackageCheck className="size-4" /> Issue kit to line
        </Button>
      ) : null}
      {p.canPlan && next ? (
        <Button variant="outline" className="h-10" disabled={pending} onClick={() => run(() => setWoStatus(p.id, next))}>
          → {WO_STATUS[next].label}
        </Button>
      ) : null}
    </>
  );
}
