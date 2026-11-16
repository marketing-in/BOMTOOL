# Phase 29 — Read a customer's real job pack

Asked for: a customer's real files would not load — a BoM workbook and a zip of Gerbers. Teach the tool to read
this kind of file with an electronics engineer's knowledge (board design, PCB assembly), and read every sheet of
the workbook, not only the first.

The customer's files stay outside the repository. Tests use made-up files of the same shape.

## What the two files are, and why the tool gave up

**The Gerber zip** is a production panel exported from a CAM station, not a single board from a CAD tool.

| What is in it | Why the tool gave up |
| --- | --- |
| Nine files with no extension: `tl bl to bo ts bs ko sk drl` | Layers were recognised by extension or KiCad name only → all nine "skipped" → "No Gerber, drill or centroid files" |
| A header comment in each file that names the layer (`G04 -- layer:tl*`) | Never read |
| The drill file is written as a Gerber (round flashes, slots as strokes), not Excellon | Would have been read as Excellon: no holes |
| A panel: the same board many times in rows and columns, with rails, tooling holes, fiducials and break-off tabs | Would have been drawn as one very large board with every part many times over |
| A fabrication-only layer (`sk`, the vias to plug) | Unknown |

**The workbook** is an EMS job pack: one file that carries the BoM, where every part sits, and what the machine
loads on each side.

| Sheet kind | What it is | Before |
| --- | --- | --- |
| Customer BoM | Title rows, then code / description / part number / package / designators / quantity; its last line is the bare board | Read, but the code and description columns were not recognised |
| Placement report | A Cadence Allegro "Placed Component Report": `REFDES, SYM_X, SYM_Y, SYM_ROTATE, SYM_MIRROR, SYM_NAME, COMP_VALUE` | Not read (sheet 2); the column names were unknown anyway |
| Load lists (top, bottom, both) | One row per designator with part number, description, X, Y, rotation: what the pick-and-place machine is programmed from | Not read |
| Not-fitted lists (top, bottom) | Designators that exist on the board and are not loaded | Not read |

Inside the BoM sheet: a part-number cell often holds two part numbers ("A / B", the second an approved alternate)
and was matched as one string; the bare board's line was flagged "No MPN".

## What changes

### 1 · Fabrication files

- **Layer names** (`src/lib/board/cam-names.ts`, data): one table of how CAD and CAM tools name layers — Protel and
  Altium extensions, KiCad, Eagle, OrCAD, Allegro film names, EasyEDA, the short names CAM stations use with or
  without an extension (`tl`, `gtl`, `l2`, `ko` …), plain words ("top copper"), and the layer named in a header
  comment. `classifyLayer` reads it; the knowledge page shows the same table.
- **One answer for both readers**: the upload stamps the layer it recognised into the file as a standard X2
  attribute, so the drawing and the part reader can never disagree about a file.
- **Drill written as Gerber** becomes Excellon (holes by diameter, slots).
- **Panels** (`src/lib/board/panel.ts`): the outline layer is searched for the same closed outline repeated on a
  regular grid. Found: rows × columns, board size, pitch and gap, panel size, rails, tooling holes, fiducials and
  how the boards break off (mouse bites, V-score or routed tabs). One board is cut out of every layer and moved to
  0,0, and everything downstream (drawing, 3D, parts, paste, holes) works on that one board. The panel's figures
  are kept and shown on the Bare board step.
- Fabrication-only layers (via plugging, drawings) are named and left out of the picture.

### 2 · The workbook

- **Every sheet is read and named** (`src/lib/bom/workbook.ts`): BoM, placement report, load list, not-fitted
  list, or not used. The BoM is the sheet whose header reads most like one, not simply the first.
- **BoM words**: more header names (serial number, internal code, maker's part number written many ways,
  particulars), and a column called "Part" is the description when its cells read like descriptions.
- **Placement report words**: Allegro, plus the usual others. `SYM_MIRROR = YES` is the bottom side. A workbook
  with only per-side load lists gives placements too, the side taken from the sheet name.
- **Not fitted**: designators the placement data has, no BoM line names and a not-fitted list (or a value of DNL,
  NC, DNP) explains become not-fitted lines, so the board and the BoM agree and the 3D view shows them empty.
- **Two part numbers in one cell**: the first is the part, the rest are tried as alternates.
- **The bare board's line** is no longer a component line: its text gives the board's layers, thickness, copper,
  finish, colours and size, and fills the project's board spec when it has none.
- What was read is kept on the revision (`BomRevision.pack`, new column) and shown on the mapping step as a row of
  sheet chips.

### 3 · An engineer's checks on what was read

- **The part number against the description** (`src/lib/bom/mpn-decode.ts`): ceramic capacitors, chip resistors
  and chip inductors of the common makers are decoded from the part number (value, voltage, tolerance, dielectric,
  size) and compared with what the line says. A lower voltage, another value, another size or a part number that
  cannot be read are flagged on the line.
- **The BoM against the design file**: the value the CAD file carries for each designator is compared with the BoM
  line's value on the footprint-match step.
- **The sheets against each other**: load lists against the placement report (position, rotation, side),
  designators on the board with no BoM line and no not-fitted entry, and the reverse.

### 4 · Knowledge

New articles and dictionary words, in `src/knowledge`: reading a job pack, layer file names, panels (units, rails,
fiducials, tooling holes, mouse bites, V-score), reading a ceramic capacitor's part number, and the words DNP / DNL /
NC, XY file, via plugging.

## Not in this phase

- Panels whose boards are turned or mirrored within the array are cut on the first board only; the others are not
  compared with it.
- Pad designators (X2) do not survive the cut-out of a panel; a panel from a CAM station does not carry them.
- No change to matching against distributors.

## Checks

- Unit tests for every reader with made-up files of the same shape; the whole unit suite, typecheck, lint.
- End-to-end: upload a workbook of this shape with a panel zip, map, and land on the footprint match.
- The customer's own two files through the readers and through the app on the test database.

## Outcome

Built as planned, in three steps (Gerbers, the workbook, the checks and screens), plus two things found on the way:

- `parseDescription` read upper-case units wrongly: "100PF" came out as 100 farads and "7.2MH" as megahenries, and
  "0.1MICROF" was not read at all. Fixed; this also lets such lines match by value.
- The 3D assembly view drew not-fitted parts as if they were on the board. They are now faint ghosts. A crystal's
  library name that carries its size ("…2016") and a leadless name with its pad count ("LGA24") give a body of
  the right size.

On the customer's own files (through the readers, and through the app on the test database): the workbook's eight
sheets are named, 20 placements and 6 not-fitted designators are read, the bare board's line gives the spec, and
the checks find a 10 V part where the description asks for 50 V, two part numbers with characters missing, and two
values that differ between the BoM and the design file. The Gerber zip is recognised as a panel of 36 boards
(6 × 6) and one board is drawn.

Checked: typecheck, lint, 590 unit tests (the new ones on made-up files of the same shape), and the whole
end-to-end suite on the test database (28 tests, one of them a made-up job pack with a panel zip).

Not done: bodies for library names the catalogue does not know are still sized from the name, not from the pads on
the board; a placement report measured from another origin than the Gerbers is not shifted to fit.
