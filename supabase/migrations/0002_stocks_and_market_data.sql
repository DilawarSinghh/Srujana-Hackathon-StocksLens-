-- =============================================================================
-- 0002_stocks_and_market_data.sql
-- Core reference + market-data tables. All money values are in INR crore.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- stocks: the research universe.
-- -----------------------------------------------------------------------------
create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  yahoo_symbol text,
  exchange text,
  name text not null,
  sector text,
  industry text,
  cap_category text check (cap_category in ('large', 'mid', 'small')),
  currency text not null default 'INR',
  country text not null default 'IN',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.stocks is 'Research universe of listed stocks.';

-- Trigram indexes for fuzzy name/symbol search (Phase 5 autocomplete).
create index if not exists stocks_name_trgm_idx
  on public.stocks using gin (name gin_trgm_ops);
create index if not exists stocks_symbol_trgm_idx
  on public.stocks using gin (symbol gin_trgm_ops);
create index if not exists stocks_sector_idx on public.stocks (sector);
create index if not exists stocks_cap_category_idx on public.stocks (cap_category);

-- -----------------------------------------------------------------------------
-- price_history: daily OHLCV.
-- -----------------------------------------------------------------------------
create table if not exists public.price_history (
  stock_id uuid not null references public.stocks (id) on delete cascade,
  date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume numeric,
  primary key (stock_id, date)
);

comment on table public.price_history is 'Daily OHLCV price history (delayed data).';

create index if not exists price_history_date_idx on public.price_history (date);

-- -----------------------------------------------------------------------------
-- fundamentals_annual: annual financials, INR crore.
-- -----------------------------------------------------------------------------
create table if not exists public.fundamentals_annual (
  stock_id uuid not null references public.stocks (id) on delete cascade,
  fiscal_year int not null,
  revenue numeric,
  operating_profit numeric,
  net_profit numeric,
  total_debt numeric,
  total_equity numeric,
  total_assets numeric,
  current_liabilities numeric,
  operating_cash_flow numeric,
  interest_expense numeric,
  ebit numeric,
  dividends_paid numeric,
  shares_outstanding numeric,
  primary key (stock_id, fiscal_year)
);

comment on table public.fundamentals_annual is 'Annual financial statements in INR crore. NULL = not available.';

-- -----------------------------------------------------------------------------
-- stock_metrics: computed ratios, one row per stock (latest snapshot).
-- -----------------------------------------------------------------------------
create table if not exists public.stock_metrics (
  stock_id uuid primary key references public.stocks (id) on delete cascade,
  as_of date,
  price numeric,
  prev_close numeric,
  market_cap numeric,
  pe numeric,
  pb numeric,
  roe numeric,
  roce numeric,
  operating_margin numeric,
  debt_to_equity numeric,
  interest_coverage numeric,
  dividend_yield numeric,
  revenue_cagr_3y numeric,
  revenue_cagr_5y numeric,
  profit_cagr_3y numeric,
  profit_cagr_5y numeric,
  peg numeric,
  volatility_1y numeric,
  max_drawdown_3y numeric,
  beta numeric,
  week52_high numeric,
  week52_low numeric
);

comment on table public.stock_metrics is 'Code-computed ratios/metrics per stock. NULL = not available.';

-- -----------------------------------------------------------------------------
-- governance_inputs: manually entered governance data (Yahoo lacks these).
-- -----------------------------------------------------------------------------
create table if not exists public.governance_inputs (
  stock_id uuid not null references public.stocks (id) on delete cascade,
  as_of date not null,
  promoter_holding_pct numeric,
  promoter_pledge_pct numeric,
  promoter_holding_change_1y numeric,
  fii_pct numeric,
  dii_pct numeric,
  public_pct numeric,
  auditor_opinion text not null default 'unknown'
    check (auditor_opinion in ('unqualified', 'qualified', 'adverse', 'disclaimer', 'unknown')),
  related_party_trend text not null default 'unknown'
    check (related_party_trend in ('stable', 'rising', 'sharply_rising', 'unknown')),
  source_note text,
  primary key (stock_id, as_of)
);

comment on table public.governance_inputs is 'Manually entered governance data (pledge, auditor, holdings). INR percentages.';
