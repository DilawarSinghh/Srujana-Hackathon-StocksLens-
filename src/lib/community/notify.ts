import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { NotificationType } from "@/types/database";

/**
 * Insert a notification, de-duplicated by the unique index in migration 0013.
 * Never notifies a user about their own action. Best-effort: failures are
 * swallowed so they can't break the triggering mutation.
 */
export async function notify(opts: {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  postId?: string | null;
  commentId?: string | null;
  shareId?: string | null;
}): Promise<void> {
  if (opts.recipientId === opts.actorId) return;
  const supabase = await createClient();
  // The unique index (migration 0013) rejects duplicates for the same
  // actor/type/target burst; a conflict surfaces as an error we deliberately
  // ignore (best-effort notification).
  await supabase.from("community_notifications").insert({
    recipient_id: opts.recipientId,
    actor_id: opts.actorId,
    type: opts.type,
    post_id: opts.postId ?? null,
    comment_id: opts.commentId ?? null,
    share_id: opts.shareId ?? null,
  });
}
