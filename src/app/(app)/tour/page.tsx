import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { TOUR, tourStops } from "@/knowledge/tour";
import { PageHeader } from "@/components/data/page-header";

export const metadata = { title: "App tour" };

export default async function TourPage() {
  const user = await requireUser();
  // The tour opens real pages: the newest BoM that has been analysed stands in for "a BoM".
  // Of the recent ones, the BoM with the most lines matched to parts shows the pages at their fullest.
  const recent = await db.bomRevision.findMany({
    where: { status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, revision: true, bom: { select: { name: true } }, _count: { select: { lines: { where: { partId: { not: null } } } } } },
  });
  const sample = [...recent].sort((a, b) => b._count.lines - a._count.lines)[0] ?? null;
  const link = (href: string) => (href.includes("{bom}") ? (sample ? href.replace("{bom}", sample.id) : "/boms") : href);
  const total = tourStops().length;
  let n = 0;
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-baseline gap-2.5">
            App tour <span className="num text-base font-normal text-muted-foreground">{total} stops</span>
          </span>
        }
      />
      <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="font-medium">{ROLE_LABELS[user.role]}</span>
        <span className="text-muted-foreground" title="Product stops open this BoM">
          {sample ? `${sample.bom.name} rev ${sample.revision}` : "No BoM yet — upload one first."}
        </span>
        <nav aria-label="Chapters" className="flex flex-wrap gap-1.5 sm:ml-auto">
          {TOUR.map((c) => (
            <a key={c.key} href={`#${c.key}`} className="num grid size-8 place-items-center rounded-md border bg-card text-xs outline-none hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring" aria-label={c.title}>
              {c.title.split(" ")[0]}
            </a>
          ))}
        </nav>
      </div>

      <div className="space-y-8">
        {TOUR.map((c) => (
          <section key={c.key} id={c.key} aria-labelledby={`${c.key}-title`} className="scroll-mt-20">
            <h2 id={`${c.key}-title`} title={c.summary} className="mb-3 text-lg font-semibold tracking-tight">{c.title}</h2>
            <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {c.stops.map((s) => {
                n += 1;
                return (
                  <li key={s.key} className="flex flex-col rounded-xl border bg-card p-5">
                    <div className="flex items-start gap-3">
                      <span className="num grid size-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold">{s.title}</h3>
                        <p className="text-xs text-muted-foreground">{s.who}</p>
                      </div>
                    </div>
                    <details className="group mt-3">
                      <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">What to try <span className="num font-normal group-open:hidden">{s.tryIt.length}</span></summary>
                    <p className="mt-2 text-sm">{s.what}</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {s.tryIt.map((t) => (
                        <li key={t} className="flex gap-2">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                    </details>
                    <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-4">
                      <span className="text-[11px] text-muted-foreground">{s.menu}</span>
                      <Link href={link(s.href)} className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">
                        Open <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
