"use client";

import * as React from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Explain my portfolio's risk" — asks the server to turn the computed risk
 * numbers into a plain-language explanation. The server builds the DATA block
 * and runs the same guards; this component only displays the result.
 */
export function ExplainRiskButton() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [explanation, setExplanation] = React.useState<string | null>(null);

  async function explain() {
    setLoading(true);
    setError(null);
    setExplanation(null);
    try {
      const res = await fetch("/api/portfolio/explain", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Could not explain the portfolio right now.");
      } else {
        setExplanation(body.explanation as string);
      }
    } catch {
      setError("Could not reach the service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button onClick={explain} disabled={loading} className="gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquareText className="h-4 w-4" />
          )}
          Explain my portfolio&apos;s risk
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-weak">
          {error}
        </p>
      ) : null}

      {explanation ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed">
          {explanation.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
