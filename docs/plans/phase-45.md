# Phase 45 — Every part where it really is, without a pick-and-place file

## Why
Many customers send Gerbers and a BoM and nothing else. Until now such a board had no placements at all: the 3D
view packed the parts in rows on the board, and a Gerbers-only quick look guessed parts from the pads (the phaco
driver board "MED" came out as 159 parts, mostly wrong: neighbouring chips chained into one "SOIC-5", headers split).
But the board itself says where everything is:
- the copper shows every footprint;
- the silkscreen prints each part's designator beside or inside its footprint;
- the BoM says what each designator is.

## What
1. **Three readers** (built first, each with its own tests):
   - `src/lib/board/silk-read.ts` — the lettering and the drawn outlines of a silkscreen layer, read from its strokes;
   - `src/lib/board/footprints.ts` — which pads belong together, one footprint per part, from the copper alone;
   - `src/knowledge/part-bodies.ts` + `bodyForLine` — the real body a BoM line's own words describe (aluminium can,
     finned heatsink, Mini-Fit, 144-pin QFP …) and the 3D models that draw them.
2. **Tying them together** (`src/lib/board/place-from-silk.ts`, pure):
   - a label belongs to the footprint it is printed beside or inside. Its room on the board is measured against the
     footprint's pads, the drawn outline round them, and — with a BoM — the body the line describes laid on the
     footprint (a latch header's name sits at the end of a 33 mm body, 10 mm from its pins);
   - nearness and fit are weighed together, and all labels and footprints of a neighbourhood are settled in one
     assignment (least total cost), so a row of chips with the names between them comes out right from its ends;
   - fit is what the BoM line says the part is (chip size, pin count, through-hole or not, pin pitch, body length)
     against what the copper reads as. A part the copper cannot be (8 leads on 2 pads) is never put there;
   - a designator whose label was not read takes a footprint only when the free footprints that fit its line are
     exactly as many as the line still needs and no other line could want them. It never takes a read label's;
   - result per part: designator, the footprint's own centre, side, rotation, what the copper reads as, pad count and
     extent, how it was found (`label` / `fit` / `unlettered`), a confidence; and a report: BoM designators not found,
     lettered footprints not in the BoM, footprints with no designator, BoM-against-copper disagreements.
3. **Which way round.** The footprint's axis gives 0 or 90. Half a turn is settled only when something says so, and
   the placement names what did (`turn`): a tab or rows of unequal length (`pads`), one pad shaped unlike the rest
   (`copper`: the square pad of pin 1), a "+", a pin-1 dot or the cut corners of a can's outline (`silkscreen`), a
   standing TO-220 against its heatsink (`neighbour`). Otherwise `turn` is empty and the rotation is only the axis.
4. **Gerbers only.** Every lettered footprint keeps its letters (kind from the letters: R, C, U, J …); footprints
   with no lettering are numbered by kind (P1, U1, J1 …) after the highest number the silkscreen uses. Lettering that
   does not start like a designator (PB1, CH3, INT1) is pin naming and makes no part; a lone pad is a test point,
   not a part.
5. **In the app:**
   - a BoM with Gerbers, lines and no placements from a file is placed this way as soon as its lines exist (upload
     with certain columns, confirming the mapping, adding Gerbers to an existing BoM), and once for older BoMs the
     first time their board is opened. Stored with `snap = "silk"`, the copper columns filled, no `cadX / cadY`,
     linked to their lines. The pad alignment of Phase 44 leaves them alone. The reading is kept on the board
     (`BoardModel.alignment.silk`: placed, missing, extra, mismatches), so a board with nothing to read is not read
     again on every view;
   - quick looks keep what the files themselves give (component layer, pick-and-place file, X2 designators) and
     otherwise use this reading instead of the old guess. New source: "the silkscreen designators and the pads".
     Quick looks saved with guessed parts are read again once, when opened;
   - the 3D body: catalogue package first, as before; else what the BoM line's words describe; else the old
     fallbacks. For a quick look: designator and land together (a C on two long thin pads is an aluminium can).

## Also
- A land shorter than a chip's body is the next size down: an 0805 land with long thin pads no longer reads "1206".
- The footprint check: a part placed from the pads has no CAD footprint name, so the copper check alone speaks for
  the board (no "the board files name no footprint" on every line); a two-pad diode package on pads that read as a
  chip size is no longer called a mismatch.
- 3D models: the pin-1 dimple is bottom-left with the marking upright (where pin 1 is); an SMD can's black mark is
  over its negative terminal; a heatsink with power parts standing inside its depth is drawn as a channel (a web
  between fins) instead of a block they would be buried in.
- The process route counts a part placed on drilled pads as through-hole when nothing else says so.
- No database migration: `snap` is text and `alignment` is JSON.

## Verified
- Unit: `tests/unit/place-from-silk.test.ts` (36): rows of chips with names in the gaps, with and without a BoM;
  an IC and its capacitors with the names swapped by nearness; a label inside a QFP; a name at the end of a long
  outline; an unread label (placed by count, left out when two lines could want the land, never on a neighbour's);
  a not-fitted line; a designator not in the BoM; Gerbers only (letters, pin names, test points, running names, the
  quick look's parts); bottom side; which way round (SOT-23, tab, square pad, dot, plus, cut corners, heatsink);
  the marks finder; end to end from layer drawings; storing for a BoM against a stand-in database (placed and
  linked, read once, replaced on a second run, a file's placements and a quick look's left alone).
  Whole suite 977 passed in 64 files; `tsc` and `eslint` clean.
- **MED with its BoM** (53 lines, 139 designators; Gerbers only, no placement file): 139 of 139 placed, every one by
  its own label, each on a different footprint, no misses, nothing lettered outside the BoM, no disagreements.
  One footprint left without a designator (two pins 3 mm apart, not in the BoM). Copper by BoM line:
  - 77 parts of the 0805 lines on 0805 lands; 2 × 1206 resistors, 6 × 1210 capacitors and 3 × 2512 resistors on
    lands of their size;
  - 13 aluminium cans (the C / RC designators of the Panasonic line) on the 13 long two-pad lands (9.4 × 1.3 mm);
  - U3 on the 144-pad QFP; 8 SOIC-8, 2 TSSOP-16, 1 TSSOP-20 on theirs; U6 on the TO-263 land;
  - J1 2 × 10, J6 / J7 2 × 6, J8 2 × 5, J2 2 × 2 at 2.54 mm; J3 / J4 2 × 2 at 4.2 mm; J5 two pins;
  - H1 / H2 on the two-pin lands 25.4 mm apart, with Q3 and D1 (H1), Q2 and Q1 (H2) 3.8 mm either side;
  - T1 on the 12-pin land, T2 on its 4 pins, L1 on the 15.0 × 4.5 mm land, L2 / L3 on the two wide-pad lands,
    Y1 on the 14.9 × 2.0 mm land, D3 / D4 on the SMB-sized lands, D2, F1, F2 on theirs.
  - Half a turn settled for 27: the 13 cans by their "+", U3 and three SOICs by the pin-1 dot, Q1–Q3 / D1 / H1 / H2
    by each other, J3 / J4 / T1 by a square pad, U6 by its tab. Label to pad distance: median 1.1 mm, largest 12 mm
    (J8). Lowest confidence 0.57 (T2). About 0.3–0.6 s once warm on the laptop.
- **Gerbers-only quick looks:** MED 140 parts, 139 with their silkscreen designator (was 159 guessed). Ti-Circle
  730 parts (361 top, 369 bottom), 718 with their designator, 12 numbered: 616 chips (608 lettered), 28 SOT, 13
  QFN / QFP, 10 two-row ICs, 25 other two-pad lands, 34 connectors and four-pad parts, 4 through-hole. About 1–1.4 s.
- **TYPE7** has a pick-and-place file: nothing is read or changed for it (a stored test shows a board with a file's
  placements is left alone before any drawing is fetched).

## Open
- MED has no placement file to check against. "Right" above means: every designator on a land its BoM line can be,
  each label tied to the nearest such land or the one the row leaves it. Two neighbours of the same size swapped
  would not show.
- Not looked at in a browser, and not run against the real database (the store is tested with a stand-in).
- Half a turn stays open for most polarised parts: diodes (the cathode bar is not looked for), ICs marked with a
  stripe or a notch instead of a dot (8 of MED's 11 small ICs), headers without a square pad. A cut corner is read
  for cans only.
- The studio turns a bottom-side body the other way from its pads at 90 / 270 degrees (older than this phase):
  pin 1 of bottom parts follows the pads, so such a body can show half a turn off.
- Read on its own, a board cannot say which of two footprints drawn over each other is fitted, and lettering with
  unusual first letters may name a leftover footprint that is really a pin name. Ti-Circle has no BoM here, so its
  count is of footprints and letters, not of checked parts; some of its small ICs come out in pieces.
- Uploading Gerbers alone as a new BoM (no quick look first) still makes its rows with the old guesser.
- A BoM made from a quick look keeps the quick look's placements when new Gerbers are added later.
- The channel heatsink is drawn in the board studio only; the box-build view still draws the comb.
- Fonts of KiCad, Eagle and OrCAD silkscreens are read through a plain skeleton font only (see the reader's notes).

## Final state (25 Nov 2026)
The background job was cut off by a restart during its fix stage; the fix was finished by hand.
- Review findings fixed: customer BoM text removed from tests; extruded 3D models given their end faces; "TPS…"
  chips no longer read as tantalum caps; TO-220s face their heatsinks in the box-build view; the footprint check's
  copper shortcut limited to silkscreen placements; the cubic / quadratic loops in the silkscreen reader, the
  footprint finder and the label assignment replaced; U10's half turn read from the silkscreen marks; U6's
  package / land disagreement reported.
- Also fixed by hand: a body is chosen from the customer's own BoM words before a catalogue match (L1 SRP1270 was
  drawn as the guessed 4 mm XAL4020); the part's printed marking is the customer's part number; saved boards are
  read again once when the reader improves (`SILK_READER` version on `BoardModel.alignment.silk`).
- Measured on the files (scratch copies, not in the repo): med with its BoM — 139 of 139 designators placed, none
  missing or extra, one real BoM problem reported (U6: description SOT-223, package column and copper TO-263),
  0.36 s; med Gerbers only — 140 parts, 139 named; Ti-Circle Gerbers only — 730 parts, 718 named, 0.8 s; TYPE7
  keeps its pick-and-place file. In the browser the med board matches the customer's photo: heatsinks with their
  TO-220s, the taped E41 transformer, the current transformer, Mini-Fit and latch headers, the LQFP-144, the cans,
  the SRP1270 inductor.
- Open (minor, from the reviews): on Ti-Circle without a BoM a few designators are tied with low confidence; J3 / J4
  pin-1 end; H1's rotation differs between the BoM and Gerbers-only runs; some part-number patterns in the body
  table are loose; the studio draws small parts slightly oversize (older than this work).

## Also (25 Nov): more of every Gerber placed, and placed right
- Outline shapes: a closed silkscreen outline that is no plain box (an L-shaped relay) keeps its edges
  (`SilkOutline.edges`); `enclosedBy` tests a point against the line on all four sides, so an LED in the relay
  outline's notch is not taken into the relay, and labels count only inside the shape.
- Screw terminals: a row of 2–12 leads drilled ≥ 1.1 mm at 3.5 / 3.81 / 5 / 5.08 / 7.5 / 7.62 mm pitch is a terminal
  block (`terminalLand`): unlettered ones are numbered J (not C) unless a circle is drawn round them, and lettered or
  not they are drawn as green screw terminals of their pitch (quick look and Gerbers-only reading).
- The board's own designator style settles look-alikes (`designatorStyles`, `spellByStyle`): on a board of R016, R051,
  R066 a row read ROOS is R005 when each glyph allows the digit (the lexicon's rule) and R005 is not already there.
- Benchmark (Gerbers only, 15 sets): 100-component 100/100 named (was 97), 3RL WLC 73/73 with 0 unlettered (was
  72/74, relay K1 split), ASUS 946 synthetic 745 (was 732), SequencialRelay 103/103, BT04 43/43, THINKSEMI 139,
  TYPE7 19/19, Ti-Circle 718/730 unchanged; terminal blocks found on 3RL (J1–J7), BT04 (J5–J9), the relay board
  (J1, J3–J13) and DC-DC (J1, J2). Tests: footprints (L outline), silk-read (edges, board style), place-from-silk
  (terminal blocks).

