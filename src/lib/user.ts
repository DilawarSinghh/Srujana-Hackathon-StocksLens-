import type { User } from "@supabase/supabase-js";

/**
 * Pure, isomorphic user helpers — safe to import from both Client and Server
 * Components. These derive display values from Supabase auth metadata and do
 * NOT touch `next/headers` or any server-only API.
 */

/** Display name derived from auth metadata, with sensible fallbacks. */
export function getDisplayName(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata ?? {};
  return (
    (meta.full_name as string) ||
    (meta.name as string) ||
    user.email ||
    "Account"
  );
}

/** Avatar URL from auth metadata, if present. */
export function getAvatarUrl(user: User | null): string | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  return (meta.avatar_url as string) || (meta.picture as string) || null;
}
