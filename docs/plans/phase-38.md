# Phase 38 — The lines drawn with the real machines

Asked for (19 Nov 2026), looking at Factory → Lines & machines, where every machine is a near-identical grey box: "I need this SMT line machine changed into the original machine … proper, detailed, real machines. For reference use the docs I gave."

## What

Every machine on our SMT lines is drawn as the machine that stands there: the real make and model at its real size, with its silhouette, paint, windows, doors, monitor, signal tower, feeder carts and lettering. Someone who works on the line recognises each machine at a glance in the whole-line view, and finds more when they zoom in. A machine we have no real model of keeps today's generic one, so the page never shows a hole.

Sources, in this order: the plant's own MACHINE DETAILS documents (the Line 1 specification deck, the MACHINERY DETAILS sheets, the SPI / AOI brochures and the YSM20R specification), then the maker's published figures, then photos on the web. The repo holds facts and our own drawings only: no photo, brochure page or logo file is copied in. Lettering is drawn text in the maker's colours.

Colour: the app's interface uses no blue, but a machine is painted as the real machine is painted.

## How it is built

```
src/knowledge/machine-looks/     the facts, pure data (no three.js)
  types.ts                       MachineLook, lookFrame(look), lookMatches(look, type, vendor, model)
  printers|spi|mounters|reflow|aoi|handling.ts     export const <FAMILY>_LOOKS: MachineLook[]
  index.ts                       MACHINE_LOOKS (all families), findLook(type, vendor, model)
src/components/ops/machine-3d/   the drawings
  kit.ts                         createKit(THREE): the typed kit every builder draws with
  types.ts                       BuildInput, RealBuilt, RealBuilder
  check.ts                       the contract as checks (run by the unit tests)
  printers|spi|mounters|reflow|aoi|handling.ts     export const <FAMILY>_BUILDERS: Record<look key, RealBuilder>
  index.ts                       REAL_BUILDERS, realMachine(type, vendor, model) → { look, builder, build(K, cy) } | null
src/lib/ops/line-layout.ts       the line laid out left to right (pure)
src/components/ops/line-scene.ts the line built, the page's lights and camera
src/components/ops/line-3d.tsx   the page's 3D panel: renderer, controls, selection, number tags, clicks
tests/unit/machine-3d.test.ts    shared checks over every look and builder, the kit, the layout
```

One family = two files (its looks, its builders). Family files import only `./types`, the kit's types and `@/knowledge/machine-looks/types`, never an index: a family in the middle of an edit cannot break another family's tests or pictures.

### The look (facts)

`MachineLook = { key, family, types, match, name, bodyMm { l, d, h, source, note? }, railFromFrontMm, reachMm { front, back, top }, livery, features, refs }`.

- `bodyMm`: the maker's published body, length along the line × depth × height without the signal tower. `source`: sheet (the plant's documents) / maker / estimate (scaled off a photo; the note says how).
- `railFromFrontMm`: front face → conveyor centreline; null = centred.
- `reachMm`: what sticks out of the body: feeder carts and the monitor arm in front, carts and ducts behind, the tower and stacks above.
- `match`: a regex on "vendor model", case-insensitive. No machine of ours may be matched by two looks (tested).
- `refs`: documents by name and page, public pages by URL; never a path on a computer.

### The frame and the rules every builder keeps

- Origin: x = the middle of the body's length, y = the floor, z = 0 on the conveyor centreline. +x = the way boards travel, +z = the operator's side, y up. Scene units are metres.
- The body spans x ±l/2 and z from zFront − d to zFront, zFront = (railFromFrontMm ?? d/2) / 1000.
- At every animation phase everything stays inside x ±(l/2 + 0.05), z from zFront − d − back − 0.05 to zFront + front + 0.05, y from 0 to h + top + 0.05.
- The board path is real: an opening in each end face at pass height and the kit's rails (`K.conveyorRails(group, bodyLength, cy)`) through the whole length; they overhang each end by 0.04 m, so machines standing 0.08 m apart form one conveyor.
- Built with the kit only; materials through the kit's cache; node-safe.
- `K.seal(group, moving)` when built: what stands still is merged into one mesh per material, each moving group is merged inside itself. Budget per machine after sealing: 45 draw calls, 120 000 triangles (ten machines on a factory-floor tablet).
- `RealBuilt = { group, height (the body's), lamps [green, amber, red] with their own materials, screen { draw(info) }, update(t, busy, clock) }`.

