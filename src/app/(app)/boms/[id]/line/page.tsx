import { StepPage } from "@/components/bom/step-page";
import SmtLineSection from "../_sections/smt-line";
import { openRevision, stepTitle } from "../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "SMT line");
}

/** Step 6: the board running on our SMT line. */
export default async function SmtStepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qty?: string; smt?: string }> }) {
  const { id } = await params;
  await openRevision(id);
  const sp = await searchParams;
  return <StepPage step="smt" sections={{ line: <SmtLineSection id={id} searchParams={sp} /> }} />;
}
