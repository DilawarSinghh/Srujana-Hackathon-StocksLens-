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
- **Vercel AI SDK** (`ai`) with a provider-agnostic chat chain across Groq
  (`@ai-sdk/groq`), Hugging Face (`@ai-sdk/openai-compatible`) and Gemini
  (`@ai-sdk/google`); embeddings stay on Gemini
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
| `GEMINI_CHAT_MODEL` | server | e.g. `gemini-2.0-flash` (final fallback) |
| `GEMINI_CHAT_MODELS` | server | optional, comma-separated ordered Gemini fallback chain; used only when `LLM_CHAT_CHAIN` is unset |
| `GEMINI_EMBED_MODEL` | server | e.g. `text-embedding-004` (embeddings stay on Gemini) |
| `EMBED_DIMENSIONS` | server | `768` |
| `LLM_CHAT_CHAIN` | server | optional multi-provider chain, e.g. `groq:<model-id>,huggingface:<model-id>,google:<model-id>` |
| `LLM_AUDIT_MODEL` | server | optional `provider:model` for the fact-audit call |
| `GROQ_API_KEY` | server | Groq key ([console.groq.com](https://console.groq.com)) |
| `HUGGINGFACE_API_KEY` | server | HF token ([huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)) |
| `HUGGINGFACE_BASE_URL` | server | OpenAI-compatible router URL, e.g. `https://router.huggingface.co/v1` |
| `RAG_TOP_K` | server | chunks per answer (default `5`) |
| `RAG_MAX_CONTEXT_TOKENS` | server | approx context budget in tokens (default `6000`) |
| `SEARCH_PROVIDER` | server | `tavily` or `brave` (enables the Web Research tab) |
| `TAVILY_API_KEY` | server | Tavily key ([app.tavily.com](https://app.tavily.com)) |
| `BRAVE_SEARCH_API_KEY` | server | Brave Search key ([brave.com/search/api](https://brave.com/search/api/)) |
| `FINNHUB_API_KEY` | server | optional |
| `CRON_SECRET` | server | protects scheduled endpoints |

### Switching AI providers

The chat model chain is provider-agnostic (Vercel AI SDK). Set `LLM_CHAT_CHAIN`
to an ordered, comma-separated list of `provider:model` entries; the chain tries
each in order and falls through to the next on rate-limits (incl.
tokens-per-minute), 5xx, or timeouts (honoring `Retry-After`). A provider whose
API key is missing is skipped silently. Supported providers: `groq`,
`huggingface` (via its OpenAI-compatible router at `HUGGINGFACE_BASE_URL`), and
`google`.

Placeholder examples (replace `<model-id>` with a model your account can use):

```bash
# Groq first, Hugging Face second, Gemini as the safety net
LLM_CHAT_CHAIN=groq:<model-id>,huggingface:<model-id>,google:<model-id>

# Gemini only (equivalent to leaving LLM_CHAT_CHAIN unset)
LLM_CHAT_CHAIN=google:gemini-2.5-flash,google:gemini-2.0-flash
```

When `LLM_CHAT_CHAIN` is unset the app uses the legacy Gemini-only chain
(`GEMINI_CHAT_MODELS` + `GEMINI_CHAT_MODEL`), so existing deployments keep
working unchanged.

> **Note:** free-tier limits (requests/day and tokens-per-minute) are usually
> **per organization**, not per key, and change frequently. Check each
> provider's console for current limits before relying on them. Open models may
> follow the citation and formatting rules less reliably than Gemini; a
> deterministic post-processor enforces the hard rules (disclaimer, stray
> `<think>` removal, dropping citations to sources that were not provided).

**Embeddings stay on Gemini** (`GEMINI_EMBED_MODEL`, 768 dims). The pgvector
column is sized for 768-dim Gemini vectors and all stored embeddings were
produced by that model, so switching embedding providers would require
re-embedding every chunk and resizing the column. The embeddings call is wrapped
behind a provider interface in `src/lib/llm/embeddings.ts` so a future switch is
a one-line change.

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
| `0007_quality_and_audit.sql` | extra `fundamentals_annual` columns (current_assets, gross_profit, cost_of_revenue, retained_earnings, long_term_debt, total_liabilities); `stock_metrics` quality columns (piotroski_score, piotroski_available_criteria, altman_z, altman_zone, dividend_payout_ratio, dividend_safety); `chat_messages.audit` jsonb |
| `0008_user_documents.sql` | `user_documents`, `user_document_chunks` (HNSW), owner-only RLS, `match_user_document_chunks()`, private `user-docs` Storage bucket with per-user folder policies |
| `0009_portfolio_profile.sql` | `portfolio_profiles` (risk tolerance, horizon, near-term liquidity need) with owner-only RLS; drives goal-conflict warnings |
| `0010_web_cache.sql` | `web_cache` (hash-keyed search/page cache) with RLS enabled and **no client policies** (service role only) |
| `0011_chat_mode.sql` | adds `chat_messages.mode` (`filings`/`web`/`portfolio`, default `filings`) + composite index; history queries filter by mode |

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

## Chat UI (Phase 9)

`ChatSlot` (`src/components/chat/`) renders the filings chat: a **sticky panel**
on desktop (right column of the stock page) and a **floating "Ask AI" button +
bottom sheet** on mobile.

- **Empty state** with clickable prompt chips: "Summarize the key risks", "Why
  is debt changing?", "What did management say about margins?", "What does the
  auditor's report say?".
- **User/assistant bubbles** with safe markdown (no `dangerouslySetInnerHTML`),
  a streaming indicator, and auto-scroll.
- `[Sn]` tags become **citation chips** ("Annual Report FY25 · p. 47"); clicking
  opens a side sheet with the exact passage, section, and an "Open PDF at this
  page" link (`source_url#page=N`).
- **Logged out**: shows "Sign in with Google to chat" instead of the input.
- **History** per user+stock loads from `chat_messages` (via
  `/api/chat/history`); a "Clear chat" button deletes this user's messages for
  this stock.
- Persistent note under the input: "Educational analysis from company filings,
  not investment advice."
- Friendly errors for 401 / 429 / generic with Retry; input disabled while
  streaming; 1000-char counter; `aria-live` for streamed messages; Enter to
  send, Shift+Enter for a newline.

The client reads the Vercel AI data-stream (`0:"token"` parts), so both the
LLM path and the deterministic refusal/fallback path render identically.

## Chat modes & Web Research

The stock-page chat panel has two tabs:

- **Filings** (default): grounded answers from this company's official filings,
  with `[S1]` citations, the fact audit, and the standard disclaimer. Unchanged.
- **Web research** (`POST /api/research`): a **separate, clearly-labeled** mode
  that looks up context on the web. It shows a permanent banner — *"Web sources,
  not verified filings. Educational only."* — and answers are **unverified
  against filings**.

Web Research is deliberately constrained:

- **Domain allowlist** (`src/config/web-sources.ts`, editable): official Indian
  market/regulatory sources (BSE, NSE, SEBI, RBI, Income Tax, MCA) plus a short
  list of reputable financial media (Reuters, Economic Times, Livemint, Business
  Standard, Moneycontrol, Screener), and the company's investor-relations domain
  when available. Results from any other domain are shown only as unverified
  links and are **never fed to the model**.
- **SSRF-safe page reader** (`src/lib/web/fetch-page.ts`): HTTPS only,
  allowlisted hosts only, 8s timeout, 1 MB cap, html/text only, ~6k chars per
  page, redirects followed manually and re-validated, and every host resolved
  and rejected if it maps to loopback / link-local / RFC1918 / cloud-metadata
  addresses.
- **Same safety posture**: login + zod validation, the intent guard (advice
  questions get the standard refusal), the output guard (English and Hinglish),
  the post-processor, and a separate rate limit (10 web questions/user/hour).
  Web text is treated as untrusted — instructions embedded in a page are ignored
  (covered by a prompt-injection test fixture), and any URL in the answer that
  was not in the provided sources is removed.
- **Cache** (`web_cache`, migration `0010`, RLS on with **no client policies** —
  service role only): search results 30 min, page text 6 h.
- Citations render as **source chips** showing the domain and retrieved date,
  linking to the original page in a new tab (`rel="noopener noreferrer"`).
- The tab is **disabled with a friendly message** when no search provider
  (`SEARCH_PROVIDER` + key) is configured.

`chat_messages.mode` (migration `0011`, one of `filings | web | portfolio`)
separates the transcripts; history queries filter by mode.

## Portfolio (Phase 10)

`/portfolio` (login required) auto-creates a default portfolio on first visit.

- **Add holding**: stock search (`/api/search`) + quantity + avg buy price (zod
  validated); adding an existing stock updates it (upsert on
  `portfolio_id, stock_id`); edit/delete with a confirm dialog.
- **PortfolioTable**: stock, qty, avg price, current price, value, weight %,
  P&L ₹ and % (labeled "historical, based on delayed prices").
- **Pure math** (`src/lib/portfolio/`, vitest-tested):
  - `concentration.ts`: sector weights, single-stock HHI; flags sector > 40%
    and single stock > 25% as "High concentration".
  - `beta.ts`: Σ weight × beta, skipping null betas, reporting covered weight %.
  - `volatility.ts`: annualised volatility from the covariance matrix of 1y
    daily returns when ≥ 60 overlapping days, else null "insufficient history".
  - `stress.ts`: loss = Σ weight-value × beta × market_shock, in ₹ and %, per
    holding (null beta assumed 1.0 and flagged).
- **ConcentrationChart** (recharts) with warning badges.
- **What-if simulator**: pick a stock + amount; preview before/after sector
  weights, beta, and flags without saving.
- **Stress test**: slider −40%…−5% (default −10%), results in ₹ and %, per
  holding. `POST /api/portfolio/stress` (auth + zod) computes server-side.
- Mandatory text: "Hypothetical estimate based on historical beta. Not a
  prediction. Actual results can differ significantly." Hypothetical cards use a
  distinct dashed style vs historical numbers.
- Empty, loading, and error states.

## Methodology & polish (Phase 11)

- **`/methodology`** (public, static): pillars + weights (imported from the
  shared constants so it always matches the engine), each metric and direction,
  the sector-percentile method, red-flag caps, label thresholds, missing-data
  handling, data sources, nightly schedule, formula version, known limitations,
  and what the product is and isn't — plus the full disclaimer.
- **Global `not-found.tsx`** and **`error.tsx`** error boundaries; per-route
  loading skeletons and error boundaries on home, stock, and portfolio.
- **SEO/OpenGraph**: `metadataBase` + default OG/Twitter in the root layout;
  article OG on stock pages (`generateMetadata`) and methodology.
- **Language audit**: no "buy / sell / best stock / invest in / target price"
  call-to-action language in the UI. "Open in your broker" and the neutral
  "average buy price" field label are the only buy/sell-adjacent strings, both
  allowed. Guardrail detection patterns live in `.ts` logic, not UI.
- **Accessibility/responsive**: icon-only buttons have `aria-labels`; focus
  rings on interactive elements; score-label colors defined for both themes.
  Home and stock pages use **server-side cached data** — the price chart
  renders from props with no client-side first-render fetch of price history.

## Automation, tests & security (Phase 12)

- **Nightly GitHub Action** (`.github/workflows/nightly.yml`): runs daily at
  11:00 UTC plus manual `workflow_dispatch`. Checks out, sets up pnpm + Node 20,
  installs, runs `pnpm fetch` then `pnpm score`. Uses GitHub secrets
  `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` for env validation). `pnpm fetch` **exits
  non-zero if more than 30% of stocks fail to fetch**, so the job fails loudly.
- **Tests**: `pnpm test` runs all vitest suites (metrics, scoring, guardrails,
  portfolio, chunking — 136 tests). `pnpm e2e` runs a Playwright smoke test
  (home loads; a stock page shows a score or a clean fallback) — it builds and
  starts the production server automatically.
- **Security review**:
  - Service-role key is only imported in server/scripts (`admin.ts` +
    `server-only` consumers), never in client code; `admin.ts` also throws if
    run in a browser.
  - RLS is enabled on every table (Phase 1 migration `0005`).
  - Chat input is zod-validated and length-limited (1000 chars) server-side.
  - Security headers (`X-Frame-Options`, `X-Content-Type-Options`,
    `Referrer-Policy`) in `next.config.ts`.
  - `.env*` is gitignored (except `.env.example`); no secrets are committed.

## Financial quality (Piotroski, Altman, dividend)

Three extra, code-computed quality checks (`src/lib/scoring/quality.ts`, pure +
vitest-tested) feed the Financial Health pillar (formula version **v1.1**) and a
"Financial quality" card on each stock page:

- **Piotroski F-Score (0–9)** — real year-over-year scoring (positive ROA,
  positive operating cash flow, ROA improved, cash flow > net income, long-term
  debt ratio fell, current ratio rose, no new shares, gross margin improved,
  asset turnover improved). A criterion with missing data is **skipped, not
  scored 0**; the available count is stored; fewer than 6 available ⇒ "Not
  enough data". Banks/NBFCs are skipped. Percentile-ranked within the sector.
- **Altman Z''-Score** (emerging-market variant) — `6.56·X1 + 3.26·X2 + 6.72·X3
  + 1.05·X4`; zones safe > 2.6, grey 1.1–2.6, distress < 1.1; `not_applicable`
  for banks/NBFCs; NULL if any input missing. Contributes direct Financial
  Health points (safe 100, grey 50, distress 10).
- **Dividend safety** — payout = dividends paid ÷ net profit (net profit > 0
  only); ≤60% strong, ≤90% moderate, else weak; "Not available" otherwise.
  Shown as a badge on High Dividend cards.

Altman distress and a Piotroski score of 0–2 surface as **informational** red
flags only — they never trigger the score cap. Scores are computed and written
to `stock_metrics` by `pnpm score`.

## Chat reliability & fact audit

- **Model fallback** (`src/lib/rag/model-chain.ts`): the chat tries the ordered
  `GEMINI_CHAT_MODELS` list, advancing to the next model on 429/5xx/timeout, and
  always falls back to `GEMINI_CHAT_MODEL`. If every model fails, the user sees a
  friendly "service is busy" message.
- **Fact audit** (`src/lib/rag/audit.ts`): after an answer is generated and
  guarded, one cheap same-provider verification call labels each factual sentence
  `grounded` / `unverifiable` / `not_a_claim` against the cited sources (strict
  zod-validated JSON), stored in `chat_messages.audit`. A badge appears under the
  answer — green "Verified against filings (n of m claims)" or an amber
  expandable "Some statements could not be verified". Audit failure/timeout ⇒ no
  badge, and the answer is **never** rewritten. No Cohere or new provider is used.
- **Export chat**: a client-side button downloads the conversation as Markdown
  (messages, citations with page numbers, disclaimer).

## My documents (user uploads)

`/documents` (login required) lets a user privately analyse their own PDFs.

- **Upload** (`POST /api/documents`, Node runtime): PDF only, ≤ 10 MB, ≤ 150
  pages, ≤ 5 documents per user, ≤ 3 uploads per hour. MIME type **and** the
  `%PDF-` file signature are validated server-side. Files are stored in the
  private `user-docs` bucket under `<user_id>/<document_id>.pdf`.
- **Shared ingest** (`src/lib/rag/ingest.ts`): extraction → chunking → embedding
  is factored out of the filings script so both pipelines use one code path.
- **Red-flag scan** (`src/lib/rag/doc-scan.ts`): one LLM call over the relevant
  sections (auditor's report, risks, contingent liabilities, related-party
  notes) returns a zod-validated neutral 5-bullet summary plus red flags, each
  with a page number and a short verbatim quote (< 15 words), labelled "Filing
  red flags (AI-assisted, verify in the document)". No advice wording. Uploaded
  text is treated as untrusted.
- **Document chat** (`POST /api/documents/[id]/chat`): same system prompt,
  guards, and model fallback as stock chat, retrieving only from the user's own
  chunks via `match_user_document_chunks` (which enforces `auth.uid()`).
- **Delete** (`DELETE /api/documents/[id]`): removes the row (chunks cascade) and
  the storage object.
- RLS restricts `user_documents` and `user_document_chunks` to the owner; the
  `user-docs` bucket policies restrict every operation to the user's own folder.

## Portfolio risk report

`/portfolio` has an **"Export risk report"** button (`jsPDF`, dynamically
imported, client-side). The PDF includes title/date/data-freshness, a holdings
table, sector concentration with warnings, portfolio beta and volatility, a
hypothetical stress scenario, Piotroski/Altman per holding where available, an
"Assumptions" section, separate "Historical observations" and "Hypothetical
scenarios" sections, and the disclaimer "Educational analysis only. Not
investment advice. Hypothetical estimates are not predictions." No price
targets, recommendations, or buy/sell wording.

## Portfolio risk lab (F-06 scenario analysis)

Beyond the market-drop stress test, `/portfolio` adds a scenario + comparison
lab for the F-06 problem statement. Every number is computed in code (pure
functions in `src/lib/portfolio/*`, vitest-tested); the LLM never calculates.

- **Correlation** (`correlation.ts`): a holdings-by-holdings heatmap of 1y daily
  return correlations (Pearson's r), requiring ≥60 overlapping days per pair
  (else "insufficient history"), plus a plain-language average-correlation line
  and each holding's **contribution to portfolio volatility**.
- **Scenario engine** (`scenarios.ts`): one `runScenario()` returning per-holding
  and total impact in % and ₹ for four **hypothetical** scenarios:
  - *Market decline* — beta-scaled broad move (reuses the stress logic).
  - *Sector shock* — chosen sector takes the shock; other holdings take
    beta × shock × spillover (default 0.25, editable).
  - *Interest-rate change* (−100…+200 bps) — −(assumed sector rate sensitivity ×
    bps/100)%, from the documented table in `src/config/scenario-assumptions.ts`
    (rate-sensitive sectors like banks/NBFCs, real estate, autos, capital goods
    carry larger negative sensitivities; defensives small).
  - *Currency (USD/INR) move* (−10…+10%) — assumed per-sector exposure × move
    (IT services/pharma exporters positive for rupee weakness; importers
    negative). All sensitivities are **assumptions, not measured values**.
- **Assumptions panel**: a collapsible "Assumptions and limits" panel lists the
  betas, sensitivities, spillover factor, history window, and data freshness,
  and lets the user edit the scenario assumptions (recomputes instantly,
  client-side). Historical observations and hypothetical estimates are shown in
  visually distinct cards; every scenario result carries "Hypothetical estimate
  based on stated assumptions. Not a prediction."
- **Allocation comparison** (`comparison.ts`): build an alternative allocation
  (edit target weights, "reset to current") and see Current vs Alternative side
  by side — HHI, beta, and the selected scenario's impact — with the delta.
  Nothing is saved.
- **Risk profile + goal conflicts** (`goal-conflicts.ts`, migration `0009`): a
  short profile form (risk tolerance, horizon, near-term liquidity need) stored
  in `portfolio_profiles` (owner-only RLS). Deterministic, documented rules
  flag conflicts, e.g. short horizon (<3y) with portfolio beta >1.0 or small-cap
  weight >30%; liquidity need >20% with small-cap/illiquid weight >40%;
  conservative tolerance with 1y volatility >30% or one sector >40%; aggressive
  tolerance with horizon <2y. Warnings are neutral ("you may want to review…"),
  never advice, and show the rule and the numbers that fired.
- **Explain my portfolio's risk**: an optional button asks the model to turn the
  computed risk DATA block into a plain-language explanation. The server
  computes every number; the model only explains, runs the same guards, and
  ends with the disclaimer. Shares the hourly AI rate limit with chat.

The PDF risk report also carries the correlation summary, volatility
contributions, and goal-conflict checks, keeping historical and hypothetical
sections separate.

## Acknowledgements

FilingLens adapts a small amount of logic from **[Nipun-AI](https://github.com/myProjectsRavi/Nipun-AI)**
(MIT License) — the Piotroski idea, the Gemini model-fallback cascade, the fact
audit, and the jsPDF report layout — all rewritten in TypeScript with
investment-advice content removed. The user-document feature was **inspired by
ideas** from **[StockSnapAI](https://github.com/sayed-ashfaq/StockSnapAI)** (no
license; **no code copied or translated**). Full attribution and the Nipun-AI
license text are in [`NOTICE.md`](./NOTICE.md).

## Deployment

### 1. Supabase
1. Create a Supabase project.
2. Run the migrations in order (SQL Editor or `supabase db push`) — see the
   Database section.
3. **Auth → Providers → Google**: enable and paste your Google OAuth client ID
   + secret (see the Google OAuth section).
4. **Storage**: confirm the public `filings` bucket exists.

### 2. GitHub
1. Push the repo to GitHub.
2. **Settings → Secrets and variables → Actions** — add:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`.

### 3. Vercel
1. Import the GitHub repo into Vercel.
2. Add **all** env vars (from `.env.example`) for **Production and Preview**:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
   `GEMINI_CHAT_MODEL`, `GEMINI_EMBED_MODEL`, `EMBED_DIMENSIONS=768`,
   `NEXT_PUBLIC_SITE_URL` (= your Vercel URL), `CRON_SECRET`.
3. Deploy.
4. Add the Vercel URL to **Supabase → Auth → URL Configuration → Redirect
   URLs** (`https://<your-app>.vercel.app/**`) and keep the Google OAuth
   redirect URI as `https://<project-ref>.supabase.co/auth/v1/callback`.

### 4. Seed the data (run once, in order, locally or in CI)
```bash
pnpm seed     # universe (+ governance CSV if filled)
pnpm fetch    # prices, fundamentals, metrics
pnpm score    # fundamental scores
pnpm ingest   # filing PDFs (place them under data/filings first)
```

### 5. Production smoke test
- Sign in with Google.
- Open a stock page; confirm it shows a score and chart.
- Ask the chat a question; confirm the answer carries a working citation.
- Ask "Should I buy this?"; confirm it returns the refusal template.
- Open the portfolio, add a holding, run the stress test.

## Add a new stock
1. Add an entry to `UNIVERSE` in `src/config/universe.ts` (symbol, name,
   sector, cap_category). `yahoo_symbol` is `SYMBOL + ".NS"`.
2. (Optional) add a row to `data/governance_seed.csv`.
3. Run `pnpm seed && pnpm fetch && pnpm score`.
4. (Optional) drop filing PDFs under `data/filings/<SYMBOL>/` and run
   `pnpm ingest`.

## Acceptance checklist

| Criterion | Status |
| --- | --- |
| Home shows ranked categories from the DB with no browser-side external API calls | ✅ server-rendered from Supabase; Yahoo/Gemini only called in scripts/server |
| Score breakdown sums correctly; capped stocks show red-flag explanations | ✅ weighted + renormalised in code; cap + explanations rendered |
| Chat answers carry working citations; "Should I buy this?" always triggers the refusal | ✅ `[Sn]` → citation chips; deterministic intent guard (unit-tested) |
| Logged-out users cannot chat or open the portfolio; user A cannot see user B's data | ✅ middleware guards `/portfolio`; chat API requires login; RLS scopes rows to `auth.uid()` |
| Stress test is clearly labeled hypothetical | ✅ mandatory disclaimer + dashed card style |
| No "buy/sell/best stocks" language anywhere in the UI | ✅ language audit passed ("Open in your broker" / "avg buy price" are allowed) |

Items verified by build/type/lint/unit tests locally; auth isolation, live chat
citations, and rendered data require a deployed instance with seeded data and a
browser session to confirm end to end.
