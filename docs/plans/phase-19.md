# Phase 19 — Our lines, machine by machine: set them up, check every BoM against them, ask Claude for a machine's limits

## The request

"SMT line: the user can choose how many lines and which machines each line has, and add more lines. When a Gerber or
BoM is uploaded, first check whether the process is possible on our machines. Use the Claude API and the knowledge
base to improve the machine knowledge — search a machine's capability — to judge whether it can do the process."

## What exists (commit d00d9c6)

- `Line` and `Machine` tables, seeded with our 4 lines (`prisma/seed-data/factory.ts`). `Machine.specs` is free JSON
  and mostly empty; each `Line` has one hand-typed `capability` summary (min chip, min pitch, max board, BGA…).
- `/operations/lines` shows them read-only; `updateLine` exists as a server action but nothing calls it.
- `lineFits()` (`src/lib/ops/planning.ts`) judges a job against a line's summary. It drives the process route
  (`src/lib/ops/route.ts`), the work-order line check (`src/server/operations.ts`) and the SMT gate of
  "Can we build it?" (`src/server/feasibility.ts`).
- The dictionary has an entry for every kind of machine (`src/knowledge/dictionary/machines.ts`): what it does and
  which specs matter.

What is missing: lines and machines cannot be added or changed, machines carry no limits of their own, nothing shows
which *machine* stops a job, and nobody can look a machine's limits up.

## What this phase adds

1. **Line setup** on `/operations/lines` (role `lines.write`: admin, planning): add a line (code, name, type, shifts,
   feeder slots), edit or retire it, add machines to it in flow order, move them up and down, remove them, and edit
   each machine's limits. A line with work orders is retired, not deleted.
2. **Limits per machine**, kept in `Machine.specs`, with a form that asks only what matters for that kind of machine:
   - printer / SPI / AOI / reflow / wave / selective: largest and smallest board, board thickness, component clearance;
   - pick-and-place: smallest chip, finest pitch, largest and tallest component, CPH, feeder slots;
   - reflow: zones, nitrogen; X-ray: what it can see; coating, ICT, flying probe, press-fit: presence and board size.
   Each machine records where its limits came from: typed in, Claude (with its sources), or "typical for this class".
3. **The line's capability is worked out from its machines** (`effectiveCapability`): smallest chip and finest pitch
   = the best placer, largest board = the smallest of every conveyor machine, BGA = an X-ray on the line, and so on.
   The hand-typed summary fills only what no machine states. Every existing caller of `lineFits` gets this, so the
   route, the work-order check and the SMT gate all start judging by machines.
4. **Line fit — "can our machines build it?"** for a BoM revision, from its Gerbers and BoM: for every line, every
   process step the board needs (print, paste inspection, placement, reflow, AOI, X-ray, wave/selective, press-fit,
   coating, test), which machine does it and whether its limits allow it — green, amber (limit not on file, or a
   recommended step missing), red (a limit exceeded or a needed machine missing) — with the reason in words, and
   the plant's answer: which lines to use. Shown:
   - at the top of **Feasibility** in full, line × step;
   - as a one-line banner on **Build & quote** (where a new BoM lands) and on the **Gerbers & centroid** page.
5. **Claude looks a machine up**: "Look up with Claude" on a machine's form sends only its kind, make and model.
   Claude searches the web (Anthropic's web search tool) for the maker's datasheet, guided by the dictionary entry's
   list of specs that matter, and records the limits through one strict tool; the form fills in with the values, a
   confidence and the source links, and the user saves them. With no API key the simulated assistant offers the
   typical limits for that class of machine, labelled as such. Nothing is saved without the user pressing Save.
6. **Ask Claude knows the lines**: a new tool `get_line_fit` (the line × step check for a BoM, and the lines with
   their machines and limits), so "can L2 build this?" or "which machine stops this board?" is answered from data.

## Design

- `src/lib/ops/machines.ts` (pure, Vitest): machine kinds (label, process step, spec fields, dictionary slug),
  `readSpecs`, `effectiveCapability`, `buildNeeds`, `checkLine`, `checkPlant`.
- `src/lib/assistant/machine-lookup.ts` (pure, Vitest): the result schema (zod), the prompt, the typical-limits
  table and the simulated lookup. `src/server/assistant/machine-lookup.ts`: the Claude call — web search
  (`web_search_20260209`, at most 4 searches, off with `ASSISTANT_WEB_SEARCH=off`) plus a strict
  `record_machine_capability` tool, the same client, model, refusal fallback and error handling as Ask Claude.
- `src/server/lines.ts`: lines with their effective capability (one loader for route, work orders, feasibility),
  and `lineFitFor(revisionId)`.
- Server actions in `src/app/(app)/operations/actions.ts`; client forms in `src/components/ops/line-editor.tsx`;
  the panel in `src/components/ops/line-fit.tsx`.
- No schema change and no new dependency. Seed data gains machine limits for new databases; an existing database
  keeps working through the line summaries until someone fills in or looks up the machines.

## What is sent to Anthropic

For a lookup: the machine's kind, make and model and the names of the specs to find. Nothing about customers, BoMs
or users.

## Verify

Vitest for capability derivation, every step rule, plant routing, the lookup schema and the simulated lookup, and
the new assistant tool. In the running app: add a line and a machine, look one up (simulated, no key), see a red
step when a limit is lowered below the board's need, the banners on Build & quote and Gerbers, Ask Claude "can our
lines build this?"; light and dark, tablet width.
