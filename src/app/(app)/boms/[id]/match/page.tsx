import { StepPage } from "@/components/bom/step-page";
import CompareSection from "../_sections/match";
import MismatchSection from "../_sections/mismatch";
import { openRevision, stepTitle } from "../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Footprint & mismatch");
}

/** Step 3: the BoM against the board footprint by footprint, then every mismatch. */
export default async function FootprintStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await openRevision(id);
  return <StepPage step="footprint" sections={{ match: <CompareSection id={id} />, mismatch: <MismatchSection id={id} /> }} />;
}
