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
        actions={
          <nav aria-label="View" className="inline-flex gap-1 rounded-lg border bg-card p-1 text-sm">
            <Link href="/operations/schedule" aria-current={view !== "kanban" ? "page" : undefined} className={cn("flex h-9 items-center rounded-md px-4 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring", view !== "kanban" ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>Timeline</Link>
            <Link href="/operations/schedule?view=kanban" aria-current={view === "kanban" ? "page" : undefined} className={cn("flex h-9 items-center rounded-md px-4 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring", view === "kanban" ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>Kanban</Link>
          </nav>
        }
      />

      {view === "kanban" ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {(["PLANNED", "KITTING", "READY", "IN_PROGRESS", "ON_HOLD"] as const).map((s) => (
            <section key={s} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex h-11 items-center gap-2 border-b px-4 text-sm font-semibold">
                <RiskDot level={WO_STATUS[s].level} />
                {WO_STATUS[s].label}
                <span className="num ml-auto text-lg font-semibold tracking-tight">{wos.filter((w) => w.status === s).length}</span>
              </div>
              <ul className="divide-y">
                {wos
                  .filter((w) => w.status === s)
                  .map((w) => (
                    <li key={w.id}>
                      <Link href={`/operations/work-orders/${w.id}`} className="block px-4 py-2.5 text-sm outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">
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
        <div className="overflow-hidden rounded-xl border bg-card" title="Move a job from its work-order page (Schedule)">
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
                            w.status === "IN_PROGRESS" ? "border-risk-green/50 bg-risk-green-soft" : (w.clearToBuildPct ?? 0) >= 100 ? "bg-card" : "border-risk-amber/50 bg-risk-amber-soft",
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
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Not scheduled <span className="num text-muted-foreground">{unscheduled.length}</span></h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unscheduled.map((w) => (
              <li key={w.id}>
                <Link href={`/operations/work-orders/${w.id}`} className="num inline-flex h-9 items-center rounded-md border bg-card px-3 text-[13px] outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">{w.number} · {w.bomRevision.bom.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
