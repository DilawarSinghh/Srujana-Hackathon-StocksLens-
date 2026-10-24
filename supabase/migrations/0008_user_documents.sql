-- =============================================================================
-- 0008_user_documents.sql
-- User-uploaded PDFs: documents, chunks, RLS, private storage bucket, and a
-- retrieval function that enforces ownership.
--
-- Additive only. Every table has RLS enabled and is scoped to auth.uid().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_documents: one row per uploaded PDF.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- user_document_chunks: chunked + embedded text of a user's document.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- RLS: owner-only for both tables (all operations).
-- -----------------------------------------------------------------------------
alter table public.user_documents       enable row level security;
alter table public.user_document_chunks enable row level security;

drop policy if exists "user_documents owner all" on public.user_documents;
create policy "user_documents owner all"
  on public.user_documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_document_chunks owner all" on public.user_document_chunks;
create policy "user_document_chunks owner all"
  on public.user_document_chunks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- match_user_document_chunks: cosine retrieval, scoped to one document AND
-- to the calling user (auth.uid()). Runs as the invoker so RLS + the explicit
-- user_id predicate both apply.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Private "user-docs" storage bucket with per-user folder access.
-- Objects are stored at <user_id>/<document_id>.pdf. Policies restrict every
-- operation to objects whose first path segment equals the caller's uid.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('user-docs', 'user-docs', false)
on conflict (id) do update set public = false;

drop policy if exists "user-docs read own" on storage.objects;
create policy "user-docs read own"
  on storage.objects for select
  using (
    bucket_id = 'user-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user-docs insert own" on storage.objects;
create policy "user-docs insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'user-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user-docs update own" on storage.objects;
create policy "user-docs update own"
  on storage.objects for update
  using (
    bucket_id = 'user-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user-docs delete own" on storage.objects;
create policy "user-docs delete own"
  on storage.objects for delete
  using (
    bucket_id = 'user-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
