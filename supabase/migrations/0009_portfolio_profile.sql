-- =============================================================================
-- 0009_portfolio_profile.sql
-- Per-portfolio investor profile (risk tolerance, horizon, liquidity need) for
-- goal-conflict warnings. Owner-only RLS. Additive; never edits prior migrations.
-- =============================================================================

create table if not exists public.portfolio_profiles (
  portfolio_id uuid primary key references public.portfolios (id) on delete cascade,
  risk_tolerance text not null default 'moderate'
    check (risk_tolerance in ('conservative', 'moderate', 'aggressive')),
  horizon_years int not null default 5
    check (horizon_years >= 1 and horizon_years <= 40),
  liquidity_need_pct numeric not null default 0
    check (liquidity_need_pct >= 0 and liquidity_need_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portfolio_profiles is
  'Investor profile per portfolio: risk tolerance, horizon, near-term liquidity need. Drives goal-conflict warnings.';

-- -----------------------------------------------------------------------------
-- RLS: access only through a portfolio owned by the calling user.
-- -----------------------------------------------------------------------------
alter table public.portfolio_profiles enable row level security;

drop policy if exists "portfolio_profiles owner all" on public.portfolio_profiles;
create policy "portfolio_profiles owner all"
  on public.portfolio_profiles for all
  using (
    exists (
      select 1 from public.portfolios p
      where p.id = portfolio_profiles.portfolio_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.portfolios p
      where p.id = portfolio_profiles.portfolio_id
        and p.user_id = auth.uid()
    )
  );
