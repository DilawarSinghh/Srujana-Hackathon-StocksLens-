import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side community-admin data + authorization helpers.
 *
 * Authorization is ALWAYS enforced in the database (SECURITY DEFINER functions
 * + RLS). These helpers surface state for the UI and call the privileged RPCs
 * with the caller's own authenticated session — never the service-role client,
 * so a forged request cannot bypass the DB checks.
 */

export interface AdminMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  username: string | null;
  createdAt: string | null;
  isModerator: boolean;
  isAdmin: boolean;
}

/**
 * Ensure the designated super-admin is bootstrapped, then report whether the
 * caller is an admin. Safe to call on every admin-area load: the DB function
 * only promotes the caller if THEIR auth.users email is on the allowlist.
 */
export async function ensureAndCheckAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_community_admin_bootstrap");
  if (error) return false;
  return data === true;
}

/** True when the caller is currently a community moderator (admins included). */
export async function isModerator(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_community_moderator");
  return data === true;
}

/**
 * List community members with their roles, for the admin console. Search
 * matches display name / username (case-insensitive). Admin-gated by RLS: the
 * admin/moderator tables are only readable to the user themselves or a
 * moderator/admin, so a non-admin sees an empty/partial set — but the UI is
 * also guarded server-side before calling this.
 */
export async function listMembers(search: string | null, limit = 50): Promise<AdminMember[]> {
  const supabase = await createClient();

  let q = supabase
    .from("profiles")
    .select("id, full_name, avatar_url, username, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  const term = search?.trim();
  if (term) {
    const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
    const pattern = `%${escaped}%`;
    // Two separate ilike filters OR'd is awkward via PostgREST; use .or with
    // escaped pattern on the two display columns only (no injection: pattern is
    // a value, columns are fixed).
    q = q.or(`full_name.ilike.${pattern},username.ilike.${pattern}`);
  }

  const { data: profiles } = await q;
  if (!profiles || profiles.length === 0) return [];

  const ids = profiles.map((p) => p.id);
  const [mods, admins] = await Promise.all([
    supabase.from("community_moderators").select("user_id").in("user_id", ids),
    supabase.from("community_admins").select("user_id").in("user_id", ids),
  ]);
  const modSet = new Set((mods.data ?? []).map((m) => m.user_id));
  const adminSet = new Set((admins.data ?? []).map((a) => a.user_id));

  return profiles.map((p) => ({
    id: p.id,
    name: p.full_name ?? "Investor",
    avatarUrl: p.avatar_url,
    username: p.username,
    createdAt: p.created_at,
    isModerator: modSet.has(p.id) || adminSet.has(p.id),
    isAdmin: adminSet.has(p.id),
  }));
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  targetUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

/** Recent audit-log entries (readable to moderators/admins via RLS). */
export async function recentAudit(limit = 30): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_audit_log")
    .select("id, actor_id, action, target_user_id, target_type, target_id, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  return (data ?? []).map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    action: r.action,
    targetUserId: r.target_user_id,
    targetType: r.target_type,
    targetId: r.target_id,
    createdAt: r.created_at,
  }));
}
