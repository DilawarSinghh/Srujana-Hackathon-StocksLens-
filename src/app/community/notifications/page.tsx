import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getNotifications, notificationText } from "@/lib/community/notifications";
import { relativeTime } from "@/lib/community/format";
import { MarkReadButton } from "@/components/community/mark-read-button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/community/notifications");

  const notifications = await getNotifications(user.id);
  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="container py-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/community" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <MarkReadButton disabled={!hasUnread} />
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          {notifications.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    className={cn(
                      "flex items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm last:border-0 hover:bg-accent/50",
                      !n.read && "bg-primary/5",
                    )}
                  >
                    <span>
                      <span className="font-semibold">{n.actorName}</span> {notificationText(n.type)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