### The kit

Primitives (box, rounded box, cylinder and cone, sphere, torus, pipe, plane, polygon), outlines extruded along x, y or z with rounded corners and smooth curves, bent sheets, painted / glass / glowing materials from a cache, lettering (text, our own drawings, warning labels, rating plates) drawn into one shared sheet so all labels of a line cost one draw call, fittings mounted on any face (signal tower, pilot lamps, monitor, monitor on an arm with a keyboard tray, e-stop, main switch, buttons, gauge, handles, hinges, locks, levelling feet, castors, seams, doors, louvres, fans, cable trunking, exhaust stacks, air service unit, sensors, aluminium profile, cable chain), the shared conveyor (rails, openings, end walls with a real hole, hollow covers, a populated board), feeder banks and reel rows in a handful of meshes, smoke in one draw call per source, seal, stats, dispose.

### The layout

`layoutLine(machines, lookOf)`: a machine with a real look stands at its body length, 0.08 m from the next real machine; a sheet conveyor with a real look is a machine like the others (selectable, numbered). Machines without a look keep the circuitflow footprints and today's rules (a 0.5 m link between two inline machines, 0.9 m round stand-alone ones, a sheet conveyor drawn as a link); a real and a generic inline machine are joined by the 0.5 m link.

### The page

`line-3d.tsx` builds the line through `buildLine` (one kit per scene, disposed with it). A real machine that fails to build is logged and replaced by the generic model. Clicks are tested against one invisible box per real machine, not its triangles. The selection mark, number tags, lamps, screens, the 3D / 2D switch and the reduced-motion rule work as before.

The lights were raised (hemisphere 2.4, sun 1.9, a soft fill from behind) so that paint reads as the paint: a face towards the operator comes out at about its livery colour. Metals in the kit are kept light and barely metallic, because the scene has no environment to reflect.

## The families

| Family | Machines on our lines |
| --- | --- |
| printers | HTGD GD450 (L1, L3), MPM Momentum II 100 (L2) |
| spi | Magic-ray ICON (L1), Koh Young KY8030-2 (L2), CKD VP-01G (L3) |
| mounters | Yamaha M20 i-Pulse (L1), Yamaha YSM20R Z:LEX #1 and #2 (L2), Yamaha YSM20R (L3) |
| reflow | Tronwin TW-VP860N (L1, L3), Vitronics Soltec Centurion 820 (L2) |
| aoi | Magic-ray V5000 (L1), Magic-ray Cube+ (L2), Magic-ray V5300 (L3) |
| handling | Ecopmin 0.6 m link, 1 m inspection and 1 m cooling conveyors (L1); the Famecs Lative F20 laser marker (L1) has no family of its own and belongs here |

Done in this phase's foundation: the kit, the types, the indexes, the layout, the page wiring, the tests, and one real machine to prove the chain: the Ecopmin 0.6 m link conveyor (`ecopmin-link-conveyor`).

## How it is verified

- `npx vitest run tests/unit/machine-3d.test.ts` (one family: `-t "<family> ·"`). For every look: sane figures and references; it draws a machine of ours and no machine has two looks; a builder exists and builds in node; at t = 0, 1.5, 3, 7.3, 9.2 busy and idle everything is inside the look's box and above the floor; the model fills the published body; height is the body's; three lamps with three materials; the kit's rails run the whole length at pass height; draw calls and triangles within budget; `update()` adds nothing to the scene. Plus the kit (outlines face out, faces, sealing, feeders, node fallbacks) and the layout (no overlaps, order kept, total length). `MACHINE_LOOKS_STRICT=1` also demands a look for every machine on our lines.
- `tsc` and `eslint` on the files of this phase.

## Not in this phase

- A real model for machines off the SMT lines (they keep the generic model).


## As built (19 Nov 2026)

The user's laptop could not carry a separate screenshot tool and parallel builders, and they asked for the machines
"in the real code". So the screenshot scripts were removed and every machine was written straight into
`src/components/ops/machine-3d`, checked by the unit tests and on the real Lines page:

