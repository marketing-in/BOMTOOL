# Phase 31 — Full UI redesign with Impeccable, and a whole-site UI test

Asked for: use the Impeccable design skill (github.com/pbakaus/impeccable) to change the UI fully, and test the full
site.

## Where it starts

A first pass was made with Impeccable from another agent (Codex) and handed over part-way:

- `PRODUCT.md` and the surface brief `.impeccable/surfaces/src-app.md` hold the product truth and the chosen direction,
  *Precision & clarity*: navy navigation rail, white working surfaces on a cool blue-grey ground, cobalt actions, the
  ThinkSemi yellow marking the current place, Open Sans throughout, mono tabular figures for MPNs, quantities and money.
- New tokens in `src/app/globals.css`; all 62 page files and the shell were touched.
- `tests/e2e/zzz-site-ui.spec.ts` opens every page template on desktop and phone.

Baseline at hand-over: typecheck clean, 590 unit tests pass, lint clean.

## Plan

1. **See every screen.** `scripts/ui-review.ts` (`npm run test:ui:capture`) now captures every page template, not
   seven: desktop light, phone, desktop dark, and tablet for the key workspaces, with a report of HTTP status,
   horizontal overflow, console and uncaught errors.
2. **Review against the direction**, page group by page group: leftovers of the old look, untokenised colours (charts
   still on the grey shadcn defaults), dark-mode contrast, phone and tablet layout, consistency of headers, figures,
   tables, tabs, empty states.
3. **Fix** in the shared pieces first (tokens, shell, `components/ui`, `components/data`, `components/viz`), then
   per page. Known from the first look: the sidebar ends part-way down long pages, the menu is clipped at 1000 px
   height, a runtime issue shows in dark mode on the dev server, a stray unscoped CSS block at the end of
   `globals.css`.
4. **Test the whole site**: extend the site spec (every page × desktop / tablet / phone, light and dark, no
   console errors, accessible names on the shell), then the full Playwright suite, unit tests, typecheck, lint, and
   the Impeccable detector.
5. **Finish**: independent design review of the captures, fix round, `DESIGN.md` written from the built system.

Not changed: routes, workflows, roles, server logic, data. Risk stays green / amber / red with text beside it.

## Checks

Typecheck, lint, unit tests, full Playwright suite (`npm run test:e2e`), `npm run test:ui:capture` with no problems,
Impeccable detector.

## Outcome

_(filled in at the end)_
