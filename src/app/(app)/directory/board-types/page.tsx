import Link from "next/link";
import Form from "next/form";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/data/page-header";
import { BOARD_CATEGORY, BOARD_TYPES } from "@/server/directory";

export const metadata = { title: "Board types" };

export default async function BoardTypesPage({ searchParams }: { searchParams: Promise<{ q?: string; c?: string }> }) {
  await requireUser();
  const { q = "", c = "" } = await searchParams;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = BOARD_TYPES.filter((t) => (!c || t.category === c) && words.every((w) => `${t.name} ${t.description} ${t.examples.join(" ")}`.toLowerCase().includes(w)));
  const groups = Object.keys(BOARD_CATEGORY).map((k) => ({ k, label: BOARD_CATEGORY[k], items: shown.filter((t) => t.category === k) })).filter((g) => g.items.length);
  return (
    <>
      <PageHeader title="Board types" />
      <Form action="/directory/board-types" className="mb-5 flex flex-wrap gap-2">
        <label htmlFor="bt-q" className="sr-only">Search board types</label>
        <input id="bt-q" name="q" defaultValue={q} placeholder="ESP32, motor driver, PoE…" className="h-10 min-w-56 flex-1 rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm" />
        <label htmlFor="bt-c" className="sr-only">Category</label>
        <select id="bt-c" name="c" defaultValue={c} className="h-10 rounded-md border bg-card px-2 text-sm">
          <option value="">All categories</option>
          {Object.entries(BOARD_CATEGORY).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground">Filter</button>
      </Form>
      {groups.map((g) => (
        <section key={g.k} className="mb-8" aria-labelledby={`bt-${g.k}`}>
          <h2 id={`bt-${g.k}`} className="mb-3 text-lg font-semibold tracking-tight">{g.label} <span className="num text-sm font-normal text-muted-foreground">{g.items.length}</span></h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((t) => (
              <li key={t.id}>
                <Link href={`/directory/board-types/${t.id}`} title={t.description} className="block h-full rounded-xl border bg-card p-4 outline-none transition-colors duration-150 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="block font-medium">{t.name}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{t.examples.slice(0, 3).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!groups.length ? <p className="text-sm text-muted-foreground">No board types match.</p> : null}
    </>
  );
}
