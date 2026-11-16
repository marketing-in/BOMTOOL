"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Copy, ExternalLink, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { addMachine, duplicateLine, lookupMachineLimits, moveMachine, removeLine, removeMachine, saveLine, saveMachine } from "@/app/(app)/operations/lines/actions";
import { CHIP_ORDER, LINE_CAP_FIELDS, MACHINE_KINDS, SPEC_FIELDS, kindOf, rolesOfType, specsFromLimits, type CapField, type MachineSpecs, type SpecKey, type SpecSource } from "@/lib/ops/machines";
import type { LookupResult } from "@/lib/assistant/machine-lookup";
import { cn } from "@/lib/utils";

const field = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/30";
const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

const LINE_TYPES = [
  { value: "SMT", label: "SMT" },
  { value: "THT", label: "Through-hole" },
  { value: "MIXED", label: "Mixed (SMT + THT)" },
  { value: "BOX_BUILD", label: "Box build" },
];

const done = (r: { error?: string; message?: string } | undefined) => {
  if (r?.error) toast.error(r.error);
  else if (r?.message) toast.success(r.message);
  return !r?.error;
};

// ── Lines

export type LineDraft = {
  id?: string;
  code: string;
  name: string;
  type: string;
  description: string;
  shiftsPerDay: number;
  capacityCph: number | null;
  feederSlots: number | null;
  active: boolean;
  /** The line's own summary, as stored. */
  capability?: Record<string, unknown>;
  /** What its machines already say, by key, for the hint beside each field. */
  fromMachines?: Record<string, unknown>;
};

const EMPTY_LINE: LineDraft = { code: "", name: "", type: "SMT", description: "", shiftsPerDay: 2, capacityCph: null, feederSlots: null, active: true };

const capText = (f: CapField, v: unknown) =>
  v === undefined || v === null ? "" : f.kind === "pair" && Array.isArray(v) ? `${v[0]}×${v[1]} mm` : f.kind === "bool" ? (v ? "yes" : "no") : `${v}${f.unit ? ` ${f.unit}` : ""}`;

/** Form strings from a stored summary: a pair becomes `<key>.0` / `<key>.1`, a yes/no "yes" or "no". */
function capToDraft(cap: Record<string, unknown> = {}): Draft {
  const d: Draft = {};
  for (const f of LINE_CAP_FIELDS) {
    const v = cap[f.key];
    if (f.kind === "pair" && Array.isArray(v)) {
      d[`${f.key}.0`] = String(v[0]);
      d[`${f.key}.1`] = String(v[1]);
    } else if (f.kind === "bool" && typeof v === "boolean") d[f.key] = v ? "yes" : "no";
    else if (v !== undefined && v !== null) d[f.key] = String(v);
  }
  return d;
}

/** The edits for the fields this type of line shows; null clears a value. */
function capFromDraft(type: string, d: Draft): Record<string, unknown> {
  const roles = rolesOfType(type);
  const out: Record<string, unknown> = {};
  for (const f of LINE_CAP_FIELDS.filter((x) => x.roles.some((r) => roles.includes(r)))) {
    if (f.kind === "pair") out[f.key] = Number(d[`${f.key}.0`]) > 0 && Number(d[`${f.key}.1`]) > 0 ? [Number(d[`${f.key}.0`]), Number(d[`${f.key}.1`])] : null;
    else if (f.kind === "number") out[f.key] = Number(d[f.key]) > 0 ? Number(d[f.key]) : null;
    else if (f.kind === "bool") out[f.key] = d[f.key] === "yes" ? true : d[f.key] === "no" ? false : null;
    else out[f.key] = d[f.key] || null;
  }
  return out;
}

