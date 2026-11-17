import Link from "next/link";
import { CIRCUIT_SETS, CIRCUITS } from "@/knowledge/circuits";
import { DICTIONARY, type DictEntry } from "@/knowledge/dictionary";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/data/page-header";
import { Schematic } from "@/components/knowledge/schematic";

export const metadata = { title: "Application circuits" };

const USED_BY = new Map<string, DictEntry[]>();
for (const e of DICTIONARY) if (e.circuit) USED_BY.set(e.circuit, [...(USED_BY.get(e.circuit) ?? []), e]);

const tab = "flex h-9 shrink-0 items-center rounded-md px-3 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring";
const tabOn = "bg-primary font-semibold text-primary-foreground [&_span]:text-primary-foreground/80";
const tabOff = "text-muted-foreground hover:bg-muted hover:text-foreground";

export default async function CircuitsPage({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const { set } = await searchParams;
  const sets = CIRCUIT_SETS.filter((s) => !set || s.key === set);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex gap-2">
            <Link href="/knowledge" className="hover:text-foreground">Knowledge</Link>
            <span aria-hidden>/</span>
            <Link href="/knowledge/dictionary" className="hover:text-foreground">Dictionary</Link>
            <span aria-hidden>/</span>
            <span>Circuits</span>
          </span>
        }
        title="Application circuits"
      />

      <nav aria-label="Circuit sets" className="mb-8 inline-flex max-w-full flex-wrap gap-1 rounded-lg border bg-card p-1">
        <Link href="/knowledge/circuits" aria-current={!set ? "page" : undefined} className={cn(tab, !set ? tabOn : tabOff)}>
          All <span className="num ml-1.5 text-xs text-muted-foreground">{CIRCUITS.length}</span>
        </Link>
        {CIRCUIT_SETS.map((s) => (
          <Link
            key={s.key}
            href={`/knowledge/circuits?set=${s.key}`}
            aria-current={set === s.key ? "page" : undefined}
            className={cn(tab, set === s.key ? tabOn : tabOff)}
          >
            {s.label} <span className="num ml-1.5 text-xs text-muted-foreground">{s.circuits.length}</span>
          </Link>
        ))}
      </nav>

      {sets.map((s) => (
        <section key={s.key} aria-labelledby={`set-${s.key}`} className="mb-10">
          <h2 id={`set-${s.key}`} className="mb-3 text-lg font-semibold tracking-tight">
            {s.label}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {s.circuits.map((c) => {
              const users = USED_BY.get(c.id) ?? [];
              return (
                <article key={c.id} id={c.id} className="flex min-w-0 scroll-mt-20 flex-col overflow-hidden rounded-xl border bg-card">
                  <div className="flex h-12 items-center border-b px-4">
                    <h3 className="truncate text-sm font-semibold">{c.title}</h3>
                  </div>
                  <div className="overflow-x-auto px-4 py-5">
                    <Schematic circuit={c} focus={users[0]?.slug} className="mx-auto" minScale={1.05} maxScale={1.6} />
                  </div>
                  <details className="border-t">
                    <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">How it works</summary>
                    <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{c.caption}</p>
                  </details>
                  {users.length ? (
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t px-4 py-2.5">
                      <span className="mr-1 text-xs text-muted-foreground">Explains</span>
                      {users.map((e) => (
                        <Link
                          key={e.slug}
                          href={`/knowledge/dictionary/${e.slug}`}
                          className="inline-flex h-6 items-center rounded-md border px-2 text-xs transition-colors duration-150 hover:border-foreground/30 hover:bg-muted"
                        >
                          {e.name.replace(/\s*\(.*\)$/, "")}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
