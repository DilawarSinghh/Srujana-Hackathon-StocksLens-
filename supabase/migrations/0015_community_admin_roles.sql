-- =============================================================================
-- 0015_community_admin_roles.sql
-- Community super-admin role, DB-backed bootstrap, least-privilege role
-- management + moderation RPCs, and an audit log.
--
-- Design (additive; nothing in prior migrations is edited destructively):
--   * A super-admin is a row in public.community_admins. Admin status is NEVER
--     grantable through an RPC — the only way to become an admin is the
--     allowlist bootstrap below — so no user/moderator can escalate to admin.
--   * Bootstrap: public.community_admin_emails holds the designated admin
--     email(s). A SECURITY DEFINER function resolves the CALLER's own email
--     from auth.users (server-trusted, never a client-supplied string) and, if
--     it is on the allowlist, inserts the caller into community_admins. The app
--     calls this once when the admin visits the admin area.
--   * Admins implicitly satisfy is_community_moderator(), so every existing
--     moderator policy and the 0014 soft-delete RPCs work for the admin too
--     (full moderation authority) with no new broad UPDATE policies.
--   * Role management (add/remove moderator) is admin-only, enforced INSIDE
--     SECURITY DEFINER functions; the super-admin can never be demoted/removed
--     by these functions, and moderators cannot self-promote.
--   * Restoration (un-delete) and report handling are admin-/moderator-gated.
--   * Every privileged action is recorded in community_audit_log.
--
-- Does NOT change authentication, financial scoring, portfolio risk, or
-- unrelated RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- community_admins: the super-admin registry. Service-role / bootstrap managed.
-- -----------------------------------------------------------------------------
create table if not exists public.community_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.community_admins is
  'Community super-admins. Populated only via the allowlist bootstrap; never by an RPC.';

alter table public.community_admins enable row level security;

-- A user may see whether THEY are an admin; admins may read all admin rows.
drop policy if exists "admins read self or admin" on public.community_admins;
create policy "admins read self or admin" on public.community_admins for select
  using (user_id = auth.uid() or public.is_community_admin());
-- No client INSERT/UPDATE/DELETE policy: writes happen only via the bootstrap
-- SECURITY DEFINER function or the service role.

-- -----------------------------------------------------------------------------
-- community_admin_emails: the bootstrap allowlist. Seeded with the designated
-- super-admin. Service-role managed (no client policies at all → RLS denies
-- every client read/write; only the definer bootstrap function, which runs as
-- its owner, can read it).
-- -----------------------------------------------------------------------------
create table if not exists public.community_admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);
comment on table public.community_admin_emails is
  'Allowlist of emails permitted to bootstrap into community_admins.';

alter table public.community_admin_emails enable row level security;
-- (Intentionally no policies → no client access; definer functions bypass RLS.)

insert into public.community_admin_emails (email)
values ('singhdilawar.10540@gmail.com')
on conflict (email) do nothing;

-- -----------------------------------------------------------------------------
-- community_audit_log: append-only record of privileged actions.
-- -----------------------------------------------------------------------------
create table if not exists public.community_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_user_id uuid,
  target_type text,
  target_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);
comment on table public.community_audit_log is
  'Append-only audit of privileged community actions (role changes, moderation).';

create index if not exists community_audit_log_created_idx
  on public.community_audit_log (created_at desc);

alter table public.community_audit_log enable row level security;
-- Admins/moderators may read the audit log; no client write policy (writes are
-- done inside the SECURITY DEFINER functions below).
drop policy if exists "audit read mod" on public.community_audit_log;
create policy "audit read mod" on public.community_audit_log for select
  using (public.is_community_moderator());

-- -----------------------------------------------------------------------------
-- is_community_admin(): true when the caller is a super-admin.
-- -----------------------------------------------------------------------------
create or replace function public.is_community_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_admins a where a.user_id = auth.uid()
  );
$$;
comment on function public.is_community_admin() is
  'True when the calling user (auth.uid()) is a community super-admin.';

