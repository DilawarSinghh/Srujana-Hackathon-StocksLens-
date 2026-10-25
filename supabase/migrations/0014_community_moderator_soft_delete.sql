-- =============================================================================
-- 0014_community_moderator_soft_delete.sql
-- Least-privilege moderator soft-deletion for community posts and comments.
--
-- Why: the application soft-deletes by setting `deleted_at` (an UPDATE). The
-- UPDATE RLS policies on community_posts/community_comments ("…update own")
-- intentionally permit ONLY the author to update their own rows, and are left
-- UNCHANGED here. The moderator clause lives only on the hard-DELETE policies,
-- which the app does not use. As a result a moderator's soft-delete UPDATE
-- previously matched zero rows. (See docs / the moderator soft-delete audit.)
--
-- Fix (additive, least-privilege): two SECURITY DEFINER functions that a
-- moderator calls to soft-delete another user's content. They:
--   * run as the definer so they are NOT blocked by the author-only UPDATE
--     policy, but
--   * perform their OWN authorization inside: the caller must be authenticated
--     AND a community moderator (public.is_community_moderator()), otherwise the
--     call is rejected with an exception — so the elevated privilege can never
--     be used by a non-moderator;
--   * mutate ONLY the `deleted_at` column of the single target row (never
--     content, author_id, ownership, or any other column);
--   * return a boolean so the caller can distinguish a real soft-delete (true)
--     from a missing / already-deleted record (false).
--
-- This does NOT add any broad moderator UPDATE policy and does NOT weaken any
-- existing RLS. Ordinary authors keep their author-scoped UPDATE path; ordinary
-- users still cannot delete others' content.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- moderator_soft_delete_post(target_post_id uuid) -> boolean
--   true  : the post existed, was not already deleted, and is now soft-deleted.
--   false : no matching non-deleted post (unknown id or already deleted).
--   raises: 'not authenticated' / 'not a moderator' for unauthorized callers.
-- -----------------------------------------------------------------------------
create or replace function public.moderator_soft_delete_post(target_post_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  affected int;
begin
  -- Authorization is enforced INSIDE the definer function (the function is the
  -- only elevated surface; it refuses to act for anyone but a moderator).
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_community_moderator() then
    raise exception 'not a moderator' using errcode = '42501';
  end if;

  -- Mutate ONLY deleted_at, and only for a row that is not already deleted.
  update public.community_posts
    set deleted_at = now()
    where id = target_post_id
      and deleted_at is null;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

comment on function public.moderator_soft_delete_post(uuid) is
  'Moderator-only soft-delete of a community post (sets deleted_at only). '
  'Authorization checked inside: caller must be authenticated and a moderator. '
  'Returns true when a non-deleted post was soft-deleted, false when none matched.';

-- -----------------------------------------------------------------------------
-- moderator_soft_delete_comment(target_comment_id uuid) -> boolean
--   Same contract as the post variant, for community_comments.
-- -----------------------------------------------------------------------------
create or replace function public.moderator_soft_delete_comment(target_comment_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  affected int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_community_moderator() then
    raise exception 'not a moderator' using errcode = '42501';
  end if;

  update public.community_comments
    set deleted_at = now()
    where id = target_comment_id
      and deleted_at is null;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

comment on function public.moderator_soft_delete_comment(uuid) is
  'Moderator-only soft-delete of a community comment (sets deleted_at only). '
  'Authorization checked inside: caller must be authenticated and a moderator. '
  'Returns true when a non-deleted comment was soft-deleted, false when none matched.';

-- -----------------------------------------------------------------------------
-- EXECUTE privileges: revoke the implicit PUBLIC grant and allow only the
-- signed-in application role. (The internal moderator check is still the real
-- guard; this simply removes the functions from anon/public reach.)
-- -----------------------------------------------------------------------------
revoke all on function public.moderator_soft_delete_post(uuid) from public;
revoke all on function public.moderator_soft_delete_comment(uuid) from public;
grant execute on function public.moderator_soft_delete_post(uuid) to authenticated;
grant execute on function public.moderator_soft_delete_comment(uuid) to authenticated;
