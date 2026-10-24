import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

// Re-export the pure, isomorphic helpers so existing server-side imports from
// `@/lib/auth` keep working. Client components must import these from
// `@/lib/user` directly to avoid pulling in the server-only code below.
export { getDisplayName, getAvatarUrl } from "@/lib/user";

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
