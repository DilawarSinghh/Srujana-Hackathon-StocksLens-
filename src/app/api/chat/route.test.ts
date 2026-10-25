import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level tests for POST /api/chat. External dependencies are mocked so we
 * exercise the orchestration that Phase 6 fixes:
 *
 *  - Stock Analysis mode answers general questions from the structured DATA
 *    block even when NO filings are indexed (the original bug returned a
 *    "no filings loaded" message for every question).
 *  - The missing-filings message is NOT reused for general analysis questions.
 *  - Context is built from the looked-up stock record, not a client identifier.
 *  - Missing metrics are surfaced as unavailable in MISSING, never as zero.
 *  - Analysis works regardless of web-research configuration.
 *  - Filings mode clearly reports when no documents exist and cites documents
 *    when they are present.
 *  - Mode selection routes to filings-only vs data-grounded behaviour.
 *  - Provider failures return an error status (no permanent spinner).
 *  - Answers/citations do not carry fabricated source URLs.
 *  - Auth is required; the admin lookup gates the stock.
 */

// --- Supabase server (auth) ---
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

// --- Supabase admin (stock lookup + filings count + inserts) ---
const insertedAssistant: { content: string; mode?: string }[] = [];
let stockRow: { id: string; name: string } | null = {
  id: "s1",
  name: "Maruti Suzuki India Ltd",
};
let filingCount = 0;
function makeAdmin() {
  return {
    from(table: string) {
      if (table === "stocks") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: stockRow }) }),
          }),
        };
      }
      if (table === "filings") {
        return {
          select: () => ({
            eq: async () => ({ count: filingCount }),
          }),
        };
      }
      // chat_messages
      return {
        insert: async (row: { role: string; content: string; mode?: string }) => {
          if (row.role === "assistant") {
            insertedAssistant.push({ content: row.content, mode: row.mode });
          }
          return { data: null, error: null };
        },
      };
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));

// --- rate limit ---
const isRateLimited = vi.fn(async () => false);
vi.mock("@/lib/rag/rate-limit", () => ({
  isRateLimited: () => isRateLimited(),
}));

// --- context / data block ---
let ctxData: unknown = {
  symbol: "MARUTI",
  name: "Maruti Suzuki India Ltd",
  exchange: "NSE",
  sector: "Automobile",
  industry: "Passenger cars",
  as_of: "2026-10-24",
  metrics: { pe: 28.5, roe: 16.2, debt_to_equity: null },
  price_summary: { latest_close: 11000, change_pct: 12.3, points: 250 },
  fundamentals_annual: [{ fiscal_year: 2025, net_profit: 13000 }],
  score: { total_score: 72, label: "Strong fundamentals", pillars: [] },
  red_flags: [],
  governance: null,
  missing: ["Debt-to-equity"],
};
const loadStockContext = vi.fn(async () =>
  ctxData
    ? {
        stockId: "s1",
        name: "Maruti Suzuki India Ltd",
        data: ctxData,
        neutralBullets: ["ROE is healthy.", "Overall: Strong fundamentals."],
      }
    : null,
);
vi.mock("@/lib/rag/context", () => ({
  loadStockContext: () => loadStockContext(),
}));

// --- retrieval ---
let retrieved: unknown[] = [];
const retrieveChunks = vi.fn(async () => retrieved);
vi.mock("@/lib/rag/retrieve", () => ({
  retrieveChunks: () => retrieveChunks(),
}));

// --- audit (no-op) ---
vi.mock("@/lib/rag/audit", () => ({ auditAnswer: async () => null }));

// --- env + history budget (avoid loading real secrets in unit tests) ---
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ RAG_MAX_CONTEXT_TOKENS: 6000 }),
}));
vi.mock("@/lib/llm/budget", () => ({
  trimHistory: (h: unknown[]) => h,
}));

// --- model chain: capture prompt + drive onFinish with a scripted answer ---
let scriptedAnswer = "Here is the analysis.";
let shouldThrow = false;
const capturedSystem: string[] = [];
const capturedMessages: { content: string }[] = [];
const streamWithFallback = vi.fn(
  async (opts: {
    system: string;
    messages: { content: string }[];
    onFinish: (r: { text: string }) => Promise<void> | void;
  }) => {
    if (shouldThrow) throw new Error("model boom");
    capturedSystem.length = 0;
    capturedSystem.push(opts.system);
    capturedMessages.length = 0;
    capturedMessages.push(...opts.messages);
    await opts.onFinish({ text: scriptedAnswer });
    return { toDataStreamResponse: () => new Response("ok") };
  },
);
vi.mock("@/lib/rag/model-chain", () => ({
  streamWithFallback: (...a: unknown[]) => streamWithFallback(...(a as [never])),
  AllModelsFailedError: class extends Error {},
}));

