# Phase 34: machine knowledge, and a new multi-colour look

## Ask

- On the lines, give every machine its knowledge: what chips it can place, the year of the design, everything we know.
- The UI should be visual, simple and light on text, on every page. No blue; many colours. It should feel made by a person.
- Machines are shown as 3D models.

## Decisions (asked on 17 Nov 2026)

- Facts our sheets do not give come from the maker's published data and are marked "maker data, verify". Our sheet wins where both exist.
- Roll-out: the shell and the Lines & machines page first, for approval; then every other page.

## Machine knowledge

- `src/knowledge/machine-models.ts`: one profile per model (25): launch year, one line, placement range, board limits, key figures, strengths, limits, links, confidence. Every figure is tagged `sheet` or `maker`.
- `src/lib/ops/package-reach.ts`: for a placer, a ladder of 17 package families (01005 to odd-form), each yes / check / no with the reason. Unknown limits give "check", never "yes".
- `src/lib/ops/machine-card.ts`: what the page shows for one machine: our record first, then the profile.

## Look

- Tokens in `src/app/globals.css`: warm paper, dark ink, no blue. `--part` is the current part's colour, set by `data-part` on `<html>` from the menu (`part-nav.tsx`): BoM pink, Engineering purple, Supply green, Factory orange. `--primary` follows it.
- Type: Bricolage Grotesque for headings and big numbers, Hanken Grotesk for text.
- Each kind of machine has one colour (`KIND_COLOR`).

## Lines & machines page

- One line at a time (`?line=L2`), chosen with pills.
- The line in 3D (`line-3d.tsx`, react-three-fiber): box-built models per kind, numbered in flow order; click to select.
- Beside it the machine's sheet (`line-stage.tsx`): name, kind, year; up to four big figures; the package grid with footprint drawings; good at / watch out; all figures behind a fold; edit limits.

## Still to do

- Carry the look and the fewer-words rule to every other page.
- The logo file is still blue.
