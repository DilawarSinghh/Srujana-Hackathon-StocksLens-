import type { ZodType, ZodTypeDef } from "zod";

/**
 * Defensive JSON extraction for agent outputs.
 *
 * Open-model providers often wrap JSON in prose, fenced code blocks, or stray
 * <think> reasoning. We extract the first balanced top-level JSON object, then
 * validate it against a Zod schema. Pure and deterministic — unit tested.
 *
 * We deliberately do NOT use the SDK's `generateObject` here: the configured
 * provider chain includes open models whose tool/JSON-mode support is
 * inconsistent, and the repo's established pattern is "prompt + deterministic
 * post-process" (see src/lib/llm/post-process.ts).
 */

/** Strip <think>…</think> blocks and ```json fences that wrap the payload. */
function stripWrappers(raw: string): string {
  let s = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "");
  // Remove a leading ```json / ``` fence and its trailing ``` if present.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1];
  return s.trim();
}

/**
 * Find the first balanced {...} object in the text, respecting string literals
 * and escapes so braces inside strings don't break the scan.
 */
export function extractFirstJsonObject(raw: string): string | null {
  const s = stripWrappers(raw);
  const start = s.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export interface ParseResult<T> {
  ok: boolean;
  value: T | null;
  /** Short reason when parsing/validation failed. */
  error: string | null;
}

/**
 * Parse + validate an agent response against a schema. Returns a discriminated
 * result instead of throwing, so the orchestrator can mark that one agent
 * "failed" without faking a verdict.
 */
export function parseAgentJson<Output>(
  raw: string,
  schema: ZodType<Output, ZodTypeDef, unknown>,
): ParseResult<Output> {
  const jsonText = extractFirstJsonObject(raw);
  if (!jsonText) {
    return { ok: false, value: null, error: "No JSON object found in model output." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, value: null, error: "Model output was not valid JSON." };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join(".") || "(root)";
    return {
      ok: false,
      value: null,
      error: `Model output did not match the expected shape (${where}: ${first?.message ?? "invalid"}).`,
    };
  }

  return { ok: true, value: result.data, error: null };
}
