-- =============================================================================
-- 0005_rls_policies.sql
-- Row Level Security on EVERY table.
--
-- Model:
--   Public reference/market data  -> public SELECT only, no client writes.
--   profiles                      -> user reads/updates own row.
--   portfolios, holdings,
--   chat_messages                 -> full access only to the owning user.
--
-- Writes to public data happen via the service role key (scripts/server),
-- which bypasses RLS. No client-facing INSERT/UPDATE/DELETE policies exist on
-- those tables, so anon/authenticated clients can read but never write.
-- =============================================================================

-- Enable RLS everywhere.
alter table public.profiles            enable row level security;
alter table public.stocks              enable row level security;
alter table public.price_history       enable row level security;
alter table public.fundamentals_annual enable row level security;
alter table public.stock_metrics       enable row level security;
alter table public.governance_inputs   enable row level security;
alter table public.scores              enable row level security;
alter table public.filings             enable row level security;
alter table public.filing_chunks       enable row level security;
alter table public.portfolios          enable row level security;
alter table public.holdings            enable row level security;
alter table public.chat_messages       enable row level security;

-- -----------------------------------------------------------------------------
-- Public read-only tables.
-- -----------------------------------------------------------------------------
drop policy if exists "public read stocks" on public.stocks;
create policy "public read stocks"
  on public.stocks for select using (true);

drop policy if exists "public read price_history" on public.price_history;
create policy "public read price_history"
  on public.price_history for select using (true);

drop policy if exists "public read fundamentals_annual" on public.fundamentals_annual;
create policy "public read fundamentals_annual"
  on public.fundamentals_annual for select using (true);

drop policy if exists "public read stock_metrics" on public.stock_metrics;
create policy "public read stock_metrics"
  on public.stock_metrics for select using (true);

drop policy if exists "public read governance_inputs" on public.governance_inputs;
create policy "public read governance_inputs"
  on public.governance_inputs for select using (true);

drop policy if exists "public read scores" on public.scores;
create policy "public read scores"
  on public.scores for select using (true);

drop policy if exists "public read filings" on public.filings;
create policy "public read filings"
  on public.filings for select using (true);

drop policy if exists "public read filing_chunks" on public.filing_chunks;
create policy "public read filing_chunks"
  on public.filing_chunks for select using (true);

-- -----------------------------------------------------------------------------
-- profiles: user reads/updates own row.
-- -----------------------------------------------------------------------------
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- portfolios: all operations only for the owner.
-- -----------------------------------------------------------------------------
drop policy if exists "portfolios owner all" on public.portfolios;
create policy "portfolios owner all"
  on public.portfolios for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- holdings: access only through a parent portfolio owned by the user.
-- -----------------------------------------------------------------------------
drop policy if exists "holdings owner all" on public.holdings;
create policy "holdings owner all"
  on public.holdings for all
  using (
    exists (
      select 1 from public.portfolios p
      where p.id = holdings.portfolio_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.portfolios p
      where p.id = holdings.portfolio_id
        and p.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- chat_messages: all operations only for the owner.
-- -----------------------------------------------------------------------------
drop policy if exists "chat_messages owner all" on public.chat_messages;
create policy "chat_messages owner all"
  on public.chat_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
