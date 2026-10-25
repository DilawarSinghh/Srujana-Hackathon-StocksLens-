-- =============================================================================
-- combined_migrations.sql  (GENERATED — for one-shot setup of an EMPTY database)
--
-- This concatenates migrations 0001 → 0012 in order, wrapped in a single
-- transaction. Paste the whole file into the Supabase SQL editor and run it
-- once. It is idempotent (every statement uses IF [NOT] EXISTS / OR REPLACE),
-- so re-running is safe.
--
-- Do NOT commit this generated file as a migration; the canonical source is the
-- individual files in supabase/migrations/. This is a convenience bundle only.
-- =============================================================================

begin;

-- =============================================================================
-- 0001_extensions_and_profiles.sql
-- =============================================================================
create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Public profile data, one row per auth user.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 0002_stocks_and_market_data.sql
-- =============================================================================
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

create index if not exists stocks_name_trgm_idx
  on public.stocks using gin (name gin_trgm_ops);
create index if not exists stocks_symbol_trgm_idx
  on public.stocks using gin (symbol gin_trgm_ops);
create index if not exists stocks_sector_idx on public.stocks (sector);
create index if not exists stocks_cap_category_idx on public.stocks (cap_category);

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

-- =============================================================================
-- 0003_scores_and_filings.sql
-- =============================================================================
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.stocks (id) on delete cascade,
  computed_at timestamptz not null default now(),
  total_score numeric,
  label text,
  profitability numeric,
  growth numeric,
  financial_health numeric,
  valuation numeric,
  governance numeric,
  stability numeric,
  red_flags jsonb not null default '[]'::jsonb,
  capped boolean,
  data_confidence numeric,
  sector_peer_count int,
  explanations jsonb,
  formula_version text
);
comment on table public.scores is 'Computed Fundamental Scores. One row per run; latest via latest_scores view.';
create index if not exists scores_stock_id_computed_at_idx
  on public.scores (stock_id, computed_at desc);

create or replace view public.latest_scores as
select distinct on (s.stock_id) s.*
from public.scores s
order by s.stock_id, s.computed_at desc;
comment on view public.latest_scores is 'Most recent score row per stock.';

create table if not exists public.filings (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.stocks (id) on delete cascade,
  doc_type text,
  fiscal_year int,
  title text,
  source_url text,
  storage_path text,
  content_hash text not null unique,
  created_at timestamptz not null default now()
);
comment on table public.filings is 'Ingested filing documents. content_hash makes ingestion idempotent.';
create index if not exists filings_stock_id_idx on public.filings (stock_id);

create table if not exists public.filing_chunks (
  id uuid primary key default gen_random_uuid(),
  filing_id uuid not null references public.filings (id) on delete cascade,
  stock_id uuid not null references public.stocks (id) on delete cascade,
  page_number int,
  section text,
  content text,
  has_table boolean,
  token_count int,
  embedding vector(768)
);
comment on table public.filing_chunks is 'Chunked filing text with 768-dim embeddings for RAG.';
create index if not exists filing_chunks_embedding_hnsw_idx
  on public.filing_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists filing_chunks_stock_id_idx
  on public.filing_chunks (stock_id);

