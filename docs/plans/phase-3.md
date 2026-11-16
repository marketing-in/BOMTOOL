# Phase 3 — Electronics knowledge engine

Goal: a searchable, visual reference covering the whole product — bare board, assembly, box-build and
every component family we buy — that is wired into the working screens, so a red cell in a BoM or a
part page always links to the "why" and "what to do".

## Content model (`src/knowledge/`, versioned TypeScript seed data)
- `Article { slug, domain, title, summary, tags, version, sections[], standards[], related[], categorySlugs[], visual? }`
- Section kinds: text, facts (key parameters with *why it matters*), list (tone: tip / risk / neutral),
  table, steps.
- Component entries share one shape so they read alike: what it is · how it works · key parameters to
  match on · packages/variants · common manufacturers · typical failure modes · sourcing tips (lead-time
  risk, counterfeit risk, alternates) · standards.
- Synced into `KnowledgeArticle` by the seed and by `npm run knowledge:sync` (upsert by slug, bumps on
  version change — never wipes production data).

## Coverage (Module 1)
- **1A PCB**: materials (FR-4 Tg grades, high-Tg, Rogers/PTFE, polyimide, IMS/aluminium, ceramic), board
  types (1/2-sided, multilayer, HDI, flex, rigid-flex, RF, heavy copper), stack-up & impedance, copper
  weights, surface finishes, design-data formats (Gerber X2, ODB++, IPC-2581, drill, centroid), IPC
  standards & classes, DFM for fab.
- **1B PCBA**: SMT line station by station, solder paste & stencils, SPI, placement, reflow profiles,
  AOI & X-ray, THT (manual, wave, selective, press-fit), depanel/clean/coat/pot, test (ICT, flying
  probe, FCT, burn-in, programming), MSL & baking (J-STD-033), ESD (S20.20), IPC-A-610 / J-STD-001 /
  IPC-7351, DFM/DFA checklist.
- **1C Box-build**: enclosure types & materials, IP/NEMA, CNC / sheet-metal / finishing, harness &
  crimping (IPC/WHMA-A-620), thermal, gaskets & labels, EMC/safety (CE, BIS, UL), final test & packing.
- **1D Components**: one article per catalogue category (≈ 55), package families with pitch tables,
  lifecycle states, counterfeit indicators, AWG table.

## Visuals
- **Process player**: step-by-step animated timelines for PCB fabrication (board cross-section builds up
  layer by layer), SMT line, THT and box-build — play/pause, keyboard and tablet friendly.
- **Package drawings**: SVG top views generated from package data (pads, leads, balls, exposed pad,
  pitch annotation) — on package articles and part pages. (3D gallery joins in Phase 4 with the viewer.)
- **Stack-up explorer**: interactive 2–10 layer stack with copper weights and dielectric thicknesses.

## Search & links
- Postgres full-text search (`ts_rank`) over title, summary, tags and body; `/knowledge?q=`.
- Part page → its category article + package article; BoM grid issues (MSL, lifecycle, counterfeit)
  → the relevant article; dashboard lifecycle mix → lifecycle article.

## Tests
Vitest: every article has the required sections, unique slugs, related/category links resolve,
every catalogue category has an article, search ranking sanity. Playwright: search → article → process
player steps.

## Outcome (2026-10-24)
85 articles across PCB, PCBA, box-build, semiconductors, passives, packages/risk and processes, synced
to `KnowledgeArticle` by `npm run knowledge:sync` (content hash, so re-running only updates changed
articles). Postgres full-text search with weighted title/summary/body. Process players for PCB fab
(animated cross-section), SMT, THT and box-build; stack-up explorer; SVG package drawings. Part pages
link to the article for their category and package family. Nothing is "trained" — the content is
versioned seed data that engineers can extend in `src/knowledge/`.
