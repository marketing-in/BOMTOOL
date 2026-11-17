import Link from "next/link";
import Form from "next/form";
import { Boxes, Cable, Cpu, Cylinder, Plug, Search, Shapes, type LucideIcon } from "lucide-react";
import { db } from "@/lib/db";
import { listCategories } from "@/server/catalogue";
import { webUrl } from "@/server/sourcing/normalise";
import { PageHeader } from "@/components/data/page-header";
import { PartPhoto } from "@/components/data/part-photo";
import { PartsTabs } from "@/components/parts/parts-tabs";

export const metadata = { title: "Browse categories" };

const ICON: Record<string, LucideIcon> = { semiconductors: Cpu, passives: Cylinder, electromechanical: Plug, "cables-wire": Cable, mechanical: Boxes };

export default async function BrowsePage() {
  const [tree, photos] = await Promise.all([
    listCategories(),
    db.part.findMany({ where: { imageUrl: { not: null } }, select: { id: true, mpn: true, imageUrl: true, category: { select: { slug: true } } }, orderBy: { mpn: "asc" } }),
  ]);
  const examples = new Map<string, { id: string; mpn: string; src: string | null }[]>();
  for (const p of photos) {
    const list = examples.get(p.category.slug) ?? [];
    if (list.length < 3) list.push({ id: p.id, mpn: p.mpn, src: webUrl(p.imageUrl) });
    examples.set(p.category.slug, list);
  }

  return (
    <>
      <PageHeader title="Parts catalogue" />
      <PartsTabs current="browse" />

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Form action="/parts" className="relative min-w-0 flex-1 basis-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="bq" className="sr-only">Search our catalogue</label>
          <input id="bq" name="q" placeholder="Search our catalogue: MPN, maker or description…" className="h-11 w-full rounded-md border bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/30" />
        </Form>
        <Link href="/parts/market" className="text-sm text-muted-foreground hover:text-foreground">
          Search distributors →
        </Link>
      </div>

      {tree.map((top) => {
        const Icon = ICON[top.slug] ?? Shapes;
        const total = top.children.reduce((s, c) => s + c._count.parts, 0);
        return (
          <section key={top.slug} aria-labelledby={`cat-${top.slug}`} className="mb-8">
            <h2 id={`cat-${top.slug}`} className="mb-4 flex items-center gap-2.5 text-lg font-semibold tracking-tight">
              <span className="grid size-8 place-items-center rounded-md bg-part-soft text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              {top.name}
              <span className="num text-sm font-normal text-muted-foreground">{total}</span>
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {top.children.map((c) => {
                const ex = examples.get(c.slug) ?? [];
                const empty = c._count.parts === 0;
                return (
                  <li key={c.slug}>
                    <Link
                      href={empty ? `/parts/market?q=${encodeURIComponent(c.name.replace(/\s*\(.*\)$/, ""))}` : `/parts?category=${c.slug}`}
                      className="flex h-full flex-col rounded-xl border bg-card p-4 outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm leading-snug font-medium">{c.name}</span>
                        <span className="num shrink-0 text-sm font-semibold">{c._count.parts}</span>
                      </span>
                      {ex.length ? (
                        <span className="mt-3 flex gap-2">
                          {ex.map((p) => (
                            <span key={p.id} title={p.mpn} className="grid size-12 place-items-center overflow-hidden rounded bg-white p-0.5 ring-1 ring-border">
                              <PartPhoto src={p.src} alt="" className="max-h-full max-w-full" />
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="mt-3 text-xs text-muted-foreground">{empty ? "Search distributors →" : "No photos yet"}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
