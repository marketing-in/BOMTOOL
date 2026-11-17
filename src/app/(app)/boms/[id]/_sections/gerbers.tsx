import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, ChevronDown, Files, Layers, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { boardStackFor } from "@/server/board-thumb";
import { PageHeader } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { BoardUploadForm } from "@/components/viewer/board-upload-form";
import { RemoveBoardFilesButton } from "@/components/bom/delete-controls";
import { BoardExploded } from "@/components/viz/board-exploded";
import { Fold } from "@/components/viz/fold";
import { Figures } from "@/components/bom/figures";
import { StudioLoader } from "@/components/viewer/studio-loader";
import { getViewerData } from "@/server/board-view";
import { getDisplayCurrency } from "@/lib/prefs";


/**
 * Step 2. With nothing uploaded it opens on the upload; once the files are in, it opens on what was
 * read from them — the board pulled apart layer by layer with its components (Phase 27) — and the upload folds away
 * under "Replace or add files".
 */
export default async function GerbersSection({ id }: { id: string }) {
  await requireUser("bom.write");
  const rev = await db.bomRevision.findUnique({
    where: { id },
    include: { board: { select: { source: true, files: true, widthMm: true, heightMm: true, layerCount: true, updatedAt: true } }, _count: { select: { placements: true } } },
  });
  if (!rev) notFound();
  const linked = await db.placement.count({ where: { revisionId: id, bomLineId: { not: null } } });
  const files = (rev.board?.files ?? []) as { name: string; type: string; side: string }[];
  const gerbers = rev.board?.source === "gerber";
  const placements = rev._count.placements;
  const uploaded = gerbers || placements > 0;
  const [stack, viewer] = uploaded ? await Promise.all([boardStackFor(id).catch(() => null), getDisplayCurrency().then((c) => getViewerData(id, c)).catch(() => null)]) : [null, null];

  const onFile = (
    <ul className="space-y-2 text-sm" aria-label="On file">
      <li className="flex items-center gap-2">
        <RiskDot level={gerbers ? "green" : "grey"} />
        {gerbers ? `${files.length} layer files · ${rev.board!.widthMm.toFixed(1)} × ${rev.board!.heightMm.toFixed(1)} mm · ${rev.board!.layerCount} copper layers` : "No Gerbers — the board is drawn from the project spec"}
      </li>
      <li className="flex items-center gap-2">
        <RiskDot level={placements ? (linked === placements ? "green" : "amber") : "grey"} />
        {placements ? `${placements} placements, ${linked} linked to BoM lines` : "No centroid file — part positions are estimated"}
      </li>
    </ul>
  );

  const fileList = files.length ? (
    <Fold icon={Files} title="Layer files" note={rev.board?.updatedAt ? `Last updated ${rev.board.updatedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : undefined} figure={files.length}>
      <ul className="max-h-72 divide-y overflow-y-auto text-xs">
        {files.map((f) => (
          <li key={f.name} className="flex justify-between gap-2 px-4 py-1.5">
            <span className="num truncate">{f.name}</span>
            <span className="shrink-0 text-muted-foreground">{f.type} · {f.side}</span>
          </li>
        ))}
      </ul>
    </Fold>
  ) : null;

  return (
    <>
      <PageHeader level={2}
        title="Gerbers & centroid"
        actions={
          uploaded ? (
            <>
              <RemoveBoardFilesButton revisionId={id} />
              <Link href={`/boms/${id}/viewer`} className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-3.5 text-sm font-medium outline-none transition-colors duration-150 hover:bg-part-soft focus-visible:ring-2 focus-visible:ring-ring">
                <Box className="size-4" aria-hidden /> Turn it in 3D
              </Link>
            </>
          ) : undefined
        }
      />
      {uploaded ? (
        <div className="space-y-5">
          <Figures
            items={[
              { label: "Board size", value: rev.board ? `${rev.board.widthMm.toFixed(1)} × ${rev.board.heightMm.toFixed(1)}` : "—", unit: "mm" },
              { label: "Copper layers", value: rev.board?.layerCount ?? "—" },
              { label: "Layer files", value: gerbers ? files.length : "none", tone: gerbers ? undefined : "amber", note: gerbers ? undefined : "drawn from the project spec" },
              {
                label: "Placements",
                value: placements || "none",
                tone: !placements || linked < placements ? "amber" : "green",
                note: placements ? (linked === placements ? "all linked" : `${linked} linked`) : "positions estimated",
              },
            ]}
          />
          {viewer ? (
            <section aria-label="The assembled board">
              <StudioLoader data={viewer} />
            </section>
          ) : null}
          {stack ? (
            <Fold icon={Layers} title="Layers" note={stack.gerbers ? "The customer's own layer drawings, pulled apart" : "Drawn from the layer count on file"} open={!viewer}>
              <figure className="p-4 sm:p-6" title={stack.gerbers ? "Each sheet is the customer's own layer drawing. Thicknesses are drawn larger than life." : "No Gerbers yet: the sheets are drawn from the layer count on file."}>
                <BoardExploded revisionId={id} stack={stack} label="The board pulled apart, top to bottom" className="mx-auto max-w-3xl" />
              </figure>
            </Fold>
          ) : null}
          {onFile}
          {fileList}
          <details className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-medium outline-none select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <Upload className="size-4" aria-hidden />
              Replace or add files
              <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t p-5">
              <BoardUploadForm revisionId={id} />
            </div>
          </details>
        </div>
      ) : (
        <div className="space-y-5">
          <BoardUploadForm revisionId={id} />
          {onFile}
        </div>
      )}
    </>
  );
}
