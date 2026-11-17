import { StepPage } from "@/components/bom/step-page";
import BoxSection from "../../_sections/box";
import { openRevision, stepTitle } from "../../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Box");
}

/** Step 4, optional: the enclosure, if the product ships in one. */
export default async function BoxStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const { id } = await params;
  await openRevision(id);
  const sp = await searchParams;
  return <StepPage step="box" sections={{ box: <BoxSection id={id} searchParams={sp} /> }} />;
}
