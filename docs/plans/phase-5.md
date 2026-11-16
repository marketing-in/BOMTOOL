# Phase 5 — EMS operations: lines, work orders, clear-to-build, inventory with MSL, dashboards

Goal: planning and stores run the four lines from the same data purchasing uses — a work order knows
whether it can be built, which line can build it, how many feeders it needs, what to kit, and which
moisture-sensitive reels are running out of floor life.

## Lines & machines (`/operations/lines`)
- Lines and machines become editable (admin/planning): capability (min chip, min pitch, BGA, max board,
  double-sided, N₂, wave/selective/press-fit/coating), capacity (CPH), feeder slots, shifts, active flag.

## Work orders (`/operations/work-orders`)
- Create from a BoM revision + build qty + target date. Number WO-YYYY-NNNN.
- **Clear-to-build %**: share of BoM lines whose required qty (with attrition) is covered by free
  internal + consigned stock (and, as a second figure, + stock on open PO drafts). Lists blocking parts.
- **Line suggestion**: checks the job against each line's capability (smallest chip and pitch from
  the packages on the BoM, BGA present, board size from the project spec, THT needed) and load.
- **Feeder count**: unique SMD part numbers per side vs the line's feeder slots → setups needed.
- **Reserve & kit**: reserve stock against the WO (FIFO by date code, MSL bags with the most floor life
  first), print a kitting list (bin, reel, qty, MSL warning), issue to the line.
- Status flow PLANNED → KITTING → READY → IN_PROGRESS → DONE (or ON_HOLD/CANCELLED).

## Schedule (`/operations/schedule`)
- Board per line (Gantt-style day columns, 14 days) with WOs as bars; drag to another line/day is
  replaced by an accessible "move" form (line + start date) — validated against capability.
- Kanban by status as an alternative view.

## Inventory (`/inventory`)
- Lots by part / warehouse / bin, filters (MSL open, expiring, consigned, low stock), totals in INR.
- **Receive** (stock in: part, qty, lot/date code, bin, CoC, COO, MSL, unit cost), **issue** (to WO),
  **adjust/count**, all written to a `StockMovement` ledger with user and reason.
- **MSL floor life**: open bag / close into dry cabinet / bake actions per lot; live countdown from
  J-STD-033 floor life; red under 24 h, expired requires bake; bake resets the clock.

## Dashboards (`/` and `/operations`)
- Clear-to-build per open WO, shortage value (INR), top risk parts across active BoMs, line utilisation
  (planned hours vs capacity, next 14 days), spend by supplier (PO drafts, last 90 days), MSL expiring.

## Tests
Vitest: CTB maths, capability matching, feeder count, FIFO reservation, floor-life clock (open/close/
bake). Playwright: create WO from GW-200 → CTB + line suggestion → reserve → kitting list; MSL open/close.

## Outcome (2026-10-24)
Work orders compute clear-to-build from stores + consigned + open reservations, pick the line by
capability (board size, finest pitch, BGA/0201, THT, feeder count) with reasons, and estimate feeder
slots and hours. Reservations pick customer-consigned first, then shortest remaining MSL floor life,
then FIFO by date code; issuing a kit writes the stock ledger and opens MSL bags. The MSL clock follows
J-STD-033 (open → dry storage pauses → bake resets). Schedule as timeline and kanban. Docker now seeds
only an empty database (`SEED_ONLY_IF_EMPTY=1`) so restarts never wipe data.
