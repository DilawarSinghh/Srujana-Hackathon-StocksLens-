# StockLens

Educational stock research for Indian retail investors. StockLens ranks stocks
by a transparent **Fundamental Score (0–100)**, shows a detail page per stock
(chart, ratios, financials, score breakdown, red flags), offers an AI chat that
answers **only** from a company's official filings with page citations, and
provides a portfolio tab with sector concentration, beta, and a market-drop
stress test.

> **Educational analysis only. Not investment advice. Prices are delayed.**
> StockLens never handles money or places orders. You trade through your own
> broker.

## Stack

- **Next.js 15** (App Router, TypeScript strict, `src/`)
- **Tailwind CSS 3** + **shadcn/ui** + **lucide-react**
- **lightweight-charts** (price charts), **recharts** (other charts)
- **Supabase** (Postgres, pgvector, Auth, Storage, RLS)
- Google OAuth via Supabase Auth with `@supabase/ssr`
- **Vercel AI SDK** (`ai` + `@ai-sdk/google`) with Gemini
- **yahoo-finance2** for NSE/BSE market data
- **zod** for all validation, **vitest** for tests, **tsx** for scripts
- Package manager: **pnpm**. Hosting: Vercel. Scheduled jobs: GitHub Actions.

## Prerequisites

- Node.js 20+ (works on 24)
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)
- A Supabase project (added in Phase 1)
- A Google Gemini API key (used from Phase 7/8)

## Setup

```bash
# from the project root (stock lens/)
pnpm install

# configure environment
cp .env.example .env.local   # for the Next.js app
cp .env.example .env         # for the tsx data scripts
# then fill in the values
```

### Environment variables

See `.env.example`. Validated by zod in `src/lib/env.ts`:

| Variable | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key |
| `NEXT_PUBLIC_SITE_URL` | public | Used for OAuth redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | server/scripts only | Never ship to the browser |
| `GOOGLE_GENERATIVE_AI_API_KEY` | server | Gemini key |
| `GEMINI_CHAT_MODEL` | server | e.g. `gemini-2.0-flash` |
| `GEMINI_EMBED_MODEL` | server | e.g. `text-embedding-004` |
| `EMBED_DIMENSIONS` | server | `768` |
| `FINNHUB_API_KEY` | server | optional |
| `CRON_SECRET` | server | protects scheduled endpoints |

## Scripts

```bash
pnpm dev      # start the dev server
pnpm build    # production build
pnpm lint     # eslint
pnpm test     # vitest (run mode)

pnpm seed     # seed the stock universe      (Phase 3)
pnpm fetch    # fetch market data + metrics  (Phase 3)
pnpm score    # compute fundamental scores   (Phase 4)
pnpm ingest   # ingest filing PDFs           (Phase 7)
```

## Project structure

```
src/
  app/            routes (home, stocks/[symbol], portfolio, methodology,
                  login, auth/callback, api/{chat,search,portfolio/stress})
  components/     UI + shared components (ui/ = shadcn)
  lib/            env, utils, and feature libs: supabase, scoring, rag,
                  portfolio, data
  config/         static config (site, brokers)
  types/          shared + generated database types
scripts/          tsx data pipeline scripts
supabase/
  migrations/     SQL migrations (Phase 1)
data/
  filings/        source PDFs (gitignored)
  governance_seed.csv
```

## Engineering rules

- External APIs (Yahoo, Finnhub, Gemini) are **never** called from the browser.
  Scripts fetch into Supabase; pages read from Supabase.
- No hard-coded API keys or model names — all via env vars.
- The LLM never computes scores, ratios, or portfolio math; code does.
- Missing financial data is stored as `NULL` and shown as "Not available".
- Indian money values are in INR crore; units are always shown (₹ Cr, %, x).

## Database (Phase 1)

SQL migrations live in `supabase/migrations/` and are numbered in apply order:

| File | Contents |
| --- | --- |
| `0001_extensions_and_profiles.sql` | `vector` + `pg_trgm` extensions, `profiles` table, auto-profile trigger |
| `0002_stocks_and_market_data.sql` | `stocks`, `price_history`, `fundamentals_annual`, `stock_metrics`, `governance_inputs` |
| `0003_scores_and_filings.sql` | `scores` + `latest_scores` view, `filings`, `filing_chunks` (HNSW), `match_filing_chunks()` |
| `0004_user_data.sql` | `portfolios`, `holdings`, `chat_messages` |
| `0005_rls_policies.sql` | Row Level Security on every table |
| `0006_storage_filings_bucket.sql` | public `filings` Storage bucket + read policy |

**Run the migrations** (choose one):

- **Supabase SQL Editor** — open each file in order and run it.
- **Supabase CLI** (recommended):
  ```bash
  supabase link --project-ref <your-project-ref>
  supabase db push          # applies everything in supabase/migrations
  ```
- **psql**:
  ```bash
  for f in supabase/migrations/*.sql; do
    psql "$SUPABASE_DB_URL" -f "$f"
  done
  ```

**Security model (RLS):** public reference/market data (`stocks`, `price_history`,
`fundamentals_annual`, `stock_metrics`, `governance_inputs`, `scores`, `filings`,
`filing_chunks`) is **read-only** for clients — no client write policies exist, so
only the service role (scripts/server) can write. `profiles` lets a user read and
update their own row. `portfolios`, `holdings`, and `chat_messages` are restricted
to `auth.uid()`; holdings are reachable only through a portfolio the user owns.

**Supabase clients** (`src/lib/supabase/`): `client.ts` (browser, anon key),
`server.ts` (cookie-based via `@supabase/ssr`), `admin.ts` (service role —
server/scripts only; throws if run in a browser). Database types live in
`src/types/database.ts`.

> Phases 2–12 add auth, the data pipeline, scoring, pages, filings ingestion,
> chat, portfolio, methodology, and deployment. This README grows with each phase.
