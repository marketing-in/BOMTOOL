# Phase 11 — A board that looks like a real PCB

**Ask (user, 2026-10-27):** a photo of a real PCBA (bright green glossy mask, copper traces visible through
it, via fields, gold pads, silkscreen designators, QFP/SOIC ICs with markings, chip resistors marked "R00",
tan MLCCs, screws, a barcode sticker) — "I want the 3D board like this, with the circuit design and
components, more real."

## What the viewer draws today
Real bodies (gull-wing and QFP leads, QFN pads, cans, modules), laser marking on ICs, a clear-coat mask. The
board face is either the pcb-stackup composite of uploaded Gerbers (dark, flat) or, without Gerbers, a flat
mask colour with pad rectangles. No traces, vias, silkscreen or texture relief.

## Decisions
1. **Board face built in layers, like the real thing:** laminate → copper (traces, pads, pour) → solder
   mask at ~80 % opacity, so copper under it reads lighter green → exposed pads in the finish colour (ENIG
   gold / HASL silver) → silkscreen. A bump map from the same copper gives traces and pads relief under
   the clear coat.
2. **Gerbers stay the truth:** with uploaded Gerbers the copper, mask openings and silk come from the
   files (per side); only the rendering changes.
3. **Without Gerbers, a plausible layout is generated** (deterministic, `src/lib/board/artwork.ts`, pure +
   unit-tested): per-pin pads from each body (chip ends, SOIC/QFP leads, QFN pads + thermal pad), short
   escape traces from pads to vias, 45° routes between neighbouring parts, a via-stitched ground pour on the
   bottom, silkscreen outlines with pin-1 marks and designators, three fiducials, corner mounting holes,
   and a barcode label (Code 39 of the BoM/revision) where the board has room. Labelled as approximate,
   as today.
4. **Parts:** chip resistors carry their EIA value code ("103", "4R7", "000") from the BoM value; ICs keep
   the MPN marking; screws (torx heads) in the corner holes of generated boards.
5. Brighter, more saturated mask colours.

## Steps
1. `artwork.ts` (pads, traces, vias, labels) + `resistorCode()` with tests.
2. Texture compositor for both sources, with bump maps; board material with relief.
3. Part markings for resistors; screws; viewer data carries `marking` and hole positions.
4. Look at it (screenshots, light and dark), tune; tests; commit.

## Outcome
- **Any uploaded Gerbers** (BoM revision or Viewer → Quick look) render per side from their own copper,
  mask and silk files: copper at ~34 % through the mask (traces read lighter green), the finish where the
  mask is open, silkscreen, and a relief map so traces and pads catch the light. Their real routing shows.
- **Boards without Gerbers** get generated artwork (`src/lib/board/artwork.ts`): per-pin pads, 45° routes,
  escape vias, QFN thermal via arrays, a stitched ground pour on the bottom, silk outlines, pin-1 dots,
  designators, fiducials, corner holes with torx screws and a Code 39 sticker when there is room. The
  approximate layout now keeps a 6.5 mm edge band free for holes and stitching.
- **Parts:** chip resistors (0603 up) print their EIA code from the BoM value — "103", "4R7", "000",
  "R010" for a 10 mΩ shunt; ICs keep the MPN.
- **GW-200 sample Gerbers** regenerated with routing (top traces, vias, bottom links; same placements and
  centroid) and re-imported into the dev database's GW-200 rev B board.
- Brighter mask colours; texture resolution 16 px/mm.
- Tests: unit 286 (+20: pads per package, routing, determinism, resistor codes); e2e 3D flows 6/6.
