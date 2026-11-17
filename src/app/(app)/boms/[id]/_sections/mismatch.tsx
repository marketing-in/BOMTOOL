import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, CircleAlert, TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { mismatchesFor } from "@/server/workflow";
import { PageHeader } from "@/components/data/page-header";
import { cn } from "@/lib/utils";
import type { Level } from "@/lib/bom/mismatch";


const TONE: Record<Level, { text: string; field: string; word: string; Icon: typeof Check }> = {
  green: { text: "text-risk-green", field: "bg-risk-green-soft", word: "Clear", Icon: Check },
  amber: { text: "text-risk-amber", field: "bg-risk-amber-soft", word: "To check", Icon: TriangleAlert },
  red: { text: "text-risk-red", field: "bg-risk-red-soft", word: "Must settle", Icon: CircleAlert },
};

/**
 * Step 2, section 2: every mismatch in the customer's product in one list — the BoM against the board and the BoM against
 * itself — grouped by what to ask, most serious first. Each row links to its BoM line or its place on the board.
 */
export default async function MismatchSection({ id }: { id: string }) {
  await requireUser();
  const rev = await db.bomRevision.findUnique({ where: { id }, select: { status: true, bom: { select: { name: true } }, revision: true } });
  if (!rev) notFound();
  if (rev.status === "DRAFT") redirect(`/boms/${id}/map`);
  const m = await mismatchesFor(id);
  const t = TONE[m.level];
  const reds = m.groups.filter((g) => g.level === "red").reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="space-y-8">
      <PageHeader level={2}
        title="Mismatches"
        description="Everything in this product that disagrees with itself: the BoM against the board, quantities against designators, part numbers against their descriptions. Settle the red ones with the customer before buying or building."
      />

      <section aria-label="Result" className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md px-5 py-4", t.field)}>
        <t.Icon className={cn("size-5 shrink-0", t.text)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm font-semibold", t.text)}>{m.total ? `${m.total.toLocaleString("en-IN")} to settle` : "No mismatches"}</div>
          <p className="mt-0.5 text-sm text-foreground/80">{m.summary}</p>
        </div>
        <dl className="flex gap-6 text-sm">
          <div><dt className="text-xs text-muted-foreground">Must settle</dt><dd className="num text-xl font-semibold text-risk-red">{reds}</dd></div>
          <div><dt className="text-xs text-muted-foreground">To check</dt><dd className="num text-xl font-semibold text-risk-amber">{m.total - reds}</dd></div>
        </dl>
        {!m.hasBoard ? (
          <Link href={`/boms/${id}/board`} className="text-sm font-medium text-primary underline underline-offset-2">Add Gerbers to compare with the board</Link>
        ) : null}
      </section>

      {m.groups.map((g, gi) => {
        const gt = TONE[g.level];
        return (
          <section key={g.key} aria-labelledby={`mm-${g.key}`} className="border-t pt-6">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="num w-10 text-xs text-muted-foreground">2.2.{gi + 1}</span>
              <h2 id={`mm-${g.key}`} className="text-base font-semibold">{g.title}</h2>
              <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-medium", gt.field, gt.text)}>{gt.word}</span>
              <span className="num ml-auto text-sm text-muted-foreground">{g.items.length.toLocaleString("en-IN")}</span>
            </div>
            <p className="mb-3 pl-12 text-sm text-muted-foreground">{g.ask}</p>
            <div className="overflow-x-auto pl-0 sm:pl-12">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="w-24 py-2 pr-4 font-medium">Designator</th>
                    <th className="w-20 py-2 pr-4 text-right font-medium">Line</th>
                    <th className="w-56 py-2 pr-4 font-medium">Part number</th>
                    <th className="py-2 font-medium">What disagrees</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.slice(0, 200).map((it, i) => (
                    <tr key={`${it.ref}-${it.lineNo}-${i}`} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{it.ref ?? "—"}</td>
                      <td className="num py-2 pr-4 text-right">
                        {it.lineNo !== null ? <Link href={`/boms/${id}?line=${it.lineNo}`} className="text-primary hover:underline">{it.lineNo}</Link> : "—"}
                      </td>
                      <td className="truncate py-2 pr-4 font-mono text-xs">{it.mpn ?? "—"}</td>
                      <td className="py-2 text-foreground/85">{it.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {g.items.length > 200 ? <p className="mt-2 text-xs text-muted-foreground">Showing 200 of {g.items.length.toLocaleString("en-IN")}. The BoM table lists them all.</p> : null}
            </div>
          </section>
        );
      })}

      {m.hasBoard ? (
        <p className="text-sm text-muted-foreground">
          Designator by designator on the board drawing: <a href="#compare" className="font-medium text-primary underline underline-offset-2">2.1 Compare</a>.
        </p>
      ) : null}
    </div>
  );
}
