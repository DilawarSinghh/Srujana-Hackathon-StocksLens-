import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the Groq-only provider resolver: chain parsing (dropping any
 * non-groq entry), skipping Groq when its key is missing, the GROQ_MODEL
 * default chain, and audit-model selection. The Groq SDK factory is mocked to
 * tag the model it produces.
 */

const env: Record<string, string | undefined> = {};
vi.mock("@/lib/env", () => ({
  getServerEnv: () => env,
}));

vi.mock("@ai-sdk/groq", () => ({
  createGroq: (cfg: { apiKey?: string }) => (model: string) => ({
    __p: "groq",
    model,
    apiKey: cfg.apiKey,
  }),
}));

import {
  parseChain,
  isProviderConfigured,
  resolveChatChain,
  resolveAuditModel,
  DEFAULT_GROQ_MODEL,
} from "./providers";

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
});

describe("parseChain", () => {
  it("parses groq entries and DROPS every non-groq / malformed entry", () => {
    expect(
      parseChain("groq:a, huggingface:b , google:c, openai:d, bogus:e, nocolon, :f"),
    ).toEqual([{ provider: "groq", model: "a" }]);
  });
  it("returns [] for undefined", () => {
    expect(parseChain(undefined)).toEqual([]);
  });
});

describe("isProviderConfigured", () => {
  it("requires GROQ_API_KEY", () => {
    expect(isProviderConfigured("groq")).toBe(false);
    env.GROQ_API_KEY = "k";
    expect(isProviderConfigured("groq")).toBe(true);
  });
});

describe("resolveChatChain", () => {
  it("resolves only groq entries, dropping a stray google: entry", () => {
    env.LLM_CHAT_CHAIN = "groq:m1,google:m2,groq:m3";
    env.GROQ_API_KEY = "k";
    env.GOOGLE_GENERATIVE_AI_API_KEY = "k"; // present, but must NOT be used for chat
    const chain = resolveChatChain();
    expect(chain.map((m) => m.label)).toEqual(["groq:m1", "groq:m3"]);
    expect(chain.every((m) => m.provider === "groq")).toBe(true);
  });

  it("preserves order and de-duplicates by label", () => {
    env.LLM_CHAT_CHAIN = "groq:m1,groq:m1,groq:m2";
    env.GROQ_API_KEY = "k";
    expect(resolveChatChain().map((m) => m.label)).toEqual([
      "groq:m1",
      "groq:m2",
    ]);
  });

  it("uses GROQ_MODEL as a single-model chain when LLM_CHAT_CHAIN is unset", () => {
    env.GROQ_MODEL = "openai/gpt-oss-120b";
    env.GROQ_API_KEY = "k";
    expect(resolveChatChain().map((m) => m.label)).toEqual([
      "groq:openai/gpt-oss-120b",
    ]);
  });

  it("falls back to the DEFAULT_GROQ_MODEL when neither LLM_CHAT_CHAIN nor GROQ_MODEL is set", () => {
    env.GROQ_API_KEY = "k";
    const chain = resolveChatChain();
    expect(chain).toHaveLength(1);
    expect(chain[0].label).toBe(`groq:${DEFAULT_GROQ_MODEL}`);
  });

  it("returns [] when Groq is not configured (no API key), even with the default model", () => {
    expect(resolveChatChain()).toEqual([]);
    env.LLM_CHAT_CHAIN = "groq:m1";
    expect(resolveChatChain()).toEqual([]);
  });
});

describe("resolveAuditModel", () => {
  it("uses LLM_AUDIT_MODEL when it is a configured groq entry", () => {
    env.LLM_AUDIT_MODEL = "groq:audit-model";
    env.GROQ_API_KEY = "k";
    expect(resolveAuditModel()?.label).toBe("groq:audit-model");
  });

  it("ignores a non-groq LLM_AUDIT_MODEL and falls back to the chat-chain head", () => {
    env.LLM_AUDIT_MODEL = "google:audit-model";
    env.LLM_CHAT_CHAIN = "groq:m1";
    env.GROQ_API_KEY = "k";
    env.GOOGLE_GENERATIVE_AI_API_KEY = "k";
    expect(resolveAuditModel()?.label).toBe("groq:m1");
  });

  it("falls back to the head of the chat chain", () => {
    env.LLM_CHAT_CHAIN = "groq:m1,groq:m2";
    env.GROQ_API_KEY = "k";
    expect(resolveAuditModel()?.label).toBe("groq:m1");
  });

  it("returns null when nothing is configured", () => {
    expect(resolveAuditModel()).toBeNull();
  });
});
