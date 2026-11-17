import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDisplayCurrency } from "@/lib/prefs";
import { getViewerData } from "@/server/board-view";
import { lineFitFor } from "@/server/lines";
import { simLine } from "@/lib/ops/sim-stations";
import { sectionHref } from "@/lib/bom/workflow";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/data/page-header";
import { LineLoader } from "@/components/line/line-loader";

/**
 * This board on one of our SMT lines: the line's own machines in flow order (src/lib/ops/sim-stations.ts) with the
 * rates from our machine sheets, starting on the line the line fit picks. `smt` in the query picks another line.
 */
export default async function SmtLineSection({ id, searchParams }: { id: string; searchParams: { smt?: string; qty?: string } }) {
  await requireUser();
  const [data, lines, plant] = await Promise.all([
    getViewerData(id, await getDisplayCurrency()),
    db.line.findMany({ where: { active: true, type: { in: ["SMT", "MIXED"] } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: { machines: { orderBy: { position: "asc" } } } }),
    lineFitFor(id),
  ]);
  if (!data) notFound();
  const ours = lines.map((l) => ({ code: l.code, name: l.name, sim: simLine(l) })).filter((l): l is { code: string; name: string; sim: NonNullable<ReturnType<typeof simLine>> } => !!l.sim);
  const best = plant?.use.smt ?? null;
  const pick = ours.find((l) => l.code === searchParams.smt) ?? ours.find((l) => l.code === best) ?? ours[0] ?? null;
  const smt = data.parts.filter((p) => !p.dnp).length;
  const flow = pick ? pick.sim.stations.map((s) => s.machine).join(" → ") : "loader → paste printer → SPI → pick-and-place → reflow → AOI → X-ray";

  return (
    <>
      <PageHeader
        level={2}
        title={pick ? pick.name : "SMT line"}
        eyebrow={<span title={flow}>{pick ? pick.code : "Generic line"} · <span className="num">{smt}</span> parts placed</span>}
      />
      {ours.length > 1 ? (
        <div role="group" aria-label="Line" className="mb-4 inline-flex gap-1 rounded-lg border bg-card p-1 text-sm">
          {ours.map((l) => {
            const on = l.code === pick?.code;
            return (
              <Link
                key={l.code}
                href={sectionHref(id, "line", { ...(searchParams.qty ? { qty: searchParams.qty } : {}), smt: l.code })}
                scroll={false}
                aria-current={on ? "true" : undefined}
                className={cn("inline-flex h-9 items-center gap-1.5 rounded-md px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                {l.code}
                {l.code === best ? <span className={cn("text-xs font-normal", on ? "text-primary-foreground/80" : "text-risk-green")}>best fit</span> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
      <LineLoader data={data} line={pick?.sim ?? null} />
      <p className="mt-3 text-xs text-muted-foreground" title="Stations and rates come from our machine sheets. Inspection results are simulated — repeatable for this board — not measurements from our machines.">
        <span className="rounded-md bg-risk-amber-soft px-2 py-0.5 font-medium text-risk-amber">Simulated</span> inspection results
      </p>
    </>
  );
}