-- -----------------------------------------------------------------------------
-- is_community_moderator(): REDEFINED (create or replace) so admins implicitly
-- count as moderators. This keeps every existing moderator RLS policy and the
-- 0014 soft-delete RPCs working for the admin without any new UPDATE policy.
-- (Original definition: membership in community_moderators only.)
-- -----------------------------------------------------------------------------
create or replace function public.is_community_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_moderators m where m.user_id = auth.uid()
  ) or exists (
    select 1 from public.community_admins a where a.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- Internal audit writer (definer; callable only from the functions below).
-- -----------------------------------------------------------------------------
create or replace function public.community_audit(
  p_action text, p_target_user uuid, p_target_type text, p_target_id uuid, p_detail jsonb
) returns void language sql volatile security definer set search_path = public as $$
  insert into public.community_audit_log (actor_id, action, target_user_id, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_user, p_target_type, p_target_id, p_detail);
$$;
revoke all on function public.community_audit(text, uuid, text, uuid, jsonb) from public;

-- -----------------------------------------------------------------------------
-- ensure_community_admin_bootstrap(): self-promote the CALLER to super-admin
-- IFF their auth.users email is on the allowlist. Email is read server-side
-- from auth.users (trusted), never from a client argument. Idempotent.
-- Returns true when the caller is (now) an admin.
-- -----------------------------------------------------------------------------
create or replace function public.ensure_community_admin_bootstrap()
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  allowed boolean;
begin
  if caller is null then
    return false;
  end if;

  select u.email into caller_email from auth.users u where u.id = caller;
  if caller_email is null then
    return false;
  end if;

  select exists (
    select 1 from public.community_admin_emails e
    where lower(e.email) = lower(caller_email)
  ) into allowed;

  if not allowed then
    -- Not on the allowlist → caller is an admin only if already registered.
    return public.is_community_admin();
  end if;

  insert into public.community_admins (user_id)
  values (caller)
  on conflict (user_id) do nothing;

  if found then
    perform public.community_audit('admin_bootstrap', caller, 'user', caller, null);
  end if;
  return true;
end;
$$;
revoke all on function public.ensure_community_admin_bootstrap() from public;
grant execute on function public.ensure_community_admin_bootstrap() to authenticated;

-- -----------------------------------------------------------------------------
-- admin_set_moderator(target uuid, make_moderator boolean): add/remove a
-- moderator. Admin-only (checked inside). The super-admin can never be removed
-- as a moderator via this path, and admins are never demoted here (admin status
-- lives in a separate table this function does not touch). Returns true when a
-- change was applied.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_moderator(target_user uuid, make_moderator boolean)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  affected int := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_community_admin() then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if target_user is null then
    raise exception 'invalid target' using errcode = '22023';
  end if;

  if make_moderator then
    insert into public.community_moderators (user_id)
    values (target_user)
    on conflict (user_id) do nothing;
    get diagnostics affected = row_count;
    if affected > 0 then
      perform public.community_audit('moderator_added', target_user, 'user', target_user, null);
    end if;
  else
    -- Refuse to strip moderator powers from a super-admin (defense in depth:
    -- their moderator capability also derives from admin status, but we keep
    -- the explicit guard so the intent is unambiguous).
    if exists (select 1 from public.community_admins a where a.user_id = target_user) then
      raise exception 'cannot demote a super-admin' using errcode = '42501';
    end if;
    delete from public.community_moderators where user_id = target_user;
    get diagnostics affected = row_count;
    if affected > 0 then
      perform public.community_audit('moderator_removed', target_user, 'user', target_user, null);
    end if;
  end if;

  return affected > 0;
end;
$$;
revoke all on function public.admin_set_moderator(uuid, boolean) from public;
grant execute on function public.admin_set_moderator(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_restore_post / admin_restore_comment: un-soft-delete (deleted_at=null).
-- Moderator-or-admin gated (is_community_moderator() already includes admins).
-- Mutates ONLY deleted_at. Returns true when a row was restored.
-- -----------------------------------------------------------------------------
create or replace function public.moderator_restore_post(target_post_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare affected int;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not public.is_community_moderator() then raise exception 'not a moderator' using errcode = '42501'; end if;
  update public.community_posts set deleted_at = null
    where id = target_post_id and deleted_at is not null;
  get diagnostics affected = row_count;
  if affected > 0 then
    perform public.community_audit('post_restored', null, 'post', target_post_id, null);
  end if;
  return affected > 0;
end;
$$;
revoke all on function public.moderator_restore_post(uuid) from public;
grant execute on function public.moderator_restore_post(uuid) to authenticated;

create or replace function public.moderator_restore_comment(target_comment_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare affected int;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not public.is_community_moderator() then raise exception 'not a moderator' using errcode = '42501'; end if;
  update public.community_comments set deleted_at = null
    where id = target_comment_id and deleted_at is not null;
  get diagnostics affected = row_count;
  if affected > 0 then
    perform public.community_audit('comment_restored', null, 'comment', target_comment_id, null);
  end if;
  return affected > 0;
end;
$$;
revoke all on function public.moderator_restore_comment(uuid) from public;
grant execute on function public.moderator_restore_comment(uuid) to authenticated;
