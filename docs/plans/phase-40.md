# Phase 40 — A wave of light on the theme switch; `npm start` runs the app

## Why
The light ↔ dark change jumped: the knob snapped across and the page flipped in one frame. The user asked for
a smooth switch and "a light wave that comes and changes it". They also asked to start the app with `npm start`.
(The app stays on Next.js, which is React; the stack is unchanged.)

## What
1. **The wave** (`src/lib/theme-wave.ts` pure geometry, `src/components/shell/theme-wave.ts` the browser side):
   - The new theme spreads from the switch (or from the item chosen in the account menu) behind a rippled,
     liquid front that reaches the far corner in about 740 ms.
   - A band of light rides the front, with a thin bright crest and two faint echoes: pale lamp light going to
     dark, golden sunrise light going to light. Neither is blue.
   - Built on the View Transitions API: the old page is a picture, the new one is revealed through an animated
     clip-path; the light is three transition layers cut to rings from the same outline, so page and light run on
     the compositor on one clock and stay together even when the main thread is busy.
   - next-themes is told the choice when the wave ends; the choice is saved the moment the theme is painted.
   - A second tap on the switch mid-wave flips back; a tap elsewhere ends the wave and reaches what was tapped.
   - Reduced motion, or a browser without View Transitions: the theme changes at once.
2. **The switch**: the knob slides on a soft spring, the track colour fades, sun and moon turn and swap — on a
   click, Space / Enter, the menu, and when the OS changes while on System.
3. **`npm start`** = `npm run serve` (`scripts/serve.ts`): checks the database, builds into `.next-prod` only when
   the code changed, serves on :3000 (`--port` or `PORT` for another). `start:next` keeps the bare `next start`.
   A second copy serves the existing build instead of rebuilding under a running one (`.next-prod.lock`).

## Verified
- Unit: `tests/unit/theme-wave.test.ts` (front and ripple geometry, the rings keep their width, every keyframe has
  the same number of points, the glow fades to nothing, the colours are never blue).
- Browser at 1440 × 900 and 390 × 844: frames at 150 / 400 / 650 ms in both directions, from the switch and from
  the menu; real-speed screencasts with the main thread blocked mid-wave; double taps; a link pressed mid-wave;
  keyboard; reduced motion. `tests/e2e/theme-wave.spec.ts` covers the taps.
- `npm start -- --port 3017`: database ready, build, `/login` answers 200.

## Open
- Once, right after a dev-server recompile, the sticky top bar kept the old theme inside the wave for a moment;
  not reproduced in 22 tries.
- An OS theme change while on System flips at once with only the knob animating.
