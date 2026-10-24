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

## Google OAuth setup (Phase 2)

Authentication is Google sign-in via Supabase Auth (`@supabase/ssr`).

1. **Google Cloud Console** → *APIs & Services* → *Credentials* → *Create
   Credentials* → *OAuth client ID* → application type **Web application**.
2. Under **Authorized redirect URIs**, add your Supabase auth callback:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
3. Copy the generated **Client ID** and **Client secret**.
4. **Supabase** → *Authentication* → *Providers* → **Google** → enable it and
   paste the Client ID and Client secret → save.
5. **Supabase** → *Authentication* → *URL Configuration*:
   - **Site URL**: `http://localhost:3000` for local dev.
   - **Redirect URLs**: add both `http://localhost:3000/**` and your deployed
     Vercel URL (e.g. `https://stocklens.vercel.app/**`).
6. Set `NEXT_PUBLIC_SITE_URL` in `.env.local` to match the environment
   (localhost for dev, the Vercel URL in production).

### How the flow works

- `/login` renders a single **Continue with Google** button that calls
  `supabase.auth.signInWithOAuth({ provider: 'google' })` with
  `redirectTo = NEXT_PUBLIC_SITE_URL + '/auth/callback'`.
- `/auth/callback` exchanges the `code` for a session, then redirects to the
  `next` param or `/`. On error it redirects to `/login?error=...`.
- `middleware.ts` refreshes the session on every request and protects
  `/portfolio` (redirecting signed-out users to `/login?next=/portfolio`). Home,
  stock pages, methodology, and login stay public. Chat requires login,
  enforced in the API and UI (Phases 8–9).
- Header shows **Sign in** when logged out, or an avatar + name dropdown
  (Portfolio, Sign out) when logged in. Helpers: `getCurrentUser()` (server),
  `useUser()` (client).

## Market-data pipeline (Phase 3)

The data pipeline runs as `tsx` scripts that read from Yahoo Finance and write
to Supabase. **External APIs are never called from the browser** — scripts fill
the database; pages read it.

Scripts load env from `.env` (and `.env.local` if present), so make sure
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set before running.

### 1. Seed the universe

```bash
pnpm seed
```

- Upserts 15 demo NSE stocks (`src/config/universe.ts`), chosen for **sector
  diversity, NOT as recommendations**. `yahoo_symbol = SYMBOL + ".NS"`.
- Also loads `data/governance_seed.csv` into `governance_inputs` **if it has
  data rows**. The CSV ships with only a header — fill it yourself from BSE/NSE
  shareholding patterns and annual reports, because Yahoo lacks pledge/auditor
  data. Columns:
  `symbol,as_of,promoter_holding_pct,promoter_pledge_pct,promoter_holding_change_1y,fii_pct,dii_pct,public_pct,auditor_opinion,related_party_trend,source_note`

### 2. Fetch market data

```bash
pnpm fetch
```

Per active stock (1s delay between stocks, to respect Yahoo rate limits):
- Upserts ~5 years of daily price history (incremental after the first run).
- Upserts annual fundamentals, converted to **INR crore** in one documented
  function (`toCrore`).
- Computes and upserts `stock_metrics` via pure functions in
  `src/lib/data/metrics.ts`: ROE, ROCE (with fallback), operating margin,
  debt/equity, interest coverage, 3y/5y revenue & profit CAGR, PEG, 1y
  volatility, 3y max drawdown, beta vs `^NSEI`, 52-week high/low, P/E, P/B,
  dividend yield, market cap.
- **Never defaults or invents values** — missing data is stored as `NULL`.
- Prints a final table: `symbol, status, number of NULL metrics`.

> **Yahoo rate limits:** some shared/cloud IPs get "Too Many Requests". The
> wrapper retries with exponential backoff (longer for rate limits). If you hit
> persistent throttling, run from a residential IP or re-run later. The nightly
> GitHub Action (Phase 12) runs this on a schedule.

## Scoring engine (Phase 4)

The **Fundamental Score (0–100)** is a weighted sum of six pillars, computed
entirely in code (`src/lib/scoring/`) — the LLM is never involved.

```bash
pnpm score
```

| Pillar | Weight | Metrics (direction) |
| --- | --- | --- |
| Profitability | 25 | ROE, ROCE, operating margin (higher better) |
| Growth | 20 | revenue CAGR 3y/5y, profit CAGR 3y/5y (higher) |
| Financial health | 20 | debt/equity (lower), interest coverage (higher), OCF/net profit capped at 1.5 (higher) |
| Valuation | 15 | P/E vs sector median (lower), PEG (lower, only if growth > 0) |
| Governance | 10 | rule-based (pledge, auditor, related-party, promoter-holding change) |
| Stability | 10 | 1y volatility (lower), 3y max drawdown (lower) |

