-- =============================================================================
-- 0003_scores_and_filings.sql
-- Fundamental scores, filings, and vector-embedded filing chunks.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- scores: one row per scoring run per stock.
-- -----------------------------------------------------------------------------
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

-- Newest score row per stock.
create or replace view public.latest_scores as
select distinct on (s.stock_id) s.*
from public.scores s
order by s.stock_id, s.computed_at desc;

comment on view public.latest_scores is 'Most recent score row per stock.';

-- -----------------------------------------------------------------------------
-- filings: ingested source documents.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- filing_chunks: chunked + embedded filing text.
-- -----------------------------------------------------------------------------
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

-- HNSW index for cosine-similarity vector search.
create index if not exists filing_chunks_embedding_hnsw_idx
  on public.filing_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists filing_chunks_stock_id_idx
  on public.filing_chunks (stock_id);

-- -----------------------------------------------------------------------------
-- match_filing_chunks: cosine-similarity retrieval, scoped to one stock.
-- -----------------------------------------------------------------------------
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
