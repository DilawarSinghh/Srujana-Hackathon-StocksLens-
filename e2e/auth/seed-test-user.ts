/**
 * Create / clean up the dedicated LOCAL test user.
 *
 * Uses the LOCAL Supabase service-role key (from `supabase status`) via the
 * admin API to create a confirmed email/password user, then to delete it (and
 * its data) during teardown. The service-role key is read from env here in a
 * Node-only setup context; it is NEVER imported into the browser bundle or a
 * Playwright page.
 *
 * The caller (global setup) has already validated that the Supabase URL is
 * local, so this never runs against production.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TestAuthEnv } from "./test-auth.config";

function admin(env: TestAuthEnv): SupabaseClient {
  return createClient(env.url, env.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Find the test user's id by email, or null. */
async function findUserId(
  db: SupabaseClient,
  email: string,
): Promise<string | null> {
  // The admin listUsers API is paginated; the local test project is tiny so one
  // page is enough.
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = data?.users.find((u) => u.email === email);
  return user?.id ?? null;
}

/**
 * Ensure a confirmed test user exists. Idempotent: if the user already exists
 * its password is reset to the configured one so sign-in is deterministic.
 * Returns the user id.
 */
export async function ensureTestUser(env: TestAuthEnv): Promise<string> {
  const db = admin(env);
  const existing = await findUserId(db, env.email);

  if (existing) {
    await db.auth.admin.updateUserById(existing, {
      password: env.password,
      email_confirm: true,
    });
    return existing;
  }

  const { data, error } = await db.auth.admin.createUser({
    email: env.email,
    password: env.password,
    email_confirm: true, // skip the email flow for the local test user
  });
  if (error || !data.user) {
    throw new Error(`[test-auth] failed to create test user: ${error?.message}`);
  }
  return data.user.id;
}

/** Delete the test user (and cascade its owned rows) during teardown. */
export async function deleteTestUser(env: TestAuthEnv): Promise<void> {
  const db = admin(env);
  const id = await findUserId(db, env.email);
  if (!id) return;
  await db.auth.admin.deleteUser(id);
}
