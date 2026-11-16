# Phase 9 — Speed: faster start, faster pages

**Ask (user, 2026-10-27):** "this application I will run take more time to execute — review the process,
I want more speed to load and work."

## What we measured (before)
Machine: Intel i5-6200U (2 cores / 4 threads), 7.6 GB RAM, SSD; Chrome (~2.4 GB) and the Claude app (~1.5 GB)
open alongside. The app ran as `npm run dev` (webpack dev server) on the dev database.

| | Result |
|---|---|
| Dev server start | 33 s to "Ready" (11 s of it compiling the scheduler for `instrumentation.ts`) |
| First visit to a page (compiles it) | /login 36 s · BoM 30 s · 3D viewer 25 s · analysis 21 s · part page 21 s · inventory 13 s |
| Same pages, second visit | 2.4–7 s before the first byte (inventory 7.0 s, analysis 6.6 s, BoM 4.6 s, parts 4.4 s) |
| JavaScript per page (dev, unminified) | 2.7–6.9 MB |
| Server work behind those pages (timed directly) | alerts 21–31 ms · inventory 48 ms · BoM analysis 74–150 ms · deep analysis 185 ms · 3D data 120 ms |
| Dev server memory after 16 pages | **4.1 GB** private; free RAM 0.44 GB; 5.6 GB in the page file |

**Diagnosis.** The database and our analysis code are fast (all under 0.2 s). The time goes to the
*development* server: it compiles every page on first visit, renders with React's slow debug build, ships
unminified bundles, and grows to ~4 GB — on an 8 GB machine that is already full, so Windows swaps to disk
on every request. Day-to-day use should not run on the development server at all.

