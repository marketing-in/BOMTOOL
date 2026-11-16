import { redirect } from "next/navigation";

/** Build & quote starts with the bare board. */
export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/boms/${(await params).id}/build/board`);
}
