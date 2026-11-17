import Link from "next/link";
import Form from "next/form";
import { ArrowRight, Box, CircuitBoard, Search } from "lucide-react";
import { DICTIONARY, DICTIONARY_STATS, GROUPS, SECTIONS, entriesIn, groupOf, searchDictionary, type DictGroup } from "@/knowledge/dictionary";
import { CIRCUITS } from "@/knowledge/circuits";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { GROUP_ICON } from "@/components/dictionary/group-icon";

export const metadata = { title: "Component & machine dictionary" };

export default async function DictionaryPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string }> }) {
  const { q, group } = await searchParams;
  const hits = q ? searchDictionary(q) : null;
  const g = GROUPS.find((x) => x.key === group);
  const letters = new Map<string, typeof DICTIONARY>();
  for (const e of [...DICTIONARY].sort((a, b) => a.name.localeCompare(b.name))) {
    const L = /^[a-z]/i.test(e.name) ? e.name[0].toUpperCase() : "#";
    letters.set(L, [...(letters.get(L) ?? []), e]);
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex gap-2">
            <Link href="/knowledge" className="hover:text-foreground">Knowledge</Link>
            <span aria-hidden>/</span>
            <span>Dictionary</span>
          </span>
        }
        title={
          <span className="flex flex-wrap items-baseline gap-x-2.5">
            Component & machine dictionary <span className="num text-base font-normal text-muted-foreground">{DICTIONARY_STATS.entries} entries</span>
          </span>
        }
      />

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Form action="/knowledge/dictionary" className="relative min-w-0 flex-1 basis-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="dq" className="sr-only">Search the dictionary</label>
          <input
            id="dq"
            name="q"
            defaultValue={q}
            placeholder="LDO, AMS1117, MLCC, reflow oven…"
            className="h-11 w-full rounded-md border bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </Form>
        <Link href="/knowledge/circuits" className="inline-flex h-11 items-center gap-2 rounded-md border bg-card px-3 text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
          <CircuitBoard className="size-4 text-primary" aria-hidden /> {CIRCUITS.length} application circuits
        </Link>
        <Link href="/knowledge/explore" className="inline-flex h-11 items-center gap-2 rounded-md border bg-card px-3 text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
          <Box className="size-4 text-primary" aria-hidden /> 3D explorers
        </Link>
      </div>

      {hits ? (
        <section aria-labelledby="results">
          <h2 id="results" className="mb-3 text-lg font-semibold tracking-tight">
            {hits.length} result{hits.length === 1 ? "" : "s"} for “{q}”
          </h2>
          {hits.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {hits.map(({ entry: e }) => (
                <EntryCard key={e.slug} slug={e.slug} name={e.name} oneLiner={e.oneLiner} group={e.group} />
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border bg-card">
              <EmptyState title="Nothing found">Try a family, a function or a part number.</EmptyState>
            </div>
          )}
        </section>
      ) : g ? (
        <section aria-labelledby="group">
          <div className="mb-4 flex items-center gap-2">
            <Link href="/knowledge/dictionary" className="text-sm text-muted-foreground hover:text-foreground">All groups</Link>
            <span aria-hidden className="text-muted-foreground">/</span>
            <h2 id="group" className="text-lg font-semibold tracking-tight" title={g.blurb}>{g.label}</h2>
          </div>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {entriesIn(g.key).map((e) => (
              <EntryCard key={e.slug} slug={e.slug} name={e.name} oneLiner={e.oneLiner} group={e.group} />
            ))}
          </ul>
        </section>
      ) : (
        <>
          {SECTIONS.map((section) => (
            <section key={section} aria-labelledby={`s-${section}`} className="mb-8">
              <h2 id={`s-${section}`} className="mb-3 text-lg font-semibold tracking-tight">
                {section}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {GROUPS.filter((x) => x.section === section).map((x) => {
                  const Icon = GROUP_ICON[x.key];
                  const list = entriesIn(x.key);
                  return (
                    <Link
                      key={x.key}
                      href={`/knowledge/dictionary?group=${x.key}`}
                      title={x.blurb}
                      className="group flex flex-col rounded-xl border bg-card p-4 outline-none transition-colors duration-150 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <span className="grid size-9 place-items-center rounded-md bg-part-soft text-primary">
                          <Icon className="size-4.5" aria-hidden />
                        </span>
                        <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{list.length}</span>
                      </div>
                      <span className="mt-3 text-sm font-medium">{x.label}</span>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{list.slice(0, 4).map((e) => e.name.replace(/\s*\(.*\)$/, "")).join(" · ")}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          <section aria-labelledby="az" className="overflow-hidden rounded-xl border bg-card">
            <h2 id="az" className="flex h-12 items-center border-b px-4 text-base font-semibold">A–Z</h2>
            <div className="columns-1 gap-8 px-4 py-4 sm:columns-2 lg:columns-3 xl:columns-4">
              {[...letters.entries()].map(([L, list]) => (
                <div key={L} className="mb-4 break-inside-avoid">
                  <div className="num mb-1 text-xs font-semibold text-primary">{L}</div>
                  <ul className="space-y-0.5">
                    {list.map((e) => (
                      <li key={e.slug}>
                        <Link href={`/knowledge/dictionary/${e.slug}`} className="text-sm text-foreground/85 hover:text-foreground hover:underline">
                          {e.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function EntryCard({ slug, name, oneLiner, group }: { slug: string; name: string; oneLiner: string; group: DictGroup }) {
  const Icon = GROUP_ICON[group];
  return (
    <li>
      <Link
        href={`/knowledge/dictionary/${slug}`}
        className="group flex h-full gap-3 rounded-xl border bg-card p-4 outline-none transition-colors duration-150 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-part-soft text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {name}
            <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100" aria-hidden />
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{groupOf(group).label}</span>
          <span className="mt-1.5 line-clamp-2 block text-sm leading-relaxed text-foreground/80">{oneLiner}</span>
        </span>
      </Link>
    </li>
  );
}
