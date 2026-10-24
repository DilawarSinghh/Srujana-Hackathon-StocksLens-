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

> Phases 1–12 add the database, auth, data pipeline, scoring, pages, filings
> ingestion, chat, portfolio, methodology, and deployment. This README grows
> with each phase.
