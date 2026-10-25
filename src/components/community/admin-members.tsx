"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, Shield, ShieldCheck, Crown, Loader2 } from "lucide-react";
import type { AdminMember } from "@/lib/community/admin";
import { setModerator } from "@/app/community/admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface AdminMembersProps {
  initialMembers: AdminMember[];
}

/**
 * Super-admin member management: search members and promote/revoke moderators.
 * All mutations go through server actions backed by DB-enforced RPCs; this UI
 * only reflects the authoritative result.
 */
export function AdminMembers({ initialMembers }: AdminMembersProps) {
  const [members, setMembers] = React.useState<AdminMember[]>(initialMembers);
  const [query, setQuery] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Client-side filter over the loaded set (server already caps the list).
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.username ?? "").toLowerCase().includes(q),
    );
  }, [members, query]);

  async function toggle(member: AdminMember) {
    if (member.isAdmin) return; // super-admin is protected from role changes here
    setPendingId(member.id);
    setNotice(null);
    const res = await setModerator(member.id, !member.isModerator);
    if (res.ok) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, isModerator: !member.isModerator } : m,
        ),
      );
      setNotice({
        kind: "ok",
        text: member.isModerator
          ? `${member.name} is no longer a moderator.`
          : `${member.name} is now a moderator.`,
      });
    } else {
      setNotice({ kind: "err", text: res.error ?? "Could not update role." });
    }
    setPendingId(null);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="relative max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name or username…"
            aria-label="Search members"
            className="pl-9"
          />
        </div>

        {notice ? (
          <p
            role="status"
            className={
              notice.kind === "ok"
                ? "text-sm text-emerald-600 dark:text-emerald-400"
                : "text-sm text-destructive"
            }
          >
            {notice.text}
          </p>
        ) : null}

        <ul className="divide-y divide-border">
          {filtered.length === 0 ? (
            <li className="py-8 text-center text-sm text-muted-foreground">
              No members match that search.
            </li>
          ) : (
            filtered.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {m.avatarUrl ? (
                    <Image src={m.avatarUrl} alt="" width={36} height={36} className="rounded-full" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {m.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <Link
                      href={`/community/profile/${m.id}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {m.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {m.username ? (
                        <span className="text-xs text-muted-foreground">@{m.username}</span>
                      ) : null}
                      {m.isAdmin ? (
                        <Badge variant="default" className="gap-1 font-normal">
                          <Crown className="h-3 w-3" aria-hidden="true" /> Super-admin
                        </Badge>
                      ) : m.isModerator ? (
                        <Badge variant="secondary" className="gap-1 font-normal">
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Moderator
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal">
                          Member
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {m.isAdmin ? (
                  <span
                    className="text-xs text-muted-foreground"
                    title="The super-admin's role cannot be changed here."
                  >
                    Protected
                  </span>
                ) : (
                  <Button
                    variant={m.isModerator ? "outline" : "default"}
                    size="sm"
                    disabled={pendingId === m.id}
                    onClick={() => void toggle(m)}
                  >
                    {pendingId === m.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : m.isModerator ? (
                      <>
                        <Shield className="h-4 w-4" aria-hidden="true" /> Revoke moderator
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Make moderator
                      </>
                    )}
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
