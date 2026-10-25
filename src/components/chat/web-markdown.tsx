import * as React from "react";
import { ExternalLink } from "lucide-react";
import type { ChatSource } from "@/types/database";

/**
 * Markdown renderer for Web Research answers. Like ChatMarkdown but turns
 * [Wn] citation tags into SOURCE CHIPS showing the domain (stored in the
 * source's `section`) and a retrieved date hint, linking to the original URL in
 * a new tab with rel="noopener noreferrer". XSS-safe (React text nodes only).
 */

const CITATION_RE = /\[(W\d+)\]/g;

function renderInline(
  text: string,
  sources: ChatSource[],
  keyPrefix: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);

  boldParts.forEach((part, bi) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      nodes.push(<strong key={`${keyPrefix}-b${bi}`}>{part.slice(2, -2)}</strong>);
      return;
    }
    let last = 0;
    let m: RegExpExecArray | null;
    CITATION_RE.lastIndex = 0;
    while ((m = CITATION_RE.exec(part)) !== null) {
      if (m.index > last) nodes.push(part.slice(last, m.index));
      const tag = m[1];
      const source = sources.find((s) => s.id === tag);
      nodes.push(
        <WebSourceChip key={`${keyPrefix}-c${bi}-${m.index}`} tag={tag} source={source} />,
      );
      last = m.index + m[0].length;
    }
    if (last < part.length) nodes.push(part.slice(last));
  });

  return nodes;
}

/** Inline web source chip: "moneycontrol.com ↗". Opens the URL in a new tab. */
function WebSourceChip({ tag, source }: { tag: string; source: ChatSource | undefined }) {
  if (!source) {
    return (
      <span className="mx-0.5 rounded bg-muted px-1 text-[10px] text-muted-foreground align-middle">
        {tag}
      </span>
    );
  }
  const domain = source.section ?? "source";
  if (!source.url) {
    return (
      <span className="mx-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary align-middle">
        {domain}
      </span>
    );
  }
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary align-middle hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`${source.doc} — ${domain}`}
    >
      {domain}
      <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
    </a>
  );
}

/** Render a full web research message body with [Wn] source chips. */
export function WebMarkdown({
  content,
  sources,
}: {
  content: string;
  sources: ChatSource[];
}) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(
        <ul key={`ul-${key++}`} className="my-1 list-disc space-y-1 pl-5">
          {listItems}
        </ul>,
      );
      listItems = [];
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushList();
      return;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      listItems.push(<li key={`li-${i}`}>{renderInline(bullet[1], sources, `li${i}`)}</li>);
    } else {
      flushList();
      blocks.push(
        <p key={`p-${i}`} className="my-1 leading-relaxed">
          {renderInline(line, sources, `p${i}`)}
        </p>,
      );
    }
  });
  flushList();

  return <div className="text-sm">{blocks}</div>;
}
