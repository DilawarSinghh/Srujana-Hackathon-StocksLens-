# End-to-end tests

Two tiers, by design:

| Tier | Files | Auth | External services | Default run |
| --- | --- | --- | --- | --- |
| **Public (unauthenticated)** | `smoke.spec.ts`, `navigation.spec.ts` | none | none | **always** (`pnpm e2e`) |
| **Authenticated** | `authenticated.spec.ts` (+ `auth/`) | real LOCAL Supabase session | real backend; AI opt-in | only when configured |

`pnpm e2e` runs the public tier against a production build with **zero setup**. The
authenticated tier is **disabled by default** and only activates when the local
test-auth harness is configured.

## Why a LOCAL Supabase stack

Production sign-in is Google OAuth only, which cannot be automated safely, and
the linked project is the **production** database. To test authenticated pages
without weakening production security or forging a session, the authenticated
tier runs against an **isolated local Supabase stack** with a dedicated test
user. A hard guard (`e2e/auth/test-auth.config.ts`) **refuses to run** against
any non-local Supabase URL, so this harness can never touch production.

What it does **not** do: no forged JWTs, no service-role key in the browser or
any committed fixture, no RLS bypass, no production middleware bypass. The
session is a genuine `signInWithPassword` sign-in through the app's own client.

## Public vs. secret environment variables

- **Public** (safe in the browser bundle; `NEXT_PUBLIC_` prefix): `E2E_SUPABASE_URL`,
  `E2E_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Secret** (server/scripts only — NEVER shipped to the browser): `E2E_SUPABASE_SERVICE_ROLE`
  (used only by the Node setup/cleanup to create/delete the local test user) and
  `SUPABASE_SERVICE_ROLE_KEY`. `E2E_TEST_PASSWORD` is a throwaway local secret.

Put all values in `.env.local` (gitignored). Next.js loads `.env.local` ahead of
`.env`, so the Playwright-built app server picks them up automatically.

## One-time setup

Requires **Docker or Podman** (for `supabase start`).

0. Install dependencies (once):
   ```bash
   pnpm install
   ```
1. Confirm a container runtime is available, then start a local Supabase stack
   from the repo root:
   ```bash
   docker info                   # or: podman info  — must succeed
   npx supabase start            # prints local URL + anon/service_role keys
   npx supabase db reset         # applies supabase/migrations to the local DB
   ```
2. (Optional, for data-dependent chat/debate specs) seed stock data into the
   LOCAL db the same way production is seeded:
   ```bash
   pnpm seed && pnpm fetch && pnpm score   # uses your .env → point it at local
   ```
3. Put the LOCAL values in `.env.local` (gitignored) — see `.env.example`:
   ```
   E2E_SUPABASE_URL=http://127.0.0.1:54321
   E2E_SUPABASE_ANON_KEY=<local anon key from `supabase status`>
   E2E_SUPABASE_SERVICE_ROLE=<local service_role key from `supabase status`>
   E2E_TEST_EMAIL=e2e-test@example.com
   E2E_TEST_PASSWORD=<throwaway local password>
   ```
   The test user is created automatically by the setup project; you do not
   create it by hand.
4. Point the app server the tests build at the LOCAL stack. The Playwright
   `webServer` runs `pnpm build && pnpm start`, so set these for that process
   (in `.env.local`, pointing at local for the test run):
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
   SUPABASE_SERVICE_ROLE_KEY=<local service_role key>
   ```

## Running

```bash
# Public tier only (default):
pnpm e2e

# Everything, including the authenticated tier (needs the setup above):
pnpm e2e                       # the authenticated project auto-registers once
                               # E2E_* is set and local

# Include ONE live Groq chat request in the authenticated tier:
RUN_LIVE_AI=1 pnpm e2e
```

### The two live-AI opt-in flags (distinct, by design)

| Flag | Enables | Command | What it proves |
| --- | --- | --- | --- |
| `RUN_LIVE_GROQ=1` | the standalone provider smoke script | `RUN_LIVE_GROQ=1 pnpm smoke:groq` | Groq is reachable and the key is valid (direct provider call) |
| `RUN_LIVE_AI=1` | the authenticated chat E2E test | `RUN_LIVE_AI=1 pnpm e2e` | a question submitted through the **app route** in a real browser returns a substantive answer |

They are deliberately separate: one checks the provider in isolation; the other
checks the full authenticated request path in the UI. Both use Groq only.

The `setup` project seeds the user and writes the signed-in browser state to
`e2e/.auth/user.json` (gitignored). The `authenticated` project reuses it.

## Cleanup

- The signed-in state lives only in `e2e/.auth/` (gitignored); delete it to
  reset: `rm -rf e2e/.auth`.
- Remove the local test user (and its owned rows) from the LOCAL db:
  ```bash
  pnpm e2e:cleanup
  ```
- Tear down the whole local stack: `npx supabase stop`.

## What is mocked vs. live

- **Public tier**: no mocks, no external calls — pure UI/routing/responsive.
- **Authenticated tier**: a **real** Supabase session and the **real** app
  backend. The failed-debate test uses Playwright request interception to force
  a 500 (verifying no fabricated verdict) — that is a deliberate UI
  failure-handling test, not a mocked AI answer. The one live chat request is
  gated behind `RUN_LIVE_AI=1` and uses the real Groq provider.
