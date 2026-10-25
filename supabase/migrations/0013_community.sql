-- =============================================================================
-- 0013_community.sql
-- StockLens Community: a social investing layer (posts, comments, likes,
-- reposts, bookmarks, follows, polls, portfolio shares + reviews, notifications,
-- reports, blocks).
--
-- Design principles (see docs/COMMUNITY.md):
--   * Additive only. Never edits prior migrations. Private portfolio/holding
--     RLS (migrations 0004/0005) is UNCHANGED.
--   * Portfolio sharing uses a DEDICATED snapshot entity. A public share never
--     reads the private `portfolios`/`holdings` tables; the author deliberately
--     copies only the fields they choose into community_portfolio_shares /
--     _holdings, which have their own, narrower RLS.
--   * One like / bookmark / follow / vote per (user, entity) is enforced by
--     UNIQUE constraints, not frontend checks.
--   * Server-side authorization via RLS on `auth.uid()`; UI controls are never
--     the only guard.
--   * Soft deletion (deleted_at) preserves moderation audit while hiding
--     content from feeds.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Post type + stance enums as CHECK constraints (project convention: text +
-- check, no pg enums — matches governance_inputs / chat_messages).
-- -----------------------------------------------------------------------------

-- community_posts: the core feed item.
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  post_type text not null default 'discussion'
    check (post_type in ('discussion', 'thesis', 'analysis', 'portfolio_review', 'poll')),
  body text not null check (char_length(body) <= 5000),
  -- Thesis fields (optional; only meaningful for post_type = 'thesis').
  stance text check (stance in ('bullish', 'bearish', 'neutral')),
  time_horizon text,
  thesis_risks text check (char_length(coalesce(thesis_risks, '')) <= 2000),
  -- Reposts reference the original post rather than duplicating its content.
  repost_of uuid references public.community_posts (id) on delete set null,
  -- Link to a portfolio share (portfolio_review) — snapshot entity, never the
  -- private portfolio.
  portfolio_share_id uuid,
  -- Denormalized engagement counters, maintained by triggers below. Reads stay
  -- cheap; the source of truth is still the child tables.
  like_count int not null default 0,
  comment_count int not null default 0,
  repost_count int not null default 0,
  -- Extracted #hashtags and $cashtags (validated tickers) for fast filtering.
  hashtags text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

comment on table public.community_posts is
  'Community feed posts. Reposts reference repost_of. Soft-deleted via deleted_at.';

create index if not exists community_posts_created_idx
  on public.community_posts (created_at desc) where deleted_at is null;
create index if not exists community_posts_author_idx
  on public.community_posts (author_id, created_at desc) where deleted_at is null;
create index if not exists community_posts_type_idx
  on public.community_posts (post_type, created_at desc) where deleted_at is null;
create index if not exists community_posts_repost_idx
  on public.community_posts (repost_of);
create index if not exists community_posts_hashtags_idx
  on public.community_posts using gin (hashtags);

-- community_post_stocks: tickers attached to a post, with a SNAPSHOT of the
-- stock card at posting time so historical posts don't silently show today's
-- values. `snapshot` is a jsonb copy of selected, available metrics as-of the
-- capture date; nulls are preserved (never coerced to 0).
create table if not exists public.community_post_stocks (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  stock_id uuid not null references public.stocks (id) on delete cascade,
  snapshot jsonb,            -- { price, as_of, pe, roe, ..., score, label } or null fields preserved
  captured_at timestamptz not null default now(),
  primary key (post_id, stock_id)
);

comment on table public.community_post_stocks is
  'Validated tickers on a post with a point-in-time snapshot of the stock card.';

create index if not exists community_post_stocks_stock_idx
  on public.community_post_stocks (stock_id);

-- community_comments: threaded comments (reasonable nesting via parent_id).
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.community_comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  -- 0 = top level, 1 = reply. The app caps nesting at depth 1.
  depth int not null default 0 check (depth in (0, 1)),
  like_count int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

comment on table public.community_comments is
  'Comments on posts. parent_id for one level of replies (depth 0/1).';

create index if not exists community_comments_post_idx
  on public.community_comments (post_id, created_at) where deleted_at is null;
create index if not exists community_comments_parent_idx
  on public.community_comments (parent_id);

