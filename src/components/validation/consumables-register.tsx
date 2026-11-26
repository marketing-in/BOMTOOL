"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteConsumable, saveConsumable } from "@/app/(app)/validation/actions";
import type { RegisterItem } from "@/lib/validation/consumables";

const KIND: Record<RegisterItem["kind"], string> = { SOLDER_PASTE: "Solder paste", FLUX: "Flux", STENCIL: "Stencil", OTHER: "Other" };
const UNIT: Record<RegisterItem["kind"], string> = { SOLDER_PASTE: "g", FLUX: "ml", STENCIL: "pcs", OTHER: "pcs" };

const field = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function specLine(i: RegisterItem): string {
  const s = i.spec ?? {};
  return [s.alloy, s.powderType, s.fluxType, s.thicknessMm ? `${s.thicknessMm} mm` : null, s.side ? (s.side === "BOTH" ? "both sides" : s.side.toLowerCase()) : null, s.frame].filter(Boolean).join(" · ");
}

/**
 * The consumables register: what the stores hold of paste, flux and stencils, with expiry, place and lot; a stencil
 * can be tied to the board it was cut for. Expired and low items are marked. Recording only — nothing is ordered.
 */
export function ConsumablesRegister({ items, boards, canEdit, alerts }: { items: RegisterItem[]; boards: { id: string; label: string }[]; canEdit: boolean; alerts: Record<string, string> }) {
  const [editing, setEditing] = useState<RegisterItem | "new" | null>(null);
  const [kind, setKind] = useState<RegisterItem["kind"]>("SOLDER_PASTE");
  const [pending, start] = useTransition();
  const boardOf = new Map(boards.map((b) => [b.id, b.label]));
  const current = editing && editing !== "new" ? editing : null;

  const open = (i: RegisterItem | "new") => {
    setEditing(i);
    setKind(i === "new" ? "SOLDER_PASTE" : i.kind);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-4 py-2.5 font-medium">Spec</th>
              <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
              <th className="px-4 py-2.5 font-medium">Expires</th>
              <th className="px-4 py-2.5 font-medium">Where</th>
              {canEdit ? <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {KIND[i.kind]}
                    {i.revisionId ? ` · for ${boardOf.get(i.revisionId) ?? "a board"}` : ""}
                    {i.lot ? ` · lot ${i.lot}` : ""}
                  </div>
                  {alerts[i.id] ? <div className="mt-1 text-xs text-risk-amber">{alerts[i.id]}</div> : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{specLine(i) || "—"}</td>
                <td className={cn("num px-4 py-3 text-right", i.minQty !== null && i.quantity <= i.minQty && "text-risk-amber")}>
                  {i.quantity.toLocaleString("en-IN")} {i.unit}
                </td>
                <td className="num px-4 py-3">{day(i.expiresAt) || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{i.location ?? "—"}</td>
                {canEdit ? (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => open(i)} aria-label={`Edit ${i.name}`} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${i.name}`}
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await deleteConsumable(i.id);
                            if (r.error) toast.error(r.error);
                            else toast.success(r.message ?? "Removed");
                          })
                        }
                        className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing recorded yet: add the paste jars, flux and stencils the stores hold.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canEdit && !editing ? (
        <button type="button" onClick={() => open("new")} className="inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm hover:bg-muted">
          <Plus className="size-4" aria-hidden /> Add to the register
        </button>
      ) : null}

      {canEdit && editing ? (
        <form
          key={current?.id ?? "new"}
          className="space-y-3 rounded-xl border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            start(async () => {
              const r = await saveConsumable(data);
              if (r.error) toast.error(r.error);
              else {
                toast.success(r.message ?? "Saved");
                setEditing(null);
              }
            });
          }}
        >
          <h3 className="text-sm font-medium">{current ? `Edit ${current.name}` : "Add to the register"}</h3>
          {current ? <input type="hidden" name="id" value={current.id} /> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1.5 block text-muted-foreground">Kind</span>
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as RegisterItem["kind"])} className={field}>
                {(Object.keys(KIND) as RegisterItem["kind"][]).map((k) => (
                  <option key={k} value={k}>
                    {KIND[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1.5 block text-muted-foreground">Name</span>
              <input name="name" required defaultValue={current?.name ?? ""} placeholder={kind === "STENCIL" ? "Top stencil, 0.12 mm, framed" : kind === "FLUX" ? "No-clean liquid flux" : "SAC305 no-clean paste"} className={field} />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-muted-foreground">Quantity</span>
              <input name="quantity" inputMode="decimal" required defaultValue={current?.quantity ?? ""} className={field} />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-muted-foreground">Unit</span>
              <input name="unit" defaultValue={current?.unit ?? UNIT[kind]} placeholder={UNIT[kind]} className={field} />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-muted-foreground">Minimum to keep</span>
              <input name="minQty" inputMode="decimal" defaultValue={current?.minQty ?? ""} className={field} />
            </label>
            {kind === "SOLDER_PASTE" ? (
              <>
                <label className="text-sm">
                  <span className="mb-1.5 block text-muted-foreground">Alloy</span>
                  <input name="alloy" defaultValue={current?.spec?.alloy ?? "SAC305"} className={field} />
                </label>
                <label className="text-sm">
                  <span className="mb-1.5 block text-muted-foreground">Powder</span>
                  <select name="powderType" defaultValue={current?.spec?.powderType ?? "Type 4"} className={field}>
                    {["Type 3", "Type 4", "Type 5", "Type 6"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1.5 block text-muted-foreground">Flux</span>
                  <input name="fluxType" defaultValue={current?.spec?.fluxType ?? "No-clean"} className={field} />
                </label>
              </>
            ) : null}
            {kind === "FLUX" ? (
              <label className="text-sm sm:col-span-3">
                <span className="mb-1.5 block text-muted-foreground">Type</span>
                <input name="fluxType" defaultValue={current?.spec?.fluxType ?? ""} placeholder="No-clean liquid for the wave, or gel for rework" className={field} />
              </label>
            ) : null}
            {kind === "STENCIL" ? (
              <>
                <label className="text-sm">
                  <span className="mb-1.5 block text-muted-foreground">Board</span>
                  <select name="revisionId" defaultValue={current?.revisionId ?? ""} className={field}>
                    <option value="">Not tied to a board</option>
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1.5 block text-muted-foreground">Side</span>
                  <select name="side" defaultValue={current?.spec?.side ?? "TOP"} className={field}>
                    <option value="TOP">Top</option>
                    <option value="BOTTOM">Bottom</option>
                    <option value="BOTH">Both (step stencil)</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1.5 block text-muted-foreground">Foil, mm</span>
                  <input name="thicknessMm" inputMode="decimal" defaultValue={current?.spec?.thicknessMm ?? "0.12"} className={field} />
                </label>
              </>
            ) : null}
            {kind !== "STENCIL" ? (
              <label className="text-sm">
                <span className="mb-1.5 block text-muted-foreground">Expires</span>
                <input name="expiresAt" type="date" defaultValue={day(current?.expiresAt ?? null)} className={field} />
              </label>
            ) : null}
            <label className="text-sm">
              <span className="mb-1.5 block text-muted-foreground">Where</span>
              <input name="location" defaultValue={current?.location ?? ""} placeholder={kind === "SOLDER_PASTE" ? "Paste fridge" : "Rack"} className={field} />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-muted-foreground">Lot</span>
              <input name="lot" defaultValue={current?.lot ?? ""} className={field} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="h-10 rounded-md border px-4 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
