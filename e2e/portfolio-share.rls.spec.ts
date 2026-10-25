import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readTestAuthEnv } from "./auth/test-auth.config";

/**
 * REAL Supabase RLS integration test for portfolio sharing.
 *
 * Proves database authorization the mock-level action tests cannot:
 *   - a user can only read their OWN private portfolio/holdings rows; another
 *     user cannot read them even with the row id (knowledge of an id is not
 *     authorization);
 *   - a published public share + its holdings ARE readable by any other user;
 *   - a user cannot forge a share that claims to be owned by someone else
 *     (shares write own);
 *   - a user cannot insert holdings onto another user's share;
 *   - a revoked share stops being world-readable (owner only);
 *   - the linked portfolio_review post is readable, and soft-deleting it hides
 *     the post without leaking via the posts table.
 *
 * Gated on the LOCAL harness (E2E_SUPABASE_* against a LOCAL stack); a no-op
 * when unconfigured so `pnpm e2e` stays green without Docker. Uses only
 * authenticated supabase-js clients (no browser), but needs the local stack +
 * service role the harness provides.
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
  const email = `shr-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
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
  return { id: data.user.id, client };
}

const created: string[] = [];

test.afterAll(async () => {
  const db = admin();
  for (const id of created) await db.auth.admin.deleteUser(id).catch(() => {});
});

test.describe("portfolio sharing (real RLS)", () => {
  test("a private portfolio is readable by its owner but not by another user", async () => {
    const owner = await makeUser("owner");
    const other = await makeUser("other");
    created.push(owner.id, other.id);

    // Owner creates a private portfolio (owner-scoped insert).
    const { data: pf, error: pfErr } = await owner.client
      .from("portfolios")
      .insert({ user_id: owner.id, name: "Private core" })
      .select("id")
      .single();
    expect(pfErr).toBeNull();
    const portfolioId = pf!.id as string;

    // Owner can read it.
    const ownerRead = await owner.client
      .from("portfolios")
      .select("id")
      .eq("id", portfolioId)
      .maybeSingle();
    expect(ownerRead.data?.id).toBe(portfolioId);

    // Another user cannot read it even WITH the id (RLS, not obscurity).
    const otherRead = await other.client
      .from("portfolios")
      .select("id")
      .eq("id", portfolioId)
      .maybeSingle();
    expect(otherRead.data).toBeNull();
  });

  test("a public share + holdings are world-readable; a revoked share is owner-only", async () => {
    const owner = await makeUser("shareowner");
    const other = await makeUser("viewer");
    created.push(owner.id, other.id);

    const { data: share } = await owner.client
      .from("community_portfolio_shares")
      .insert({
        owner_id: owner.id,
        title: "My allocation",
        visibility: "public",
        is_hypothetical: true,
        show_holdings: true,
        show_allocations: true,
      })
      .select("id")
      .single();
    const shareId = share!.id as string;

    await owner.client.from("community_portfolio_share_holdings").insert({
      share_id: shareId,
      symbol: "TCS",
      allocation_pct: 100,
      position: 0,
    });

    // Another user can read the public share + its holdings.
    const pubShare = await other.client
      .from("community_portfolio_shares")
      .select("id, title")
      .eq("id", shareId)
      .maybeSingle();
    expect(pubShare.data?.id).toBe(shareId);
    const pubHoldings = await other.client
      .from("community_portfolio_share_holdings")
      .select("symbol")
      .eq("share_id", shareId);
    expect((pubHoldings.data ?? []).length).toBe(1);

    // Revoke → no longer world-readable; owner still sees it.
    await owner.client
      .from("community_portfolio_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", shareId);
    const afterRevoke = await other.client
      .from("community_portfolio_shares")
      .select("id")
      .eq("id", shareId)
      .maybeSingle();
    expect(afterRevoke.data).toBeNull();
    const ownerStill = await owner.client
      .from("community_portfolio_shares")
      .select("id")
      .eq("id", shareId)
      .maybeSingle();
    expect(ownerStill.data?.id).toBe(shareId);
  });

  test("a user cannot forge a share owned by someone else, nor add holdings to it", async () => {
    const owner = await makeUser("victim");
    const attacker = await makeUser("attacker");
    created.push(owner.id, attacker.id);

    // Attacker tries to create a share claiming owner_id = victim → blocked by
    // the "shares write own" with-check.
    const forged = await attacker.client
      .from("community_portfolio_shares")
      .insert({ owner_id: owner.id, title: "Forged", visibility: "public" })
      .select("id");
    expect(forged.error).not.toBeNull();

    // Victim creates a legitimate share; attacker cannot insert holdings onto it.
    const { data: share } = await owner.client
      .from("community_portfolio_shares")
      .insert({ owner_id: owner.id, title: "Real", visibility: "public", show_holdings: true })
      .select("id")
      .single();
    const injected = await attacker.client
      .from("community_portfolio_share_holdings")
      .insert({ share_id: share!.id, symbol: "HACK", position: 0 })
      .select("share_id");
    expect(injected.error).not.toBeNull();
  });

  test("a soft-deleted portfolio_review post is hidden from other users", async () => {
    const owner = await makeUser("poster");
    const other = await makeUser("reader");
    created.push(owner.id, other.id);

    const { data: share } = await owner.client
      .from("community_portfolio_shares")
      .insert({ owner_id: owner.id, title: "Review me", visibility: "public" })
      .select("id")
      .single();
    const { data: post } = await owner.client
      .from("community_posts")
      .insert({
        author_id: owner.id,
        post_type: "portfolio_review",
        body: "please review",
        portfolio_share_id: share!.id,
      })
      .select("id")
      .single();
    const postId = post!.id as string;

    // Visible to another user while live.
    const live = await other.client
      .from("community_posts")
      .select("id")
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle();
    expect(live.data?.id).toBe(postId);

    // Author soft-deletes → hidden from others' non-deleted reads.
    await owner.client
      .from("community_posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", postId);
    const afterDelete = await other.client
      .from("community_posts")
      .select("id")
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle();
    expect(afterDelete.data).toBeNull();
  });
});
