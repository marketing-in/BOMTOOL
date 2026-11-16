# User guide

Short, task-first guide by role. Everything is reachable from the left sidebar; the bell (top right)
shows alerts; the INR/USD/EUR switch changes every price on screen.

## Home and the BoM list

**Home** shows the day at a glance: three chips (lines running, urgent alerts, BoMs with lifecycle risk), four
figures, a **ring per line** (clear-to-build: the share of the work order's kit that is on hand), the newest BoMs
and the alerts that need attention.

Every BoM is drawn the same way on Home and under *Sourcing → BoMs*:

- its **own board in 3D**: the Gerber drawing on a tilted board with every part standing on it at its own height —
  chips with tin ends, ICs with leads and their part number, cans, shields, connectors (a line drawing until
  Gerbers and a pick-and-place file are uploaded);
- a **bar of its ten steps** — green done, amber needs a look, grey not started — and **Next**, which goes
  straight to the step it is waiting on;
- on the BoM list also the **five scores** as small bars (availability, resilience, quality, economic,
  sustainability) and the lines that carry lifecycle risk or wait for a review.

The name opens the BoM itself.

## One BoM, ten steps

Every BoM has a numbered strip on top and *Back* / *Next* at the foot of each page:

1. **BoM** · 2. **Gerbers** — on *Upload BoM* drop the customer's BoM and the Gerber files side by side (either
   one alone also works). Map the columns and press *Match & score*. Step 2 then shows the board **pulled apart,
   layer by layer**: the components on top, solder mask and silkscreen, each copper layer with the laminate
   between them, the bottom mask — every sheet the customer's own layer drawing. *Turn it in 3D* opens the
   interactive view; its **Layers** mode shows the components above the stack as well.
3. **Footprint match** — where you land after an upload. Each designator's package in the BoM is compared with
   the footprint on the board (`0603`, `C_0603_1608Metric` and `RESC1608X55N` count as the same). The ring shows
   the share that match; the board is drawn from the Gerbers with a dot on every part in its result's colour;
   only the problems are listed. When footprints do not match, *Next* becomes *Continue anyway*.
4. **Can we build it?** — the answer on top, beside the customer's own board (tap it for 3D). Then:
   - **Our machines**: each line is a lane of station icons; green takes this board, amber needs a check, red
     does not fit. Tap a station for its machine and the reason. The line to use for each job is marked.
   - **The whole process**: every step from bare board to dispatch as a chain of icons — round for a machine,
     dashed for hand work, square for bought in, a shield where a mask is needed. Tap a step for where it is done.
   - **AI process review**: press the button to have the order, masking, test and dispatch reviewed.
   - **Nine gates**: one row of numbered circles; the open gate shows its checks and the *Sign* button.
   - **The figures**: joints, solder paste, shifts, cost, the SMT line, consumables and spend against charge —
     each a folded bar with its headline number. Tap a bar to open its tables.
5. **Bare board** · 6. **Components** · 7. **Box** · 8. **Quote** — Build & quote, below.
9. **Process route** — the same chain of icons, then one row per step that opens to why this product needs it,
   its parts, its checks and *Show in 3D*.
10. **SMT line** — the board running through the line.

A small **ⓘ** beside a title or a figure holds the explanation: tap it to read, tap elsewhere to close.

### A customer's job pack

Customers who have built the board before send more than a BoM. The upload reads all of it:

- **A workbook with several sheets** is read whole. The mapping step shows one chip per sheet under *Read from the
  file*: the BoM (the sheet whose header reads like one, wherever it sits), the CAD tool's placement report, the
  load lists for each side and the not-fitted lists. The placement report gives every part its position and side,
  so no separate pick-and-place file is needed. Designators that are on the board and listed as not fitted are
  added to the BoM as not-fitted lines, and the 3D view draws them as faint ghosts over empty pads.
- **Two part numbers in one cell** ("A / B") are the part and its approved alternate. A part number written into
  the description counts too.
- **The bare board's line** ("PCB, FR4, 2 Layer, 1.6 mm, ENIG …") is not a component: its words fill the board's
  spec (layers, thickness, copper, finish, colours, size).
- **An engineer's checks** show as chips on the BoM's lines: the part number is read (value, voltage, size,
  tolerance, dielectric) and compared with the description. On *Footprint match*, a part whose value in the BoM
  differs from the value in the design file is marked *check by eye*, with both values.
- **Gerbers from a fabricator's CAM station** load with their two-letter names and no extensions (`tl`, `bs`,
  `ko`, `drl` …), and a drill file written as a Gerber is read as holes.
