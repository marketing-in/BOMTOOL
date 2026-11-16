import Link from "next/link";
import Form from "next/form";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/data/page-header";
import { normaliseMpn } from "@/lib/normalise";
import { masterCategories, masterCategory, searchPartMaster } from "@/lib/directory/part-master";
import { partMaster, supplyByMpn } from "@/server/directory";
import { db } from "@/lib/db";
import { ViewTabs } from "@/components/directory/view-tabs";
import { ComponentFamilies } from "@/components/directory/component-families";
import { COMPONENT_FAMILIES } from "@/knowledge/component-families";

export const metadata = { title: "Component directory" };

const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-IN"));

export default async function ComponentDirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string; c?: string; page?: string; view?: string }> }) {
  await requireUser();
  const { q = "", c = "", page = "1", view = "families" } = await searchParams;
  const rows = partMaster();
  const views = [
    { key: "families", label: "Families", count: COMPONENT_FAMILIES.length },
    { key: "parts", label: "Reference parts", count: rows.length },
  ];
  if (view !== "parts") {
    const counts = await db.category.findMany({ select: { slug: true, _count: { select: { parts: true } } } });
    const inCatalogue = new Map(counts.map((x) => [x.slug, x._count.parts]));
    return (
      <>
        <PageHeader title="Components" description="Every family of electronic component — what it is, its kinds and packages, what defines it, who makes it and what matters on our line. Each opens our catalogue, the reference list, or a live search of everything the distributors carry." />
        <ViewTabs base="/directory/components" views={views} active="families" />
        <Form action="/directory/components" className="mb-5 flex flex-wrap gap-2">
          <label htmlFor="cf-q" className="sr-only">Search families</label>
          <input id="cf-q" name="q" defaultValue={q} placeholder="MOSFET, ceramic, USB-C, Murata…" className="h-10 min-w-56 flex-1 rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm" />
          <button className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">Find</button>
        </Form>
        <ComponentFamilies inCatalogue={inCatalogue} q={q} />
        <p className="mt-6 text-xs text-muted-foreground">No list can hold every part in the world — distributors carry tens of millions of MPNs and they change daily. This is the map of every family; the live search reaches every part DigiKey and Mouser list today.</p>
      </>
    );
  }
  const cats = masterCategories(rows);
  const r = searchPartMaster(rows, q, c || null, Number(page) || 1);
  const supply = await supplyByMpn(r.rows.map((x) => x.mpn));
  const href = (p: number) => `/directory/components?${new URLSearchParams({ view: "parts", ...(q ? { q } : {}), ...(c ? { c } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Components" description="Reference list of commonly sourced semiconductors and resistors. Parts in our catalogue show where we can get them; the rest are one click from a live distributor search." />
      <ViewTabs base="/directory/components" views={views} active="parts" />
      <Form action="/directory/components" className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="view" value="parts" />
        <label htmlFor="cd-q" className="sr-only">Search components</label>
        <input id="cd-q" name="q" defaultValue={q} placeholder="LM358, 10k 0603, buck 3A, ESP32…" className="h-10 min-w-56 flex-1 rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm" />
        <label htmlFor="cd-c" className="sr-only">Category</label>
        <select id="cd-c" name="c" defaultValue={c} className="h-10 rounded-md border bg-card px-2 text-sm">
          <option value="">All ({rows.length.toLocaleString("en-IN")})</option>
          {cats.map((x) => (
            <option key={x.name} value={x.name}>{x.name} ({x.count})</option>
          ))}
        </select>
        <button className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">Search</button>
      </Form>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-normal">MPN</th>
              <th className="px-3 py-2 font-normal">Category</th>
              <th className="px-3 py-2 font-normal">Description</th>
              <th className="px-3 py-2 font-normal">Package</th>
              <th className="px-3 py-2 font-normal">Alternates / cross-ref</th>
              <th className="px-4 py-2 text-right font-normal" title="Our inventory · channel partners · distributors">Ours · partners · distributors</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {r.rows.map((x, i) => {
              const sup = supply.get(normaliseMpn(x.mpn));
              return (
                <tr key={`${x.mpn}-${i}`}>
                  <td className="px-4 py-2">
                    <span className="num font-medium">{x.mpn}</span>
                    <span className="block truncate text-xs text-muted-foreground">{x.manufacturer}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{masterCategory(x)}{x.kind === "semi" ? <span className="block text-muted-foreground">{x.subType}</span> : <span className="block text-muted-foreground">{x.type}</span>}</td>
                  <td className="max-w-80 px-3 py-2 text-xs">
                    {x.kind === "semi" ? x.description : `${x.value} · ${x.tolerance} · ${x.power} · ${x.maxV} · ${x.tcr}`}
                    {x.kind === "semi" && x.specs ? <span className="block text-muted-foreground">{x.specs}</span> : null}
                  </td>
                  <td className="num px-3 py-2 text-xs">{x.kind === "semi" ? `${x.package} · ${x.mount}` : x.size}</td>
                  <td className="max-w-64 px-3 py-2 text-xs text-muted-foreground">{x.kind === "semi" ? x.alternates : x.crossRef}</td>
                  <td className="px-4 py-2 text-right text-xs">
                    {sup ? (
                      <Link href={`/parts/${sup.partId}`} className="num hover:underline">{k(sup.ours)} · {k(sup.partners)} · {k(sup.distributors)}</Link>
                    ) : (
                      <Link href={`/parts/market?q=${encodeURIComponent(x.mpn)}`} className="text-muted-foreground hover:text-foreground hover:underline">Search distributors →</Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!r.rows.length ? <p className="px-4 py-3 text-sm text-muted-foreground">Nothing matches — try fewer words, or search distributors.</p> : null}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="num text-muted-foreground">{r.total.toLocaleString("en-IN")} parts · page {r.page} of {r.pages}</span>
        <span className="flex gap-2">
          {r.page > 1 ? <Link href={href(r.page - 1)} className="rounded-md border px-3 py-1.5 hover:bg-muted">Previous</Link> : null}
          {r.page < r.pages ? <Link href={href(r.page + 1)} className="rounded-md border px-3 py-1.5 hover:bg-muted">Next</Link> : null}
        </span>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Reference data from circuitflow&apos;s part master — not verified purchasing data. Check the datasheet before designing a part in.</p>
    </>
  );
}
