# Phase 30 — A more real 3D board, step 1

Asked for: more realistic visuals, starting with the 3D board view.

What still gives the view away as a drawing, looking at a real customer board in it:

| Now | Real board | Change |
| --- | --- | --- |
| Parts stand on the pads with nothing between them | Every terminal sits in a fillet of solder | A bright solder fillet at both ends of every chip and moulded part |
| Chip capacitors and resistors are sharp boxes with flat caps | A ceramic body with eased edges and tinned terminations that wrap round the ends | Eased body, wrap-round terminations |
| The board's edge is one flat colour | The cut edge shows the laminate, with a copper line for every layer and the mask on both faces | A layered edge drawn from the board's own layer count and mask colour |
| Hard-edged shadows | Soft shadows under studio light | Soft shadow filtering |
| Small boards cannot be brought close | — | The closest zoom follows the board's size |

Not in this step: holes drilled through the slab with plated barrels and a board outline that is not a rectangle
(both need the hole and outline geometry kept at upload), solder on gull-wing leads, and the other screens.

## Checks

Unit tests, typecheck, lint; the view in light and dark on a seed board and on a small board.

## Outcome

Done as planned: solder fillets on chip and moulded parts, eased chip bodies with wrap-round terminations, a layered
board edge, soft shadows, closer zoom on small boards. Looked at on two seed boards on the development copy (white
and black mask), no console errors. Checked: typecheck, lint, 590 unit tests. The end-to-end suite was not run again
for this drawing-only change.
