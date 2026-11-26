import "server-only";
import type { PrismaClient } from "@prisma/client";
import { isBomField, mappingProblem, type ColumnMapping } from "@/lib/bom/fields";
import { decidingColumns } from "@/lib/bom/certain-mapping";
import { ingestRevision } from "@/server/bom-pipeline";
import { linkPlacements, placeFromBoard } from "@/server/board";
import { lookUpAfterMatch } from "@/server/jobs";

type Db = PrismaClient;

/**
 * A BoM whose columns were never confirmed, but whose board is known (Gerbers or a pick-and-place file): its lines are
 * matched with the columns its upload read, as an upload of BoM + board together does, so the footprint match opens
 * instead of the mapping page. The columns stay one click away there ("Check columns").
 *
 * True when the revision is matched (now, or already was). False when it is still to map: no board, columns that
 * cannot be used as they are (nothing to match a line by, no quantity or designators), or matching failed.
 * `needBoard`: only when board files are on file (opening a saved BoM); false when the caller has just saved them.
 */
export async function matchWithReadColumns(db: Db, revisionId: string, opts: { userId?: string | null; via: string; needBoard?: boolean }): Promise<boolean> {
  const rev = await db.bomRevision.findUnique({
    where: { id: revisionId },
    select: { status: true, columnMapping: true, rawRows: true, headerRow: true, board: { select: { source: true } }, _count: { select: { placements: true } } },
  });
  if (!rev) return false;
  if (rev.status !== "DRAFT") return true;
  if (opts.needBoard && !rev.board && !rev._count.placements) return false;
  const rows = Array.isArray(rev.rawRows) ? (rev.rawRows as string[][]) : [];
  if (!rows.length) return false;
  const mapping: ColumnMapping = ((rev.columnMapping ?? []) as unknown[]).map((f) => (typeof f === "string" && isBomField(f) ? f : null));
  if (!mapping.length || mappingProblem(mapping)) return false;
  try {
    // Claimed first, so two requests opening the same BoM at once do not both match it.
    const claimed = await db.bomRevision.updateMany({ where: { id: revisionId, status: "DRAFT" }, data: { status: "MAPPED" } });
    if (!claimed.count) return true;
    await ingestRevision(db, revisionId);
    await linkPlacements(db, revisionId);
    if (rev.board?.source === "gerber") await placeFromBoard(db, revisionId);
    await lookUpAfterMatch(revisionId, opts.userId);
    await db.auditLog.create({
      data: { userId: opts.userId ?? null, action: "bom.map", entity: "BomRevision", entityId: revisionId, data: { saveTemplate: false, auto: true, via: opts.via, reviewColumns: true, columns: decidingColumns(rows[rev.headerRow] ?? [], mapping) } },
    });
    return true;
  } catch (e) {
    console.error(`Matching BoM revision ${revisionId} with the columns as read failed:`, e);
    await db.bomRevision.update({ where: { id: revisionId }, data: { status: "DRAFT" } }).catch(() => undefined);
    return false;
  }
}
