import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readTestAuthEnv } from "./auth/test-auth.config";

/**
 * REAL Supabase RLS/RPC integration test for the community super-admin + role
 * management (migration 0015). Proves the DATABASE authorization that mocks
 * cannot:
 *   - an allowlisted email bootstraps to super-admin via the RPC;
 *   - a non-allowlisted user does NOT become admin by calling bootstrap;
 *   - only an admin can admin_set_moderator (ordinary users / moderators are
 *     rejected → no self-promotion / privilege escalation);
 *   - the super-admin cannot be demoted via admin_set_moderator;
 *   - an admin counts as a moderator and can soft-delete a moderator's post;
 *   - a moderator CANNOT call admin role management.
 *
 * Gated on the LOCAL harness; a no-op without Docker. Requires the allowlist to
 * contain a known email we can create: we insert a throwaway email into
 * public.community_admin_emails (service role) so we can exercise bootstrap
 * without touching the real designated admin account.
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

async function makeUser(tag: string): Promise<{ id: string; email: string; client: SupabaseClient }> {
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
  return { id: data.user.id, email, client };
}

const createdUsers: string[] = [];
const createdAdminEmails: string[] = [];

test.afterAll(async () => {
  const db = admin();
  for (const id of createdUsers) await db.auth.admin.deleteUser(id).catch(() => {});
  for (const email of createdAdminEmails) {
    try {
      await db.from("community_admin_emails").delete().eq("email", email);
    } catch {
      /* best-effort cleanup */
    }
  }
});

test.describe("community super-admin + roles (real RLS)", () => {
  test("allowlisted email bootstraps to super-admin; others do not", async () => {
    const adminUser = await makeUser("admin");
    const outsider = await makeUser("outsider");
    createdUsers.push(adminUser.id, outsider.id);

    // Allowlist the admin user's email (service role).
    await admin().from("community_admin_emails").insert({ email: adminUser.email });
    createdAdminEmails.push(adminUser.email);

    // Allowlisted user bootstraps → becomes admin.
    const { data: becameAdmin, error: bErr } = await adminUser.client.rpc(
      "ensure_community_admin_bootstrap",
    );
    expect(bErr, bErr?.message).toBeNull();
    expect(becameAdmin).toBe(true);
    const { data: isAdmin } = await adminUser.client.rpc("is_community_admin");
    expect(isAdmin).toBe(true);

    // Non-allowlisted user calling bootstrap does NOT become admin.
    const { data: outsiderResult } = await outsider.client.rpc("ensure_community_admin_bootstrap");
    expect(outsiderResult).toBe(false);
    const { data: outsiderIsAdmin } = await outsider.client.rpc("is_community_admin");
    expect(outsiderIsAdmin).toBe(false);
  });

  test("only the admin can promote a moderator; ordinary users cannot self-promote", async () => {
    const adminUser = await makeUser("admin2");
    const target = await makeUser("target");
    createdUsers.push(adminUser.id, target.id);
    await admin().from("community_admin_emails").insert({ email: adminUser.email });
    createdAdminEmails.push(adminUser.email);
    await adminUser.client.rpc("ensure_community_admin_bootstrap");

    // Ordinary user tries to self-promote → rejected.
    const { error: selfErr } = await target.client.rpc("admin_set_moderator", {
      target_user: target.id,
      make_moderator: true,
    });
    expect(selfErr, "ordinary user must not self-promote").not.toBeNull();

    // Admin promotes the target → succeeds.
    const { data: promoted, error: promoteErr } = await adminUser.client.rpc("admin_set_moderator", {
      target_user: target.id,
      make_moderator: true,
    });
    expect(promoteErr, promoteErr?.message).toBeNull();
    expect(promoted).toBe(true);

    // The now-moderator still cannot do admin role management (escalate).
    const { error: escErr } = await target.client.rpc("admin_set_moderator", {
      target_user: adminUser.id,
      make_moderator: false,
    });
    expect(escErr, "a moderator must not perform admin role management").not.toBeNull();
  });

  test("the super-admin cannot be demoted via admin_set_moderator", async () => {
    const adminUser = await makeUser("admin3");
    createdUsers.push(adminUser.id);
    await admin().from("community_admin_emails").insert({ email: adminUser.email });
    createdAdminEmails.push(adminUser.email);
    await adminUser.client.rpc("ensure_community_admin_bootstrap");

    // Admin tries to strip moderator from themselves (a super-admin) → blocked.
    const { error } = await adminUser.client.rpc("admin_set_moderator", {
      target_user: adminUser.id,
      make_moderator: false,
    });
    expect(error, "super-admin must be protected from demotion").not.toBeNull();
    expect(error?.message ?? "").toMatch(/super-admin/i);
  });

  test("an admin can soft-delete a MODERATOR's post (full moderation authority)", async () => {
    const adminUser = await makeUser("admin4");
    const mod = await makeUser("modauthor");
    createdUsers.push(adminUser.id, mod.id);
    await admin().from("community_admin_emails").insert({ email: adminUser.email });
    createdAdminEmails.push(adminUser.email);
    await adminUser.client.rpc("ensure_community_admin_bootstrap");
    await admin().from("community_moderators").insert({ user_id: mod.id });

    const { data: post } = await mod.client
      .from("community_posts")
      .insert({ author_id: mod.id, post_type: "discussion", body: "mod post" })
      .select("id")
      .single();

    const { data: ok, error } = await adminUser.client.rpc("moderator_soft_delete_post", {
      target_post_id: post!.id,
    });
    expect(error, error?.message).toBeNull();
    expect(ok).toBe(true);

    const { data: after } = await admin()
      .from("community_posts")
      .select("deleted_at, body")
      .eq("id", post!.id)
      .single();
    expect(after!.deleted_at).not.toBeNull();
    expect(after!.body).toBe("mod post"); // only deleted_at changed
  });

  test("restore undoes a soft-delete (admin/moderator only)", async () => {
    const adminUser = await makeUser("admin5");
    const author = await makeUser("rauthor");
    createdUsers.push(adminUser.id, author.id);
    await admin().from("community_admin_emails").insert({ email: adminUser.email });
    createdAdminEmails.push(adminUser.email);
    await adminUser.client.rpc("ensure_community_admin_bootstrap");

    const { data: post } = await author.client
      .from("community_posts")
      .insert({ author_id: author.id, post_type: "discussion", body: "restore me" })
      .select("id")
      .single();
    await adminUser.client.rpc("moderator_soft_delete_post", { target_post_id: post!.id });

    const { data: restored, error } = await adminUser.client.rpc("moderator_restore_post", {
      target_post_id: post!.id,
    });
    expect(error, error?.message).toBeNull();
    expect(restored).toBe(true);

    const { data: after } = await admin()
      .from("community_posts")
      .select("deleted_at")
      .eq("id", post!.id)
      .single();
    expect(after!.deleted_at).toBeNull();
  });
});
