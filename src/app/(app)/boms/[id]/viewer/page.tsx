import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDisplayCurrency } from "@/lib/prefs";
import { getViewerData } from "@/server/board-view";
import { PageHeader } from "@/components/data/page-header";
import { ViewerLoader } from "@/components/viewer/viewer-loader";
import { BoardFitNote } from "@/components/bom/board-fit-note";
import { boardFitFor } from "@/server/workflow";
import SmtLineSection from "../_sections/smt-line";

export const metadata = { title: "3D view" };

/** The BoM's board in 3D, 2D and layers, then the same board running on our SMT lines. */

export default async function BomViewerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string; smt?: string; qty?: string }> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const { step } = sp;
  const [data, fit] = await Promise.all([getDisplayCurrency().then((c) => getViewerData(id, c)), boardFitFor(id).catch(() => null)]);
  if (!data) notFound();
  return (
    <>
      <PageHeader
        title={data.title}
        description={`${data.board.width.toFixed(1)} × ${data.board.height.toFixed(1)} mm · ${data.board.layerCount} layers · ${data.board.finish} · ${data.board.maskColor} mask · ${data.parts.length} parts placed`}
        actions={
          <a href="#smt-line" className="inline-flex h-10 items-center rounded-md border bg-card px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            SMT line
          </a>
        }
      />
      <BoardFitNote fit={fit} className="mb-4" />
      <ViewerLoader data={data} initialStep={step ?? null} />
      <section id="smt-line" aria-label="SMT line" className="mt-16 scroll-mt-32 border-t pt-12">
        <SmtLineSection id={id} searchParams={sp} />
      </section>
    </>
  );
}
