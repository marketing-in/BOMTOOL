import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { sectionHref } from "@/lib/bom/workflow";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { lineTimeFor } from "@/server/line-time";
import { CHIP_ORDER, kindOf, readSpecs } from "@/lib/ops/machines";
import { PageHeader } from "@/components/data/page-header";
import { LineFitPanel } from "@/components/ops/line-fit";
import { Figures } from "@/components/bom/figures";
import { cn } from "@/lib/utils";


const when = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
const day = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const h1 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const pair = (p?: [number, number]) => (p ? `${p[0]} × ${p[1]}` : "—");

/** A table that is not needed at first glance: its title and headline, opened on a tap. */
function Fold({ title, note, hint, children, open }: { title: string; note?: React.ReactNode; hint?: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl border bg-card">
      <summary title={hint} className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-5 py-3 outline-none select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <h3 className="text-base font-semibold">{title}</h3>
        {note ? <span className="ml-auto text-sm text-muted-foreground">{note}</span> : null}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180", !note && "ml-auto")} aria-hidden />
      </summary>
      <div className="border-t px-5 py-3">{children}</div>
    </details>
  );
}

/**
 * Step 4, section 1 — line fit: which of our lines and machines can build this board (smallest chip, finest pitch, largest and
 * tallest part, board size — machine by machine), how long the lot takes on each line, what the lines really took on
 * older jobs, and what they are running now, so the earliest finish is one read.
 */