create or replace function public.match_filing_chunks(
  query_embedding vector(768),
  match_stock_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  filing_id uuid,
  page_number int,
  section text,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    fc.id,
    fc.filing_id,
    fc.page_number,
    fc.section,
    fc.content,
    1 - (fc.embedding <=> query_embedding) as similarity
  from public.filing_chunks fc
  where fc.stock_id = match_stock_id
    and fc.embedding is not null
  order by fc.embedding <=> query_embedding
  limit match_count;
$$;
comment on function public.match_filing_chunks is 'Top-N filing chunks for a stock by cosine similarity.';

-- =============================================================================
-- 0004_user_data.sql
-- =============================================================================
create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My Portfolio',
  created_at timestamptz not null default now()
);
comment on table public.portfolios is 'User portfolios.';
create index if not exists portfolios_user_id_idx on public.portfolios (user_id);

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  stock_id uuid not null references public.stocks (id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  avg_buy_price numeric not null check (avg_buy_price >= 0),
  created_at timestamptz not null default now(),
  unique (portfolio_id, stock_id)
);
comment on table public.holdings is 'Stock positions within a portfolio.';
create index if not exists holdings_portfolio_id_idx on public.holdings (portfolio_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stock_id uuid not null references public.stocks (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb,
  created_at timestamptz not null default now()
);
comment on table public.chat_messages is 'Per-user, per-stock chat transcript with cited sources.';
create index if not exists chat_messages_user_stock_created_idx
  on public.chat_messages (user_id, stock_id, created_at);

-- =============================================================================
-- 0005_rls_policies.sql
-- =============================================================================
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

drop policy if exists "public read stocks" on public.stocks;
create policy "public read stocks" on public.stocks for select using (true);
drop policy if exists "public read price_history" on public.price_history;
create policy "public read price_history" on public.price_history for select using (true);
drop policy if exists "public read fundamentals_annual" on public.fundamentals_annual;
create policy "public read fundamentals_annual" on public.fundamentals_annual for select using (true);
drop policy if exists "public read stock_metrics" on public.stock_metrics;
create policy "public read stock_metrics" on public.stock_metrics for select using (true);
drop policy if exists "public read governance_inputs" on public.governance_inputs;
create policy "public read governance_inputs" on public.governance_inputs for select using (true);
drop policy if exists "public read scores" on public.scores;
create policy "public read scores" on public.scores for select using (true);
drop policy if exists "public read filings" on public.filings;
create policy "public read filings" on public.filings for select using (true);
drop policy if exists "public read filing_chunks" on public.filing_chunks;
create policy "public read filing_chunks" on public.filing_chunks for select using (true);

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "portfolios owner all" on public.portfolios;
create policy "portfolios owner all" on public.portfolios for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "holdings owner all" on public.holdings;
create policy "holdings owner all" on public.holdings for all
  using (
    exists (select 1 from public.portfolios p
      where p.id = holdings.portfolio_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.portfolios p
      where p.id = holdings.portfolio_id and p.user_id = auth.uid())
  );

drop policy if exists "chat_messages owner all" on public.chat_messages;
create policy "chat_messages owner all" on public.chat_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- 0006_storage_filings_bucket.sql
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('filings', 'filings', true)
on conflict (id) do update set public = true;

drop policy if exists "public read filings bucket" on storage.objects;
create policy "public read filings bucket"
  on storage.objects for select
  using (bucket_id = 'filings');

-- =============================================================================
-- 0007_quality_and_audit.sql
-- =============================================================================
alter table public.fundamentals_annual
  add column if not exists current_assets     numeric,
  add column if not exists gross_profit       numeric,
  add column if not exists cost_of_revenue    numeric,
  add column if not exists retained_earnings  numeric,
  add column if not exists long_term_debt     numeric,
  add column if not exists total_liabilities  numeric;

alter table public.stock_metrics
  add column if not exists piotroski_score             int,
  add column if not exists piotroski_available_criteria int,
  add column if not exists altman_z                    numeric,
  add column if not exists altman_zone                 text
    check (altman_zone in ('safe', 'grey', 'distress', 'not_applicable')),
  add column if not exists dividend_payout_ratio       numeric,
  add column if not exists dividend_safety             text
    check (dividend_safety in ('strong', 'moderate', 'weak', 'not_available'));

comment on column public.stock_metrics.piotroski_score is
  'Piotroski F-Score (0-9), code-computed. NULL when fewer than 6 criteria are available or sector is a bank/NBFC.';
comment on column public.stock_metrics.altman_z is
  'Altman Z''-Score (emerging-market variant), code-computed. NULL if any input missing.';

alter table public.chat_messages
  add column if not exists audit jsonb;
comment on column public.chat_messages.audit is
  'Fact-audit result for an assistant answer: { claims:[{sentence,status}], groundedCount, unverifiableCount }. NULL when audit did not run.';

-- =============================================================================
-- 0008_user_documents.sql
-- =============================================================================
create table if not exists public.user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  filename text not null,
  storage_path text not null,
  page_count int,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'ready', 'failed')),
  red_flags jsonb,
  summary text,
  created_at timestamptz not null default now()
);
comment on table public.user_documents is 'User-uploaded financial PDFs for private analysis.';
create index if not exists user_documents_user_id_idx
  on public.user_documents (user_id, created_at);

