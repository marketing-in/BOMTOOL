# Phase 18 — The client's look: Thinksemi's brand across the whole app, and a proper BoM menu

## The request

"This is the client website [thinksemiinfotech.com] — analyse it; this tool is used for this business. Change the
total UI/UX, full design change, related to the client website, more professional and simple. The BoM page top
menu is not professional — make it all more professional."

## What the client's site looks like (read 12 Nov 2026)

Thinksemi Infotech Ltd, Chennai (SIPCOT IT Park): EMS and ODM — PCB assembly, PCBA prototyping and testing
(AOI, ICT, FCT), box build, wiring harness. The same PCB → PCBA → box-build flow this platform follows.

| Element | On the site | Value |
| --- | --- | --- |
| Page | very light blue-white | `#F5F8FF` |
| Surfaces | white cards, soft shadow, almost square corners | `#FFFFFF`, 3 px |
| Brand colour | royal blue (logo, panels, links) | `#023E99`; lighter `#0659D4`, `#208EFD` |
| Text | black headings, heavy weight; plain body | Open Sans 400 / 700–900 |
| Menu | plain text, the current item blue with a blue underline | — |
| Accent | a yellow chevron, used once per card | `#FFDF00` |

## What the app looks like now

Warm off-white page, navy sidebar, **burnt-orange** primary, IBM Plex Sans + Space Grotesk, 14 px radius — a
palette taken from an earlier proposal deck, not from the client. Nearly everything is drawn from the tokens in
`src/app/globals.css`; only `themeColor` in `src/app/layout.tsx` hard-codes a colour.

The BoM page carries two menus on top of each other: the section strip (nine pill links with icons that wrap to a
second row) and, under the title, **fifteen** buttons — seven of which repeat the strip.

## What this phase changes

1. **Tokens** (`globals.css`), light and dark: the client's blue-white page, white cards, royal-blue primary,
   cool greys for borders and muted text, 8 px radius. Risk green / amber / red stay as they are — they now stand
   apart from the brand colour instead of sitting next to an orange. The supply-coverage ramp moves from orange
   to an ordered blue ramp; the cost-group colours stay.
2. **Type**: Open Sans for text and headings (the client's face); Geist Mono stays for part numbers and money.
3. **Shell**: a white sidebar with the blue logo (dark navy in dark mode); the current item is blue on a light
   blue tint with a bar at its edge, like the site's underlined menu. A solid white top bar.
4. **BoM menu** (`bom-section-nav.tsx`): one line with "All BoMs" and the BoM's name, then a single row of plain
   text tabs with a blue underline on the current one. It scrolls sideways on a tablet instead of wrapping, and
   keeps the current tab in view.
5. **BoM page actions**: the seven buttons that repeat the menu go. What is left is what you *do* to a BoM:
   Build & quote, Refresh prices, Add shortages to cart, Excel, and a **More** menu (Material quote, Compare
   revisions, Remap columns, New revision).

Not used: the yellow accent — in this app amber already means "watch this", and a second yellow would blur it.

## Second pass — "more visual, more colour"

The first pass was correct but pale: white on blue-white. Asked for more colour, the brand now carries the frame:

- The **sidebar** and the **BoM band** are the site's royal-blue panel (a blue gradient, white text), in both themes.
- The site's **yellow** is the brand accent after all, used only as a marker: the current sidebar item, the current
  BoM tab, and a tick before each section title. It never colours data, so amber still means "watch this".
- Primary buttons are a two-step blue gradient; stat cards carry a blue top edge; a soft blue glow sits behind the
  top of every page.

## Design

- No new dependency, no schema change, no page logic touched. `Open_Sans` comes from `next/font/google` like the
  faces it replaces.
- `Brand` loses its "always on dark" case for the sidebar: the sidebar is light in light mode now.
- `--dir-blue` (the Directory's "board types" step) moves to teal so it does not read as the brand blue that
  "components" uses.

## Verify

Vitest unchanged and green; typecheck and lint. In the running app: home, a BoM, Build & quote, Directory,
Knowledge, sign-in — light and dark, desktop and tablet width; the BoM menu at tablet width with the last tab
current; contrast of body, muted and primary text on page and card.
