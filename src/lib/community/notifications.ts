import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { NotificationType } from "@/types/database";

export interface NotificationView {
  id: string;
  type: NotificationType;
  actorName: string;
  actorId: string | null;
  postId: string | null;
  shareId: string | null;
  read: boolean;
  createdAt: string;
  /** Resolved destination for the notification. */
  href: string;
}

const VERB: Record<NotificationType, string> = {
  follow: "followed you",
  reply: "replied to your post",
  mention: "mentioned you",
  like: "liked your post",
  repost: "reposted your post",
  review: "reviewed your shared portfolio",
  poll_closed: "your poll closed",
};

export function notificationText(type: NotificationType): string {
  return VERB[type];
}

/** Load the viewer's notifications (newest first) with actor display names. */
export async function getNotifications(viewerId: string): Promise<NotificationView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_notifications")
    .select("id, type, actor_id, post_id, share_id, read_at, created_at")
    .eq("recipient_id", viewerId)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    for (const p of profiles ?? []) names.set(p.id, p.full_name ?? "Investor");
  }

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    actorName: r.actor_id ? names.get(r.actor_id) ?? "Investor" : "Someone",
    actorId: r.actor_id,
    postId: r.post_id,
    shareId: r.share_id,
    read: !!r.read_at,
    createdAt: r.created_at,
    href: r.post_id
      ? `/community/post/${r.post_id}`
      : r.share_id
        ? `/community/portfolio/${r.share_id}`
        : r.actor_id
          ? `/community/profile/${r.actor_id}`
          : "/community",
  }));
}

/** Count of unread notifications for the viewer. */
export async function getUnreadCount(viewerId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("community_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", viewerId)
    .is("read_at", null);
  return count ?? 0;
}
