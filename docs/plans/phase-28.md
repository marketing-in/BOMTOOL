# Phase 28 — Picture first, part 3: the remaining screens

Asked for: carry on with the screens phases 25–27 left as they were — Bare board, Box, Quote, Operations,
Inventory, Sourcing, Parts and Knowledge. Same rules (a picture and a number first, one line of words at most, the
small print behind ⓘ, tables folded unless the table is the task), same blue look, same shared pieces.

On most of these screens the table **is** the task (lots in stores, the buy list, the catalogue), so the table
stays and the screen gets a figure row and one picture above it.

## One tile for every screen

`Stat` (the figure tile used on a dozen screens) takes the look of `Kpi`: an icon, the figure, a short label, the
hint in small print, a colour when the figure is a warning. Every screen that uses it changes at once.

## Screen by screen

| Screen | Picture first | Folded or shortened |
| --- | --- | --- |
| **5 · Bare board** | The board's figures as tiles (size, layers, thickness, copper, finish, mask, IPC class) | "In the directory" folds |
| **7 · Box** | The kit as a bar: on the BoM / ships with the box / missing / to check | Box-type cards lose their paragraphs |
| **8 · Quote** | Price tiles and the cost bars stay on top | The process list and the line-by-line cost table fold, each under its figure |
| **Operations** | Each open work order: its board in 3D with a ring for clear-to-build | Description goes |
| **Inventory** | The open moisture-sensitive bags as clocks: a ring of floor life left for each | Description goes; the table no longer runs off the screen |
| **Sourcing** | What is to buy as tiles and a bar by BoM; market changes counted by kind | Supplier feeds become one row of chips; the grid no longer pushes the right column off the screen |
| **Parts** | Catalogue figures and the lifecycle bar above the table | Description goes |
| **Knowledge** | The three ways in as picture cards; "Watch how it's made" as chains of step icons | Card paragraphs go |

## Checks

- Unit tests, typecheck, lint.
- The whole end-to-end suite on the e2e database (these screens are read by `operations`, `sourcing`, `phase8`,
  `phase13`, `knowledge`, `dictionary`).
- Every changed screen in light, dark and 820 px wide.

## Outcome

Built as planned, screen by screen:

- **`Stat`** has the `Kpi` look (icon, figure, label, small print, a colour for warnings). The BoM page, the
  revision compare, compliance and the work-order page got icons as well, since they use the same tile.
- **Bare board**: the eight board figures are a strip of icon tiles; "In the directory" is a fold.
- **Box**: a bar above the kit list (ships with the box / not on the BoM / machining / to check); with *Board only*
  chosen the board itself is drawn in 3D where an empty panel used to be; box-type cards
  keep their name and count, the paragraph is the tooltip.
- **Quote**: 3,670 px → 1,510 px. The process list folds under its total with a bar by stage; the line-by-line
  table and the rates fold too.
- **Operations**: each open work order shows its board in 3D (a line drawing without Gerbers) and a ring for
  clear-to-build.
- **Inventory**: a row of floor-life clocks for the bags whose clock is running — a ring of what is left, full
  red when it is used up. The table uses the full width when there is no receive form beside it.
- **Sourcing**: supplier feeds as chips, four figures, a bar of what is to buy by BoM; "Refresh runs" folds. The
  grid no longer pushes the right column off the screen (`1fr` → `minmax(0, 1fr)`). The buy list is five columns
  instead of six, so the amount to pay is on screen at 1280, 1024 and 820 px; what cannot be bought anywhere is
  said under *To order*, in red with the word.
- **Parts**: the catalogue by lifecycle as a bar whose legend filters the list.
- **Knowledge**: the three ways in are the picture cards Home already had (now one shared component,
  `src/components/knowledge/entrances.tsx`); each process walk is a chain with one link per step.

Checked: typecheck, lint, 518 unit tests; the whole end-to-end suite on the e2e database (27 tests); every changed
screen at 1280 px, and Operations, Inventory, Sourcing, Quote, Knowledge and the board-only Box in dark mode or at
820 px wide.

Not changed: Work orders, Schedule, Lines, Directory, Compliance (beyond its tiles), Alerts, the part page, the
supply-chain, reverse-engineering and analysis views.
