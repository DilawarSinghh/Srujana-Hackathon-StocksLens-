import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicEnv, getServerEnv } from "@/lib/env";

/**
 * ⚠️  SERVICE-ROLE SUPABASE CLIENT — SERVER AND SCRIPTS ONLY. ⚠️
 *
 * This client uses SUPABASE_SERVICE_ROLE_KEY, which BYPASSES Row Level
 * Security. It can read and write every row in the database.
 *
 * NEVER import this file from a Client Component, a hook, or any module that
 * ends up in the browser bundle. Use it only in:
 *   - tsx scripts (scripts/*.ts)
 *   - Route Handlers / Server Actions that genuinely need elevated access
 *
 * Doing otherwise would leak the key to users. The runtime guard below throws
 * if this ever executes in a browser.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient() must never run in the browser — it holds the service role key.",
    );
  }

  const publicEnv = getPublicEnv();
  const serverEnv = getServerEnv();

  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
