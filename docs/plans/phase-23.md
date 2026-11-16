# Phase 23 — Every process step checked against our machines, masking, final test and dispatch, and an AI review

Asked for: when a Gerber or BoM comes in and the lines or machines change, check the **whole** process — not only
SMT — on our machines: masking and non-masking, coating, test, final inspection, packing and dispatch; say for
every step whether a machine (or a bench) we have can do it; check the process order is correct; and have the AI
analyse the process and give the details.

## What is there today

- `buildRoute` (src/lib/ops/route.ts) — the product's route from fab to packing.
- `checkPlant` (src/lib/ops/machines.ts) — judges the SMT, THT/coat/ICT and box-build roles line by line.
- Missing: masking/de-masking, final (outgoing) inspection, dispatch; a check of each route step against the plant;
  a check of the order. And the route runs in-circuit test **after** conformal coating — probes cannot reach test
  points through the coat, so that order is wrong.

## Changes

1. **Route** (`route.ts`)
   - Masking for the wave: press-fit holes and holes left open are masked before the wave and the mask comes off
     after (`mask-wave`, `demask-wave`). Selective solder needs no mask (it solders only the programmed joints).
   - Masking for coating: connectors, terminal blocks, relays, switches, sensors, RF/antenna parts and test points
     are kept out — masked before coating and de-masked after (`mask-coat`, `demask-coat`). With nothing to keep
     out, the coat step says *no masking needed* (non-masking).
   - Order fixed: clean → depanel → ICT / flying probe → programming → functional test → mask → coat → de-mask.
   - New at the end: **Final inspection** (outgoing quality, IPC-A-610 class, sample plan) and **Dispatch**
     (packing list, CoC, invoice, carrier) after packing.
2. **Machine kinds** (migration, additive): `MASKING_STATION`, `INSPECTION_STATION`, `PROGRAMMER`, `BURN_IN`,
   `LASER_MARKER`, `DISPATCH` — they can be added to a line like any machine.
3. **Process check** (`src/lib/ops/process-check.ts`, pure): for every route step, which of our machines does it
   (any active line), with a board-size check where the machine states one; green (a machine or a bench that is
   the normal way), amber (by hand / another line / recommended machine missing), red (needed machine missing or the
   board does not fit). Plus **order rules**: test before coating, mask before and de-mask after, clean before coat,
   programming before functional test, X-ray after reflow, final inspection before packing, packing before
   dispatch.
4. **AI process review** (`src/lib/assistant/process-review.ts`, `src/server/assistant/process-review.ts`): the
   route, the needs, the machines and the check go to the AI, which records its review through one strict tool:
   verdict, findings per step (level, issue, fix), masking advice, test coverage, dispatch notes. Without a key the
   simulated review is built from the process check. Button on *Can we build it?*.
5. **UI**: a "The process, step by step" panel on *Can we build it?* under the machine check, and the AI review.

## Checks

Unit tests: masking decisions, the new order, every rule, the process check levels, the simulated review.
Browser: a coated board (masking shown), a board without keep-outs (no masking), the AI review button.
