-- =============================================================================
-- 0016_profile_fields.sql
-- Additive profile fields for the user Profile dashboard: bio + username.
--
-- Reuses the existing public.profiles table (full_name, avatar_url, created_at).
-- The existing "profiles update own" / "profiles select own" / "profiles public
-- read" policies (migrations 0005 / 0013) are UNCHANGED and already scope writes
-- to auth.uid() = id. profiles has NO role/authorization columns, so a normal
-- profile update can never change privileges. Email / id live in auth.users and
-- are never editable here.
-- =============================================================================

alter table public.profiles
  add column if not exists bio text,
  add column if not exists username text;

comment on column public.profiles.bio is 'Short user-authored bio (<= 300 chars; enforced in app + check below).';
comment on column public.profiles.username is 'Optional unique display handle.';

-- Bound the bio length at the DB layer too (app also validates).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_bio_len'
  ) then
    alter table public.profiles
      add constraint profiles_bio_len check (char_length(coalesce(bio, '')) <= 300);
  end if;
end $$;

-- Case-insensitive uniqueness for usernames (nullable; many rows may be null).
create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;
