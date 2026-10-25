import "server-only";
import { isAllowlisted } from "@/config/web-sources";
import { hostResolvesToPublicIp } from "@/lib/web/ssrf";

/**
 * Server-side page reader for Web Research mode. Deliberately strict:
 *
 *  - HTTPS only.
 *  - Host must be on the provided allowlist.
 *  - Host must resolve to a PUBLIC IP (SSRF guard — see ssrf.ts).
 *  - 8-second timeout, max 1 MB downloaded.
 *  - Content-Type must be html or text.
 *  - Redirects are followed MANUALLY (max 3) and each hop is re-validated
 *    against the allowlist + SSRF + https rules. A redirect to a non-allowlisted
 *    or non-public or non-https target is refused.
 *  - Scripts/styles/nav/head are stripped; output is capped to ~6000 chars.
 */

export const PAGE_TIMEOUT_MS = 8_000;
export const MAX_BYTES = 1_000_000; // 1 MB
export const MAX_TEXT_CHARS = 6_000;
const MAX_REDIRECTS = 3;

export interface FetchPageResult {
  url: string; // final URL after redirects
  text: string;
  retrievedAt: string; // ISO timestamp
}

export class PageFetchError extends Error {
  constructor(
    public readonly reason:
      | "not-https"
      | "not-allowlisted"
      | "ssrf-blocked"
      | "timeout"
      | "too-large"
      | "bad-content-type"
      | "too-many-redirects"
      | "http-error"
      | "fetch-failed",
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "PageFetchError";
  }
}

/** Validate a single URL hop against https + allowlist + SSRF rules. */
async function assertSafeUrl(url: string, allowlist: string[]): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PageFetchError("fetch-failed", "unparseable URL");
  }
  if (parsed.protocol !== "https:") throw new PageFetchError("not-https");
  if (!isAllowlisted(parsed.toString(), allowlist)) {
    throw new PageFetchError("not-allowlisted");
  }
  if (!(await hostResolvesToPublicIp(parsed.hostname))) {
    throw new PageFetchError("ssrf-blocked");
  }
  return parsed;
}

/**
 * Fetch and extract readable text from an allowlisted page. Throws
 * PageFetchError on any policy violation or transport failure.
 */
export async function fetchPageText(
  rawUrl: string,
  allowlist: string[],
): Promise<FetchPageResult> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = await assertSafeUrl(currentUrl, allowlist);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        method: "GET",
        redirect: "manual", // re-validate each hop ourselves
        signal: controller.signal,
        headers: {
          "user-agent": "FilingLensBot/1.0 (+educational research)",
          accept: "text/html,text/plain",
        },
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === "AbortError") throw new PageFetchError("timeout");
      throw new PageFetchError("fetch-failed", (e as Error).message);
    }

    // Handle redirects manually so each target is re-validated.
    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const location = res.headers.get("location");
      if (!location) throw new PageFetchError("http-error", "redirect without location");
      // Resolve relative redirects against the current URL.
      currentUrl = new URL(location, parsed).toString();
      continue;
    }

    if (!res.ok) {
      clearTimeout(timer);
      throw new PageFetchError("http-error", `status ${res.status}`);
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!/text\/html|text\/plain|^text\//.test(contentType)) {
      clearTimeout(timer);
      throw new PageFetchError("bad-content-type", contentType);
    }

    // Enforce the declared size, then the actual downloaded size.
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared && declared > MAX_BYTES) {
      clearTimeout(timer);
      throw new PageFetchError("too-large");
    }

    const html = await readCapped(res, controller, timer);
    const text = extractText(html).slice(0, MAX_TEXT_CHARS);
    return { url: parsed.toString(), text, retrievedAt: new Date().toISOString() };
  }

  throw new PageFetchError("too-many-redirects");
}

/** Read the body up to MAX_BYTES, aborting if the stream exceeds the cap. */
async function readCapped(
  res: Response,
  controller: AbortController,
  timer: ReturnType<typeof setTimeout>,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    clearTimeout(timer);
    return "";
  }
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES) {
        controller.abort();
        throw new PageFetchError("too-large");
      }
      out += decoder.decode(value, { stream: true });
    }
  } catch (e) {
    if (e instanceof PageFetchError) throw e;
    if ((e as Error).name === "AbortError") throw new PageFetchError("timeout");
    throw new PageFetchError("fetch-failed", (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
  return out;
}

/**
 * Strip scripts/styles/nav/head and collapse the remaining markup to readable
 * text. Intentionally simple (no DOM library): remove dangerous blocks, drop
 * all remaining tags, decode a few common entities, and normalize whitespace.
 */
export function extractText(html: string): string {
  let t = html;
  t = t.replace(/<!--[\s\S]*?-->/g, " ");
  t = t.replace(/<head[\s\S]*?<\/head>/gi, " ");
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  t = t.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  t = t.replace(/<header[\s\S]*?<\/header>/gi, " ");
  t = t.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  // Turn block boundaries into spaces so words don't run together.
  t = t.replace(/<\/(p|div|li|tr|h[1-6]|br|section|article)>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = decodeEntities(t);
  t = t.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"');
}
