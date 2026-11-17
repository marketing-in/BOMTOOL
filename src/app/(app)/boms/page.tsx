import Link from "next/link";
import Form from "next/form";
import { Upload, Search } from "lucide-react";
import { bomCards } from "@/server/bom-cards";
import { EmptyState, PageHeader } from "@/components/data/page-header";
import { Button } from "@/components/ui/button";
import { BomCard, ScoreLegend } from "@/components/bom/bom-card";

export const metadata = { title: "BoMs" };

/**
 * Every customer BoM, newest first (Phase 26: picture first): a card each with the board itself, how far the job has
 * got through its steps, the five scores and what needs a look.
 */
export default async function BomsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  const [all, filters] = await Promise.all([bomCards(), searchParams]);
  const query = filters.q?.trim().toLowerCase() ?? "";
  const cards = all.filter((b) => (!query || `${b.name} ${b.customer} ${b.partNumber ?? ""}`.toLowerCase().includes(query)) && (!filters.stage || b.stage === filters.stage));

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-baseline gap-2.5">
            BoMs <span className="num text-base font-normal text-muted-foreground">{cards.length}</span>
          </span>
        }
        actions={
          <Button asChild className="h-10">
            <Link href="/boms/new"><Upload className="size-4" /> Upload BoM</Link>
          </Button>
        }
      />
      <Form action="/boms" className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" aria-hidden />
          <label htmlFor="bom-search" className="sr-only">Search BoMs</label>
          <input id="bom-search" name="q" defaultValue={filters.q} placeholder="Search" className="h-10 w-full rounded-md border bg-card pr-3 pl-9 text-sm" />
        </div>
        <label htmlFor="bom-stage" className="sr-only">Project stage</label>
        <select id="bom-stage" name="stage" defaultValue={filters.stage ?? ""} className="h-10 rounded-md border bg-card px-3 text-sm">
          <option value="">All stages</option><option value="PROTOTYPE">Prototype</option><option value="NPI">NPI</option><option value="PRODUCTION">Production</option>
        </select>
        <Button type="submit" variant="outline" className="h-10">Filter</Button>
        {query || filters.stage ? <Link href="/boms" className="text-sm underline decoration-border hover:decoration-foreground">Clear filters</Link> : null}
        {cards.length !== all.length ? <span className="num ml-auto text-xs text-muted-foreground">{cards.length} of {all.length}</span> : null}
      </Form>
      {cards.length ? (
        <>
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {cards.map((b) => <BomCard key={b.id} b={b} />)}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="How to read the bar of steps">
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-sm bg-risk-green" aria-hidden /> done</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-sm bg-risk-amber" aria-hidden /> to check</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-sm bg-muted-foreground/25" aria-hidden /> not started</span>
            </span>
            <ScoreLegend />
          </div>
        </>
      ) : (
        <div className="rounded-xl border bg-card">
          <EmptyState title={all.length ? "No assemblies match your filters" : "No BoMs yet"}>{all.length ? <Link href="/boms" className="underline decoration-border hover:decoration-foreground">Show all</Link> : null}</EmptyState>
        </div>
      )}
    </>
  );
}
