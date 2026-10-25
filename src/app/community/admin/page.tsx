import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { ShieldAlert, ScrollText, Flag } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ensureAndCheckAdmin,
  listMembers,
  recentAudit,
} from "@/lib/community/admin";
import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/shell/page-header";
import { AdminMembers } from "@/components/community/admin-members";
import { AdminReports } from "@/components/community/admin-reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community administration",
};

interface ReportRow {
  id: string;
  targetType: string;
  postId: string | null;
  commentId: string | null;
  reason: string;
  status: string;
  createdAt: string;
}

export default async function CommunityAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/community/admin");

  // Bootstrap the designated super-admin (no-op for everyone else) and confirm
  // the caller is an admin. Non-admins get a 404 — the page does not exist for
  // them. Authorization is DB-enforced; this is the UI gate.
  const isAdmin = await ensureAndCheckAdmin();
  if (!isAdmin) notFound();

  const supabase = await createClient();
  const [members, audit, reportsRes] = await Promise.all([
    listMembers(null, 50),
    recentAudit(30),
    supabase
      .from("community_reports")
      .select("id, target_type, post_id, comment_id, reason, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const reports: ReportRow[] = (reportsRes.data ?? []).map((r) => ({
    id: r.id,
    targetType: r.target_type,
    postId: r.post_id,
    commentId: r.comment_id,
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Community administration"
        description="Manage moderators, review reports, and moderate content. Super-admin only."
        breadcrumbs={[{ label: "Community", href: "/community" }, { label: "Administration" }]}
      />

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" /> Members &amp; roles
        </h2>
        <AdminMembers initialMembers={members} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Flag className="h-5 w-5" aria-hidden="true" /> Reports
        </h2>
        <AdminReports reports={reports} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ScrollText className="h-5 w-5" aria-hidden="true" /> Recent audit log
        </h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Privileged actions (most recent first)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No privileged actions recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {audit.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">{a.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.targetType ? `${a.targetType} ` : ""}
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </PageContainer>
  );
}