export function LineDialog({ line, trigger }: { line?: LineDraft; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [d, setD] = useState<LineDraft>(line ?? EMPTY_LINE);
  const [cap, setCap] = useState<Draft>(capToDraft(line?.capability));
  const set = <K extends keyof LineDraft>(k: K, v: LineDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const smt = d.type === "SMT" || d.type === "MIXED";
  const roles = rolesOfType(d.type);
  const capFields = LINE_CAP_FIELDS.filter((f) => f.roles.some((r) => roles.includes(r)));
  const setC = (k: string, v: string) => setCap((x) => ({ ...x, [k]: v }));
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setD(line ?? EMPTY_LINE);
          setCap(capToDraft(line?.capability));
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{line ? `Edit ${line.code}` : "Add a line"}</DialogTitle>
          <DialogDescription>{line ? "Name, type, shifts and what the line can do. Its machines are edited on the line itself." : "Start the line here, then add its machines in the order a board goes through them."}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (done(await saveLine({ ...d, capability: capFromDraft(d.type, cap) }))) setOpen(false);
            });
          }}
        >
          <div>
            <label className={labelCls} htmlFor="line-code">Code</label>
            <input id="line-code" className={cn(field, "num")} value={d.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="L5" required maxLength={12} />
          </div>
          <div>
            <label className={labelCls} htmlFor="line-type">Type</label>
            <select id="line-type" className={field} value={d.type} onChange={(e) => set("type", e.target.value)}>
              {LINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="line-name">Name</label>
            <input id="line-name" className={field} value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="SMT Line 5 — Prototype" required maxLength={120} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="line-desc">What it is for</label>
            <input id="line-desc" className={field} value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="NPI and small runs, 0201 and fine pitch" maxLength={400} />
          </div>
          <div>
            <label className={labelCls} htmlFor="line-shifts">Shifts a day</label>
            <select id="line-shifts" className={field} value={d.shiftsPerDay} onChange={(e) => set("shiftsPerDay", Number(e.target.value))}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {smt ? (
            <>
              <div>
                <label className={labelCls} htmlFor="line-cph">Placement capacity (CPH)</label>
                <input id="line-cph" type="number" min={0} className={cn(field, "num")} value={d.capacityCph ?? ""} onChange={(e) => set("capacityCph", e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 60000" />
              </div>
              <div>
                <label className={labelCls} htmlFor="line-slots">Feeder slots</label>
                <input id="line-slots" type="number" min={0} className={cn(field, "num")} value={d.feederSlots ?? ""} onChange={(e) => set("feederSlots", e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 120" />
              </div>
            </>
          ) : null}
          {capFields.length ? (
            <fieldset className="rounded-lg border bg-muted/40 p-4 sm:col-span-2">
              <legend className="px-1 text-sm font-semibold">What the line can do</legend>
              <p className="mb-3 text-xs text-muted-foreground">Used wherever one of its machines has no limit of its own on file. Leave a field empty when the machines say it.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {capFields.map((f) => {
                  const id = `cap-${f.key}`;
                  const machines = line?.fromMachines?.[f.key];
                  const hint = machines !== undefined ? `Its machines say: ${capText(f, machines)}` : null;
                  return (
                    <div key={f.key}>
                      <label className={labelCls} htmlFor={f.kind === "pair" ? `${id}-0` : id}>{f.label}{f.unit ? ` (${f.unit})` : ""}</label>
                      {f.kind === "pair" ? (
                        <div className="flex items-center gap-2">
                          <input id={`${id}-0`} type="number" step="any" min={0} className={cn(field, "num")} value={cap[`${f.key}.0`] ?? ""} onChange={(e) => setC(`${f.key}.0`, e.target.value)} aria-label={`${f.label} length`} placeholder="L" />
                          <span aria-hidden className="text-muted-foreground">×</span>
                          <input type="number" step="any" min={0} className={cn(field, "num")} value={cap[`${f.key}.1`] ?? ""} onChange={(e) => setC(`${f.key}.1`, e.target.value)} aria-label={`${f.label} width`} placeholder="W" />
                        </div>
                      ) : f.kind === "number" ? (
                        <input id={id} type="number" step="any" min={0} className={cn(field, "num")} value={cap[f.key] ?? ""} onChange={(e) => setC(f.key, e.target.value)} />
                      ) : f.kind === "chip" ? (
                        <select id={id} className={cn(field, "num")} value={cap[f.key] ?? ""} onChange={(e) => setC(f.key, e.target.value)}>
                          <option value="">Not set</option>
                          {CHIP_ORDER.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <select id={id} className={field} value={cap[f.key] ?? ""} onChange={(e) => setC(f.key, e.target.value)}>
                          <option value="">Not set</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      )}
                      {hint ? <p className="mt-1 text-[11px] text-primary">{hint}</p> : null}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          {line ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={d.active} onChange={(e) => set("active", e.target.checked)} />
              In use — retired lines are left out of every build check
            </label>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" className="h-10" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} {line ? "Save line" : "Add line"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DuplicateLineButton({ id, code }: { id: string; code: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" className="h-9" disabled={pending} onClick={() => start(async () => void done(await duplicateLine(id)))} aria-label={`Duplicate ${code} with its machines`}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Copy className="size-4" aria-hidden />} Duplicate
    </Button>
  );
}

export function RemoveLineButton({ id, code, hasWorkOrders }: { id: string; code: string; hasWorkOrders: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 text-muted-foreground hover:text-risk-red"
      disabled={pending}
      onClick={() => {
        if (!confirm(hasWorkOrders ? `${code} has work orders, so it will be retired (kept, but left out of build checks). Go ahead?` : `Delete ${code} and its machines? This cannot be undone.`)) return;
        start(async () => void done(await removeLine(id)));
      }}
    >
      <Trash2 className="size-4" aria-hidden /> {hasWorkOrders ? "Retire" : "Delete"}
    </Button>
  );
}

// ── Machines

const MACHINE_OPTIONS = Object.entries(MACHINE_KINDS).map(([value, k]) => ({ value, label: k.label }));

export function AddMachineDialog({ lineId, lineCode }: { lineId: string; lineCode: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [d, setD] = useState({ type: "PICK_AND_PLACE", vendor: "", model: "" });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setD({ type: "PICK_AND_PLACE", vendor: "", model: "" }); }}>
      <DialogTrigger asChild>
        <button type="button" className="flex h-full min-h-24 w-44 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-sm text-muted-foreground outline-none transition-colors duration-150 hover:border-primary/50 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
          <Plus className="size-4" aria-hidden /> Add machine
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a machine to {lineCode}</DialogTitle>
          <DialogDescription>It goes at the end of the line; move it into place afterwards. Then open it to set its limits, or have AI look them up.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (done(await addMachine(lineId, d))) setOpen(false);
            });
          }}
        >
          <div>
            <label className={labelCls} htmlFor="m-type">Kind</label>
            <select id="m-type" className={field} value={d.type} onChange={(e) => setD((x) => ({ ...x, type: e.target.value }))}>
              {MACHINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="m-vendor">Make</label>
              <input id="m-vendor" className={field} value={d.vendor} onChange={(e) => setD((x) => ({ ...x, vendor: e.target.value }))} placeholder="Yamaha" required maxLength={80} />
            </div>
            <div>
              <label className={labelCls} htmlFor="m-model">Model</label>
              <input id="m-model" className={field} value={d.model} onChange={(e) => setD((x) => ({ ...x, model: e.target.value }))} placeholder="YRM20" required maxLength={120} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" className="h-10" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Add machine</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MachineOrderButtons({ id, first, last, label }: { id: string; first: boolean; last: boolean; label: string }) {
  const [pending, start] = useTransition();
  const btn = "grid size-8 place-items-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30";
  return (
    <div className="flex items-center">
      <button type="button" className={btn} disabled={first || pending} onClick={() => start(async () => void done(await moveMachine(id, -1)))} aria-label={`Move ${label} earlier in the line`}><ArrowUp className="size-3.5 -rotate-90" aria-hidden /></button>
      <button type="button" className={btn} disabled={last || pending} onClick={() => start(async () => void done(await moveMachine(id, 1)))} aria-label={`Move ${label} later in the line`}><ArrowDown className="size-3.5 -rotate-90" aria-hidden /></button>
      <button
        type="button"
        className={cn(btn, "hover:text-risk-red")}
        disabled={pending}
        onClick={() => {
          if (confirm(`Remove ${label} from the line?`)) start(async () => void done(await removeMachine(id)));
        }}
        aria-label={`Remove ${label}`}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

type Draft = Record<string, string>;

/** Form strings from stored limits: a pair becomes `<key>.0` and `<key>.1`. */
function toDraft(specs: MachineSpecs): Draft {
  const d: Draft = {};
  for (const [k, v] of Object.entries(specs)) {
    if (Array.isArray(v)) {
      d[`${k}.0`] = String(v[0]);
      d[`${k}.1`] = String(v[1]);
    } else if (typeof v === "boolean") d[k] = v ? "yes" : "no";
    else if (v !== undefined) d[k] = String(v);
  }
  return d;
}

function fromDraft(keys: SpecKey[], d: Draft): MachineSpecs {
  const out: Record<string, unknown> = {};
  const n = (s: string | undefined) => (s && Number(s) > 0 ? Number(s) : undefined);
  for (const k of keys) {
    const f = SPEC_FIELDS[k];
    if (f.kind === "pair") {
      const a = n(d[`${k}.0`]);
      const b = n(d[`${k}.1`]);
      if (a && b) out[k] = [a, b];
    } else if (f.kind === "number") {
      const v = n(d[k]);
      if (v) out[k] = v;
    } else if (f.kind === "bool") {
      if (d[k] === "yes") out[k] = true;
      if (d[k] === "no") out[k] = false;
    } else if (d[k]) out[k] = d[k];
  }
  return out as MachineSpecs;
}

const SOURCE_LABEL: Record<SpecSource["by"], string> = { manual: "Typed in", claude: "Looked up by AI", typical: "Typical for this kind" };

export type MachineDraft = { id: string; type: string; vendor: string; model: string; specs: MachineSpecs; source: SpecSource | null };

export function MachineDialog({ machine, editable, trigger }: { machine: MachineDraft; editable: boolean; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [looking, startLook] = useTransition();
  const [m, setM] = useState({ type: machine.type, vendor: machine.vendor, model: machine.model });
  const [d, setD] = useState<Draft>(toDraft(machine.specs));
  const [source, setSource] = useState<Omit<SpecSource, "at"> | null>(machine.source);
  const [found, setFound] = useState<{ result: LookupResult; mode: "claude" | "mock" } | null>(null);
  const [lookErr, setLookErr] = useState<string | null>(null);
  const kind = kindOf(m.type);

  const reset = () => {
    setM({ type: machine.type, vendor: machine.vendor, model: machine.model });
    setD(toDraft(machine.specs));
    setSource(machine.source);
    setFound(null);
    setLookErr(null);
  };
  // Changing a value by hand after a look-up makes the limits "typed in", with the look-up kept as a note.
  const edit = (k: string, v: string) => {
    setD((x) => ({ ...x, [k]: v }));
    if (source && source.by !== "manual") setSource({ ...source, by: "manual", notes: `Edited after ${source.by === "claude" ? "the AI look-up" : "typical values"}.${source.notes ? ` ${source.notes}` : ""}`.slice(0, 600) });
  };

  const lookUp = () => {
    setLookErr(null);
    startLook(async () => {
      const r = await lookupMachineLimits(m);
      if (r.error || !r.result) {
        setLookErr(r.error ?? "Nothing came back.");
        return;
      }
      setFound({ result: r.result, mode: r.mode ?? "mock" });
      setD(toDraft(specsFromLimits(m.type, r.result.limits)));
      setSource({ by: r.mode === "claude" ? "claude" : "typical", confidence: r.result.confidence, notes: [r.result.summary, r.result.notes].filter(Boolean).join(" ").slice(0, 600), sources: r.result.sources });
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{machine.vendor} {machine.model}</DialogTitle>
          <DialogDescription>The limits that decide what this {kind.label.toLowerCase()} can build. Every BoM is checked against them.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const specs = fromDraft(kind.fields, d);
            start(async () => {
              if (done(await saveMachine(machine.id, { machine: m, specs, source: source ?? { by: "manual" } }))) setOpen(false);
            });
          }}
        >
          <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls} htmlFor="md-type">Kind</label>
              <select id="md-type" className={field} value={m.type} onChange={(e) => setM((x) => ({ ...x, type: e.target.value }))}>
                {MACHINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="md-vendor">Make</label>
              <input id="md-vendor" className={field} value={m.vendor} onChange={(e) => setM((x) => ({ ...x, vendor: e.target.value }))} required maxLength={80} />
            </div>
            <div>
              <label className={labelCls} htmlFor="md-model">Model</label>
              <input id="md-model" className={field} value={m.model} onChange={(e) => setM((x) => ({ ...x, model: e.target.value }))} required maxLength={120} />
            </div>
          </fieldset>

          {kind.fields.length ? (
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Limits</div>
                  <div className="text-xs text-muted-foreground">{source ? SOURCE_LABEL[source.by] : "Not set yet"}{source?.confidence ? ` · ${source.confidence} confidence` : ""}</div>
                </div>
                {editable ? (
                  <Button type="button" variant="outline" className="h-10" onClick={lookUp} disabled={looking || !m.vendor.trim() || !m.model.trim()}>
                    {looking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4 text-primary" aria-hidden />}
                    {looking ? "Looking it up…" : "Look up with AI"}
                  </Button>
                ) : null}
              </div>
              {looking ? <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">Searching for the {m.vendor} {m.model} datasheet — this can take up to a minute.</p> : null}
              {lookErr ? <p role="alert" className="mt-3 rounded-md border border-risk-red/30 bg-risk-red-soft px-3 py-2 text-sm">{lookErr}</p> : null}
              {found ? (
                <div className={cn("mt-3 rounded-md border px-3 py-2.5 text-sm", found.mode === "claude" ? "border-primary/25 bg-primary/5" : "border-risk-amber/40 bg-risk-amber-soft")} aria-live="polite">
                  <p>{found.result.summary}</p>
                  {found.result.notes ? <p className="mt-1 text-xs text-muted-foreground">{found.result.notes}</p> : null}
                  {found.result.sources.length ? (
                    <ul className="mt-2 space-y-1 text-xs">
                      {found.result.sources.map((s) => (
                        <li key={s.url}>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                            {s.title || s.url} <ExternalLink className="size-3" aria-hidden />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-2 text-xs font-medium">Check the values below, change any that are wrong, then save.</p>
                </div>
              ) : null}

              <fieldset disabled={!editable} className="mt-4 grid gap-4 sm:grid-cols-2">
                {kind.fields.map((k) => {
                  const f = SPEC_FIELDS[k];
                  const id = `spec-${k}`;
                  return (
                    <div key={k}>
                      <label className={labelCls} htmlFor={f.kind === "pair" ? `${id}-0` : id}>
                        {f.label}{f.unit ? ` (${f.unit})` : ""}
                      </label>
                      {f.kind === "pair" ? (
                        <div className="flex items-center gap-2">
                          <input id={`${id}-0`} type="number" step="any" min={0} className={cn(field, "num")} value={d[`${k}.0`] ?? ""} onChange={(e) => edit(`${k}.0`, e.target.value)} aria-label={`${f.label} length`} placeholder="L" />
                          <span aria-hidden className="text-muted-foreground">×</span>
                          <input type="number" step="any" min={0} className={cn(field, "num")} value={d[`${k}.1`] ?? ""} onChange={(e) => edit(`${k}.1`, e.target.value)} aria-label={`${f.label} width`} placeholder="W" />
                        </div>
                      ) : f.kind === "number" ? (
                        <input id={id} type="number" step="any" min={0} className={cn(field, "num")} value={d[k] ?? ""} onChange={(e) => edit(k, e.target.value)} />
                      ) : f.kind === "chip" ? (
                        <select id={id} className={cn(field, "num")} value={d[k] ?? ""} onChange={(e) => edit(k, e.target.value)}>
                          <option value="">Not known</option>
                          {CHIP_ORDER.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : f.kind === "bool" ? (
                        <select id={id} className={field} value={d[k] ?? ""} onChange={(e) => edit(k, e.target.value)}>
                          <option value="">Not known</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : (
                        <select id={id} className={field} value={d[k] ?? ""} onChange={(e) => edit(k, e.target.value)}>
                          <option value="">Not known</option>
                          {f.choices!.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{f.help}</p>
                    </div>
                  );
                })}
              </fieldset>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This kind of station has no limits that change whether a board can be built.</p>
          )}

          {editable ? (
            <DialogFooter>
              <Button type="submit" className="h-10" disabled={pending || looking}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Save machine</Button>
            </DialogFooter>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditLineButton({ line }: { line: LineDraft }) {
  return (
    <LineDialog
      line={line}
      trigger={
        <Button variant="ghost" size="sm" className="h-9">
          <Pencil className="size-4" aria-hidden /> Edit
        </Button>
      }
    />
  );
}
