import { describe, it, expect } from "vitest";
import {
  classifyLlmError,
  LlmNotConfiguredError,
  LlmEmptyResponseError,
} from "./errors";

describe("classifyLlmError", () => {
  it("maps a missing Groq configuration to a non-retryable not_configured error", () => {
    const c = classifyLlmError(new LlmNotConfiguredError());
    expect(c.kind).toBe("not_configured");
    expect(c.status).toBe(503);
    expect(c.retryable).toBe(false);
    expect(c.message).toMatch(/model configuration/i);
  });

  it("maps an empty response to a retryable empty_response error", () => {
    const c = classifyLlmError(new LlmEmptyResponseError());
    expect(c.kind).toBe("empty_response");
    expect(c.retryable).toBe(true);
  });

  it("maps a Groq 429 to rate_limited and surfaces Retry-After seconds", () => {
    const c = classifyLlmError({ statusCode: 429 }, 5000);
    expect(c.kind).toBe("rate_limited");
    expect(c.status).toBe(429);
    expect(c.retryable).toBe(true);
    expect(c.retryAfterMs).toBe(5000);
    expect(c.message).toMatch(/5s/);
  });

  it("detects a rate-limit from the message text when no status is present", () => {
    const c = classifyLlmError(new Error("Rate limit reached: tokens per minute"));
    expect(c.kind).toBe("rate_limited");
  });

  it("maps 401/403 to a non-retryable invalid_key error", () => {
    expect(classifyLlmError({ statusCode: 401 }).kind).toBe("invalid_key");
    const c = classifyLlmError({ statusCode: 403 });
    expect(c.kind).toBe("invalid_key");
    expect(c.retryable).toBe(false);
  });

  it("maps 404 / 'model not found' to model_unavailable", () => {
    expect(classifyLlmError({ statusCode: 404 }).kind).toBe("model_unavailable");
    expect(
      classifyLlmError(new Error("The model `x` does not exist")).kind,
    ).toBe("model_unavailable");
  });

  it("maps 400/422 to a non-retryable bad_request", () => {
    expect(classifyLlmError({ statusCode: 400 }).retryable).toBe(false);
    expect(classifyLlmError({ statusCode: 422 }).kind).toBe("bad_request");
  });

  it("maps a timeout/abort to a retryable timeout error", () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const c = classifyLlmError(abort);
    expect(c.kind).toBe("timeout");
    expect(c.retryable).toBe(true);
  });

  it("maps 5xx to a retryable provider_error", () => {
    const c = classifyLlmError({ statusCode: 503 });
    expect(c.kind).toBe("provider_error");
    expect(c.retryable).toBe(true);
  });

  it("falls back to unknown for an unrecognized error", () => {
    const c = classifyLlmError(new Error("something odd"));
    expect(c.kind).toBe("unknown");
    expect(c.status).toBe(500);
  });

  it("never echoes a raw stack or secret in the message", () => {
    const c = classifyLlmError(new Error("gsk_SECRET leaked here"));
    expect(c.message).not.toMatch(/gsk_/);
  });
});
