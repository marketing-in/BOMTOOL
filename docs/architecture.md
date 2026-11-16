# EMS Sourcing Platform — architecture

As of 12 November 2026, branch `phase-2`. This is the map of the tool: what it is made of, how a customer's BoM or
Gerbers flow through it, and where each part of the code lives. Phase-by-phase decisions are in `docs/plans/`; how to
use the screens is in `docs/user-guide.md`.

## 1. What the tool does

One internal web application for an EMS factory with four lines (PCB → PCBA → box build). A user uploads a customer's
BoM, Gerbers, or both, and gets:

1. **Parts** — every line matched to a part, with stock, price, lead time, lifecycle and risk, sourced in a fixed
   order: our stock → partners → authorised distributors → marketplace.
2. **Product** — the bare board, the assembled board and the enclosure, in 3D, with the process route on our lines.
3. **Quote** — bare board, components, box and conversion cost per quantity, with NRE, margin and GST; a numbered
   client quote and Excel exports.
4. **Feasibility** — can we build it: pin count, solder paste, consumables, shifts, what we spend against what we
   charge, and a nine-gate sign-off that cannot go backwards.

The product is modelled in **three layers**, and every screen follows them: **bare board** (PCB), **components**
(PCBA), **enclosure** (box build).

## 2. System overview

```
 Browser (desktop, factory-floor tablet)
        │  HTTPS, session cookie
        ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │ Next.js 15 application (App Router, React 19, TypeScript strict) │
 │                                                                  │
 │  Pages & server actions      src/app                             │
 │  UI components               src/components   (shadcn/ui,        │
 │                              Tailwind, TanStack Table, Recharts, │
 │                              react-three-fiber for 3D)           │
 │  Server modules              src/server       (database access,  │
 │                              pipelines, exports, jobs)           │
 │  Pure domain logic           src/lib          (no database, no   │
 │                              Next.js — unit tested)              │
 │  Reference data              src/knowledge, src/data             │
 └───────┬───────────────────────┬──────────────────────┬───────────┘
         │ Prisma                │ adapters             │ jobs
         ▼                       ▼                      ▼
   PostgreSQL 16         Distributor APIs        Scheduler: in-process,
   (all business data,   Nexar/Octopart,         or BullMQ + Redis with a
   cache fallback)       DigiKey, Mouser,        separate worker
                         mock adapter            FX rates API
```

**Layering rule.** `src/lib` is pure: functions take data and return data, with no database and no framework
imports, so the rules of the business (matching, risk, costing, joints, paste, shifts, gates) are unit-tested on
their own. `src/server` loads data with Prisma, calls `src/lib`, and returns what a page needs. Pages in `src/app`
only read from `src/server` and render. Changes go through server actions that re-check the user's role.

## 3. Technology

| Concern | Choice |
|---|---|
| Web framework | Next.js 15 (App Router), React 19, TypeScript strict |
| UI | Tailwind, shadcn/ui (Radix), lucide icons, dark and light themes |
| Big tables / charts | TanStack Table, Recharts |
| 3D viewer | three.js through react-three-fiber and drei |
| Database | PostgreSQL 16 with Prisma ORM; migrations in `prisma/migrations` |
| Background jobs | In-process scheduler by default; BullMQ on Redis with a worker in Docker Compose |
| Cache | Redis when present, otherwise a Postgres table (`ApiCache`) |
| File import | SheetJS (xlsx) and Papaparse for BoMs; `gerber-to-svg`, `pcb-stackup` and the vendored circuitflow parser for Gerbers and drills |
| Sign-in | NextAuth, e-mail and password, seven roles |
| Tests | Vitest for logic (`tests/unit`), Playwright for key flows |
| Deployment | Docker Compose: postgres, redis, meilisearch, app, worker |

Meilisearch is in the Compose file but part search currently runs on PostgreSQL; nothing in `src` calls Meilisearch yet.

## 4. Main flows

### 4.1 BoM upload → match → analysis

```
Excel / CSV ──► parse & map columns ──► scrub ──► match to catalogue ──► allocate sources ──► score
               src/lib/bom/parse,      scrub.ts   match.ts               bom-pipeline.ts      scores.ts
               columns.ts                         (exact, normalised,                           part-risk.ts
                                                  fuzzy, parametric, manual)
```

