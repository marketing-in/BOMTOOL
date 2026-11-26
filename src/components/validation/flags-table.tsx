"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban, Check, CircleAlert, RotateCcw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { setCall } from "@/app/(app)/validation/actions";
import { CHECK_LABEL, type Check as CheckKey, type Flag } from "@/lib/validation/checks";

const STATE: Record<Flag["state"], { label: string; tone: string }> = {
  open: { label: "Open", tone: "border-risk-amber/40 bg-risk-amber-soft text-risk-amber" },
  accepted: { label: "Accepted", tone: "border-risk-green/40 bg-risk-green-soft text-risk-green" },
  prohibited: { label: "Prohibited", tone: "border-risk-red/40 bg-risk-red-soft text-risk-red" },
};

type Filter = "all" | Flag["state"];

/**
 * Every flag of the validation with its call. A reviewer accepts a false call (with a reason, kept with the call),
 * prohibits what must be fixed, or clears a call. Filter by check and by call.
 */
export function FlagsTable({ revisionId, flags, canCall }: { revisionId: string; flags: Flag[]; canCall: boolean }) {
  const [state, setState] = useState<Filter>(flags.some((f) => f.state === "open") ? "open" : "all");
  const [check, setCheck] = useState<CheckKey | "all">("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const checks = useMemo(() => [...new Set(flags.map((f) => f.check))], [flags]);
  const shown = flags.filter((f) => (state === "all" || f.state === state) && (check === "all" || f.check === check));
  const count = (s: Filter) => flags.filter((f) => (s === "all" || f.state === s) && (check === "all" || f.check === check)).length;

  const call = (key: string, status: "ACCEPTED" | "PROHIBITED" | null, why = "") =>
    start(async () => {
      const r = await setCall(revisionId, key, status, why);
      if (r.error) toast.error(r.error);
      else {
        toast.success(r.message ?? "Saved");
        setEditing(null);
        setReason("");
      }
    });

  if (!flags.length)
    return (
      <p className="flex items-center gap-2 rounded-xl border bg-card px-5 py-6 text-sm">
        <Check className="size-4 text-risk-green" aria-hidden /> Nothing to settle: every check that could run is clear.
      </p>
    );

  return (
    <section aria-label="Flags" className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div role="radiogroup" aria-label="Call" className="inline-flex rounded-md border bg-muted p-0.5">
          {(["open", "prohibited", "accepted", "all"] as Filter[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={state === s}
              onClick={() => setState(s)}
              className={cn("inline-flex h-9 items-center gap-1.5 rounded px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", state === s ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {s === "all" ? "All" : STATE[s].label}
              <span className="num text-xs text-muted-foreground">{count(s)}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          Check
          <select value={check} onChange={(e) => setCheck(e.target.value as CheckKey | "all")} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
            <option value="all">All checks</option>
            {checks.map((c) => (
              <option key={c} value={c}>
                {CHECK_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Check</th>
              <th className="px-4 py-2.5 font-medium">Where</th>
              <th className="px-4 py-2.5 font-medium">Finding</th>
              <th className="px-4 py-2.5 font-medium">Call</th>
              {canCall ? <th className="px-4 py-2.5 font-medium">
                <span className="sr-only">Actions</span>
              </th> : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => {
              const Icon = f.level === "red" ? CircleAlert : TriangleAlert;
              return (
                <tr key={f.key} className="border-t align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className={cn("size-4 shrink-0", f.level === "red" ? "text-risk-red" : "text-risk-amber")} aria-label={f.level === "red" ? "Must settle" : "To check"} />
                      {CHECK_LABEL[f.check]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="num font-medium">{f.subject}</div>
                    {f.lineNo !== null ? <div className="text-xs text-muted-foreground">line {f.lineNo}{f.refs.length > 1 ? ` · ${f.refs.length} designators` : ""}</div> : null}
                  </td>
                  <td className="max-w-[28rem] px-4 py-3">
                    {f.text}
                    {f.reason && f.state !== "open" ? <div className="mt-1 text-xs text-muted-foreground">Why: {f.reason}</div> : null}
                    {editing === f.key ? (
                      <form
                        className="mt-2 flex flex-wrap gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          call(f.key, "ACCEPTED", reason);
                        }}
                      >
                        <input
                          autoFocus
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Why is this a false call?"
                          aria-label="Reason for accepting"
                          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
                        />
                        <button type="submit" disabled={pending || !reason.trim()} className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
                          Accept as false call
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="h-9 rounded-md border px-3 text-sm">
                          Cancel
                        </button>
                      </form>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", STATE[f.state].tone)}>{STATE[f.state].label}</span>
                  </td>
                  {canCall ? (
                    <td className="px-4 py-3">
                      <div className={cn("flex justify-end gap-1.5", editing === f.key && "invisible")}>
                        {f.state !== "accepted" ? (
                          <button type="button" disabled={pending} onClick={() => {
                              setEditing(f.key);
                              setReason("");
                            }} className="inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted" title="It is a false call: accept it, with a reason">
                            <Check className="size-3.5" aria-hidden /> Accept
                          </button>
                        ) : null}
                        {f.state !== "prohibited" ? (
                          <button type="button" disabled={pending} onClick={() => call(f.key, "PROHIBITED", f.reason ?? "")} className="inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted" title="It must be fixed before production">
                            <Ban className="size-3.5" aria-hidden /> Prohibit
                          </button>
                        ) : null}
                        {f.state !== "open" && !(f.check === "competitor" && f.state === "prohibited" && f.reason === "competitor's part") ? (
                          <button type="button" disabled={pending} onClick={() => call(f.key, null)} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" title="Clear the call">
                            <RotateCcw className="size-3.5" aria-hidden />
                            <span className="sr-only">Clear</span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!shown.length ? (
              <tr>
                <td colSpan={canCall ? 5 : 4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No flags here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
