# Phase 7 — Component & machine dictionary, alternatives, real photos, 3D explorers, professional UI

Ask (2026-10-24): "deeply add the knowledge of semiconductors, chips, components, PCB, PCBA, EMS — a
dictionary: what each component does, which alternative suits, how it is used, shown visually; all EMS
machinery and machine components; real 3D layer-by-layer PCB and semiconductor views; a more
attractive, professional home page and UI."

## Decisions
- **Dictionary = versioned TypeScript seed data** (`src/knowledge/dictionary/`), one entry per component
  *type* (LDO, buck, TVS, MLCC, FPC connector, reflow oven, placement nozzle…). Deeper and more granular
  than the 42 family articles, which stay as the long-form reading and are linked from each entry.
  Searched in memory (≈250 static entries — no DB round-trip, no migration).
- **Usage visuals = generated SVG schematics.** A small renderer draws symbols (R, C, L, diodes,
  transistors, op-amp, IC boxes, connectors…) and wires from data, so every typical application circuit
  is crisp in light/dark mode, printable and testable. No copied images.
- **"Real" visuals** come from three places: (1) real component photos from the distributor data we
  already fetch (DigiKey `PhotoUrl`, Mouser `ImagePath`, Nexar `bestImage`) — no extra API calls;
  (2) interactive 3D models (react-three-fiber, already in the stack); (3) the SVG circuits above.
- **Alternatives** are computed from catalogue parameters (form-fit-function rules per parameter) and
  shown with plain reasons; engineers can approve one, which records an `Alternate` (audited).
- Accuracy over volume: equivalents listed in the dictionary are well-known cross-references and always
  carry a "check the datasheet/pin-out" note where pin-outs or behaviour differ.

## 1. Dictionary content (`src/knowledge/dictionary/*.ts`)
Entry: name, aliases, group/family, one-liner, what it does, how it works, key specs (meaning + typical
range), packages, where it is used, application circuit id, how to select, **alternatives** (rules,
known equivalents, cross-family options), EMS assembly notes, pitfalls, sourcing notes, catalogue
categories, family article, related entries, 3D model hint. Machines add: role in the line, key specs,
main sub-assemblies (linked to machine-part entries), maintenance schedule, defects it causes/catches,
makers, consumables.

Groups: power management · analog & mixed-signal · processing & memory · logic & timing ·
interface & communication · RF & wireless · sensors · discrete semiconductors · optoelectronics ·
circuit protection · capacitors · resistors · magnetics · frequency control · electromechanical ·
connectors · cables & harness · PCB & assembly materials · **EMS machines** · **machine parts &
tooling** · **machine building blocks** (servo, linear guide, pneumatics, vacuum, PLC, sensors).

## 2. Application circuits (`src/lib/schematic/`, `src/knowledge/circuits.ts`)
Symbol library + renderer (pin references like `U1.OUT`, orthogonal wires, automatic junction dots,
values/labels, the subject part highlighted). ~40 circuits: LDO, buck, boost, op-amp stages, comparator,
current sense, divider, RC filter, LED driver, MOSFET low/high-side switch, relay driver, reverse-polarity
P-FET, TVS/ESD input protection, crystal, decoupling, reset, I²C pull-ups, CAN, RS-485, USB-C, opto
isolation, 555, H-bridge, bridge rectifier, NTC, TL431, ferrite π-filter…

## 3. Pages
- `/knowledge/dictionary` — search, group tiles with counts, A–Z list; filters by group.
- `/knowledge/dictionary/[slug]` — hero (symbol + 3D package model or photo), what it does, how it works,
  application circuit, key specs, selection checklist, **alternatives**, EMS notes, pitfalls, sourcing,
  "in our catalogue" with live stock/price, related entries and family article.
- `/knowledge/explore` — 3D explorers (below). Knowledge hub and global search link to both.

## 4. Alternatives finder (`src/lib/alternates.ts`)
Per-parameter rules: equal (value, frequency, positions, pitch, protocol…), higher-is-OK (voltage,
power, current, Vds, isolation…), lower-is-OK (tolerance, Rds(on), ESR, ppm), dielectric rank
(C0G > X7R > X5R > Y5V). Same package ⇒ drop-in/pin-to-pin, different package ⇒ functional (layout
change). Ranked with lifecycle, stock, price and second-source bonus. Part page panel + BoM line
expansion + "Approve as alternate" (bom.write).

## 5. Real photos
Adapters parse image URLs; refresh fills `Part.imageUrl` when empty; part page, dictionary catalogue
tiles show them (no-referrer, lazy), with the 3D model as fallback.

## 6. 3D explorers (`src/components/explore/`)
- **PCB layer by layer**: 2/4/6/8-layer and HDI stack-ups, explode slider, per-layer toggles and labels,
  through/blind/buried/micro vias, plating, mask, silkscreen, ENIG pads, parts on top.
- **Chip package cut-away**: SOIC (lead frame + wire bonds), QFN (exposed pad), wire-bond BGA, flip-chip
  BGA (bumps, underfill, lid), WLCSP — clipping plane for a true cross-section, explode, labels.
