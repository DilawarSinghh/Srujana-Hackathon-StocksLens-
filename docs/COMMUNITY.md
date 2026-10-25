# StockLens Community

A social investing layer inside StockLens: posts, comments, likes, reposts,
bookmarks, follows, polls, portfolio shares + reviews, notifications,
moderation. Built on the existing stack (Next.js App Router, Supabase
Auth/Postgres/RLS, Tailwind/shadcn) and the deterministic stock-data and
portfolio-risk engines. No new external services.

> Community posts are user-generated **opinions**, not verified facts, official
> StockLens ratings, or personalized investment advice.

## Routes

| Route | Purpose |
| --- | --- |
| `/community?tab=foryou\|following\|trending\|latest` | Main feed with four filters |
| `/community/following` | Redirect to `?tab=following` |
| `/community/trending?tag=<tag>` | Posts for a hashtag (no tag → redirect to trending tab) |
| `/community/post/[id]` | Post + comment thread |
| `/community/profile/[id]` | Public investor profile |
| `/community/stock/[symbol]` | Discussions for a stock |
| `/community/portfolio/new` | Create a portfolio share (auth) |
| `/community/portfolio/[id]` | View a share + reviews |
| `/community/bookmarks` | Private bookmarks (auth) |
| `/community/notifications` | In-app notifications (auth) |
| `/community/guidelines` | Community guidelines |

Private sub-routes (`bookmarks`, `notifications`, `portfolio/new`) redirect
signed-out users to `/login?next=…` in-page. The public feed is readable signed
out; all writes require auth (enforced in server actions **and** RLS).

## Feed ranking (transparent, deterministic — no ML)

Defined in `src/lib/community/ranking.ts`:

- **Latest** — chronological, cursor paginated on `created_at`.
- **Following** — posts whose author the viewer follows, chronological.
- **Trending** — only posts created within the last **48h**
  (`TRENDING_WINDOW_HOURS`), ranked by `engagement / (ageHours + 2)`.
  Engagement = `likes·1 + reposts·2 + comments·3`.
- **For You** — `recency·2 + log1p(engagement)·1 + affinity`, where recency is a
  half-life-18h decay and affinity adds +1.5 for a followed author and +1.0 for
  a followed stock. Pure and unit-tested.

## Portfolio sharing — privacy guarantees

The key differentiator and the most security-sensitive piece.

- A share is a **dedicated, self-contained snapshot**
  (`community_portfolio_shares` + `community_portfolio_share_holdings`). It does
  **not** read the private `portfolios`/`holdings` tables at view time.
- The private portfolio/holding RLS (migrations 0004/0005) is **unchanged**.
- The real portfolio is read **once, server-side**, in `createShare` /
  `buildShareRiskSnapshot`, and only the author-selected fields are copied in.
- Disclosure is opt-in per field with least-sensitive defaults: holdings,
  allocation %, sectors, and risk metrics default **on**; quantities and
  invested amounts default **off**. Hidden fields are stored as `NULL` and are
  also re-filtered in `getShare` so a client can never receive a hidden value.
- Risk metrics come from the existing deterministic engine (concentration,
  beta, volatility) — never recomputed in an LLM.
- Shares are **revocable** (`revoked_at`); revoked/private shares are invisible
  to non-owners by RLS. The immutable snapshot survives even if the source
  portfolio is later edited or deleted (`source_portfolio_id … on delete set
  null`), so editing/deleting a portfolio never corrupts a published share.

## Safety / integrity

- One like/bookmark/follow/vote/review per (user, entity): enforced by primary
  keys / unique constraints, not frontend checks.
- One repost per (author, original): partial unique index. Reposts reference
  `repost_of`; they never duplicate editable content.
- Rate limits: 20 posts/hour, 60 comments/hour per user.
- Post bodies are rendered via `tokenizePost` → React nodes. No
  `dangerouslySetInnerHTML`; user content cannot inject markup (XSS-safe,
  unit-tested).
- Tickers are validated against the `stocks` universe before attaching; invalid
  symbols are dropped. Stock cards store a **snapshot at posting time** and are
  labeled as such — historical posts never show today's values as the original
  values. Null metrics render "Not available", never 0.
- Moderation: report post/comment/profile, block users (content hidden from the
  blocker's feeds), soft deletion (`deleted_at`) preserving an audit trail,
  moderator-only report queue via `community_moderators` + `is_community_moderator()`.

## Database migration — PREPARED, NOT APPLIED

`supabase/migrations/0013_community.sql` creates all community tables, indexes,
unique constraints, engagement-counter triggers, and RLS policies. It also adds
a **narrowly-scoped additive** `profiles public read` SELECT policy so author
display names/avatars are visible (the `profiles` table holds only
`full_name`/`avatar_url`/`created_at` — no email or auth identifiers; those live
in `auth.users`, which clients never read).

**This migration has NOT been applied to any database.** Apply it the same way
as the others (see README):

```bash
supabase db push                 # or run 0013 in the SQL editor, or psql -f
```

After applying, to grant moderator access to the report queue, insert rows into
`community_moderators` via the service role (no client write policy exists).

## Tests

- Unit (vitest): `ranking.test.ts`, `text.test.ts`, `schemas.test.ts` — feed
  ordering, XSS-safe tokenization, and post/poll/comment validation.
- E2E (Playwright): public feed + signed-out composer prompt, nav link,
  guidelines page, and auth redirects for private sub-routes.

### Not verified in this environment

- `pnpm build` / `pnpm e2e` cannot complete here because of a **pre-existing,
  unrelated, untracked** work-in-progress under `src/{app,components,lib}/debate`
  and `src/app/api/debate` that does not compile. The community code builds
  cleanly on its own (verified by temporarily setting the broken WIP aside, then
  restoring it). To run the full build/e2e, the `debate` WIP must first be fixed
  or removed by its owner.
- **RLS isolation across two real accounts is UNVERIFIED.** It requires staging
  Supabase credentials and two authenticated test users (OAuth), which are not
  available here. Required setup: apply `0013`, create two Google-auth test
  accounts, then assert (a) a user cannot UPDATE/DELETE another user's
  post/comment, (b) a private/revoked share returns no rows for a non-owner, (c)
  `show_quantities`/`show_amounts = false` never exposes those columns, (d)
  bookmarks/blocks are invisible to other users, (e) duplicate like/vote/follow
  inserts are rejected by constraints.
