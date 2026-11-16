# Phase 10 — Deck features, three-tier supply on the board, product supply chain

**Ask (user, 2026-10-27, in Tamil; translated):** add every feature in `C:\chh\qa2\deck.pptx` (the SoW deck
"BoM Optimisation Platform"). Upload Gerbers or a BoM and see the PCB like a real board, every component
marked; click a part to see its part-number details. With a BoM, the full part list at the side, and for each
part: our local inventory, our channel partners' / sourcing agents' inventory, and the online marketplace;
RoHS, REACH, critical analysis, form-fit-function. For a product (e.g. one on an EMS line): the bare-board
suppliers, the component list, and the box-build suppliers — a complete solution.

## The deck against what exists

| Deck item | Status before Phase 10 |
|---|---|
| Connect data: catalogue, distributor APIs, EMS/OEM stock lists | Done (Nexar/DigiKey/Mouser adapters, price-list import, excess listings) |
| Upload BoM, automatic MPN matching, FFT alternates | Done (exact/normalised/fuzzy/parametric; DROP_IN = form-fit-function) |
| Four lenses, 0–100 per part, sortable BoM columns | Done (availability, resilience, quality, economic, sustainability) |
| Part detail: condition, stock, lifecycle, MOQ, lead times, RoHS, REACH, CoC, HSN, best price, last updated | Done (part page) |
| Offers across authorised + OEM/ODM + EMS excess, add to cart, bid | Done (cart, bid → RFQ target price) |
| Chat with the seller / peers | **Missing** |
| Order flow with transport, finance, storage, test services | Partly (landed cost: freight, insurance, duty, GST); **services missing** |
| Transport footprint, reuse of excess (sustainability lens) | Done in the sustainability score |

## Interpretation and decisions
- **Three tiers, in the user's order:** (1) **our inventory** — stores + consigned; (2) **channel partners &
  sourcing agents** — new `SupplierKind.CHANNEL_PARTNER`, their stock lists held as listings (qty, price,
  date code, condition, CoC, location, lead days); (3) **online market** — authorised distributors
  (DigiKey, Mouser … live where keys exist), then excess pools and brokers. Allocation also takes tier 2
  before distributors. Broker stock keeps its counterfeit warning.
- **On the 3D board:** a **BoM list beside the board** — every line with RefDes, MPN, the three tier
  quantities, RoHS/REACH and risk; clicking a row selects the part on the board and vice versa; the part
  card shows the three tiers, compliance, the critical-risk factors and FFF alternates. A BoM without Gerbers
  already gets a board with an approximate layout; that stays.
- **Product supply chain page** (`/boms/[id]/supply`): **Bare board** — the board spec and the PCB
  fabricators whose capabilities fit it (layers, finish, thickness, IPC class, lead days); **Components** —
  coverage by tier and the lines that need action; **Box build** — the enclosure's sources and enclosure
  makers that can supply/machine it, plus the kit. Suppliers get `supplies` (components, pcb-fab,
  pcb-assembly, enclosure, cable-harness) and `capabilities` (JSON).
- **Seed data is labelled sample.** Channel partners, agents, fabricators and box makers are fictional sample
  vendors ("— sample"), except Hammond (maker of the enclosures already in the BoMs). Replace with the
  plant's approved vendor list. No invented live prices for real companies.
- **Chat:** a message thread per listing/RFQ (who, when, text), for talking to a partner about a bid —
  stored here; nothing is e-mailed.
- **Order services:** a PO draft can add transport (mode, cost), finance (terms), storage and test/inspection
  (e.g. X-ray/decap for broker parts); their costs show in the PO total.

## Steps
1. Schema + migration: `CHANNEL_PARTNER`, `Supplier.supplies/capabilities`, `ExcessListing.leadDays`,
   `Message`, PO services. Non-destructive data script for the dev DB; seed updated for fresh DBs.
2. Tier logic: analysis lines get `partnerQty`; part page, deep analysis, CLI and risk read it.
3. Viewer: BoM side list + two-way selection; part card with three tiers, compliance, risk, FFF.
4. `/boms/[id]/supply` page (pure matching in `src/lib/supply-chain.ts`, unit-tested).
5. Chat threads; PO services.
6. Tests (unit + e2e), docs, screenshots, commit after each working step.

## Outcome
| Asked | Where it is |
|---|---|
| Gerbers or a BoM → the board in 3D, every part marked and clickable | `/viewer/new` (Gerbers only), BoM → 3D (Gerbers + centroid, or an approximate layout from the BoM alone) |
| Full BoM beside the board | 3D viewer: "BoM on this board" — every line, designators, ours / partners / online, RoHS, REACH, risk; two-way selection (a line lights all its designators) |
| Our inventory, channel partners & sourcing agents, online market | New tier `CHANNEL_PARTNER` everywhere: allocation, BoM grid tooltip, part page (4 sections), viewer card, deep-analysis coverage (4-step ramp), supply chain page |
| RoHS, REACH, critical analysis, form-fit-function | Viewer card + BoM list + supply page (RoHS/REACH, risk score and summary, FFF drop-in alternates) |
| Bare-board suppliers, component list, box suppliers | `/boms/[id]/supply` — fabricators matched on layers, thickness, finish, IPC class (lead days by stage); components by tier; enclosure makers matched on style, IP rating, cut-outs; the box-build kit |
| Deck: chat with seller | `/sourcing/chat` — threads per listing or RFQ, seller replies recorded by the buyer |
| Deck: order with transport, finance, storage, test | PO draft → Order services; total = landed cash out + services; suggestions for imports and broker stock |

- Migration was written with `prisma migrate diff` and applied with `migrate deploy`: `migrate dev` reported
  drift and wanted to reset the dev database, which would have wiped it.
- Sample vendors: 3 channel partners/agents, 4 PCB fabs, 3 box makers; 93 partner listings on the dev DB.
- Tests: unit 266 (+7: fab/box matching, finish names, BoM rows, order services); e2e +2 flows
  (`tests/e2e/phase10.spec.ts`); full e2e 21/21 (20 in the full run + the chat flow re-run after a test-locator fix).
- Known limits: IPC class is assumed 2 (no field on the project yet); fit checks use stated ranges, not
  quotes; chat doesn't send e-mail; partner stock lists are sample data until real feeds are connected.
