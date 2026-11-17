import { PageHeader } from "@/components/data/page-header";
import BoxSection from "../../_sections/box";
import { openRevision, stepTitle } from "../../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Box");
}

/**
 * The enclosure. No longer a step (the user removed it, 17 Nov 2026): a product ships board-only unless a box is
 * chosen here, reached from the box gate in step 7.
 */
export default async function BoxPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const { id } = await params;
  await openRevision(id);
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Box" />
      <BoxSection id={id} searchParams={sp} />
    </>
  );
}
