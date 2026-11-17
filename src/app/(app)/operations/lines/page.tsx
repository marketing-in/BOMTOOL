import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { loadLines } from "@/server/lines";
import type { EffectiveCapability } from "@/lib/ops/machines";
import { machineCard } from "@/lib/ops/machine-card";
import { measuredCph } from "@/lib/ops/line-time";
import { PageHeader } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { AddMachineDialog, DuplicateLineButton, EditLineButton, LineDialog, RemoveLineButton } from "@/components/ops/line-editor";
import { LineStage } from "@/components/ops/line-stage";
import { cn } from "@/lib/utils";

export const metadata = { title: "Lines" };

const TYPE_LABEL: Record<string, string> = { SMT: "SMT", THT: "Through-hole", MIXED: "SMT + THT", BOX_BUILD: "Box build" };

/** What the line can do, as chips. Values the machines state are marked; the rest come from the line's own summary. */
function capChips(cap: EffectiveCapability): { label: string; fromMachines: boolean }[] {
  const from = new Set(cap.fromMachines);
  const chip = (key: string, label: string | null) => (label ? [{ label, fromMachines: from.has(key) }] : []);
  return [
    ...chip("minChip", cap.minChip ? `Chips to ${cap.minChip}` : null),
    ...chip("minPitchMm", cap.minPitchMm ? `Pitch to ${cap.minPitchMm} mm` : null),
    ...chip("maxBoardMm", cap.maxBoardMm ? `Board up to ${cap.maxBoardMm[0]}×${cap.maxBoardMm[1]} mm` : null),
    ...chip("maxComponentHeightMm", cap.maxComponentHeightMm ? `Parts up to ${cap.maxComponentHeightMm} mm tall` : null),
    ...chip("bga", cap.bga ? "BGA / QFN with X-ray" : null),
    ...chip("doubleSided", cap.doubleSided ? "Double-sided" : null),
    ...chip("nitrogenReflow", cap.nitrogenReflow ? "N₂ reflow" : null),
    ...chip("wave", cap.wave ? "Wave" : null),
    ...chip("selective", cap.selective ? "Selective" : null),
    ...chip("pressFit", cap.pressFit ? "Press-fit" : null),
    ...chip("conformalCoat", cap.conformalCoat ? "Conformal coat" : null),
    ...chip("ict", cap.ict ? "ICT" : null),
    ...chip("flyingProbe", cap.flyingProbe ? "Flying probe" : null),
    ...chip("harness", cap.harness ? "Harness" : null),
  ];
}

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

/** Our lines, one at a time: the line drawn in 3D, and what we know about each machine a click away. */
export default async function LinesPage({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const user = await requireUser();
  const editable = can(user.role, "lines.write");
  const [lines, { line: want }] = await Promise.all([loadLines(), searchParams]);
  const line = lines.find((l) => l.code === want) ?? lines[0] ?? null;

  return (
    <>
      <PageHeader
        title="Lines & machines"
        actions={
          editable ? (
            <LineDialog
              trigger={
                <Button className="h-10">
                  <Plus className="size-4" aria-hidden /> Add line
                </Button>
              }
            />
          ) : null
        }
      />

      {!line ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">No lines yet. {editable ? "Add the first one." : "Ask planning to set them up."}</div>
      ) : (
        <>
          <nav aria-label="Lines" className="mb-8 inline-flex flex-wrap gap-1 rounded-lg border bg-card p-1">
            {lines.map((l) => {
              const on = l.id === line.id;
              const busy = l.workOrders.length > 0;
              return (
                <Link
                  key={l.id}
                  href={`/operations/lines?line=${l.code}`}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-2.5 rounded-md px-4 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    !l.active && "opacity-60",
                  )}
                >
                  <span className="font-semibold">{l.code}</span>
                  <span className="hidden sm:inline">{TYPE_LABEL[l.type] ?? l.type}</span>
                  <span className={cn("size-2.5 rounded-full", busy ? "bg-risk-green" : "bg-risk-grey", on && "ring-2 ring-white/70")} title={busy ? "Has open work orders" : "No open work orders"} />
                </Link>
              );
            })}
          </nav>

          <section id={`line-${line.code}`} aria-label={`Line ${line.code}`}>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div className="min-w-0">
                <h2 className="text-2xl leading-tight font-semibold tracking-tight">{line.name.replace(/^.*—\s*/, "")}</h2>
                <ul className="mt-3 flex flex-wrap gap-1.5 text-sm">
                  {capChips(line.effective).map((c) => (
                    <li key={c.label} className={cn("rounded-md border px-2.5 py-1 text-[13px]", c.fromMachines ? "bg-card" : "border-dashed text-muted-foreground")} title={c.fromMachines ? "From its machines' limits" : "From the line's own summary — set the machines' limits to confirm"}>
                      {c.label}
                    </li>
                  ))}
                  {!line.active ? <li className="rounded-md bg-muted px-2.5 py-1 text-[13px] font-medium">Retired</li> : null}
                </ul>
              </div>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <dl className="flex gap-8">
                  {(() => {
                    const measured = measuredCph(line.machines);
                    const cph = measured ?? line.capacityCph;
                    return cph ? (
                      <div>
                        <dd className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{k(cph)}</dd>
                        <dt className="mt-1.5 text-xs text-muted-foreground">CPH {measured ? "measured" : "rated"}</dt>
                      </div>
                    ) : null;
                  })()}
                  {line.feederSlots ? (
                    <div>
                      <dd className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{line.feederSlots}</dd>
                      <dt className="mt-1.5 text-xs text-muted-foreground">feeder slots</dt>
                    </div>
                  ) : null}
                  <div>
                    <dd className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{line.shiftsPerDay}</dd>
                    <dt className="mt-1.5 text-xs text-muted-foreground">shifts a day</dt>
                  </div>
                </dl>
                {editable ? (
                  <div className="flex items-center gap-1">
                    <EditLineButton line={{ id: line.id, code: line.code, name: line.name, type: line.type, description: line.description ?? "", shiftsPerDay: line.shiftsPerDay, capacityCph: line.capacityCph, feederSlots: line.feederSlots, active: line.active, capability: (line.capability ?? {}) as Record<string, unknown>, fromMachines: Object.fromEntries(line.effective.fromMachines.map((key) => [key, (line.effective as Record<string, unknown>)[key]])) }} />
                    <DuplicateLineButton id={line.id} code={line.code} />
                    <RemoveLineButton id={line.id} code={line.code} hasWorkOrders={line._count.workOrders > 0} />
                  </div>
                ) : null}
              </div>
            </div>

            {line.machines.length ? (
              <LineStage key={line.id} machines={line.machines.map(machineCard)} editable={editable} />
            ) : (
              <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">No machines on this line yet.</div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              {editable ? <AddMachineDialog lineId={line.id} lineCode={line.code} /> : null}
              {line.workOrders.map((wo) => (
                <span key={wo.id} className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                  <RiskDot level={(wo.clearToBuildPct ?? 0) >= 90 ? "green" : "amber"} />
                  <span className="num">{wo.number}</span>
                  <span className="text-muted-foreground">{wo.project.name} · {wo.buildQty} pcs</span>
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
