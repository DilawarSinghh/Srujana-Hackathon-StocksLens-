"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Flag, Trash2, Ban } from "lucide-react";
import { deletePost, reportContent, toggleBlock } from "@/app/community/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Overflow menu on a post: report, block author, or delete (author only). */
export function PostMenu({
  postId,
  authorId,
  viewerId,
  signedIn,
}: {
  postId: string;
  authorId: string;
  viewerId: string | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const isAuthor = viewerId === authorId;
  const [reportOpen, setReportOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function onDelete() {
    if (!confirm("Delete this post?")) return;
    const res = await deletePost(postId);
    if (res.ok) {
      toast.success("Post deleted.");
      router.refresh();
    } else toast.error(res.error ?? "Could not delete.");
  }

  async function onBlock() {
    const res = await toggleBlock(authorId);
    if (res.ok) {
      toast.success(res.data?.blocked ? "User blocked." : "User unblocked.");
      router.refresh();
    } else toast.error(res.error ?? "Could not block.");
  }

  async function submitReport() {
    if (reason.trim().length === 0) return;
    setBusy(true);
    const res = await reportContent({ targetType: "post", postId, reason });
    setBusy(false);
    if (res.ok) {
      toast.success("Report submitted. Thanks for keeping the community safe.");
      setReportOpen(false);
      setReason("");
    } else toast.error(res.error ?? "Could not report.");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Post options">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {signedIn && !isAuthor ? (
            <DropdownMenuItem onClick={() => setReportOpen(true)}>
              <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
              Report
            </DropdownMenuItem>
          ) : null}
          {signedIn && !isAuthor ? (
            <DropdownMenuItem onClick={onBlock}>
              <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
              Block author
            </DropdownMenuItem>
          ) : null}
          {isAuthor ? (
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          ) : null}
          {!signedIn ? (
            <DropdownMenuItem disabled>Sign in to report</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report post</DialogTitle>
            <DialogDescription>
              Tell us what&apos;s wrong. Reports go to moderators. We don&apos;t remove content
              just for being bullish or bearish.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (spam, misleading, abuse…)"
            maxLength={500}
            aria-label="Report reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitReport} disabled={busy || reason.trim().length === 0}>
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
