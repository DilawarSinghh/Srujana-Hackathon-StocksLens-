-- =============================================================================
-- 0004_user_data.sql
-- User-owned tables: portfolios, holdings, chat_messages.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- portfolios: one or more per user.
-- -----------------------------------------------------------------------------
create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My Portfolio',
  created_at timestamptz not null default now()
);

comment on table public.portfolios is 'User portfolios.';

create index if not exists portfolios_user_id_idx on public.portfolios (user_id);

-- -----------------------------------------------------------------------------
-- holdings: positions inside a portfolio.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- chat_messages: per-user, per-stock chat history.
-- -----------------------------------------------------------------------------
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
