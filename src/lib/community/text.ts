/**
 * Pure text helpers for Community posts: hashtag / cashtag extraction and
 * safe-render tokenization. No HTML is ever emitted here — the renderer maps
 * tokens to React elements, so user content cannot inject markup (XSS-safe).
 */

/** Extract unique lowercased #hashtags (letters/digits/underscore, 1–30). */
export function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  const re = /#([A-Za-z0-9_]{1,30})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1].toLowerCase());
  return [...out];
}

/** Extract unique uppercased $CASHTAGS (letters/digits, 1–20). Candidates only
 *  — callers must validate against the stock universe before trusting them. */
export function extractCashtags(text: string): string[] {
  const out = new Set<string>();
  const re = /\$([A-Za-z0-9]{1,20})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1].toUpperCase());
  return [...out];
}

/** Extract @mention handles (letters/digits/underscore, 1–30). */
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  const re = /@([A-Za-z0-9_]{1,30})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return [...out];
}

export type PostToken =
  | { kind: "text"; value: string }
  | { kind: "hashtag"; value: string } // without '#'
  | { kind: "cashtag"; value: string } // without '$', uppercase
  | { kind: "mention"; value: string } // without '@'
  | { kind: "url"; value: string };

/**
 * Tokenize post body for safe rendering. Splits out #hashtags, $cashtags,
 * @mentions, and http(s) URLs; everything else is plain text. The caller
 * renders each token as a React node, so no raw HTML is ever produced.
 */
export function tokenizePost(text: string): PostToken[] {
  const tokens: PostToken[] = [];
  // Order matters: URLs first so a '#' inside a URL isn't mis-parsed.
  const re =
    /(https?:\/\/[^\s]+)|#([A-Za-z0-9_]{1,30})|\$([A-Za-z0-9]{1,20})|@([A-Za-z0-9_]{1,30})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      tokens.push({ kind: "text", value: text.slice(last, m.index) });
    }
    if (m[1]) tokens.push({ kind: "url", value: m[1] });
    else if (m[2]) tokens.push({ kind: "hashtag", value: m[2] });
    else if (m[3]) tokens.push({ kind: "cashtag", value: m[3].toUpperCase() });
    else if (m[4]) tokens.push({ kind: "mention", value: m[4] });
    last = re.lastIndex;
  }
  if (last < text.length) {
    tokens.push({ kind: "text", value: text.slice(last) });
  }
  return tokens;
}
