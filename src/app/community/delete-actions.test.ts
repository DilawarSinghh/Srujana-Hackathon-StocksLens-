import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression tests for author-scoped soft deletion (deletePost / deleteComment).
 *
 * Verifies the defense-in-depth added on top of RLS:
 *  - a regular (non-moderator) user's delete is filtered by author_id = self,
 *  - a moderator's delete is NOT author-filtered (can remove any row),
 *  - signed-out users are rejected,
 * while never changing the soft-delete semantics (update deleted_at).
 *
 * We record the `.eq()` filters applied to the update so we can assert whether
 * an author_id filter was present.
 */

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));

// revalidatePath is a no-op in tests.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// Capture state for each call.
let isModerator = false;
let lastTable = "";
let lastEqFilters: Record<string, unknown> = {};
let updateError: { message: string } | null = null;

function makeClient() {
  return {
    rpc: async (fn: string) =>
      fn === "is_community_moderator"
        ? { data: isModerator, error: null }
        : { data: null, error: null },
    from(table: string) {
      lastTable = table;
      return {
        update() {
          lastEqFilters = {};
          const builder: Record<string, unknown> = {};
          // .eq() is chainable and must be awaitable at the end; make the
          // builder a thenable that resolves to { error }.
          const chain = {
            eq(col: string, val: unknown) {
              lastEqFilters[col] = val;
              return chain;
            },
            then(resolve: (v: { error: typeof updateError }) => void) {
              resolve({ error: updateError });
            },
          };
          Object.assign(builder, chain);
          return chain;
        },
      };
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeClient(),
}));

import { deletePost, deleteComment } from "./actions";

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue({ id: "author-1" });
  isModerator = false;
  lastTable = "";
  lastEqFilters = {};
  updateError = null;
});

describe("deletePost — author-scoped soft delete", () => {
  it("rejects signed-out users", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await deletePost("post-1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/sign in/i);
  });

  it("a regular author's delete is filtered by id AND author_id = self", async () => {
    const res = await deletePost("post-1");
    expect(res.ok).toBe(true);
    expect(lastTable).toBe("community_posts");
    expect(lastEqFilters.id).toBe("post-1");
    expect(lastEqFilters.author_id).toBe("author-1"); // defense in depth
  });

  it("a moderator's delete is NOT author-filtered (can remove any post)", async () => {
    isModerator = true;
    const res = await deletePost("post-1");
    expect(res.ok).toBe(true);
    expect(lastEqFilters.id).toBe("post-1");
    expect(lastEqFilters.author_id).toBeUndefined(); // moderator path preserved
  });

  it("surfaces a DB error (e.g. RLS blocked a non-author) as a failure", async () => {
    updateError = { message: "permission denied" };
    const res = await deletePost("post-1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/could not delete the post/i);
  });
});

describe("deleteComment — author-scoped soft delete", () => {
  it("rejects signed-out users", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await deleteComment("comment-1");
    expect(res.ok).toBe(false);
  });

  it("a regular author's delete is filtered by id AND author_id = self", async () => {
    const res = await deleteComment("comment-1");
    expect(res.ok).toBe(true);
    expect(lastTable).toBe("community_comments");
    expect(lastEqFilters.id).toBe("comment-1");
    expect(lastEqFilters.author_id).toBe("author-1");
  });

  it("a moderator's delete is NOT author-filtered", async () => {
    isModerator = true;
    const res = await deleteComment("comment-1");
    expect(res.ok).toBe(true);
    expect(lastEqFilters.id).toBe("comment-1");
    expect(lastEqFilters.author_id).toBeUndefined();
  });
});
