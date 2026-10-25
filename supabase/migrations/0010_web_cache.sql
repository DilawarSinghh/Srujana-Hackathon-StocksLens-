-- =============================================================================
-- 0010_web_cache.sql
-- Server-only cache for Web Research mode: search results and fetched page
-- text, keyed by a hash of the query or URL.
--
-- RLS is ENABLED with NO client policies: only the service role (server) can
-- read or write. Cached web content must never be exposed directly to clients.
-- Additive only.
-- =============================================================================

create table if not exists public.web_cache (
  key text primary key,            -- sha256 hash of "search:<query>" or "page:<url>"
  content text not null,           -- JSON (search results) or extracted page text
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.web_cache is
  'Server-only cache of web search results (30 min) and page text (6 h). Service role only; no client policies.';

create index if not exists web_cache_expires_at_idx
  on public.web_cache (expires_at);

-- RLS on, but intentionally NO policies -> anon/authenticated clients get zero
-- rows. The service-role key (server) bypasses RLS and is the only writer/reader.
alter table public.web_cache enable row level security;