-- community_post_likes: one like per (user, post).
create table if not exists public.community_post_likes (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- community_comment_likes: one like per (user, comment).
create table if not exists public.community_comment_likes (
  comment_id uuid not null references public.community_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- community_bookmarks: private to the owner. One per (user, post).
create table if not exists public.community_bookmarks (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- community_follows: user-follows-user. One per (follower, followee).
create table if not exists public.community_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index if not exists community_follows_followee_idx
  on public.community_follows (followee_id);

-- community_stock_follows: user-follows-stock. One per (user, stock).
create table if not exists public.community_stock_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  stock_id uuid not null references public.stocks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, stock_id)
);

-- community_polls: a poll belongs to a post (post_type = 'poll').
create table if not exists public.community_polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.community_posts (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 300),
  closes_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.community_polls (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  position int not null,
  unique (poll_id, position)
);

-- One vote per (poll, user) — DB-enforced, not just frontend.
create table if not exists public.community_poll_votes (
  poll_id uuid not null references public.community_polls (id) on delete cascade,
  option_id uuid not null references public.community_poll_options (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index if not exists community_poll_votes_option_idx
  on public.community_poll_votes (option_id);

-- ---------------------------------------------------------------------------
-- Portfolio sharing: a DEDICATED, revocable snapshot. Never exposes the
-- private portfolio. The author selects which fields to disclose; only those
-- are copied here. `source_portfolio_id` is kept for the owner's reference and
-- is NEVER selected by public queries / RLS.
-- ---------------------------------------------------------------------------
create table if not exists public.community_portfolio_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Reference only; not exposed publicly. Set null if the portfolio is deleted
  -- so the immutable snapshot survives (share is self-contained).
  source_portfolio_id uuid references public.portfolios (id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  notes text check (char_length(coalesce(notes, '')) <= 1000),
  visibility text not null default 'public'
    check (visibility in ('public', 'unlisted', 'private')),
  is_hypothetical boolean not null default false,
  -- Disclosure flags: default to the least sensitive useful disclosure.
  show_holdings boolean not null default true,
  show_quantities boolean not null default false,
  show_amounts boolean not null default false,
  show_allocations boolean not null default true,
  show_sectors boolean not null default true,
  show_risk_metrics boolean not null default true,
  -- Portfolio-review request context (optional).
  objective text,
  horizon text,
  risk_tolerance text,
  feedback_wanted text,
  -- Snapshot of deterministic StockLens risk metrics at publish time (jsonb;
  -- nulls preserved). NEVER recomputed in the LLM.
  risk_snapshot jsonb,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.community_portfolio_shares is
  'Revocable public snapshot of a portfolio. Self-contained; never reads the private portfolio. Only author-selected fields are stored/shown.';

create index if not exists community_portfolio_shares_owner_idx
  on public.community_portfolio_shares (owner_id);

-- Immutable per-holding snapshot rows. Quantity/amount columns are only
-- populated when the author enabled those disclosures.
create table if not exists public.community_portfolio_share_holdings (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.community_portfolio_shares (id) on delete cascade,
  symbol text not null,
  name text,
  sector text,
  allocation_pct numeric,      -- populated only if show_allocations
  quantity numeric,            -- populated only if show_quantities
  invested_amount numeric,     -- populated only if show_amounts
  position int not null default 0
);

create index if not exists community_portfolio_share_holdings_share_idx
  on public.community_portfolio_share_holdings (share_id);

-- Structured community reviews of a share.
create table if not exists public.community_portfolio_reviews (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.community_portfolio_shares (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id) on delete cascade,
  diversification_rating int check (diversification_rating between 1 and 5),
  concentration_rating int check (concentration_rating between 1 and 5),
  sector_balance_rating int check (sector_balance_rating between 1 and 5),
  risk_alignment_rating int check (risk_alignment_rating between 1 and 5),
  comment text check (char_length(coalesce(comment, '')) <= 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  -- One review per reviewer per share.
  unique (share_id, reviewer_id)
);

create index if not exists community_portfolio_reviews_share_idx
  on public.community_portfolio_reviews (share_id, created_at);

-- Now that the share table exists, add the FK from posts.
alter table public.community_posts
  drop constraint if exists community_posts_portfolio_share_fk;
alter table public.community_posts
  add constraint community_posts_portfolio_share_fk
    foreign key (portfolio_share_id)
    references public.community_portfolio_shares (id) on delete set null;

-- community_notifications: per-recipient in-app notifications.
create table if not exists public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  type text not null
    check (type in ('follow', 'reply', 'mention', 'like', 'repost', 'review', 'poll_closed')),
  -- Soft links; the app resolves these to routes.
  post_id uuid references public.community_posts (id) on delete cascade,
  comment_id uuid references public.community_comments (id) on delete cascade,
  share_id uuid references public.community_portfolio_shares (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists community_notifications_recipient_idx
  on public.community_notifications (recipient_id, created_at desc);
create index if not exists community_notifications_unread_idx
  on public.community_notifications (recipient_id) where read_at is null;

-- Prevent duplicate notifications for the same actor/type/target in a burst.
create unique index if not exists community_notifications_dedup_idx
  on public.community_notifications (
    recipient_id, actor_id, type,
    coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- community_reports: user reports of content for moderation.
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'profile')),
  post_id uuid references public.community_posts (id) on delete cascade,
  comment_id uuid references public.community_comments (id) on delete cascade,
  target_user_id uuid references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists community_reports_status_idx
  on public.community_reports (status, created_at);

-- community_blocks: one user blocking another. One per (blocker, blocked).
create table if not exists public.community_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- community_moderators: who may read the report queue. Managed by service role.
create table if not exists public.community_moderators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- Engagement counter triggers (keep denormalized counts consistent).
-- ===========================================================================
create or replace function public.community_bump_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.community_posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end; $$;

drop trigger if exists community_post_likes_count on public.community_post_likes;
create trigger community_post_likes_count
  after insert or delete on public.community_post_likes
  for each row execute function public.community_bump_like_count();

create or replace function public.community_bump_comment_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.community_comments set like_count = like_count + 1 where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.community_comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end; $$;

drop trigger if exists community_comment_likes_count on public.community_comment_likes;
create trigger community_comment_likes_count
  after insert or delete on public.community_comment_likes
  for each row execute function public.community_bump_comment_like_count();

create or replace function public.community_bump_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.community_posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end; $$;

drop trigger if exists community_comments_count on public.community_comments;
create trigger community_comments_count
  after insert or delete on public.community_comments
  for each row execute function public.community_bump_comment_count();

create or replace function public.community_bump_repost_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.repost_of is not null then
    update public.community_posts set repost_count = repost_count + 1 where id = new.repost_of;
  elsif tg_op = 'DELETE' and old.repost_of is not null then
    update public.community_posts set repost_count = greatest(repost_count - 1, 0) where id = old.repost_of;
  end if;
  return null;
end; $$;

drop trigger if exists community_posts_repost_count on public.community_posts;
create trigger community_posts_repost_count
  after insert or delete on public.community_posts
  for each row execute function public.community_bump_repost_count();

-- One repost per (author, original). Partial unique index on reposts only.
create unique index if not exists community_posts_one_repost_idx
  on public.community_posts (author_id, repost_of)
  where repost_of is not null;

-- ===========================================================================
-- Row Level Security.
-- Model:
--   posts/comments        : anyone may SELECT non-deleted rows (public read);
--                           author may INSERT/UPDATE/DELETE own rows.
--   likes/reposts/bookmarks/follows/votes : user manages own rows; bookmarks
--                           and blocks are private to the owner.
--   portfolio shares      : public/unlisted shares are world-readable; private
--                           shares and the owner's rows are owner-only. Holdings
--                           inherit the parent share's visibility.
--   notifications/reports : owner/reporter only (reports: moderators may read).
-- ===========================================================================
alter table public.community_posts                    enable row level security;
alter table public.community_post_stocks              enable row level security;
alter table public.community_comments                 enable row level security;
alter table public.community_post_likes               enable row level security;
alter table public.community_comment_likes            enable row level security;
alter table public.community_bookmarks                enable row level security;
alter table public.community_follows                  enable row level security;
alter table public.community_stock_follows            enable row level security;
alter table public.community_polls                    enable row level security;
alter table public.community_poll_options             enable row level security;
alter table public.community_poll_votes               enable row level security;
alter table public.community_portfolio_shares         enable row level security;
alter table public.community_portfolio_share_holdings enable row level security;
alter table public.community_portfolio_reviews        enable row level security;
alter table public.community_notifications            enable row level security;
alter table public.community_reports                  enable row level security;
alter table public.community_blocks                   enable row level security;
alter table public.community_moderators               enable row level security;

-- Helper: is the calling user a moderator?
create or replace function public.is_community_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_moderators m where m.user_id = auth.uid()
  );
$$;

-- posts --------------------------------------------------------------------
drop policy if exists "posts public read" on public.community_posts;
create policy "posts public read"
  on public.community_posts for select
  using (deleted_at is null or author_id = auth.uid() or public.is_community_moderator());

drop policy if exists "posts insert own" on public.community_posts;
create policy "posts insert own"
  on public.community_posts for insert
  with check (author_id = auth.uid());

drop policy if exists "posts update own" on public.community_posts;
create policy "posts update own"
  on public.community_posts for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "posts delete own or mod" on public.community_posts;
create policy "posts delete own or mod"
  on public.community_posts for delete
  using (author_id = auth.uid() or public.is_community_moderator());

-- post_stocks: readable with the parent post; writable by the post author.
drop policy if exists "post_stocks read" on public.community_post_stocks;
create policy "post_stocks read"
  on public.community_post_stocks for select using (true);

drop policy if exists "post_stocks author write" on public.community_post_stocks;
create policy "post_stocks author write"
  on public.community_post_stocks for all
  using (exists (select 1 from public.community_posts p
                 where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.community_posts p
                 where p.id = post_id and p.author_id = auth.uid()));

-- comments -----------------------------------------------------------------
drop policy if exists "comments public read" on public.community_comments;
create policy "comments public read"
  on public.community_comments for select
  using (deleted_at is null or author_id = auth.uid() or public.is_community_moderator());

drop policy if exists "comments insert own" on public.community_comments;
create policy "comments insert own"
  on public.community_comments for insert with check (author_id = auth.uid());

drop policy if exists "comments update own" on public.community_comments;
create policy "comments update own"
  on public.community_comments for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "comments delete own or mod" on public.community_comments;
create policy "comments delete own or mod"
  on public.community_comments for delete
  using (author_id = auth.uid() or public.is_community_moderator());

-- post likes ---------------------------------------------------------------
drop policy if exists "post_likes read" on public.community_post_likes;
create policy "post_likes read" on public.community_post_likes for select using (true);
drop policy if exists "post_likes write own" on public.community_post_likes;
create policy "post_likes write own" on public.community_post_likes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- comment likes ------------------------------------------------------------
drop policy if exists "comment_likes read" on public.community_comment_likes;
create policy "comment_likes read" on public.community_comment_likes for select using (true);
drop policy if exists "comment_likes write own" on public.community_comment_likes;
create policy "comment_likes write own" on public.community_comment_likes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- bookmarks: PRIVATE to the owner (read + write).
drop policy if exists "bookmarks owner all" on public.community_bookmarks;
create policy "bookmarks owner all" on public.community_bookmarks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- follows: public read (follower lists), owner manages own follow rows.
drop policy if exists "follows read" on public.community_follows;
create policy "follows read" on public.community_follows for select using (true);
drop policy if exists "follows write own" on public.community_follows;
create policy "follows write own" on public.community_follows for all
  using (follower_id = auth.uid()) with check (follower_id = auth.uid());

-- stock follows: owner only (both read and write).
drop policy if exists "stock_follows owner all" on public.community_stock_follows;
create policy "stock_follows owner all" on public.community_stock_follows for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- polls + options: public read; author (post owner) writes.
drop policy if exists "polls read" on public.community_polls;
create policy "polls read" on public.community_polls for select using (true);
drop policy if exists "polls author write" on public.community_polls;
create policy "polls author write" on public.community_polls for all
  using (exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = auth.uid()));

drop policy if exists "poll_options read" on public.community_poll_options;
create policy "poll_options read" on public.community_poll_options for select using (true);
drop policy if exists "poll_options author write" on public.community_poll_options;
create policy "poll_options author write" on public.community_poll_options for all
  using (exists (select 1 from public.community_polls pl
                 join public.community_posts p on p.id = pl.post_id
                 where pl.id = poll_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.community_polls pl
                 join public.community_posts p on p.id = pl.post_id
                 where pl.id = poll_id and p.author_id = auth.uid()));

-- poll votes: public read (aggregate results), one row per user enforced by PK.
drop policy if exists "poll_votes read" on public.community_poll_votes;
create policy "poll_votes read" on public.community_poll_votes for select using (true);
drop policy if exists "poll_votes write own" on public.community_poll_votes;
create policy "poll_votes write own" on public.community_poll_votes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- portfolio shares: public/unlisted readable by anyone; private + all writes
-- restricted to the owner. (Unlisted is link-only at the app layer; it is not
-- secret, matching the task's "unlisted if supported safely".)
drop policy if exists "shares read public" on public.community_portfolio_shares;
create policy "shares read public"
  on public.community_portfolio_shares for select
  using (
    (revoked_at is null and visibility in ('public', 'unlisted'))
    or owner_id = auth.uid()
  );

drop policy if exists "shares write own" on public.community_portfolio_shares;
create policy "shares write own"
  on public.community_portfolio_shares for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- share holdings: readable iff the parent share is readable; writable by owner.
drop policy if exists "share_holdings read" on public.community_portfolio_share_holdings;
create policy "share_holdings read"
  on public.community_portfolio_share_holdings for select
  using (exists (
    select 1 from public.community_portfolio_shares s
    where s.id = share_id
      and ((s.revoked_at is null and s.visibility in ('public', 'unlisted'))
           or s.owner_id = auth.uid())
  ));

drop policy if exists "share_holdings write own" on public.community_portfolio_share_holdings;
create policy "share_holdings write own"
  on public.community_portfolio_share_holdings for all
  using (exists (select 1 from public.community_portfolio_shares s
                 where s.id = share_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.community_portfolio_shares s
                 where s.id = share_id and s.owner_id = auth.uid()));

-- reviews: readable iff the parent share is readable; reviewer manages own row.
drop policy if exists "reviews read" on public.community_portfolio_reviews;
create policy "reviews read"
  on public.community_portfolio_reviews for select
  using (
    deleted_at is null
    and exists (
      select 1 from public.community_portfolio_shares s
      where s.id = share_id
        and ((s.revoked_at is null and s.visibility in ('public', 'unlisted'))
             or s.owner_id = auth.uid())
    )
  );

drop policy if exists "reviews write own" on public.community_portfolio_reviews;
create policy "reviews write own"
  on public.community_portfolio_reviews for all
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());

-- notifications: recipient only.
drop policy if exists "notifications owner all" on public.community_notifications;
create policy "notifications owner all" on public.community_notifications for all
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- reports: reporter may insert + read own; moderators may read all.
drop policy if exists "reports insert own" on public.community_reports;
create policy "reports insert own" on public.community_reports for insert
  with check (reporter_id = auth.uid());
drop policy if exists "reports read own or mod" on public.community_reports;
create policy "reports read own or mod" on public.community_reports for select
  using (reporter_id = auth.uid() or public.is_community_moderator());
drop policy if exists "reports update mod" on public.community_reports;
create policy "reports update mod" on public.community_reports for update
  using (public.is_community_moderator()) with check (public.is_community_moderator());

-- blocks: PRIVATE to the blocker.
drop policy if exists "blocks owner all" on public.community_blocks;
create policy "blocks owner all" on public.community_blocks for all
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- moderators: readable by the user themselves (to check their own role).
-- Rows are inserted/removed by the service role only (no client write policy).
drop policy if exists "moderators read self" on public.community_moderators;
create policy "moderators read self" on public.community_moderators for select
  using (user_id = auth.uid() or public.is_community_moderator());

-- ---------------------------------------------------------------------------
-- Narrowly-scoped change to public.profiles (migration 0001/0005):
-- Community needs public display names + avatars for post authors. The
-- profiles table contains ONLY full_name, avatar_url, created_at — no email,
-- no auth identifiers (those live in auth.users, which is never client-
-- readable). Adding a public SELECT policy here exposes only those display
-- fields. The existing "profiles select own" / "profiles update own" policies
-- are left intact; this is purely additive (a second, permissive SELECT policy
-- — Postgres ORs multiple permissive policies).
-- ---------------------------------------------------------------------------
drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read"
  on public.profiles for select
  using (true);
