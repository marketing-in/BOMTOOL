# Phase 1 — BoM upload, mapping, scrubbing, matching, scored grid

Goal: a purchaser drops any customer BoM (.xlsx/.xls/.csv, Altium/KiCad/OrCAD exports) on the page and
within seconds sees every line matched, scrubbed, quantified for the build and scored green/amber/red
on the five SoW axes.

## Flow
1. **Upload** `/boms/new` — drag-drop file, pick customer (or create), project, BoM name, revision,
   build qty. New revision of an existing BoM is supported (versioning; diff view comes in Phase 6).
2. **Parse** (server) — SheetJS for xlsx/xls, Papaparse for csv/tsv/txt. First sheet with data.
   Header row auto-detected (title rows above the table are common in Altium/OrCAD exports).
3. **Map** `/boms/[rev]/map` — auto-detected column → field mapping with confidence, preview of the
   first rows, header-row override, one dropdown per column. Saved customer templates are applied
   automatically when the header signature matches; "save as template" on confirm.
   Fields: MPN, Manufacturer, Qty, RefDes, Description, Value, Package/Footprint, DNP/Populate, Customer PN.
4. **Scrub** — clean MPNs (prefix junk, whitespace, DigiKey `-ND`), normalise manufacturer through the
   alias table, DNP detection (column values, qty 0, "DNP/NF/NC" text), qty vs RefDes count, missing MPN,
   duplicate MPN across lines, unknown manufacturer, lifecycle flags.
5. **Match** — per line, in order, stopping at the first confident hit:
   exact normalised MPN → manufacturer-checked → fuzzy (packaging/ordering suffix variants, prefix
   containment, edit distance ≤ 2) → **parametric from description** (`10uF 25V X7R 0805`,
   `10k 1% 0603`, `10uH`, `0R`) against PartParameter values. Top 5 candidates stored with method +
   confidence; best one auto-selected when confidence ≥ 80, otherwise the line is "needs review".
6. **Build quantity** — qty/board × build qty × (1 + attrition %) with attrition from package
   (category override), then rounded up to MOQ and to a full reel when ≥ 60% of SPQ.
7. **Score** (0–100 per line, cost-weighted for the BoM; ≥70 green, 40–69 amber, <40 red):
   - Availability — internal + excess + authorised stock vs need, # authorised sources, factory lead time.
   - Resilience — lifecycle, # independent sources, drop-in alternates available.
   - Quality — brand tier, condition & date code of the source we'd use, years in market, counterfeit risk.
   - Economic — chosen unit price vs median market price at that qty, 90-day price trend.
   - Sustainability — RoHS/REACH/conflict minerals, excess reuse, local (IN) supply.
8. **Grid** `/boms/[rev]` — TanStack Table with the SoW columns: MPN, manufacturer, description,
   condition, qty, MOQ, price breaks, last updated, total stock, # distributors, manufacturer &
   factory lead time, best price, lifecycle, RoHS, REACH, HSN, CoC, the five scores and actions.
   Sort, global search, risk filter chips, column visibility, sticky MPN column, expandable row with
   match candidates (choose another candidate) and alternates. Build-qty change re-scores.
   Add-to-cart / RFQ / Bid buttons are visible but disabled until Phase 2.

## Decisions
- Matching/scoring runs **inline** in the server action (a 100-line BoM scores in well under a
  second). BullMQ arrives in Phase 2 with the distributor price-refresh jobs, which is where Redis is
  actually required; the match step is a pure function so it can move into a worker unchanged.
- Parsing and matching logic are pure modules in `src/lib/bom/` (unit-tested); DB access stays in
  `src/server/bom.ts`.
- SheetJS is installed from the vendor's official CDN tarball (the npm registry copy is outdated).
- Schema: `BomRevision.rawRows`, `headerRow`, `scoredAt`; `BomLine.rawValue`, `rawRow`,
  `needsReview`.

## Tests
- Vitest: header detection, column auto-mapping (Altium, KiCad, OrCAD, generic), scrub rules,
  description parser, fuzzy matcher, build-qty rounding, each score.
- Playwright: log in → upload `samples/boms/NIM-GW200-PCBA_revB.csv` → confirm mapping → grid shows
  matched lines with scores.

## Done when
All three sample BoMs plus a messy Altium-style xlsx and a KiCad csv upload, map and score end-to-end;
tests and build pass; committed on `phase-1`.

## Outcome (2026-10-23)
Done as planned. The seed now loads its three sample BoMs through the same upload pipeline.
Two more samples added: `SENSOR-HUB_Altium_revA.xlsx` (cover sheet, title block, section rows,
fuzzy and DigiKey-suffixed MPNs, description-only lines, DNP) and `PICO-BOARD_KiCad.csv` (semicolon).
Bugs found and fixed while testing: section-title rows were being kept as lines; quoted MPNs after
an `MPN:` prefix kept a quote; an sr-only header label widened the page.
Verified: 70 unit tests, 3 Playwright flows, typecheck, lint, production build, no horizontal
overflow at 1600 px and 768 px. Still mocked: all distributor offers (Phase 2). Unknown MPNs that
are not in our catalogue stay "Not found" until distributor search arrives in Phase 2.
