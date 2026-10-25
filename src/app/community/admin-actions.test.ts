import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mock-level tests for the community admin actions. These verify control flow,
 * input validation, and that DB errors (e.g. the in-RPC "not an admin" /
 * "cannot demote a super-admin" guards) are surfaced as failures rather than
 * false successes. The ACTUAL authorization (only the super-admin may manage
 * roles, admins can't be demoted, etc.) is enforced in the SECURITY DEFINER
 * RPCs and proven by the Docker-gated e2e/admin.rls.spec.ts integration test.
 */

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let lastRpc: { fn: string; args: unknown } | null = null;
let rpcResult: { data: unknown; error: { message: string } | null } = { data: true, error: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    async rpc(fn: string, args: unknown) {
      lastRpc = { fn, args };
      return rpcResult;
    },
    from() {
      return {
        update() {
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  }),
}));

import {
  setModerator,
  moderatorDeletePost,
  moderatorRestorePost,
} from "./admin-actions";

const UID = "22222222-2222-2222-2222-222222222222";
const TARGET = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue({ id: UID });
  lastRpc = null;
  rpcResult = { data: true, error: null };
});

describe("setModerator", () => {
  it("rejects signed-out callers (no RPC)", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await setModerator(TARGET, true);
    expect(res.ok).toBe(false);
    expect(lastRpc).toBeNull();
  });

  it("rejects an invalid target id (no RPC)", async () => {
    const res = await setModerator("not-a-uuid", true);
    expect(res.ok).toBe(false);
    expect(lastRpc).toBeNull();
  });

  it("calls admin_set_moderator with the target + flag", async () => {
    const res = await setModerator(TARGET, true);
    expect(res.ok).toBe(true);
    expect(lastRpc?.fn).toBe("admin_set_moderator");
    expect(lastRpc?.args).toEqual({ target_user: TARGET, make_moderator: true });
  });

  it("maps the DB 'not an admin' guard to an authorization error", async () => {
    rpcResult = { data: null, error: { message: "not an admin" } };
    const res = await setModerator(TARGET, true);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/super-admin can manage roles/i);
  });

  it("maps the DB 'cannot demote a super-admin' guard to a clear message", async () => {
    rpcResult = { data: null, error: { message: "cannot demote a super-admin" } };
    const res = await setModerator(TARGET, false);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/super-admin cannot be demoted/i);
  });
});

describe("moderator content actions", () => {
  it("moderatorDeletePost calls the soft-delete RPC and treats false as not-found", async () => {
    rpcResult = { data: false, error: null };
    const res = await moderatorDeletePost(TARGET);
    expect(lastRpc?.fn).toBe("moderator_soft_delete_post");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });

  it("moderatorDeletePost surfaces a permission error from the RPC", async () => {
    rpcResult = { data: null, error: { message: "not a moderator" } };
    const res = await moderatorDeletePost(TARGET);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/moderation permission/i);
  });

  it("moderatorRestorePost calls the restore RPC on success", async () => {
    rpcResult = { data: true, error: null };
    const res = await moderatorRestorePost(TARGET);
    expect(lastRpc?.fn).toBe("moderator_restore_post");
    expect(res.ok).toBe(true);
  });

  it("rejects invalid ids without calling an RPC", async () => {
    const res = await moderatorDeletePost("nope");
    expect(res.ok).toBe(false);
    expect(lastRpc).toBeNull();
  });
});
