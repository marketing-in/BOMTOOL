import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoneyCompact } from "@/lib/currency";
import { SCORE_KEYS, SCORE_LABEL } from "@/lib/bom/scores";
import { diffRevisions, type DiffChange } from "@/lib/bom/diff";
import { analyseRevision } from "@/server/bom-pipeline";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { Figures } from "@/components/bom/figures";
import { RiskDot } from "@/components/data/badges";

export const metadata = { title: "Revision diff" };

const KIND: Record<DiffChange["kind"], { label: string; level: "green" | "red" | "amber" | "grey" }> = {
  ADDED: { label: "Added", level: "green" },
  REMOVED: { label: "Removed", level: "red" },
  MPN_CHANGED: { label: "Part changed", level: "amber" },
  DNP_CHANGED: { label: "Fit / DNP changed", level: "grey" },
};

export default async function DiffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ against?: string }> }) {
  const { id } = await params;
  const { against } = await searchParams;
  const currency = await getDisplayCurrency();
  const rev = await db.bomRevision.findUnique({ where: { id }, include: { bom: { include: { revisions: { orderBy: { createdAt: "asc" }, select: { id: true, revision: true } } } } } });
  if (!rev) notFound();
  const others = rev.bom.revisions.filter((r) => r.id !== id);
  const baseId = against ?? others.at(-1)?.id;

  if (!baseId) {
    return (
      <>
        <PageHeader title="Compare revisions" />
        <div className="rounded-xl border bg-card">
          <EmptyState title="Only one revision" />
        </div>
      </>
    );
  }
  const [from, to] = await Promise.all([analyseRevision(db, baseId, currency), analyseRevision(db, id, currency)]);
  if (!from || !to) notFound();
  const toLines = (a: NonNullable<typeof from>) => a.lines.map((l) => ({ id: l.id, refDes: l.refDes, mpn: l.part?.mpn ?? l.rawMpn, description: l.rawDescription, qtyPerBoard: l.qtyPerBoard, dnp: l.dnp }));
  const { changes, summary } = diffRevisions(toLines(from), toLines(to));
  const perBoard = (a: NonNullable<typeof from>) => (a.totals.toBuyLanded + a.totals.fromStock) / Math.max(1, a.revision.buildQty);

  return (
    <>
      <PageHeader
        title={
          <span className="num">
            rev {from.revision.revision} → rev {to.revision.revision}
          </span>
        }
        actions={
          others.length > 1 ? (
            <form className="flex items-center gap-2 text-sm">
              <label htmlFor="against" className="text-muted-foreground">Compare with</label>
              <select id="against" name="against" defaultValue={baseId} className="h-10 rounded-md border bg-card px-2">
                {others.map((o) => (
                  <option key={o.id} value={o.id}>rev {o.revision}</option>
                ))}
              </select>
              <button className="h-10 rounded-md border bg-card px-3 outline-none hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">Show</button>
            </form>
          ) : null
        }
      />
      <Figures
        className="mb-6"
        items={[
          { label: "Added", value: summary.added },
          { label: "Removed", value: summary.removed },
          { label: "Changed", value: summary.changed, title: "Different part or fit/DNP" },
          { label: "Material per board", value: formatMoneyCompact(perBoard(to), currency), note: `was ${formatMoneyCompact(perBoard(from), currency)}` },
        ]}
      />
      <section className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm" title="Scores at each revision's own build quantity">
        {SCORE_KEYS.map((k) => {
          const a = from.scores?.[k] ?? 0;
          const b = to.scores?.[k] ?? 0;
          return (
            <span key={k} className="num">
              <span className="font-sans text-muted-foreground">{SCORE_LABEL[k]}</span> {a} → {b}{" "}
              <span className={b > a ? "text-risk-green" : b < a ? "text-risk-red" : "text-muted-foreground"}>({b - a >= 0 ? "+" : ""}{b - a})</span>
            </span>
          );
        })}
      </section>
      <div className="overflow-hidden rounded-xl border bg-card">
        {changes.length ? (
          <ul className="divide-y text-sm">
            {changes.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                <span className="inline-flex w-36 items-center gap-1.5 text-xs"><RiskDot level={KIND[c.kind].level} />{KIND[c.kind].label}</span>
                <span className="num w-40 truncate text-xs" title={c.refs.join(", ")}>{c.refs.join(", ") || "—"}</span>
                {"from" in c ? <span className="num text-muted-foreground line-through">{c.from.mpn ?? c.from.description}</span> : null}
                {"to" in c ? <span className="num font-medium">{c.to.mpn ?? c.to.description}{c.kind === "DNP_CHANGED" ? (c.to.dnp ? " (now DNP)" : " (now fitted)") : ""}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No differences" />
        )}
      </div>
    </>
  );
}
