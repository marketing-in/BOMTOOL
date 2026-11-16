# Phase 24 — BoM and Gerbers together, footprints matched first, then the machines

Asked for: change the concept so the user uploads the **BoM and the Gerber files together**, the tool **checks that
the footprints of both agree**, and only when they match goes on to **"can our machines do the process"**. Make the
flow minimal, friendly and visual (infographics, not walls of text), and add more knowledge about the SMT / EMS line
and board design.

## The flow

1. **BoM** · 2. **Gerbers** (uploaded together on one page)
3. **Footprint match** — new step: every designator of the BoM against the parts placed on the board
4. **Can we build it?** (machines and the whole process) — then bare board, components, box, quote, route, line.

After upload (and column mapping, for a BoM file) the user lands on step 3, not on the machine check.

## Footprint match (`src/lib/board/footprint-match.ts`, pure)

- BoM side: each line's designators with its package (as uploaded, else the matched part's package).
- Board side: each placement's footprint (pick-and-place file, Gerber component layer or X2 pad designators).
- A footprint name is read into a signature: chip size ("C_0603_1608Metric", "RESC1608X55N", "0603" → 0603),
  family + pins ("LQFP-48_7x7mm_P0.5mm", "TQFP-48" → QFP/48; SOIC/SOP/SO; QFN/DFN/SON; TSSOP/SSOP/MSOP; BGA; DIP),
  or a named outline (SOT-23, SOT-223, SOD-123, TO-220, D2PAK, SMA/SMB/SMC, DO-41).
- Per designator: **match**, **mismatch** (both readable, different), **check** (one side has no readable
  footprint), **not on board** (in the BoM, not placed), **not in BoM** (placed, no BoM line). DNP lines are left out.
- Verdict: green (all match) · amber (only "check", or no board data yet) · red (mismatch or a designator missing
  on either side).

## Screens

- **Upload** (`/boms/new`): a three-step picture (Upload → Footprints match → Machines can build it), two equal
  drop zones side by side — BoM file, Gerber files — and the details form. Still works with only one of the two.
- **Footprint match** (`/boms/<id>/match`): the verdict with a ring chart, four count tiles, a **board map** (every
  placed part as a dot, coloured by result), the problems to fix as a short table, matched lines folded away, and
  one button: *Continue to the machine check* (when red: *Fix first*, with *Continue anyway* beside it).
- **Can we build it?**: a red banner linking back when the footprints do not match.
- Strip: 10 steps; step 3 shows "76 of 76 footprints match" or what is wrong.

## Knowledge (`src/knowledge/design-for-assembly.ts`)

New articles: footprints and land patterns (IPC-7351); checking the BoM against the Gerbers; fiducials, tooling
holes and panels; component placement and spacing for SMT; SMT defects and their causes; design for test; line
setup and changeover. Synced with `npm run knowledge:sync`.

## Checks

Unit: signature parsing, every status, the verdict, the step state and order. E2E specs updated for the new landing
page and step numbers. Browser: upload page, match page (green and red), light/dark, tablet.
