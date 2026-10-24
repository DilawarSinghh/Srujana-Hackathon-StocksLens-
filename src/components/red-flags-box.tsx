import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { RedFlag } from "@/types/database";

interface RedFlagsBoxProps {
  redFlags: RedFlag[];
}

/** Lists triggered red flags, or a reassuring note when none are present. */
export function RedFlagsBox({ redFlags }: RedFlagsBoxProps) {
  if (redFlags.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-strong" aria-hidden="true" />
        <div>
          <p className="font-medium">No red flags detected in available data.</p>
          <p className="text-xs text-muted-foreground">
            Governance data (pledge, auditor opinion, related-party trend) may be
            incomplete, so absence of a flag is not a guarantee.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {redFlags.map((flag) => (
        <li
          key={flag.code}
          className="flex items-start gap-2 rounded-md border border-weak/40 bg-weak/10 px-3 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-weak" aria-hidden="true" />
          <div>
            <p className="font-medium text-weak">{flag.title}</p>
            <p className="text-muted-foreground">{flag.explanation}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
