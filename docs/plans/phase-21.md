# Phase 21 — Board studio quality for the 3D view

Reference: the "Board studio" of industriversepcba.vercel.app (Engineering → Board studio). Our renderer already
draws shaped parts, Gerber textures and an exploded stack-up; what the reference does better is the presentation
around the board. This phase brings that to `src/components/viewer/board-viewer.tsx` (used by the BoM's 3D view,
the bare-board / Build & quote steps and quick looks).

## What changes

1. **Engineering canvas** — a light blueprint grid behind the board (dark grid in dark mode) instead of the flat
   gradient; the board framed tighter so it fills the view; a taller viewport.
2. **View chip and hint** — top-left a small chip naming the current view ("Angled", "Top", "Side", "Bottom",
   "Layers separated"); bottom-left "Drag to orbit · Scroll to zoom · Click to inspect".
3. **Camera presets** — bottom-right Angled / Top / Side / Bottom (Side is new: front-on, slightly raised).
4. **Floating toolbar** — right edge, vertical: full screen, zoom in, zoom out, reset view, pan mode (left-drag
   pans). Every button has a label and tooltip. The reference also has Layers and Flip buttons; we leave them
   out because the mode bar already has Layers and the presets already have Bottom (no repeated controls).
5. **Hover card** — moving over a part shows a small card beside it: designator, kind, MPN, package and a stock
   dot with "In stock · N pcs" (our inventory) or "Not matched". Clicking still opens the full side panel.
6. **Labelled stack-up** — in Layers mode each layer carries a label tag at its edge (Top silkscreen … Bottom
   silkscreen), like the reference's stack.
7. **Better leads** — gull-wing (SOIC/SOT/QFP) leads drawn as shoulder + bend + foot instead of flat bars, so
   QFPs read as QFPs at a glance.

Out of scope: new data (no netlist, no real copper for spec-only boards), new part models, page layout outside
the viewer.

## Checks

- Unit: the camera direction for each preset (pure helper in `src/lib/board/camera.ts`).
- Browser: each preset, toolbar zoom/reset/flip/full screen, hover card on a part, labels in Layers mode,
  light and dark, tablet width.
- Existing e2e that use the "View mode" and "Camera" radiogroups keep working (names kept).
