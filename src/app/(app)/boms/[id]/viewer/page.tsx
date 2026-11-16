import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDisplayCurrency } from "@/lib/prefs";
import { getViewerData } from "@/server/board-view";
import { PageHeader } from "@/components/data/page-header";
import { ViewerLoader } from "@/components/viewer/viewer-loader";

export const metadata = { title: "3D viewer" };

export default async function BomViewerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { step } = await searchParams;
  const data = await getViewerData(id, await getDisplayCurrency());
  if (!data) notFound();
  return (
    <>
      <PageHeader
        title={data.title}
        description={`${data.board.width.toFixed(1)} × ${data.board.height.toFixed(1)} mm · ${data.board.layerCount} layers · ${data.board.finish} · ${data.board.maskColor} mask · ${data.parts.length} parts placed`}
      />
      <ViewerLoader data={data} initialStep={step ?? null} />
    </>
  );
}
