import "server-only";
import type { LanguageModelV1 } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { google } from "@ai-sdk/google";
import { getServerEnv } from "@/lib/env";

/**
 * Provider-agnostic chat model resolution.
 *
 * A "chain entry" is a `provider:model` string (e.g. "groq:llama-3.1-8b" or
 * "google:gemini-2.0-flash"). We resolve each entry to a Vercel AI SDK
 * LanguageModelV1 instance. A provider whose API key (or required base URL) is
 * missing from the validated env is SKIPPED SILENTLY so a deployment can run
 * with whichever providers happen to be configured.
 *
 * No model names or keys are hard-coded here: everything comes from env.
 */

export type ProviderId = "groq" | "huggingface" | "google";

export interface ChainEntry {
  provider: ProviderId;
  model: string;
}

/** A resolved, ready-to-use model plus a stable label for logging. */
export interface ResolvedModel {
  label: string; // e.g. "groq:llama-3.1-8b-instant"
  provider: ProviderId;
  model: LanguageModelV1;
}

const KNOWN_PROVIDERS: ReadonlySet<string> = new Set([
  "groq",
  "huggingface",
  "google",
]);

/**
 * Parse a comma-separated chain string into typed entries. Unknown provider
 * prefixes and malformed entries are dropped. Order and duplicates within the
 * parsed list are preserved as written (de-duplication happens later per
 * resolved label).
 */
export function parseChain(raw: string | undefined): ChainEntry[] {
  if (!raw) return [];
  const entries: ChainEntry[] = [];
  for (const piece of raw.split(",")) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue; // need a non-empty provider prefix
    const provider = trimmed.slice(0, idx).trim().toLowerCase();
    const model = trimmed.slice(idx + 1).trim();
    if (!model || !KNOWN_PROVIDERS.has(provider)) continue;
    entries.push({ provider: provider as ProviderId, model });
  }
  return entries;
}

/**
 * True when a provider has the credentials it needs to be usable. Used to skip
 * entries silently rather than failing a whole request.
 */
export function isProviderConfigured(provider: ProviderId): boolean {
  const env = getServerEnv();
  switch (provider) {
    case "groq":
      return Boolean(env.GROQ_API_KEY);
    case "huggingface":
      return Boolean(env.HUGGINGFACE_API_KEY && env.HUGGINGFACE_BASE_URL);
    case "google":
      return Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY);
  }
}

/** Build a LanguageModelV1 for one entry, or null if the provider is unusable. */
export function resolveModel(entry: ChainEntry): ResolvedModel | null {
  const env = getServerEnv();
  if (!isProviderConfigured(entry.provider)) return null;

  const label = `${entry.provider}:${entry.model}`;
  switch (entry.provider) {
    case "groq": {
      const groq = createGroq({ apiKey: env.GROQ_API_KEY });
      return { label, provider: "groq", model: groq(entry.model) };
    }
    case "huggingface": {
      const hf = createOpenAICompatible({
        name: "huggingface",
        apiKey: env.HUGGINGFACE_API_KEY,
        baseURL: env.HUGGINGFACE_BASE_URL as string,
      });
      return { label, provider: "huggingface", model: hf(entry.model) };
    }
    case "google": {
      // The Google provider reads GOOGLE_GENERATIVE_AI_API_KEY from env.
      return { label, provider: "google", model: google(entry.model) };
    }
  }
}

/**
 * Resolve the ordered list of usable chat models.
 *
 * Precedence:
 *   1. LLM_CHAT_CHAIN when set — multi-provider, entries tried in order.
 *   2. Otherwise the legacy Gemini-only chain (GEMINI_CHAT_MODELS +
 *      GEMINI_CHAT_MODEL) for backward compatibility.
 *
 * Providers whose keys are missing are skipped. De-duplicated by label while
 * preserving order. May return an empty array if nothing is configured; the
 * caller surfaces the existing friendly error in that case.
 */
export function resolveChatChain(): ResolvedModel[] {
  const env = getServerEnv();
  const entries = env.LLM_CHAT_CHAIN
    ? parseChain(env.LLM_CHAT_CHAIN)
    : legacyGeminiEntries();

  const out: ResolvedModel[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const resolved = resolveModel(entry);
    if (!resolved) continue; // provider not configured — skip silently
    if (seen.has(resolved.label)) continue;
    seen.add(resolved.label);
    out.push(resolved);
  }
  return out;
}

/** Legacy Gemini chain as `google:` entries (backward-compatible fallback). */
function legacyGeminiEntries(): ChainEntry[] {
  const env = getServerEnv();
  const models = (env.GEMINI_CHAT_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  models.push(env.GEMINI_CHAT_MODEL); // always the final fallback
  return [...new Set(models)].map((model) => ({
    provider: "google" as const,
    model,
  }));
}

/**
 * Resolve the single model used for the fact audit. Uses LLM_AUDIT_MODEL when
 * set and configured; otherwise the head of the resolved chat chain.
 */
export function resolveAuditModel(): ResolvedModel | null {
  const env = getServerEnv();
  if (env.LLM_AUDIT_MODEL) {
    const [entry] = parseChain(env.LLM_AUDIT_MODEL);
    if (entry) {
      const resolved = resolveModel(entry);
      if (resolved) return resolved;
    }
  }
  return resolveChatChain()[0] ?? null;
}