export default async function LineFitSection({ id, searchParams }: { id: string; searchParams: { qty?: string } }) {
  const user = await requireUser();
  const want = Number(searchParams.qty);
  const t = await lineTimeFor(id, Number.isFinite(want) && want > 0 ? want : undefined);
  if (!t) notFound();
  const canEdit = can(user.role, "lines.write");
  const placements = t.job.sides.reduce((s, x) => s + x.placements, 0);
  const best = [...t.estimates]
    .map((e) => ({ e, now: t.now.find((n) => n.lineId === e.lineId)!, fit: t.plant.lines.find((l) => l.lineId === e.lineId)?.level }))
    .filter((x) => x.fit === "green" || x.fit === "amber")
    .sort((a, b) => a.now.finishAt.getTime() - b.now.finishAt.getTime())[0];

  return (
    <div className="space-y-5">
      <PageHeader level={2}
        title="Line possible"
        eyebrow={<span className="num">{placements.toLocaleString("en-IN")} placements · {t.job.sides.length === 2 ? "both sides" : "one side"} · {t.qty.toLocaleString("en-IN")} boards</span>}
        actions={
          t.quantities.length > 1 ? (
            <nav aria-label="Lot size" className="inline-flex gap-1 rounded-lg border bg-card p-1 text-sm">
              {t.quantities.map((q) => (
                <Link key={q} href={sectionHref(id, "lines", { qty: String(q) })} aria-current={q === t.qty ? "true" : undefined} className={cn("num inline-flex h-8 items-center rounded-md px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring", q === t.qty ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  {q.toLocaleString("en-IN")}
                </Link>
              ))}
            </nav>
          ) : null
        }
      />

      {best ? (
        <Figures
          label="Earliest finish"
          items={[
            { label: "Best line", value: best.e.code },
            { label: "Running time", value: h1(best.e.fromHistory?.totalHours ?? best.e.totalHours), unit: "h" },
            { label: "Line free", value: when(best.now.freeAt) },
            { label: "Lot finishes", value: when(best.now.finishAt) },
          ]}
        />
      ) : null}

      <LineFitPanel plant={t.plant} canEdit={canEdit} />

      <Fold title="Machine details" note={canEdit ? <Link href="/operations/lines" className="underline decoration-border hover:decoration-foreground">Edit</Link> : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Line</th>
                <th className="py-2 pr-4 font-medium">Machine</th>
                <th className="py-2 pr-4 font-medium">Brand · model</th>
                <th className="py-2 pr-4 text-right font-medium">Year</th>
                <th className="py-2 pr-4 text-right font-medium">Smallest chip</th>
                <th className="py-2 pr-4 text-right font-medium">Pitch mm</th>
                <th className="py-2 pr-4 text-right font-medium">Largest part mm</th>
                <th className="py-2 pr-4 text-right font-medium">Tallest mm</th>
                <th className="py-2 pr-4 text-right font-medium">Board mm</th>
                <th className="py-2 text-right font-medium">CPH</th>
              </tr>
            </thead>
            <tbody>
              {t.machines.flatMap((l) =>
                l.machines.map((m, i) => {
                  const { specs, source, extra } = readSpecs(m.specs);
                  const year = typeof extra.year === "number" ? extra.year : null;
                  const chipIdx = specs.minChip ? CHIP_ORDER.indexOf(specs.minChip as (typeof CHIP_ORDER)[number]) : -1;
                  return (
                    <tr key={m.id} className={cn("border-b", i === l.machines.length - 1 && "border-b-foreground/15")}>
                      <td className="py-2 pr-4 font-medium">{i === 0 ? l.code : ""}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{kindOf(m.type).label}</td>
                      <td className="py-2 pr-4">
                        {m.vendor} {m.model}
                        {source?.by === "claude" ? <span className="ml-2 text-xs text-muted-foreground" title={source.notes}>AI · {source.confidence}</span> : source?.by === "typical" ? <span className="ml-2 text-xs text-muted-foreground">typical</span> : null}
                      </td>
                      <td className="num py-2 pr-4 text-right">{year ?? "—"}</td>
                      <td className="num py-2 pr-4 text-right">{chipIdx >= 0 ? specs.minChip : "—"}</td>
                      <td className="num py-2 pr-4 text-right">{specs.minPitchMm ?? "—"}</td>
                      <td className="num py-2 pr-4 text-right">{pair(specs.maxComponentMm)}</td>
                      <td className="num py-2 pr-4 text-right">{specs.maxComponentHeightMm ?? "—"}</td>
                      <td className="num py-2 pr-4 text-right">{pair(specs.maxBoardMm)}</td>
                      <td className="num py-2 text-right">{specs.cph ? specs.cph.toLocaleString("en-IN") : "—"}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </Fold>

      <Fold
        title="Running time on each line"
        note={`${t.qty.toLocaleString("en-IN")} boards · ${h1(t.rates.hoursPerShift)} h a shift`}
        hint={`Estimate: placements ÷ (line CPH × ${Math.round(t.rates.smtEfficiency * 100)} % efficiency), at least ${t.rates.smtMinCycleSec} s a side, plus ${t.rates.smtSetupHoursPerSide} h set-up a side and the lot's through-hole, test and box hours. From older jobs: the whole lot at the seconds per placement the line really took on finished work orders.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Line</th>
                <th className="py-2 pr-4 font-medium">Fit</th>
                <th className="py-2 pr-4 text-right font-medium">s / board</th>
                <th className="py-2 pr-4 text-right font-medium">Set-up h</th>
                <th className="py-2 pr-4 text-right font-medium">SMT h</th>
                <th className="py-2 pr-4 text-right font-medium">Lot h (estimate)</th>
                <th className="py-2 pr-4 text-right font-medium">Lot h (from older jobs)</th>
                <th className="py-2 text-right font-medium">Days</th>
              </tr>
            </thead>
            <tbody>
              {t.estimates.map((e) => {
                const fit = t.plant.lines.find((l) => l.lineId === e.lineId)?.level ?? "na";
                return (
                  <tr key={e.lineId} className="border-b">
                    <td className="py-2 pr-4 font-medium">{e.code}</td>
                    <td className={cn("py-2 pr-4 text-xs font-medium", fit === "green" ? "text-risk-green" : fit === "amber" ? "text-risk-amber" : fit === "red" ? "text-risk-red" : "text-muted-foreground")}>
                      {fit === "green" ? "Fits" : fit === "amber" ? "Check" : fit === "red" ? "Does not fit" : "—"}
                    </td>
                    <td className="num py-2 pr-4 text-right">{h1(e.secondsPerBoard)}</td>
                    <td className="num py-2 pr-4 text-right">{h1(e.setupHours)}</td>
                    <td className="num py-2 pr-4 text-right">{h1(e.smtHours)}</td>
                    <td className="num py-2 pr-4 text-right font-medium">{h1(e.totalHours)}</td>
                    <td className="num py-2 pr-4 text-right">{e.fromHistory ? <span title={`${e.fromHistory.jobs} finished job(s) at ${e.fromHistory.secondsPerPlacement} s a placement, whole lot`}>{h1(e.fromHistory.totalHours)}</span> : <span className="text-muted-foreground">no history</span>}</td>
                    <td className="num py-2 text-right">{h1(e.days)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Fold>

      <Fold title="Older projects" note={<span className="num">{t.history.length}</span>}>
        {t.history.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Work order</th>
                  <th className="py-2 pr-4 font-medium">Project</th>
                  <th className="py-2 pr-4 font-medium">Line</th>
                  <th className="py-2 pr-4 text-right font-medium">Qty</th>
                  <th className="py-2 pr-4 font-medium">Finished</th>
                  <th className="py-2 pr-4 text-right font-medium">Line h</th>
                  <th className="py-2 pr-4 text-right font-medium">s / board</th>
                  <th className="py-2 text-right font-medium">s / placement</th>
                </tr>
              </thead>
              <tbody>
                {t.history.slice(0, 12).map((h) => (
                  <tr key={h.id} className="border-b">
                    <td className="py-2 pr-4"><Link href={`/operations/work-orders/${h.id}`} className="num text-xs underline decoration-border hover:decoration-foreground">{h.number}</Link></td>
                    <td className="py-2 pr-4">{h.project} <span className="text-muted-foreground">rev {h.revision}</span>{h.sameProject ? <span className="ml-2 rounded-md bg-part-soft px-1.5 py-0.5 text-xs font-medium">this product</span> : null}</td>
                    <td className="py-2 pr-4">{h.lineCode ?? "—"}</td>
                    <td className="num py-2 pr-4 text-right">{h.qty.toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-4">{day(h.end)}{h.basis === "planned" ? <span className="ml-1 text-xs text-muted-foreground">(planned)</span> : null}</td>
                    <td className="num py-2 pr-4 text-right">{h1(h.lineHours)}</td>
                    <td className="num py-2 pr-4 text-right">{h1(h.secondsPerBoard)}</td>
                    <td className="num py-2 text-right">{h.secondsPerPlacement ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No finished work orders yet.</p>
        )}
      </Fold>

      <section aria-labelledby="lines-now">
        <h3 id="lines-now" className="mb-3 text-lg font-semibold tracking-tight">Lines now</h3>
        <ul className="divide-y rounded-xl border bg-card px-5">
          {t.now.map((n) => {
            const line = t.lines.find((l) => l.id === n.lineId)!;
            return (
              <li key={n.lineId} className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_12rem_12rem]">
                <div className="font-medium">{n.code} <span className="font-normal text-muted-foreground">{line.shiftsPerDay} shift{line.shiftsPerDay === 1 ? "" : "s"}</span></div>
                <div className="min-w-0">
                  {n.running ? (
                    <span>
                      Running {n.running.number} · {n.running.project} ·{" "}
                      {n.running.overrun ? <span className="text-risk-amber">plan ended {when(n.running.endsAt)}, still running</span> : <><span className="num">{h1(n.running.hoursLeft)}</span> h left</>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Idle</span>
                  )}
                  {n.queued.length ? <span className="text-muted-foreground"> · then {n.queued.map((q) => q.number).join(", ")}</span> : null}
                </div>
                <div><span className="text-xs text-muted-foreground">Free </span>{when(n.freeAt)}</div>
                <div><span className="text-xs text-muted-foreground">This lot done </span>{when(n.finishAt)}</div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
