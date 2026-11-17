import { StepPage } from "@/components/bom/step-page";
import EstimateSection from "../_sections/estimate";
import BareBoardSection from "../_sections/bare-board";
import QuoteSection from "../_sections/quote";
import { openRevision, stepTitle } from "../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Estimate & quote");
}

/** Step 7: can we build it and what it takes, the bare board, and the price. */
export default async function QuoteStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qty?: string }> }) {
  const { id } = await params;
  await openRevision(id);
  const sp = await searchParams;
  return <StepPage step="quote" sections={{ feasibility: <EstimateSection id={id} searchParams={sp} />, board: <BareBoardSection id={id} />, quote: <QuoteSection id={id} /> }} />;
}
