import Link from "next/link";
import Form from "next/form";
import type { Lifecycle } from "@prisma/client";
import { db } from "@/lib/db";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoney } from "@/lib/currency";
import { LIFECYCLE_LABEL, LIFECYCLE_RISK } from "@/lib/risk";
import { listCategories, listParts } from "@/server/catalogue";
import { EmptyState, PageHeader } from "@/components/data/page-header";
import { LifecycleBadge, RiskDot } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { FileText, LibraryBig } from "lucide-react";
import { searchDictionary } from "@/knowledge/dictionary";
import { PartPhoto } from "@/components/data/part-photo";
import { PartsTabs } from "@/components/parts/parts-tabs";
import { SegBar } from "@/components/viz/seg-bar";
import { cn } from "@/lib/utils";

export const metadata = { title: "Parts catalogue" };

type Search = { q?: string; category?: string; lifecycle?: string; page?: string; maker?: string; pkg?: string; stock?: string };

const selectClass =
  "h-10 rounded-md border bg-card px-3 text-sm outline-none transition-[box-shadow,border-color] duration-150 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/30";

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export default async function PartsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const currency = await getDisplayCurrency();
  const lifecycle = sp.lifecycle && sp.lifecycle in LIFECYCLE_LABEL ? (sp.lifecycle as Lifecycle) : undefined;
  const [{ rows, total, page, pageCount, facets }, categories, byLifecycle] = await Promise.all([
    listParts({ q: sp.q, category: sp.category, lifecycle, page: Number(sp.page) || 1, maker: sp.maker, pkg: sp.pkg, inStock: sp.stock === "1" }, currency),
    listCategories(),
    db.part.groupBy({ by: ["lifecycle"], _count: { _all: true } }),
  ]);
  // The whole catalogue by lifecycle: a bar on top that doubles as a filter.
  const LC_ORDER: Lifecycle[] = ["ACTIVE", "NRND", "LAST_TIME_BUY", "EOL", "OBSOLETE", "UNKNOWN"];
  const lcCount = new Map(byLifecycle.map((r) => [r.lifecycle, r._count._all]));
  const lcTotal = [...lcCount.values()].reduce((a, b) => a + b, 0);
  const categoryName = categories.flatMap((c) => [{ slug: c.slug, name: c.name }, ...c.children]).find((c) => c.slug === sp.category)?.name;
  /** Same filters with one value changed (null removes it); always back to page 1. */
  const withParam = (key: keyof Search, value: string | null) => {
    const next: Record<string, string> = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== key)) as Record<string, string>;
    if (value) next[key] = value;
    return `/parts?${new URLSearchParams(next)}`;
  };

  // A family name or well-known part number ("LDO", "TVS", "AMS1117") also gets a dictionary pointer.
  const kinds = sp.q ? searchDictionary(sp.q, 3).filter((h) => h.score >= 40) : [];

  const pageHref = (p: number) => {
    p = Math.min(Math.max(1, p), pageCount);
    const params = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/parts?${params}`;
  };

  return (
    <>
      <PageHeader
        title={categoryName ?? "Parts catalogue"}
        eyebrow={categoryName ? <Link href="/parts/browse" className="hover:text-foreground">Browse categories</Link> : undefined}
      />
      <PartsTabs current="catalogue" />

      {lcTotal ? (
        <section aria-label="The catalogue by lifecycle" className="mb-6 rounded-xl border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <div className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{lcTotal.toLocaleString("en-IN")}</div>
              <div className="mt-1.5 text-xs text-muted-foreground">parts</div>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
              {LC_ORDER.filter((lc) => lcCount.get(lc)).map((lc) => (
                <li key={lc}>
                  <Link href={withParam("lifecycle", lifecycle === lc ? null : lc)} aria-current={lifecycle === lc ? "true" : undefined} className={cn("inline-flex items-center gap-1.5 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring", lifecycle === lc && "font-semibold")}>
                    <RiskDot level={LIFECYCLE_RISK[lc]} />
                    {LIFECYCLE_LABEL[lc]}
                    <span className="num text-muted-foreground">{lcCount.get(lc)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <SegBar thick legend={false} label="Parts by lifecycle" segs={LC_ORDER.filter((lc) => lcCount.get(lc)).map((lc) => ({ key: lc, label: LIFECYCLE_LABEL[lc], value: lcCount.get(lc) ?? 0, color: `var(--risk-${LIFECYCLE_RISK[lc]})` }))} />
        </section>
      ) : null}

      <Form action="/parts" className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="q" className="sr-only">Search</label>
        <input
          id="q"
          name="q"
          defaultValue={sp.q}
          placeholder="MPN, manufacturer, description…"
          className={`${selectClass} min-w-0 flex-1 basis-64`}
        />
        <label htmlFor="category" className="sr-only">Category</label>
        <select id="category" name="category" defaultValue={sp.category ?? ""} className={selectClass}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <optgroup key={c.slug} label={c.name}>
              <option value={c.slug}>All {c.name.toLowerCase()}</option>
              {c.children.map((ch) => (
                <option key={ch.slug} value={ch.slug}>
                  {ch.name} ({ch._count.parts})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <label htmlFor="lifecycle" className="sr-only">Lifecycle</label>
        <select id="lifecycle" name="lifecycle" defaultValue={lifecycle ?? ""} className={selectClass}>
          <option value="">Any lifecycle</option>
          {Object.entries(LIFECYCLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <Button type="submit" className="h-10">Filter</Button>
        {sp.maker ? <input type="hidden" name="maker" value={sp.maker} /> : null}
        {sp.pkg ? <input type="hidden" name="pkg" value={sp.pkg} /> : null}
        {sp.stock ? <input type="hidden" name="stock" value={sp.stock} /> : null}
        {sp.q || sp.category || lifecycle ? (
          <Button asChild variant="ghost" className="h-10"><Link href="/parts">Clear</Link></Button>
        ) : null}
      </Form>

      {kinds.length ? (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-card px-4 py-2.5 text-sm">
          <LibraryBig className="size-4 text-primary" aria-hidden />
          <span className="text-muted-foreground">In the dictionary:</span>
          {kinds.map(({ entry: e }, i) => (
            <span key={e.slug}>
              <Link href={`/knowledge/dictionary/${e.slug}`} className="font-medium hover:underline">{e.name}</Link>
              {i < kinds.length - 1 ? <span className="text-muted-foreground">,</span> : null}
            </span>
          ))}
        </p>
      ) : null}

      <div className={cn("grid gap-4", sp.category && "lg:grid-cols-[220px_minmax(0,1fr)]")}>
      {sp.category ? (
        <aside aria-label="Filters" className="space-y-4 text-sm">
          <FacetList title="Manufacturer" facets={facets.makers} active={sp.maker} href={(v) => withParam("maker", v)} />
          <FacetList title="Package" facets={facets.packages} active={sp.pkg} href={(v) => withParam("pkg", v)} />
          <div className="rounded-xl border bg-card px-4 py-3">
            <Link href={withParam("stock", sp.stock === "1" ? null : "1")} className="flex items-center gap-2" aria-pressed={sp.stock === "1"}>
              <span className={cn("grid size-4 place-items-center rounded border", sp.stock === "1" && "border-primary bg-primary text-primary-foreground")} aria-hidden>
                {sp.stock === "1" ? "✓" : null}
              </span>
              In stock only
            </Link>
          </div>
        </aside>
      ) : null}
      <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="w-12 px-3 py-2.5 font-normal"><span className="sr-only">Photo</span></th>
                <th className="px-4 py-2.5 font-normal">MPN</th>
                <th className="px-4 py-2.5 font-normal">Manufacturer</th>
                <th className="px-4 py-2.5 font-normal">Description</th>
                <th className="px-4 py-2.5 font-normal">Package</th>
                <th className="px-4 py-2.5 font-normal">Lifecycle</th>
                <th className="px-4 py-2.5 text-right font-normal">Our stock</th>
                <th className="px-4 py-2.5 text-right font-normal">Market stock</th>
                <th className="px-4 py-2.5 text-right font-normal">Sources</th>
                <th className="px-4 py-2.5 text-right font-normal">Best @1k</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors duration-150 hover:bg-muted/50">
                  <td className="px-3 py-1.5">
                    <span className="grid size-9 place-items-center overflow-hidden rounded border bg-white">
                      <PartPhoto src={r.imageUrl} alt="" className="max-h-full max-w-full" />
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/parts/${r.id}`} className="num font-medium hover:underline">{r.mpn}</Link>
                    {r.datasheetUrl ? (
                      <a href={r.datasheetUrl} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-foreground" title="Datasheet">
                        <FileText className="size-3.5" aria-label={`${r.mpn} datasheet`} />
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{r.manufacturer}</td>
                  <td className="max-w-[28rem] truncate px-4 py-2.5 text-muted-foreground" title={r.description}>{r.description}</td>
                  <td className="num px-4 py-2.5 text-xs whitespace-nowrap text-muted-foreground">{r.package ?? "—"}</td>
                  <td className="px-4 py-2.5"><LifecycleBadge lifecycle={r.lifecycle} /></td>
                  <td className="num px-4 py-2.5 text-right">
                    {r.internalStock > 0 ? (
                      <span className="inline-flex items-center gap-1.5"><RiskDot level="green" />{compact.format(r.internalStock)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-right">{r.marketStock ? compact.format(r.marketStock) : <span className="text-risk-red">0</span>}</td>
                  <td className="num px-4 py-2.5 text-right">{r.sources}</td>
                  <td className="num px-4 py-2.5 text-right whitespace-nowrap">{r.bestUnit === null ? "—" : formatMoney(r.bestUnit, currency, { unit: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No parts match">
            {sp.q ? <Link href={`/parts/market?q=${encodeURIComponent(sp.q)}`} className="underline">Search the distributors for “{sp.q}”</Link> : null}
          </EmptyState>
        ) : null}
        <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
          <span className="num">{total} {total === 1 ? "part" : "parts"} · page {page} of {pageCount}</span>
          <div className="flex gap-1">
            <Button asChild variant="ghost" size="sm" className={page <= 1 ? "pointer-events-none opacity-40" : ""}>
              <Link href={pageHref(page - 1)} aria-disabled={page <= 1}>Previous</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className={page >= pageCount ? "pointer-events-none opacity-40" : ""}>
              <Link href={pageHref(page + 1)} aria-disabled={page >= pageCount}>Next</Link>
            </Button>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

function FacetList({ title, facets, active, href }: { title: string; facets: { value: string; count: number }[]; active?: string; href: (v: string | null) => string }) {
  if (!facets.length) return null;
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <h2 className="border-b px-4 py-2.5 text-sm font-semibold">{title}</h2>
      <ul className="max-h-64 overflow-y-auto py-1">
        {facets.map((f) => {
          const on = active === f.value;
          return (
            <li key={f.value}>
              <Link
                href={href(on ? null : f.value)}
                aria-current={on ? "true" : undefined}
                className={cn("flex items-center justify-between gap-2 px-4 py-1.5 transition-colors duration-150 hover:bg-muted/50", on && "bg-part-soft font-semibold")}
              >
                <span className="truncate">{f.value}</span>
                <span className="num shrink-0 text-xs text-muted-foreground">{f.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
