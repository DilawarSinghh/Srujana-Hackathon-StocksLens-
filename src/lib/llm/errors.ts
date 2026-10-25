import "server-only";

/**
 * Central, typed error classification for the Groq LLM inference layer.
 *
 * Every AI route funnels its provider failure through `classifyLlmError` so the
 * UI can show an honest, actionable message and pick safe retry behaviour —
 * instead of collapsing every failure into a generic "the AI service is busy".
 *
 * Groq is the ONLY inference provider, so these kinds describe Groq (or the
 * app's own configuration/quota), never a fallback to another vendor.
 */

export type LlmErrorKind =
  // The server has no usable Groq model configured (missing GROQ_API_KEY /
  // GROQ_MODEL / LLM_CHAT_CHAIN). NOT a transient condition — retrying is futile.
  | "not_configured"
  // Groq rate-limited the request (HTTP 429 / RPM / TPM). May recover; a
  // Retry-After is honoured when present.
  | "rate_limited"
  // Groq rejected the credentials (401/403). Retrying is futile.
  | "invalid_key"
  // The configured model is unknown/unavailable for this account (404).
  | "model_unavailable"
  // The request was malformed / schema-incompatible (400/422).
  | "bad_request"
  // The request timed out or was aborted.
  | "timeout"
  // Groq returned a server error (5xx). May recover.
  | "provider_error"
  // Groq returned an empty / unparseable response.
  | "empty_response"
  // Anything we could not classify.
  | "unknown";

export interface ClassifiedLlmError {
  kind: LlmErrorKind;
  /** HTTP status to return from the API route. */
  status: number;
  /** Stable machine code the client can branch on. */
  code: LlmErrorKind;
  /** Safe, user-facing message (no secrets, no stack traces). */
  message: string;
  /** Whether a retry could plausibly succeed. */
  retryable: boolean;
  /** Suggested wait before retrying, in ms, when known (e.g. Groq Retry-After). */
  retryAfterMs?: number;
}

/** Distinct error thrown when NO Groq model is configured (empty chain). */
export class LlmNotConfiguredError extends Error {
  constructor(message = "No Groq model is configured.") {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

/** Distinct error thrown when the model returned an empty/unusable response. */
export class LlmEmptyResponseError extends Error {
  constructor(message = "The model returned an empty response.") {
    super(message);
    this.name = "LlmEmptyResponseError";
  }
}

function statusCodeOf(err: unknown): number | undefined {
  const e = err as { statusCode?: number; status?: number };
  return e?.statusCode ?? e?.status;
}

/**
 * Classify the result of an exhausted model chain (AllModelsFailedError).
 *
 * That error carries the LAST underlying provider error plus its HTTP status
 * code separately, so we merge the status onto the inner error before
 * classifying. Kept here (taking primitives only) to avoid an import cycle with
 * model-chain.ts.
 */
export function classifyModelsFailed(
  lastError: unknown,
  lastStatusCode?: number,
  retryAfterMs?: number | null,
): ClassifiedLlmError {
  const merged =
    lastStatusCode != null
      ? Object.assign(
          lastError instanceof Error ? lastError : new Error(String(lastError ?? "")),
          { statusCode: lastStatusCode },
        )
      : lastError;
  return classifyLlmError(merged, retryAfterMs);
}

function messageOf(err: unknown): string {
  return ((err as { message?: string })?.message ?? "").toLowerCase();
}

/**
 * Classify any error raised while talking to Groq into a typed, UI-safe result.
 *
 * Pass the error plus, optionally, a Retry-After (ms) extracted upstream from
 * provider headers.
 */
export function classifyLlmError(
  err: unknown,
  retryAfterMs?: number | null,
): ClassifiedLlmError {
  // 1) Our own typed conditions first.
  if (err instanceof LlmNotConfiguredError) {
    return {
      kind: "not_configured",
      status: 503,
      code: "not_configured",
      message:
        "The configured AI model is unavailable. Check the server-side Groq model configuration.",
      retryable: false,
    };
  }
  if (err instanceof LlmEmptyResponseError) {
    return {
      kind: "empty_response",
      status: 502,
      code: "empty_response",
      message:
        "The AI service returned an empty answer. Your message has not been answered — please try again.",
      retryable: true,
    };
  }

  const status = statusCodeOf(err);
  const name = (err as { name?: string })?.name ?? "";
  const msg = messageOf(err);

  // 2) Timeouts / aborts.
  if (name === "AbortError" || name === "TimeoutError" || /timed? ?out/.test(msg)) {
    return {
      kind: "timeout",
      status: 504,
      code: "timeout",
      message:
        "The AI request timed out before Groq responded. Please try again.",
      retryable: true,
    };
  }

  // 3) HTTP-status-driven classification.
  if (status === 429 || /rate.?limit|too many requests|tokens? per minute|tpm|rpm/.test(msg)) {
    return {
      kind: "rate_limited",
      status: 429,
      code: "rate_limited",
      message: retryAfterMs
        ? `Groq has temporarily rate-limited this request. Retry in about ${Math.ceil(
            retryAfterMs / 1000,
          )}s.`
        : "Groq has temporarily rate-limited this request. Please retry shortly.",
      retryable: true,
      retryAfterMs: retryAfterMs ?? undefined,
    };
  }
  if (status === 401 || status === 403 || /unauthor|invalid api key|invalid_api_key|forbidden/.test(msg)) {
    return {
      kind: "invalid_key",
      status: 502,
      code: "invalid_key",
      message:
        "The AI service rejected the server credentials. Check the server-side Groq API key.",
      retryable: false,
    };
  }
  if (status === 404 || /model.*(not found|does not exist|unavailable|decommission)/.test(msg)) {
    return {
      kind: "model_unavailable",
      status: 502,
      code: "model_unavailable",
      message:
        "The configured AI model is unavailable. Check the server-side model configuration.",
      retryable: false,
    };
  }
  if (status === 400 || status === 422) {
    return {
      kind: "bad_request",
      status: 502,
      code: "bad_request",
      message:
        "The AI request was rejected as invalid. Your message has not been answered — please try again.",
      retryable: false,
    };
  }
  if (typeof status === "number" && status >= 500) {
    return {
      kind: "provider_error",
      status: 502,
      code: "provider_error",
      message:
        "The AI service had a temporary problem. Your message has not been answered — please try again.",
      retryable: true,
    };
  }

  // 4) Fallback.
  return {
    kind: "unknown",
    status: 500,
    code: "unknown",
    message:
      "The AI service could not complete the request. Your message has not been answered.",
    retryable: true,
  };
}
