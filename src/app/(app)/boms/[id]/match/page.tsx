import { StepPage } from "@/components/bom/step-page";
import CompareSection from "../_sections/match";
import MismatchSection from "../_sections/mismatch";
import { openRevision, stepTitle } from "../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Compare & mismatches");
}

/** Step 2: the BoM against the board designator by designator, then every mismatch in one list — one page. */
export default async function CompareStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await openRevision(id);
  return <StepPage step="compare" sections={{ match: <CompareSection id={id} />, mismatch: <MismatchSection id={id} /> }} />;
}
