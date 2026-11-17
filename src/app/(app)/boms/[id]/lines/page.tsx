import { StepPage } from "@/components/bom/step-page";
import LineFitSection from "../_sections/line-fit";
import RouteSection from "../_sections/route";
import { openRevision, stepTitle } from "../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Line possible");
}

/** Step 5: which of our lines can build it, and the process route through the plant. */
export default async function LinesStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qty?: string }> }) {
  const { id } = await params;
  await openRevision(id);
  const sp = await searchParams;
  return <StepPage step="lines" sections={{ lines: <LineFitSection id={id} searchParams={sp} />, route: <RouteSection id={id} /> }} />;
}
