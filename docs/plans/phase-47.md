# Phase 47 — Customer BoMs like THINKSEMI: every column read, nothing swapped, everything checked

## Why
The user's customer BoMs come like "THINKSEMI BOM FOR VERIFICATION PURPOSE" (rev A, with its Gerber zip): a Digi-Key
style export — line no. · Manufacturer Part No. · Digi-Key description · Manufacturer · CAD footprint name · Ref Des ·
Quantity · Part Number (Digikey). Read through the app today (25 Nov) it showed:

- **Parts swapped without asking**: 5 lines auto-selected a different part — TXB0108PWR → TXS0108EPWR (another
  level shifter: open-drain, not push-pull), SRP1270-2R2M (12.5 mm, 22 A) → XAL4020-222MEB (4 mm, a few A), and three
  other makers' equivalents for Murata / TDK / Vishay parts — because a 2-character edit scores 65 and a parametric
  equivalent up to 90, both over the auto-select bar of 60, even when the customer named an exact MPN.
- **Most lines unverified**: 47 of 53 lines "not matched: no distributor data" — the MPNs are not in our catalogue,
  and nothing looks them up at Digi-Key / Mouser / element14 although those keys are configured.
- **A real defect missed**: U6 LM317EMPX/NOPB is a SOT-223 part (description "SOT223", TI's "MP" package code), the
  board's land at U6 is TO-263 (D²PAK) and the footprint column says TO263-10. The check compared only the footprint
  column with the copper, which agree.
- **Columns and words not read**: the Digi-Key PN column is dropped; Digi-Key's "8-SOIC", "16-TSSOP", "144LQFP" order
  is not read as a package; CAD names SO8-P50-A157, SO-G8, TO220U, DO-214-AA, LQFP144, TSSOP16, DR74, EEHZA1V_D8_SMD
  do not resolve; "CRYSTAL 10MHZ 18PF" parses as an 18 pF capacitor; "HEATSINK TO-220 W/PINS" as 220 W; an
  inductor's "22A" is ignored.
- **Maker names**: "Murata Electronics North America", "Littlefuse" (sic), "Fairchild Semi", "Pulse Electronics
  Corporation" are "unknown manufacturer".

## What
1. **Matching never swaps the customer's part** (`src/lib/bom/match.ts`): on a line with an MPN, an MPN a few
   characters off (not an ordering-code variant) and a parametric equivalent are offered as suggestions, never
   selected. Lines with no MPN (value + package only) still take the best parametric part. Inductor equivalents must
   carry the current the description asks for.
2. **Descriptions** (`src/lib/bom/describe.ts`): crystals and oscillators are not capacitors; "TO-220" is a package,
   not watts; inductor current ("22A") read.
3. **Packages from every way they are written** (the package reader `signature()` in src/lib/board/footprint-match.ts): Digi-Key's
   "8-SOIC" / "16-TSSOP" / "144LQFP" / "TO-220-3" / "DO-214AA, SMB", CAD names (SO8-P50-A157 = SOIC-8 50 mil
   pitch 157 mil body, SO-G8, TO220U, TO220AC, DO-214-AA, LQFP144, TSSOP16, CC0805N / RC0805N, DR74, SRP1270,
   EEHZA1V_D8_SMD, CRYSTAL 49US SMT, JUMPER_nPOS, E41/17/12 …), used by the package resolver and the footprint check.
4. **Package conflicts**: a line whose description, MPN-coded package and footprint column disagree is flagged on the
   line (PACKAGE_CONFLICT), and the footprint check compares the description's package with the copper too — U6 red.
5. **Distributor PN column** (`supplierPn`, `supplierName` on BomLine; migration): "Part Number (Digikey)", "Mouser
   #", "LCSC Part", "Farnell / Newark / element14 PN"… read and kept. Checked against the MPN and maker
   (`src/knowledge/distributor-pns.ts`: Digi-Key and Mouser SKU shapes and maker prefixes): missing, not a
   distributor PN ("TRANSFORMER"), another maker's prefix, or an ordering suffix the MPN lacks (/NOPB). Used to look
   the part up when the MPN alone finds nothing.
6. **Every MPN looked up**: after a BoM is matched, the lines whose MPN is not in the catalogue are looked up at the
   configured distributors (part number only, cached, within each adapter's daily limit), added to the catalogue with
   their offers and lifecycle, and matched exactly. In the background; the validation page says how many are left and
   offers to run it again.
7. **Maker names**: aliases resolved through region words ("North America", "Europe"), "Semi", one-letter typos of
   long names and unique prefixes; Pulse Electronics added; `knowledge:sync` adds new makers and aliases to a running
   database without a reseed.
8. **Validation** gains: "matched part is not the BoM's part" (red until accepted), distributor PN check, line
   package conflicts, generic / custom part numbers ("TRANSFORMER": needs a drawing or spec, no distributor sells it).
9. **Skill + tool for the next BoM**: `scripts/verify-bom.ts <bom.xlsx|csv> [gerbers.zip|rar|folder]` prints a
   verification report from the files alone (no database writes): columns read, every line's checks, the Gerbers'
   placements against the BoM, packages against the copper, makers, distributor PNs. `.claude/skills/bom-verification`
   tells Claude how to run it on each BoM the user gives, read the report, and turn what is new (a footprint naming
   style, a maker spelling, a description form) into knowledge entries with tests.

## Verified by
- Unit tests for each rule above with synthetic lines (no customer data in the repo).
- THINKSEMI end to end in the dev app: no swapped parts, U6 red, the transformer and FRC lines flagged as custom,
  makers resolved, Digi-Key PNs read and checked, lines looked up live, 139 placements unchanged.
- tsc, eslint, full vitest.

## Done (25 Nov)
- Matching: `SUGGESTION_MAX` (59) caps a few-characters-off MPN and every parametric equivalent on a line that names
  its part; inductors must carry the asked current. Descriptions: crystals/oscillators no capacitors, "TO-220 W" no
  watts, inductor amps read. TDK base part numbers (C2012X7R1H105K) decode.
- Packages: pin-count-first ("8-SOIC", "144LQFP", "20TSSOP"), SO-G8, DO-214-AA, 49US read; `describedCheck` compares
  the description's package with the copper; line checks PACKAGE_CONFLICT (red) and GENERIC_MPN (amber).
- Distributor PN column: `supplierPn` / `supplierName` on BomLine (migration 20261126120000), "Distributor part no."
  field and header synonyms, `src/knowledge/distributor-pns.ts` (Digi-Key / Mouser prefixes, LCSC, -ND shapes).
- Makers: region / "Semi" words and one typing slip resolved; Pulse Electronics added; `npm run knowledge:sync` adds
  new makers and aliases to a running database (`syncManufacturers`).
- Validation: new checks "Part number" (substitutes, line issues) and "Distributor PN"; job `bom.lookup` looks a BoM's
  unknown MPNs up at the distributors after every match (only with live keys) and the validation page shows it.
- `scripts/verify-bom.ts` and the project skill `.claude/skills/bom-verification`.

## Verified
- Unit: 1,027 pass (new: matcher swaps and inductor current, descriptions, TDK base, package forms and
  describedCheck, line checks, maker resolution, distributor PN detection and checks, validation part / distributor
  checks). tsc and eslint clean. `npx prisma migrate status`: up to date.
- THINKSEMI re-uploaded with its Gerber zip in the dev app: straight to the footprint match, 53 lines, 52 Digi-Key PNs
  read, 139 of 139 placed and linked, no swapped parts. Validation: U6 red twice (package conflict; TO-263 pads vs
  SOT-223 description), T1 "TRANSFORMER" custom part, J8 no Digi-Key PN, T1 not a Digi-Key PN, U5 /NOPB ending.
  `scripts/verify-bom.ts` gives the same 2 red / 4 amber from the files alone; gaps: makers "Online Int",
  "Constantine Technologies" (not distributed makers).

## Open
- **No live distributor keys locally**: DIGIKEY_*, MOUSER_API_KEY, ELEMENT14_API_KEY are empty strings in .env, so the
  lookup can only search the simulated market and visibility stays "not matched" for these MPNs. With keys set, the
  same job fills the catalogue, offers and lifecycle.
- Neon (production) needs migrations 20261123120000, 20261125120000 and 20261126120000 before a deploy.

## Incident (25 Nov): local database wiped and restored
A drift check (`prisma migrate diff … --shadow-database-url`) was given the dev database as its shadow (macOS sed did
not rewrite the URL) and reset it. Restored the same day from the Neon copy made on 20 Nov (all 33 tables, counts
checked; migrations recorded with `prisma migrate resolve --applied`). Lost: what was created locally between 20 and
25 Nov — the THINKSEMI revision (re-uploaded from its files) and any calls, competitor entries, register items, parts
or edits made locally in those days. Rule since: never a shadow URL against the dev DB; `migrate status` only.

