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

## Plant from the line notes (18 Nov 2026)

The user photographed the plant's handwritten line list:

| Line | Printer | SPI | Pick & place | Reflow | AOI |
|------|---------|-----|--------------|--------|-----|
| L1 | HTGD GD450 | Magic-ray ICON | Yamaha M20 i-Pulse | Tronwin TW-VP860N | Magic-ray V5000 |
| L2 | MPM Momentum II 100 | Koh Young KY8030-2 | 2 × Yamaha YSM20R Z:LEX | Vitronics Soltec Centurion 820 | Magic-ray Cube+ (new) |
| L3 | HTGD GD450 (as L1) | CKD VP-01G | Yamaha YSM20R | Tronwin TW-VP860N (as L1) | Magic-ray V5300 |

- L1 keeps the laser marker and conveyors from the Line 1 deck.
- L2 has two YSM20R, as on the machinery sheet; the user confirmed this.
- The user chose to remove the through-hole kit (EMST wave, Janome coater and router) and the made-up box-build line. Their profiles stay in `machine-models.ts` with `installed: false`.
- `npm run plant:sync` now removes lines that are no longer in the file, or retires them if work orders still point at them.
