---
name: ems-part-analysis
description: Deep analysis of electronic parts and BoMs in this EMS Sourcing platform — availability in sourcing order (our stock → authorised distributors → marketplace), part risk (lifecycle, supply, lead time, alternates, price trend, counterfeit exposure, RoHS/REACH, age), BoM readiness with prioritised actions, cost Pareto, box fit and the manufacturing route. Use when asked to analyse or compare an MPN, judge whether a part is safe to design in or buy, explain what blocks a BoM or build, or produce a sourcing/readiness report — e.g. "deep analysis of LM358DR", "what's blocking GW-200?", "is this BoM ready to quote?", "where does the money go on MC-48V?".
---

# EMS part & BoM deep analysis

Answer from this platform's own data, the way a sourcing lead reads a DigiKey/Octopart page and a BoM health report. Never invent stock, prices, lead times or lifecycle states — report only what the analyser returns.

## 1. Get the facts

The local database must be running (`npm run db:local` in another terminal). Then:

```bash
npm run -s analyse -- part <MPN or part id> --json
npm run -s analyse -- bom <project code | BoM name | revision id> --json
```

(`-s` keeps npm's banner out of the JSON.)

- `part` → identity, availability by tier (`ours`, `suppliers`, `marketplace.excess`, `marketplace.brokers`), `risk` (score, level, factors with reason + action, judged at 1,000 pcs), 90-day `priceTrendPct90d`, approved `alternates`.
- `bom` → `verdict`, `coverage` (lines by first tier that covers them), `distribution` (risk mix), `actions` (already prioritised: red blockers first, then amber, most money first), `topRisks`, `pareto` (cost drivers), `longestLead`, `compliance`.
- Drop `--json` for a readable summary. The command only reads the database: no distributor calls, no writes.
- If a part isn't in the catalogue, say so and point the user to **Parts catalogue → Search distributors** (`/parts/market`: live DigiKey/Mouser search with "Add to catalogue"). Don't call distributor APIs yourself unless the user asks — every call spends daily quota.

## 2. Read it correctly

- **Sourcing order** is fixed: 1 our stock (stores + consigned) → 2 authorised distributors / manufacturer → 3 marketplace (customers' excess, then brokers). Broker stock is never "safe" stock: it needs inspection and test.
- **Part risk**: each factor scores 0–100 (higher = safer); ≥ 70 green, ≥ 40 amber, below red. Overall = weighted average (lifecycle 25 %, supply 20 %, lead time, alternates, counterfeit, compliance, age 10 % each, price 5 %), capped at the worst factor + 40 — one bad factor can't hide behind good ones. Factors come back weakest first; the first one is the headline.
- **Price trend** only compares like with like (same seller, currency, live vs simulated) over 90 days; `null` means not enough history — say so, don't guess a trend.
- Offers marked `simulated: true` come from the mock market (no live keys yet). Call them out; never present them as real quotes.
- **BoM verdict**: red = at least one blocker (unmatched lines, end-of-life parts, lines no source can cover, non-RoHS parts, a board that doesn't fit its box); amber = watch-outs only; green = ready.
- Money is INR unless the user chose USD/EUR; `toBuy` is landed (freight + duty, at MOQ/pack sizes), so it can exceed the parts cost.

## 3. Report

Lead with the answer, then the evidence:

1. **Verdict in one line** — e.g. "GW-200 rev B is not ready: 2 end-of-life parts block it; 6 watch-outs."
2. **What to do first** — the numbered actions as returned (keep their order), each with the affected MPNs/RefDes and the money at stake.
3. **Evidence** — availability per tier with quantities, the weakest risk factors with their reasons, lead time, price trend, alternates.
4. **Links** into the app for the user to act on:
   - part page `/parts/<partId>` (tiers, price breaks, risk, alternates, datasheet)
   - BoM report `/boms/<revisionId>/analysis`, process route `/boms/<revisionId>/route`
   - 3D `/boms/<revisionId>/viewer` (add `?step=<route step key>` to light up the parts a process step handles)

Keep it short and concrete: numbers, part numbers, next steps. Use green/amber/red words, not just colours.

## 4. Changing the analysis

The logic is pure, tested TypeScript — change it there, not in pages:

| What | Where | Tests |
|---|---|---|
| Part risk factors and weights | `src/lib/part-risk.ts` | `tests/unit/part-risk.test.ts` |
| BoM readiness, actions, coverage, Pareto | `src/lib/bom/deep-analysis.ts` | `tests/unit/deep-analysis.test.ts` |
| Price trend rules | `src/lib/price-trend.ts` | `tests/unit/price-trend.test.ts` |
| Box fit, wall openings, box-build kit | `src/lib/board/box.ts` | `tests/unit/box.test.ts` |
| Manufacturing route per product | `src/lib/ops/route.ts` | `tests/unit/route.test.ts` |

Server wiring: `src/server/deep-analysis.ts` (BoM), `scripts/analyse.ts` (CLI). Run `npm test` after any change. Keys live only in `.env`; never print them.
