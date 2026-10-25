"use client";

import * as React from "react";
import Link from "next/link";
import { Send, Trash2, MessageSquare, Loader2, ExternalLink, Download } from "lucide-react";
import type { ChatSource } from "@/types/database";
import { useUser } from "@/hooks/use-user";
import { useChatStream, type ChatMode } from "@/components/chat/use-chat-stream";
import { AuditBadge } from "@/components/chat/audit-badge";
import { exportChatMarkdown } from "@/lib/chat-export";
import { ChatMarkdown } from "@/lib/chat-markdown";
import { WebResearchPanel } from "@/components/chat/web-research-panel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** Suggested questions per mode. Phrased to use available StockLens data. */
const ANALYSIS_CHIPS = [
  "Tell me about this company",
  "Explain its fundamentals",
  "Is it expensive relative to its metrics?",
  "What are the key financial risks?",
  "Explain the fundamental score",
  "What information is missing?",
];

const FILINGS_CHIPS = [
  "Summarize the key risks from the filings",
  "What did management say about margins?",
  "What does the auditor's report say?",
];

const MAX_CHARS = 1000;

interface ChatPanelProps {
  symbol: string;
  name: string;
  /** Whether the Web Research tab is available (search provider configured). */
  webEnabled?: boolean;
}

/**
 * Chat panel with three clearly separated capabilities:
 *   - "Stock Analysis" (default): answers general questions about the company
 *     from StockLens's structured market/fundamental DATA. Works even when no
 *     filings are indexed and no web provider is configured.
 *   - "Filings": document-grounded answers from indexed filings only.
 *   - "Web research": external, allowlisted web sources (when configured).
 */
export function ChatPanel({ symbol, name, webEnabled = false }: ChatPanelProps) {
  const { user, loading: userLoading } = useUser();

  return (
    <Card className="flex max-h-[calc(100vh-7rem)] flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Ask about {name}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        {userLoading ? (
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : user ? (
          <Tabs defaultValue="analysis" className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-4 pt-1">
              <TabsList className="w-full">
                <TabsTrigger value="analysis" className="flex-1">
                  Stock Analysis
                </TabsTrigger>
                <TabsTrigger value="filings" className="flex-1">
                  Filings
                </TabsTrigger>
                <TabsTrigger value="web" className="flex-1">
                  Web
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="analysis"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <ChatInner symbol={symbol} name={name} mode="analysis" />
            </TabsContent>
            <TabsContent
              value="filings"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <ChatInner symbol={symbol} name={name} mode="filings" />
            </TabsContent>
            <TabsContent
              value="web"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <WebResearchPanel symbol={symbol} name={name} enabled={webEnabled} />
            </TabsContent>
          </Tabs>
        ) : (
          <SignedOut />
        )}
      </CardContent>
    </Card>
  );
}

function SignedOut() {
  return (
    <div className="flex flex-col items-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Sign in with Google to chat about this company.
      </p>
      <Button asChild size="sm">
        <Link href="/login">Sign in with Google to chat</Link>
      </Button>
    </div>
  );
}

function welcome(mode: ChatMode, name: string): string {
  return mode === "filings"
    ? `Ask about ${name}'s indexed filings. Answers cite the source documents. If none are indexed yet, try Stock Analysis.`
    : `Ask anything about ${name} using available StockLens market and fundamental data — no filings required. Try:`;
}

function ChatInner({
  symbol,
  name,
  mode,
}: {
  symbol: string;
  name: string;
  mode: ChatMode;
}) {
  const { messages, streaming, error, loadingHistory, send, clear, retry } =
    useChatStream(symbol, mode);
  const [input, setInput] = React.useState("");
  const [activeSource, setActiveSource] = React.useState<ChatSource | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const chips = mode === "filings" ? FILINGS_CHIPS : ANALYSIS_CHIPS;

  // Auto-scroll to bottom on new content.
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
    <>
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4"
        aria-live="polite"
        aria-atomic="false"
      >
        {loadingHistory ? (
          <div className="space-y-2 py-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="ml-auto h-10 w-2/3" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col gap-2 py-4">
            <p className="text-sm text-muted-foreground">{welcome(mode, name)}</p>
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
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
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {m.role === "assistant" ? (
                    m.content ? (
                      <>
                        <ChatMarkdown
                          content={m.content}
                          sources={m.sources ?? []}
                          onCite={setActiveSource}
                        />
                        <AuditBadge audit={m.audit} />
                      </>
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin" aria-label="Thinking" />
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
            {error !== "auth" ? (
              <Button variant="outline" size="sm" onClick={retry} className="h-7">
                Retry
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="h-7">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={onKeyDown}
            disabled={streaming}
            rows={2}
            placeholder={
              mode === "filings"
                ? "Ask about the filings…"
                : "Ask about fundamentals, valuation, risks…"
            }
            aria-label="Chat message"
            className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={streaming || input.trim().length === 0}
            aria-label="Send message"
          >
            {streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {mode === "filings"
              ? "Educational analysis from company filings, not investment advice."
              : "Educational analysis from available StockLens data, not investment advice."}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {input.length}/{MAX_CHARS}
            </span>
            {messages.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    exportChatMarkdown(
                      `${name} (${symbol})`,
                      messages,
                      `chat-${symbol}-${mode}-${new Date().toISOString().slice(0, 10)}.md`,
                    )
                  }
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  aria-label="Export chat as Markdown"
                >
                  <Download className="h-3 w-3" /> Export
                </button>
                <button
                  type="button"
                  onClick={() => void clear()}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  aria-label="Clear chat"
                >
                  <Trash2 className="h-3 w-3" /> Clear
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Source passage sheet */}
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
                  Open PDF at this page
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function errorMessage(kind: "auth" | "rate" | "generic"): string {
  if (kind === "auth") return "Please sign in to chat.";
  if (kind === "rate") return "You've hit the hourly message limit. Try again later.";
  return "Something went wrong. Please try again.";
}
