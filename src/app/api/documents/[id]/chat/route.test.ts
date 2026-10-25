import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route tests for POST /api/documents/[id]/chat. External deps are mocked so we
 * exercise the authorization + rate-limit hardening without a live Supabase or
 * Groq. Specifically verifies:
 *  - unauthenticated requests are rejected (401) and never call the model,
 *  - a document the user does not own returns 404 and never calls the model,
 *  - a rate-limited user gets 429 (with Retry-After) and never calls the model,
 *  - a valid, in-budget request DOES reach the model.
 */

// --- auth + user-scoped document lookup -----------------------------------
const getUser = vi.fn();
// The route runs: from("user_documents").select().eq("id").eq("user_id").maybeSingle()
let docRow: { id: string; filename: string; status: string } | null = {
  id: "11111111-1111-1111-1111-111111111111",
  filename: "annual-report.pdf",
  status: "ready",
};
function makeUserClient() {
  return {
    auth: { getUser },
    from() {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: docRow }) }),
          }),
        }),
      };
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeUserClient(),
}));

// --- rate limit -----------------------------------------------------------
const isRateLimited = vi.fn(async () => false);
vi.mock("@/lib/rag/rate-limit", () => ({
  isRateLimited: () => isRateLimited(),
}));

// --- retrieval (user doc chunks) ------------------------------------------
let retrieved: unknown[] = [];
const retrieveUserDocChunks = vi.fn(async () => retrieved);
vi.mock("@/lib/rag/retrieve-user-doc", () => ({
  retrieveUserDocChunks: () => retrieveUserDocChunks(),
}));

// --- model chain: capture whether the model was invoked -------------------
const streamWithFallback = vi.fn(async () => ({
  toDataStreamResponse: () =>
    new Response(`0:${JSON.stringify("Answer from the document.")}\n`, {
      headers: { "x-vercel-ai-data-stream": "v1" },
    }),
}));
vi.mock("@/lib/rag/model-chain", () => ({
  streamWithFallback: (...a: unknown[]) => streamWithFallback(...(a as [never])),
  AllModelsFailedError: class extends Error {},
}));

// Guardrails are pure; use the real module.

import { POST } from "./route";

const DOC_ID = "11111111-1111-1111-1111-111111111111";

function req(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/documents/${id}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  isRateLimited.mockReset().mockResolvedValue(false);
  streamWithFallback.mockClear();
  retrieveUserDocChunks.mockClear();
  retrieved = [
    {
      id: "c1",
      page: 3,
      section: "MD&A",
      content: "Revenue grew 10%.",
      similarity: 0.9,
      filingTitle: "annual-report.pdf",
      sourceUrl: null,
      docType: null,
      fiscalYear: null,
    },
  ];
  docRow = { id: DOC_ID, filename: "annual-report.pdf", status: "ready" };
});

describe("POST /api/documents/[id]/chat — auth & ownership", () => {
  it("401 when signed out; model is never called", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req(DOC_ID, { message: "what is revenue?" }), ctx(DOC_ID));
    expect(res.status).toBe(401);
    expect(streamWithFallback).not.toHaveBeenCalled();
  });

  it("400 on an invalid (non-uuid) id", async () => {
    const res = await POST(req("not-a-uuid", { message: "hi" }), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(streamWithFallback).not.toHaveBeenCalled();
  });

  it("404 when the document is not owned by the user; model is never called", async () => {
    // The route's query filters .eq('user_id', user.id); a non-owned doc yields
    // no row → 404.
    docRow = null;
    const res = await POST(req(DOC_ID, { message: "what is revenue?" }), ctx(DOC_ID));
    expect(res.status).toBe(404);
    expect(streamWithFallback).not.toHaveBeenCalled();
  });

  it("409 when the document is still processing", async () => {
    docRow = { id: DOC_ID, filename: "x.pdf", status: "processing" };
    const res = await POST(req(DOC_ID, { message: "hi" }), ctx(DOC_ID));
    expect(res.status).toBe(409);
    expect(streamWithFallback).not.toHaveBeenCalled();
  });
});

describe("POST /api/documents/[id]/chat — rate limiting", () => {
  it("429 with Retry-After when over the hourly budget; model is NEVER called", async () => {
    isRateLimited.mockResolvedValue(true);
    const res = await POST(req(DOC_ID, { message: "what is revenue?" }), ctx(DOC_ID));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    const json = (await res.json()) as { error: string; code?: string; retryable?: boolean };
    expect(json.code).toBe("rate_limited");
    expect(json.retryable).toBe(true);
    expect(json.error).toMatch(/hourly message limit/i);
    expect(streamWithFallback).not.toHaveBeenCalled();
  });

  it("is enforced AFTER ownership (a non-owner sees 404, not 429)", async () => {
    docRow = null; // not owned
    isRateLimited.mockResolvedValue(true);
    const res = await POST(req(DOC_ID, { message: "hi" }), ctx(DOC_ID));
    expect(res.status).toBe(404);
    expect(streamWithFallback).not.toHaveBeenCalled();
  });
});

describe("POST /api/documents/[id]/chat — in-budget request reaches the model", () => {
  it("invokes the model for a valid, owned, in-budget request", async () => {
    const res = await POST(
      req(DOC_ID, { message: "What was revenue growth?" }),
      ctx(DOC_ID),
    );
    expect(res.status).toBe(200);
    expect(streamWithFallback).toHaveBeenCalledTimes(1);
  });

  it("an advice question is refused deterministically without calling the model", async () => {
    const res = await POST(
      req(DOC_ID, { message: "should I buy this stock?" }),
      ctx(DOC_ID),
    );
    expect(res.status).toBe(200);
    expect(streamWithFallback).not.toHaveBeenCalled();
  });

  it("returns a clean message (no model call) when nothing relevant is retrieved", async () => {
    retrieved = [];
    const res = await POST(req(DOC_ID, { message: "unrelated question" }), ctx(DOC_ID));
    expect(res.status).toBe(200);
    expect(streamWithFallback).not.toHaveBeenCalled();
  });
});
