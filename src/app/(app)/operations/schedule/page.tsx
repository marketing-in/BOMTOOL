import Link from "next/link";
import { db } from "@/lib/db";
import { WO_STATUS } from "@/lib/ops/labels";
import { PageHeader } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { cn } from "@/lib/utils";

export const metadata = { title: "Schedule" };

const DAYS = 14;
const DAY = 86_400_000;

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAYS * DAY);
  const [lines, wos] = await Promise.all([
    db.line.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.workOrder.findMany({
      where: { status: { notIn: ["DONE", "CANCELLED"] } },
      include: { bomRevision: { include: { bom: true } }, project: true },
      orderBy: { plannedStart: "asc" },
    }),
  ]);
  const days = Array.from({ length: DAYS }, (_, i) => new Date(start.getTime() + i * DAY));
  const unscheduled = wos.filter((w) => !w.plannedStart || !w.lineId);

  return (
    <>
      <PageHeader
        title="Line schedule"
        description="Next 14 days by line. Move a job from its work-order page (Schedule)."
        actions={
          <div className="inline-flex rounded-md border bg-muted p-0.5 text-sm">
            <Link href="/operations/schedule" className={cn("rounded-[5px] px-3 py-1.5", view !== "kanban" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>Timeline</Link>
            <Link href="/operations/schedule?view=kanban" className={cn("rounded-[5px] px-3 py-1.5", view === "kanban" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>Kanban</Link>
          </div>
        }
      />

      {view === "kanban" ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {(["PLANNED", "KITTING", "READY", "IN_PROGRESS", "ON_HOLD"] as const).map((s) => (
            <section key={s} className="rounded-lg border bg-card">
              <div className="flex h-10 items-center gap-2 border-b px-3 text-sm font-medium">
                <RiskDot level={WO_STATUS[s].level} />
                {WO_STATUS[s].label}
                <span className="num ml-auto text-xs text-muted-foreground">{wos.filter((w) => w.status === s).length}</span>
              </div>
              <ul className="space-y-2 p-2">
                {wos
                  .filter((w) => w.status === s)
                  .map((w) => (
                    <li key={w.id}>
                      <Link href={`/operations/work-orders/${w.id}`} className="block rounded-md border bg-background px-3 py-2 text-sm hover:border-foreground/20">
                        <div className="num font-medium">{w.number}</div>
                        <div className="truncate text-xs text-muted-foreground">{w.bomRevision.bom.name} · {w.buildQty} pcs</div>
                        <div className="num mt-1 text-xs">CTB {w.clearToBuildPct ?? "—"}%</div>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="relative overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid border-b text-xs text-muted-foreground" style={{ gridTemplateColumns: `8rem repeat(${DAYS}, 1fr)` }}>
                <div className="px-3 py-2">Line</div>
                {days.map((d) => (
                  <div key={d.toISOString()} className={cn("num border-l px-1 py-2 text-center", [0, 6].includes(d.getDay()) && "bg-muted/50")}>
                    {d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </div>
                ))}
              </div>
              {lines.map((l) => {
                const jobs = wos.filter((w) => w.lineId === l.id && w.plannedStart && w.plannedStart < end && (w.plannedEnd ?? w.plannedStart) >= start);
                return (
                  <div key={l.id} className="relative grid border-b last:border-b-0" style={{ gridTemplateColumns: `8rem repeat(${DAYS}, 1fr)`, minHeight: `${Math.max(1, jobs.length) * 2.75 + 1}rem` }}>
                    <div className="px-3 py-2">
                      <div className="num text-sm font-medium">{l.code}</div>
                      <div className="truncate text-xs text-muted-foreground">{l.name.replace(/^.*—\s*/, "")}</div>
                    </div>
                    {days.map((d) => (
                      <div key={d.toISOString()} className={cn("border-l", [0, 6].includes(d.getDay()) && "bg-muted/30")} />
                    ))}
                    {jobs.map((w, i) => {
                      const s = Math.max(0, Math.floor((w.plannedStart!.getTime() - start.getTime()) / DAY));
                      const e = Math.min(DAYS, Math.ceil(((w.plannedEnd ?? new Date(w.plannedStart!.getTime() + DAY)).getTime() - start.getTime()) / DAY));
                      return (
                        <Link
                          key={w.id}
                          href={`/operations/work-orders/${w.id}`}
                          title={`${w.number} · ${w.bomRevision.bom.name} · ${w.buildQty} pcs`}
                          className={cn(
                            "absolute flex h-9 items-center gap-1.5 overflow-hidden rounded-md border px-2 text-xs whitespace-nowrap transition-colors duration-150 hover:border-foreground/30",
                            w.status === "IN_PROGRESS" ? "border-risk-green/50 bg-risk-green-soft" : (w.clearToBuildPct ?? 0) >= 100 ? "bg-background" : "border-risk-amber/50 bg-risk-amber-soft",
                          )}
                          style={{ left: `calc(8rem + (100% - 8rem) * ${s / DAYS} + 2px)`, width: `calc((100% - 8rem) * ${Math.max(1, e - s) / DAYS} - 4px)`, top: `${0.5 + i * 2.75}rem` }}
                        >
                          <span className="num font-medium">{w.number}</span>
                          <span className="truncate text-muted-foreground">{w.bomRevision.bom.name}</span>
                          <span className="num ml-auto">{w.clearToBuildPct ?? "—"}%</span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {unscheduled.length ? (
        <section className="mt-6 rounded-lg border bg-card p-4">
          <h2 className="text-base font-medium">Not scheduled ({unscheduled.length})</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {unscheduled.map((w) => (
              <li key={w.id}>
                <Link href={`/operations/work-orders/${w.id}`} className="num inline-block rounded-md border px-2.5 py-1 text-xs hover:border-foreground/30">{w.number} · {w.bomRevision.bom.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
