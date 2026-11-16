# Phase 14 — Components from Gerbers

**Ask (user, 2026-10-31):** a Gerber-only upload should also list its components, using circuitflow's part-guessing,
so a board that arrives without a BoM can still go through Build & quote.

## What exists and what's missing
| Have | Missing |
|---|---|
| Quick look: Gerbers → 3D bare board + bare-board prices | No components: the board is empty, nothing to quote but the PCB |
| *Add the BoM* carries the quick look's Gerbers into a BoM upload | A board with no BoM file can't become a BoM at all |
| BoM upload with Gerbers: placements only from a pick-and-place file | Gerbers with pad designators (KiCad/Altium X2) or a component layer (X3) carry positions too — unused |
| Components step: a line without a part says "go to the BoM and pick a candidate" | No way to choose a part that fits the footprint, or to give part of a line another part |
| circuitflow (user's app): Gerber/X2/X3 reader + part guesser from pads, drills and silkscreen | Not in this app |

## Decisions
1. **circuitflow's reader, vendored.** `gerber.js` (RS-274X/X2/X3 + Excellon parser, layer naming, components from
   the component layer → placement file → pad designators → guessed) and `gerberInfer.js` (mask openings rasterised into
   pads, pads clustered by pitch, rows, tabs and silkscreen outlines, then classified: 0603, SOT-23, SOIC-8, QFN-32,
   DIP-28, header 1×8 …) go into `src/vendor/circuitflow` beside the SMT line, typed through `entry.ts`. One change: the
   board result also returns its outline centre, so parts go back to Gerber coordinates.
2. **One wrapper, `src/lib/board/find-parts.ts`.** `findParts(gerbers, centroid?)` → `{ source, parts, notes }`. Source is
   the best the files allow: `component-layer`, `placement`, `pad-designators` (real designators) or `guessed`
   (designators numbered here, no values or part numbers). Parts are in Gerber millimetres, Y up — the same frame as a
   pick-and-place file — so they become `Placement` rows unchanged and line up with the artwork. Parts with pads but no
   package (designators from X2 only) get the pad classifier's package.
3. **Run once, at upload.** Raw Gerbers aren't stored, so the quick look runs the finder while it renders and keeps the
   result on `BoardPreview.components` (new JSON column). Older quick looks say "upload again to list the components".
   A BoM upload with Gerbers but no pick-and-place file takes placements from the Gerbers when they carry real designators
   (guessed designators would not match the BoM's, so they are not used there).
4. **Quick look shows the components**: where they came from, counts (parts, SMT placements per side, through-hole,
   footprints), the parts drawn on the 3D board, and a table by footprint — what it is, how many, designators, side, value
   or MPN when the files had them, and how many parts in our catalogue (and stores) come in that package.
5. **Quote this board without a BoM.** The new-BoM page, opened from a quick look with components, offers *Use the N
   components found on the board* — the BoM file becomes optional. The rows are generated (designators, qty, value, MPN,
   package, description; grouped by MPN, else value + package, else package + kind), mapped and matched by the normal
   pipeline, the board model and placements are copied, and it opens Build & quote step 1. Guessed rows never contain
   words the parametric matcher would read as a value.
6. **Choose the part, in the components step.** A line without a part shows a *Choose the part* panel: the line's match
   candidates, then parts in our catalogue that fit the footprint (same package; the kind from the designator prefix or
   the guess narrows categories), ours first, then distributor stock and price, and a search. *Use* takes the part for
   all of the line's places, or only for the designators ticked — the rest stay on the line (the line is split). Every
   BoM benefits, not only Gerber ones.
7. **Assembly cost knows through-hole without a part.** The route counts a placement as through-hole from its footprint
   when the line has no part yet (DIP, header, axial, radial, TO-92 …), and unmatched parts get 3D bodies sized from the
   footprint name.
8. **A realistic sample.** The GW-200 sample Gerbers get IPC-sized land patterns, proper spacing and silkscreen outlines
   (the old pads sat inside the bodies, so 0603s looked like 0402s), so guessing on it is a fair test. circuitflow's
   KiCad-style CTRL-01 set (X2 designators + .pos) is a unit-test fixture for the designator paths.

## Steps
1. Vendor + wrapper + unit tests (circuitflow's parser and guesser tests, CTRL-01 both ways, GW-200 against its PnP).
2. Migration (`BoardPreview.components`), quick look upload + BoM upload placements.
3. Quick look page: components section + 3D parts.
4. BoM from found components (new-BoM page option, upload action), then Build & quote.
5. Choose-the-part panel + split action; route THT fallback and footprint bodies.
6. GW-200 sample regenerated; e2e (quick look → components → quote this board → choose a part); docs; commit.

## Not in this phase
Reading designators or values from silkscreen text (OCR), BGA ball maps from paste/mask, panels with several boards.

## Outcome (2026-10-31)
- Quick look: the GW-200 Gerbers alone (no pick-and-place) give all 76 parts, each within 0.03 mm of where its
  pick-and-place file puts it, in 17 footprints (44 × 0603, 8 × 0805, SOIC-8, QFN-24/48 + EP, SOT-23-5, crystal, headers,
  radials); 69 SMT placements, 7 through-hole, 335 pads. Reading takes about 0.3 s at upload. CTRL-01 (KiCad X2 + .pos)
  gives its 19 parts with designators and values, and from the pad designators alone without the .pos.
- *Quote this board* → *Use the 76 components found on the board* → Build & quote: 17 lines, placed on the board; the
  route prices 69 placements on L1 and 7 through-hole parts, X-ray for the QFNs. Choosing RC0603FR-071KL for 20 of the 44
  0603 places makes it line 18, matched and priced with every detail of Phase 13; 24 places stay to be chosen.
- Changes to circuitflow's code are marked "(EMS platform)": the outline centre is returned; a small drill in a big
  SMD pad is a thermal via, not a pin (it made QFNs "25-pad parts"), and vias are smaller (< 0.55 mm drill, ≤ 1.2 mm
  pad, so 0.6 mm fine-pitch pins stay pins); QFN pins are counted without the exposed pad; SOT-23-5/6 and 4-pad
  crystals are named. A .pos value that is a part number (STM32F407VGT6, 1N4148) also fills the MPN column.
- The GW-200 sample was regenerated: IPC land patterns (its 0603 pads sat inside the body and read as 0402), no
  overlapping parts, vias kept off pads, silkscreen boxes, 0.05 mm mask expansion. Placements moved; the BoM did not.
- `scripts/e2e-dev.ts` (+ launch.json `ems-e2e-dev`, `ems-e2e-prod`) runs the app on the e2e database with the
  distributor keys blanked, for checking flows that write.
- Checks: typecheck and lint clean; unit tests 334 (19 new in `tests/unit/find-parts.test.ts`: circuitflow's parser and
  guesser cases, CTRL-01 three ways, GW-200 against its pick-and-place file, BoM rows the matcher can't misread);
  e2e 25/25 from a fresh seed (6.6 min) — the new `phase14.spec.ts` uploads the GW-200 Gerbers alone, checks the
  components table, quotes the board without a BoM file and gives 20 of the 44 0603 places a part.