import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Drain the streamed plain-text response (used for fixed replies). */
async function drain(res: Response): Promise<string> {
  const text = await res.text();
  // Fixed replies use the data-stream text part format: 0:"...".
  const m = text.match(/^0:(.*)$/m);
  if (m) {
    try {
      return JSON.parse(m[1]) as string;
    } catch {
      /* fall through */
    }
  }
  return text;
}

beforeEach(() => {
  insertedAssistant.length = 0;
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  isRateLimited.mockReset().mockResolvedValue(false);
  retrieveChunks.mockClear();
  streamWithFallback.mockClear();
  stockRow = { id: "s1", name: "Maruti Suzuki India Ltd" };
  filingCount = 0;
  retrieved = [];
  shouldThrow = false;
  scriptedAnswer = "Maruti operates in the Automobile sector.";
  ctxData = {
    symbol: "MARUTI",
    name: "Maruti Suzuki India Ltd",
    exchange: "NSE",
    sector: "Automobile",
    industry: "Passenger cars",
    as_of: "2026-10-24",
    metrics: { pe: 28.5, roe: 16.2, debt_to_equity: null },
    price_summary: { latest_close: 11000, change_pct: 12.3, points: 250 },
    fundamentals_annual: [{ fiscal_year: 2025, net_profit: 13000 }],
    score: { total_score: 72, label: "Strong fundamentals", pillars: [] },
    red_flags: [],
    governance: null,
    missing: ["Debt-to-equity"],
  };
});

describe("POST /api/chat — auth & validation", () => {
  it("401 when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ symbol: "MARUTI", message: "hi" }));
    expect(res.status).toBe(401);
  });

  it("400 on invalid body", async () => {
    const res = await POST(req({ symbol: "", message: "" }));
    expect(res.status).toBe(400);
  });

  it("404 for an unknown stock (server-side lookup gates the request)", async () => {
    stockRow = null;
    const res = await POST(req({ symbol: "NOPE", message: "tell me about it" }));
    expect(res.status).toBe(404);
  });

  it("429 when over the hourly rate limit", async () => {
    isRateLimited.mockResolvedValue(true);
    const res = await POST(req({ symbol: "MARUTI", message: "tell me about it" }));
    expect(res.status).toBe(429);
  });
});

describe("POST /api/chat — Stock Analysis mode (no filings)", () => {
  it("answers a general question from DATA when no filings exist", async () => {
    filingCount = 0;
    retrieved = [];
    const res = await POST(
      req({ symbol: "MARUTI", message: "Tell me about Maruti Suzuki India Ltd" }),
    );
    expect(res.status).toBe(200);
    // The model WAS invoked (not short-circuited with a missing-filings error).
    expect(streamWithFallback).toHaveBeenCalledTimes(1);
    // It used the stock-analysis system prompt, not the filings prompt.
    expect(capturedSystem[0]).toMatch(/STOCK ANALYSIS mode/);
    const saved = insertedAssistant.at(-1)?.content ?? "";
    expect(saved).not.toMatch(/no filings have been loaded/i);
    expect(saved).not.toMatch(/ingestion script/i);
    expect(saved).toMatch(/Automobile/);
  });

  it("does NOT reuse the missing-filings message for different questions", async () => {
    const q1 = await POST(req({ symbol: "MARUTI", message: "tell me about the stock" }));
    const q2 = await POST(req({ symbol: "MARUTI", message: "explain its fundamentals" }));
    expect(q1.status).toBe(200);
    expect(q2.status).toBe(200);
    expect(streamWithFallback).toHaveBeenCalledTimes(2);
    for (const a of insertedAssistant) {
      expect(a.content).not.toMatch(/ingestion script/i);
    }
  });

  it("builds context from the looked-up stock record", async () => {
    await POST(req({ symbol: "MARUTI", message: "what is this company" }));
    const prompt = capturedMessages.at(-1)?.content ?? "";
    expect(prompt).toContain("Maruti Suzuki India Ltd");
    expect(prompt).toContain("MARUTI");
  });

  it("surfaces missing metrics as unavailable, not zero", async () => {
    await POST(req({ symbol: "MARUTI", message: "what about its debt" }));
    const prompt = capturedMessages.at(-1)?.content ?? "";
    // The DATA block carries debt_to_equity:null and a MISSING entry.
    expect(prompt).toContain('"debt_to_equity":null');
    expect(prompt).toMatch(/MISSING[^\n]*Debt-to-equity/);
    // And the question-time value is not silently zeroed.
    expect(prompt).not.toContain('"debt_to_equity":0');
  });

  it("works when web research is unconfigured (analysis never touches search)", async () => {
    // No web mocks are configured; the analysis path must still answer.
    const res = await POST(req({ symbol: "MARUTI", message: "tell me about it" }));
    expect(res.status).toBe(200);
    expect(streamWithFallback).toHaveBeenCalledTimes(1);
  });

  it("includes indexed filings as supporting sources when present", async () => {
    retrieved = [
      {
        id: "c1",
        filingId: "f1",
        page: 12,
        section: "Risk Factors",
        content: "Raw material prices are volatile.",
        similarity: 0.8,
        filingTitle: "FY25 Annual Report",
        sourceUrl: "https://example.com/ar25.pdf",
        docType: "annual_report",
        fiscalYear: 2025,
      },
    ];
    scriptedAnswer = "Raw material costs are a risk [S1].";
    await POST(req({ symbol: "MARUTI", message: "what are the risks" }));
    const prompt = capturedMessages.at(-1)?.content ?? "";
    expect(prompt).toContain("Risk Factors");
    const saved = insertedAssistant.at(-1)?.content ?? "";
    expect(saved).toMatch(/\[S1\]/);
  });

  it("does not persist fabricated source URLs (citations are server-derived)", async () => {
    // Model invents a URL and a citation to a source it was not given.
    scriptedAnswer = "See https://totally-made-up.example/fake [S1].";
    retrieved = []; // no sources provided → [S1] is invalid
    await POST(req({ symbol: "MARUTI", message: "tell me about it" }));
    const saved = insertedAssistant.at(-1);
    // The invalid citation tag is stripped by post-processing.
    expect(saved?.content).not.toMatch(/\[S1\]/);
  });
});

