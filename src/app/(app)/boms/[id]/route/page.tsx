import { StepPage } from "@/components/bom/step-page";
import RouteSection from "../_sections/route";
import LineFitSection from "../_sections/line-fit";
import SmtLineSection from "../_sections/smt-line";
import { openRevision, stepTitle } from "../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Route & SMT line");
}

/** Step 5: the process route, which of our lines fits and how long it runs, and the board on that SMT line — one page. */
export default async function ProductionStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qty?: string; smt?: string }> }) {
  const { id } = await params;
  await openRevision(id);
  const sp = await searchParams;
  return <StepPage step="production" sections={{ route: <RouteSection id={id} />, lines: <LineFitSection id={id} searchParams={sp} />, line: <SmtLineSection id={id} searchParams={sp} /> }} />;
}
