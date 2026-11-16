import { Plus, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { loadLines } from "@/server/lines";
import { kindOf, readSpecs, specCoverage, type EffectiveCapability } from "@/lib/ops/machines";
import { assistantMode } from "@/server/assistant";
import { PageHeader } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { AddMachineDialog, DuplicateLineButton, EditLineButton, LineDialog, MachineDialog, MachineOrderButtons, RemoveLineButton } from "@/components/ops/line-editor";
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

const SOURCE_TAG: Record<string, { label: string; cls: string }> = {
  claude: { label: "AI", cls: "bg-primary/10 text-primary" },
  typical: { label: "Typical", cls: "bg-risk-amber-soft text-risk-amber" },
  manual: { label: "Typed in", cls: "bg-muted text-muted-foreground" },
};

export default async function LinesPage() {
  const user = await requireUser();
  const editable = can(user.role, "lines.write");
  const lines = await loadLines();
  const mode = assistantMode();

  return (
    <>
      <PageHeader
        title="Lines & machines"
        description="Our lines, machine by machine. Every BoM and Gerber set is checked against these machines' limits: smallest chip, finest pitch, board size, tallest part, X-ray, wave, coating and test."
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

      {editable ? (
        <p className="mb-5 flex items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            Open a machine to set its limits. <span className="font-medium text-foreground">Look up with AI</span> finds them from the maker&apos;s datasheet
            {mode === "mock" ? " — with no AI key set it offers typical values for that kind of machine instead" : ""}. Nothing is saved until you check the values and press Save.
          </span>
        </p>
      ) : null}

      {!lines.length ? (
        <div className="rounded-lg border bg-card px-6 py-12 text-center text-sm text-muted-foreground">No lines yet. {editable ? "Add the first one to start checking BoMs against your machines." : "Ask planning to set them up."}</div>
      ) : null}

      <div className="space-y-5">
        {lines.map((line) => {
          const chips = capChips(line.effective);
          const smt = line.type === "SMT" || line.type === "MIXED";
          return (
            <section key={line.id} id={`line-${line.code}`} className={cn("scroll-mt-24 rounded-lg border bg-card target:ring-2 target:ring-primary/50", !line.active && "opacity-70")}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="num rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{line.code}</span>
                    <h2 className="font-semibold">{line.name.replace(/^.*—\s*/, "")}</h2>
                    <span className="text-xs text-muted-foreground">{TYPE_LABEL[line.type] ?? line.type}</span>
                    {!line.active ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">Retired</span> : null}
                  </div>
                  {line.description ? <p className="mt-0.5 max-w-[75ch] text-sm text-muted-foreground">{line.description}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <dl className="num flex gap-6 text-sm">
                    {smt && line.capacityCph ? <div><dt className="text-[11px] text-muted-foreground">Capacity</dt><dd>{(line.capacityCph / 1000).toFixed(0)}k CPH</dd></div> : null}
                    {smt && line.feederSlots ? <div><dt className="text-[11px] text-muted-foreground">Feeder slots</dt><dd>{line.feederSlots}</dd></div> : null}
                    <div><dt className="text-[11px] text-muted-foreground">Shifts</dt><dd>{line.shiftsPerDay}</dd></div>
                  </dl>
                  {editable ? (
                    <div className="flex items-center gap-1">
                      <EditLineButton line={{ id: line.id, code: line.code, name: line.name, type: line.type, description: line.description ?? "", shiftsPerDay: line.shiftsPerDay, capacityCph: line.capacityCph, feederSlots: line.feederSlots, active: line.active, capability: (line.capability ?? {}) as Record<string, unknown>, fromMachines: Object.fromEntries(line.effective.fromMachines.map((k) => [k, (line.effective as Record<string, unknown>)[k]])) }} />
                      <DuplicateLineButton id={line.id} code={line.code} />
                      <RemoveLineButton id={line.id} code={line.code} hasWorkOrders={line._count.workOrders > 0} />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* The board's path through the line, left to right. */}
              <ol className="flex items-stretch gap-2 overflow-x-auto px-4 py-4" aria-label={`Machines on ${line.code}, in flow order`}>
                {line.machines.map((m, i) => {
                  const { specs, source } = readSpecs(m.specs);
                  const cover = specCoverage(m.type, specs);
                  const tag = source ? SOURCE_TAG[source.by] : null;
                  const label = `${m.vendor} ${m.model}`;
                  return (
                    <li key={m.id} className="flex shrink-0 items-center gap-2">
                      <div className="flex w-48 flex-col rounded-md border bg-background">
                        <MachineDialog
                          machine={{ id: m.id, type: m.type, vendor: m.vendor, model: m.model, specs, source }}
                          editable={editable}
                          trigger={
                            <button type="button" className="flex-1 rounded-t-md px-3 pt-2 pb-1.5 text-left outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${label}: open its limits`}>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-xs font-semibold">{kindOf(m.type).label}</span>
                                <span className="num text-[10px] text-muted-foreground">{m.position}</span>
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={label}>{m.vendor}</div>
                              <div className="truncate text-[11px] text-muted-foreground" title={label}>{m.model}</div>
                              {cover.of ? (
                                <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                                  <RiskDot level={cover.have === cover.of ? "green" : cover.have ? "amber" : "grey"} />
                                  <span className="text-muted-foreground">{cover.have} of {cover.of} limits</span>
                                  {tag ? <span className={cn("ml-auto rounded px-1 py-px text-[10px] font-medium", tag.cls)}>{tag.label}</span> : null}
                                </div>
                              ) : null}
                            </button>
                          }
                        />
                        {editable ? (
                          <div className="flex justify-end border-t px-1">
                            <MachineOrderButtons id={m.id} first={i === 0} last={i === line.machines.length - 1} label={label} />
                          </div>
                        ) : null}
                      </div>
                      {i < line.machines.length - 1 ? <span aria-hidden className="h-px w-3 bg-border" /> : null}
                    </li>
                  );
                })}
                {editable ? (
                  <li className="flex shrink-0">
                    <AddMachineDialog lineId={line.id} lineCode={line.code} />
                  </li>
                ) : null}
                {!line.machines.length && !editable ? <li className="text-sm text-muted-foreground">No machines on file.</li> : null}
              </ol>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 text-xs">
                <span className="text-muted-foreground">Can do:</span>
                <ul className="flex flex-wrap gap-1.5">
                  {chips.length ? (
                    chips.map((c) => (
                      <li key={c.label} className={cn("rounded px-1.5 py-0.5", c.fromMachines ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")} title={c.fromMachines ? "From its machines' limits" : "From the line's own summary — set the machines' limits to confirm"}>
                        {c.label}
                      </li>
                    ))
                  ) : (
                    <li className="text-muted-foreground">Nothing on file yet — set its machines&apos; limits.</li>
                  )}
                </ul>
                <span className="ml-auto flex items-center gap-3 text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-primary/30" aria-hidden /> from machines</span>
                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-muted-foreground/30" aria-hidden /> line summary</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t px-4 py-2.5 text-xs">
                {line.workOrders.length ? (
                  line.workOrders.map((wo) => (
                    <span key={wo.id} className="inline-flex items-center gap-1.5">
                      <RiskDot level={(wo.clearToBuildPct ?? 0) >= 90 ? "green" : "amber"} />
                      <span className="num">{wo.number}</span>
                      <span className="text-muted-foreground">{wo.project.name} · {wo.buildQty} pcs</span>
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">No open work orders</span>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
