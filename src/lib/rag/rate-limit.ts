import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Shared hourly message budget for AI features (stock chat AND the portfolio
 * risk explainer). Both consult the SAME rolling count of the user's messages
 * in `chat_messages`, so a user cannot bypass the cap by switching features.
 */
import type { ChatMode } from "@/types/database";

export const RATE_LIMIT = 20; // user messages per rolling hour (shared budget)
export const WEB_RESEARCH_RATE_LIMIT = 10; // web research questions per hour

/**
 * True when the user is at/over the shared hourly limit. Counts `chat_messages`
 * rows with role='user' created in the last hour (the one place usage is
 * recorded). Uses whichever client is passed (admin or user-scoped).
 *
 * The filings chat and portfolio explainer share this budget. Pass a `mode`
 * filter and `limit` to meter a specific mode separately (Web Research uses its
 * own 10/hour counter via countUserMessages with mode='web').
 */
export async function isRateLimited(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const count = await countUserMessages(client, userId);
  return count >= RATE_LIMIT;
}

/**
 * Count a user's `role='user'` messages in the last hour, optionally filtered
 * by `mode`. Shared helper so each feature can enforce its own cap.
 */
export async function countUserMessages(
  client: SupabaseClient<Database>,
  userId: string,
  mode?: ChatMode,
): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let query = client
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", since);
  if (mode) query = query.eq("mode", mode);
  const { count } = await query;
  return count ?? 0;
}

/**
 * True when the user is at/over the Web Research hourly limit (10/hour),
 * counted on messages with mode='web' only — a separate counter from the
 * shared chat/explainer budget.
 */
export async function isWebResearchRateLimited(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const count = await countUserMessages(client, userId, "web");
  return count >= WEB_RESEARCH_RATE_LIMIT;
}