- `parts.ts` — what upright machines share (body on feet, board openings, the conveyor, the board riding through,
  placing by the makers' millimetres); `magicray.ts` — the Magic-ray family's body plan.
- Printers: HTGD GD450+ (blue window, navy lettering, blue oval badge), MPM Momentum II 100 (slate-blue window frame).
- SPI: Magic-ray ICON (violet stripes, lilac bar), Koh Young KY8030-2 (chrome legs, charcoal strip, black window),
  CKD VP-01G (grey seam, green CKD mark, black screen on a neck).
- Pick and place: Yamaha M20 i-PULSE (silver corner pillars, periwinkle top, black carts), Yamaha YSM20R (blue
  stripes, red YAMAHA badge, Z:LEX strip where the record says Z:LEX).
- Reflow: Tronwin TW-VP860N (cream, sloped hood in four sections), Vitronics Soltec Centurion 820 (white, rounded hood).
- AOI: Magic-ray V5000 (violet bar), V5300 (red bar, door lever), Cube+ (grey pillars, name down the door).
- Handling: Famecs Lative F20 laser marker (black front in a white frame), Ecopmin link, inspection and cooling conveyors.

Each machine carries its own maker's paint (the interface stays free of blue; a machine whose maker paints it blue is blue).

Verified: `MACHINE_LOOKS_STRICT=1 npx vitest run tests/unit/machine-3d.test.ts` (every machine on our three lines has
a real model; each stays inside its published body and reach at every animation phase; draw calls and triangles
within budget) and the Lines page on the dev server for Lines 1, 2 and 3.

Open: the two ovens and the laser marker are sized off the plant's photos (no maker outline on file); a close-up
view of one machine; the BoM viewer's SMT-line simulation still draws the generic machines.

## Added: descriptions, a walk along the line, one machine's process (19 Nov 2026)

Asked for by the user: a description for each machine, the whole line at once to walk in with the process running,
and a button for one machine's own process in 3D.

- `src/knowledge/machine-process.ts`: per kind of machine, what it is for and its steps in plain words, each step
  with its share of one board's time. Conveyors are told apart by their model (link, inspection, cooling).
- Machine sheet: "What it does", the numbered steps, "How to recognise it" (from the machine's look), and the
  button "Show this machine's process in 3D".
- Under the line: "What happens on this line", one sentence per machine in flow order.
- View switch 3D · 2D · **Walk**: eye height on the shop floor, every machine running. Drag to look round; arrow
  keys, W A S D or the on-screen pad to walk (44 px, for the tablet); you cannot walk through the machines. A caption
  names the machine you stand at, with "Show its process".
- **One machine**: the selected machine alone, close up, turnable all round, running board after board; the step it
  is at is lit in a list over the view. Builders report their cycle time (`RealBuilt.cycle`).
- Kept light: one renderer, pixel ratio capped at 1.5, the walk floor is six flat meshes, hidden machines are not
  updated in the one-machine view.

Verified: `tests/unit/machine-process.test.ts`; both views opened on the real Lines page (Line 1).

## Added: the process made visible, full view on every 3D stage (19 Nov 2026)

The user: "the process shows but is not visible — make it visible" and "give every 3D studio a full view option".

- **See inside** (on by default in the one-machine view, with a toggle): the machine's housing fades to a ghost, so
  the board and what works on it are in plain sight. What moves, what glows and the lettering stay solid. The
  housing's materials are swapped for faded copies, never changed, because machines share them (`seal` marks what moves).
- Every machine now has its working parts inside: inspection machines a camera head with a ring light on a gantry,
  the mounters a beam and head going between the feeders and the board, the ovens eight heating zones above and
  below the chain and the cooling fans (printers and the laser marker already had theirs).
- **Full view**: `src/components/ui/full-view.tsx` (`useFullView`, `FullViewButton`, `FullViewStage`): the browser's
  full screen, or the stage pinned over the page where that does not exist (Escape leaves). Added to the Lines
  stage, the die / package / PCB explorers, the dictionary's part model and the BoM viewer's SMT line. The board
  studio and the footprint studio already had one.
