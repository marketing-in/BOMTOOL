# Phase 25 — Picture first: less text, more infographics

Asked for: make the tool **minimalist**, show the details **visually** (infographics), keep the **text to a
minimum**, and make it look more professional and real.

Kept as it is: the blue ThinkSemi look (colours, sidebar, type). A whole-app restyle was rejected in phase 22, so
this phase changes **what a screen shows first**, not the theme.

## Where the words are (measured on GW-200, words inside the page)

| Screen | Words | Height |
| --- | --- | --- |
| 4 · Can we build it? | 2,788 | 10,600 px |
| 9 · Process route | 1,026 | 4,400 px |
| 6 · Components | 900 | 4,400 px |
| 8 · Quote, 7 · Box, 5 · Bare board | 425–550 | already led by a chart or the 3D view |
| Home, lists | under 250 | already tiles and bars |

So the work goes where the text is: steps 4, 9 and 6, then the headers every step shares.

## Rules for every screen

1. **A picture and a number first.** Each section opens with a drawing (ring, lanes, flow, bar) and one figure.
2. **One line of words at most** under a title. The explanation sits behind an **ⓘ** (tap to read).
3. **Tables are folded** under a labelled bar with their headline figure, unless the table is the task itself
   (the BoM grid, the sourcing list).
4. **The real board on the page**: the top side as drawn from the customer's Gerbers, with the parts on it.
5. Colour still means status (green / amber / red); every colour has an icon or a word beside it.
6. Nothing is removed: every figure that was on the page is still there, one tap away.

## Shared pieces — `src/components/viz/`

- `ring.tsx` — a ring split into coloured parts with a figure in the middle (moved out of the footprint match).
- `seg-bar.tsx` — one stacked bar with its legend.
- `kpi.tsx` — a tile: icon, big figure, two-word label, ⓘ for the small print.
- `info.tsx` — the ⓘ button (popover; works by tap on a tablet and by keyboard).
- `fold.tsx` — a folded section: icon, title, headline figure, chevron.
- `step-icon.tsx` — one icon for each process step and machine station.
- `board-picture.tsx` — the board from above: Gerber artwork with the placed parts drawn on it
  (served by `/boms/<id>/picture`, signed-in users only).
- `process-flow.tsx` — the route as a chain of icons grouped by stage; colour = can we do it, shape = machine /
  bench / bought in, a shield where masking is needed.
- `line-lanes.tsx` — each of our lines as a lane of station icons; the line to use is marked.

## Screens

### 4 · Can we build it? (10,600 px → about 2 screens)

1. **Answer band**: the board picture, the verdict in a few words, a ring (OK / watch / blockers), quantity
   switch, four tiles (pins, paste, price, shifts).
2. **Our machines**: one lane per line with a station icon per step. Machine names and reasons open on a tap.
3. **The process**: the 19 steps as a chain of icons. The full list is folded underneath.
4. **AI review**: the button and its result, unchanged in content.
5. **Nine gates**: a row of nine numbered circles (locked, open, waiting); the open gate's checks and the sign
   button below it. Signed and waiting gates open on a tap.
6. **Folded, each with its figure and a small chart**: joints (how they are inspected), solder paste, shifts,
   cost, SMT line stations, consumables, spend and charge.

### 9 · Process route

The same chain of icons on top; each step a slim row (icon, name, line and machine) that opens to the reason,
parts, checks and links. Steps with a watch-out stay open.

### 6 · Components

The four ways to source become four slim cards: one line each, cost and wait as bars on a shared scale, the
long explanation behind ⓘ.

### Step headers (5–8)

Shorter title line; the "choices so far" strip stays (it is already figures).

## Not in this phase

Home, lists, inventory, sourcing, knowledge: already tiles, bars and tables that are the task. To be looked at
after this, screen by screen, if wanted.

## Checks

- Unit tests, typecheck, lint.
- End-to-end specs that read these screens updated to the new layout and re-run: `gerbers-only`, `phase8`
  (route), `phase13` (quote), `phase14`, `operations`.
- Each changed screen looked at in light, dark and at tablet width.
- App tour and user guide updated for step 3 (footprint match) and the new look of step 4.

## Outcome

Measured on GW-200 at 1280 px, words a reader sees without opening anything:

| Screen | Words | Height |
| --- | --- | --- |
| 4 · Can we build it? | 3,255 → 740 | 10,621 → 3,445 px |
| 9 · Process route | 1,220 → 411 | 4,439 → 2,476 px |
| 6 · Components | 1,327 → 1,101 | 4,439 → 4,123 px (the lines and the chosen part's sources are the task) |
| 3 · Footprint match | unchanged | the result dots now sit on the real board |

Built as planned, with these differences:

- **Step headers (5–8) were left alone**: the "choices so far" strip is already figures, and the bare board, box and
  quote screens already open with the 3D view or a chart.
- **Footprint match** got the real board under its dots (`boardFrameFor` reads only the frame of the Gerber drawing,
  not the drawing) and slimmer count tiles.
- **One rule changed** (`checkPlant`): when two lines fit a job equally well, the line the process route planned
  wins the tie. Before, the machine check could say "use L1" while the route, the shifts and gate 4 said L2 — the
  lanes put the two answers side by side, so they have to agree. A line that fits worse never wins.
- The AI review moved to its own file (`src/components/ops/ai-review.tsx`) so the process panel renders on the server.

Checked: typecheck, lint, 506 unit tests; the end-to-end specs for these screens on the e2e database
(`gerbers-only`, `phase8`, `phase13`, `phase14`, `operations`, `bom-upload`, `delete`); light, dark and 820 px wide;
taps, keyboard and folds on a touch screen (station and step cards, ⓘ, folded tables).

`phase8.spec.ts` looked for the route by its old link name ("Route") — stale since the numbered strip — and now
goes through the strip; its step row is opened before its text is read.

Not done: home, lists, inventory, sourcing, parts, operations and knowledge screens are as they were.
