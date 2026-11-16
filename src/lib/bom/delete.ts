/**
 * Deleting a BoM revision (pure). What goes with it and what stops it: a revision that work orders are building
 * cannot be deleted — the floor's records point at it — so those are closed first.
 */

export type RevisionImpact = {
  bomName: string;
  revision: string;
  lines: number;
  /** Gerbers drawn into a board model. */
  hasBoard: boolean;
  placements: number;
  quotes: number;
  issuedQuotes: number;
  reviews: number;
  /** Shopping carts made from it: they stay, unlinked from the BoM. */
  carts: number;
  workOrders: string[];
  /** Other revisions of the same BoM; with none left, the BoM itself goes too. */
  otherRevisions: number;
};

/** Why it cannot be deleted, or null when it can. */
export function deleteBlocker(i: RevisionImpact): string | null {
  if (!i.workOrders.length) return null;
  const list = i.workOrders.slice(0, 3).join(", ") + (i.workOrders.length > 3 ? ` and ${i.workOrders.length - 3} more` : "");
  return `Work orders are building this revision (${list}). Close or cancel them before deleting it.`;
}

const n = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-IN")} ${k === 1 ? one : many}`;

/** What the delete removes, one sentence per thing, for the confirm dialog. */
export function impactLines(i: RevisionImpact): string[] {
  return [
    n(i.lines, "BoM line") + " with their matches and chosen sources",
    i.hasBoard ? "The Gerbers and the board drawn from them" : null,
    i.placements ? n(i.placements, "part position") : null,
    i.quotes ? `${n(i.quotes, "customer quote")}${i.issuedQuotes ? `, ${i.issuedQuotes} already issued to the client` : ""}` : null,
    i.reviews ? "The “Can we build it?” review and its signed gates" : null,
    i.carts ? `${n(i.carts, "cart")} made from it stay, no longer linked to this BoM` : null,
    i.otherRevisions ? null : `The BoM “${i.bomName}” itself — this is its only revision`,
  ].filter((x): x is string => !!x);
}

/** The text the user types to confirm: the revision label, so a slip of the mouse cannot delete it. */
export const confirmWord = (i: Pick<RevisionImpact, "revision">) => i.revision.trim();