Also found: the in-process scheduler leaves a job marked RUNNING for ever when the server stops mid-run
(today's 02:00 catch-up full refresh shows "running" at 170/200 parts). Not a speed problem — the refresh
mostly waits on distributor rate limits — but it blocks a new run of that kind for 2 h and misleads the UI.

## Decisions
1. **`npm run serve` for daily use** — a production build (pages compiled once, ahead of time, minified,
   React production build) served by `next start`. Builds into `.next-prod` (never touches `.next`), and
   rebuilds only when the code changed since the last build. ESLint and tsc are skipped in *this* build
   (`SKIP_BUILD_CHECKS=1`): `npm run typecheck`, `npm run lint` and the tests are the gates; skipping them
   roughly halves the build and avoids the out-of-memory crash we hit before. `npm run build` is unchanged.
2. **`npm run dev` uses Turbopack** (`next dev --turbopack`, stable in Next 15) — much faster first compiles
   and updates, and a native compiler instead of a webpack heap. `npm run dev:webpack` keeps the old path.
3. **Compile less**: `optimizePackageImports` for `radix-ui` and `@react-three/drei` (both are big package
   indexes; a page should compile only the pieces it imports). `webpackMemoryOptimizations` lowers the
   memory peak of `next build`.
4. **Feel instant**: the sidebar item you clicked shows a spinner until the page arrives (`useLinkStatus`).
   (A route-wide `loading.tsx` skeleton was tried and dropped — see Outcome.)
5. **Scheduler**: on start, close runs left RUNNING by a previous server process as "Interrupted".
6. Anything still slow in production gets fixed where the time is (measured, not guessed).

Not changed: the stack, the database, the analysis logic, the refresh schedule (it costs little CPU).

## Steps
1. Measure (done above).
2. `scripts/serve.ts` + `npm run serve`; next.config: skip-checks switch, package-import optimisation,
   build memory optimisation; `dev` → Turbopack, `dev:webpack` kept.
3. Pending spinner in the sidebar; the part page's price chart loads after the page.
4. Scheduler closes interrupted runs.
5. Build, then measure production and Turbopack dev with the same page list; fix what is still slow.
6. Docs (README "Running it fast", user guide), memory notes; typecheck, lint, unit tests, e2e; commit.

## Tests
- Unit: unchanged logic; `npm test` must stay green.
- E2E: the existing 19 flows (they build with webpack and run against a production server).
- Timing: `.smoke-tmp/perf.spec.ts`-style run (temporary, not committed) before/after.

## Outcome

Same machine, same 16 pages (Playwright navigation timings; "warm" = second visit), dev database.

| | Before: `npm run dev` (webpack) | **After: `npm run serve`** | After: `npm run dev` (Turbopack) |
|---|---|---|---|
| Server start | 33 s | **3.1 s** (+105–145 s build, only when the code changed) | 8.7 s |
| First visit to a page | 10–30 s | **0.3–1.5 s** | 6–24 s |
| Warm page | 2.4–10.8 s | **0.14–0.9 s** | 2–9 s |
| JavaScript per page | 2.7–6.9 MB | **187–482 KB** | 0.8–1.4 MB |
| Server memory after the 16 pages | 4.1 GB | **0.3 GB** | 3.6 GB |
| The 32 page loads of the timing run | 5.0 min | **24 s** | 5.1 min |

| Page (warm) | Before | After (`serve`) |
|---|---|---|
| Home | 3.7 s | 0.33 s |
| BoM | 5.8 s | 0.46 s |
| Deep analysis | 9.4 s | 0.46 s |
| Process route | 4.1 s | 0.46 s |
| 3D viewer (until the board is drawn) | 10.1 s | 0.89 s |
| Part page | 10.8 s | 0.50 s (JS 306 → 197 KB: the price chart loads after the page) |
| Inventory (199 lots) | 8.7 s | 0.77 s |

- **`npm run serve`** is the fix: production build in `.next-prod`, rebuilt only when sources are newer
  than its `BUILD_ID`; refuses to start on a busy port with a hint instead of failing later; points
  `NEXTAUTH_URL` at the chosen port. Verified end to end (detected the change, rebuilt, started).
- **Turbopack** (`npm run dev`): 4× faster start and 3–5× smaller dev bundles, but on this 2-core CPU
  page compiles and dev-mode rendering take about as long as with webpack, and memory is only ~13 % lower.
  Kept as the default (no route slower overall; all 31 routes, the BoM Excel export and Gerber rendering
  checked, no hydration warnings); `npm run dev:webpack` remains.
- **Click feedback**: the clicked sidebar item spins until the page arrives (checked on a throttled network).
- **`loading.tsx` dropped.** A route-wide skeleton for `(app)` looked right, but the e2e suite then failed
  5 of 19: a link clicked (or a server action finished) while the page was still hydrating fetched the next
  page and never showed it. Reproduced with a 4× CPU throttle and bisected on production builds:
  skeleton + spinner 4/16 stuck, skeleton only 3/44, spinner only **0/32**. The skeleton's Suspense boundary
  is the trigger (Next 15.5 / React 19 race on slow CPUs — exactly the factory tablets), so it is out.
- **BoM upload under load**: the next e2e run lost the Altium upload — its "match & score" transaction took
  6.6 s against Prisma's 5 s default and was rolled back, leaving an empty BoM. Matching now runs before the
  transaction and lines + candidate matches are written in bulk (`createManyAndReturn` + `createMany`:
  4 statements instead of 1 + lines × (1 + candidates)); `src/lib/db.ts` gives every interactive
  transaction 10 s to get a connection and 60 s to finish (stock reservation, quotes and awards loop too).
- Seen while bisecting, existing before this phase: under heavy load the account menu button sometimes
  hydrates with a different Radix id than the server sent (attribute-only; React keeps the server value).
  Harmless for speed; noted, not chased.
- **Scheduler**: runs now write a heartbeat (`stats.at`, at least once a minute while working); each tick
  closes RUNNING runs silent for 30 min as "Interrupted". Judged by heartbeat, not by server start time,
  because two servers (e.g. `serve` and `dev`) may share one database. Unit-tested (`staleRunIds`).
- The earlier hydration warnings (first smoke run, webpack dev) did not reproduce on any page.
- Housekeeping: `.next-prod` ignored by git and ESLint; Next adds `.next-prod/types` to tsconfig itself,
  kept so the first `serve` build doesn't modify a tracked file.

Not changed, on purpose: page queries (all < 0.2 s), the refresh schedule (it mostly waits on
distributor rate limits). Watch: Inventory renders every lot with its action menu (0.77 s, the slowest
page) — paginate if the lot count grows well past a few hundred. The parts list's `load` event waits for
distributor photo CDNs; the content itself is there in 0.2 s.

Tests: unit 259/259 (+1), typecheck and lint clean, e2e: see below.
