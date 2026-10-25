import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readTestAuthEnv } from "./auth/test-auth.config";

/**
 * REAL Supabase RLS integration test for moderator soft-deletion.
 *
 * Unlike the mock-level action tests (src/app/community/delete-actions.test.ts),
 * this exercises the ACTUAL migration + RPC + RLS against a LOCAL Supabase
 * stack with REAL authenticated sessions. It proves the database authorization
 * behavior the mocks cannot:
 *   - a moderator's RPC call soft-deletes ANOTHER user's post/comment
 *     (deleted_at set) while leaving the rest of the row unchanged;
 *   - a non-moderator calling the RPC is REJECTED (no mutation);
 *   - an ordinary author can still soft-delete their OWN content via the
 *     author-scoped UPDATE path (RLS "update own");
 *   - an ordinary user CANNOT soft-delete another user's content;
 *   - a missing id returns false (no exception).
 *
 * Gated on the local harness (E2E_SUPABASE_* against a LOCAL stack). It is a
 * no-op when unconfigured, so `pnpm e2e` stays green without Docker. It uses
 * NO browser — only authenticated supabase-js clients — but lives in the e2e
 * tier because it needs the local stack + service role that the harness sets up.
 */

const ENV = (() => {
  try {
    return readTestAuthEnv();
  } catch {
    return null; // non-local URL → guard threw; treat as unconfigured here
  }
})();

test.skip(!ENV, "Local Supabase RLS harness not configured (see e2e/README.md).");

/** Admin client (LOCAL service role) — used only to seed/clean fixtures. */
function admin(): SupabaseClient {
  return createClient(ENV!.url, ENV!.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Create a confirmed throwaway user; returns {id, authedClient}. */
async function makeUser(
  tag: string,
): Promise<{ id: string; client: SupabaseClient; email: string }> {
  const db = admin();
  const email = `rls-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "throwaway-local-password";
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

  const client = createClient(ENV!.url, ENV!.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);
  return { id: data.user.id, client, email };
}

const created: string[] = []; // user ids to clean up

test.afterAll(async () => {
  const db = admin();
  for (const id of created) {
    await db.auth.admin.deleteUser(id).catch(() => {});
  }
});

test.describe("moderator soft-delete (real RLS)", () => {
  test("moderator soft-deletes another user's post; row otherwise unchanged", async () => {
    const author = await makeUser("author");
    const mod = await makeUser("mod");
    created.push(author.id, mod.id);

    // Grant moderator (service role; community_moderators has no client policy).
    await admin().from("community_moderators").insert({ user_id: mod.id });

    // Author creates a post.
    const { data: post, error: postErr } = await author.client
      .from("community_posts")
      .insert({ author_id: author.id, post_type: "discussion", body: "original body" })
      .select("id, body, author_id")
      .single();
    expect(postErr, postErr?.message).toBeNull();
    const postId = post!.id;

    // Moderator soft-deletes via the RPC.
    const { data: ok, error: rpcErr } = await mod.client.rpc(
      "moderator_soft_delete_post",
      { target_post_id: postId },
    );
    expect(rpcErr, rpcErr?.message).toBeNull();
    expect(ok).toBe(true);

    // Verify (service role) that ONLY deleted_at changed.
    const { data: after } = await admin()
      .from("community_posts")
      .select("id, body, author_id, deleted_at")
      .eq("id", postId)
      .single();
    expect(after!.deleted_at).not.toBeNull();
    expect(after!.body).toBe("original body");
    expect(after!.author_id).toBe(author.id);
  });

  test("moderator soft-deletes another user's comment", async () => {
    const author = await makeUser("cauthor");
    const mod = await makeUser("cmod");
    created.push(author.id, mod.id);
    await admin().from("community_moderators").insert({ user_id: mod.id });

    const { data: post } = await author.client
      .from("community_posts")
      .insert({ author_id: author.id, post_type: "discussion", body: "p" })
      .select("id")
      .single();
    const { data: comment } = await author.client
      .from("community_comments")
      .insert({ post_id: post!.id, author_id: author.id, body: "comment body", depth: 0 })
      .select("id")
      .single();

    const { data: ok, error } = await mod.client.rpc("moderator_soft_delete_comment", {
      target_comment_id: comment!.id,
    });
    expect(error, error?.message).toBeNull();
    expect(ok).toBe(true);

    const { data: after } = await admin()
      .from("community_comments")
      .select("body, deleted_at")
      .eq("id", comment!.id)
      .single();
    expect(after!.deleted_at).not.toBeNull();
    expect(after!.body).toBe("comment body");
  });

  test("a non-moderator calling the RPC is rejected and nothing is deleted", async () => {
    const author = await makeUser("author2");
    const outsider = await makeUser("outsider");
    created.push(author.id, outsider.id);

    const { data: post } = await author.client
      .from("community_posts")
      .insert({ author_id: author.id, post_type: "discussion", body: "keep me" })
      .select("id")
      .single();

    // Outsider (not a moderator) calls the RPC → must error, not succeed.
    const { data: ok, error } = await outsider.client.rpc("moderator_soft_delete_post", {
      target_post_id: post!.id,
    });
    expect(ok ?? null).toBeNull();
    expect(error, "RPC must reject a non-moderator").not.toBeNull();

    // Post is still live.
    const { data: after } = await admin()
      .from("community_posts")
      .select("deleted_at")
      .eq("id", post!.id)
      .single();
    expect(after!.deleted_at).toBeNull();
  });

  test("ordinary author can soft-delete their OWN post (author-scoped UPDATE)", async () => {
    const author = await makeUser("selfdel");
    created.push(author.id);
    const { data: post } = await author.client
      .from("community_posts")
      .insert({ author_id: author.id, post_type: "discussion", body: "mine" })
      .select("id")
      .single();

    const { error } = await author.client
      .from("community_posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", post!.id)
      .eq("author_id", author.id);
    expect(error, error?.message).toBeNull();

    const { data: after } = await admin()
      .from("community_posts")
      .select("deleted_at")
      .eq("id", post!.id)
      .single();
    expect(after!.deleted_at).not.toBeNull();
  });

  test("ordinary user CANNOT soft-delete another user's post (RLS blocks UPDATE)", async () => {
    const author = await makeUser("victim");
    const attacker = await makeUser("attacker");
    created.push(author.id, attacker.id);

    const { data: post } = await author.client
      .from("community_posts")
      .insert({ author_id: author.id, post_type: "discussion", body: "safe" })
      .select("id")
      .single();

    // Attacker tries a direct UPDATE (no author filter). RLS "update own" must
    // match zero rows — the row stays live.
    await attacker.client
      .from("community_posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", post!.id);

    const { data: after } = await admin()
      .from("community_posts")
      .select("deleted_at")
      .eq("id", post!.id)
      .single();
    expect(after!.deleted_at).toBeNull();
  });

  test("a missing post id returns false (no exception) for a moderator", async () => {
    const mod = await makeUser("mod2");
    created.push(mod.id);
    await admin().from("community_moderators").insert({ user_id: mod.id });

    const { data: ok, error } = await mod.client.rpc("moderator_soft_delete_post", {
      target_post_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error, error?.message).toBeNull();
    expect(ok).toBe(false);
  });
});
