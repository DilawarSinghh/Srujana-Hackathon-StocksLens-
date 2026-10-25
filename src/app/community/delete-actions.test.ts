import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * MOCK-LEVEL action tests for deletePost / deleteComment.
 *
 * These verify the ACTION's control flow only (which path it takes, which
 * filters/RPC it calls, how it maps results). They do NOT prove PostgreSQL
 * authorization — that is covered by the Docker-gated real-Supabase RLS
 * integration test in e2e/moderation.rls.spec.ts.
 *
 * What is asserted here:
 *  - ordinary author → author-scoped UPDATE (id + author_id = self),
 *  - ordinary user cannot target another user's row (author_id filter present),
 *  - moderator → calls the least-privilege RPC (not a direct UPDATE),
 *  - RPC "false" (missing record) → surfaced as a not-found failure,
 *  - RPC error → surfaced as failure (never a false success),
 *  - signed-out → rejected.
 */

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// Mutable state the mock client reads.
let isModerator = false;
let updateError: { message: string } | null = null;
let rpcResult: { data: boolean | null; error: { message: string } | null } = {
  data: true,
  error: null,
};

// Recording of what the action did.
let lastUpdateTable = "";
let lastUpdateEq: Record<string, unknown> = {};
let lastRpcName = "";
let lastRpcArgs: Record<string, unknown> | null = null;

function makeClient() {
  return {
    async rpc(fn: string, args: Record<string, unknown>) {
      lastRpcName = fn;
      lastRpcArgs = args;
      if (fn === "is_community_moderator") {
        return { data: isModerator, error: null };
      }
      // moderator_soft_delete_post / _comment
      return rpcResult;
    },
    from(table: string) {
      return {
        update() {
          lastUpdateTable = table;
          lastUpdateEq = {};
          const chain = {
            eq(col: string, val: unknown) {
              lastUpdateEq[col] = val;
              return chain;
            },
            then(resolve: (v: { error: typeof updateError }) => void) {
              resolve({ error: updateError });
            },
          };
          return chain;
        },
      };
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient() }));

import { deletePost, deleteComment } from "./actions";

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue({ id: "author-1" });
  isModerator = false;
  updateError = null;
  rpcResult = { data: true, error: null };
  lastUpdateTable = "";
  lastUpdateEq = {};
  lastRpcName = "";
  lastRpcArgs = null;
});

describe("deletePost", () => {
  it("rejects signed-out users and does nothing", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await deletePost("post-1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/sign in/i);
    expect(lastUpdateTable).toBe("");
    expect(lastRpcName).toBe("");
  });

  it("ordinary author → author-scoped UPDATE (id + author_id = self), no RPC", async () => {
    const res = await deletePost("post-1");
    expect(res.ok).toBe(true);
    expect(lastUpdateTable).toBe("community_posts");
    expect(lastUpdateEq.id).toBe("post-1");
    expect(lastUpdateEq.author_id).toBe("author-1");
    // Only the moderator check RPC ran, never the soft-delete RPC.
    expect(lastRpcName).toBe("is_community_moderator");
  });

  it("ordinary user cannot target another user's row (author filter binds to self)", async () => {
    // Even if the caller passes someone else's post id, the UPDATE is bound to
    // author_id = the caller, so RLS + this filter prevent touching it.
    await deletePost("someone-elses-post");
    expect(lastUpdateEq.author_id).toBe("author-1");
  });

  it("moderator → calls the least-privilege RPC, not a direct UPDATE", async () => {
    isModerator = true;
    const res = await deletePost("post-1");
    expect(res.ok).toBe(true);
    expect(lastRpcName).toBe("moderator_soft_delete_post");
    expect(lastRpcArgs).toEqual({ target_post_id: "post-1" });
    expect(lastUpdateTable).toBe(""); // no direct UPDATE path for moderators
  });

  it("moderator + missing record (RPC false) → not-found failure, not success", async () => {
    isModerator = true;
    rpcResult = { data: false, error: null };
    const res = await deletePost("ghost");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });

  it("moderator + RPC error → surfaced as failure (never false success)", async () => {
    isModerator = true;
    rpcResult = { data: null, error: { message: "not a moderator" } };
    const res = await deletePost("post-1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/could not delete the post/i);
  });

  it("ordinary author UPDATE error is surfaced as failure", async () => {
    updateError = { message: "permission denied" };
    const res = await deletePost("post-1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/could not delete the post/i);
  });
});

describe("deleteComment", () => {
  it("rejects signed-out users", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await deleteComment("c-1");
    expect(res.ok).toBe(false);
  });

  it("ordinary author → author-scoped UPDATE (id + author_id = self)", async () => {
    const res = await deleteComment("c-1");
    expect(res.ok).toBe(true);
    expect(lastUpdateTable).toBe("community_comments");
    expect(lastUpdateEq.id).toBe("c-1");
    expect(lastUpdateEq.author_id).toBe("author-1");
    expect(lastRpcName).toBe("is_community_moderator");
  });

  it("moderator → calls the least-privilege RPC", async () => {
    isModerator = true;
    const res = await deleteComment("c-1");
    expect(res.ok).toBe(true);
    expect(lastRpcName).toBe("moderator_soft_delete_comment");
    expect(lastRpcArgs).toEqual({ target_comment_id: "c-1" });
    expect(lastUpdateTable).toBe("");
  });

  it("moderator + missing record (RPC false) → not-found failure", async () => {
    isModerator = true;
    rpcResult = { data: false, error: null };
    const res = await deleteComment("ghost");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });

  it("moderator + RPC error → surfaced as failure", async () => {
    isModerator = true;
    rpcResult = { data: null, error: { message: "not a moderator" } };
    const res = await deleteComment("c-1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/could not delete the comment/i);
  });
});
