import "server-only";
import type { LanguageModelV1 } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { getServerEnv } from "@/lib/env";

/**
 * Groq-only chat model resolution.
 *
 * StockLens uses Groq as its ONLY LLM inference provider. A "chain entry" is a
 * `provider:model` string (e.g. "groq:openai/gpt-oss-20b"). Only the `groq`
 * provider is accepted; any other prefix (google / huggingface / openai / …) is
 * dropped during parsing so no non-Groq inference path can ever be constructed,
 * even if a stray entry is left in LLM_CHAT_CHAIN.
 *
 * The chain still exists so that several Groq models can be tried in order on a
 * transient Groq failure (rate limit / 5xx / timeout) — this is a fallback
 * BETWEEN GROQ MODELS, never between providers.
 *
 * No model names or keys are hard-coded here: everything comes from env
 * (LLM_CHAT_CHAIN, or GROQ_MODEL as the default single-model chain).
 *
 * NOTE: text embeddings are NOT handled here. Groq exposes no embeddings
 * endpoint, so embeddings remain on a separate provider (see
 * src/lib/rag/embeddings.ts). That is a retrieval dependency, not LLM
 * inference, and is intentionally out of scope for this resolver.
 */

export type ProviderId = "groq";

export interface ChainEntry {
  provider: ProviderId;
  model: string;
}

/** A resolved, ready-to-use model plus a stable label for logging. */
export interface ResolvedModel {
  label: string; // e.g. "groq:openai/gpt-oss-20b"
  provider: ProviderId;
  model: LanguageModelV1;
}

/** The only LLM inference provider StockLens is permitted to use. */
const KNOWN_PROVIDERS: ReadonlySet<string> = new Set(["groq"]);

/**
 * Safe default Groq chat model, used when neither LLM_CHAT_CHAIN nor GROQ_MODEL
 * is set (e.g. the env var was forgotten in a deployment). This is a currently
 * available Groq-hosted model, verified via the Groq /models endpoint; it keeps
 * chat working out of the box while remaining fully overridable through env.
 */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

/**
 * Parse a comma-separated chain string into typed entries. Entries whose
 * provider prefix is not `groq` are dropped (Groq-only policy), as are
 * malformed entries. Order and duplicates within the parsed list are preserved
 * as written (de-duplication happens later per resolved label).
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
 * True when a provider has the credentials it needs to be usable. Groq needs
 * GROQ_API_KEY.
 */
export function isProviderConfigured(provider: ProviderId): boolean {
  const env = getServerEnv();
  switch (provider) {
    case "groq":
      return Boolean(env.GROQ_API_KEY);
  }
}

/** Build a LanguageModelV1 for one entry, or null if Groq is not configured. */
export function resolveModel(entry: ChainEntry): ResolvedModel | null {
  const env = getServerEnv();
  if (!isProviderConfigured(entry.provider)) return null;

  const label = `${entry.provider}:${entry.model}`;
  switch (entry.provider) {
    case "groq": {
      const groq = createGroq({ apiKey: env.GROQ_API_KEY });
      return { label, provider: "groq", model: groq(entry.model) };
    }
  }
}

/**
 * Resolve the ordered list of usable Groq chat models.
 *
 * Precedence:
 *   1. LLM_CHAT_CHAIN when set — ordered `groq:<model>` entries, tried in order
 *      on a transient Groq failure. Non-groq entries are dropped.
 *   2. Otherwise a single-model chain built from GROQ_MODEL.
 *
 * De-duplicated by label while preserving order. Returns an empty array when
 * Groq is not configured (no GROQ_API_KEY) or no usable model is set; the
 * caller surfaces the existing friendly error in that case.
 */
export function resolveChatChain(): ResolvedModel[] {
  const env = getServerEnv();
  const entries = env.LLM_CHAT_CHAIN
    ? parseChain(env.LLM_CHAT_CHAIN)
    : defaultGroqEntries();

  const out: ResolvedModel[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const resolved = resolveModel(entry);
    if (!resolved) continue; // Groq not configured — skip silently
    if (seen.has(resolved.label)) continue;
    seen.add(resolved.label);
    out.push(resolved);
  }
  return out;
}

/**
 * Default single-model Groq chain. Uses GROQ_MODEL when set, otherwise falls
 * back to DEFAULT_GROQ_MODEL so chat keeps working even if the env var is
 * missing in a deployment. Still requires GROQ_API_KEY (resolveModel enforces
 * that) — the default model name alone is never enough.
 */
function defaultGroqEntries(): ChainEntry[] {
  const env = getServerEnv();
  const model = env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  return [{ provider: "groq", model }];
}

/**
 * Resolve the single model used for the fact audit. Uses LLM_AUDIT_MODEL when
 * set and configured (must be a `groq:` entry); otherwise the head of the
 * resolved chat chain.
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
