"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { SearchResult } from "@/app/api/search/route";
import {
  DEBATE_FOCUS_LABELS,
  JUDGE_ASSESSMENT_LABELS,
  type DebateFocus,
} from "@/lib/debate/schema";
import type { DebateCitation, DebateResponse } from "@/components/debate/types";
import { DebateSetup } from "@/components/debate/debate-setup";
import { SnapshotBar } from "@/components/debate/snapshot-bar";
import { AgentPanel, JudgePanel } from "@/components/debate/agent-panel";
import { FollowupChat } from "@/components/debate/followup-chat";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface DebateError {
  message: string;
  retryable: boolean;
  /** "auth" | "data" | server LLM code | "app_quota" | "generic" */
  code: string;
}

/** Top-level client orchestration for the debate arena. */
export function DebateArena() {
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<DebateError | null>(null);
  const [data, setData] = React.useState<DebateResponse | null>(null);
  const [activeSource, setActiveSource] = React.useState<DebateCitation | null>(null);
  const [meta, setMeta] = React.useState<{ thesis: string; focus: DebateFocus } | null>(null);
  const lastParams = React.useRef<{ stock: SearchResult; thesis: string; focus: DebateFocus } | null>(null);

  const start = React.useCallback(
    async (params: { stock: SearchResult; thesis: string; focus: DebateFocus }) => {
      setRunning(true);
      setError(null);
      setData(null);
      setMeta({ thesis: params.thesis, focus: params.focus });
      lastParams.current = params;
      try {
        const res = await fetch("/api/debate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: params.stock.symbol,
            thesis: params.thesis,
            focus: params.focus,
          }),
        });
        if (!res.ok) {
          setError(await parseDebateError(res));
          return;
        }
        const json = (await res.json()) as DebateResponse;
        setData(json);
      } catch {
        setError({
          code: "network",
          retryable: true,
          message: "Couldn't reach the server. Check your connection and try again.",
        });
      } finally {
        setRunning(false);
      }
    },
    [],
  );

  const retry = React.useCallback(() => {
    if (lastParams.current) void start(lastParams.current);
  }, [start]);

  return (
    <div className="flex flex-col gap-6">
      <DebateSetup onStart={start} running={running} />

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span>{error.message}</span>
          {error.code === "auth" ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/login?next=/debate">Sign in</Link>
            </Button>
          ) : error.retryable ? (
            <Button variant="outline" size="sm" onClick={retry} disabled={running}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      {running ? <RunningSkeleton /> : null}

      {data ? (
        <DebateResultView
          data={data}
          thesis={meta?.thesis ?? ""}
          focus={meta?.focus ?? "overall"}
          onCite={setActiveSource}
        />
      ) : null}

      <Sheet open={!!activeSource} onOpenChange={(o) => !o && setActiveSource(null)}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{activeSource?.doc}</SheetTitle>
            <SheetDescription>
              {activeSource?.section ?? "General"}
              {activeSource?.page != null ? ` · page ${activeSource.page}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm">
              {activeSource?.snippet}
            </p>
            {activeSource?.url ? (
              <Button asChild variant="outline" size="sm">
                <a href={activeSource.url} target="_blank" rel="noopener noreferrer">
                  Open filing at this page
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DebateResultView({
  data,
  thesis,
  focus,
  onCite,
}: {
  data: DebateResponse;
  thesis: string;
  focus: DebateFocus;
  onCite: (c: DebateCitation) => void;
}) {
  const { bull, devil, judge } = data.debate;

  const stateOf = (r: { status: string } | null): "ok" | "failed" =>
    r?.status === "ok" ? "ok" : "failed";

  const assessmentLabel =
    judge.status === "ok" && judge.output
      ? JUDGE_ASSESSMENT_LABELS[judge.output.assessment]
      : null;

  return (
    <div className="flex flex-col gap-4">
      <SnapshotBar
        stock={data.stock}
        snapshot={data.snapshot}
        thesis={thesis}
        focusLabel={DEBATE_FOCUS_LABELS[focus]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AgentPanel side="bull" state={stateOf(bull)} result={bull} citations={data.citations} onCite={onCite} />
        <AgentPanel side="devil" state={stateOf(devil)} result={devil} citations={data.citations} onCite={onCite} />
      </div>

      <JudgePanel state={stateOf(judge)} result={judge} assessmentLabel={assessmentLabel} />

      <FollowupChat
        symbol={data.stock.symbol}
        context={buildContext(data)}
        disabled={bull.status !== "ok"}
      />
    </div>
  );
}

/** A compact, bounded summary of the debate passed to the follow-up endpoint. */
function buildContext(data: DebateResponse): string {
  const { bull, devil, judge } = data.debate;
  const parts: string[] = [];
  if (bull.status === "ok" && bull.output) {
    parts.push(`BULL SUMMARY: ${bull.output.summary}`);
    parts.push(
      `BULL CLAIMS: ${bull.output.claims.map((c) => `${c.id}: ${c.claim}`).join(" | ")}`,
    );
  }
  if (devil.status === "ok" && devil.output) {
    parts.push(`DEVIL SUMMARY: ${devil.output.summary}`);
    parts.push(
      `DEVIL COUNTERS: ${devil.output.counterarguments
        .map((c) => `${c.id} (${c.severity}): ${c.counter}`)
        .join(" | ")}`,
    );
  }
  if (judge.status === "ok" && judge.output) {
    parts.push(
      `JUDGE: ${JUDGE_ASSESSMENT_LABELS[judge.output.assessment]} (confidence ${judge.output.confidence}). ${judge.output.conclusion}`,
    );
  }
  return parts.join("\n").slice(0, 7500);
}

function RunningSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-20 animate-pulse rounded-xl border border-border bg-muted/40" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
      </div>
      <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/40" />
      <p className="text-center text-sm text-muted-foreground">
        Running the three-agent debate — this can take up to a minute.
      </p>
    </div>
  );
}

/**
 * Map a non-OK /api/debate response to a typed DebateError. Prefers the
 * server's `{ error, code, retryable }` body, distinguishing the app's own
 * hourly quota (429 without a code) from a Groq provider rate-limit, a
 * missing-data 422, and auth.
 */
async function parseDebateError(res: Response): Promise<DebateError> {
  let body: { error?: string; code?: string; retryable?: boolean } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // non-JSON body; fall back to status defaults
  }
  if (res.status === 401) {
    return {
      code: "auth",
      retryable: false,
      message: body.error ?? "Please sign in to run a debate.",
    };
  }
  if (res.status === 422) {
    return {
      code: "data",
      retryable: false,
      message:
        body.error ??
        "There isn't enough stored data for this stock to run a debate yet. Try another stock.",
    };
  }
  if (res.status === 429 && !body.code) {
    return {
      code: "app_quota",
      retryable: false,
      message:
        body.error ??
        "You've reached your StockLens hourly AI limit. Please try again a little later.",
    };
  }
  return {
    code: body.code ?? "generic",
    retryable: body.retryable ?? res.status >= 500,
    message: body.error ?? "Something went wrong running the debate. Please try again.",
  };
}
