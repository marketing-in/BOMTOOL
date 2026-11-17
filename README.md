# EMS Sourcing Intelligence Platform

Internal platform for our 4-line EMS factory (PCB → PCBA → box-build). Upload any customer BoM and see
availability, landed price, lifecycle and risk for every line; source internally first (stores →
consigned → excess) and then from distributors; turn shortages into RFQs, compared quotes and PO
drafts; plan work orders on the lines with clear-to-build and MSL-aware kitting; and understand the
product in 3D and through a built-in electronics knowledge base — a component & machine dictionary
(227 entries with application circuits, specs and alternatives), a parametric alternates finder, and 3D
explorers that take a PCB, a chip package and a silicon die apart layer by layer.

Every part has a product page like DigiKey or Octopart — photo, datasheet, MPN, brand, lifecycle, RoHS,
REACH, availability in the order we source (our inventory → authorised distributors → marketplace) and a
risk analysis — and any part the distributors carry is one live search and one click from the catalogue.
In 3D, click a part on the board for its supply and risk; open the finished product in its box (closed,
exploded, X-ray) with the box-build kit checked against the BoM; follow the manufacturing route step by
step on our lines with the parts each step handles lit up; drop any Gerbers for a quick look; and read a
deep-analysis report that says whether a BoM is ready to build and what to do first.

