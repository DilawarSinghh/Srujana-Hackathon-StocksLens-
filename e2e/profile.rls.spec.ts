import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readTestAuthEnv } from "./auth/test-auth.config";

/**
 * REAL Supabase RLS integration test for profile ownership (migration 0016 +
 * existing profiles policies). Proves:
 *   - a user can UPDATE their own profile (full_name/username/bio persist);
 *   - a user CANNOT update ANOTHER user's profile row (RLS blocks it);
 *   - the username unique index is enforced.
 *
 * Gated on the LOCAL harness; a no-op without Docker.
 */

const ENV = (() => {
  try {
    return readTestAuthEnv();
  } catch {
    return null;
  }
})();

test.skip(!ENV, "Local Supabase RLS harness not configured (see e2e/README.md).");

function admin(): SupabaseClient {
  return createClient(ENV!.url, ENV!.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function makeUser(tag: string): Promise<{ id: string; client: SupabaseClient }> {
  const db = admin();
  const email = `rls-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "throwaway-local-password";
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const client = createClient(ENV!.url, ENV!.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(`signIn failed: ${signErr.message}`);
  return { id: data.user.id, client };
}

const createdUsers: string[] = [];
test.afterAll(async () => {
  const db = admin();
  for (const id of createdUsers) await db.auth.admin.deleteUser(id).catch(() => {});
});

test.describe("profile ownership (real RLS)", () => {
  test("a user can update their own profile and it persists", async () => {
    const u = await makeUser("selfedit");
    createdUsers.push(u.id);

    const uname = `handle_${Date.now()}`;
    const { error } = await u.client
      .from("profiles")
      .update({ full_name: "My Name", username: uname, bio: "hello" })
      .eq("id", u.id);
    expect(error, error?.message).toBeNull();

    const { data: after } = await admin()
      .from("profiles")
      .select("full_name, username, bio")
      .eq("id", u.id)
      .single();
    expect(after!.full_name).toBe("My Name");
    expect(after!.username).toBe(uname);
    expect(after!.bio).toBe("hello");
  });

  test("a user CANNOT update another user's profile (RLS blocks it)", async () => {
    const victim = await makeUser("victim");
    const attacker = await makeUser("attacker");
    createdUsers.push(victim.id, attacker.id);

    // Attacker attempts to overwrite the victim's profile. RLS "update own"
    // matches zero rows → the victim's row is untouched.
    await attacker.client
      .from("profiles")
      .update({ full_name: "HACKED" })
      .eq("id", victim.id);

    const { data: after } = await admin()
      .from("profiles")
      .select("full_name")
      .eq("id", victim.id)
      .single();
    expect(after!.full_name).not.toBe("HACKED");
  });

  test("username uniqueness is enforced", async () => {
    const a = await makeUser("uniqa");
    const b = await makeUser("uniqb");
    createdUsers.push(a.id, b.id);
    const shared = `shared_${Date.now()}`;

    const first = await a.client.from("profiles").update({ username: shared }).eq("id", a.id);
    expect(first.error).toBeNull();

    const second = await b.client.from("profiles").update({ username: shared }).eq("id", b.id);
    expect(second.error, "duplicate username must be rejected").not.toBeNull();
  });
});
