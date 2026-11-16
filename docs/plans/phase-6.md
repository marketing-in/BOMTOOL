# Phase 6 — Compliance, alerts, exports, revision diff, performance, docs

## Compliance (`/compliance`)
- Per BoM revision: RoHS (compliant / with exemption / non-compliant / unknown, exemption parts listed),
  REACH SVHC parts, conflict-minerals declaration coverage, ECCN lines that aren't EAR99, country of
  origin mix, HSN codes with the duty rate that applies and estimated duty for the build.
- CoC coverage: lots and excess/broker offers without CoC on the lines being built.
- HSN duty table editable by Quality/Admin (indicative rates; change log in the audit trail).
- Excel export of the full report.

## Alerts (`/alerts`, bell in the top bar)
- Market alerts from the refresh: price spikes/drops, stock-outs, lifecycle changes, new parts —
  acknowledge individually or all.
- Derived alerts, always current: short lines on open work orders, MSL bags under 24 h or expired,
  RFQs past their reply-by date, PO drafts waiting for approval.

## Exports
- BoM quote workbook (`/boms/[id]/export`): Summary (scores, totals, FX), Lines (all SoW columns +
  landed cost), Sourcing plan (allocation per source), Compliance — Excel.
- Printable quote page (`/boms/[id]/quote`) for PDF via the browser (same as PO drafts).

## BoM revision diff (`/boms/[id]/diff?against=`)
- Lines matched by RefDes: added, removed, MPN changed, qty changed, DNP changed; cost and score
  deltas at the build quantity.

## Performance
- Indexes for the hot queries (offers by supplier, BoM lines by part, placements by line, events by
  part); the BoM grid stays one analysis query per page view.

## Docs
- README (setup, scripts, architecture, what's live vs mock, API keys), `docs/user-guide.md` by role.

## Tests
Vitest: revision diff, compliance roll-up, export workbook shape. Playwright: compliance report +
export, alerts page acknowledge, revision diff, 3D viewer smoke test.

## Outcome (2026-10-24)
Compliance report per BoM revision with Excel export and an editable, audited HSN duty table
(rates indicative). Alerts page and top-bar bell merge market events (from the refresh) with derived
alerts (not clear to build, MSL bags running out, RFQs past reply-by, POs awaiting approval). BoM Excel
export, a printable quote page, and a revision diff by designator with score and cost deltas. Query
indexes added for the hot paths (offers by part, events by time, BoM lines by part). README and
`docs/user-guide.md` written.