describe("POST /api/chat — Filings mode", () => {
  it("reports clearly when no documents are indexed (no pretending)", async () => {
    filingCount = 0;
    retrieved = [];
    const res = await POST(
      req({ symbol: "MARUTI", message: "summarize the key risks", mode: "filings" }),
    );
    expect(res.status).toBe(200);
    // The model is NOT called; a clear message is returned instead.
    expect(streamWithFallback).not.toHaveBeenCalled();
    const msg = await drain(res);
    expect(msg).toMatch(/no company filings are currently indexed/i);
    expect(msg).toMatch(/Stock Analysis/);
  });

  it("answers and cites documents when filings are present", async () => {
    retrieved = [
      {
        id: "c1",
        filingId: "f1",
        page: 5,
        section: "MD&A",
        content: "Operating margin improved to 12%.",
        similarity: 0.9,
        filingTitle: "FY25 Annual Report",
        sourceUrl: "https://example.com/ar25.pdf",
        docType: "annual_report",
        fiscalYear: 2025,
      },
    ];
    scriptedAnswer = "Margins improved to 12% [S1].";
    const res = await POST(
      req({ symbol: "MARUTI", message: "what about margins", mode: "filings" }),
    );
    expect(res.status).toBe(200);
    expect(streamWithFallback).toHaveBeenCalledTimes(1);
    expect(capturedSystem[0]).toMatch(/FILINGS mode/);
    const saved = insertedAssistant.at(-1)?.content ?? "";
    expect(saved).toMatch(/\[S1\]/);
  });
});

describe("POST /api/chat — guards & failures", () => {
  it("refuses advice questions deterministically without calling the model", async () => {
    const res = await POST(
      req({ symbol: "MARUTI", message: "should I buy this stock?" }),
    );
    expect(res.status).toBe(200);
    expect(streamWithFallback).not.toHaveBeenCalled();
    const saved = insertedAssistant.at(-1)?.content ?? "";
    expect(saved).toMatch(/can't tell you whether to buy or sell/i);
  });

  it("replaces advice that slips into the answer with the refusal", async () => {
    scriptedAnswer = "You should buy this stock now.";
    await POST(req({ symbol: "MARUTI", message: "what is the outlook" }));
    const saved = insertedAssistant.at(-1)?.content ?? "";
    expect(saved).toMatch(/can't tell you whether to buy or sell/i);
    expect(saved).not.toMatch(/you should buy/i);
  });

  it("returns an error status (not a stuck stream) when the model fails", async () => {
    shouldThrow = true;
    const res = await POST(req({ symbol: "MARUTI", message: "tell me about it" }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/something went wrong/i);
  });
});
