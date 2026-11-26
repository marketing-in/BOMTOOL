# Phase 48 — A simpler, low-text UI

## Why
The user (26 Nov): "make the site more refined and ui and ux simple low texted ui". A survey of the main pages
(words in `<main>`, long grey paragraphs, screenshots at 1280 px and 820 px tablet) showed most words are data in
tables, which belong there; the prose to cut was in page and section intros, a few long notes, a machine walkthrough
that was always open, and repetition (a BoM's name three times on step 1, adapter chips repeating "Not configured").

## What (refinement: same world, same workflows, nothing removed)
1. **Explanations on demand**: `PageHeader` shows a description under the title only when it is a short line (≤ 80
   characters); a longer one opens from an ⓘ beside the title (the existing `Info` popover). New `SectionHeading`
   puts a section's explanation behind its ⓘ. Used on both validation pages.
2. **Repetition removed**: a project name equal to the BoM's name is no longer repeated (step 1, quote); the quote's
   "Material quote" label moved from above the heading into the line under it; section links on a step page drop
   their "3.1 / 3.2" numbers; sourcing's distributor chips say only what differs (name + ring when not configured,
   details in the tooltip).
3. **Lines page**: the machine panel leads with its one-liner, "Show this machine's process in 3D" and its figures;
   the description, step-by-step walkthrough and "how to recognise it" fold into "How it works".
4. **Shorter copy**: board-files prompt on the mapping page, CSV note, line editor hint, directory and dictionary
   notes, distributor look-up panel, validation empty states, distributor status as dots.

## Verified
- Screenshots after (desktop and tablet, light and dark with an ⓘ open): validation, BoM step 1, footprint match,
  quote, lines, sourcing.
- Impeccable detector: 0 findings on the changed files; tsc and eslint clean; 1,027 unit tests pass.

## Notes
- Since 26 Nov morning, port 5432 is served by the Postgres of `~/Downloads/bom-tool-main` (the other copy of the
  project). This project's own database (`.pgdata`) was run on port 5433 for the dev server only; its data is intact.
  The dev server's start (`db:ensure` → `prisma migrate deploy`) applied this project's three newest migrations to
  that other database before this was noticed (additive tables and columns).
