import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the provider resolver: chain parsing, skipping providers whose key
 * is missing, backward-compatible Gemini fallback, and audit-model selection.
 * Provider SDK factories are mocked to tag the model they produce.
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
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: (cfg: { baseURL: string; apiKey?: string }) => (model: string) => ({
    __p: "hf",
    model,
    baseURL: cfg.baseURL,
  }),
}));
vi.mock("@ai-sdk/google", () => ({
  google: (model: string) => ({ __p: "google", model }),
}));

import {
  parseChain,
  isProviderConfigured,
  resolveChatChain,
  resolveAuditModel,
} from "./providers";

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
});

describe("parseChain", () => {
  it("parses provider:model entries and drops malformed/unknown ones", () => {
    expect(
      parseChain("groq:a, huggingface:b , google:c, bogus:d, nocolon, :e"),
    ).toEqual([
      { provider: "groq", model: "a" },
      { provider: "huggingface", model: "b" },
      { provider: "google", model: "c" },
    ]);
  });
  it("returns [] for undefined", () => {
    expect(parseChain(undefined)).toEqual([]);
  });
});

describe("isProviderConfigured", () => {
  it("requires the matching key(s)", () => {
    expect(isProviderConfigured("groq")).toBe(false);
    env.GROQ_API_KEY = "k";
    expect(isProviderConfigured("groq")).toBe(true);

    expect(isProviderConfigured("huggingface")).toBe(false);
    env.HUGGINGFACE_API_KEY = "k";
    expect(isProviderConfigured("huggingface")).toBe(false); // base URL still missing
    env.HUGGINGFACE_BASE_URL = "https://router.hf/v1";
    expect(isProviderConfigured("huggingface")).toBe(true);

    expect(isProviderConfigured("google")).toBe(false);
    env.GOOGLE_GENERATIVE_AI_API_KEY = "k";
    expect(isProviderConfigured("google")).toBe(true);
  });
});

describe("resolveChatChain", () => {
  it("skips a provider whose key is missing (silent)", () => {
    env.LLM_CHAT_CHAIN = "groq:m1,huggingface:m2,google:m3";
    env.GROQ_API_KEY = "k";
    env.GOOGLE_GENERATIVE_AI_API_KEY = "k";
    // HuggingFace has no key/base URL -> skipped.
    const chain = resolveChatChain();
    expect(chain.map((m) => m.label)).toEqual(["groq:m1", "google:m3"]);
  });

  it("preserves order and de-duplicates by label", () => {
    env.LLM_CHAT_CHAIN = "groq:m1,groq:m1,groq:m2";
    env.GROQ_API_KEY = "k";
    expect(resolveChatChain().map((m) => m.label)).toEqual([
      "groq:m1",
      "groq:m2",
    ]);
  });

  it("falls back to the legacy Gemini chain when LLM_CHAT_CHAIN is unset", () => {
    env.GEMINI_CHAT_MODELS = "gemini-x, gemini-y";
    env.GEMINI_CHAT_MODEL = "gemini-z";
    env.GOOGLE_GENERATIVE_AI_API_KEY = "k";
    expect(resolveChatChain().map((m) => m.label)).toEqual([
      "google:gemini-x",
      "google:gemini-y",
      "google:gemini-z",
    ]);
  });

  it("returns [] when no provider is configured", () => {
    env.LLM_CHAT_CHAIN = "groq:m1";
    expect(resolveChatChain()).toEqual([]);
  });
});

describe("resolveAuditModel", () => {
  it("uses LLM_AUDIT_MODEL when configured", () => {
    env.LLM_AUDIT_MODEL = "google:audit-model";
    env.GOOGLE_GENERATIVE_AI_API_KEY = "k";
    expect(resolveAuditModel()?.label).toBe("google:audit-model");
  });

  it("falls back to the head of the chat chain", () => {
    env.LLM_CHAT_CHAIN = "groq:m1,google:m2";
    env.GROQ_API_KEY = "k";
    env.GOOGLE_GENERATIVE_AI_API_KEY = "k";
    expect(resolveAuditModel()?.label).toBe("groq:m1");
  });

  it("returns null when nothing is configured", () => {
    expect(resolveAuditModel()).toBeNull();
  });
});
