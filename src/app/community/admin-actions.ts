"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

const uuid = z.string().uuid();

/**
 * Role-management + moderation server actions for the community super-admin.
 *
 * Every privileged mutation is executed through a SECURITY DEFINER RPC that
 * re-checks admin/moderator status in the database (migration 0015), using the
 * caller's own authenticated session. These actions never use the service-role
 * client, so they cannot bypass the DB authorization — a forged call still
 * hits the in-function `is_community_admin()` / `is_community_moderator()`
 * guard and is rejected.
 */

/** Promote a user to moderator (super-admin only; enforced in the DB). */
export async function setModerator(
  targetUserId: string,
  makeModerator: boolean,
): Promise<ActionResult<{ changed: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  if (!uuid.safeParse(targetUserId).success) {
    return { ok: false, error: "Invalid user." };
  }
  if (targetUserId === user.id && makeModerator === false) {
    // Nothing stops an admin removing their own moderator row, but their
    // powers derive from admin status anyway; disallow the confusing no-op.
    return { ok: false, error: "You can't change your own role here." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_moderator", {
    target_user: targetUserId,
    make_moderator: makeModerator,
  });
  if (error) {
    // The DB raises 'not an admin' / 'cannot demote a super-admin' etc.
    const msg = /super-admin/i.test(error.message)
      ? "The super-admin cannot be demoted."
      : /not an admin/i.test(error.message)
        ? "Only the community super-admin can manage roles."
        : "Could not update the member's role.";
    return { ok: false, error: msg };
  }
  revalidatePath("/community/admin");
  return { ok: true, data: { changed: data === true } };
}

/** Soft-delete any post (moderator/admin; DB-enforced). */
export async function moderatorDeletePost(postId: string): Promise<ActionResult> {
  return runModRpc("moderator_soft_delete_post", "target_post_id", postId, "post");
}

/** Soft-delete any comment (moderator/admin; DB-enforced). */
export async function moderatorDeleteComment(commentId: string): Promise<ActionResult> {
  return runModRpc("moderator_soft_delete_comment", "target_comment_id", commentId, "comment");
}

/** Restore a soft-deleted post (moderator/admin; DB-enforced). */
export async function moderatorRestorePost(postId: string): Promise<ActionResult> {
  return runModRpc("moderator_restore_post", "target_post_id", postId, "post");
}

/** Restore a soft-deleted comment (moderator/admin; DB-enforced). */
export async function moderatorRestoreComment(commentId: string): Promise<ActionResult> {
  return runModRpc("moderator_restore_comment", "target_comment_id", commentId, "comment");
}

type ModRpc =
  | "moderator_soft_delete_post"
  | "moderator_soft_delete_comment"
  | "moderator_restore_post"
  | "moderator_restore_comment";

async function runModRpc(
  fn: ModRpc,
  argName: "target_post_id" | "target_comment_id",
  id: string,
  kind: "post" | "comment",
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  if (!uuid.safeParse(id).success) return { ok: false, error: `Invalid ${kind}.` };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { [argName]: id } as never);
  if (error) {
    const msg = /not a moderator/i.test(error.message)
      ? "You don't have moderation permission."
      : `Could not update the ${kind}.`;
    return { ok: false, error: msg };
  }
  if (data !== true) {
    return { ok: false, error: `${kind === "post" ? "Post" : "Comment"} not found or already in that state.` };
  }
  revalidatePath("/community");
  revalidatePath("/community/admin");
  return { ok: true };
}

/** Update a report's status (moderator/admin; RLS-enforced via "reports update mod"). */
export async function setReportStatus(
  reportId: string,
  status: "open" | "reviewed" | "actioned" | "dismissed",
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in." };
  if (!uuid.safeParse(reportId).success) return { ok: false, error: "Invalid report." };
  if (!["open", "reviewed", "actioned", "dismissed"].includes(status)) {
    return { ok: false, error: "Invalid status." };
  }

  const supabase = await createClient();
  // The "reports update mod" RLS policy restricts this UPDATE to moderators.
  const { error } = await supabase
    .from("community_reports")
    .update({ status })
    .eq("id", reportId);
  if (error) return { ok: false, error: "Could not update the report." };
  revalidatePath("/community/admin");
  return { ok: true };
}
