# Phase 8 — Part directory, product pages, supply on the board, the finished product, process route, deep analysis

**Ask (user, 2026-10-26):** the whole semiconductor part list as a directory with datasheets; click a part on
the PCB to see the supplier products; the PCBA in 3D; any newly uploaded Gerbers shown visually; more
realistic 3D of the board and the complete box (the final product); every process clickable; a part's
availability in our inventory → supplier inventory → marketplace; MPN, brand, REACH and risk analysis like
DigiKey / Octopart; deep analysis; "add the skill".

## Interpretation and decisions
- **"Whole part list"** — no static list can hold every semiconductor. The directory is our catalogue
  (category tree, facets, photos, datasheets) **plus live distributor search** (DigiKey keyword search,
  Mouser keyword search, the mock market when no keys): any part the distributors carry is one search away
  and one click from our catalogue. Each search costs one call per configured distributor, cached 15 min;
  the page says so. No bulk scraping (distributor API terms, daily budgets).
- **Product page like DigiKey / Octopart** — header with photo, MPN, brand, datasheet, lifecycle, RoHS,
  REACH, MSL; availability in three tiers in the order we source: **our inventory** (stores, consigned),
  **supplier inventory** (authorised distributors, manufacturer direct; price-break table), **marketplace**
  (partner/own excess, brokers — counterfeit warning); a **risk analysis** panel.
- **Risk analysis** — pure, unit-tested `src/lib/part-risk.ts` reusing the BoM scoring functions at a
  reference quantity: lifecycle, supply depth, lead time, alternates, price trend, counterfeit exposure,
  compliance — each with a level, a reason and a recommended action; overall score = weighted, capped by
  the worst factor.
- **Supply on the board** — clicking a part in the 3D viewer shows its photo, datasheet, dictionary kind,
  the three tiers with quantities and best price, and the top risk.
- **New Gerbers shown visually** — a quick-look upload not tied to a BoM: drop a Gerber zip or files,
  see the bare board in 3D (layers, assembled). Stored as `BoardPreview` so the link can be shared.
- **More realistic 3D** — local studio lighting (drei `Environment` with `Lightformer`s, no network),
  contact shadows, tone mapping, part markings printed on IC tops, better solder-mask and metal materials.
- **The complete box** — "Product" view: the enclosure closed and opaque (anodised aluminium or ABS),
  lid screws, feet, a product label; *Exploded* lifts the lid, PCBA, standoffs and screws apart; *X-ray*
  shows the PCBA inside.
- **Every process, clickable** — pure `src/lib/ops/route.ts` derives this product's route from its BoM and
  board (PCB fab → kitting/MSL → print → SPI → place → reflow → AOI per side → X-ray when hidden joints →
  THT insert → wave/selective → press-fit → clean/coat → depanel → ICT/flying probe → FCT → box build →
  final test → pack). Each step names its machine (dictionary link), lists the parts it handles, and
  highlights them on the 3D board.
- **Deep analysis** — a BoM analysis report: readiness, risk distribution, top risks with reasons, and a
  prioritised action list (approve alternate X for Y, last-time buy, authorised-only, CoC, re-quote).
  **The skill** — a project Claude skill (`.claude/skills/ems-part-analysis`) that teaches Claude the same
  method against this repo's data, so it can do a deep analysis on request.

## Steps
1. Plan (this file).
2. Directory: `/parts/browse` category tree with counts and examples; category view with facets (maker,
   package, key parameters, lifecycle, in stock); `/parts/market` live search with "Add to catalogue".
   Adapters gain `searchKeyword`; mock answers from its universe.
3. Part page: header, three availability tiers with price breaks, risk analysis panel.
4. Viewer: supply panel on click; `BoardPreview` model + `/viewer/new` upload (zip via fflate) +
   `/viewer/boards/[id]`.
5. Realistic rendering in the viewer.
6. Product box view (assembled / exploded / X-ray).
7. Process route (`route.ts`) + Process mode in the viewer and a route page per BoM revision.
8. BoM analysis report; project skill.
9. Tests (Vitest: part-risk, route, keyword parsing, zip; Playwright: directory → market search → part
   page tiers, viewer process step, quick-look Gerbers, analysis report), docs, screenshots, commits.

## Done when
Every item above works end to end on the dev server, typecheck/lint/unit/e2e pass on the e2e database,
and it is committed in steps on `phase-2`.

## Outcome

Built and committed in steps on `phase-2`:

