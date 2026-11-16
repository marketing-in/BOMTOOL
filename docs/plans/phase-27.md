# Phase 27 — Real boards: 3D pictures, layer by layer, with the chips on

Asked for: make all screens **more real** — the PCB as a high-quality design with its **chips**, shown in **3D**
and **layer by layer with the components** — and carry on to the remaining pages.

The blue look stays (phases 22 and 25). This phase changes what a board looks like wherever one is shown.

## What is there now

- The flat top view (`BoardPicture`): the Gerber drawing with parts as flat rectangles.
- The interactive 3D view: good board, plain block chips, and a layer view **without components** whose labels
  pile on top of each other.

## 1 · Every board picture in 3D — `src/components/viz/board-iso.tsx`

One server-drawn SVG, used wherever a board is shown small (BoM cards, Home rows, the answer band of *Can we
build it?*): the board lying at an angle with

- its **real top side** — the customer's Gerber drawing — laid on the tilted face,
- its **thickness** (the laminate edge),
- every placed part **standing on it at its own height**: chips with metal end caps, ICs with leads, a pin-1 dot
  and their part number on top, electrolytic cans as cylinders, shields and connectors as blocks,
- shading by face and a soft shadow under the board and each part.

No WebGL: it is a picture, so twenty cards cost nothing on a tablet. Projection and shading are pure functions in
`src/lib/board/iso.ts` (unit-tested). The flat `BoardPicture` goes.

## 2 · Layer by layer, with components — `src/components/viz/board-exploded.tsx`

The same projection, pulled apart: **components** on top, then **solder mask and silkscreen**, **top copper**,
prepreg, **inner copper**, core, …, **bottom copper**, bottom mask — each sheet carrying the customer's own
layer drawing (tinted copper, white silk, mask openings), with a label and a leader line beside it.

- Layer drawings are served one at a time by `/boms/<id>/picture?layer=<key>` (signed-in users only).
- Only the frame of each drawing is read to place it (`src/lib/board/layer-place.ts`, shared with the 3D view).
- Shown on step 2 (**Gerbers**): what was read from the files, as a picture. Without Gerbers: plain sheets for
  the layer count on file, parts on top when they are placed.

## 3 · The interactive 3D view

- **Layers** mode gets the **components**: top-side parts float above the top sheet, bottom-side parts hang
  below the bottom one. The sheets stand further apart and the labels no longer overlap.
- **Chips**: tin-plated end caps on chip parts, a vent cross and polarity stripe on electrolytic cans, chamfered
  IC bodies. Parts cast a shadow on the board.

## 4 · Remaining screens

In this phase: step 2 (Gerbers) gets the layer picture and loses its paragraphs.
Operations, inventory, sourcing, parts and knowledge are tables that are the task; they get figure tiles and a
chart on top in a following round, screen by screen.

## Checks

- Unit tests (projection, face visibility, layer placement), typecheck, lint.
- End-to-end suite on the e2e database.
- Pictures of every changed screen in light, dark and at tablet width; the 3D view in each mode.

## Outcome

Built: parts 1, 2 and 3, and step 2 (Gerbers) of part 4.

- **Board picture in 3D** (`BoardIso`) replaces the flat one on the BoM cards, the Home rows and the answer band
  of *Can we build it?*; `BoardPicture` is removed.
- **Layer by layer with components** (`BoardExploded`) is the main picture of the Gerbers step, with figure
  tiles beside it and the file list folded. The top and bottom sheets show the finished faces; each copper sheet
  its own drawing in copper on laminate; prepreg and core carry a glass-weave pattern.
- **Interactive 3D view**: components in the layer mode, labels on alternating sides, the sheets further apart;
  eased edges on IC bodies; a polarity mark and base on cans; brighter tin and shield cans; a soft contact
  shadow under every part. The key light's shadow camera now covers the whole board (it reached only 5 mm from
  the centre before), but a cast shadow did not show in the software renderer used for the checks, so the
  contact shadow is what grounds the parts on every device.
- `/boms/<id>/picture` serves one layer (`?layer=<key>&color=<rrggbb>`) or one face, reading only that drawing
  from the database.

Found on the way: the filter that drops empty layer drawings matched `stroke-width="0"`, which every drawing
carries, so it dropped them all; it now reads the drawing's own `width` attribute.

Checked: typecheck, lint, 518 unit tests (projection, visible walls, the sheet order for 2, 4 and 6 layers);
the whole end-to-end suite on the e2e database; the pictures in light, dark and 820 px wide; the 3D view in its
assembled and layer modes.

Not done in this phase: the Bare board, Box and Quote steps keep their layout (they already open on the 3D view
or a chart); Operations, Inventory, Sourcing, Parts and Knowledge are unchanged.
