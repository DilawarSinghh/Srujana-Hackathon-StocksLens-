import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level tests for POST /api/debate. All external dependencies are mocked
 * (no live provider quota). Covers auth, validation, rate limiting, the
 * data-gap 422, and that an authenticated request runs the orchestrator with
 * the canonical snapshot and returns a structured debate.
 */

// --- auth ---
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

// --- admin (stock lookup + rate-limit metering insert) ---
let stockRow: { id: string; name: string; symbol: string } | null = {
  id: "s1",
  name: "Maruti Suzuki India Ltd",
  symbol: "MARUTI",
};
const inserted: unknown[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === "stocks") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stockRow }) }) }),
        };
      }
      return { insert: async (row: unknown) => { inserted.push(row); return { error: null }; } };
    },
  }),
}));

// --- rate limit ---
const isRateLimited = vi.fn(async () => false);
vi.mock("@/lib/rag/rate-limit", () => ({ isRateLimited: () => isRateLimited() }));

// --- context snapshot ---
let ctxData: unknown = {
  symbol: "MARUTI",
  name: "Maruti Suzuki India Ltd",
  exchange: "NSE",
  sector: "Automobile",
  as_of: "2026-10-24",
  metrics: { pe: 28.5 },
  price_summary: { latest_close: 11000 },
  fundamentals_annual: [],
  score: { total_score: 72, label: "Strong", pillars: [] },
  red_flags: [],
  governance: null,
  missing: [],
};
vi.mock("@/lib/rag/context", () => ({
  loadStockContext: async () =>
    ctxData ? { stockId: "s1", name: "Maruti Suzuki India Ltd", data: ctxData, neutralBullets: [] } : null,
}));

// --- retrieval (no filings) ---
vi.mock("@/lib/rag/retrieve", () => ({ retrieveChunks: async () => [] }));

// --- orchestrator: scripted structured debate ---
const runDebate = vi.fn(async () => ({
  bull: { agent: "bull", status: "ok", output: { summary: "bull", claims: [], dataGaps: [] }, error: null },
  devil: { agent: "devil", status: "ok", output: { summary: "devil", counterarguments: [], dataGaps: [] }, error: null },
  judge: {
    agent: "judge",
    status: "ok",
    output: {
      assessment: "mixed",
      confidence: "moderate",
      conclusion: "mixed",
      survivingBullPoints: [],
      substantiatedCounters: [],
      unresolved: [],
      strongestSupport: "",
      strongestCounter: "",
      dataGaps: [],
      whatWouldChange: [],
    },
    error: null,
  },
}));
vi.mock("@/lib/debate/orchestrator", () => ({ runDebate: () => runDebate() }));

import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/debate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  inserted.length = 0;
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  isRateLimited.mockReset().mockResolvedValue(false);
  runDebate.mockClear();
  stockRow = { id: "s1", name: "Maruti Suzuki India Ltd", symbol: "MARUTI" };
  ctxData = {
    symbol: "MARUTI",
    name: "Maruti Suzuki India Ltd",
    exchange: "NSE",
    sector: "Automobile",
    as_of: "2026-10-24",
    metrics: { pe: 28.5 },
    price_summary: { latest_close: 11000 },
    fundamentals_annual: [],
    score: { total_score: 72, label: "Strong", pillars: [] },
    red_flags: [],
    governance: null,
    missing: [],
  };
});

describe("POST /api/debate — auth & validation", () => {
  it("401 when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ symbol: "MARUTI" }));
    expect(res.status).toBe(401);
    expect(runDebate).not.toHaveBeenCalled();
  });

  it("400 on invalid body", async () => {
    const res = await POST(req({ symbol: "" }));
    expect(res.status).toBe(400);
  });

  it("400 on an invalid focus", async () => {
    const res = await POST(req({ symbol: "MARUTI", focus: "definitely_buy" }));
    expect(res.status).toBe(400);
  });

  it("404 for an unknown stock", async () => {
    stockRow = null;
    const res = await POST(req({ symbol: "NOPE" }));
    expect(res.status).toBe(404);
    expect(runDebate).not.toHaveBeenCalled();
  });

  it("429 when over the hourly limit", async () => {
    isRateLimited.mockResolvedValue(true);
    const res = await POST(req({ symbol: "MARUTI" }));
    expect(res.status).toBe(429);
    expect(runDebate).not.toHaveBeenCalled();
  });

  it("422 when there is not enough stored data", async () => {
    ctxData = null;
    const res = await POST(req({ symbol: "MARUTI" }));
    expect(res.status).toBe(422);
    expect(runDebate).not.toHaveBeenCalled();
  });
});

describe("POST /api/debate — success", () => {
  it("runs the orchestrator and returns a structured debate + snapshot", async () => {
    const res = await POST(
      req({ symbol: "MARUTI", thesis: "Strong brand", focus: "valuation" }),
    );
    expect(res.status).toBe(200);
    expect(runDebate).toHaveBeenCalledTimes(1);
    const json = (await res.json()) as {
      runId: string;
      stock: { symbol: string };
      snapshot: { symbol: string };
      debate: { bull: { status: string }; judge: { output: { assessment: string } } };
    };
    expect(json.runId).toBeTruthy();
    expect(json.stock.symbol).toBe("MARUTI");
    expect(json.snapshot.symbol).toBe("MARUTI");
    expect(json.debate.bull.status).toBe("ok");
    expect(json.debate.judge.output.assessment).toBe("mixed");
  });

  it("meters the run against the rate limit by recording a message", async () => {
    await POST(req({ symbol: "MARUTI" }));
    expect(inserted.length).toBeGreaterThanOrEqual(1);
  });
});
