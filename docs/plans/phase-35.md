# Phase 35: carry the new look to every page

The user approved the Lines & machines page (`src/app/(app)/operations/lines/page.tsx`, `src/components/ops/line-stage.tsx`) as the reference. Every other page follows it.

## What the user asked for

- Visual, simple pages with minimal text. "Like a human-created site, not AI-like."
- Professional. White background, light/dark switch. No blue anywhere; several colours, used in small exact amounts.

## Rules for every page

1. **Cut the words.** Delete page descriptions and explanatory paragraphs unless a user could not act without them. No sentence explains what the page is. Keep labels to one to three words. Help that matters moves into a `title` tooltip or an existing info popover. Never delete data, a control, a state, a warning that blocks work, or the "simulated / mock data" marks.
2. **Picture or number first.** Lead each page and section with its existing visual (3D view, chart, board picture, gauge) or its biggest figures. Big figures: `text-2xl`/`text-3xl font-semibold tracking-tight tabular-nums`, with a small `text-xs text-muted-foreground` label under them.
3. **Fewer things at once.** Secondary detail goes behind a `<details>` fold, a tab or an existing dialog. Do not remove it.
4. **Surfaces.** White page. Cards are `rounded-xl border bg-card` (no shadows, never a card inside a card). Small controls are `rounded-md`. No pills (`rounded-full`) except dots, avatars and switches.
5. **Colour.** Tokens only (`src/app/globals.css`): `primary` is the current part's colour; `bg-part-soft` for a selected or soft state; `risk-green/amber/red` (+ `-soft`) only for status. No hard-coded hex in page code except data colours that already exist. No blue, sky, indigo or cyan classes or hex values: replace any you find with tokens.
6. **Type.** One face. Page title via `PageHeader`; section titles `text-lg`/`text-xl font-semibold tracking-tight`. `.num` now means tabular figures in the text face (no mono look); keep `font-mono` only for real code.
7. **Keep working.** Same routes, same server actions, same props, same permissions, same test ids and accessible names that tests use. Dark mode and phone width must still work. No new dependencies.
