# Phase 36: seven BoM steps, no box step

The user's order (17 Nov 2026): BoM › Gerber › Components › Compare, named "Footprint & mismatch" › Line possible › SMT line, and remove the box. Asked about the steps the list left out, they chose to keep Estimate & quote as the last step, with the process route on the Line possible page.

| # | Step | Page | Sections |
|---|------|------|----------|
| 1 | BoM | `/boms/[id]` | BoM |
| 2 | Gerber | `/board` | Gerbers, with the board studio inline |
| 3 | Components | `/build/parts` | Components |
| 4 | Footprint & mismatch | `/match` | Footprint `#compare` · Mismatches `#mismatches` |
| 5 | Line possible | `/lines` | Line possible `#line-fit` · Process route `#route` |
| 6 | SMT line | `/line` | SMT line |
| 7 | Estimate & quote | `/feasibility` | Estimate · Bare board `#bare-board` · Quote `#quote` |

- Box: no longer a step and not in the strip. A product ships board-only unless a box is chosen. `/build/box` still opens the box page (on its own, not a step), so the box gate in step 7 can still link to it.
- Old addresses redirect to their new place: `/route` → `/lines#route`, `/mismatch` → `/match#mismatches`, `/build/board` and `/build/quote` → `/feasibility#…`.
- Tests: `tests/unit/workflow.test.ts` covers the seven steps.
