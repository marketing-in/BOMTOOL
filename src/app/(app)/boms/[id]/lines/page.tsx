import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { lineTimeFor } from "@/server/line-time";
import { CHIP_ORDER, kindOf, readSpecs } from "@/lib/ops/machines";
import { PageHeader } from "@/components/data/page-header";
import { LineFitPanel } from "@/components/ops/line-fit";
import { cn } from "@/lib/utils";

export const metadata = { title: "Line fit" };

const when = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
const day = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const h1 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const pair = (p?: [number, number]) => (p ? `${p[0]} × ${p[1]}` : "—");

function Head({ n, title, note }: { n: string; title: string; note?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t pt-6">
      <span className="num w-8 text-xs text-muted-foreground">{n}</span>
      <h2 className="text-base font-semibold">{title}</h2>
      {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
    </div>
  );
}

/**
 * Step 5, line fit: which of our lines and machines can build this board (smallest chip, finest pitch, largest and
 * tallest part, board size — machine by machine), how long the lot takes on each line, what the lines really took on
 * older jobs, and what they are running now, so the earliest finish is one read.
 */
export default async function LineFitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qty?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const want = Number((await searchParams).qty);
  const t = await lineTimeFor(id, Number.isFinite(want) && want > 0 ? want : undefined);
  if (!t) notFound();
  const canEdit = can(user.role, "lines.write");
  const placements = t.job.sides.reduce((s, x) => s + x.placements, 0);
  const best = [...t.estimates]
    .map((e) => ({ e, now: t.now.find((n) => n.lineId === e.lineId)!, fit: t.plant.lines.find((l) => l.lineId === e.lineId)?.level }))
    .filter((x) => x.fit === "green" || x.fit === "amber")
    .sort((a, b) => a.now.finishAt.getTime() - b.now.finishAt.getTime())[0];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Line fit"
        description={`Can our lines build ${t.product?.name ?? t.title}, and how long it takes: ${placements.toLocaleString("en-IN")} placements a board on ${t.job.sides.length === 2 ? "both sides" : "one side"}, ${t.qty.toLocaleString("en-IN")} boards.`}
        actions={
          t.quantities.length > 1 ? (
            <nav aria-label="Lot size" className="flex gap-1 text-sm">
              {t.quantities.map((q) => (
                <Link key={q} href={`/boms/${id}/lines?qty=${q}`} aria-current={q === t.qty ? "true" : undefined} className={cn("num rounded-sm px-2.5 py-1.5", q === t.qty ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                  {q.toLocaleString("en-IN")}
                </Link>
              ))}
            </nav>
          ) : null
        }
      />

      {best ? (
        <section aria-label="Earliest finish" className="grid gap-6 border-y py-5 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Best line</div>
            <div className="mt-1 text-xl font-semibold">{best.e.code}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Running time</div>
            <div className="num mt-1 text-xl font-semibold">{h1(best.e.fromHistory?.totalHours ?? best.e.totalHours)} h</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Line free</div>
            <div className="mt-1 text-xl font-semibold">{when(best.now.freeAt)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Lot finishes</div>
            <div className="mt-1 text-xl font-semibold text-primary">{when(best.now.finishAt)}</div>
          </div>
        </section>
      ) : null}

      <section>
        <Head n="5.1" title="Machines against this board" note="each station judged with its own limits" />
        <LineFitPanel plant={t.plant} canEdit={canEdit} />
      </section>

      <section>
        <Head n="5.2" title="Machine details" note={canEdit ? <Link href="/operations/lines" className="text-primary hover:underline">Edit, or look up a machine by brand and year with AI →</Link> : undefined} />
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
                        {source?.by === "claude" ? <span className="ml-2 text-xs text-primary" title={source.notes}>AI · {source.confidence}</span> : source?.by === "typical" ? <span className="ml-2 text-xs text-muted-foreground">typical</span> : null}
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
      </section>

      <section>
        <Head n="5.3" title="Running time on each line" note={`${t.qty.toLocaleString("en-IN")} boards · ${h1(t.rates.hoursPerShift)} productive hours a shift`} />
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
                    <td className="num py-2 pr-4 text-right">{e.fromHistory ? <span title={`${e.fromHistory.jobs} finished job(s) at ${e.fromHistory.secondsPerPlacement} s a placement`}>{h1(e.fromHistory.totalHours)}</span> : <span className="text-muted-foreground">no history</span>}</td>
                    <td className="num py-2 text-right">{h1(e.days)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Estimate: placements ÷ (line CPH × {Math.round(t.rates.smtEfficiency * 100)} % efficiency), at least {t.rates.smtMinCycleSec} s a side, plus {t.rates.smtSetupHoursPerSide} h set-up a side and the lot&apos;s through-hole, test and box hours. From older jobs: the same lot at the seconds per placement the line really ran.
        </p>
      </section>

      <section>
        <Head n="5.4" title="Older projects" note="finished work orders, this product first" />
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
                    <td className="py-2 pr-4"><Link href={`/operations/work-orders/${h.id}`} className="font-mono text-xs text-primary hover:underline">{h.number}</Link></td>
                    <td className="py-2 pr-4">{h.project} <span className="text-muted-foreground">rev {h.revision}</span>{h.sameProject ? <span className="ml-2 text-xs font-medium text-primary">this product</span> : null}</td>
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
          <p className="text-sm text-muted-foreground">No finished work orders yet. Once a work order is set to In progress and then Done, its real running time appears here and re-prices new boards.</p>
        )}
      </section>

      <section>
        <Head n="5.5" title="Lines now" note="in progress and queued" />
        <ul className="divide-y border-y">
          {t.now.map((n) => {
            const line = t.lines.find((l) => l.id === n.lineId)!;
            return (
              <li key={n.lineId} className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_12rem_12rem]">
                <div className="font-medium">{n.code} <span className="font-normal text-muted-foreground">{line.shiftsPerDay} shift{line.shiftsPerDay === 1 ? "" : "s"}</span></div>
                <div className="min-w-0">
                  {n.running ? (
                    <span>Running {n.running.number} · {n.running.project} · <span className="num">{h1(n.running.hoursLeft)}</span> h left</span>
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
