# Phase 33: five BoM steps, and our real lines

## Ask

- In a BoM, put these on the same page:
  - BoM, Gerbers and components;
  - compare and mismatches;
  - estimate and quote.
- The box is optional.
- Process route and SMT line go on the same page.
- The SMT line should use our own machines (Downloads/MACHINE DETAILS): read the lines, add the machines, build the line.

## Steps (src/lib/bom/workflow.ts)

| # | Step | Page | Sections (old address → anchor) |
|---|------|------|---------------------------------|
| 1 | BoM, Gerbers & components | `/boms/[id]` | BoM `#bom` · Gerbers `/board` → `#gerbers` · Components `/build/parts` → `#components` |
| 2 | Compare & mismatches | `/match` | Compare `#compare` · Mismatches `/mismatch` → `#mismatches` |
| 3 | Estimate & quote | `/feasibility` | Estimate `#estimate` · Bare board `/build/board` → `#bare-board` · Quote `/build/quote` → `#quote` |
| 4 | Box (optional) | `/build/box` | Box |
| 5 | Route & SMT line | `/route` | Process route `#route` · Line fit `/lines` → `#line-fit` · SMT line `/line` → `#smt-line` |

The old ask did not place two sections, so I chose:

- **Bare board** sits with the quote, because it is a cost line.
- **Line fit** sits with the route and the SMT line, because it chooses the line.

How it is built:

- Each old step page is now a section component in `src/app/(app)/boms/[id]/_sections/`.
- `StepPage` (`src/components/bom/step-page.tsx`) stacks the sections. Each section streams in its own `Suspense`.
- Each old address is a one-line redirect, built with `sectionHref`, that keeps the query.
- Progress is still judged per section (`sectionStates`) and rolled up per step (`stepState`).
- An optional step is never the "next" step.

## Plant (prisma/seed-data/factory.ts, `npm run plant:sync`)

All figures come from our machine sheets. Figures the sheets do not give are left blank, never guessed.

**Line 1**, per the Line 1 deck of 13 Nov:

- Famecs Lative F20 laser marker (0.5–2.0 mm boards, 430×330 max)
- HTGD GD450 printer, semi-automatic, 15–20 s cycle
- Magic-ray ICON SPI
- Yamaha M20 i-Pulse: 30k CPH rated, about 8.5k measured, 144 feeders
- Tronwin TW-VP860N oven: 8+8 zones, 2652 mm heated
- Magic-ray V5000 2D AOI
- Ecopmin link and cooling conveyors. Their positions in the line come from the photos and need confirming on the floor.

**Line 2**:

- MPM Momentum II 100 printer, 11 s cycle
- Koh Young KY8030-2 SPI
- 2 × Yamaha YSM20R Z:LEX: 95k CPH rated, 66k measured each
- Vitronics Soltec Centurion 820 oven: 8+8 zones, 3550 mm heated
- No AOI on the sheet.

**Line 3**:

- Hand insertion
- EMST Stallion FC-PLC-JW wave
- Janome JR3403 coater with SVC-300 valve
- Janome JR3403 router depaneler

**Line 4**: not covered by the sheets, so it is unchanged.

**Not placed in a line:**

- Earlier Line 1 kit: Konark 710EC oven and Omron VT-RNS II AOI.
- Stores: reel counter, Stericox fridge and dry cabinet.
- Brochures only (candidates): CKD VP-01G, Magic-ray V5300 and Cube.

## Rules that changed

- **The laser marker binds the line.** It is inline, so its size and thickness limits apply to the whole line (conveyor kind), and it gets a "Laser marking" check.
- **No X-ray in the plant:**
  - BGA: still red.
  - Bottom-terminated parts (QFN, DFN…): amber. Use AOI on the visible fillet, plus an outsourced X-ray or a cross-section of the first boards.
- **Running time** uses the measured placement rate (the sum of the placers' `actualCph`) where every placer states one. Otherwise it uses rated × efficiency.

## SMT line simulation

`simStations` (`src/lib/ops/sim-stations.ts`) turns a line's machines into circuitflow stations:

- marker, printer, SPI, placers merged into one station, oven, AOI;
- conveyors are left out.

The planner (`src/vendor/circuitflow/factoryLine.js`) takes `opts.line` and schedules only those stations. Per station it uses:

- **Printer:** the sheet's cycle, never under the stroke the 3D cycle needs.
- **SPI:** area rate.
- **Placement:** measured CPH.
- **Oven:** zone length = heated length / 9.
- **AOI:** fields of view × ms per field.

The 3D line labels each machine with its model. Clicking a machine shows its sheet figures. A line without AOI says so.

## Tests

- `tests/unit/workflow.test.ts`: the five steps, `locate`, `sectionHref` and the rolled-up progress.
- `tests/unit/plant.test.ts`: the plant against the sheets, the marker's limits, X-ray amber vs red, measured CPH, the station mapping, and a plan through Line 2's stations.
