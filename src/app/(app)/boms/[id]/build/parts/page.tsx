import { StepPage } from "@/components/bom/step-page";
import PartsSection from "../../_sections/parts";
import { openRevision, stepTitle } from "../../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Components");
}

/** Step 5: every component with its source. */
export default async function PartsStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ line?: string; show?: string; view?: string; find?: string; sort?: string; dir?: string }> }) {
  const { id } = await params;
  await openRevision(id);
  const sp = await searchParams;
  return <StepPage step="parts" sections={{ parts: <PartsSection id={id} searchParams={sp} /> }} />;
}
