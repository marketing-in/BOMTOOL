import Link from "next/link";
import { Check, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/data/page-header";
import { BOX_TYPES } from "@/knowledge/box-types";
import { ENCLOSURES } from "@/lib/board/enclosures";
import { makers, supplyByMpn } from "@/server/directory";
import { cn } from "@/lib/utils";
import { ViewTabs } from "@/components/directory/view-tabs";
import { EnclosureFinishList, MaterialTable } from "@/components/directory/box-materials";
import { ENCLOSURE_FINISHES, ENCLOSURE_MATERIALS } from "@/knowledge/enclosure-materials";
import { normaliseMpn } from "@/lib/normalise";

export const metadata = { title: "Box types" };

const SHIELD = { good: "Shields RF/ESD", partial: "Partial shielding", none: "No shielding" };
const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-IN"));

export default async function BoxTypesPage({ searchParams }: { searchParams: Promise<{ t?: string; view?: string }> }) {
  await requireUser();
  const { t, view = "types" } = await searchParams;
  const views = [
    { key: "types", label: "Box types", count: BOX_TYPES.length },
    { key: "materials", label: "Materials", count: ENCLOSURE_MATERIALS.length },
    { key: "finishes", label: "Surface finishes", count: ENCLOSURE_FINISHES.length },
  ];
  if (view !== "types") {
    return (
      <>
        <PageHeader title={view === "materials" ? "Enclosure materials" : "Enclosure surface finishes"} />
        <ViewTabs base="/directory/boxes" views={views} active={view} />
        {view === "materials" ? <MaterialTable /> : <EnclosureFinishList />}
        <p className="mt-4 text-xs text-muted-foreground">Typical values — the maker&apos;s datasheet decides.</p>
      </>
    );
  }
  const [{ boxMakers }, enclosures] = await Promise.all([makers(), db.part.findMany({ where: { category: { slug: "enclosure" } }, select: { mpn: true, description: true, manufacturer: { select: { name: true } } } })]);
  const supply = await supplyByMpn(enclosures.map((e) => e.mpn));
  return (
    <>
      <PageHeader title="Box types" />
      <ViewTabs base="/directory/boxes" views={views} active="types" />
      <div className="space-y-4">
        {BOX_TYPES.map((b) => {
          const ours = enclosures.filter((e) => b.enclosureStyle && ENCLOSURES[e.mpn]?.style === b.enclosureStyle);
          const fit = boxMakers.map((m) => ({ m, ok: m.capabilities.styles.includes(b.makerStyle) })).sort((x, y) => Number(y.ok) - Number(x.ok));
          return (
            <details key={b.slug} id={b.slug} open={t === b.slug} className="scroll-mt-24 rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{b.name}</span>
                  <span className="block text-sm text-muted-foreground">{b.summary}</span>
                </span>
                <span className="num text-xs text-muted-foreground">{b.ip[0]}–{b.ip[1]}</span>
                <span className="text-xs text-muted-foreground">{SHIELD[b.shielding]}</span>
                <span className="text-xs">{ours.length} in catalogue · {fit.filter((x) => x.ok).length} makers</span>
              </summary>
              <div className="grid gap-6 border-t px-4 py-4 lg:grid-cols-3">
                <div className="space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Materials: </span>{b.materials.join(" · ")}</p>
                  <p><span className="text-muted-foreground">Used for: </span>{b.uses.join(" · ")}</p>
                  <p><span className="text-muted-foreground">Machining: </span>{b.machining}</p>
                  <p className="text-xs"><span className="text-risk-green">+</span> {b.pros.join(" · ")}</p>
                  <p className="text-xs"><span className="text-risk-red">−</span> {b.cons.join(" · ")}</p>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Enclosures we carry</div>
                  {ours.length ? (
                    <ul className="mt-1 divide-y">
                      {ours.map((e) => {
                        const s = supply.get(normaliseMpn(e.mpn));
                        return (
                          <li key={e.mpn} className="py-2 text-sm">
                            {s ? <Link href={`/parts/${s.partId}`} className="num font-medium hover:underline">{e.mpn}</Link> : <span className="num font-medium">{e.mpn}</span>} <span className="text-xs text-muted-foreground">· {e.manufacturer.name}</span>
                            <span className="block text-xs text-muted-foreground">{e.description}</span>
                            {s ? <span className="num block text-xs">ours {k(s.ours)} · partners {k(s.partners)} · distributors {k(s.distributors)}</span> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">None in the catalogue yet</p>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Box makers</div>
                  <ul className="mt-1 divide-y">
                    {fit.map(({ m, ok }) => (
                      <li key={m.id} className={cn("flex items-start gap-2 py-2 text-sm", !ok && "text-muted-foreground")}>
                        {ok ? <Check className="mt-0.5 size-4 shrink-0 text-risk-green" aria-label="Makes this type" /> : <X className="mt-0.5 size-4 shrink-0 text-risk-amber" aria-label="Doesn't make this type" />}
                        <span className="min-w-0 flex-1">
                          {m.name}
                          <span className="block text-xs text-muted-foreground">up to {m.capabilities.ipMax} · {m.capabilities.services.join(", ")}</span>
                        </span>
                        <span className="num text-xs">{m.capabilities.leadDays} d</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
