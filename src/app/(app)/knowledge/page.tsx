import Link from "next/link";
import Form from "next/form";
import type { KnowledgeDomain } from "@prisma/client";
import { Boxes, BookOpen, Cpu, Factory, Layers, PackageOpen, ScrollText, Search } from "lucide-react";
import { db } from "@/lib/db";
import { DOMAIN_LABEL, PROCESSES } from "@/knowledge";
import { searchKnowledge } from "@/server/knowledge";
import { searchDictionary } from "@/knowledge/dictionary";
import { GROUP_ICON } from "@/components/dictionary/group-icon";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { KnowledgeEntrances } from "@/components/knowledge/entrances";

export const metadata = { title: "Knowledge" };

const ORDER: KnowledgeDomain[] = ["PCB", "PCBA", "BOX_BUILD", "COMPONENT", "PACKAGE", "STANDARD", "PROCESS"];
const ICON: Record<KnowledgeDomain, typeof Cpu> = { PCB: Layers, PCBA: Cpu, BOX_BUILD: Boxes, COMPONENT: Cpu, PACKAGE: PackageOpen, STANDARD: ScrollText, PROCESS: Factory };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [articles, hits] = await Promise.all([
    db.knowledgeArticle.findMany({ orderBy: { title: "asc" }, select: { slug: true, title: true, summary: true, domain: true } }),
    q ? searchKnowledge(q) : Promise.resolve(null),
  ]);
  const kinds = q ? searchDictionary(q, 6) : [];
  const byDomain = new Map<KnowledgeDomain, typeof articles>();
  for (const a of articles) byDomain.set(a.domain, [...(byDomain.get(a.domain) ?? []), a]);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-baseline gap-2.5">
            Electronics knowledge <span className="num text-base font-normal text-muted-foreground">{articles.length} articles</span>
          </span>
        }
      />
      <Form action="/knowledge" className="relative mb-6 max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="kq" className="sr-only">Search knowledge</label>
        <input
          id="kq"
          name="q"
          defaultValue={q}
          placeholder="Search: MSL baking, ENIG, X7R DC bias, head-in-pillow, IPC class 3…"
          className="h-11 w-full rounded-md border bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </Form>

      {kinds.length ? (
        <section className="mb-6">
          <h2 className="mb-3 text-base font-medium">In the dictionary</h2>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {kinds.map(({ entry: e }) => {
              const Icon = GROUP_ICON[e.group];
              return (
                <li key={e.slug}>
                  <Link
                    href={`/knowledge/dictionary/${e.slug}`}
                    className="flex h-full items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 transition-colors duration-150 hover:border-foreground/20"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{e.name}</span>
                      <span className="line-clamp-1 block text-xs text-muted-foreground">{e.oneLiner}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {hits ? (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-medium">
            {hits.length} article{hits.length === 1 ? "" : "s"} for “{q}”
          </h2>
          {hits.length ? (
            <ul className="divide-y rounded-lg border bg-card">
              {hits.map((h) => (
                <li key={h.slug}>
                  <Link href={`/knowledge/${h.slug}`} className="block px-4 py-3 hover:bg-muted/40">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{h.title}</span>
                      <span className="text-xs text-muted-foreground">{DOMAIN_LABEL[h.domain as KnowledgeDomain]}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 max-w-[90ch] text-sm text-muted-foreground">{h.summary}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border bg-card">
              <EmptyState title="Nothing found">Try a broader word — e.g. “capacitor”, “reflow”, “connector”.</EmptyState>
            </div>
          )}
        </section>
      ) : null}

      <section aria-label="Reference tools" className="mb-8">
        <KnowledgeEntrances />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-medium">Watch how it’s made</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PROCESSES.map((p) => (
            <Link key={p.slug} href={`/knowledge/${p.article}`} title={p.summary} className="group rounded-lg border bg-card p-4 outline-none transition-colors duration-150 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-center gap-2">
                <Factory className="size-4 text-primary" aria-hidden />
                <span className="text-sm font-medium group-hover:underline">{p.title}</span>
              </div>
              {/* The walk as a chain: one link per step. */}
              <div className="mt-3 flex items-center" role="img" aria-label={`${p.steps.length} steps`}>
                {p.steps.map((st, i) => (
                  <span key={i} className="flex min-w-0 flex-1 items-center last:flex-none">
                    <span className="size-2.5 shrink-0 rounded-full border-2 border-primary bg-card" />
                    {i < p.steps.length - 1 ? <span className="h-0.5 min-w-0 flex-1 bg-primary/35" /> : null}
                  </span>
                ))}
              </div>
              <p className="num mt-2 text-xs text-muted-foreground">{p.steps.length} steps</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {ORDER.filter((d) => byDomain.get(d)?.length).map((d) => {
          const Icon = ICON[d];
          const list = byDomain.get(d)!;
          return (
            <section key={d} className="rounded-lg border bg-card">
              <div className="flex h-11 items-center gap-2 border-b px-4">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <h2 className="text-base font-medium">{DOMAIN_LABEL[d]}</h2>
                <span className="num ml-auto text-xs text-muted-foreground">{list.length}</span>
              </div>
              <ul className="max-h-96 divide-y overflow-y-auto">
                {list.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/knowledge/${a.slug}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/40">
                      <BookOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{a.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
