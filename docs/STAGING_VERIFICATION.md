# Staging verification runbook — authenticated workflows & live RLS

These checks **cannot run in the current environment** because sign-in is
Google-OAuth-only, there are no test-account credentials, and provisioning users
on the live Supabase project is not authorized here. Run them in a dedicated
**staging** project (never production). Keep all tokens in env vars; never commit
or print them.

## Prerequisites (staging only)
- A Supabase **staging** project with the same migrations applied (`0001`–`0011`;
  confirm `0009_portfolio_profile` is applied).
- Two real test users (A and B). Create them safely via the Supabase dashboard
  (Authentication → Users → Add user) or the Admin API with the staging
  service-role key — these are **real** Supabase identities, not fake sessions.
  Do not disable auth or weaken RLS to simulate them.
- A staging `.env` with: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `TAPETIDE_API_KEY`, `NEXT_PUBLIC_SITE_URL`.

## A. Live RLS isolation (opt-in vitest) — `src/lib/rag/rls-user-documents.test.ts`
Already implemented; gated on env. To run:
```bash
RUN_RLS_TESTS=1 \
TEST_USER_A_JWT=<staging access token for user A> \
TEST_USER_B_JWT=<staging access token for user B> \
TEST_USER_B_DOC_ID=<a user_documents.id owned by B> \
pnpm test src/lib/rag/rls-user-documents.test.ts
```
Obtain the JWTs with a staging sign-in (e.g. `supabase.auth.signInWithPassword`
for a password-enabled staging user, or `admin.generateLink`), then read
`session.access_token`. The test asserts A cannot read B's document/chunks and B
can read their own. **Extend similarly** for `portfolios`/`holdings`/
`portfolio_profiles` if you want full coverage (same pattern, different tables).

## B. Authenticated Playwright workflows
OAuth can't be automated headlessly without real Google creds. Two safe options
for staging:
1. **Password auth for test users:** enable email/password in the staging
   Supabase Auth settings, add a `signInWithPassword` path or use the API to get
   a session, then seed Playwright `storageState` with the Supabase auth cookies.
2. **Pre-seeded storageState:** sign in once manually in staging, save
   `storageState.json`, and point a new Playwright project at it.

Then add authenticated specs that exercise (and assert against DB/UI):
- **Dashboard:** value + holdings count match seeded holdings; empty state when none.
- **Portfolio CRUD:** add → edit → remove a holding; totals/risk update; persists on reload.
- **Risk Lab:** run market/sector/rate/currency scenarios; displayed numbers match
  `runScenario` output; assumed beta shows the `*` footnote.
- **PDF:** generate the risk report; assert the download is non-empty and (via
  text extraction) contains instrument identity, units, assumptions, and
  missing-data notes.
- **Authorization:** user A cannot open user B's records by changing IDs/URLs.

## What IS verified without staging (this environment)
- Signed-out redirects for `/dashboard`, `/portfolio`, `/documents` → `/login`
  (Playwright, passing).
- RLS **policy definitions** reviewed statically (`0005`, `0008`, `0009`): correct
  owner-scoping; public data SELECT-only.
- `runScenario`, beta, volatility, drawdown, correlation, concentration logic
  (deterministic unit tests) + a real-data engine run over a real portfolio.
- Null/assumed-beta disclosure in the UI (footnotes, "Not available").

## Required env vars (staging)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TAPETIDE_API_KEY`, `NEXT_PUBLIC_SITE_URL`,
and for the RLS suite: `RUN_RLS_TESTS`, `TEST_USER_A_JWT`, `TEST_USER_B_JWT`,
`TEST_USER_B_DOC_ID`.
