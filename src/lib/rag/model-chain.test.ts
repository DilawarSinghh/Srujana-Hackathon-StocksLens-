import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResolvedModel } from "@/lib/llm/providers";

/**
 * The chain is resolved by src/lib/llm/providers.ts. Here we mock that module
 * so these tests focus purely on the fallback/cascade behaviour of
 * model-chain.ts (ordering, transient vs non-transient, Retry-After, probe).
 */
const resolveChatChain = vi.fn();
vi.mock("@/lib/llm/providers", () => ({
  resolveChatChain: (): ResolvedModel[] => resolveChatChain(),
}));

// Mock the AI SDK; generateText/streamText behaviour is configured per test.
const generateText = vi.fn();
const streamText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  streamText: (...args: unknown[]) => streamText(...args),
}));

import {
  isTransientError,
  retryAfterMs,
  streamWithFallback,
  generateWithFallback,
  AllModelsFailedError,
} from "./model-chain";
import { LlmNotConfiguredError } from "@/lib/llm/errors";

/** Build a fake resolved chain of N labelled models. */
function fakeChain(labels: string[]): ResolvedModel[] {
  return labels.map((label) => ({
    label,
    provider: "groq",
    model: { __model: label } as unknown as ResolvedModel["model"],
  }));
}

beforeEach(() => {
  generateText.mockReset();
  streamText.mockReset();
  resolveChatChain.mockReset();
  resolveChatChain.mockReturnValue(
    fakeChain(["groq:primary", "huggingface:backup", "google:final"]),
  );
});

describe("isTransientError", () => {
  it("treats 429 and 5xx as transient", () => {
    expect(isTransientError({ statusCode: 429 })).toBe(true);
    expect(isTransientError({ statusCode: 503 })).toBe(true);
  });
  it("treats aborts/timeouts as transient", () => {
    expect(isTransientError({ name: "AbortError" })).toBe(true);
    expect(isTransientError(new Error("request timed out"))).toBe(true);
  });
  it("treats tokens-per-minute / rate-limit messages as transient", () => {
    expect(isTransientError(new Error("Rate limit reached for tokens per minute"))).toBe(true);
    expect(isTransientError(new Error("TPM quota exceeded"))).toBe(true);
    expect(isTransientError(new Error("too many requests"))).toBe(true);
  });
  it("treats a 400 as non-transient", () => {
    expect(isTransientError({ statusCode: 400 })).toBe(false);
  });
});

describe("retryAfterMs", () => {
  it("parses numeric seconds from responseHeaders", () => {
    expect(retryAfterMs({ responseHeaders: { "retry-after": "2" } })).toBe(2000);
  });
  it("returns null when absent", () => {
    expect(retryAfterMs({})).toBeNull();
  });
});

describe("streamWithFallback", () => {
  it("uses the first entry whose probe succeeds", async () => {
    generateText.mockResolvedValueOnce({ text: "ok" });
    streamText.mockReturnValueOnce({ __stream: "primary" });

    const res = await streamWithFallback({ messages: [] });
    expect(res).toEqual({ __stream: "primary" });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(streamText.mock.calls[0][0].model).toEqual({ __model: "groq:primary" });
  });

  it("falls through on a transient probe failure to the next provider", async () => {
    generateText
      .mockRejectedValueOnce({ statusCode: 429 }) // groq fails
      .mockResolvedValueOnce({ text: "ok" }); // huggingface passes
    streamText.mockReturnValueOnce({ __stream: "backup" });

    const res = await streamWithFallback({ messages: [] });
    expect(res).toEqual({ __stream: "backup" });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(streamText.mock.calls[0][0].model).toEqual({ __model: "huggingface:backup" });
  });

  it("moves to the next provider on a tokens-per-minute rate-limit message", async () => {
    generateText
      .mockRejectedValueOnce(new Error("Rate limit reached: tokens per minute"))
      .mockResolvedValueOnce({ text: "ok" });
    streamText.mockReturnValueOnce({ __stream: "backup" });

    const res = await streamWithFallback({ messages: [] });
    expect(res).toEqual({ __stream: "backup" });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on a non-transient failure", async () => {
    generateText.mockRejectedValueOnce({ statusCode: 400 });
    await expect(streamWithFallback({ messages: [] })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("throws AllModelsFailedError when every entry is transiently down", async () => {
    generateText.mockRejectedValue({ statusCode: 429 });
    await expect(streamWithFallback({ messages: [] })).rejects.toBeInstanceOf(
      AllModelsFailedError,
    );
    expect(generateText).toHaveBeenCalledTimes(3); // all three entries tried
  });

  it("throws LlmNotConfiguredError when no Groq model is configured", async () => {
    resolveChatChain.mockReturnValue([]);
    await expect(streamWithFallback({ messages: [] })).rejects.toBeInstanceOf(
      LlmNotConfiguredError,
    );
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("generateWithFallback", () => {
  it("advances past transient errors and returns the first success", async () => {
    generateText
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockResolvedValueOnce({ text: "audit json" });
    const res = await generateWithFallback({ prompt: "x" });
    expect(res).toEqual({ text: "audit json" });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("tries a preferred model first", async () => {
    generateText.mockResolvedValueOnce({ text: "audit json" });
    const preferred: ResolvedModel = {
      label: "groq:audit",
      provider: "groq",
      model: { __model: "groq:audit" } as unknown as ResolvedModel["model"],
    };
    await generateWithFallback({ prompt: "x" }, preferred);
    expect(generateText.mock.calls[0][0].model).toEqual({ __model: "groq:audit" });
  });
});
