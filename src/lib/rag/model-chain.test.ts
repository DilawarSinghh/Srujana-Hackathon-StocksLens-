import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env to provide a deterministic model chain.
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    GEMINI_CHAT_MODEL: "final-model",
    GEMINI_CHAT_MODELS: "primary-model, backup-model",
  }),
}));

// Mock the Google provider factory to a passthrough tagging the model name.
vi.mock("@ai-sdk/google", () => ({
  google: (name: string) => ({ __model: name }),
}));

// Mock the AI SDK; generateText/streamText behaviour is configured per test.
const generateText = vi.fn();
const streamText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  streamText: (...args: unknown[]) => streamText(...args),
}));

import {
  resolveChatModels,
  isTransientError,
  streamWithFallback,
  generateWithFallback,
  AllModelsFailedError,
} from "./model-chain";

beforeEach(() => {
  generateText.mockReset();
  streamText.mockReset();
});

describe("resolveChatModels", () => {
  it("orders the list and appends the single model as final fallback", () => {
    expect(resolveChatModels()).toEqual([
      "primary-model",
      "backup-model",
      "final-model",
    ]);
  });
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
  it("treats a 400 as non-transient", () => {
    expect(isTransientError({ statusCode: 400 })).toBe(false);
  });
});

describe("streamWithFallback", () => {
  it("uses the first model whose probe succeeds", async () => {
    generateText.mockResolvedValueOnce({ text: "ok" }); // primary probe passes
    streamText.mockReturnValueOnce({ __stream: "primary" });

    const res = await streamWithFallback({ messages: [] });
    expect(res).toEqual({ __stream: "primary" });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(streamText.mock.calls[0][0].model).toEqual({ __model: "primary-model" });
  });

  it("falls through on a transient probe failure to the next model", async () => {
    generateText
      .mockRejectedValueOnce({ statusCode: 429 }) // primary fails
      .mockResolvedValueOnce({ text: "ok" }); // backup passes
    streamText.mockReturnValueOnce({ __stream: "backup" });

    const res = await streamWithFallback({ messages: [] });
    expect(res).toEqual({ __stream: "backup" });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(streamText.mock.calls[0][0].model).toEqual({ __model: "backup-model" });
  });

  it("throws immediately on a non-transient failure", async () => {
    generateText.mockRejectedValueOnce({ statusCode: 400 });
    await expect(streamWithFallback({ messages: [] })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("throws AllModelsFailedError when every model is transiently down", async () => {
    generateText.mockRejectedValue({ statusCode: 429 });
    await expect(streamWithFallback({ messages: [] })).rejects.toBeInstanceOf(
      AllModelsFailedError,
    );
    expect(generateText).toHaveBeenCalledTimes(3); // all three models tried
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
});
