import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mock-level tests for the profile update action. These verify control flow +
 * validation + that the update is scoped to the caller's own id and only ever
 * touches the three editable columns. DB-level RLS ownership is covered by the
 * Docker-gated integration test (e2e/profile.rls.spec.ts).
 */

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let updatePayload: Record<string, unknown> | null = null;
let eqFilters: Record<string, unknown> = {};
let updateError: { message: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from() {
      return {
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          eqFilters = {};
          return {
            eq(col: string, val: unknown) {
              eqFilters[col] = val;
              return Promise.resolve({ error: updateError });
            },
          };
        },
      };
    },
  }),
}));

import { updateProfile } from "./actions";

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue({ id: "user-1" });
  updatePayload = null;
  eqFilters = {};
  updateError = null;
});

describe("updateProfile", () => {
  it("rejects signed-out users", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await updateProfile(fd({ fullName: "A" }));
    expect(res.ok).toBe(false);
    expect(updatePayload).toBeNull();
  });

  it("persists only full_name, username, bio — scoped to the caller's own id", async () => {
    const res = await updateProfile(
      fd({ fullName: "Asha Patel", username: "asha_01", bio: "Long-term investor." }),
    );
    expect(res.ok).toBe(true);
    expect(updatePayload).toEqual({
      full_name: "Asha Patel",
      username: "asha_01",
      bio: "Long-term investor.",
    });
    // Scoped to self; no way to target another id.
    expect(eqFilters.id).toBe("user-1");
    // Never writes email/role/id/privilege columns.
    expect(updatePayload).not.toHaveProperty("email");
    expect(updatePayload).not.toHaveProperty("id");
    expect(updatePayload).not.toHaveProperty("role");
  });

  it("empty fields normalize to null", async () => {
    const res = await updateProfile(fd({ fullName: "", username: "", bio: "" }));
    expect(res.ok).toBe(true);
    expect(updatePayload).toEqual({ full_name: null, username: null, bio: null });
  });

  it("rejects an invalid username with a field error", async () => {
    const res = await updateProfile(fd({ username: "bad name!" }));
    expect(res.ok).toBe(false);
    expect(res.fieldErrors?.username).toBeTruthy();
    expect(updatePayload).toBeNull(); // never reached the DB
  });

  it("maps a unique-violation to a friendly username-taken error", async () => {
    updateError = { message: "duplicate key value violates unique constraint" };
    const res = await updateProfile(fd({ username: "taken" }));
    expect(res.ok).toBe(false);
    expect(res.fieldErrors?.username).toMatch(/taken/i);
  });

  it("rejects an over-long bio", async () => {
    const res = await updateProfile(fd({ bio: "x".repeat(301) }));
    expect(res.ok).toBe(false);
    expect(updatePayload).toBeNull();
  });
});
