# Phase 4 — 3D PCB / PCBA / box-build viewer

Goal: open any BoM revision and see the product — an exploded, layer-by-layer bare board, the
assembled board with every part where it really sits, and the board inside its enclosure — and click
any part to see its BoM line, live stock, price and alternates, or colour the whole board by risk.

## Data
- `BoardModel` per BoM revision: outline size, layer count, finish, mask/silk colours, and per-layer
  artwork (SVG rendered from Gerber), plus source file names.
- `Placement` rows from the centroid / pick-and-place file: RefDes, X, Y, rotation, side, footprint,
  linked to the BoM line by RefDes.
- Without Gerbers the board is drawn from `Project.boardSpec` (size, layers, finish, mask colour);
  without a centroid file parts are auto-arranged and the viewer says "approximate layout".

## Import (`/boms/[id]/board`)
- Gerber RS-274X files (zip or individual): layer type detected from names/X2 attributes
  (`whats-that-gerber` rules), rendered to SVG per layer with `pcb-stackup` (tracespace v4).
- Centroid CSV/XLSX (Altium Pick Place, KiCad .pos, generic): column auto-detection reusing the BoM
  column engine (RefDes, Mid X/Y, Rotation, Layer/Side, Footprint), units mm/mil detected.
- Sample GW-200 Gerbers + centroid are generated from the seed BoM so the viewer works out of the box.

## Viewer (`react-three-fiber` + `drei`)
- **PCB mode**: exploded stack-up — top silk, top mask, top copper, prepreg, inner layers, core,
  bottom copper, bottom mask, bottom silk — each a toggle; an "explode" slider spreads them apart.
  Materials: mask colour from spec, ENIG gold / HASL silver pads, copper sheen, drilled holes.
- **PCBA mode**: parts as 3D bodies generated from package dimensions (chip, SOT, SOIC, QFN, QFP,
  BGA, TO, THT radial/axial, connectors, modules) at their real positions and rotation, both sides.
- **Click a part** → side panel: RefDes, MPN, lifecycle, five scores, stock, best/landed price,
  alternates, link to the part and the BoM line.
- **Risk overlay**: colour every part by worst score, availability, lifecycle or price.
- **Box-build mode**: enclosure from the project spec (Hammond 1590B / 1455N1601 dimensions), with
  an exploded view (lid lifts, board rises) and standoffs.
- Orbit/zoom/pan, top/bottom/iso camera presets, works with touch on a tablet; `prefers-reduced-motion`
  disables the explode animation.

## Package 3D gallery
The same generated bodies power a 3D gallery on the "Component packages" knowledge page.

## Tests
Vitest: centroid parsing (units, sides, rotation), RefDes ↔ BoM line linking, Gerber layer
classification, package-to-3D-body sizing. Playwright: open GW-200 viewer, switch modes, click a part
→ panel shows its MPN, toggle risk overlay.

## Outcome (2026-10-24)
A generated sample board (`samples/board/GW-200/`: 4-layer Gerbers, drill, centroid with 76
placements) renders through tracespace into per-layer textures: 100.0 × 80.0 mm, 4 copper layers,
every placement linked to its BoM line. Parts are generated package bodies sized from the package
table; colour by worst score / lifecycle / availability; exploded PCB layers; box-build with enclosure
fit check. The fit check caught a real seed error: the MC-48V board was larger than its 1590B
enclosure (board size corrected). Viewer loads client-side only, so the BoM grid stays fast.
