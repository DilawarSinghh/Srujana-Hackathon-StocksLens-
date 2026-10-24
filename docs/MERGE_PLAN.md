# Merge Plan — Borrowed Features

Status: study complete, implementation in progress on branch `feat/borrowed-features`.
Backup tag: `pre-merge-backup`. Revert with `git reset --hard pre-merge-backup`.

## Reference repos & license status

| Repo | Language | License file | Verdict |
| --- | --- | --- | --- |
| Nipun-AI (`reference/nipun-ai`) | TypeScript (Cloudflare Worker + React/Vite) | `LICENSE` = **MIT** (© 2025 RTN Labs) | Logic may be adapted and rewritten in TS **with attribution** in `NOTICE.md`. |
| StockSnapAI (`reference/stocksnapai`) | Python / Streamlit | **No LICENSE file** (confirmed: no `LICENSE`/`COPYING`) | **Copy NO code, translate NO code.** Describe approach in our own words and build from scratch. |

The whole `reference/` folder is git-ignored and never committed. It is studied read-only; nothing is installed or run inside it.

## What was located in Nipun-AI (read-only)

- **Piotroski & Altman** — `worker/src/compute.ts > computeFinancialHealth`. Altman uses the classic manufacturing Z-Score (`1.2·WC/TA + 1.4·RE/TA + 3.3·EBIT/TA + 0.6·MVE/TL + 1.0·Sales/TA`) with a market-value term and a proxy fallback. Piotroski is an admitted **single-year proxy** (no YoY), scored out of 9. Both are labelled "estimated" when proxied.
- **Dividend** — `worker/src/compute.ts > computeDividendAnalysis`: annual dividend = yield × price, payout = dividend / EPS, safety bands by payout ratio.
- **Gemini fallback cascade** — `worker/src/gemini.ts > callGemini`: iterate an ordered list of model names, `continue` to the next on any failure, throw if all fail. Raw `fetch` to the Generative Language API.
- **Claim verification / fact audit** — `worker/src/cohere.ts > auditReport`: sends draft report + a source doc to Cohere Command R+, returns per-claim `grounded | speculative | unverifiable` as JSON, counts each bucket.
- **PDF export** — `frontend/src/components/PDFExport.tsx`: client-side `jsPDF` report with a per-page "Not financial advice" watermark and a closing disclaimer box.

**Not ported (out of scope / violates our advice guard):** Investment Score buy/sell signals, Nipun Score A–F grade + "recommendation" text, DCF/Graham/Lynch price targets, multi-AI consensus, Finnhub/Yahoo-RSS (US `region=US`), SEC EDGAR, insider data, Cohere/Cerebras/Groq providers.

## What StockSnapAI does (described in our own words — no code read for reuse)

Its README describes a Streamlit prototype that: (1) lets a user upload financial documents, (2) produces an AI summary with red-flag detection, (3) offers chat-with-your-document using natural language with citations, and (4) can export chat history. We reimplement these ideas from scratch on our own stack (Supabase + pgvector + Vercel AI SDK), reusing **our** existing extraction/chunking/embedding/RAG code. No Python, Streamlit, Chroma, or FAISS.

## Our schema today (relevant tables)

- `fundamentals_annual` (PK `stock_id, fiscal_year`, INR crore, nullable): revenue, operating_profit, net_profit, total_debt, total_equity, total_assets, current_liabilities, operating_cash_flow, interest_expense, ebit, dividends_paid, shares_outstanding.
- `stock_metrics` (PK `stock_id`): price/valuation/ratio snapshot.
- `scores` + `latest_scores` view: six pillars, `red_flags` jsonb, `explanations` jsonb, `formula_version`.
- `filings` / `filing_chunks` + `match_filing_chunks(vector,uuid,int)` RPC; public `filings` storage bucket.
- RLS enabled on every table (migration 0005). Advice intent/output guards in `src/lib/rag/guardrails.ts`.

## Feature-by-feature: inputs, what we have, what to add

