# Phase 46 — BoM validation tool

## Why
The SoW's "BOM Validation Tool": validate a customer's BoM and design files before production, with no purchasing.
A quick client-side mock-up (/validation, CSV only, nothing saved, availability typed by hand) is replaced by a tool
built on what the app already reads: the BoM, the pick-and-place / CPL file, the Gerbers' copper and silkscreen,
the catalogue and the distributors.

Decided with the user (25 Nov):
- false call = a check's flag that is not a real problem; a reviewer marks each flag **accepted** (a waiver, with
  a reason) or **prohibited** (must be fixed before production);
- visibility = how visible the part is in the market: how many distributors list it, with stock, and its lifecycle;
- competitor list = the customer's competitors (makers) whose parts must not be used: a BoM line using one is
  prohibited unless a reviewer accepts it as a false call (a name clash, say).

## What
1. **Uploads**: BoM + CPL / centroid (+ Gerbers when there are any) through the existing upload; the validation
   page links there and lists the BoMs to validate. CPL formats read: JLC / EasyEDA, Altium, KiCad .pos, Allegro.
2. **Checks** (`src/lib/validation/checks.ts`, pure), per designator or per line:
   - footprint — BoM package vs the CPL's footprint name vs the copper under the part (Phase 24 / 44 / 45 checks);
   - pin count — pins the BoM's part has (package, description, catalogue) vs pads on the copper vs the footprint
     name's count;
   - placement — designators in the BoM and not placed, placed and not in the BoM, off copper;
   - availability — authorised stock against the build's need, lifecycle (EOL / NRND / obsolete);
   - visibility — distributors listing the part (DigiKey, Mouser, Newark, element14, LCSC …): none, one, several;
   - competitor — the line's maker (BoM text or matched part) on the customer's competitor list.
3. **Calls** (`ValidationCall`): every flag can be marked accepted (with a reason) or prohibited; the report says
   what is open, accepted and prohibited. A BoM is "ready" when nothing is open or prohibited.
4. **Competitor list** (`CompetitorMaker`, per customer): add by hand, paste a list, or upload a CSV / Excel file;
   names and aliases matched case- and punctuation-blind.
5. **Distributors**: new adapters behind the existing interface — element14 Product Search API for **Newark**
   (store `www.newark.com`) and **element14** (store `in.element14.com`, configurable), and **LCSC**
   (`ips.lcsc.com`, partner key + secret). Keys from .env; the mock market adds Newark so everything works without
   keys. The validation page shows each line's stock per distributor from the offers already refreshed.
6. **Consumables** (`Consumable`): a register of solder paste, flux and stencils (spec, quantity, expiry, location,
   which board a stencil is for); per BoM, what the build needs — stencils per side, paste type and grams per board
   from the measured paste area, flux for through-hole and rework — against what the register holds. No ordering.
7. **No purchasing**: the validation pages have no cart, order or RFQ actions. CSV export of the report.

## Verified
- Unit: `tests/unit/validation-checks.test.ts` (pins from names and descriptions, TO-220AC, heatsinks, exposed pads,
  competitor list parsing and whole-word matching, guessed matches ignored, every check, calls and readiness, CSV),
  `tests/unit/validation-consumables.test.ts` (units, powder, stencils per side and board, in-date paste, flux,
  alerts), `tests/unit/distributors-e14-lcsc.test.ts` (element14 URL and documented response shape, LCSC signing
  and defensive parsing). Full suite: 1,002 passed; tsc and eslint clean. Database matches the schema (no drift).
- Browser (dev server): /validation lists the BoMs, competitor lists and the register; the med BoM and TYPE7
  validate. On TYPE7: accepting C5 with a reason moved it from open to accepted; adding Murata to the customer's
  competitor list made its 3 Murata lines prohibited (after the fix, an unconfirmed match no longer counts); undo
  restored both; the CSV export downloads the flags with their calls.

## Open
- Live distributor data needs keys: element14 (serves Newark and element14), LCSC (key + secret). Until then the
  mock market answers for all five, marked "simulated" on the page.
- LCSC: the public API page documents the search endpoint and its parameters but not the signing recipe or the
  response fields; the adapter's recipe and field names must be confirmed against LCSC's documents with a key.
- element14: the docs give no currency in responses; the store's currency is assumed (Newark USD, India INR).
- Most med BoM lines are not matched to catalogue parts yet, so visibility shows "not matched" for them; matching
  them (or live keys) fills the distributor columns.
- Neon (production) needs migrations 20261123120000 and 20261125120000 before a deploy.

## Also: BoM + board files go straight to the footprint match
- Upload: a BoM uploaded with its Gerbers (or a quick look's board, or a pick-and-place file) skips the mapping page
  and opens the footprint match with the columns the reader took, unless they cannot be used at all (nothing to
  match a line by, no quantity or designators). The columns stay one click away there ("Check columns").
- A BoM uploaded on its own stops at the mapping page when its columns are unclear; that page now takes the board
  files, and adding them matches the lines with the columns as read, places the parts from the silkscreen and opens
  the footprint match (it used to send such a BoM back to the mapping page).
- Checked in the browser with the THINKSEMI BoM and its Gerber zip: together → footprint match, 53 lines, 139 of
  139 parts placed; a CSV of the same BoM with vague headers alone → mapping page → Gerbers added there → footprint
  match, 53 lines, 139 placed. The test BoMs were deleted afterwards.
- BoMs uploaded before: opening one that is still at its mapping page with its board files on file and usable columns
  matches it with the columns as read and opens the footprint match (`src/server/auto-match.ts`, called from the step
  pages' guard); the BoM list opens a BoM with board files on its footprint match.
- The same file uploaded again under the same BoM and revision is no longer refused: the existing revision opens
  (board files sent with it are kept when it has none), on its footprint match. A different file under a revision
  label already used is still refused, with the file it came from named.
- Checked in the browser: DGRG (saved at mapping with its Gerbers) opened on the footprint match with its 16 lines;
  gfbh (no designator or quantity column) stays at mapping; the THINKSEMI file uploaded again opened its existing
  revision's footprint match and made no copy; TYPE7's card in the BoM list links to its footprint match.
