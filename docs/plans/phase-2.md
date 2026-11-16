# Phase 2 — Real distributor connections, continuous refresh, landed cost, cart → RFQ → PO

Goal: every price, stock figure and lead time in the app can come from live distributor APIs, stays
fresh on its own, is shown as a landed INR cost, and the buyer can go from a BoM's shortages to RFQs,
compared quotes and draft purchase orders.

## 1. Supplier adapters (`src/server/sourcing/adapters/`)
One interface, `SupplierAdapter.searchMpn(mpn) → AdapterPart[]` (part facts + offers per seller).

| Adapter | API | Auth | Default limits |
| --- | --- | --- | --- |
| `nexar` | Nexar Supply GraphQL `supSearchMpn` (Octopart data, many sellers) | OAuth2 client credentials, scope `supply.domain` | 30 calls/day (free plan is ~1,000 parts/month) |
| `digikey` | Product Information v4 keyword search | OAuth2 client credentials + `X-DIGIKEY-Client-Id`, locale IN/INR | 100/min, 900/day |
| `mouser` | Search API v1 part-number search | API key | 25/min, 900/day |
| `mock` | Deterministic market simulation + a small extra catalogue | none | unlimited |

- element14, Arrow, TME, LCSC, Robu, Evelta stay on mock or CSV price-list import this phase.
- Keys are read from `.env` only. An adapter with no key reports "not configured" and is skipped.
- `SOURCING_MOCK=auto` (default): the mock runs only while no real adapter is configured, so fake and
  real prices are never mixed silently. Every mock offer carries a visible "mock" badge.
- Real adapters are written against the published API schemas and unit-tested with recorded-shape
  fixtures. **They cannot be exercised live until keys are added** — the first real run is the
  acceptance test.

## 2. Cache, rate limits, FX
- Cache interface with Redis (when `REDIS_URL` answers) or Postgres `ApiCache` table fallback; TTL per
  call type (scheduled 6 h, on-demand 15 min).
- Token-bucket limiter per adapter (per-minute) + daily budget persisted in the cache.
- FX: `FX_API_URL` (e.g. open.er-api.com, no key) refreshed every 12 h, stored; `MOCK_FX` fallback.

## 3. Continuous refresh (`src/server/sourcing/refresh.ts`, `src/server/jobs/`)
- `refreshParts(partIds)` upserts offers, writes a daily price-history point per supplier, updates
  lifecycle, and records `SourcingEvent`s: price spike (≥ 10 %), stock-out, lifecycle change, new part.
- Schedules: **hot parts** (in BoMs / open work orders) every 4 h, **full catalogue** nightly 02:00 IST,
  plus on-demand buttons (part page, BoM page, sourcing overview).
- `JOBS_MODE=inline` (default here, no Docker): in-process scheduler started from `instrumentation.ts`.
  `JOBS_MODE=bullmq` (Docker Compose): BullMQ queue + `worker` service with repeatable jobs.
  Every run is logged in `JobRun`. BullMQ path is not testable on this machine (no Redis).

## 4. Landed cost (`src/lib/landed-cost.ts`)
Import: assessable value = CIF (FOB + freight + insurance 1.125 % when unknown) → BCD (by HSN) →
SWS 10 % of BCD → IGST 18 % on (AV + BCD + SWS). Domestic: GST 18 %. Shows INR per unit, the
breakdown, and GST/IGST that is input-creditable. Duty rates live in an editable `HsnDutyRate` table
seeded with **indicative** rates — buyers must confirm with the customs broker before quoting.
Standalone calculator page + landed column in the BoM grid, cart and quote comparison.

## 5. Cart → RFQ → quotes → compare → PO drafts (`/sourcing/...`)
- BoM grid actions go live: Add to cart (shortfall qty, best source), Bid on excess (target price),
  **Add all shortages to cart**, **Refresh prices**, **Search distributors** for not-found lines
  (creates the part from the distributor result, then re-matches and re-scores).
- Cart grouped by supplier with landed totals; edit qty / supplier; create RFQ for chosen suppliers.
- RFQ: per-supplier Excel export (the supplier fills prices in the same sheet) and import back;
  manual quote entry; "quote from live offers" for API distributors.
- Compare matrix: landed INR per line × supplier, best highlighted, award per line (default best
  landed that covers the qty), totals per supplier → **PO drafts** grouped by supplier with cost
  breakdown; printable PO page. Nothing is emailed to suppliers from the app in this phase.

## 6. Supplier price-list import (`/sourcing/price-lists`)
CSV/Excel from our own vendors or Indian distributors without APIs: auto-detected columns (MPN,
manufacturer, stock, MOQ, SPQ, price-break columns like `1+`/`100+`, currency, lead time, date code)
→ offers with `source = "price-list"`.

## 7. Sourcing overview (`/sourcing`)
Adapter status and today's usage, last refresh runs, shortages across active BoMs, events feed,
cart and open RFQs.

## Tests
Vitest: landed cost, duty lookup, limiter, cache (Postgres + ioredis-mock), each adapter's response
parser, mock determinism, price-list column detection, refresh event detection.
Playwright: BoM → add shortages to cart → RFQ → enter quote → compare → PO draft.

## Outcome (2026-10-24)
Done as planned, with two limits stated plainly:
- **Live distributor data is not yet verified.** `.env` has no Nexar/DigiKey/Mouser keys, so the
  adapters are tested against fixtures shaped like the published API responses, and the mock market
  stays on (`SOURCING_MOCK=auto`). The first `npm run sourcing -- refresh hot` with real keys is the
  acceptance test.
- **BullMQ is untested here** (no Redis/Docker on this machine). The inline scheduler runs the same
  jobs and is what was verified.

Verified: live FX from open.er-api.com (USD ₹94.90, EUR ₹106.27 on the day); a hot refresh of 61 parts
wrote 326 offers, 26 market events and re-scored 3 BoMs in about 9 s; Postgres cache fallback when Redis
is unreachable; cart → RFQ → supplier sheet export/import → landed comparison → award → PO drafts →
approval → print. Bug found by the e2e flow and fixed: the RFQ workbench kept stale awards after a
server refresh, which left "Create PO drafts" disabled.
