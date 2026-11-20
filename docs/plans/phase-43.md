# Phase 43 — Box-build opens in 3D for every board

## Why
The Box-build view was greyed out unless the project spec named an enclosure, so a quick look (Gerbers only) or
a BoM without a box could never be seen as a finished product. The user asked for the 3D view to work there.

## What
1. `suggestEnclosure(board, parts)` (`src/lib/board/enclosures.ts`): the smallest stocked enclosure that takes the
   board the way it lies (long side along the box, 1 mm each side) with its tallest fitted part under the lid,
   standoffs worked out as `analyseBox` does. When none fits, a die-cast aluminium box made to fit: 6 mm round the
   board inside a 2.5 mm wall, 5 mm over the tallest part, a 4 mm lid.
2. `withSuggestedBox(data)` (`src/lib/board/suggest-box.ts`): the viewer's own copy of its data with that box and
   its fit analysis, marked `boxSuggested: "stocked" | "made"`. Data that already has a box is returned unchanged.
   Parts not fitted (DNP) do not set the height.
3. The viewer uses it, so Box-build is always enabled: Closed, Exploded and X-ray, the fit line, the facts and the
   kit list all work. The panel says plainly that the box is our suggestion and why; the box's kit line says
   "Our suggestion … Not in the spec." instead of "In the project spec but not on the BoM".
4. Only the viewer sees the suggestion: supply, build cost, analysis, deep analysis and quotes still read the
   spec's enclosure from the server, so no suggested box is ever priced or bought.

## Verified
- Unit: `tests/unit/suggest-box.test.ts` (smallest stocked box, no turning the board, height check, made-to-fit
  sizes, DNP ignored, a spec's box untouched, the kit line), with `box.test.ts`.
- Browser, the Ti-Circle quick look (140 × 140 mm): Box-build enabled, a 157 × 157 × 35 mm box made to fit,
  "Fits: 6 mm clear at the closest wall, 5.9 mm under the lid"; Closed, Exploded and X-ray drawn; no page errors.

## Open
- On a quick look the other kit lines still say "not on the BoM" (there is no BoM yet).
- The live site on Vercel has this only after the next deploy.
