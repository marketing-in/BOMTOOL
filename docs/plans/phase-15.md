# Phase 15 — Can we build it? Feasibility, joints, paste, shifts and gated sign-off

**Ask (user, 2026-11-12):** upload a BoM or Gerbers and have the tool say, as an EMS would for a customer's product:
is it feasible and how easy; how many pins (solder joints) the process has to make and check; how many grams of
solder paste it uses; what everything costs (BoM, board, paste, box); how many shifts the lot takes; and a process
check that moves one step at a time and cannot go back.

## What exists and what's missing
| Have (Build & quote, route, operations) | Missing |
|---|---|
| Bare board, component, box and conversion cost per quantity | Solder paste and solder are not costed |
| Process route on our lines, SMT seconds per board | No solder-joint count; nothing says what SPI / AOI / X-ray must check |
| Line capability (`lineFits`), feeder set-ups, clear-to-build | No single "can we build it" verdict that gathers them |
| Lines with `shiftsPerDay` | No hours → shifts → working days for a lot |
| Gerber upload → artwork + components | Paste layer and drills are drawn but never measured |
| Quote draft / issue | No step-by-step review with sign-off |

## Decisions
1. **Joints from the parts.** `src/lib/feasibility/joints.ts` counts joints per designator from its package (pins,
   plus the exposed pad on QFN / DPAK), split SMT top / bottom, through-hole, press-fit and hidden (under-body) —
   and from that what each inspection has to look at: SPI deposits, AOI joints, X-ray joints, hand/THT joints,
   and an estimate of probe nets (no netlist in a BoM).
2. **Paste measured when the Gerbers allow, estimated otherwise.** At Gerber upload `src/lib/board/fab-measure.ts`
   rasterises the paste layers (else the mask openings without a drill) and stores aperture count and area per side,
   plus drill counts, on `BoardModel.fab` / `BoardPreview.fab`. Paste per board = aperture area × stencil thickness ×
   transfer × paste density. Without measured area, each package's land pattern gives the area. Stencil thickness
   follows the finest feature (100 / 120 / 150 µm). Lot issue adds wipe loss and the bead left on the stencil each
   shift, in 500 g jars. Wave / selective solder is grams per joint plus dross.
3. **Shifts from the route.** `capacity.ts`: hours per stage for a quantity (SMT from the quote's seconds per board
   and set-up, through-hole, coating, depanel, test, box build, packing), productive hours per shift, each line's
   shifts per day → shifts and working days, the bottleneck, and the same lot at 1 / 2 / 3 shifts a day.
4. **One verdict.** `gates.ts` turns everything into checks (green / amber / red) in nine gates in build order:
   files & data → bare board → components → paste & SMT → through-hole & finishing → inspection & test → box build →
   cost → capacity. Verdict: *Easy to build*, *Buildable with care*, *Not buildable as it stands*.
5. **Gated sign-off that does not go back.** `FeasibilityReview` (new table) holds the sign-offs. A gate opens only
   when every gate before it is signed; a signed gate is locked — nobody edits or reopens it. A red check blocks the
   sign-off unless Quality or an administrator waives it with a written reason. If the product changes after a
   sign-off the gate shows *changed since sign-off*. The only way back is an administrator starting a **new review**;
   the old one is kept as superseded. All nine signed = review passed.
6. **Paste in the quote.** New rate `pastePerKg`; the printing step carries paste per board and one stencil load a
   lot, so the customer quote includes it.
7. **Plant figures are data.** `src/data/assembly.ts` (paste density, transfer, bead, solder per joint, seconds per
   operation, shift hours) — indicative defaults to be set from the plant's own numbers.
8. **Gerber-only boards too.** The quick look shows joints, paste and stencil from the components read off the files.

## Steps
1. Plant data + pure engine (`joints`, `paste`, `capacity`, `gates`) with unit tests.
2. Gerber measuring at upload; migration (`fab` columns, `FeasibilityReview`).
3. Server (`src/server/feasibility.ts`), paste in process cost, sign-off actions.
4. Page `/boms/[id]/feasibility`, links from the BoM and Build & quote, quick-look section.
5. Verify in the app; docs.

## Not in this phase
Netlist-based test coverage, panelisation (boards per panel), reflow profile simulation, finite scheduling of the
lot against other work orders (Operations → Schedule does that for released work orders).
