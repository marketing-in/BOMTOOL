import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { autoMap } from "@/lib/bom/columns";
import type { ColumnMapping } from "@/lib/bom/fields";
import { PageHeader } from "@/components/data/page-header";
import { MappingEditor } from "@/components/bom/mapping-editor";
import { DeleteRevisionButton } from "@/components/bom/delete-controls";
import { revisionImpact } from "@/server/bom-delete";
import { readPackSummary } from "@/lib/bom/workbook";
import { PackStrip } from "@/components/bom/pack-strip";
import { BoardUploadForm } from "@/components/viewer/board-upload-form";

export const metadata = { title: "Map columns" };

export default async function MapPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ template?: string; boardError?: string; matchError?: string }> }) {
  await requireUser("bom.write");
  const { id } = await params;
  const { template, boardError, matchError } = await searchParams;
  const rev = await db.bomRevision.findUnique({ where: { id }, include: { bom: { include: { project: { include: { customer: true } } } }, board: { select: { source: true, layerCount: true, widthMm: true, heightMm: true } } } });
  if (!rev) notFound();
  const rows = (rev.rawRows ?? []) as string[][];
  if (!rows.length) notFound();

  // Auto-mapping for every candidate header row, so changing the header row re-suggests instantly.
  const suggestions = rows.slice(0, 20).map((r, i) => autoMap(r, rows.slice(i + 1)));
  const impact = await revisionImpact(db, id);
  const pack = readPackSummary(rev.pack);

  return (
    <>
      <PageHeader
        title={<>Map columns <span className="num text-base font-normal text-muted-foreground">{rev.bom.name} rev {rev.revision}</span></>}
        description={
          <>
            <span className="num">{rev.sourceFileName}</span>
            {rev.sheetName ? <> · sheet “{rev.sheetName}”</> : null} · {rows.length} rows ·{" "}
            {rev.status !== "DRAFT" ? "matched with these columns — change one and match again" : template ? "saved template" : "auto-detected — check before matching"}
          </>
        }
        actions={impact ? <DeleteRevisionButton revisionId={rev.id} impact={impact} /> : undefined}
      />
      {rev.board ? (
        <p className="mb-4 text-sm">
          Board files read: <span className="num font-medium">{rev.board.layerCount} layers · {rev.board.widthMm.toFixed(1)} × {rev.board.heightMm.toFixed(1)} mm</span>
        </p>
      ) : boardError ? (
        <p role="alert" className="mb-4 rounded-md border border-risk-amber/40 bg-risk-amber-soft px-4 py-2.5 text-sm">
          The board files couldn&apos;t be drawn. Add them again below.
        </p>
      ) : null}
      {!rev.board && rev.status === "DRAFT" ? (
        // A BoM uploaded on its own: its board files can come here, and then it goes straight to the footprint match.
        <section aria-label="Board files" className="mb-6 rounded-xl border bg-card p-5">
          <h2 className="text-sm font-medium">Add the board files</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">Gerbers or a pick-and-place file: the lines are matched and the footprint check opens.</p>
          <BoardUploadForm revisionId={rev.id} />
        </section>
      ) : null}
      {matchError && rev.status === "DRAFT" ? (
        <p role="alert" className="mb-4 rounded-md border border-risk-amber/40 bg-risk-amber-soft px-4 py-2.5 text-sm">
          The columns were recognised, but matching the parts failed. Check the columns and match again.
        </p>
      ) : null}
      {pack ? <PackStrip pack={pack} className="mb-4" /> : null}
      <MappingEditor
        revisionId={rev.id}
        rows={rows.slice(0, 60)}
        totalRows={rows.length}
        initialHeaderRow={rev.headerRow}
        initialMapping={(rev.columnMapping ?? suggestions[rev.headerRow]?.mapping ?? []) as ColumnMapping}
        suggestions={suggestions.map((s) => s.mapping)}
        customerName={rev.bom.project.customer.name}
      />
    </>
  );
}