- **Gerbers of a whole panel** are cut down to one board. *Bare board* shows what the panel was: how many boards,
  its size, rails, tooling holes, fiducials and how the boards break off.

*Knowledge* explains each of these: *Reading a customer's job pack*, *Which Gerber file is which layer* and
*Reading a passive's part number*.

## Build & quote (a customer quote, step by step)

Steps 5 to 8 of a BoM, with a strip on top that shows what each step chose and what it adds per board. A Gerber
*quick look* (no BoM) already shows the bare-board prices; *Add the BoM* there carries its Gerbers into the new BoM.

1. **Bare board** — the board in 3D (layer stack), its figures as one strip of tiles (size, area, layers, thickness,
   copper, finish, mask, IPC class) and, folded under *In the directory*, where it sits in the Directory (PCB
   technology, laminate, finish). Then where it comes from: **our inventory** (bare boards of
   this design in stores), **PCB fabricators** and **online quick-turn** services, each with fit, lead and a landed
   price for every quoted quantity plus tooling. Prices are estimates from the board itself until the fab quotes —
   *Choose* a fab, then *Enter their quote* (₹ per board, tooling, lead) and it replaces the estimate. The cheapest
   fab that fits is suggested until you choose.
2. **Components** — on top, the four ways to source the whole BoM (our order, lowest price, shortest lead time,
   lowest risk) as cards with cost and longest wait as bars on one scale. Below, every BoM line with its cost per
   board and source. Pick a line for its full details: photo,
   datasheet, lifecycle, RoHS, REACH, MSL, package, need at this quantity (with attrition), the sources in sourcing
   order (*our inventory → channel partners → distributors → marketplace*) with unit and landed price at the need,
   price-break and price-history graphs, the eight-factor risk analysis, recorded alternates (*Use this* moves the
   line onto one) and where the parts sit on the board (*Show in 3D*). *Use* puts a source first for this quote; the
   rest of the sourcing order covers whatever it can't. What a part still lacks (datasheet, photo, RoHS, REACH, MSL,
   HSN) is listed — the nightly refresh fills it from the distributors, *Search distributors now* sooner.
3. **Box** — the product in 3D in the chosen box (the board alone when *Board only* is chosen), with a bar of the
   box-build kit (on the BoM, ships with the box, not on the BoM, machining, to check). All seven box types; per
   type the **catalogue boxes** (Hammond die-cast
   and extruded sizes) with fit (outline and height under the lid), stock *ours / partners / distributors /
   marketplace* and the price per quantity, and boxes **made to fit** by our box makers (sheet metal, extrusion,
   moulded — moulded and die-cast need a tool, the one-off cost). Connector cut-outs are priced in. *Board only* is
   a choice too. An enclosure line on the BoM is priced here, not with the components.
