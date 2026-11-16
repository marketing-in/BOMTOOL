# Phase 16 — Rank a BoM's components and their sourcing options

## The request

"If BoM show the components, user can choose the option for shortest lead time, low to high — this type, to
analyse all the options."

## What exists (commit 1ca6e1c)

- `src/lib/costing/strategy.ts` — whole-BoM sourcing strategies (our order / lowest price / shortest lead /
  lowest risk), `sourceRisk`, `compareSources`, `compareStrategies`.
- `/boms/[id]/build/parts` — strategy cards on top, the BoM lines on the left, and for the selected line every
  source (our stores, partners, distributors, marketplace) grouped by tier with a **Use** button (`pinLine`).

What is missing: the user cannot *order* what they see. Lines are always in BoM order and sources always in
tier order, so "which option is fastest / cheapest / safest / has most stock" needs reading every row.

## What this phase adds

1. **One "Order by" control** on the components step: BoM order · Lead time · Price · Risk · Stock, with a
   low-to-high / high-to-low toggle. Kept in the URL (`sort`, `dir`) like the existing `show` and `line`, so it
   survives choosing another line, a reload and a shared link.
2. **The line list** follows it: lead = the longest wait among the sources the quote uses for the line,
   price = cost per board, risk = the part's risk score, stock = everything available anywhere.
3. **The selected line's sources** become one flat ranked list (rank number, source, tier, risk colour of the
   source, stock, unit, landed, lead) with the ranked figure drawn as a bar. The source the quote uses now is
   marked "In the quote"; a source chosen by hand is marked "Chosen". **Use** still pins a source.
   "BoM order" keeps today's tier-grouped view.
4. Sources that cannot be used (no stock) and figures we do not know always sink to the bottom, whichever
   direction is chosen.

## Design

- `src/lib/costing/rank.ts` (pure, Vitest `tests/unit/rank.test.ts`): `rank(items, figures, key, dir)`,
  `readSort`, `readDir`, labels. Direction applies to the ranked figure only; ties fall to the better of the
  other figures. Source risk reuses `sourceRisk` from `strategy.ts`.
- `src/server/build.ts`: `LineRow` gains `leadWeeks`, and `plan` rows carry `offerId` / `excessListingId` /
  `leadWeeks` so the page can mark the source in use.
- `src/components/build/order-by.tsx`: the control (links, server-rendered — no client state).
- `src/app/(app)/boms/[id]/build/parts/page.tsx`: reads `sort`/`dir`, orders the list, renders the ranked table.
- No schema change, no new dependency. Offers still come from the stored distributor offers the adapters
  (mock included) write; nothing calls a distributor from this page.

## Lead time of a source, as ranked

Our stores and consignment: 0. A distributor offer that covers the whole need from stock: 0 ("in stock").
Otherwise the factory lead time in weeks. A partner/excess listing: its quoted lead days. Unknown: last.

## Verify

Vitest for the ranking; in the running app on a seeded BoM: each key in both directions, choose a source,
dark and light, tablet width.
