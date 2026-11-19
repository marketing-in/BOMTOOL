# Phase 41 — Gerbers in a RAR; a railed frame is not a panel of tiny boards

## Why
The user's `Ti-Circle_v1.0_Final_Gerberpnl (2).rar` was refused: the upload only opened .zip, took the RAR for one
unknown file and reported "No Gerber, drill or centroid files" without a reason. Customers send .rar about as
often as .zip. With the RAR open, a second fault showed: the board came out 5 × 5 mm.

## What
1. **RAR archives are opened** (`src/lib/board/archive.ts`, `openArchives`) before the files are sorted, in all
   three upload paths (BoM upload, board files of a BoM, quick look). Same caps as a zip: hidden and oversized
   entries are left out, the whole may not unpack past the limit. A password-protected or damaged RAR says so.
   Library: `node-unrar-js` 2.0.2 (MIT, WebAssembly), added with the user's approval; loaded on first use and kept
   out of the bundle (`serverExternalPackages`).
2. **Other archives say what they are**: a 7-Zip or gzip archive is named in the error, whatever the file is called.
3. **Rails are not boards** (`src/lib/board/panel.ts`, `findGrid`): narrow cells at the ends of a frame cut by
   lines are its rails and are left out before the repeat is looked for. A single 130 × 130 mm piece in a 140 mm
   frame with 5 mm rails all round has four 5 × 5 mm corners: they were read as a 2 × 2 panel of 5 mm boards.

## Verified
- Unit: `tests/unit/board-upload.test.ts` (pass-through, a damaged RAR, the archive messages),
  `tests/unit/board-set.test.ts` (the railed frame is one board; the V-scored panel still reads 2 × 2).
- The real RAR through the app's quick look on the dev server: 15 files, 8 copper layers, 140 × 140 mm, the board
  drawn with its parts.

## Open
- The board is shown with its 5 mm frame rails (140 × 140 mm), not cut to the 130 × 130 mm piece inside.
- .7z is still not opened.
