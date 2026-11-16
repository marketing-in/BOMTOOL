import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { boardFrameFor, footprintMatchFor } from "@/server/workflow";
import { FootprintMatchView } from "@/components/bom/footprint-match";

export const metadata = { title: "Footprint match" };

/** Step 3 of the process: do the BoM and the board agree, designator by designator? */
export default async function FootprintMatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const rev = await db.bomRevision.findUnique({ where: { id }, select: { status: true, board: { select: { widthMm: true, heightMm: true } } } });
  if (!rev) notFound();
  if (rev.status === "DRAFT") redirect(`/boms/${id}/map`);
  const [match, frame] = await Promise.all([footprintMatchFor(id), boardFrameFor(id).catch(() => null)]);
  return <FootprintMatchView match={match} revisionId={id} board={rev.board} art={frame?.hasTop ? { href: `/boms/${id}/picture`, box: frame.box } : null} />;
}