- `src/server/bom-pipeline.ts` is the single pipeline, used by the app and by the seed script.
- Each line gets its sources in tier order (our stores, consigned stock, partner and excess listings, then offers
  ranked by the kind of supplier), a shortfall, a best authorised offer, landed cost and five scores: availability, resilience, quality,
  economic, sustainability.
- Landed cost (`src/lib/landed-cost.ts`) adds freight, basic customs duty, surcharge and IGST from the HSN code
  (`HsnDutyRate`). Money is held in INR and shown in INR, USD or EUR with live FX (`src/server/fx.ts`).

### 4.2 Gerber upload → board, artwork and components

```
Gerber + drill (+ pick-and-place) ──► identify layers ──► artwork for 3D ──► find components ──► measure
src/lib/board/upload.ts               layers.ts          artwork.ts         find-parts.ts       fab-measure.ts
```

- Components are read from the component layer, the pick-and-place file, pad designators (Gerber X2), or guessed
  from pads, drills and silkscreen.
- `fab-measure.ts` rasterises the paste layer (or the mask openings when there is none) and counts drills, so paste
  can be **measured** rather than estimated.
- A Gerber-only upload is a *quick look* (`BoardPreview`); "Quote this board" turns it into a BoM (`BoardModel`).

### 4.3 Distributor prices and stock

```
Part numbers ──► SupplierAdapter.search() ──► normalise ──► Offer + PriceHistory ──► BoM analysis
                 nexar / digikey / mouser / mock            (per supplier, price breaks, stock, lead, date code)
```

- Every distributor sits behind one interface (`src/server/sourcing/types.ts`). The **mock adapter** returns a
  consistent made-up market so the tool runs with no keys; `SOURCING_MOCK` decides when it is used.
- Calls are rate-limited and cached (`http.ts`, `cache.ts`), with a daily limit per adapter. Keys come only from
  `.env` (`.env.example` lists them).
- Refresh jobs (`src/server/jobs`): parts on live BoMs, carts and RFQs every few hours; the full catalogue nightly at
  02:00 IST; FX every 12 hours. Each run is logged in `JobRun`.

### 4.4 Build & quote

`src/server/build.ts` assembles one quote per quantity from four inputs:

| Input | Code |
|---|---|
| Bare board price from fabs on file, or an estimate | `src/lib/costing/pcb.ts` |
| Components at the price for that quantity, with MOQ left-overs | `src/lib/costing/components.ts` |
| Box: catalogue enclosure or made-to-fit estimate | `src/lib/costing/box.ts`, `src/lib/board/enclosures.ts` |
| Conversion: each step of the process route at plant rates | `src/lib/ops/route.ts`, `src/lib/costing/process.ts` |

`src/lib/costing/quote.ts` adds material handling, margin, NRE and GST. An issued quote is stored as a
`CustomerQuote` with its number. Plant rates are defaults in `src/data/costing.ts`, editable per quote.

### 4.5 Feasibility — "Can we build it?"

`src/server/feasibility.ts` gathers everything for one BoM revision at one quantity:

| Question | Code | Rule |
|---|---|---|
| How many pins | `src/lib/feasibility/joints.ts` | Joints per package; MOSFET, relay, connector and inductor pins count twice; DNP pins counted in |
| How much paste | `paste.ts` | Aperture area × stencil thickness × transfer × density; measured from Gerbers when possible; inductors and connectors print double |
| Per panel | `panel.ts` | Boards stepped onto a 330 × 250 mm panel |
| Consumables | `consumables.ts` | Paste, bar solder, flux, wipes, coating, masking, bags |
| How many shifts | `capacity.ts` | Hours per stage → shifts → working days, at 1, 2 or 3 shifts a day |
| What it costs us | `src/lib/costing/expenses.ts` | Expenses against price, per board and per lot |
| Verdict and gates | `gates.ts` | Checks in nine gates, green / amber / red |

The nine gates run in build order: files & data → bare board → components → paste & SMT → through-hole & finishing →
inspection & test → box build → cost → capacity. Sign-offs are stored in `FeasibilityReview`. Only the first unsigned
gate can be signed; a signed gate is locked; a red check needs a written waiver from Quality or an administrator; the
only way back is an administrator starting a new review, and the old one is kept. Plant figures for all of this are
in `src/data/assembly.ts`.

## 5. Data model

