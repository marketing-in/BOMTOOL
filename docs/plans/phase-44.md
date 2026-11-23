# Phase 44 — Parts sit on their own pads: placement lined up with the copper, checked against the BoM

## Why
The user's boards (Ti-Circle, TYPE7) come as JLC CAM panel Gerbers plus a customer BoM and a pick-and-place file.
The 3D board did not look like the real one:
- a pick-and-place file is written in the single board's frame; the panel Gerbers have their own zero, so a whole
  file can land beside the copper;
- CAD tools give a part's origin, often pin 1 (Allegro's SYM_X/SYM_Y), not its centre: TYPE7's C3 and C4 sit half a
  pad off, L5 below its pads;
- nothing compared the copper with the BoM: an MPN in 0603 on 0402 pads, or an 8-pin part on a 14-pad footprint,
  went unseen;
- a part whose MPN is not in the catalogue got a body from its footprint name only.

## What
1. **Copper pads with sizes** (`src/lib/board/copper-pads.ts`): every flashed pad of the outer copper layers from
   the stored layer drawings — centre and size from the aperture (rect, circle, macro polygon) — in Gerber mm.
   Knock-outs inside masks are not pads.
2. **Line the file up** (`registerPlacements`): votes on the offset between placement points and pads; the best
   offset is taken only when it puts clearly more parts on copper than no offset (a correct file is left alone).
3. **Each part onto its pads** (`snapPlacements`): around each placement, the centre the pads are symmetric about
   (point, mirror left–right or mirror top–bottom: chips, SOT-23, SOIC, QFN, QFP, connectors), inside the land
   pattern the part's body says, nearest the file's point. Which way pin 1 lies from the centre is learnt per side
   from the parts that leave no doubt, and breaks ties. A part turned 90° against its pads is turned to them.
   A part with no copper around it keeps the file's position and is flagged.
4. **What the copper is** (`copperShape`): 2 pads → chip size (0201 … 2512) from pitch and pad size; 3/5/6 pads at
   0.95 mm → SOT-23 family; two rows → SOIC / TSSOP by pitch; four sides → QFN / QFP with or without exposed pad;
   grid → BGA; else "n pads".
5. **Stored** on each placement: the file's own x / y / rotation (`cadX`, `cadY`, `cadRotation`), the copper read
   (`copper`, `padCount`, `padLength`, `padWidth`) and how it was placed (`snap`: pads | kept | off-copper); the offset on
   the board (`BoardModel.alignment`). Done when Gerbers or placements are saved, and once for boards saved before.
6. **Checked against the BoM** (footprint check): the line's package (from the MPN when the catalogue knows it,
   else the BoM's package column) against the copper: chip size and pin count. Mismatches show per designator.
7. **3D body**: from the MPN's package as before; when only a footprint name or nothing is known, the body is
   sized from the copper (a 7 × 7 QFN looks like one).

## Also
- Footprint names read better: EasyEDA's body size, pitch and pin count (`SOIC-8_L4.9-W3.9-P1.27…`,
  `CRYSTAL-SMD_4P-L3.2-W2.5`, `HDR-TH_4P-P2.54`), `SOT-23-3` as three pins, `SR_1PIN` / `BERG_4PIN_1_27MM` by name,
  a trailing `-1` as a variant, not a pin count.
- The placement fit check counts real pads (mask open, vias left out), kept in memory per board version.
- JLC / EasyEDA CPL, Altium Pick Place and KiCad .pos files were checked to read as before.

## Verified
- Unit: `tests/unit/placement-snap.test.ts` (13): pads from drawings (flash sizes, regions, knock-outs, mask, vias),
  a panel offset found to 0.01 mm, pin-1 points centred with the learnt direction, a neighbour's pad end to end not
  taken, centre points left alone, a part turned to its pads, one-pin parts, a fitted part over an unfitted one, no
  copper, copper read as 0603 / 1210 / SOT-23 / SOIC-8 / QFN-24 + EP / QFP-48, the copper check, EasyEDA names,
  bodies from copper. Full suite 863 passed; tsc and eslint clean.
- TYPE7 (real Allegro placement + JLC CAM panel Gerbers): all 20 parts right — 0402s moved 0.53 mm from pin 1 to
  their centres, CN1 from pin 1 to the middle of its 4 pins, L4 onto its 1210 pads over the unfitted L5, U1 and Y1
  left where they were; in the browser, 2D and 3D, every part on its pads.
- Ti-Circle copper (1,731 top / 976 bottom pads after mask and via filtering), with a stand-in file made from the
  parts read off its pads: a (5, 5) and a (−3.27, 12.5) mm panel shift found exactly; 97 % of two-pad parts on their
  pads' centre from centre points, 92 % from pin-1 points; 720 parts in about 0.8 s.

## Open
- Ti-Circle itself: waiting for its BoM and pick-and-place file.
- A file mirrored or turned as a whole (not only shifted) is not lined up.
- Pin 1 of a polarised part is not read from the copper (a rotation 180° off stays as the file says).
- Gerbers-only quick looks still guess parts from the pads (Phase 14); this phase is for BoM + placement uploads.
- Neon (production) needs this migration before the next deploy.