### A. Schema & data additions
- **Have:** most balance-sheet fields; multi-year `fundamentals_annual` (enables **real YoY Piotroski**, better than Nipun's proxy).
- **Add (migration 0007):** `fundamentals_annual` + `current_assets, gross_profit, cost_of_revenue, retained_earnings, long_term_debt, total_liabilities` (dividends_paid already exists). `stock_metrics` + `piotroski_score int, piotroski_available_criteria int, altman_z numeric, altman_zone text, dividend_payout_ratio numeric, dividend_safety text`.
- Fetch new raw fields in `src/lib/data/yahoo.ts > getAnnualFundamentals` via the `pick()` pattern; convert in `toCrore()`; print a per-stock "which fields Yahoo returned" table in `scripts/fetch-market-data.ts`. Mirror types in `src/types/database.ts`.

### B. Financial quality scoring — `src/lib/scoring/quality.ts` (pure, tested)
- **Piotroski F-Score (0–9), real YoY:** needs current + prior year net income, OCF, ROA, long-term-debt ratio, current ratio (needs current_assets + current_liabilities), shares outstanding, gross margin (gross_profit/revenue), asset turnover (revenue/total_assets). Skip any criterion with missing inputs; store `available_criteria`; `< 6 available ⇒ NULL` ("Not enough data"). Skip banks/NBFCs via `isBankSector`.
- **Altman Z''** (emerging-market, non-manufacturing): `6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4`; X1=WC/TA, X2=RE/TA, X3=EBIT/TA, X4=book equity/total liabilities. Zones >2.6 safe, 1.1–2.6 grey, <1.1 distress; `not_applicable` for banks/NBFCs; NULL if any input missing.
- **Dividend payout** = dividends_paid / net_profit (net_profit > 0 only). Safety ≤60% strong, ≤90% moderate, else weak; `not_available` if inputs missing. (Dividends are stored as a signed cash-outflow by Yahoo, so use absolute value.)
- **Integrate (compute-scores.ts):** write results to new `stock_metrics` columns. In the financial-health pillar add Piotroski (sector percentile) and Altman zone as points (safe 100 / grey 50 / distress 10), keeping missing-data renormalisation. **No new score cap.** Altman distress and Piotroski 0–2 become **informational** red flags only (excluded from the `RED_FLAG_CAP` logic).
- Bump `FORMULA_VERSION` to `v1.1`; update constants, "Why this score" explanations, `/methodology`.
- **UI:** "Financial quality" card on the stock page (Piotroski checklist, Altman zone with "historical distress indicator, not a prediction", dividend safety); dividend-safety badge on High-Dividend cards. NULLs → "Not available".

### C. Chat reliability & fact audit
- **Model fallback:** new env `GEMINI_CHAT_MODELS` (comma list); `GEMINI_CHAT_MODEL` still works as fallback. `src/lib/rag/model-chain.ts` resolves the ordered list and retries on 429/5xx/timeout, friendly error if all fail. Wire into `src/app/api/chat/route.ts` around the `streamText` model selection.
- **Fact audit:** after the answer, one cheap same-provider (Gemini) verification call classifies each factual sentence `grounded | unverifiable | not_a_claim` vs the cited sources; strict JSON validated with zod. Store in a new `chat_messages.audit` jsonb column (migration). Badge under each assistant message ("Verified against filings (n of m claims)" or amber "Some statements could not be verified" with an expandable list). Audit failure/timeout ⇒ no badge, answer unchanged. Guards still run first. **No Cohere / no new provider.**

### D. User PDF upload, red-flag scan, chat export (built from scratch)
- **Migrations:** `user_documents` and `user_document_chunks` (embedding vector(768), HNSW), RLS `user_id = auth.uid()` for all ops, private `user-docs` storage bucket with per-user folder policies, and a `match_user_document_chunks` RPC that also enforces ownership.
- **Shared ingest module** `src/lib/rag/ingest.ts`: factor the extract→chunk→embed→insert core out of `scripts/ingest-filings.ts` so both the script and the upload route use it (no duplication). PDF extraction (`scripts/lib/pdf.ts`, pdfjs-dist) runs under `runtime = "nodejs"`.
- **Upload route:** logged-in only; PDF only; ≤10 MB; ≤150 pages; ≤5 docs/user; ≤3 uploads/hour. Validate MIME + file signature (`%PDF`) server-side.
- **Red-flag scan:** one LLM call over relevant sections → zod JSON {5-bullet neutral summary, red_flags[{title, explanation, page, short_quote (<15 words)}]}; every flag has a page. Labelled "Filing red flags (AI-assisted, verify in the document)". No advice wording.
- **Document chat:** reuse chat route logic with a `documentId`, same system prompt, citations, guards, audit, retrieving only that user's chunks; uploaded text treated as untrusted.
- **Delete** action (row + chunks + storage). **Export chat** (client-side `.md`: messages, citations w/ pages, disclaimer line).

### E. Portfolio Risk Report PDF
- "Export risk report" on `/portfolio`, client-side `jsPDF` (dynamically imported). Sections: title/date/freshness; holdings table; sector concentration + warnings; portfolio beta & volatility; the user's stress-test scenario + results; Piotroski/Altman per holding where available; "Assumptions"; separate "Historical observations" and "Hypothetical scenarios"; disclaimer "Educational analysis only. Not investment advice. Hypothetical estimates are not predictions." No targets/recommendations/buy-sell. Handle empty portfolios and null metrics.

### F. Attribution & docs
- `NOTICE.md` listing each adapted item + Nipun-AI's exact MIT text/copyright; StockSnapAI = "ideas only, no code copied". README "Acknowledgements" + docs for new env vars, tables, routes, upload limits.

## Verification
Baseline (Step 1): `pnpm test` 136 passing (5 files); `pnpm lint` clean; `pnpm build` success (after excluding `reference/` from tsconfig). All new work must keep these green and add tests per B/C/D/E.
