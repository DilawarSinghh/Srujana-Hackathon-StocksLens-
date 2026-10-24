import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Server-side current-user helper.
 * Returns the authenticated Supabase user, or null when signed out.
 * Safe to call from Server Components, Route Handlers, and Server Actions.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

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
