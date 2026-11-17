import { Check, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/data/page-header";
import { PCB_TECHNOLOGIES } from "@/knowledge/pcb-technologies";
import { fabsFor } from "@/lib/directory/recognise";
import { makers } from "@/server/directory";
import { cn } from "@/lib/utils";
import { ViewTabs } from "@/components/directory/view-tabs";
import { FeatureList, FinishTable, LaminateTable } from "@/components/directory/pcb-materials";
import { BOARD_FEATURES, FINISHES, LAMINATES } from "@/knowledge/pcb-materials";

export const metadata = { title: "PCB technologies" };

const range = ([a, b]: [number, number], unit = "") => (a === b ? `${a}${unit}` : `${a}–${b}${unit}`);

export default async function PcbDirectoryPage({ searchParams }: { searchParams: Promise<{ t?: string; view?: string }> }) {
  await requireUser();
  const { t, view = "technologies" } = await searchParams;
  const views = [
    { key: "technologies", label: "Technologies", count: PCB_TECHNOLOGIES.length },
    { key: "laminates", label: "Laminates", count: LAMINATES.length },
    { key: "finishes", label: "Surface finishes", count: FINISHES.length },
    { key: "features", label: "Build features", count: BOARD_FEATURES.length },
  ];
  if (view !== "technologies") {
    const title = views.find((v) => v.key === view)?.label ?? "PCB";
    return (
      <>
        <PageHeader title={`PCB — ${title.toLowerCase()}`} />
        <ViewTabs base="/directory/pcb" views={views} active={view} />
        {view === "laminates" ? <LaminateTable /> : view === "finishes" ? <FinishTable /> : <FeatureList />}
        <p className="mt-4 text-xs text-muted-foreground">Typical values — the maker&apos;s datasheet decides.</p>
      </>
    );
  }
  const { fabs } = await makers();
  return (
    <>
      <PageHeader title="PCB technologies" />
      <ViewTabs base="/directory/pcb" views={views} active="technologies" />
      <div className="space-y-4">
        {PCB_TECHNOLOGIES.map((tech) => {
          const fit = fabsFor(tech.needs, fabs);
          const able = fit.filter((f) => f.fits);
          return (
            <details key={tech.slug} id={tech.slug} open={t === tech.slug} className="group scroll-mt-24 rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{tech.name}</span>
                  <span className="block text-sm text-muted-foreground">{tech.summary}</span>
                </span>
                <span className="num text-xs text-muted-foreground">{range(tech.layers)} layers · {range(tech.thicknessMm, " mm")} · {range(tech.copperOz, " oz")}</span>
                <span className="num rounded-md bg-muted px-1.5 py-0.5 text-xs" title="Relative bare-board cost, 2-layer FR-4 = 1">cost ×{tech.costIndex}</span>
                <span className={cn("text-xs", able.length ? "text-risk-green" : "text-risk-amber")}>{able.length} fab{able.length === 1 ? "" : "s"}</span>
              </summary>
              <div className="grid gap-6 border-t px-4 py-4 lg:grid-cols-2">
                <div className="space-y-3 text-sm">
                  <p><span className="text-muted-foreground">Choose it when: </span>{tech.choose}</p>
                  <p><span className="text-muted-foreground">Used for: </span>{tech.uses.join(" · ")}</p>
                  <p><span className="text-muted-foreground">Finishes: </span>{tech.finishes.join(", ")} · <span className="text-muted-foreground">min trace</span> <span className="num">{tech.minTraceMm} mm</span></p>
                  <p className="num"><span className="font-sans text-muted-foreground">Typical lead: </span>{tech.leadDays.proto} d prototype · {tech.leadDays.production} d production</p>
                  <div>
                    <div className="text-xs text-muted-foreground">Layout checks</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {tech.dfm.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Who builds it</div>
                  <ul className="mt-1 divide-y">
                    {fit.map((f) => (
                      <li key={f.id} className={cn("flex items-start gap-2 py-2 text-sm", !f.fits && "text-muted-foreground")}>
                        {f.fits ? <Check className="mt-0.5 size-4 shrink-0 text-risk-green" aria-label="Can build" /> : <X className="mt-0.5 size-4 shrink-0 text-risk-amber" aria-label="Cannot build" />}
                        <span className="min-w-0 flex-1">
                          {f.name} <span className="text-xs text-muted-foreground">· {f.country}</span>
                          <span className="block text-xs text-muted-foreground">
                            {f.fits ? `up to ${f.capabilities.maxLayers} layers · ${f.capabilities.finishes.join(", ")} · ${f.capabilities.certifications.join(", ")}` : f.gaps.join("; ")}
                          </span>
                        </span>
                        <span className="num text-xs">{f.capabilities.leadDays.proto} d</span>
                      </li>
                    ))}
                  </ul>
                  {!fit.length ? <p className="mt-2 text-sm text-muted-foreground">No fabricators on file — run <code>npm run vendors:sync</code>.</p> : null}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
