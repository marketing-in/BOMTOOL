# Phase 26 — Picture first, part 2: Home and the BoM list

Asked for: carry the picture-first look of phase 25 on to **Home** and the **BoM list**. Same rules, same blue
theme, same shared pieces (`src/components/viz`).

## The BoM card (used on both screens) — `src/components/bom/bom-card.tsx`

One card per BoM revision, the same on the list and on Home:

- **The board itself** on the left: the top side from the Gerbers with the placed parts on it. Without Gerbers and a
  pick-and-place file there is nothing real to draw, so the card shows a line drawing and "No Gerbers yet".
- **Where the job stands**: the ten steps as one segmented bar (green done, amber needs a look, grey not started),
  and the next step to take as a link ("Next: 4 · Can we build it?").
- **The five scores** as five small bars with an icon each, instead of five pills with cut-off names.
- Lines, placements and build quantity as three small figures; lifecycle risk and lines to review only when there
  are any.

The title still links to the BoM itself (step 1).

Data: `src/server/bom-cards.ts` loads the revisions once, then for each card its place in the process
(`workflowFor`) and its board picture (`src/server/board-thumb.ts`: placements, the frame of the Gerber drawing and
package sizes — not the drawing itself). Only the newest 24 cards get the picture and the bar; older ones stay
plain, so a long list stays quick.

## BoM list (`/boms`)

Cards as above, three across on a wide screen. The one-line description goes; the count of BoMs sits beside the title.

## Home (`/`)

- Under the greeting: three chips (lines running, urgent alerts, BoMs with lifecycle risk) instead of a sentence.
- Four figure tiles with icons; the small print behind ⓘ; expiring MSL bags in red on the tile.
- **Lines**: one tile per line with a ring for clear-to-build, the status and the product on it.
- **Customer BoMs**: the newest BoMs as cards (board picture, progress bar), not a table.
- **Needs attention**: a bar of how many alerts are red and amber above the list.
- Supply data, catalogue lifecycle and "Know every part" stay: they are already bars and pictures.

## Checks

- Unit tests, typecheck, lint.
- End-to-end on the e2e database: every spec that signs in lands on Home (the greeting heading stays) and many
  open a BoM from the list by its name (the name stays the card's link); `dictionary` reads Home's headings.
  Run the whole suite.
- Light, dark, 820 px wide.

## Outcome

Built as planned. On Home the BoMs are slim rows (board, name, what to look at, the bar of steps and *Next*), so
the screen stays one glance; the full card with the five scores is on the BoM list, with one legend for the bar
and the score icons under the cards.

- `stepProgress` (`src/lib/bom/workflow.ts`) works out the steps done, the ones that need a look and the next
  step to take; unit-tested.
- The board picture takes any placed part with a body, so the list can draw boards without the full viewer data.

Checked: typecheck, lint, 507 unit tests; the whole end-to-end suite on the e2e database (27 tests); the card's
two links, the picture, the rings and the legend on a touch screen; light, dark and 820 px wide.

Two old end-to-end tests were stale and are fixed: `phase10` looked for a "See it in 3D" link that was removed
from the supply chain page, and `phase12` for the SMT line link by its name before the numbered strip. Both now
go through the strip.