4. **Quote** — the price per board at each quantity (ex-GST), lot price, one-off costs (stencils, programmes,
   fixtures, PCB tooling, box tooling), GST and total; delivery in weeks. The bar chart splits a board's price into
   bare board, components, box, assembly, test, box build & packing, material handling and margin; the process list
   prices every step of the route on our lines (SMT time from the line's cph, set-up spread over the lot). The
   process list, the line-by-line cost table and the rates are folded, each under its headline figure. Change
   the quantities (*100, 500, 1k*), the client currency, validity and notes, and the **rates** for this quote (line
   rate, labour, test, margin …; defaults in `src/data/costing.ts`). *Issue quote* (purchasing) freezes the numbers
   under a number (CQ-2026-0001) and opens the client's copy — prices only, print or *Save as PDF*; *Excel* gives the
   client sheet, the internal costing and the lines. Issued quotes are listed; the draft keeps your choices for the
   next revision.

Fabs, online services and box makers marked “— sample” carry sample price levels: replace them with your vendors
and their quotes. Every estimate is labelled as one.

### Gerbers without a BoM

A *quick look* (Viewer → *Quick look at a board*) also lists the board's **components**, read from the best the files
offer: the component layer (Gerber X3), a pick-and-place file among the uploads, the designators on the pads (Gerber X2,
KiCad and Altium export them), or — when the files carry none of that — **guessed** from the pads, drills and
silkscreen (circuitflow's guesser): each solder-mask opening is a pad, pads are grouped into parts by pitch, rows and
silkscreen outlines, and named by footprint (0603, SOT-23, SOIC-8, QFN-48 + EP, DIP-28, header 1×8 …). The page shows
where they came from, the counts (parts, SMT placements per side, through-hole, pads), the parts on the 3D board, and
a table by footprint with what each is, the designators, the value or MPN when the files had them, and how many parts
in our catalogue — and our stores — come in that footprint.

*Quote this board* opens the BoM form with **Use the N components found on the board** chosen: no file needed. One
line per footprint (and value, when known) is matched like any upload, placed where the Gerbers put each part, and
opens in Build & quote. Gerbers carry no values or part numbers, so guessed lines start without a part: in step 2,
**Choose the part** lists the matcher's candidates, then the parts in our catalogue that fit the footprint (ours first,
then distributor stock and price) and a search (*10k 0603*, *LM358*; *Search distributors* for anything not in the
catalogue). *Use* takes the part for all of the line's places; untick designators first to give only some of them the
part — they become a new line and the rest wait for their own. It works the same for any BoM line without a part.

Guessing is geometry, not magic: two-pad parts can't be told apart (a resistor and a capacitor look the same), a
two-pin terminal block looks like a radial capacitor, and parts packed edge to edge with no silkscreen outline can
merge. Check the counts against the customer's drawing. A BoM upload with Gerbers that carry pad designators gets real
part positions even without a pick-and-place file.

## Purchasing / sourcing

*Sourcing* opens on what is to buy: four figures (to buy landed, lines to buy, short everywhere, market changes), a
bar of the spend by BoM, and the supplier data feeds as one row of chips. The refresh runs are folded at the bottom of the screen.

**Quote a new customer BoM**
1. *BoMs → Upload BoM*: drop the customer's Excel/CSV, choose customer, project, assembly name, revision
   and build quantity.
2. *Map columns*: check the detected columns (green chips = fields found). Tick *Remember this mapping*
   so this customer's next file maps itself. *Match & score BoM*.
3. The grid shows every line with stock, best and **landed** price, lifecycle and five scores. Use the
   chips *Red / not found*, *Needs review*, *Short*. Expand a line (▸) to pick another match candidate
   or see where each piece comes from (our stores → consigned → excess → distributors → brokers).
4. Not found? Expand the line → *Search distributors* — the part is created from the distributor's data.
5. *Refresh prices* pulls fresh offers for every part on the BoM (progress shows on the button).
6. *Excel* exports the quote workbook; *Quote* opens a printable page (Save as PDF).

**Buy what's short**
1. On the BoM: *Add shortages to cart* (or the cart icon per line; the gavel bids on excess stock).
2. *Sourcing → Cart*: adjust qty and preferred supplier, tick suppliers, *Create RFQ*.
3. On the RFQ: download each supplier's *Sheet*, send it; *Import* their filled sheet, *Enter* a quote by
   hand, or *From offers* for distributors with live data.
4. Compare landed cost per line (net of GST/IGST credit; green = best that covers the qty). *Award best
   landed* or pick per line → *Create PO drafts* → submit for approval (admin approves) → print/PDF.

**Vendors without an API**: *Sourcing → Price lists* imports their Excel/CSV (columns like `1+`,
`100+`, `@1000` become price breaks).

**A part is short, EOL or too expensive — find an alternate**
1. Expand the BoM line: *Alternates for …* lists the recorded alternates that are still buyable, with
   stock and price. *Use this* moves the line onto it (the original stays as a candidate, so you can
   switch back); a functional alternate flags the line for engineering review.
2. On any part page, *Suggested from parameters* compares every part in the same category value by
   value (✓ same, ↑ better, ? not listed) and says whether it is a drop-in, pin-to-pin (same package —
   check the pin-out for ICs) or functional (needs a footprint change). EOL and obsolete parts are never
   suggested. Engineering or purchasing can *Approve* one; it is recorded with your name and the date.

## NPI / engineering

- *Needs review* lines on a BoM: fuzzy and description-only matches — confirm or switch candidates.
- *Gerbers & centroid* on a BoM uploads fabrication files and the pick-and-place file; the *3D* viewer
  then shows the real board. Click any part for its BoM line, stock, price and alternates; *Colour parts
  by* worst score or lifecycle to see risk on the board; *PCB layers* explodes the stack-up; *Box-build*
  puts it in the specified enclosure and warns if it doesn't fit.
- *New revision* uploads rev B against the same BoM; *Diff* shows added/removed/changed designators,
  score and cost deltas.
- *Knowledge* opens on three picture cards (the dictionary, the application circuits, the 3D explorers), then the
  process players (PCB fab, SMT, THT, box-build — each drawn as a chain of its steps) and an article for every part
  family; part pages link to theirs.
- *Component dictionary* explains every kind of part and every machine on our lines: what it does, how
  it works, a typical application circuit with the part highlighted, key specs, how to choose one, what
  can replace it (rules, known equivalents linked to catalogue search, other kinds of part that do the
  job), assembly notes, pitfalls and buying tips — plus the matching parts in our catalogue with stock
  and price. Machine entries show where the station sits on the line, its sub-assemblies, maintenance
  intervals and the defects it causes or catches. Search by family ("TVS"), function ("reverse
  polarity") or a well-known part number ("AMS1117"); the parts search and every part page point to the
  right entry.
- *Application circuits* shows all reference circuits in one place.
- *3D explorers*: pull a 2- to 8-layer or HDI board apart, cut it open to see through, blind, buried
  and micro vias, switch the surface finish; open SOIC, QFN, BGA, flip-chip BGA and WLCSP packages
  (X-ray mould, cut-away); and look at the layers inside a silicon die. Click any layer for what it does
  and what it means for assembly.
- *Approve* on a parametric suggestion (part page) records an alternate; *Remove* (two clicks) takes a
  wrong one out. Both are audited and re-score the BoMs that use the part.
- *Parts catalogue* opens on the whole catalogue by lifecycle: a bar, and a count per lifecycle that filters the
  list when you pick it. *Browse categories* shows every category with counts and photos; a category opens
  with filters for maker, package and *In stock only*. *Search distributors* searches DigiKey and Mouser
  live (one call each per new search, reused for 15 minutes) and *Add to catalogue* creates the part with
  its offers in one click.
- A part page reads like a distributor's: photo, datasheet, MPN, brand, lifecycle, RoHS, REACH, MSL, then
  availability in three tiers in the order we source — *our inventory*, *supplier inventory* (price-break
  table, MOQ, lead, landed cost at 1k) and the *marketplace* (excess, brokers — inspect before use) — and a
  *Risk analysis*: eight factors, each with a reason and the next step.
- In the *3D* viewer, a clicked part shows its photo, datasheet, kind, risk for this build and the three
  supply tiers. The board renders on demand with studio light, a soft shadow and printed IC markings.
- *Box-build* opens on the finished product, closed, as the customer unpacks it. *Exploded* takes it
  apart (lid or top half, screws, end panels, standoffs); *X-ray* shows the board inside with every part
  clickable. The panel says whether it fits (outline and height under the lid), how the board mounts, and
  checks the box-build kit against the BoM — enclosure, standoffs, screws, feet, label, panel machining.
- *Process route* (in the viewer, and *Route* on a BoM) lists every step from bare board to packing,
  chosen from this BoM's parts and placed on our lines and machines. Pick a step and only the parts it
  handles stay solid on the board; *Show in 3D* on the route page does the same.
- *Viewer* → *Quick look at Gerbers*: drop a zip or the layer files of any board — no BoM needed — and see
  it in 3D; quick looks are kept and listed on the viewer page.

## Deep analysis

*Analysis* on a BoM answers "can we build it, and what first?": a verdict (blockers vs watch-outs), lines
matched, how much comes from our own stock and how much is buyable now, the longest factory lead, the
money still to buy, then a numbered action list — unmatched lines, end-of-life parts, lines no source can
cover, non-RoHS parts, box fit; then long-lead orders, NRND parts, single sources, often-counterfeited
parts, missing declarations, rising prices, box-build kit gaps and process watch-outs — each with the parts
affected and the money at stake. Below: the risk mix, where supply comes from, the riskiest lines by their
weakest factor, where the money goes, and the finished product and line watch-outs. The same analysis
runs in a terminal with `npm run analyse -- bom GW-200` (or `part LM358DR`).

## Supply chain of a product

Stock comes from four places, always tried in this order: **1 our inventory** (stores, consigned),
**2 channel partners & sourcing agents** (their stock lists, with lead days to us), **3 distributors online**
(DigiKey, Mouser … live when keys are set), **4 marketplace** (own/partner excess, then brokers).

- **Part page** — one section per tier. Partner and excess listings have *Bid* (your target price goes on
  the RFQ) and a chat button.
- **3D viewer** — the BoM sits beside the board: every line with its designators, how much is ours / at
  partners / online, RoHS and REACH. Pick a line and its parts light up on the board; click a part on the
  board and its line is marked. The part card shows the four tiers, compliance, the risk and FFF alternates.
  Without Gerbers the board is drawn from the BoM with an approximate layout.
- **BoM → Supply chain** — the whole product: **1 bare board** (its spec and the PCB fabricators whose range
  fits it — layers, thickness, finish, IPC class — with lead days), **2 components** by tier with RoHS,
  REACH, FFF alternates and risk, **3 box build** (the enclosure, the box makers that can supply and machine
  it, and the kit).
- **Sourcing → Seller chat** — one conversation per listing or RFQ. Record the seller's reply (phone,
  e-mail) with the tick box. Nothing is e-mailed from here.
- **PO draft → Order services** — book transport, finance, storage and test/inspection with their cost;
  the order total adds them to the landed estimate. Imports get a transport suggestion, broker stock a test.

The channel partners, fabricators and box makers that ship with the system are **samples** (names end in
"— sample", Hammond aside). `npm run vendors:sync` adds them to an existing database without touching
anything else; replace them with your approved vendor list.

## SMT line and the Directory

**BoM → SMT line** puts this board on a 3D production line — loader, paste printer, SPI, pick-and-place,
reflow, AOI, X-ray — and runs it: boards move along the conveyor, signal towers show each machine's state,
and the strip below gives takt, the bottleneck, boards per hour, first-board time and first-pass yield.
Press play (1×, 10×, 50×), change the number of boards or nozzles, and click any machine to watch its own
cycle with its process data (stencil apertures, paste volumes, the placement program, the reflow profile,
inspection results). The line is circuitflow's simulation: results are repeatable for this board, not
measurements from our machines.

**Directory** (sidebar) is everything a product can be made of, in build order:
1. **PCB** — 10 board technologies with the fabricators that can build each, 16 laminates (Tg, Td, Dk, Df,
   expansion, conductivity, cost), 10 surface finishes and 20 build features (copper, vias, mask, IPC class).
2. **Board types** — 61 kinds of PCBA with their sections, typical parts (with our stock) and review checks.
3. **Components** — 75 families covering every kind of electronic part (kinds, packages, defining parameters,
   makers, what matters on our line), 2,683 reference parts, and from each family our catalogue and a live
   search of every part the distributors list.
4. **Boxes** — 7 box types with our enclosures and the makers, 20 enclosure materials and 12 finishes.

A BoM's **Supply chain** page names its PCB technology, recognised board type and box type, each linking
into the Directory. No list holds every part in the world — the live distributor search reaches them.

## Planning

- *Operations* opens on the open work orders, each with its board in 3D and a ring of how clear it is to build.
- *Operations → Work orders*: pick a BoM revision and quantity → the work order shows **clear-to-build**,
  blocking lines, which line can build it (with reasons), feeder slots and estimated hours.
- *Schedule* (timeline or kanban) and *Schedule* on the work order to set line, start and days.
- *Lines* shows capability and capacity used for the checks.

## Stores

- *Inventory*: on top, a clock for every moisture-sensitive bag whose floor life is running — a ring of what is
  left, full red when it is used up. Search by MPN/bin/reel, filter *MSL bags open* / *Floor life < 24 h*. Per lot: open bag
  (starts the J-STD-033 clock), close into dry storage (pauses it), record a bake (resets it), adjust qty
  with a reason. *Receive stock* on the right.
- On a work order: *Reserve stock* (customer-consigned first, then shortest floor life, then FIFO by date
  code) → kitting list sorted by bin → *Issue kit to line* (opens MSL bags automatically).

## Quality / compliance

- *Compliance*: per BoM revision — RoHS (with exemptions), REACH SVHC, conflict minerals, ECCN, country
  of origin, HSN with duty, missing CoC. *Excel report* downloads it.
- The HSN duty table at the bottom is editable (indicative rates; every change is audited).

## Administrators

- *Admin → Users*: add a person (name, email, role, starting password; *Generate* makes a readable one),
  change a role (applies on their next click), *Set password* (signs them out everywhere), *Deactivate*
  (signs them out and blocks sign-in; history is kept; *Reactivate* undoes it).
- You can't deactivate or demote yourself, and there is always at least one active administrator.
- *What each role can do* on the same page lists every role's permissions. All changes are audited.

## Alerts

The bell counts red/amber alerts: price spikes, stock-outs, lifecycle changes (from the automatic price
refresh — hot parts every 4 h, everything nightly at 02:00 IST), work orders not clear to build, MSL bags
running out, RFQs past reply-by and POs awaiting approval. Market alerts can be acknowledged.
