import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * MOCK-LEVEL tests for createSharePost — the action that publishes a portfolio
 * share to the feed as a `portfolio_review` post.
 *
 * These verify the ACTION's control flow and security posture:
 *  - signed-out is rejected,
 *  - the snapshot is built server-side from the CALLER's user id (never from a
 *    client-supplied value),
 *  - a share row + a linked portfolio_review post are both created,
 *  - the post links the share id the server created,
 *  - if the post insert fails, the share is rolled back (no orphan share),
 *  - sensitive fields are only persisted when their disclosure flag is on.
 *
 * They do NOT prove PostgreSQL RLS — that is covered by the real-Supabase RLS
 * integration tests (e2e/moderation.rls.spec.ts and the share RLS spec).
 */

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/community/notify", () => ({ notify: vi.fn(async () => {}) }));

// The server-side snapshot builder. We record the args it was called with so we
// can assert ownership scoping, and return a fixed snapshot.
const buildShareRiskSnapshot = vi.fn();
vi.mock("@/lib/community/share-risk", () => ({
  buildShareRiskSnapshot: (opts: unknown) => buildShareRiskSnapshot(opts),
}));

// Recording of DB operations.
interface Insert {
  table: string;
  values: Record<string, unknown>;
}
let inserts: Insert[] = [];
let deletes: { table: string; eq: Record<string, unknown> }[] = [];
let shareInsertFails = false;
let postInsertFails = false;
let recentCount = 0; // for the rate-limit head count

function makeClient() {
  return {
    async rpc() {
      return { data: false, error: null };
    },
    from(table: string) {
      return {
        insert(values: Record<string, unknown> | Record<string, unknown>[]) {
          const v = Array.isArray(values) ? values[0] : values;
          inserts.push({ table, values: v });
          const fails =
            (table === "community_portfolio_shares" && shareInsertFails) ||
            (table === "community_posts" && postInsertFails);
          return {
            select() {
              return {
                async single() {
                  if (fails) return { data: null, error: { message: "insert failed" } };
                  return { data: { id: `${table}-id` }, error: null };
                },
              };
            },
            // holdings insert is awaited directly (no .select())
            then(resolve: (v: { error: unknown }) => void) {
              resolve({ error: null });
            },
          };
        },
        // Rate-limit head count: from(...).select(id,{count,head}).eq().gte()
        select() {
          const chain = {
            eq() {
              return chain;
            },
            gte() {
              return Promise.resolve({ count: recentCount });
            },
          };
          return chain;
        },
        delete() {
          const eq: Record<string, unknown> = {};
          const chain = {
            eq(col: string, val: unknown) {
              eq[col] = val;
              // Record on the terminal eq (owner_id is last).
              if (col === "owner_id") deletes.push({ table, eq: { ...eq } });
              return chain;
            },
          };
          return chain;
        },
      };
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient() }));

import { createSharePost } from "./actions";

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue({ id: "user-1" });
  buildShareRiskSnapshot.mockReset().mockResolvedValue({
    holdings: [
      {
        symbol: "TCS",
        name: "Tata Consultancy",
        sector: "IT",
        allocationPct: 60,
        quantity: 10,
        investedAmount: 30000,
      },
      {
        symbol: "INFY",
        name: "Infosys",
        sector: "IT",
        allocationPct: 40,
        quantity: 20,
        investedAmount: 20000,
      },
    ],
    riskSnapshot: {
      beta: 0.9,
      betaCoveredWeight: 1,
      volatility: 0.18,
      hhi: 0.52,
      topSector: "IT",
      topSectorWeight: 1,
      concentrationFlags: [],
    },
  });
  inserts = [];
  deletes = [];
  shareInsertFails = false;
  postInsertFails = false;
  recentCount = 0;
});

describe("createSharePost", () => {
  it("rejects signed-out users and writes nothing", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await createSharePost({ title: "x", sourcePortfolioId: UUID });
    expect(res.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("builds the snapshot server-side from the caller's user id", async () => {
    await createSharePost({ title: "My core", sourcePortfolioId: UUID });
    expect(buildShareRiskSnapshot).toHaveBeenCalledTimes(1);
    const arg = buildShareRiskSnapshot.mock.calls[0][0] as { userId: string };
    expect(arg.userId).toBe("user-1");
  });

  it("creates a share and a linked portfolio_review post", async () => {
    const res = await createSharePost({ title: "My core", sourcePortfolioId: UUID });
    expect(res.ok).toBe(true);

    const shareInsert = inserts.find((i) => i.table === "community_portfolio_shares");
    const postInsert = inserts.find((i) => i.table === "community_posts");
    expect(shareInsert).toBeTruthy();
    expect(postInsert).toBeTruthy();
    expect(shareInsert!.values.owner_id).toBe("user-1");
    expect(postInsert!.values.post_type).toBe("portfolio_review");
    // The post links the share id the SERVER created.
    expect(postInsert!.values.portfolio_share_id).toBe("community_portfolio_shares-id");
    expect(res.data?.shareId).toBe("community_portfolio_shares-id");
  });

  it("defaults hidden quantities/amounts to null in the holdings snapshot", async () => {
    // Defaults (showQuantities/showAmounts off) must not persist those values.
    await createSharePost({ title: "My core", sourcePortfolioId: UUID });
    const holdingsInsert = inserts.find(
      (i) => i.table === "community_portfolio_share_holdings",
    );
    expect(holdingsInsert).toBeTruthy();
    expect(holdingsInsert!.values.quantity).toBeNull();
    expect(holdingsInsert!.values.invested_amount).toBeNull();
    // Allocation is on by default and should carry through.
    expect(holdingsInsert!.values.allocation_pct).toBe(60);
  });

  it("persists sensitive fields only when explicitly enabled", async () => {
    await createSharePost({
      title: "My core",
      sourcePortfolioId: UUID,
      showQuantities: true,
      showAmounts: true,
    });
    const holdingsInsert = inserts.find(
      (i) => i.table === "community_portfolio_share_holdings",
    );
    expect(holdingsInsert!.values.quantity).toBe(10);
    expect(holdingsInsert!.values.invested_amount).toBe(30000);
  });

  it("rolls back the share when the post insert fails (no orphan share)", async () => {
    postInsertFails = true;
    const res = await createSharePost({ title: "My core", sourcePortfolioId: UUID });
    expect(res.ok).toBe(false);
    // The share was deleted to avoid an orphan.
    const rollback = deletes.find((d) => d.table === "community_portfolio_shares");
    expect(rollback).toBeTruthy();
    expect(rollback!.eq.owner_id).toBe("user-1");
  });

  it("fails cleanly when the portfolio has no holdings", async () => {
    buildShareRiskSnapshot.mockResolvedValue({
      holdings: [],
      riskSnapshot: {
        beta: null,
        betaCoveredWeight: null,
        volatility: null,
        hhi: 0,
        topSector: null,
        topSectorWeight: null,
        concentrationFlags: [],
      },
    });
    const res = await createSharePost({ title: "Empty", sourcePortfolioId: UUID });
    expect(res.ok).toBe(false);
    expect(inserts.find((i) => i.table === "community_posts")).toBeUndefined();
  });
});

const UUID = "11111111-1111-1111-1111-111111111111";
