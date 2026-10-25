"use client";

import { FileText, Database } from "lucide-react";
import type { Evidence } from "@/lib/debate/schema";
import type { DebateCitation } from "@/components/debate/types";

interface EvidenceListProps {
  evidence: Evidence[];
  citations: DebateCitation[];
  onCite: (c: DebateCitation) => void;
}

/**
 * Render evidence items with provenance. A filing-backed item (citation tag
 * that resolves to a real source) becomes a clickable chip; a data/metric item
 * is clearly distinguished from a filing excerpt.
 */
export function EvidenceList({ evidence, citations, onCite }: EvidenceListProps) {
  if (evidence.length === 0) return null;
  const byTag = new Map(citations.map((c) => [c.id, c]));

  return (
    <ul className="mt-2 flex flex-col gap-2">
      {evidence.map((e, i) => {
        const cite = e.citation ? byTag.get(e.citation.trim()) : undefined;
        return (
          <li
            key={i}
            className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs"
          >
            <p>{e.statement}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {cite ? (
                <button
                  type="button"
                  onClick={() => onCite(cite)}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FileText className="h-3 w-3" aria-hidden="true" />
                  {cite.doc}
                  {cite.fiscalYear ? ` FY${String(cite.fiscalYear).slice(-2)}` : ""}
                  {cite.page != null ? ` · p.${cite.page}` : ""}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Database className="h-3 w-3" aria-hidden="true" />
                  {e.source}
                </span>
              )}
              {e.period ? <span>· {e.period}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
