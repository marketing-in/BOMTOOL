import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, ChevronDown, CircuitBoard, Files, Layers, Microchip, Ruler, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { boardStackFor } from "@/server/board-thumb";
import { PageHeader, Section } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { BoardUploadForm } from "@/components/viewer/board-upload-form";
import { RemoveBoardFilesButton } from "@/components/bom/delete-controls";
import { BoardExploded } from "@/components/viz/board-exploded";
import { Fold } from "@/components/viz/fold";
import { Kpi } from "@/components/viz/kpi";

export const metadata = { title: "Gerbers & centroid" };

/**
 * Step 2 of the process. With nothing uploaded it opens on the upload; once the files are in, it opens on what was
 * read from them — the board pulled apart layer by layer with its components (Phase 27) — and the upload folds away
 * under "Replace or add files".
 */
export default async function BoardFilesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("bom.write");
  const { id } = await params;
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
  const stack = uploaded ? await boardStackFor(id).catch(() => null) : null;

  const onFile = (
    <Section title="On file" action={uploaded ? <RemoveBoardFilesButton revisionId={id} /> : undefined}>
      <ul className="space-y-2 px-4 py-3 text-sm">
        <li className="flex items-center gap-2">
          <RiskDot level={gerbers ? "green" : "grey"} />
          {gerbers ? `${files.length} layer files · ${rev.board!.widthMm.toFixed(1)} × ${rev.board!.heightMm.toFixed(1)} mm · ${rev.board!.layerCount} copper layers` : "No Gerbers — the board is drawn from the project spec"}
        </li>
        <li className="flex items-center gap-2">
          <RiskDot level={placements ? (linked === placements ? "green" : "amber") : "grey"} />
          {placements ? `${placements} placements, ${linked} linked to BoM lines` : "No centroid file — part positions are estimated"}
        </li>
        {rev.board?.updatedAt && uploaded ? <li className="pl-4 text-xs text-muted-foreground">Last updated {rev.board.updatedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</li> : null}
      </ul>
    </Section>
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
      <PageHeader
        title="Gerbers & centroid"
        description={uploaded ? "What was read from the files, layer by layer." : "Upload the fabrication files (Gerber RS-274X + drill) and the pick-and-place / centroid file. They give the real board size, the paste and every part's position."}
        actions={
          uploaded ? (
            <Link href={`/boms/${id}/viewer`} className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-3.5 text-sm font-medium outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
              <Box className="size-4 text-primary" aria-hidden /> Turn it in 3D
            </Link>
          ) : undefined
        }
      />
      {uploaded ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-3">
            {stack ? (
              <figure className="rounded-lg border bg-card p-4 sm:p-6">
                <BoardExploded revisionId={id} stack={stack} label="The board pulled apart, top to bottom" className="mx-auto max-w-3xl" />
                <figcaption className="mt-3 text-center text-xs text-muted-foreground">
                  {stack.gerbers ? "Each sheet is the customer's own layer drawing. Thicknesses are drawn larger than life so the foils can be seen." : "No Gerbers yet: the sheets are drawn from the layer count on file."}
                </figcaption>
              </figure>
            ) : null}
            {fileList}
            <details className="group rounded-lg border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium outline-none select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <Upload className="size-4 text-primary" aria-hidden />
                Replace or add files
                <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180" aria-hidden />
              </summary>
              <div className="border-t p-4">
                <BoardUploadForm revisionId={id} />
              </div>
            </details>
          </div>
          <div className="min-w-0 space-y-3">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
              <Kpi icon={Ruler} label="Board size" value={rev.board ? `${rev.board.widthMm.toFixed(1)} × ${rev.board.heightMm.toFixed(1)}` : "—"} unit="mm" />
              <Kpi icon={Layers} label="Copper layers" value={rev.board?.layerCount ?? "—"} />
              <Kpi icon={CircuitBoard} label="Layer files" value={gerbers ? files.length : "none"} tone={gerbers ? "plain" : "amber"} note={gerbers ? undefined : "drawn from the project spec"} />
              <Kpi
                icon={Microchip}
                label="Placements"
                value={placements || "none"}
                tone={!placements || linked < placements ? "amber" : "green"}
                note={placements ? (linked === placements ? "all linked to BoM lines" : `${linked} linked to BoM lines`) : "positions are estimated"}
              />
            </div>
            {onFile}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <BoardUploadForm revisionId={id} />
          {onFile}
        </div>
      )}
    </>
  );
}
