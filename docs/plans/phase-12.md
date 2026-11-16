# Phase 12 — The running SMT line in 3D, and full directories for board, PCBA and box

**Ask (user, 2026-10-28):** analyse `D:\Downloads\circuitflow.zip` (their "semi-cobot" app) and the deck;
add its features: the 3D machines "that quality", the machine line "3D running video", and for one BoM the
EMS process on the web — first the PCB (choose its type → details directory → our inventory, suppliers,
marketplace), then the PCBA (the components list with the same directory and supply), last the complete
product (choose the box type → its directory and supplier list). "Full directory list … all process in my
code."

## What circuitflow has that we don't
| circuitflow | Here before Phase 12 |
|---|---|
| **3D SMT line**: loader → paste printer → SPI → pick-and-place → reflow → AOI → X-ray on one conveyor, boards flowing on a schedule, signal towers, play/pause/10×/50×, takt, bottleneck, boards/h, first-pass yield; click a machine for its inner 3D cycle and process data (stencil area ratios, SPI volumes, placement program, SAC305 reflow recipe, AOI/X-ray results) | Process route (list + highlight on the board), machine dictionary, no running line |
| **Board-type knowledge**: 61 board types with recognition signals, sections, typical parts, review checks | Component dictionary, circuits; no board types |
| **Part master**: 1,454 semiconductors + 1,229 resistors (reference data) | Our catalogue (200 parts) + live distributor search |
| Gerber component inference, picture blueprints (Claude vision), cobot gripper, capacity estimate, radar supplier compare | Partly covered (Gerbers, supply tiers); not ported now |

## Decisions
1. **Port, don't re-imagine, the line.** circuitflow's line is plain three.js + React in dense JS. It is
   brought over almost verbatim under `src/vendor/circuitflow/` (the user's own code, ISC; `allowJs`),
   with Vite-only `import.meta.glob` replaced by explicit imports and its styles scoped under `.cf-scope`.
   An adapter turns a BoM revision's board and placed parts (mm, rotation, side, package, MPN, value) into
   circuitflow's blueprint format. Page: **BoM → SMT line** (`/boms/[id]/line`).
2. **One Directory** (sidebar → Directory) with four tabs, each entry linking to who can supply it:
   - **Board types** — circuitflow's 61 types; the BoM's board is recognised from its parts (MPN patterns,
     keywords, part count, size, layers) and shown on the supply chain page.
   - **PCB technologies** — rigid FR-4 2/4/6+ layers, HDI, heavy copper, aluminium MCPCB, flex,
     rigid-flex, RF/PTFE … (new seed data): spec ranges, uses, DFM notes, and the PCB fabricators whose
     capabilities fit.
   - **Components** — the part master as a searchable reference; each row shows whether it is in our
     catalogue (with our stock / partners / distributors) or offers a distributor search.
   - **Box types** — die-cast, extruded, moulded, sheet-metal, DIN-rail, wall-mount, IP67 sealed, handheld
     (new seed data): when to use, IP range, the enclosures we carry (stock by tier) and the box makers.
3. **The product flow** — the supply chain page shows, per step, the type picked for this product (PCB
   technology, board type, box type) with a link into its directory entry.
4. circuitflow's data is labelled as theirs ("illustrative, not verified purchasing data").

## Steps
1. Vendor the line modules + adapter + `/boms/[id]/line`; buttons from the BoM and route pages.
2. Directory data (board types, part master copied as seed JSON; PCB technologies and box types as TS seed
   data) + pure helpers (recognition, matching) with tests.
3. Directory pages; supply-chain integration.
4. Screenshots, a recorded video of the running line, tests, docs, commit.

## Extension (user, 2026-10-28): "collect all available parts, components, PCB and box materials in the world"
No database can hold every part in the world — tens of millions of MPNs that change daily, and the
distributors' terms and daily API quotas forbid bulk copying. What *can* be complete is the map of what
exists, with the engineering data a buyer or engineer needs, and a live search for any specific part:
- **Component families** — every family of electronic component (passives, discretes, ICs by function,
  electromechanical, power, RF, sensors, optoelectronics, cables, mechanical): sub-types, packages, key
  parameters, leading manufacturers, uses, EMS notes (MSL, attrition, counterfeit exposure), linked to our
  catalogue category and to the live distributor search. (`src/knowledge/component-families.ts`)
- **PCB materials** — laminates (FR-2 … FR-4 by Tg, halogen-free, CEM, polyimide, PTFE, hydrocarbon-ceramic,
  BT, metal core, ceramic) with Tg, Td, Dk, Df, CTE-z, thermal conductivity, cost; surface finishes;
  copper weights, via structures, solder mask, IPC classes. (`src/knowledge/pcb-materials.ts`)
- **Enclosure materials** — aluminium and zinc alloys, steels, engineering plastics, gaskets, with density,
  service temperature, flammability, UV and chemical resistance, shielding, process and cost; surface
  finishes. (`src/knowledge/enclosure-materials.ts`)
Values are typical datasheet values for comparison, labelled to be checked against the supplier's datasheet.

## Outcome
- **SMT line** (`/boms/[id]/line`): circuitflow's line ported (src/vendor/circuitflow, `entry.ts` gives it
  types; the `.d.ts` approach made webpack resolve declarations as the module). GW-200's 74 parts: takt
  34 s (pick-and-place bottleneck), 105 boards/h, first board 7 min 28 s, FPY 100 %; the pick-and-place
  inner view plans 11 cycles over 31.4 s from GW-200's own designators. A recorded video of it running was
  sent to the user.
- **Directory** (`/directory`): PCB (10 technologies + matching fabs, 16 laminates, 10 finishes, 20 build
  features), 61 board types (circuitflow), components (75 families across 17 groups, 2,683 reference parts
  from circuitflow, catalogue stock, live search), boxes (7 types + enclosures + makers, 20 materials,
  12 finishes). Supply chain page shows the product's types in build order.
- Honest limit, stated on the page: no list holds every part in the world; the live search reaches them.
- Tests: unit +11 (recognition, classification, fab matching, part-master search, data integrity);
  e2e +2 (`tests/e2e/phase12.spec.ts`).
