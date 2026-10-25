"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  setReportStatus,
  moderatorDeletePost,
  moderatorDeleteComment,
} from "@/app/community/admin-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ReportRow {
  id: string;
  targetType: string;
  postId: string | null;
  commentId: string | null;
  reason: string;
  status: string;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "destructive",
  reviewed: "secondary",
  actioned: "default",
  dismissed: "outline",
};

/** Report queue with status transitions and content moderation shortcuts. */
export function AdminReports({ reports }: { reports: ReportRow[] }) {
  const [rows, setRows] = React.useState<ReportRow[]>(reports);
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function updateStatus(id: string, status: "reviewed" | "dismissed" | "actioned") {
    setPending(id);
    setNotice(null);
    const res = await setReportStatus(id, status);
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } else {
      setNotice(res.error ?? "Could not update the report.");
    }
    setPending(null);
  }

  async function removeTarget(r: ReportRow) {
    setPending(r.id);
    setNotice(null);
    const res = r.postId
      ? await moderatorDeletePost(r.postId)
      : r.commentId
        ? await moderatorDeleteComment(r.commentId)
        : { ok: false, error: "Nothing to remove for this report." };
    if (res.ok) {
      await setReportStatus(r.id, "actioned");
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "actioned" } : x)));
      setNotice("Content removed and report marked actioned.");
    } else {
      setNotice(res.error ?? "Could not remove the content.");
    }
    setPending(null);
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No reports to review. 🎉
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const href = r.postId
              ? `/community/post/${r.postId}`
              : null;
            return (
              <li key={r.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-normal capitalize">
                      {r.targetType}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="font-normal capitalize">
                      {r.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {href ? (
                    <Link href={href} className="text-xs text-primary hover:underline">
                      View content
                    </Link>
                  ) : null}
                </div>
                <p className="text-sm">{r.reason}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending === r.id || r.status === "reviewed"}
                    onClick={() => void updateStatus(r.id, "reviewed")}
                  >
                    Mark reviewed
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending === r.id || r.status === "dismissed"}
                    onClick={() => void updateStatus(r.id, "dismissed")}
                  >
                    Dismiss
                  </Button>
                  {(r.postId || r.commentId) ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending === r.id}
                      onClick={() => void removeTarget(r)}
                    >
                      {pending === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        "Remove content"
                      )}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
