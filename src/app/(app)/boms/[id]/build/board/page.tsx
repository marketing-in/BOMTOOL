import { StepPage } from "@/components/bom/step-page";
import BareBoardSection from "../../_sections/bare-board";
import { openRevision, stepTitle } from "../../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Bare board");
}

/** Step 5: the bare board's estimate — what the fabs charge for it, and the one chosen. */
export default async function BareBoardStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await openRevision(id);
  return <StepPage step="board" sections={{ board: <BareBoardSection id={id} /> }} />;
}
