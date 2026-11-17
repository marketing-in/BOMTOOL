import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, ChevronDown, CircleAlert, TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { mismatchesFor } from "@/server/workflow";
import { PageHeader } from "@/components/data/page-header";
import { Figures } from "@/components/bom/figures";
import { cn } from "@/lib/utils";
import type { Level } from "@/lib/bom/mismatch";


const TONE: Record<Level, { text: string; field: string; word: string; Icon: typeof Check }> = {
  green: { text: "text-risk-green", field: "bg-risk-green-soft", word: "Clear", Icon: Check },
  amber: { text: "text-risk-amber", field: "bg-risk-amber-soft", word: "To check", Icon: TriangleAlert },
  red: { text: "text-risk-red", field: "bg-risk-red-soft", word: "Must settle", Icon: CircleAlert },
};

/**
 * Step 4, section 2: every mismatch in the customer's product in one list — the BoM against the board and the BoM against
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
    <div className="space-y-4">
      <PageHeader level={2}
        title="Mismatches"
      />

      <section aria-label="Result" className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <Figures
          items={[
            { label: "Must settle", value: reds, tone: reds ? "red" : "green" },
            { label: "To check", value: m.total - reds, tone: m.total - reds ? "amber" : "green" },
          ]}
        />
        <p className={cn("flex min-w-0 flex-1 items-center gap-2 text-sm font-medium", t.text)} title={m.summary}>
          <t.Icon className="size-4 shrink-0" aria-hidden />
          {m.total ? m.summary : "No mismatches"}
        </p>
        {!m.hasBoard ? (
          <Link href={`/boms/${id}/board`} className="inline-flex h-10 items-center rounded-md border bg-card px-3.5 text-sm font-medium outline-none hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">Add Gerbers</Link>
        ) : null}
      </section>

      {m.groups.map((g, gi) => {
        const gt = TONE[g.level];
        return (
          <details key={g.key} open={g.level === "red" || gi === 0} aria-labelledby={`mm-${g.key}`} className="group rounded-xl border bg-card">
            <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-5 py-3 outline-none select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden" title={g.ask}>
              <h3 id={`mm-${g.key}`} className="text-base font-semibold">{g.title}</h3>
              <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", gt.field, gt.text)}>{gt.word}</span>
              <span className="ml-auto text-xl font-semibold tabular-nums">{g.items.length.toLocaleString("en-IN")}</span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180" aria-hidden />
            </summary>
            <div className="overflow-x-auto border-t px-5 pb-3">
              <p className="pt-3 text-sm text-muted-foreground">{g.ask}</p>
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
                      <td className="num py-2 pr-4 text-xs">{it.ref ?? "—"}</td>
                      <td className="num py-2 pr-4 text-right">
                        {it.lineNo !== null ? <Link href={`/boms/${id}?line=${it.lineNo}`} className="underline decoration-border hover:decoration-foreground">{it.lineNo}</Link> : "—"}
                      </td>
                      <td className="num truncate py-2 pr-4 text-xs">{it.mpn ?? "—"}</td>
                      <td className="py-2 text-foreground/85">{it.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {g.items.length > 200 ? <p className="mt-2 text-xs text-muted-foreground">200 of {g.items.length.toLocaleString("en-IN")} shown</p> : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}
