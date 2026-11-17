import { StepPage } from "@/components/bom/step-page";
import GerbersSection from "../_sections/gerbers";
import { openRevision, stepTitle } from "../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Gerber");
}

/** Step 2: the Gerbers and centroid, and the board in 3D. */
export default async function GerberStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await openRevision(id);
  return <StepPage step="gerbers" sections={{ gerbers: <GerbersSection id={id} /> }} />;
}
