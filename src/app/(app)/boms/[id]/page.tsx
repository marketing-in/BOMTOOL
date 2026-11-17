import { StepPage } from "@/components/bom/step-page";
import BomSection from "./_sections/bom";
import { openRevision, stepTitle } from "./_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "BoM");
}

/** Step 1: the BoM. */
export default async function BomStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await openRevision(id);
  return <StepPage step="bom" sections={{ bom: <BomSection id={id} /> }} />;
}
