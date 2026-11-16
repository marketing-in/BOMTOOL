# Project: EMS Sourcing Intelligence Platform (internal)

## Who this is for
An in-house platform for our EMS factory with **4 assembly lines** (PCB → PCBA → Box-Build).
Primary users: our purchasing/sourcing team, NPI/engineering, production planning, stores, and quality.
Goal: upload any customer BoM, instantly see availability, price, lifecycle and risk for every line
item, source it internally first (our stock + excess), then from distributors — and understand the
full product (bare board, assembly, enclosure) visually.

Reference spec: /docs/BoM_opti_Raj_v1200524.docx (SoW "Resilient and Sustainable Procurement Tool").
Reference tools to match or beat in UX: Luminovo, Octopart/Nexar, Cofactr, CalcuQuote, Amplio BOM tool, IKIDO.

## Role
Act as a senior full-stack developer + electronics manufacturing (EMS) domain expert.
You know PCB fabrication, SMT/THT assembly, semiconductors, passives, connectors, cables,
enclosures, IPC standards, component lifecycle and electronics supply chain.

## Tech stack (do not change without asking)
- Next.js 15 (App Router) + TypeScript (strict) + Tailwind + shadcn/ui
- PostgreSQL + Prisma ORM
- Redis + BullMQ for background jobs (BoM matching, price refresh)
- Meilisearch (or Postgres full-text) for part search
- react-three-fiber + drei for 3D PCB / PCBA / enclosure visualisation
- Recharts for charts, TanStack Table for big BoM grids
- SheetJS (xlsx) + Papaparse for BoM import
- Auth: NextAuth (credentials + roles)
- Docker Compose for local dev (postgres, redis, meilisearch, app)

## Rules
- Plan before coding each phase; write the plan to /docs/plans/phase-N.md.
- Every distributor API sits behind an adapter interface with a **mock adapter** that works without keys.
  Never hard-code keys; read from .env (provide .env.example).
- Currency default INR with live FX; show USD/EUR too. Show GST and import duty estimates.
- All knowledge content lives as structured, versioned seed data (/src/knowledge/*.ts or JSON/MDX), not hard-coded in UI.
- Write tests (Vitest for logic, Playwright for key flows: BoM upload → match → quote).
- Commit after each working step with clear messages.
- UI must feel human and visual: clean, generous spacing, illustrations/3D over walls of text,
  colour-coded risk (green/amber/red), dark + light mode, works on a factory-floor tablet.
- If something is ambiguous, ask me one short question instead of guessing on big decisions.
