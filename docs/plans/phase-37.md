# Phase 37 — Every page of the BoM file

Asked for (18 Nov 2026): when a BoM file has several pages (sheets), every page must be checked and its details must get into the tool.

## What a page can be

Each sheet is read and said for, with one line saying why: BoM, placement report, load list, not fitted, **alternates** (primary/alternate part options per BoM item), **details** (label/value pairs, or free-text notes), **revision history**, **reference table** (a part list, a price list, a catalogue: read, not a BoM), or not a table. Hidden sheets and rows hidden by a filter are read and named.

## The BoM

- Header names: "Primary MPN / Model", "MPN / Model" are the MPN; "Alternate MPN", "Candidate part numbers" feed a new **Alternate MPNs** field; "Mounting", "Size X (mm)", "Count scope" and sentences are no field.
- Sheets are scored by the BoM fields they carry. With no BoM-like sheet, the table with most BoM fields is taken, never by position, and an amber finding says so.
- Several BoM sheets: other parts → merged, each line tagged with its sheet (Section column); a copy, or the same parts again → left out and named; partly shared designators → left out, amber. Visible sheets before hidden ones. The person can pick the BoM sheets on the upload form.
- Inside a table (CSV too): a repeated header or another header starts a block, a one-cell title names the section, a "Total" row is a check, not a line.
- One row per designator with a repeating item key → one line per item, designators joined, quantity counted. A not-fitted row never joins a fitted one.
- An alternates sheet is joined on the column it shares with the BoM (item, house code, else MPN) into an "Alternates (sheet)" column, `MPN (Maker); …`. The matcher tries them after the part, each against its own maker.
- Load lists: a copy, or the per-side lists in one, are said for and not checked twice. A side list under a load list is checked against the placements.

## Details

Title rows, CAD report headers, details sheets, notes, the bare board's line and the file name give: board/product name, part number, revision, PCB revision, customer, build qty, board size/stack-up, date, tool, design file, notes; each with the cell it came from. Counts ("Parts 43", "Total Placed Components: 20", "BOM items 228") are checked against the lines; a difference is an amber finding. Two revisions in one file, or a typed revision unlike the file's, are amber findings.

Kept in existing columns (no migration): `BomRevision.pack.details` / `.alternates`, `BomRevision.notes`, `Bom.assemblyPartNumber` (when empty), `Project.boardSpec` (fill what is empty: size, layers, finish…, `pcbRevision`).

## Screens

- `/boms/new`: the file is read in the browser on choosing it (reader loaded on demand); every sheet is shown before upload; project, BoM name, revision and build qty are filled from the file where the person has not typed, each marked "From the file · cell". Never submits.
- Map page: the same strip. BoM step: the strip, folded.
- A CSV: one line saying a CSV holds one sheet.

## After review (19 Nov 2026)

- Two BoM-like sheets are compared on the first key both carry: designators, then part numbers, house codes, descriptions (so a costed copy with no designators is "the same parts"). A sheet that cannot be compared, or whose name says spares, changes (ECO), an older copy or a quote, is left out with an amber finding until the person ticks "Use as BoM".
- A sheet of the parts on each board ("Board | Ref | Side | X on board (mm)") is placement data per board, not more BoM lines: each board's designators are checked against the BoM, the board becomes the line's section, and the positions are not put on one 3D board (U1 can be on two boards).
- A sheet listing the BoM's parts again is joined to it: candidate part numbers become alternates, "Mounted on" the section, the "Circuit boards" rows' material and size the board details (one board: the project's board spec).
- Part options known only by an internal part number are kept in a column of their own ("Alternate internal P/Ns (…)"), not dropped.
- "Likely / candidate / proposed part number" columns are alternates, never the customer's MPN (MISSING_MPN stays); a family, a range or a placeholder ("RK35xx family", "2 to 4 GB", "BQ2588x") is not tried as a part number.
- Customer templates are matched and saved on the customer's own columns; the columns the upload adds after them (Section, "Quantity (rows counted)", alternates) are mapped automatically.
- A plain one-table CSV keeps no pack summary (a name read off the file name alone is not worth one), and the typed-revision check ignores a revision read only off the file name.
- The file name gives the CAD tool as a detail ("PICO-BOARD_KiCad" → PICO-BOARD, made with KiCad). A list with no header row keeps its first row as a line, and one-cell rows of a one-column list are lines, not section titles.
- "Primary", "front" and their opposites name a board side only with "side" or "layer" after them.
- The upload form reads the file in a Web Worker (the page stays responsive), puts back what an earlier file filled in when another file is picked or the file is removed, selects the customer the file names when it is one of ours, keeps the last "Use as BoM" box ticked, and says when a ticked sheet was left out.

**CSV, on purpose:** a CSV goes through the same table reader as a sheet. Repeated headers, a title block printed again on the next page, "Page N of M" footers and "Total" rows are not lines; one-cell titles become a Section column only when they say so, sit above a header, or the table opens with one (a free-text row among the lines stays as it is); one row per designator is grouped by an item column, or by a part number that repeats with the same description, value and package. A plain CSV comes out unchanged.

## Tests

`tests/unit/workbook-pages.test.ts` on workbooks made in the test: title rows, details sheet and totals, notes, per-designator grouping, alternates (internal-P/N-only kept), side and assembly merges, copies and hidden sheets, price lists, load-list copies and side lists, hidden rows, plain and stacked CSV (repeated title blocks, page footers, side titles, free-text rows), a costed copy, sheets that cannot be compared or are named as spares/changes, a per-board parts sheet (XbotGo shape), a same-parts sheet joined in (speaker shape), templates over added columns, headerless lists, the CAD tool in a file name, alternates that name no part, revision history, customer, and side names.
