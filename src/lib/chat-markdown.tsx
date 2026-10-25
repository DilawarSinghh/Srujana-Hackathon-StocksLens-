import * as React from "react";
import type { ChatSource } from "@/types/database";

/**
 * Lightweight, safe markdown renderer for chat answers.
 *
 * Supports: paragraphs, bullet lists (- / *), bold (**text**), and inline
 * [Sn] citation tags turned into clickable chips. All text is rendered as React
 * text nodes (no dangerouslySetInnerHTML), so it is XSS-safe by construction.
 */

const CITATION_RE = /\[S(\d+)\]/g;

function renderInline(
  text: string,
  sources: ChatSource[],
  onCite: (s: ChatSource) => void,
  keyPrefix: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on bold first, then handle citations within each part.
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);

  boldParts.forEach((part, bi) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      nodes.push(
        <strong key={`${keyPrefix}-b${bi}`}>{part.slice(2, -2)}</strong>,
      );
      return;
    }
    // Citations within this plain part.
    let last = 0;
    let m: RegExpExecArray | null;
    CITATION_RE.lastIndex = 0;
    while ((m = CITATION_RE.exec(part)) !== null) {
      if (m.index > last) nodes.push(part.slice(last, m.index));
      const tag = `S${m[1]}`;
      const source = sources.find((s) => s.id === tag);
      nodes.push(
        <CitationChip
          key={`${keyPrefix}-c${bi}-${m.index}`}
          tag={tag}
          source={source}
          onClick={onCite}
        />,
      );
      last = m.index + m[0].length;
    }
    if (last < part.length) nodes.push(part.slice(last));
  });

  return nodes;
}

/** Inline citation chip like "Annual Report FY25 · p. 47". */
function CitationChip({
  tag,
  source,
  onClick,
}: {
  tag: string;
  source: ChatSource | undefined;
  onClick: (s: ChatSource) => void;
}) {
  if (!source) {
    return (
      <span className="mx-0.5 rounded bg-muted px-1 text-[10px] text-muted-foreground align-middle">
        {tag}
      </span>
    );
  }
  const label = `${source.doc}${source.page != null ? ` · p. ${source.page}` : ""}`;
  return (
    <button
      type="button"
      onClick={() => onClick(source)}
      className="mx-0.5 inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary align-middle hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={label}
    >
      {label}
    </button>
  );
}

/** Render a full chat message body. */
export function ChatMarkdown({
  content,
  sources,
  onCite,
}: {
  content: string;
  sources: ChatSource[];
  onCite: (s: ChatSource) => void;
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
      listItems.push(
        <li key={`li-${i}`}>{renderInline(bullet[1], sources, onCite, `li${i}`)}</li>,
      );
    } else {
      flushList();
      blocks.push(
        <p key={`p-${i}`} className="my-1 leading-relaxed">
          {renderInline(line, sources, onCite, `p${i}`)}
        </p>,
      );
    }
  });
  flushList();

  return <div className="break-words text-sm">{blocks}</div>;
}
