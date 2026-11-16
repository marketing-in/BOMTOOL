import "server-only";
import type { PrismaClient } from "@prisma/client";
import { deleteBlocker, type RevisionImpact } from "@/lib/bom/delete";

type DbT = PrismaClient;

/** What deleting this revision would take with it, or null when it does not exist. */
export async function revisionImpact(db: DbT, revisionId: string): Promise<RevisionImpact | null> {
  const rev = await db.bomRevision.findUnique({
    where: { id: revisionId },
    select: {
      revision: true,
      bom: { select: { name: true, _count: { select: { revisions: true } } } },
      board: { select: { id: true } },
      _count: { select: { lines: true, placements: true, quotes: true, feasibility: true } },
    },
  });
  if (!rev) return null;
  const [issuedQuotes, carts, workOrders] = await Promise.all([
    db.customerQuote.count({ where: { revisionId, status: { not: "DRAFT" } } }),
    db.cart.count({ where: { bomRevisionId: revisionId } }),
    db.workOrder.findMany({ where: { bomRevisionId: revisionId }, select: { number: true }, orderBy: { number: "asc" } }),
  ]);
  return {
    bomName: rev.bom.name,
    revision: rev.revision,
    lines: rev._count.lines,
    hasBoard: !!rev.board,
    placements: rev._count.placements,
    quotes: rev._count.quotes,
    issuedQuotes,
    reviews: rev._count.feasibility,
    carts,
    workOrders: workOrders.map((w) => w.number),
    otherRevisions: rev.bom._count.revisions - 1,
  };
}

/**
 * Deletes a revision: its lines, board, placements, quotes and reviews go with it (cascade); carts made from it are
 * kept but unlinked. When it was the BoM's only revision the BoM goes too. Refused while work orders build it.
 */
export async function deleteRevision(db: DbT, revisionId: string): Promise<{ ok: true; bomDeleted: boolean; nextRevisionId: string | null } | { ok: false; error: string }> {
  const impact = await revisionImpact(db, revisionId);
  if (!impact) return { ok: false, error: "That BoM revision no longer exists." };
  const blocked = deleteBlocker(impact);
  if (blocked) return { ok: false, error: blocked };
  const { bomId } = await db.bomRevision.findUniqueOrThrow({ where: { id: revisionId }, select: { bomId: true } });
  return db.$transaction(async (tx) => {
    await tx.cart.updateMany({ where: { bomRevisionId: revisionId }, data: { bomRevisionId: null } });
    await tx.bomRevision.delete({ where: { id: revisionId } });
    const next = await tx.bomRevision.findFirst({ where: { bomId }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (!next) await tx.bom.delete({ where: { id: bomId } });
    return { ok: true as const, bomDeleted: !next, nextRevisionId: next?.id ?? null };
  });
}

/** Removes a revision's board files: the Gerbers (its board model) and the part positions read from them or a centroid. */
export async function removeBoardFiles(db: DbT, revisionId: string) {
  const [board, placements] = await db.$transaction([
    db.boardModel.deleteMany({ where: { revisionId } }),
    db.placement.deleteMany({ where: { revisionId } }),
  ]);
  return { boards: board.count, placements: placements.count };
}