- **Silicon die layer by layer**: substrate, wells, STI, gate oxide/poly, contacts, metal 1…n with vias,
  passivation, bond pads.
Reduced-motion respected; client-only; one canvas per page.

## 7. Professional UI pass and home page
Home: greeting + quick actions, KPI tiles, live supply status, lines, BoM risk, alerts preview,
watchlist, and an "inside the board" 3D card linking to the explorers and dictionary. Shared polish:
page header, stat tiles, section headers, sidebar brand, empty states, focus/hover states — applied
through the shared components so every page benefits.

## Tests
Vitest: dictionary integrity (unique slugs, every link/circuit/category/article resolves), dictionary
search ranking, schematic renderer (pins resolve, junction dots), alternates rules, adapter image
parsing. Playwright: dictionary search → entry (circuit, alternatives), machine entry, part alternatives,
3D explorer renders and switches, home quick actions.

## Done when
Dictionary, circuits, alternatives, photos, explorers and the new home page work end to end; typecheck,
lint, unit and e2e pass; screenshots in `docs/screenshots/`; committed in steps on `phase-2`.

## Outcome

Built and committed in steps on `phase-2`:

| Step | Commit | What shipped |
| --- | --- | --- |
| Dictionary content | `ada7cc1` | 227 entries in 21 groups / 5 sections, ~71 equivalent tables, search, part → entry mapping |
| Circuits + pages | `44525c4` | Schematic engine, 61 circuits, `/knowledge/dictionary`, entry pages, `/knowledge/circuits`, hub cards, parts hint, part-page card |
| Alternates | `7b03ee5` | Parametric finder, approve/remove (audited, re-scores BoMs), BoM line "Use this" |
| Photos | `65bd1ef` | DigiKey / Mouser / Nexar photo URLs → `Part.imageUrl`, datasheet button, https-only links |
| 3D explorers | `3358075` | PCB stack-ups (2/4/6/8, HDI 1+4+1), five packages, silicon die |
| Home | `d428641` | Greeting band, lines with clear-to-build, needs attention, supply status, knowledge band |

Decisions and deviations from the plan:
- **Circuits frame themselves.** The viewBox is computed from the content (symbols, pins, wires, text),
  so every circuit is tightly framed whatever canvas it was drawn on, and a unit test fails if any label
  overlaps another label, a symbol or a wire (it caught nine collisions in the first draft).
- **Same package ≠ same pin-out.** Only standard-footprint families (chip passives, discretes, crystals…)
  can be auto-classed as drop-ins; ICs and connectors in the same package top out at pin-to-pin with an
  explicit "check every pin" note — the classic SOT-23-5 LDO trap.
- **Photos come from the scheduled refresh.** No extra API calls were spent; photos fill in as the 4-hourly
  hot refresh visits each part. Parts without a photo show their group icon.
- **Explorers are illustrative, not to scale.** Thickness is exaggerated so 18 µm copper is visible; via
  drills are scaled up; die wiring pitch is relative. Stack-up thicknesses and via rules are real and
  unit-tested (symmetry, 1.4–1.7 mm finish, microvias span one dielectric, buried vias never reach the
  surface).
- **three r175 bug.** Extrusions lose their end caps when bevels are off; we use a zero-size bevel
  (`EXTRUDE` in `src/components/explore/scene.tsx`). Remove it after upgrading three.
- **bestOffer FX.** Found in passing: best prices were converted at the offline FX table instead of the
  live one; fixed in the alternates commit.
- **Render on demand.** The explorers draw a frame only when something changes (`frameloop="demand"`,
  instanced meshes call `invalidate()`), so a still model costs nothing on a tablet; the e2e explorer test
  went from 4.6 min to 13 s under software WebGL.
- **Phone overflow.** `sr-only` table headers inside horizontal scroll boxes escaped them and widened four
  pages (part, inventory, users, cart); `.overflow-x-auto` is now `position: relative` in the base layer.

Tests: 211 unit tests, typecheck and lint pass; Playwright 15/15 (three new specs: dictionary → entry →
equivalents, approve/remove an alternate, explorers + home) against a production build with the live
distributor keys blanked for the test server, so e2e only touches the mock market.

Known limits: the dictionary covers kinds of part, not every MPN; mapping a catalogue part to an entry
is heuristic (category + words in the description); the alternates finder only searches our own
catalogue (distributor-wide parametric search would need Nexar/DigiKey parametric endpoints and quota).

## Follow-up: e2e database

E2E used to run on the development database, so every run left test BoMs ("Pico board 1792…"), extra
LD-60 revisions, deactivated test users and audit rows behind, and they showed on the home page. E2E
now has its own database, `ems_e2e`, on the same Postgres: `npm run db:e2e:setup` creates it if
missing, applies the migrations and re-seeds it, and `npm run test:e2e` runs that before every suite.
`playwright.config.ts` gives the test server that `DATABASE_URL` (from `tests/e2e/database.ts`:
`E2E_DATABASE_URL`, or `DATABASE_URL` with the name swapped; it refuses the dev database) and empty
distributor keys and `FX_API_URL`. Empty values win over `.env`, so e2e only sees the simulated market.

