/**
 * Opt-in LIVE Groq smoke test.
 *
 *   pnpm smoke:groq
 *
 * Makes ONE small, inexpensive Groq request through the SAME provider chain the
 * app uses (resolveChatChain → Groq only) and verifies a non-empty text
 * response comes back. It never prints the API key.
 *
 * Opt-in: it only runs when RUN_LIVE_GROQ=1 (and a Groq key is configured), so
 * routine `pnpm test` never burns live quota. Exit codes:
 *   0  success, or intentionally skipped (not opted in / Groq not configured)
 *   1  a live failure (invalid credentials, unavailable model, rate limit, …)
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: false });

import { generateText } from "ai";
import { resolveChatChain } from "@/lib/llm/providers";

function redact(msg: string): string {
  // Defensive: never surface anything resembling a Groq key (gsk_...).
  return msg.replace(/gsk_[A-Za-z0-9]+/g, "gsk_***");
}

async function main(): Promise<number> {
  if (process.env.RUN_LIVE_GROQ !== "1") {
    console.log(
      "[groq-smoke] skipped (set RUN_LIVE_GROQ=1 to run a live Groq request).",
    );
    return 0;
  }

  const chain = resolveChatChain();
  if (chain.length === 0) {
    console.log(
      "[groq-smoke] skipped: no Groq chat model configured. Set GROQ_API_KEY and GROQ_MODEL (or LLM_CHAT_CHAIN=groq:<model>).",
    );
    return 0;
  }

  // Every entry must be Groq — this script asserts the Groq-only policy too.
  const nonGroq = chain.filter((m) => m.provider !== "groq");
  if (nonGroq.length > 0) {
    console.error(
      `[groq-smoke] FAIL: non-Groq provider(s) resolved in the chat chain: ${nonGroq
        .map((m) => m.provider)
        .join(", ")}. StockLens must use Groq exclusively.`,
    );
    return 1;
  }

  const head = chain[0];
  console.log(`[groq-smoke] calling ${head.label} …`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    // NOTE: Groq's gpt-oss models are reasoning models that spend tokens on
    // hidden reasoning before emitting visible text, so the budget must leave
    // room for a short answer (a tiny maxTokens yields empty content).
    const { text, usage } = await generateText({
      model: head.model,
      prompt: "In one short sentence, say that the connection works.",
      maxTokens: 256,
      temperature: 0,
      abortSignal: controller.signal,
    });
    const answer = text.trim();
    if (!answer) {
      console.error("[groq-smoke] FAIL: Groq returned an empty response.");
      return 1;
    }
    console.log(
      `[groq-smoke] OK — model responded (${answer.length} chars, ~${
        usage?.totalTokens ?? "?"
      } tokens). Groq is reachable and the key is valid.`,
    );
    return 0;
  } catch (e) {
    const err = e as { statusCode?: number; name?: string; message?: string };
    const status = err?.statusCode;
    let hint = "unexpected error";
    if (status === 401 || status === 403) hint = "invalid or unauthorized GROQ_API_KEY";
    else if (status === 404) hint = "model not found / unavailable for this account";
    else if (status === 429) hint = "rate limited (429) — try again later";
    else if (err?.name === "AbortError") hint = "request timed out";
    else if (typeof status === "number" && status >= 500) hint = `Groq server error (${status})`;
    console.error(
      `[groq-smoke] FAIL: ${hint}. Detail: ${redact(err?.message ?? String(e))}`,
    );
    return 1;
  } finally {
    clearTimeout(timer);
  }
}

main().then((code) => process.exit(code));
