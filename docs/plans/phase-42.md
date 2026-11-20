# Phase 42 — The app online on Vercel, on a Neon database

## Why
The user asked to deploy the app on Vercel with its environment variables set, and to start it with the data
from the laptop database.

## What
1. **Vercel project** `bomtool` (account `marketingkeyleer-sys`, Hobby), production at https://bomtool-two.vercel.app.
   Deployed from this folder with the Vercel CLI (`npx vercel@latest deploy --prod`); the GitHub repo is not
   connected for automatic deploys.
2. **Database**: Neon Postgres 17 from the Vercel marketplace (`bomtool-db`, Singapore `sin1`). Vercel sets
   `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (direct, for migrations).
   Tables made with `prisma migrate deploy`; every row of the laptop database copied in (47 tables, 12,484 rows,
   row counts checked table by table, foreign keys restored). Logins are the laptop's.
3. **Functions in Singapore** (`vercel.json` `regions: ["sin1"]`), next to the database. In Mumbai each query
   crossed to Singapore and a page with many lookups (the board quick look) ran out of pooled connections.
4. **Prisma on Vercel** (`src/lib/db.ts`): when `VERCEL` is set, `connection_limit=10` and `pool_timeout=30`
   are added to `DATABASE_URL` unless it already has them. The laptop is unchanged.
5. **Environment variables (production)**: `NEXTAUTH_URL` = the production address, a new `NEXTAUTH_SECRET`
   (sensitive, not the laptop's), `SCHEDULER=off` (a serverless function cannot keep the inline refresh timer
   alive), and the laptop's currency, sourcing, distributor-limit and assistant settings. Left out: `REDIS_URL`
   and Meilisearch (the cache falls back to Postgres), `SEED_USER_PASSWORD` (seeding only), empty API keys.
6. `.vercelignore` keeps `.env*`, the local database, build output, `.claude/` and the presentation videos out of
   the upload. `package.json` pins Node 24 (the laptop's) instead of Vercel's default 26.

## Verified
- Login as admin on the live site, BoMs (14), Lines & machines, PCB viewer, the board quick look.

## Open
- Price refresh does not run by itself online (`SCHEDULER=off`); a Vercel cron calling a refresh route would.
- Data entered online and on the laptop are now two separate databases.
- Distributor and Anthropic keys are empty on the laptop too, so the online app runs on the simulated market and
  the simulated assistant until keys are added in Vercel → Settings → Environment Variables.