**Build & quote** turns an uploaded BoM (with or without its Gerbers) into a customer quote in four steps: the bare
board (fabs and online quick-turn services with landed prices per quantity, or the fab's own quote), each
component's source (our stock → partners → distributors → marketplace, alternates, risk, graphs, datasheet), the box
(seven box types, catalogue boxes by tier, boxes made to fit) and the price — per board and per lot at up to four
quantities, with conversion cost from the product's own process route on our lines, NRE, margin and GST — then a
numbered, printable client quote and an Excel costing ([Phase 13](docs/plans/phase-13.md)). Gerbers alone are enough
to start: a quick look reads the components off the board — component layer, pick-and-place file, pad designators,
or guessed from the pads with circuitflow's guesser — and *Quote this board* turns them into a BoM whose footprints
you then give parts ([Phase 14](docs/plans/phase-14.md)). `samples/board/` has GW-200 (Altium-style, no designators)
and CTRL-01 (KiCad X2 with a .pos file) to try.

**Can we build it?** (`/boms/<id>/feasibility`, [Phase 15](docs/plans/phase-15.md)) judges the customer's product as
the shop floor would: solder joints a board (SMT top / bottom, through-hole, under-body) and what SPI, AOI, X-ray and
probe each have to check; grams of solder paste a board — measured from the Gerber paste layer, else estimated from
the packages — and jars to issue for the lot; the price of board, components, box, assembly and paste; hours, shifts
and working days per stage at 1, 2 or 3 shifts a day; and a verdict (*Easy to build* / *Buildable with care* / *Not
buildable as it stands*). Nine gates are then signed in build order: a signed gate is locked, a red check needs a
written waiver from Quality, and the only way back is an administrator starting a new review. Plant figures (paste
density, transfer, seconds per operation, shift hours) are in `src/data/assembly.ts` — set them from your own lines.

**Footprints first, pictures first** ([Phase 24](docs/plans/phase-24.md), [Phase 25](docs/plans/phase-25.md)): the BoM
and the Gerbers are uploaded together and step 3 checks every designator's package against the footprint on the board
before the machines are asked anything. The process screens open with a picture and a number — the customer's own
board drawn from the Gerbers with its parts on it, our lines as lanes of station icons, the route as a chain of
steps, the nine gates as one row — and keep the tables folded under their headline figure; the explanation of any
figure is behind its ⓘ. Shared pieces: `src/components/viz/`. Home and the BoM list follow
([Phase 26](docs/plans/phase-26.md)): every BoM is a card with its own board, a bar of its ten steps and the step
to take next. Boards are drawn in 3D wherever they appear ([Phase 27](docs/plans/phase-27.md)): the Gerber drawing
on a tilted board with every part standing on it, and — on the Gerbers step — the board pulled apart layer by
layer with its components, each sheet the customer's own layer drawing. Both are server-drawn SVG
(`src/components/viz/board-iso.tsx`, `board-exploded.tsx`; projection in `src/lib/board/iso.ts`), so they cost
nothing on a tablet; the interactive 3D view shows the components in its layer mode too. The remaining screens
follow the same rules ([Phase 28](docs/plans/phase-28.md)): Bare board, Box, Quote, Operations, Inventory, Sourcing,
Parts and Knowledge each open with their figures and one picture, and every figure tile carries an icon.

**Reading a customer's real files** ([Phase 29](docs/plans/phase-29.md)). A job-pack workbook is read sheet by sheet
(`src/lib/bom/workbook.ts`): BoM, CAD placement report, load lists, not-fitted lists. Fabrication files are named
from one table (`src/lib/board/cam-names.ts`), a panel is cut down to one board (`src/lib/board/panel.ts`), and
passives' part numbers are read and checked against the line's own words (`src/lib/bom/mpn-decode.ts`).

Spec: `docs/BoM_opti_Raj_v1200524.docx` · Phase plans and outcomes: `docs/plans/` · User guide:
[`docs/user-guide.md`](docs/user-guide.md).

## Run it

Node 22. Pick one way to run Postgres.

**A. Docker (intended)** — Postgres, Redis, Meilisearch, the app and the BullMQ worker:

```bash
cp .env.example .env      # set NEXTAUTH_SECRET
docker compose up
```

The app runs migrations and seeds an empty database on start (it never wipes existing data).
http://localhost:3000

**B. No Docker (this machine)** — a real PostgreSQL 17 from npm, data in `.pgdata/`:

```bash
cp .env.example .env      # set NEXTAUTH_SECRET
npm install
npm run serve             # the app, fast: http://localhost:3000
```

`serve`, `dev` and `online` start the database themselves (`npm run db:ensure`): the first time they create
`.pgdata/`, migrate and load the demo data; after that they start the database in the background if it is
stopped and apply any new migrations. It keeps running after the app stops — `npm run db:local:stop` stops it.
`npm run db:local` still runs it in the foreground in its own terminal if you prefer that.

Without Redis the price-refresh scheduler runs inside the web server (`JOBS_MODE=inline`) and caches
in Postgres; with Redis (Docker) it uses BullMQ and the `worker` service.

### Start from Windows PowerShell without npm

On a prepared copy of the project (Node.js 22.6 or newer on PATH, Windows `node_modules`, and `.env` configured
with a database already set up), run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File 'C:\bom tool\DB\Start-Bom.ps1'
```

Open http://localhost:3000. Press Ctrl+C to stop the app. If the launcher started the local
database, it stays running for the next launch; append `-StopDatabase` to the command above to
stop it. Append `-Online` (or use `start-online.cmd`) only when you
want a public Cloudflare URL. Change the seeded demo passwords before sharing that URL.

### Fast for daily use, dev server only for changing code

| | `npm run serve` (use the app) | `npm run dev` (change the code) |
| --- | --- | --- |
| What it runs | a production build, compiled once | a development server that compiles each page on first visit |
| Start | ~3 s (plus a 2–3 min build when the code changed) | ~9 s, then 6–25 s the first time each page opens |
| Page loads | 0.15–0.9 s | 2–9 s even when compiled |
| Memory | ~300 MB | grows to 3.5–4 GB |

Measured on the plant's i5-6200U / 8 GB laptop ([Phase 9](docs/plans/phase-9.md)). `npm run serve` builds
into `.next-prod`, rebuilds only when the code changed (`-- --rebuild` forces it, `-- --port 3001` picks
another port) and skips tsc/ESLint in that build — `npm run typecheck` and `npm run lint` cover them.
Only one server can use port 3000: stop `npm run dev` before `npm run serve`, or the other way round.
`npm run dev` uses Turbopack; `npm run dev:webpack` is the old compiler if something misbehaves.

### Demo logins

All seeded users share the password in `SEED_USER_PASSWORD` (`.env`). There is no self sign-up: an
administrator adds people under **Admin → Users** (role, starting password), changes roles, sets new
passwords and deactivates accounts. Deactivating or changing a password signs that person out at once.

| Email | Role | Can |
| --- | --- | --- |
| admin@ems.local | Administrator | Everything, approves POs |
| purchasing@ems.local | Purchasing | BoMs, sourcing, cart, RFQs, POs, price lists |
| engineering@ems.local | NPI / Engineering | BoMs, board files, knowledge, compliance |
| planning@ems.local | Production planning | Work orders, schedule, lines |
| stores@ems.local | Stores | Inventory, receive, issue, MSL |
| quality@ems.local | Quality | Compliance, duty table, knowledge |
| viewer@ems.local | Viewer | Read-only |

## Live data: API keys

Everything works on a **simulated market** until keys are set; mock offers are labelled "mock" and the
mock switches itself off as soon as any real adapter has keys (`SOURCING_MOCK=auto`).

| Source | Get it | `.env` |
| --- | --- | --- |
| Nexar / Octopart (many distributors in one call) | nexar.com → app with **Supply** scope | `NEXAR_CLIENT_ID`, `NEXAR_CLIENT_SECRET` (free plan ≈ 1,000 parts/month → `NEXAR_DAILY_LIMIT`) |
| DigiKey | developer.digikey.com → Production app → Product Information v4 | `DIGIKEY_CLIENT_ID`, `DIGIKEY_CLIENT_SECRET` |
| Mouser | mouser.in → My Account → APIs → Search API | `MOUSER_API_KEY` |
| Live FX | open.er-api.com (no key) — already set | `FX_API_URL` |

After adding keys: `npm run sourcing -- status` shows each adapter; `npm run sourcing -- refresh hot`
pulls live data now; `npm run sourcing -- purge-mock` removes simulated offers. The adapters are built
to the published API schemas and tested against recorded-shape responses — the first live run is the
real acceptance test.

Distributors without APIs (Robu, Evelta, local stockists, contracted vendors): **Sourcing → Price lists**
imports their Excel/CSV.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run serve [-- --port N] [-- --rebuild]` | The app for daily use: production build in `.next-prod` (rebuilt only when the code changed), then `next start` |
| `npm run online` | Put the app on the internet from this PC: a free Cloudflare quick tunnel to `serve` on port 3001; prints the `https://….trycloudflare.com` address (new on every start). Needs `.tools/cloudflared.exe`; change the demo passwords first. `start-online.cmd` runs the PowerShell launcher in online mode |
| `npm run dev` / `npm run dev:webpack` | Development server with Turbopack / with webpack |
| `npm run db:ensure` | Start the local database if it is stopped (create + seed it the first time), then apply pending migrations |
| `npm run db:local:stop` | Stop the local database |
| `npm run plant:sync` | Put our lines and machines from `prisma/seed-data/factory.ts` (the machine sheets) into the database, keeping work orders and everything else |
| `npm test` | Vitest unit tests (266) |
| `npm run test:e2e` | Re-seed the e2e database, then Playwright flows on a production build (port 3100; first run: `npx playwright install chromium`) |
| `npm run db:e2e:setup` | Create (if missing), migrate and re-seed the e2e database `ems_e2e` |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run db:migrate` / `db:seed` / `db:reset` | Prisma migrate / wipe + seed / drop + migrate + seed |
| `npm run sourcing -- status \| refresh hot\|full\|<MPN…> \| fx \| purge-mock` | Adapter status, refresh, FX, cleanup |
| `npm run knowledge:sync` | Apply new/updated knowledge articles without touching other data |
| `npm run vendors:sync` | Add the sample channel partners, PCB fabricators and box makers (and partner stock lists) without touching other data |
| `npm run analyse -- part <MPN> \| bom <code\|name\|id> [--json]` | Deep analysis from the terminal (read-only): a part's tiers, risk, trend, alternates; a BoM's verdict, actions, risks, cost |
| `npm run worker` | BullMQ worker (Docker / Redis setups) |
| `npx tsx scripts/export-sample-boms.ts` | Regenerate sample BoMs (CSV, Altium xlsx, KiCad csv) |
| `npx tsx scripts/generate-sample-board.ts` | Regenerate the sample GW-200 Gerbers + centroid |

E2E tests never touch the development database. They run on `ems_e2e` on the same Postgres
(`DATABASE_URL` with the name swapped, or `E2E_DATABASE_URL`), with the distributor keys and
`FX_API_URL` blanked for the test server, so they only see the simulated market. `npx playwright test`
uses `ems_e2e` as it is (run `npm run db:e2e:setup` once first); `npm run test:e2e` re-seeds it every run.

## Architecture

```
prisma/                      schema, migrations, seed (+ seed-data: parts, makers, packages, lines, BoMs)
src/lib/                     pure, unit-tested domain logic
  bom/                       parse · column detect · scrub · match · build qty · scores · diff
  bom/deep-analysis.ts       BoM readiness: verdict, coverage by source, risk mix, prioritised actions, Pareto
  board/                     centroid parsing · Gerber layer classes · 3D bodies · enclosures · box fit,
                             wall openings and box-build kit · camera fit · IC markings · Code 39 labels
  ops/                       clear-to-build · line fit · feeders · FIFO picks · MSL clock · process route
  part-risk · price-trend    part risk factors (DigiKey/Octopart-style) · like-for-like price trends
  currency · landed-cost · pricing · rate-limit · units · refdes · rfq-sheet · price-list
src/server/                  DB-backed services
  bom-pipeline.ts            ingest (scrub → match) and analyse (waterfall, landed, scores)
  sourcing/                  adapters (nexar, digikey, mouser, mock) · cache · refresh
  jobs/                      runJob · inline scheduler · BullMQ
  procurement · operations · compliance · alerts · exports · board · board-view · knowledge
  deep-analysis.ts           the BoM report (shares one analysis with the 3D data)
  sourcing/market.ts         live keyword search across distributors, merged and ranked
  schematic/                 data-driven circuits: pins, routing, junctions, text layout, framing
  alternates.ts              parametric substitution rules, drop-in / pin-to-pin / functional, ranking
  explore/                   PCB stack-up layout maths for the 3D explorer
src/knowledge/               versioned knowledge content (85 articles) + process timelines
  dictionary/                227 component & machine entries (what, how, specs, choosing, alternatives)
  circuits/                  61 application circuits used by the dictionary
  explore/                   PCB stack-ups, chip packages and die layers for the 3D explorers
src/app/(app)/               pages: home, boms, parts, sourcing, viewer, knowledge (dictionary,
                             circuits, explore), operations, inventory, compliance, alerts, admin
src/components/              shell, data, bom, sourcing, viewer + explore (react-three-fiber),
                             knowledge, dictionary, parts, home, ops
tests/unit, tests/e2e        Vitest, Playwright
samples/                     BoMs (CSV/xlsx) and a full GW-200 board (Gerber/drill/centroid)
scripts/analyse.ts           the deep-analysis CLI
.claude/skills/              ems-part-analysis: a Claude Code skill that runs the CLI and writes the report
```

**Claude skill.** In this repo Claude Code picks up `.claude/skills/ems-part-analysis` — ask it for "a deep
analysis of LM358DR" or "what's blocking GW-200" and it runs `npm run analyse`, then reports the verdict,
the actions in order, the evidence and links into the app.

Key rules from `CLAUDE.md`: every distributor sits behind an adapter with a mock; keys only from
`.env`; INR by default with live FX; knowledge is seed data, not UI text.

## What's indicative

- Customs duty rates (HSN table) are indicative — confirm with your customs broker; Quality can edit them.
- Landed cost assumes supplier default freight % unless a quote states freight.
- Mock-market prices are simulated; they move every hour so the refresh, events and charts can be seen.
- The finished-product view is drawn from the enclosure catalogue (`src/lib/board/enclosures.ts`) and the
  board's placements; wall openings are drawn where edge connectors meet a wall — confirm the real
  panel drawing with the customer. The process route is derived from the BoM and our lines; times and
  costs per step are not estimated here (work orders estimate line hours).
