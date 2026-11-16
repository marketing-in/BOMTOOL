# Phase 13 — Build & quote: board → components → box → price, step by step

**Ask (user, 2026-10-30):** when a BoM or Gerbers are uploaded, first show the PCB board — its directory
entry, our stock, suppliers and the marketplace — and let us choose the board; then the components list of
that BoM, each with full details (our inventory and price, our suppliers' stock and list price, the
marketplace, alternates, RoHS, REACH, risk analysis, graphs, datasheet); last the box that covers the
product — every box type to choose from, with our stock, supplier list price and online marketplace — and
then the total per piece and for the whole quantity, so we can quote the client easily. Every process (PCB,
components, fitting the board in the box) shown visually and in depth; details searched and added
continuously.

## What exists and what's missing
| Have | Missing |
|---|---|
| BoM upload → map → grid; Gerbers on a BoM; quick look at Gerbers without a BoM | Nothing leads from the upload into a decision flow |
| Supply chain page: fabs that fit, components by tier, box makers that fit | No **prices** for the bare board or the box; nothing to **choose** |
| Part page: four tiers, risk analysis, price history, alternates | Not inside the BoM flow; no way to pin a line to a source for a quote |
| 3D: PCB layers / PCBA / box-build; enclosure catalogue of **2** boxes | More boxes, and a box made to fit for every box type |
| Material quote page (parts only) | Conversion cost, NRE, margin, GST, several quantities, a client-facing quote |
| Refresh fills a missing datasheet, photo, RoHS, REACH, ECCN | MSL, HSN, country, description; no view of what is still missing |

## Decisions
1. **One guided flow per BoM revision** — `/boms/[id]/build/{board,parts,box,quote}` with a stepper that
   shows each step's choice and the running price per board. The choices live in a **draft customer quote**
   (`CustomerQuote`, new model): board source, a pinned source per BoM line, box, quantities, rates.
   *Issue quote* freezes the numbers (snapshot) and gives it a number (CQ-2026-0001); a client-facing
   page prints it (Save as PDF) and an Excel workbook carries the client sheet and the internal costing.
2. **Uploads lead into it.** *Match & score* after column mapping now opens step 1. The BoM upload form
   takes the board files (Gerber zip, drill, centroid) too, optionally. A quick look (Gerbers, no BoM) shows
   the bare-board prices and an *Add the BoM* link that carries its Gerbers into the new BoM.
3. **Bare-board price = estimate until the fab quotes.** A pure model (`src/lib/costing/pcb.ts`):
   panel area × base rate × PCB-technology cost index (Phase 12 seed data) × finish, copper, thickness and
   IPC-class factors × a quantity curve, with a minimum lot charge and tooling NRE, × each fab's price
   level (`capabilities.pricing`, sample values). Imports are landed (freight + duty, net of IGST credit).
   The chosen fab's real quote (unit, NRE, lead) can be typed in and replaces the estimate.
   Tiers, as for parts: **our stock** of bare boards (a PCB line on the BoM) → **PCB fabricators** →
   **online quick-turn** (the marketplace: instant-quote pool services, sample vendors).
4. **Components = the existing waterfall, with an optional pin.** Each line's cost at each quoted
   quantity comes from the same allocation the BoM grid uses (ours → partners → distributors →
   marketplace, MOQ/reel rounding, landed cost); choosing a source moves it to the front of that line's
   waterfall. *Use this alternate* is the existing switch (reversible). The analysis loads once and is
   re-run in memory per quantity.
5. **Box**: all seven box types; per type the catalogue boxes (Hammond sizes added: 1590A, 1590BB, 1590N1,
   1590XX, 1590DD, 1455N1201, 1455N2201 — catalogue dimensions) with fit and stock by tier, and a box
   **made to fit** by each box maker whose styles match (estimate: size-driven unit price, tooling NRE for
   moulded, CNC programme for metal). Connector cut-outs priced per unit + NRE. The chosen box is what the
   3D box-build shows.
6. **Conversion cost from our lines**: SMT time per board = placements ÷ (line cph × efficiency), × the
   line-hour rate; set-up per side per lot; THT per part; X-ray for BGA/QFN boards; test; coating;
   box-build minutes; packing; material handling %; margin %; GST 18 %. Rates are editable per quote;
   defaults in `src/data/costing.ts`.
7. **Visual in every step**: 3D PCB layers (board), 3D PCBA with the line lit (components), 3D product in
   the chosen box (box); price-per-fab and price-break graphs, risk bars and price history (components);
   stacked cost-per-board bars per quantity and the process route with its cost (quote).
8. **Details, continuously**: the scheduled refresh also fills MSL, HSN, country and description when
   missing (no extra API calls — same answers). The components step shows what each part still lacks and
   a *Search distributors for missing details* button (a targeted refresh).

## Steps
1. Model + migration (`migrate diff` → `deploy`), costing data and pure costing libs + unit tests.
2. Analysis at several quantities with pins (`bom-pipeline`), build service (`src/server/build.ts`).
3. Steps 1–4 pages, stepper, actions; client quote print page; Excel export.
4. Upload integration (mapping redirect, board files on upload, quick look → BoM).
5. Enclosure catalogue + parts (seed + `vendors:sync`), refresh enrichment.
6. E2E (upload → build → issue → print), docs, commit.

## Not in this phase
Live PCB fab APIs (no keys; estimates are labelled), automatic panelisation, multi-board products in one quote.

## Outcome (2026-10-30)
- `/boms/[id]/build/{board,parts,box,quote}` with the stepper, `/print` (client copy) and `/export` (Excel: Quote,
  Costing, Lines). Uploads land on step 1; the BoM upload takes board files; quick looks price the bare board and
  carry their Gerbers into a new BoM.
- GW-200 on the dev database (500 / 1,000 / 2,500 pcs): bare board ₹37–71 a board depending on the fab (estimates),
  components ₹2,374 a board at 500, box ₹2,865 (Hammond 1455N1601, live DigiKey/Mouser after the refresh),
  price ₹6,419 / ₹5,629 / ₹5,503 a board ex-GST, NRE ₹38,000.
- Checks: typecheck and lint clean; unit tests 315 (18 new in `tests/unit/costing.test.ts`); e2e — the new
  `phase13.spec.ts` chooses a fab and types its quote, pins a line's source, picks a catalogue box, issues and prints.
  Playwright now runs one worker at a time (two overloaded the 2-core laptop and timed out sign-ins).
- Found on the way: a partner listing without an asking price left a line unpriced at large quantities — now priced at
  the line's market price; in-stock distributor parts ship in about a week, not their factory lead.
