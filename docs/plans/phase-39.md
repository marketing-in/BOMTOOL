# Phase 39 — BoM + Gerbers straight to Footprint & mismatch

## Why
Purchasing drops a customer's BoM workbook and Gerber zip together and wants the answer, not a column-mapping
page. Today every upload with a BoM file stops at `/boms/<id>/map`, even when the columns were read correctly.

## What
1. **Skip the mapping page when the columns are certain.** The upload then does what confirming the mapping does
   (status MAPPED → `ingestRevision` → `linkPlacements` → `bom.map` audit entry marked `auto` → revalidate) and
   opens step 3, `/boms/<id>/match`. Otherwise the mapping page is shown as before.
2. **Certain** (`src/lib/bom/certain-mapping.ts`, pure): the customer's saved template fits the header, or all of:
   - the BoM sheet was found (not a fallback) and the header row is clear;
   - the part's name and the designators come from headers scoring ≥ 75 (quantity and DNP too, when mapped), with
     no unmapped column scoring as high for the same field;
   - the cells agree: ≥ 60 % of designator cells look like designators, ≥ 60 % of part-number cells look like part
     numbers, at least one fitted line, quantities missing on ≤ 10 % of fitted lines, quantity ≠ designator count
     on ≤ 20 %.
3. **The columns can always be reviewed.** Step 3 shows "Columns read automatically · Check columns" (the link only
   for roles that may edit BoMs); the mapping page works on a matched revision and re-matches on confirm. No
   customer template is saved on the automatic path: a template still means a person confirmed the columns.
4. **Files land in the right slot.** Both drop boxes sort files by type (`src/lib/bom/route-files.ts`): the BoM
   workbook to the BoM, the zip, Gerber layers, drill and pick-and-place files to the board. On the server a
   workbook among the board files that reads as a BoM is taken as the BoM (`bomAmong`), not as the centroid file.
5. **Failures are said.** A failed board save or a failed match falls back to the mapping page with its alert.
6. The Gerber step lists fabrication drawings (e.g. `sk`, via plugging) as files read but not drawn.

## Verified
- Unit: `tests/unit/certain-mapping.test.ts` (the certainty rule, validation shared with the mapping editor, file
  routing, `bomAmong`).
- End to end in the e2e environment with the real TYPE7 pack (workbook + 6 × 6 panel Gerber zip with
  extension-less layers): lands on step 3; C5 and L4 "Do not match" by value; board 17 × 15 mm; no "Gerbers do not
  fit"; "Check columns" opens the mapping page; Next goes to step 4.
- `bom-upload`, `job-pack` and `operations` e2e specs follow the new flow.

## Open
- A BoM uploaded without Gerbers also skips the mapping page when its columns are certain (step 3 then says there
  is no board to compare with yet).
- The TYPE7 XY sheet gives pin-1 origins for 0402 and 1210 parts, so their bodies are drawn up to ~1.7 mm off the
  pads; needs a package-aware pin-1 → centre conversion.