**Method:**
1. Each metric is **percentile-ranked within the stock's sector** (0–100,
   flipped for lower-is-better). Fewer than 4 peers with a metric → fall back to
   the whole universe and flag `low_peer_count`.
2. Pillar score = average of available metric percentiles. **Banks/NBFCs** skip
   debt/equity and OCF metrics and renormalize.
3. **Governance** (average of available sub-scores; `unknown` skipped): pledge
   0%→100, ≤10%→80, ≤30%→40, >30%→0; auditor unqualified→100, else→0;
   related-party stable→100, rising→50, sharply_rising→0; promoter-holding
   change worse than −5 pts→30, else→100.
4. **Missing data:** null metrics dropped and renormalized; a fully missing
   pillar has its weight redistributed proportionally. `data_confidence =
   available / expected` metrics.
5. **Red-flag caps** (only when data exists): pledge > 30%; negative OCF in the
   3 latest consecutive years; auditor qualified/adverse/disclaimer;
   related-party sharply rising. Any trigger caps `total_score` at **40** and
   records `{code, title, explanation, value}`.
6. **Labels:** ≥70 "Strong", 40–69 "Average", <40 "Weak". `data_confidence <
   0.6` → "Limited data".
7. **Explanations:** deterministic plain-English sentences per pillar built from
   the numbers (no LLM).
8. `formula_version = "v1.0"`. Weights live in `src/lib/scoring/constants.ts`
   (also used by the methodology page in Phase 11).

`pnpm score` loads all stocks with metrics, fundamentals, and latest governance,
scores sector by sector, inserts into `scores`, and prints a ranked table.

## Home page (Phase 5)

The home page (`/`) is a server component that reads stocks + `stock_metrics` +
`latest_scores` from Supabase (ISR `revalidate = 900`). It renders dynamically
per request (no browser-side first-render fetch of market data).

- **Hero + search**: `SearchBar` calls `GET /api/search?q=` (zod-validated,
  1–40 chars, ILIKE over symbol/name backed by the pg_trgm indexes, up to 8
  results). Debounced 250ms, keyboard navigation (↑/↓/Enter/Esc), click →
  `/stocks/[symbol]`.
- **Category tabs** (URL params `?tab=&sector=`): Large/Mid/Small Cap, Low Debt
  (D/E < 0.5), High Dividend (yield > 2%), Growth (sorted by the growth pillar),
  plus a sector filter.
- **Ranked `StockCard`s** by total score (Growth tab by growth pillar): name,
  symbol, sector, price, 1-day change, `ScoreBadge` (green Strong / amber
  Average / red Weak), a red-flag icon with tooltip when capped, and a "Limited
  data" badge (those stocks sort last).
- Heading "Top-scored by fundamentals" with a "How is this calculated?" link to
  `/methodology`, plus `DataFreshness`. Skeleton (`loading.tsx`), empty, and
  error states included.

## Stock detail page (Phase 6)

`/stocks/[symbol]` is a server component (ISR `revalidate = 900`, `notFound`
for unknown symbols, `generateMetadata`). Main content on the left, a sticky
chat slot on the right (placeholder until Phase 9).

- **Header**: name, symbol, exchange, sector, price, day change, `ScoreBadge`,
  and an "Open in your broker" dropdown (Groww, Zerodha, Upstox, Angel One)
  opening each broker's public site in a new tab (`rel="noopener noreferrer"`),
  from `src/config/brokers.ts`. Text: "You place orders on your broker. We
  never handle your money." No order API.
- **PriceChart** (lightweight-charts area chart): 1M/6M/1Y/5Y ranges, crosshair,
  theme-aware, labeled "Delayed data".
- **Key stats**: market cap, P/E, P/B, ROE, ROCE, D/E, dividend yield, 52-week
  range, beta ("Not available" for nulls).
- **ScoreBreakdown**: six pillar bars (score + weight), total, label, "why"
  sentences from `scores.explanations`; "Score capped at 40" note when capped.
- **RedFlagsBox**: triggered flags, or "No red flags detected in available
  data" with an incompleteness note.
- **FinancialsChart** (recharts): 5y revenue, net profit, operating margin,
  debt — chart/table toggle.
