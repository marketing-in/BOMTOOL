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
        description={`This board on ${pick ? `our ${pick.code}` : "a generic line"}: ${flow}. ${smt} parts placed. Press play; click a machine to see its cycle, its sheet figures and its process data.`}
      />
      {ours.length > 1 ? (
        <div role="group" aria-label="Line" className="mb-4 inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {ours.map((l) => {
            const on = l.code === pick?.code;
            return (
              <Link
                key={l.code}
                href={sectionHref(id, "line", { ...(searchParams.qty ? { qty: searchParams.qty } : {}), smt: l.code })}
                scroll={false}
                aria-current={on ? "true" : undefined}
                className={cn("inline-flex h-9 items-center gap-1.5 rounded-md px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-card font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {l.code}
                {l.code === best ? <span className="text-xs font-normal text-risk-green">best fit</span> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
      <LineLoader data={data} line={pick?.sim ?? null} />
      <p className="mt-3 text-xs text-muted-foreground">
        Stations, machine names and rates come from our machine sheets (Factory → Lines &amp; machines): printer cycle, SPI area rate, the placement rate measured on our floor, the oven&apos;s heated
        length, the AOI&apos;s field of view. The process models are circuitflow&apos;s (src/vendor/circuitflow); inspection results are simulated — repeatable for this board — not measurements from
        our machines.
      </p>
    </>
  );
}
