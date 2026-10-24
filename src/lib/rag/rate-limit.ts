import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Shared hourly message budget for AI features (stock chat AND the portfolio
 * risk explainer). Both consult the SAME rolling count of the user's messages
 * in `chat_messages`, so a user cannot bypass the cap by switching features.
 */
export const RATE_LIMIT = 20; // user messages per rolling hour

/**
 * True when the user is at/over the shared hourly limit. Counts `chat_messages`
 * rows with role='user' created in the last hour (the one place usage is
 * recorded). Uses whichever client is passed (admin or user-scoped).
 */
export async function isRateLimited(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await client
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", since);
  return (count ?? 0) >= RATE_LIMIT;
}
