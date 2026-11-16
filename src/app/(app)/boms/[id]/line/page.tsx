import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDisplayCurrency } from "@/lib/prefs";
import { getViewerData } from "@/server/board-view";
import { PageHeader } from "@/components/data/page-header";
import { LineLoader } from "@/components/line/line-loader";

export const metadata = { title: "SMT line" };

export default async function BomLinePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const data = await getViewerData(id, await getDisplayCurrency());
  if (!data) notFound();
  const smt = data.parts.filter((p) => !p.dnp).length;
  return (
    <>
      <PageHeader
        title={`SMT line — ${data.product?.name ?? data.title}`}
        description={`This board running through the line: loader → paste printer → SPI → pick-and-place → reflow → AOI → X-ray. ${smt} parts placed. Press play; click a machine to see its own cycle and process data.`}
      />
      <LineLoader data={data} />
      <p className="mt-3 text-xs text-muted-foreground">
        Line simulation from circuitflow (the stations, schedule and process models in src/vendor/circuitflow). Inspection results are simulated — repeatable for this board and driven by its stencil
        apertures — not measurements from our machines.
      </p>
    </>
  );
}
