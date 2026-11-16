# Phase 20 — One process, in order: files → can we build it → board → parts → box → quote → production

## The request

"Order the process: first upload the Gerber or BoM, first check the feasibility — machines and everything — then
bare board, components, box type, price; then go through the process one by one. Also make existing lines easy to
modify."

## What exists (commit dc0747a)

- Upload → column mapping → **Build & quote, bare board step** (`confirmMapping`, the from-Gerbers path, the Gerbers
  page's "Choose the bare board →"). "Can we build it?" is a separate tab the user has to find.
- The BoM menu (`bom-section-nav.tsx`) is in no particular order: BoM, Build & quote, Feasibility, Reverse
  engineering, Analysis, Supply chain, Process route, SMT line, 3D view. Build & quote has its own 4-step strip and
  Back/Next buttons (`StepNav`); no other page says what comes next.
- Lines: name, type and shifts can be edited, machines and their limits too — but the line's own capability summary
  (smallest chip, pitch, board size…), which the checks fall back on, cannot be edited anywhere.

## What this phase changes

1. **One numbered process for every BoM**, the same strip on all its pages:
   1 BoM · 2 Gerbers · 3 Can we build it? · 4 Bare board · 5 Components · 6 Box · 7 Quote · 8 Process route ·
   9 SMT line. Each step shows a state where the data says it: done (green), needs attention (amber), not started.
   The views that are not steps of the process — Analysis, Supply chain, Reverse engineering, 3D view — sit after a
   divider as "More".
2. **Back and Next at the foot of every step**, from the same list ("Step 3 of 9 · Next: Bare board"), so the user
   goes through it one by one. Build & quote's own Back/Next buttons go (they would show twice).
3. **Uploads go to step 3 first**: after column mapping, after a BoM made from Gerbers, and from the Gerbers page,
   the user lands on "Can we build it?" — the machine check and the gates — and only then on the bare board.
4. **Existing lines are easy to change**:
   - the line form also edits the line's capability summary (what the checks use where a machine has no limit on
     file), with the values worked out from its machines shown beside each field;
   - **Duplicate** copies a line with its machines and limits as a new line, to start a similar one quickly;
   - every line on the machine check has **Edit line**, which opens that line on the Lines page.

## Design

- `src/lib/bom/workflow.ts` (pure, Vitest): the steps (key, label, path), `currentStep(pathname)`, `stepState(facts)`.
- `src/server/workflow.ts`: the cheap facts for the states (one query each: lines, board, review, draft quote).
- `src/components/bom/bom-section-nav.tsx`: numbered steps with state dots; "More" after them.
- `src/components/bom/workflow-footer.tsx`: Back / Next, in the BoM layout so every step gets it.
- `src/app/(app)/boms/actions.ts`, `board-upload-form.tsx`: land on `/feasibility`.
- Lines: `saveLine` takes the capability; `duplicateLine`; anchors `#line-<code>` and the Edit link on the check.
- e2e: uploads now land on "Can we build it?"; the Diff test opens it from More.
- No schema change, no new dependency.

## Verify

Vitest for the step list and states; typecheck, lint. In the app: upload lands on step 3, Next walks 3 → 9, the
strip shows states, a line's summary edited and a line duplicated and removed; tablet width, dark.
