import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { boardFrameFor, footprintMatchFor } from "@/server/workflow";
import { boardThumbFor } from "@/server/board-thumb";
import type { PartBody } from "@/lib/board/placement-film";
import { FootprintMatchView } from "@/components/bom/footprint-match";
import { getViewerData } from "@/server/board-view";
import { getDisplayCurrency } from "@/lib/prefs";
import { forStudio } from "@/lib/board/studio-data";


/** Step 4, section 1: do the BoM and the board agree, designator by designator? */
export default async function CompareSection({ id }: { id: string }) {
  await requireUser();
  const rev = await db.bomRevision.findUnique({ where: { id }, select: { status: true, board: { select: { widthMm: true, heightMm: true } }, _count: { select: { placements: true } } } });
  if (!rev) notFound();
  if (rev.status === "DRAFT") redirect(`/boms/${id}/map`);
  // The assembled board for the 3D view, as the Gerber step draws it, loaded alongside the check (only when placements
  // give a board to compare with) and cut down to what the 3D board draws.
  const studio = rev._count.placements
    ? getDisplayCurrency()
        .then((c) => getViewerData(id, c))
        .then((d) => (d ? forStudio(d) : null))
        .catch(() => null)
    : null;
  const [match, frame, thumb, viewerData] = await Promise.all([footprintMatchFor(id), boardFrameFor(id).catch(() => null), boardThumbFor(id).catch(() => null), studio]);
  const viewer = match.hasBoard ? viewerData : null;
  // Each placed part's body (from its package) and turn, so the board film draws real sizes.
  const bodies: Record<string, PartBody> = {};
  for (const p of thumb?.parts ?? []) bodies[p.refDes.toUpperCase()] = { kind: p.body.kind, l: p.body.length, w: p.body.width, pins: p.body.pins, pitch: p.body.pitch, color: p.body.color, rot: p.rotation };
  return <FootprintMatchView match={match} revisionId={id} board={rev.board} art={frame?.hasTop ? { href: `/boms/${id}/picture`, box: frame.box } : null} bodies={bodies} mask={thumb?.maskColor ?? null} viewer={viewer} />;
}