create table if not exists public.user_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.user_documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  page_number int,
  section text,
  content text,
  embedding vector(768)
);
comment on table public.user_document_chunks is 'Chunked user-document text with 768-dim embeddings. RLS: owner only.';
create index if not exists user_document_chunks_embedding_hnsw_idx
  on public.user_document_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists user_document_chunks_doc_idx
  on public.user_document_chunks (document_id);

alter table public.user_documents       enable row level security;
alter table public.user_document_chunks enable row level security;

drop policy if exists "user_documents owner all" on public.user_documents;
create policy "user_documents owner all" on public.user_documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_document_chunks owner all" on public.user_document_chunks;
create policy "user_document_chunks owner all" on public.user_document_chunks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.match_user_document_chunks(
  query_embedding vector(768),
  match_document_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  page_number int,
  section text,
  content text,
  similarity float
)
language sql
stable
security invoker
as $$
  select
    c.id,
    c.document_id,
    c.page_number,
    c.section,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.user_document_chunks c
  where c.document_id = match_document_id
    and c.user_id = auth.uid()
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
comment on function public.match_user_document_chunks is
  'Top-N chunks for a user document by cosine similarity, restricted to the caller (auth.uid()).';

insert into storage.buckets (id, name, public)
values ('user-docs', 'user-docs', false)
on conflict (id) do update set public = false;

drop policy if exists "user-docs read own" on storage.objects;
create policy "user-docs read own" on storage.objects for select
  using (bucket_id = 'user-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "user-docs insert own" on storage.objects;
create policy "user-docs insert own" on storage.objects for insert
  with check (bucket_id = 'user-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "user-docs update own" on storage.objects;
create policy "user-docs update own" on storage.objects for update
  using (bucket_id = 'user-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "user-docs delete own" on storage.objects;
create policy "user-docs delete own" on storage.objects for delete
  using (bucket_id = 'user-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- 0009_portfolio_profile.sql
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

alter table public.portfolio_profiles enable row level security;
drop policy if exists "portfolio_profiles owner all" on public.portfolio_profiles;
create policy "portfolio_profiles owner all" on public.portfolio_profiles for all
  using (
    exists (select 1 from public.portfolios p
      where p.id = portfolio_profiles.portfolio_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.portfolios p
      where p.id = portfolio_profiles.portfolio_id and p.user_id = auth.uid())
  );

-- =============================================================================
-- 0010_web_cache.sql
-- =============================================================================
create table if not exists public.web_cache (
  key text primary key,
  content text not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);
comment on table public.web_cache is
  'Server-only cache of web search results (30 min) and page text (6 h). Service role only; no client policies.';
create index if not exists web_cache_expires_at_idx on public.web_cache (expires_at);
alter table public.web_cache enable row level security;

-- =============================================================================
-- 0011_chat_mode.sql
-- =============================================================================
alter table public.chat_messages
  add column if not exists mode text not null default 'filings'
    check (mode in ('filings', 'web', 'portfolio'));
comment on column public.chat_messages.mode is
  'Which assistant mode produced this message: filings | web | portfolio.';
create index if not exists chat_messages_user_stock_mode_created_idx
  on public.chat_messages (user_id, stock_id, mode, created_at);

-- =============================================================================
-- 0012_chat_analysis_mode.sql
-- =============================================================================
alter table public.chat_messages
  drop constraint if exists chat_messages_mode_check;
alter table public.chat_messages
  add constraint chat_messages_mode_check
    check (mode in ('analysis', 'filings', 'web', 'portfolio'));
comment on column public.chat_messages.mode is
  'Which assistant mode produced this message: analysis | filings | web | portfolio.';

commit;
