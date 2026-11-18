import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { boardFrameFor, footprintMatchFor } from "@/server/workflow";
import { boardThumbFor } from "@/server/board-thumb";
import type { PartBody } from "@/lib/board/placement-film";
import { FootprintMatchView } from "@/components/bom/footprint-match";


/** Step 4, section 1: do the BoM and the board agree, designator by designator? */
export default async function CompareSection({ id }: { id: string }) {
  await requireUser();
  const rev = await db.bomRevision.findUnique({ where: { id }, select: { status: true, board: { select: { widthMm: true, heightMm: true } } } });
  if (!rev) notFound();
  if (rev.status === "DRAFT") redirect(`/boms/${id}/map`);
  const [match, frame, thumb] = await Promise.all([footprintMatchFor(id), boardFrameFor(id).catch(() => null), boardThumbFor(id).catch(() => null)]);
  // Each placed part's body (from its package) and turn, so the board film draws real sizes.
  const bodies: Record<string, PartBody> = {};
  for (const p of thumb?.parts ?? []) bodies[p.refDes.toUpperCase()] = { kind: p.body.kind, l: p.body.length, w: p.body.width, pins: p.body.pins, pitch: p.body.pitch, color: p.body.color, rot: p.rotation };
  return <FootprintMatchView match={match} revisionId={id} board={rev.board} art={frame?.hasTop ? { href: `/boms/${id}/picture`, box: frame.box } : null} bodies={bodies} mask={thumb?.maskColor ?? null} />;
}