PostgreSQL, defined in `prisma/schema.prisma`. The main groups:

| Group | Tables |
|---|---|
| People and audit | `User`, `AuditLog` |
| Catalogue | `Manufacturer`, `ManufacturerAlias`, `Category`, `Parameter`, `PartParameter`, `Package`, `Part`, `Alternate` |
| Supply | `Supplier`, `Offer`, `PriceHistory`, `ExcessListing`, `HsnDutyRate` |
| Our stock | `Warehouse`, `InventoryLot`, `StockMovement`, `Reservation` |
| Customer work | `Customer`, `Project`, `Bom`, `BomRevision`, `BomLine`, `BomLineMatch` |
| Board and box | `BoardModel`, `BoardPreview`, `Placement` |
| Buying | `Cart`, `CartItem`, `Rfq`, `RfqLine`, `Quote`, `QuoteLine`, `PurchaseOrderDraft`, `PurchaseOrderLine`, `Message` |
| Selling | `CustomerQuote`, `FeasibilityReview` |
| Factory | `Line`, `Machine`, `WorkOrder` |
| System | `KnowledgeArticle`, `ApiCache`, `JobRun`, `SourcingEvent` |

A BoM belongs to a project of a customer and has revisions; a revision has lines; a line is matched to a part; a part
has offers from suppliers and lots in our stores. Board data, the customer quote and the feasibility review all hang
off the BoM revision.

## 6. Screens

| Area | Path | What it is for |
|---|---|---|
| Home | `/` | What needs attention |
| BoMs | `/boms`, `/boms/[id]` | Upload, grid, analysis, supply chain, route, 3D, diff, export |
| Build & quote | `/boms/[id]/build` | Board, components, box, price; client quote |
| Feasibility | `/boms/[id]/feasibility` | Can we build it, and the gated sign-off |
| Parts | `/parts` | Catalogue, part detail, alternates, price history |
| Sourcing | `/sourcing` | Distributor search, cart, RFQs, adapter health |
| Inventory | `/inventory` | Lots, movements, excess |
| Operations | `/operations` | Lines, work orders, schedule, clear-to-build |
| Viewer | `/viewer` | Gerber quick look, PCB / PCBA in 3D |
| Compliance | `/compliance` | RoHS, REACH, country of origin, HSN and duty |
| Directory, knowledge | `/directory`, `/knowledge` | Fabs and vendors; reference articles |
| Alerts, admin | `/alerts`, `/admin/users` | Notifications; user accounts and roles |

## 7. Security and roles

- Every page needs a session except the sign-in page (`src/middleware.ts`).
- Seven roles: administrator, purchasing, engineering, planning, stores, quality, viewer. `src/lib/rbac.ts` maps
  roles to permissions; server actions check them again, so hiding a button is never the only protection.
- Important changes are written to `AuditLog` (quote issued, gate signed, review restarted).
- Secrets are read from `.env` only; nothing is hard-coded.

## 8. Reference data

- `src/knowledge/` — structured, versioned content: PCB materials and technologies, processes, component families,
  packages, enclosures, the part dictionary. Synced to the database with `npm run knowledge:sync`.
- `src/data/` — plant figures: `costing.ts` (rates for quotes), `assembly.ts` (paste, pin and panel rules, seconds
  per operation, shift hours), `hsn-duty.ts` (duty rates). These are indicative defaults and should be set from the
  plant's own numbers.

## 9. Running it

| Way | Command | Needs |
|---|---|---|
| Docker Compose | `docker compose up` | Docker: Postgres, Redis, Meilisearch, app, worker |
| Local | `npm run db:local`, `npm run db:setup`, `npm run dev` | Node 22 |
| Windows launcher | `Start-Bom.ps1`, `start-online.cmd` | A prepared copy with `node_modules` |

Tests: `npm test` (Vitest), `npm run test:e2e` (Playwright), `npm run typecheck`.

## 10. Not built yet

- No AI agent or chat-with-your-BoM feature exists in the code. `src/server/chat.ts` is message threads between
  buyers and sellers on RFQs and excess listings.
- Element14, Arrow and TME have key names in `.env.example` but no adapter.
- The BullMQ worker has not been exercised on the development machine, which has no Redis.
- Netlist-based test coverage, reflow profile simulation and scheduling a lot against other work orders are outside
  the feasibility study.
