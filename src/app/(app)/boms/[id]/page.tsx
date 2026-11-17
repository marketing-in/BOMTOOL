import { StepPage } from "@/components/bom/step-page";
import BomSection from "./_sections/bom";
import GerbersSection from "./_sections/gerbers";
import PartsSection from "./_sections/parts";
import { openRevision, stepTitle } from "./_sections/guard";

type Query = { line?: string; show?: string; view?: string; find?: string; sort?: string; dir?: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "BoM, Gerbers & components");
}

/** Step 1: the BoM, its Gerbers and centroid, and every component with its source — one page. */
export default async function FilesStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { id } = await params;
  await openRevision(id);
  const sp = await searchParams;
  return <StepPage step="files" sections={{ bom: <BomSection id={id} />, gerbers: <GerbersSection id={id} />, parts: <PartsSection id={id} searchParams={sp} /> }} />;
}