| Step | Commit | What shipped |
| --- | --- | --- |
| Part page | `f5a0f4c` | Product page like DigiKey/Octopart: photo, facts, datasheet, availability in three tiers (price breaks, landed @1k, bids on excess), risk analysis (8 factors), like-for-like price trend |
| Directory | `12a6341` | `/parts/browse` categories with counts and photos, facets (maker, package, in stock), `/parts/market` live DigiKey + Mouser keyword search (mock without keys), "Add to catalogue" |
| Supply on the board | `9ce5c65` | Clicked part shows photo, datasheet, kind, risk for this build and the three tiers; `/viewer/new` quick look at any Gerbers (zip or files) stored as `BoardPreview` |
| Realistic 3D | `5d19853` | Studio light from local light panels, contact shadow, clear-coat solder mask, MPN markings + pin-1 on ICs, exact camera fit, render on demand |
| Complete product | `28c1bb4` | Die-cast and extruded-clamshell enclosures (screws, feet, label with Code 39), closed / exploded / X-ray, fit and headroom, wall openings, box-build kit checked against the BoM |
| Process route | `7b6b2c1` | Route per product on our lines and machines, viewer panel that isolates each step's parts, `/boms/[id]/route` with "Show in 3D" |
| Deep analysis + skill | `913df55` | `/boms/[id]/analysis` report, `npm run analyse` CLI, `.claude/skills/ems-part-analysis` |

Decisions and deviations from the plan:
- **The directory is the catalogue plus live search**, not a copy of the distributors' ranges: each new
  search costs one call per configured distributor (cached 15 min, budgeted), and importing reuses the
  cached answer, so it costs nothing extra.
- **Price trends compare like with like.** Mock and live prices, and different sellers or currencies, are
  never mixed; a trend needs one consistent series over 90 days. The earlier mixed series had produced
  bogus +135 % "trends" that hurt BoM economic scores.
- **Realism without network.** The environment is built from `Lightformer` panels in the scene (no HDRI
  download); metals keep some diffuse colour because a small studio has little to reflect. The camera
  distance is computed from the eight corners of the bounding box for any view angle (tested), so boards,
  boxes and exploded stacks are never clipped.
- **Box models are by style.** Die-cast: open body with corner bosses and a screwed lid. Extruded: two
  halves that slide together, end panels with four screws each. A board only rides in the extrusion slots
  when its width matches the slot pitch; otherwise the analysis says so and draws floor standoffs (the
  GW-200's 80 mm board in a 99 mm-wide 1455N is such a case). Standoff length comes from the BoM when a
  line says it ("Standoff M3 10mm").
- **Wall openings are drawn, not machined.** They appear where an edge connector's outer edge is within
  12 mm of a wall, and the kit adds "panel machining" as NRE. The real panel drawing still comes from the
  customer.
- **Mechanical lines stay off the board.** Enclosures, fasteners and cable parts are no longer shelf-packed
  onto the PCB in an approximate layout; they feed the box-build kit instead.
- **Route rules.** Lighter SMT side first (heavy parts on the first side are flagged for the second
  reflow); X-ray only where joints are hidden (QFN/SON/BGA/LGA/CSP); selective instead of wave when the
  bottom side has SMD; ICT only for production runs of 1,000+, else flying probe; programming for MCUs,
  SoCs, FPGAs and radio modules. Production runs go on the fastest SMT line that can build them, NPI on
  the high-mix line; a step whose machine isn't on that line points at the line that has one.
- **Isolating a step's parts** fades the others to translucent outlines. Three.js caches an opaque shader
  per material, so the parts remount with fresh materials when they fade in or out.
- **Deep analysis** is pure (`src/lib/bom/deep-analysis.ts`) and shares one BoM analysis with the 3D data.
  Blockers: unmatched lines, end-of-life parts, lines no source covers, non-RoHS parts, a board that
  doesn't fit. Watch-outs: long factory leads (12+ weeks with no stock to cover), NRND, single source,
  counterfeit exposure, missing declarations, prices up 10 %+, box-build kit gaps, process watch-outs.
- **Charts** are thin stacked bars: risk mix in the status colours (with icons and labels), supply coverage
  on a one-hue ordinal ramp validated for the light and dark surfaces, cost as a single-hue Pareto.
- **The skill** runs the read-only CLI (`npm run -s analyse -- part|bom … --json`) and reports
  verdict → actions → evidence → links; it never calls distributor APIs on its own (quota).

Tests: 258 unit tests (camera fit, IC markings, box analysis, Code 39, process route, deep analysis added),
typecheck and lint pass; Playwright 19/19 on `ems_e2e` against a production build — four new flows
(distributor search → catalogue → part page; route → step in 3D → box; Gerber quick look; deep analysis)
plus the viewer test updated for box-build opening on the closed product. Running the e2e build alongside
other heavy processes ran this machine out of memory once; run it on its own.

Known limits: the enclosure catalogue holds the two Hammond boxes the seed projects use — add more in
`src/lib/board/enclosures.ts`; openings and the route are derived, so confirm panel drawings and work
instructions with the customer and the process engineer; route steps carry no times or costs (work orders
estimate line hours); boards without a centroid file keep an approximate layout, which also makes their
openings approximate.

Screenshots (`docs/screenshots/`): part page with tiers and risk (`phase8-part.jpg`), the GW-200 closed in its
box (`phase8-box-closed.jpg`) and exploded (`phase8-box-exploded.jpg`), the route page (`phase8-route.jpg`),
X-ray inspection isolating the four QFNs in 3D (`phase8-route-3d.jpg`), and the deep-analysis report
(`phase8-analysis.jpg`).
