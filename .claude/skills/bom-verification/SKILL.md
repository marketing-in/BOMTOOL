---
name: bom-verification
description: Verify a customer's BoM and its Gerbers the way this EMS platform does — columns read (MPN, maker, CAD footprint, designators, quantity, distributor part numbers such as Digi-Key / Mouser / LCSC), every line checked (part number against description and package, package conflicts, makers, distributor PNs, custom parts), the board's silkscreen placements and copper checked against the BoM — and turn whatever the app does not know yet into knowledge entries with tests. Use whenever the user gives a BoM (xlsx / csv) with or without a Gerber zip / rar and asks to verify, validate, check, read or "make it refined", says "every BoM I give is like this file", or uploads a BoM whose lines come out unmatched, mis-read or flagged wrongly.
---

# BoM + Gerber verification

The user's customers send BoMs like "THINKSEMI BOM FOR VERIFICATION PURPOSE" (rev A): a Digi-Key style export with
line no. · Manufacturer Part No. · Digi-Key description ("CAP CER 10UF 25V 10% X5R 0805", "IC REG LDO ADJ 1A
SOT223") · Manufacturer · CAD footprint name (CC0805N, RC0805N, SO8-P50-A157, TO220U, DO-214-AA, DR74 …) · Ref Des
(comma lists, any order) · Quantity · Part Number (Digikey), with a Gerber zip of the same board. A verification BoM
carries deliberate traps; find them all and say exactly what is wrong. Never invent stock, prices or lifecycle.

## 1. Read the files with the app's own readers (no database, nothing sent anywhere)

```bash
npx tsx scripts/verify-bom.ts "<bom.xlsx|.csv>" "<gerbers.zip|.rar|folder>" --out <scratchpad>/report.md
```

The report gives: the columns as read, the board (designators read off the silkscreen, placed N of M, missing and
extra designators), findings red first, and **knowledge gaps**. Read the source sheet yourself too (openpyxl with
`python3 -E`) — the report is only as good as the app's readers.

## 2. Check every trap a verification BoM hides

Go through the lines yourself as an EMS engineer; for each, does the report catch it?

- Part number vs description: value, voltage, tolerance, dielectric, case size (src/lib/bom/line-checks.ts).
- Package: description vs footprint column vs the copper under the part (LM317EMPX = SOT-223 on a TO-263 land).
- A word where a part number belongs ("TRANSFORMER"): a custom part, needs a drawing or spec.
- Designators: quantity vs count, duplicates across lines, odd prefixes (RC13 on a capacitor line — check the
  silkscreen: if the board prints it too, it is the designer's name, not a typo), gaps (R3 missing: on the board?).
- Makers: spellings ("Littlefuse", "Murata Electronics North America", "Fairchild Semi") resolve to one maker.
- Distributor PNs: missing, not that distributor's shape, another maker's prefix, an ordering ending the MPN lacks
  (Digi-Key "LM2675MX-3.3/NOPB" for the BoM's "LM2675MX-3.3").
- Matching: a part named by the customer is never swapped for another (TXB0108 is not TXS0108; SRP1270 22 A is not
  XAL4020) — the matcher offers equivalents as suggestions only (src/lib/bom/match.ts, SUGGESTION_MAX).
- Board: every designator placed on its own pads; big parts drawn big (src/knowledge/part-bodies.ts).

## 3. Turn what the app does not know into knowledge (with a test each)

| Gap | Where it goes | Test |
| --- | --- | --- |
| Maker spelling | `prisma/seed-data/manufacturers.ts` (aliases), then `npm run knowledge:sync` adds it to the running DB | tests/unit/lib.test.ts |
| Package / footprint name form | `src/lib/board/footprint-match.ts` `signature()` (NAMED / FAMILY / pin-count-first) | tests/unit/footprint-match.test.ts |
| A part's 3D body | `src/knowledge/part-bodies.ts` (dimensions from the maker's datasheet, cite it in `source`) | tests/unit/part-bodies.test.ts |
| Distributor prefix or PN shape | `src/knowledge/distributor-pns.ts` (bump `DISTRIBUTOR_PNS_VERSION`; only prefixes you are sure of) | tests/unit/distributor-pns.test.ts |
| Header spelling of a column | `src/lib/bom/columns.ts` SYNONYMS | tests/unit/distributor-pns.test.ts / bom.test.ts |
| Description wording | `src/lib/bom/describe.ts` | tests/unit/bom.test.ts |
| Part number family | `src/lib/bom/mpn-decode.ts` | tests/unit/bom.test.ts |

Tests use synthetic lines shaped like the customer's, never the customer's own file, designators or MPN list.
Re-run `scripts/verify-bom.ts` until the report is right, then `npx vitest run tests/unit`, `npx tsc --noEmit`,
`npx eslint`.

## 4. In the app

Upload the BoM with its Gerbers (/boms/new): it goes straight to the footprint match, and its Validation page
(/boms/<id>/validation) shows the same findings as flags a reviewer accepts (false call, with a reason) or prohibits.
After matching, part numbers not in the catalogue are looked up at the distributors **only when live keys are set**
in .env (DIGIKEY_CLIENT_ID/SECRET, MOUSER_API_KEY, ELEMENT14_API_KEY, LCSC_*); check `configured()` — empty strings
are not keys. Lookups send part numbers only.

## Safety

- Never run `prisma migrate dev`, `migrate reset`, `db push --force-reset` or anything with `--shadow-database-url`
  against the dev database (it once wiped it). Use `npx prisma migrate status`. Dump before any risky DB step.
- Don't commit unless the user asks (they asked for local changes only). Don't touch the app on port 3000.
- Report what you checked and what you could not (no live keys, no Gerbers) plainly.