- **ShareholdingChart**: promoter/FII/DII/public, or "Not available".
- **Peer table**: up to 4 same-sector stocks (score, P/E, ROE, D/E) linking to
  their pages.
- `Disclaimer`, `DataFreshness`, plus `loading.tsx` and `error.tsx`.

## Filings ingestion (Phase 7)

Ingest company filing PDFs so the chat (Phase 8) can answer from them with page
citations.

### Prepare the files

Place PDFs under:

```
data/filings/<SYMBOL>/<doc_type>_<FY>.pdf
# e.g.
data/filings/TCS/annual_report_2025.pdf
data/filings/RELIANCE/annual_report_2025.pdf
```

- `<doc_type>` may contain underscores (e.g. `annual_report`); the trailing
  `_<FY>` (4-digit year) is required.
- Download annual reports from the **company investor-relations page** or
  **BSE/NSE** ("Financial Results" / "Annual Reports"). PDFs are gitignored.
- The public `filings` Storage bucket must exist (created in Phase 1 migration
  `0006`, or via Storage → New bucket → `filings` → Public).

### Run

```bash
pnpm ingest
```

For each PDF the script:
1. Computes a sha256 and **skips if already ingested** (idempotent).
2. Extracts text page by page with `pdfjs-dist` (true 1-based page numbers),
   skipping near-empty pages and warning on likely-scanned pages.
3. Detects the section per page (MD&A, Auditor's Report, Balance Sheet, Notes,
   Directors' Report, Corporate Governance, Risk Management) and carries it
   forward.
4. Chunks ~800 tokens with 100 overlap, without crossing page boundaries;
   marks number-heavy chunks `has_table`.
5. Embeds `header + content` (header = `[Company | doc_type | FY | section |
   Page n]`) with `GEMINI_EMBED_MODEL` at `EMBED_DIMENSIONS`, in batches of 50;
   stores the **clean content** (no header).
6. Uploads the PDF to the public `filings` bucket and saves the URL +
   storage path.
7. Inserts `filings` + `filing_chunks`; prints a per-file summary.

### Test retrieval

```bash
pnpm tsx scripts/test-retrieval.ts RELIANCE "What are the key risks?"
```

Embeds the question, runs `match_filing_chunks` (top 8, drops similarity <
0.5), and prints the top chunks with section + page. The reusable retrieval
helper is `src/lib/rag/retrieve.ts`.

## Chat backend & guardrails (Phase 8)

`POST /api/chat` — filings-grounded answers with hard guardrails.

Request (zod-validated): `{ symbol, message (1–1000 chars), history (≤10 of
{role, content}) }`.

Flow:
1. **Require login** (401 otherwise). **Rate limit** 20 user messages/rolling
   hour via `chat_messages` (429).
2. Look up the stock (404 if unknown).
3. **Intent guard** (`src/lib/rag/guardrails.ts`): if the message seeks advice
   (should I buy/sell/hold, good investment, will it go up/double, price
   target…), skip retrieval and return a deterministic refusal — "I can't tell
   you whether to buy or sell. That's your decision." + 2–3 neutral bullets
   from the score explanations/red flags + the disclaimer line.
4. Retrieve chunks (Phase 7) + a compact JSON **DATA** block (metrics, last 5
   annual fundamentals, latest score + red flags, latest governance).
5. If no relevant chunks and no data: "I couldn't find that in the available
   filings for this company."
6. **System prompt** (`src/lib/rag/prompt.ts`) with SOURCES labelled S1..S8 and
   the DATA block; includes the last 6 history messages.
7. Stream via `streamText` (Gemini `GEMINI_CHAT_MODEL`).
8. **Output guard** (`onFinish`): scan the final text for advice phrases; if
   found, persist the refusal instead; always ensure the disclaimer line.
9. Persist both user + assistant messages; attach cited-source metadata
   (`{id, doc, fiscalYear, page, section, snippet, url#page=N}`) for cited
   sources only.
10. Clean JSON errors for 400/401/404/429/500 (no stack traces).

### curl test

```bash
# You need a valid Supabase auth cookie; easiest is to test from the UI (Phase 9).
curl -i -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  --cookie "sb-access-token=...; sb-refresh-token=..." \
  -d '{"symbol":"RELIANCE","message":"Should I buy this?","history":[]}'
# -> streams the deterministic refusal (intent guard), never advice.
```

> Phases 9–12 add the chat UI, portfolio, methodology, and deployment. This
> README grows with each phase.
