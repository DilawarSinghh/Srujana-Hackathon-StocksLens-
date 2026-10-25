import Link from "next/link";
import { tokenizePost } from "@/lib/community/text";

/**
 * Render a post/comment body safely. The text is tokenized into plain text and
 * #hashtag / $cashtag / @mention / URL tokens, each rendered as a React node.
 * No `dangerouslySetInnerHTML` — user content can never inject markup (XSS-safe).
 */
export function PostBody({ text }: { text: string }) {
  const tokens = tokenizePost(text);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {tokens.map((t, i) => {
        switch (t.kind) {
          case "hashtag":
            return (
              <Link
                key={i}
                href={`/community/trending?tag=${encodeURIComponent(t.value)}`}
                className="text-primary hover:underline"
              >
                #{t.value}
              </Link>
            );
          case "cashtag":
            return (
              <Link
                key={i}
                href={`/community/stock/${encodeURIComponent(t.value)}`}
                className="font-medium text-primary hover:underline"
              >
                ${t.value}
              </Link>
            );
          case "mention":
            return (
              <span key={i} className="font-medium text-primary">
                @{t.value}
              </span>
            );
          case "url":
            return (
              <a
                key={i}
                href={t.value}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-primary underline underline-offset-2"
              >
                {t.value}
              </a>
            );
          default:
            return <span key={i}>{t.value}</span>;
        }
      })}
    </p>
  );
}
