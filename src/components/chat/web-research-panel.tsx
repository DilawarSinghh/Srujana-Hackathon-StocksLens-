"use client";

import * as React from "react";
import Link from "next/link";
import { Send, Trash2, Loader2, Globe, AlertTriangle } from "lucide-react";
import { useResearchStream } from "@/components/chat/use-research-stream";
import { WebMarkdown } from "@/components/chat/web-markdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_CHARS = 500;

const PROMPT_CHIPS = [
  "What did recent news report about results?",
  "Any regulatory filings or disclosures?",
  "What are analysts discussing lately?",
];

const WEB_BANNER = "Web sources, not verified filings. Educational only.";

interface WebResearchPanelProps {
  symbol: string;
  name: string;
  /** When false, the whole tab is disabled with a friendly message. */
  enabled: boolean;
}

/**
 * Web Research tab. Answers come from a short allowlist of reputable web
 * sources and are clearly labeled as unverified. Shows a permanent banner and
 * renders citations as source chips (domain + date) linking out in a new tab.
 */
export function WebResearchPanel({ symbol, name, enabled }: WebResearchPanelProps) {
  if (!enabled) return <WebDisabled />;
  return <WebInner symbol={symbol} name={name} />;
}

function WebDisabled() {
  return (
    <div className="flex flex-col items-center gap-3 p-6 text-center">
      <Globe className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        Web research isn&apos;t available right now. An administrator needs to
        configure a search provider.
      </p>
    </div>
  );
}

function WebBanner() {
  return (
    <div
      role="note"
      className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{WEB_BANNER}</span>
    </div>
  );
}

function WebInner({ symbol, name }: { symbol: string; name: string }) {
  const { messages, streaming, error, loadingHistory, send, clear, retry } =
    useResearchStream(symbol);
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    await send(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const isEmpty = messages.length === 0 && !loadingHistory;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WebBanner />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4"
        aria-live="polite"
        aria-atomic="false"
      >
        {isEmpty ? (
          <div className="flex flex-col gap-2 py-4">
            <p className="text-sm text-muted-foreground">
              Research {name} using reputable web sources. Try:
            </p>
            <div className="flex flex-wrap gap-2">
              {PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void send(chip)}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {m.role === "assistant" ? (
                    m.content ? (
                      <WebMarkdown content={m.content} sources={m.sources ?? []} />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin" aria-label="Researching" />
                    )
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {error ? (
          <div
            role="alert"
            className="my-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <span>{errorMessage(error)}</span>
            {error === "auth" ? (
              <Button asChild variant="outline" size="sm" className="h-7">
                <Link href="/login">Sign in</Link>
              </Button>
            ) : error !== "disabled" ? (
              <Button variant="outline" size="sm" onClick={retry} className="h-7">
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={onKeyDown}
            disabled={streaming}
            rows={2}
            placeholder="Ask a research question…"
            aria-label="Web research question"
            className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={streaming || input.trim().length === 0}
            aria-label="Send research question"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Based on unverified web sources. Educational, not investment advice.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {input.length}/{MAX_CHARS}
            </span>
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={() => void clear()}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                aria-label="Clear web research"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function errorMessage(kind: "auth" | "rate" | "disabled" | "generic"): string {
  if (kind === "auth") return "Please sign in to use web research.";
  if (kind === "rate") return "You've hit the hourly web-research limit. Try again later.";
  if (kind === "disabled") return "Web research is not available right now.";
  return "Something went wrong. Please try again.";
}
