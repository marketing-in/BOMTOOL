# Phase 0 — Setup

Goal: a running, themed app shell backed by a seeded Postgres database, with login and roles,
so every later phase plugs into a real data model instead of mock UI.

## Inputs
- `CLAUDE.md` (stack + rules)
- SoW `docs/BoM_opti_Raj_v1200524.docx` — drives the data model: SoW §5/§6 columns (MPN, brand,
  condition, MOQ, price, last updated, total stock, # distributors, manufacturer/factory lead time,
  lifecycle, RoHS, REACH, CoC, HSN) and the five scores (Availability, Resilience, Quality,
  Economic, Sustainability). SoW "scope market" (authorised, OEM/ODM excess, EMS excess) maps to
  `Supplier.kind` + `ExcessListing`. SoW buying stages (prototype / production) map to `Project.stage`.

## Environment note
This machine has no Docker. Two ways to run Postgres are provided:
1. `docker compose up` — postgres 16, redis 7, meilisearch, app (the intended setup).
2. `npm run db:local` — starts a real PostgreSQL 17 from the `embedded-postgres` npm package
   on port 5432 with data in `.pgdata/` (no Docker, no install). Redis/Meilisearch are not needed
   until Phase 1/2.

## Deliverables
1. **Repo & tooling** — Next.js 15 (App Router, `src/`), TypeScript strict, Tailwind v4, ESLint,
   git branch per phase (`phase-0`), `.env.example`.
2. **Docker Compose** — `postgres`, `redis`, `meilisearch`, `app` (Dockerfile, dev mode).
3. **Prisma schema** (Prisma 6) — every entity in the kickoff data model:
   Part, Manufacturer, ManufacturerAlias, Category (self-tree), Parameter, PartParameter, Package,
   Supplier, Offer (+ price breaks JSON), PriceHistory, Warehouse, InventoryLot, ExcessListing,
   Customer, Project, Bom, BomRevision, BomLine, BomLineMatch, Alternate, Cart, CartItem, Rfq,
   RfqLine, Quote, QuoteLine, PurchaseOrderDraft, PurchaseOrderLine, Line, Machine, WorkOrder,
   KnowledgeArticle, User (role enum), AuditLog.
   Money stored as `Decimal` + ISO currency; quantities as `Int`; enums for lifecycle, condition,
   supplier kind, MSL, role, statuses.
4. **Auth** — NextAuth v4 credentials provider, bcrypt hashes, JWT session carrying `role`.
   Roles: ADMIN, PURCHASING, ENGINEERING, PLANNING, STORES, QUALITY, VIEWER.
   Middleware protects everything except `/login`. `requireRole()` helper for server code.
5. **App shell & design system** — shadcn/ui (new-york, neutral base) + lucide icons +
   next-themes (light/dark/system). Collapsible sidebar with all modules, top bar with
   global part search box, currency switch (INR default, USD, EUR), theme toggle, user menu.
   Design tokens for risk colours (`--risk-green/amber/red`), lifecycle badge, score pill.
   Touch targets ≥ 44px for factory-floor tablets.
6. **Pages that work on real data in Phase 0**
   - `/` dashboard: counts (parts, suppliers, lines, BoMs, stock value), lifecycle mix, line cards.
   - `/parts`: searchable/filterable catalogue (category, lifecycle) with stock & best price.
   - `/parts/[id]`: part detail — parameters, offers, inventory lots, compliance.
   - `/boms`: sample BoMs with line counts. `/boms/[id]`: read-only lines (scoring arrives in Phase 1).
   - `/operations/lines`: the 4 SMT/THT lines with machines and capability.
   - Placeholders (clear "arrives in Phase N" panels) for Sourcing, Knowledge, Viewer, Compliance.
7. **Seed data** (`prisma/seed.ts`, data in `prisma/seed-data/*.ts`)
   - Category tree (Semiconductors / Passives / Electromechanical / Cables & Wire / Mechanical).
   - 79 manufacturers with alias table (TI = Texas Instruments, STM = STMicroelectronics …).
   - 73 packages (0201–2512, SOT-23…, SOIC, TSSOP, QFN, QFP, BGA, TO-220/247, DPAK …) with pitch.
   - **200 parts** with real MPN patterns, parameters, lifecycle, RoHS/REACH, HSN, MSL.
   - Suppliers: internal stores, consigned, own excess, partner excess, 8 authorised distributors,
     2 brokers. Mock offers with price breaks + 90-day price history (deterministic RNG).
   - Inventory lots across 2 warehouses with bins, date codes and MSL.
   - 4 lines (L1 high-mix SMT, L2 high-volume SMT, L3 THT/wave+selective, L4 box-build) with machines.
   - 3 customers, 3 projects, 3 sample BoMs (IoT gateway, motor controller, LED driver) — also
     exported as `.csv` under `samples/boms/` (`.xlsx` samples come with SheetJS in Phase 1).
   - 7 demo users, one per role (credentials in `.env.example` comments / README).
8. **Utilities + tests (Vitest)** — currency/FX provider interface with mock rates, money
   formatting, manufacturer-alias normaliser, lifecycle→risk mapping, seed-data integrity
   (200 unique MPNs, all categories/packages/manufacturers resolve).

## Not in Phase 0
BoM upload/matching (P1), distributor adapters & Redis cache (P2), knowledge content (P3),
3D viewer (P4), work orders/MSL timers (P5), exports/alerts (P6). Playwright is installed in
Phase 1 together with the first end-to-end flow.

## Done when
`npm run db:local` (or `docker compose up -d postgres`) → `npm run db:setup` → `npm run dev`,
log in as any role, browse dashboard/parts/BoMs/lines on seeded data; `npm test` and
`npm run build` pass; committed on `phase-0`.

## Outcome (2026-10-23)
Done as planned. Deviations: Postgres runs via `embedded-postgres` locally because Docker is not
installed on the dev machine (compose file is still provided); seed has 79 manufacturers / 73 packages;
sample BoMs are CSV only for now. Verified: `npm test` (34 passing), `npm run typecheck`, `npm run lint`,
`npm run build`, and a manual pass over login, dashboard, parts, part detail, BoM detail and lines
(desktop, tablet, light and dark).
