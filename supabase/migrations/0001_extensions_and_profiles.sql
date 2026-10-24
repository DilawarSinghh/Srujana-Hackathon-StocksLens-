-- =============================================================================
-- 0001_extensions_and_profiles.sql
-- Extensions, profiles table, and auto-profile trigger.
-- =============================================================================

-- Required extensions.
create extension if not exists vector;      -- pgvector for embeddings
create extension if not exists pg_trgm;     -- trigram fuzzy search

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data, one row per auth user.';

-- Create a profile row automatically when a new auth user is created.
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
