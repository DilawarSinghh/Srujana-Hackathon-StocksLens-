"use client";

import * as React from "react";
import { ShieldCheck, AlertTriangle, ChevronDown } from "lucide-react";
import type { AuditResult } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * Fact-audit badge shown under an assistant answer.
 *  - All claims grounded: green "Verified against filings (n of m claims)".
 *  - Some unverifiable: amber "Some statements could not be verified" with an
 *    expandable list of the unverifiable sentences.
 * Renders nothing when there is no audit (audit failed/timed out).
 */
export function AuditBadge({ audit }: { audit: AuditResult | null | undefined }) {
  const [open, setOpen] = React.useState(false);

  if (!audit) return null;
  const { groundedCount, unverifiableCount } = audit;
  const checked = groundedCount + unverifiableCount;
  if (checked === 0) return null;

  const unverifiable = audit.claims.filter((c) => c.status === "unverifiable");

  if (unverifiableCount === 0) {
    return (
      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-strong">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          Verified against filings ({groundedCount} of {checked} claims)
        </span>
      </div>
    );
  }

  return (
    <div className="mt-1.5 text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-weak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        aria-expanded={open}
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Some statements could not be verified</span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
          {unverifiable.map((c, i) => (
            <li key={i}>{c.sentence}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
